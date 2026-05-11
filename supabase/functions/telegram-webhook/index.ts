import { errorResponse, handleOptions, jsonResponse } from '../_shared/http.ts';
import { extractAndStoreTaskCandidates, type SourceMessage } from '../_shared/taskExtraction.ts';
import { nowMs, serviceClient } from '../_shared/supabase.ts';

type TelegramChat = {
  id?: number | string;
  type?: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramMessage = {
  message_id?: number;
  date?: number;
  text?: string;
  caption?: string;
  chat?: TelegramChat;
  from?: {
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  forward_from_chat?: TelegramChat;
  forward_sender_name?: string;
};

type TelegramUpdate = {
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
};

Deno.serve(async req => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return errorResponse('Method not allowed.', 405);

  try {
    const update = (await req.json()) as TelegramUpdate;
    const message = update.message ?? update.edited_message ?? update.channel_post;
    if (!message?.chat?.id) return jsonResponse({ ok: true, ignored: true });

    const text = (message.text ?? message.caption ?? '').trim();
    if (!text) return jsonResponse({ ok: true, ignored: true });

    if (text.startsWith('/start')) {
      return connectTelegramChat(message, text);
    }

    return ingestTelegramMessage(message, text);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Telegram webhook failed.', 400);
  }
});

async function connectTelegramChat(message: TelegramMessage, text: string) {
  const nonce = text.split(/\s+/)[1]?.trim();
  if (!nonce) return jsonResponse({ ok: true, ignored: true });

  const supabase = serviceClient();
  const { data, error } = await supabase
    .from('goalden_integrations')
    .select('id, user_id, metadata')
    .eq('provider', 'telegram')
    .eq('status', 'connecting');

  if (error) throw error;

  const match = (data ?? []).find(row => {
    const metadata = (row.metadata ?? {}) as { nonce?: string; nonceExpiresAt?: number };
    return metadata.nonce === nonce && (metadata.nonceExpiresAt ?? 0) > nowMs();
  });

  if (!match) {
    await sendTelegramMessage(String(message.chat?.id), 'Goalden could not match this Telegram connect link. Open Goalden and try Connect again.');
    return jsonResponse({ ok: true, connected: false });
  }

  const displayName = telegramDisplayName(message.chat);
  const chatId = String(message.chat?.id);

  const { error: secretError } = await supabase.from('goalden_integration_secrets').upsert(
    {
      integration_id: match.id,
      user_id: match.user_id,
      provider: 'telegram',
      telegram_chat_id: chatId
    },
    { onConflict: 'integration_id' }
  );
  if (secretError) throw secretError;

  const { error: integrationError } = await supabase
    .from('goalden_integrations')
    .update({
      status: 'connected',
      display_name: displayName,
      external_account_id: chatId,
      metadata: {
        chatType: message.chat?.type ?? null,
        connectedAt: nowMs()
      }
    })
    .eq('id', match.id);
  if (integrationError) throw integrationError;

  await sendTelegramMessage(chatId, 'Goalden is connected. Send or forward work messages here and I will pull out tasks.');
  return jsonResponse({ ok: true, connected: true });
}

async function ingestTelegramMessage(message: TelegramMessage, text: string) {
  const chatId = String(message.chat?.id);
  const supabase = serviceClient();

  const { data: secret, error } = await supabase
    .from('goalden_integration_secrets')
    .select('integration_id, user_id')
    .eq('provider', 'telegram')
    .eq('telegram_chat_id', chatId)
    .maybeSingle();

  if (error) throw error;
  if (!secret) return jsonResponse({ ok: true, ignored: true, reason: 'chat_not_connected' });

  const sourceMessage: SourceMessage = {
    id: `telegram:${chatId}:${message.message_id ?? nowMs()}`,
    text,
    author: telegramSenderName(message),
    sourceLabel: telegramDisplayName(message.chat),
    createdAt: message.date ? message.date * 1000 : nowMs()
  };

  const result = await extractAndStoreTaskCandidates(supabase, {
    userId: secret.user_id,
    integrationId: secret.integration_id,
    provider: 'telegram',
    sourceLabel: telegramDisplayName(message.chat),
    messages: [sourceMessage]
  });

  await supabase
    .from('goalden_integrations')
    .update({
      last_synced_at_bigint: nowMs(),
      metadata: {
        chatType: message.chat?.type ?? null,
        lastTelegramMessageId: message.message_id ?? null
      }
    })
    .eq('id', secret.integration_id);

  if (result.inserted > 0) {
    await sendTelegramMessage(chatId, `Goalden found ${result.inserted} possible task${result.inserted === 1 ? '' : 's'}. Open the extension panel to review.`);
  }

  return jsonResponse({ ok: true, inserted: result.inserted });
}

function telegramDisplayName(chat?: TelegramChat) {
  if (!chat) return 'Telegram';
  if (chat.title) return chat.title;
  if (chat.username) return `@${chat.username}`;
  return [chat.first_name, chat.last_name].filter(Boolean).join(' ') || 'Telegram';
}

function telegramSenderName(message: TelegramMessage) {
  if (message.forward_from_chat?.title) return message.forward_from_chat.title;
  if (message.forward_sender_name) return message.forward_sender_name;
  if (message.from?.username) return `@${message.from.username}`;
  return [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || undefined;
}

async function sendTelegramMessage(chatId: string, text: string) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
  }).catch(() => undefined);
}
