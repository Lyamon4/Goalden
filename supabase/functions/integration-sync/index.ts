import { errorResponse, handleOptions, jsonResponse, readJson } from '../_shared/http.ts';
import { extractAndStoreTaskCandidates, type SourceMessage } from '../_shared/taskExtraction.ts';
import { type IntegrationProvider, nowMs, requireUser, serviceClient } from '../_shared/supabase.ts';

type SyncBody = {
  provider: IntegrationProvider;
};

type SlackConversation = {
  id: string;
  name?: string;
  is_im?: boolean;
  is_mpim?: boolean;
  user?: string;
};

type SlackListResponse = {
  ok?: boolean;
  error?: string;
  channels?: SlackConversation[];
};

type SlackHistoryResponse = {
  ok?: boolean;
  error?: string;
  messages?: Array<{
    type?: string;
    text?: string;
    ts?: string;
    user?: string;
    bot_id?: string;
  }>;
};

Deno.serve(async req => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return errorResponse('Method not allowed.', 405);

  try {
    const user = await requireUser(req);
    const body = await readJson<SyncBody>(req);

    if (body.provider === 'telegram') return syncTelegram(user.id);
    if (body.provider === 'slack') return syncSlack(user.id);
    return errorResponse('Unsupported integration provider.', 400);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Integration sync failed.', 400);
  }
});

async function syncTelegram(userId: string) {
  const supabase = serviceClient();
  const { data: integration, error } = await supabase
    .from('goalden_integrations')
    .select('id, provider, status, display_name, last_synced_at_bigint, metadata')
    .eq('user_id', userId)
    .eq('provider', 'telegram')
    .maybeSingle();

  if (error) throw error;
  if (!integration) return errorResponse('Telegram is not connected yet.', 404);
  return jsonResponse({ provider: 'telegram', inserted: 0, integration });
}

async function syncSlack(userId: string) {
  const supabase = serviceClient();
  const { data: integration, error: integrationError } = await supabase
    .from('goalden_integrations')
    .select('id, status, metadata')
    .eq('user_id', userId)
    .eq('provider', 'slack')
    .maybeSingle();

  if (integrationError) throw integrationError;
  if (!integration || integration.status !== 'connected') return errorResponse('Slack is not connected yet.', 404);

  const { data: secret, error: secretError } = await supabase
    .from('goalden_integration_secrets')
    .select('access_token')
    .eq('integration_id', integration.id)
    .maybeSingle();

  if (secretError) throw secretError;
  if (!secret?.access_token) return errorResponse('Slack token is missing. Reconnect Slack.', 400);

  const conversations = await slackListConversations(secret.access_token);
  const metadata = (integration.metadata ?? {}) as { selectedConversationIds?: string[] };
  const selectedIds = Array.isArray(metadata.selectedConversationIds) ? metadata.selectedConversationIds : [];
  const selected = selectedIds.length
    ? conversations.filter(conversation => selectedIds.includes(conversation.id))
    : conversations.slice(0, 6);

  let inserted = 0;
  for (const conversation of selected) {
    const messages = await slackHistory(secret.access_token, conversation);
    const result = await extractAndStoreTaskCandidates(supabase, {
      userId,
      integrationId: integration.id,
      provider: 'slack',
      sourceLabel: slackConversationName(conversation),
      messages
    });
    inserted += result.inserted;
  }

  const syncedAt = nowMs();
  const { data: updated, error: updateError } = await supabase
    .from('goalden_integrations')
    .update({
      last_synced_at_bigint: syncedAt,
      metadata: {
        ...metadata,
        selectedConversationIds: selected.map(conversation => conversation.id),
        lastConversationCount: selected.length,
        lastSlackSyncAt: syncedAt
      }
    })
    .eq('id', integration.id)
    .select('id, provider, status, display_name, last_synced_at_bigint, metadata')
    .single();

  if (updateError) throw updateError;
  return jsonResponse({ provider: 'slack', inserted, integration: updated });
}

async function slackListConversations(token: string): Promise<SlackConversation[]> {
  const params = new URLSearchParams({
    types: 'public_channel,private_channel,mpim,im',
    exclude_archived: 'true',
    limit: '20'
  });

  const response = await fetch(`https://slack.com/api/conversations.list?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const payload = (await response.json()) as SlackListResponse;
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Slack conversations.list failed.');
  return payload.channels ?? [];
}

async function slackHistory(token: string, conversation: SlackConversation): Promise<SourceMessage[]> {
  const params = new URLSearchParams({
    channel: conversation.id,
    limit: '15'
  });

  const response = await fetch(`https://slack.com/api/conversations.history?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const payload = (await response.json()) as SlackHistoryResponse;
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Slack conversations.history failed.');

  return (payload.messages ?? [])
    .filter(message => message.type === 'message' && message.text)
    .map(message => ({
      id: `slack:${conversation.id}:${message.ts}`,
      text: stripSlackMarkup(message.text ?? ''),
      author: message.user ?? message.bot_id,
      sourceLabel: slackConversationName(conversation),
      createdAt: message.ts ? Number.parseFloat(message.ts) * 1000 : nowMs()
    }));
}

function slackConversationName(conversation: SlackConversation) {
  if (conversation.name) return `#${conversation.name}`;
  if (conversation.is_im) return 'Slack DM';
  if (conversation.is_mpim) return 'Slack group DM';
  return 'Slack conversation';
}

function stripSlackMarkup(value: string) {
  return value
    .replace(/<@([A-Z0-9]+)>/g, '@user')
    .replace(/<#([A-Z0-9]+)\|([^>]+)>/g, '#$2')
    .replace(/<([^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<([^>]+)>/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
