import { handleOptions, readJson, jsonResponse, errorResponse } from '../_shared/http.ts';
import { requireUser, serviceClient, sha256Short } from '../_shared/supabase.ts';
import { extractAndStoreTaskCandidates, type SourceMessage } from '../_shared/taskExtraction.ts';

type CaptureBody = {
  text?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  mode?: 'selection' | 'page';
};

Deno.serve(async req => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const user = await requireUser(req);
    const body = await readJson<CaptureBody>(req);
    const text = cleanText(body.text ?? '').slice(0, 9000);

    if (text.length < 8) {
      return errorResponse('Select or scan more text before sending it to Goalden.', 400);
    }

    const supabase = serviceClient();
    const sourceUrl = cleanText(body.sourceUrl ?? '').slice(0, 500);
    const sourceTitle = cleanText(body.sourceTitle ?? '').slice(0, 180);
    const label = sourceTitle || hostname(sourceUrl) || 'Browser capture';
    const id = `browser-${await sha256Short(`${user.id}:${body.mode ?? 'selection'}:${sourceUrl}:${text.slice(0, 500)}`)}`;

    const messages: SourceMessage[] = [
      {
        id,
        text,
        author: 'Browser',
        sourceLabel: label,
        createdAt: Date.now()
      }
    ];

    const result = await extractAndStoreTaskCandidates(supabase, {
      userId: user.id,
      integrationId: null,
      provider: 'browser',
      sourceLabel: label,
      messages
    });

    return jsonResponse({
      provider: 'browser',
      inserted: result.inserted,
      sourceLabel: label
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Browser capture failed.', 400);
  }
});

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function hostname(value: string) {
  try {
    return value ? new URL(value).hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}
