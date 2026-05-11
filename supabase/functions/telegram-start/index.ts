import { errorResponse, handleOptions, jsonResponse } from '../_shared/http.ts';
import { nowMs, requireUser, serviceClient } from '../_shared/supabase.ts';

Deno.serve(async req => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return errorResponse('Method not allowed.', 405);

  try {
    const user = await requireUser(req);
    const botUsername = Deno.env.get('TELEGRAM_BOT_USERNAME');
    if (!botUsername) return errorResponse('TELEGRAM_BOT_USERNAME is not configured.', 500);

    const supabase = serviceClient();
    const nonce = crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    const nonceExpiresAt = nowMs() + 20 * 60 * 1000;

    const { data, error } = await supabase
      .from('goalden_integrations')
      .upsert(
        {
          user_id: user.id,
          provider: 'telegram',
          status: 'connecting',
          display_name: 'Telegram',
          metadata: {
            nonce,
            nonceExpiresAt
          }
        },
        { onConflict: 'user_id,provider' }
      )
      .select('id, provider, status, display_name, last_synced_at_bigint, metadata')
      .single();

    if (error) throw error;

    return jsonResponse({
      provider: 'telegram',
      connectUrl: `https://t.me/${botUsername.replace(/^@/, '')}?start=${nonce}`,
      integration: data
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Telegram connect failed.', 400);
  }
});
