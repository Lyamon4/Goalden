# Telegram and Slack task search

Goalden reads official integrations through Supabase Edge Functions. The Chrome extension never stores Telegram bot tokens, Slack client secrets, or Slack access tokens.

## Supabase secrets

Set these in the Supabase project before deploying functions:

```powershell
npx supabase secrets set TELEGRAM_BOT_TOKEN="123:bot-token"
npx supabase secrets set TELEGRAM_BOT_USERNAME="GoaldenBot"
npx supabase secrets set SLACK_CLIENT_ID="123456789.123456789"
npx supabase secrets set SLACK_CLIENT_SECRET="slack-client-secret"
npx supabase secrets set GROQ_API_KEY="gsk_..."
npx supabase secrets set GROQ_TASK_MODEL="openai/gpt-oss-120b"
```

## Deploy

```powershell
npx supabase link --project-ref rlhaibdgdgczlgpgdnag
npx supabase db push
npx supabase functions deploy telegram-start
npx supabase functions deploy slack-oauth
npx supabase functions deploy integration-sync
npx supabase functions deploy integration-health
npx supabase functions deploy capture-task
npx supabase functions deploy telegram-webhook --no-verify-jwt
```

Telegram webhook must allow unauthenticated Telegram requests. The function still only writes to a Goalden account after a valid `/start <nonce>` link created from the signed-in extension.

`integration-health` is a signed-in diagnostics endpoint. It only returns whether required secrets exist, never the secret values.

## Browser capture

Browser capture does not need provider credentials. The extension sends selected text or visible page text to the signed-in `capture-task` function. Goalden stores extracted task candidates and short evidence snippets, not full page dumps.

## Telegram setup

After deploying `telegram-webhook`, set the bot webhook:

```powershell
$projectRef = "rlhaibdgdgczlgpgdnag"
$botToken = "123:bot-token"
$webhook = "https://$projectRef.supabase.co/functions/v1/telegram-webhook"
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$botToken/setWebhook" -Body @{ url = $webhook }
```

User flow:

1. Sign in to Goalden.
2. Open the side panel.
3. Click `Connect` on Telegram.
4. Press `Start` in the Telegram bot.
5. Send or forward work messages to the bot.
6. Review task candidates in Goalden.

## Slack setup

Create a Slack app and add this redirect URL:

```text
https://<chrome-extension-id>.chromiumapp.org/slack
```

The extension ID changes for unpacked builds unless you pin a Chrome key. For a demo, load the extension, copy the ID from `chrome://extensions`, then add the redirect URL in Slack app settings.

Required bot scopes:

```text
channels:read
groups:read
im:read
mpim:read
channels:history
groups:history
im:history
mpim:history
```

User flow:

1. Sign in to Goalden.
2. Open the side panel.
3. Click `Connect` on Slack.
4. Approve the Slack app.
5. Click `Sync`.
6. Review task candidates in Goalden.

For the MVP, Slack sync reads recent accessible conversations. If the bot cannot see a private channel, invite the Slack app to that channel first.
