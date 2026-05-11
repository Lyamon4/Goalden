import { errorResponse, handleOptions, jsonResponse, readJson } from '../_shared/http.ts';
import { nowMs, requireUser, serviceClient } from '../_shared/supabase.ts';

const SLACK_SCOPES = [
  'channels:read',
  'groups:read',
  'im:read',
  'mpim:read',
  'channels:history',
  'groups:history',
  'im:history',
  'mpim:history'
].join(',');

type SlackOAuthBody =
  | { action: 'start'; redirectUrl: string }
  | { action: 'exchange'; code: string; state: string; redirectUrl: string };

type SlackOAuthResponse = {
  ok?: boolean;
  error?: string;
  access_token?: string;
  bot_user_id?: string;
  team?: {
    id?: string;
    name?: string;
  };
  authed_user?: {
    id?: string;
  };
};

Deno.serve(async req => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return errorResponse('Method not allowed.', 405);

  try {
    const user = await requireUser(req);
    const body = await readJson<SlackOAuthBody>(req);

    if (body.action === 'start') return startSlackOAuth(user.id, body.redirectUrl);
    if (body.action === 'exchange') return exchangeSlackCode(user.id, body);
    return errorResponse('Unsupported Slack OAuth action.', 400);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Slack OAuth failed.', 400);
  }
});

async function startSlackOAuth(userId: string, redirectUrl: string) {
  const clientId = Deno.env.get('SLACK_CLIENT_ID');
  if (!clientId) return errorResponse('SLACK_CLIENT_ID is not configured.', 500);
  if (!redirectUrl.startsWith('https://')) return errorResponse('Invalid Slack redirect URL.', 400);

  const state = crypto.randomUUID();
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from('goalden_integrations')
    .upsert(
      {
        user_id: userId,
        provider: 'slack',
        status: 'connecting',
        display_name: 'Slack',
        metadata: {
          oauthState: state,
          redirectUrl,
          stateExpiresAt: nowMs() + 20 * 60 * 1000
        }
      },
      { onConflict: 'user_id,provider' }
    )
    .select('id, provider, status, display_name, last_synced_at_bigint, metadata')
    .single();

  if (error) throw error;

  const params = new URLSearchParams({
    client_id: clientId,
    scope: SLACK_SCOPES,
    state,
    redirect_uri: redirectUrl
  });

  return jsonResponse({
    provider: 'slack',
    connectUrl: `https://slack.com/oauth/v2/authorize?${params.toString()}`,
    integration: data
  });
}

async function exchangeSlackCode(userId: string, body: Extract<SlackOAuthBody, { action: 'exchange' }>) {
  const clientId = Deno.env.get('SLACK_CLIENT_ID');
  const clientSecret = Deno.env.get('SLACK_CLIENT_SECRET');
  if (!clientId || !clientSecret) return errorResponse('Slack OAuth secrets are not configured.', 500);

  const supabase = serviceClient();
  const { data: integration, error } = await supabase
    .from('goalden_integrations')
    .select('id, metadata')
    .eq('user_id', userId)
    .eq('provider', 'slack')
    .maybeSingle();

  if (error) throw error;
  if (!integration) return errorResponse('Slack connection was not started.', 400);

  const metadata = (integration.metadata ?? {}) as { oauthState?: string; redirectUrl?: string; stateExpiresAt?: number };
  if (metadata.oauthState !== body.state || (metadata.stateExpiresAt ?? 0) < nowMs()) {
    return errorResponse('Slack OAuth state does not match. Start the connection again.', 400);
  }
  if (metadata.redirectUrl !== body.redirectUrl) return errorResponse('Slack redirect URL does not match.', 400);

  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: body.code,
      redirect_uri: body.redirectUrl
    })
  });

  const slack = (await response.json()) as SlackOAuthResponse;
  if (!response.ok || !slack.ok || !slack.access_token) {
    return errorResponse(slack.error ?? 'Slack did not return an access token.', 400);
  }

  const { error: secretError } = await supabase.from('goalden_integration_secrets').upsert(
    {
      integration_id: integration.id,
      user_id: userId,
      provider: 'slack',
      access_token: slack.access_token
    },
    { onConflict: 'integration_id' }
  );
  if (secretError) throw secretError;

  const { data: updated, error: updateError } = await supabase
    .from('goalden_integrations')
    .update({
      status: 'connected',
      display_name: slack.team?.name ? `Slack: ${slack.team.name}` : 'Slack workspace',
      external_account_id: slack.team?.id ?? slack.authed_user?.id ?? null,
      metadata: {
        teamId: slack.team?.id ?? null,
        teamName: slack.team?.name ?? null,
        botUserId: slack.bot_user_id ?? null,
        connectedAt: nowMs(),
        selectedConversationIds: []
      }
    })
    .eq('id', integration.id)
    .select('id, provider, status, display_name, last_synced_at_bigint, metadata')
    .single();

  if (updateError) throw updateError;
  return jsonResponse({ provider: 'slack', integration: updated });
}
