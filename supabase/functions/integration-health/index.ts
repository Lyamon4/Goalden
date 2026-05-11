import { handleOptions, jsonResponse, errorResponse } from '../_shared/http.ts';
import { requireUser } from '../_shared/supabase.ts';

type SetupStatus = {
  configured: boolean;
  missing: string[];
  message: string;
};

Deno.serve(async req => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    await requireUser(req);

    return jsonResponse({
      telegram: setupStatus(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME'], 'Telegram bot is ready.'),
      slack: setupStatus(['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET'], 'Slack OAuth is ready.'),
      groq: setupStatus(['GROQ_API_KEY'], 'Task extraction model is ready.'),
      checkedAt: Date.now()
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Could not check integration setup.', 401);
  }
});

function setupStatus(required: string[], readyMessage: string): SetupStatus {
  const missing = required.filter(name => !Deno.env.get(name));
  return {
    configured: missing.length === 0,
    missing,
    message: missing.length ? `Missing ${missing.join(', ')}.` : readyMessage
  };
}
