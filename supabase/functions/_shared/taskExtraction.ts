import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { type IntegrationProvider, nowMs, sha256Short } from './supabase.ts';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';

export interface SourceMessage {
  id: string;
  text: string;
  author?: string;
  sourceLabel?: string;
  createdAt?: number;
}

interface ExtractedTask {
  sourceExternalId?: string;
  title?: string;
  deadline?: string;
  nextStep?: string;
  confidence?: number;
  evidenceSnippet?: string;
}

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export async function extractAndStoreTaskCandidates(
  supabase: SupabaseClient,
  input: {
    userId: string;
    integrationId?: string | null;
    provider: IntegrationProvider;
    sourceLabel: string;
    messages: SourceMessage[];
  }
) {
  const messages = input.messages
    .map(message => ({
      ...message,
      text: cleanText(message.text)
    }))
    .filter(message => message.text.length >= 8)
    .slice(0, 60);

  if (!messages.length) return { inserted: 0 };

  const extracted = await extractTasks(input.provider, input.sourceLabel, messages);
  const now = nowMs();
  const rows = [];

  for (const item of extracted) {
    const title = cleanText(item.title ?? '');
    if (!title) continue;

    const sourceExternalId = cleanText(item.sourceExternalId ?? messages[0]!.id);
    const id = `candidate-${input.provider}-${await sha256Short(`${input.userId}:${sourceExternalId}:${title}`)}`;
    rows.push({
      id,
      user_id: input.userId,
      integration_id: input.integrationId ?? null,
      provider: input.provider,
      source_external_id: sourceExternalId,
      title: title.slice(0, 180),
      deadline: cleanText(item.deadline ?? 'No deadline').slice(0, 120) || 'No deadline',
      next_step: cleanText(item.nextStep ?? 'Finish one small piece').slice(0, 220) || 'Finish one small piece',
      confidence: clampConfidence(item.confidence),
      evidence_snippet: cleanText(item.evidenceSnippet ?? '').slice(0, 260),
      status: 'new',
      created_at_bigint: now,
      updated_at_bigint: now
    });
  }

  if (!rows.length) return { inserted: 0 };

  const { error } = await supabase
    .from('goalden_task_candidates')
    .upsert(rows, { onConflict: 'id,user_id', ignoreDuplicates: true });

  if (error) throw error;
  return { inserted: rows.length };
}

async function extractTasks(provider: IntegrationProvider, sourceLabel: string, messages: SourceMessage[]) {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) return fallbackExtract(messages);

  try {
    const payload = {
      outputSchema: {
        tasks: [
          {
            sourceExternalId: 'must match one message id from input',
            title: 'short task title',
            deadline: 'deadline if stated, otherwise No deadline',
            nextStep: 'specific 15-30 minute next step',
            confidence: 'number from 0 to 1',
            evidenceSnippet: 'short quote or paraphrase proving why this is a task'
          }
        ]
      },
      rules: [
        'Extract only real commitments, tasks, deadlines, requests, or promised follow-ups.',
        'Ignore greetings, jokes, casual chat, pure FYI messages, and vague ideas without an action.',
        'Do not invent deadlines. Use "No deadline" when no date or urgency is present.',
        'Each nextStep must be small enough to start in 15-30 minutes.',
        'Return at most 8 tasks. Return an empty array if nothing actionable exists.'
      ],
      source: {
        provider,
        label: sourceLabel
      },
      messages: messages.map(message => ({
        id: message.id,
        author: message.author,
        text: message.text
      }))
    };

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: Deno.env.get('GROQ_TASK_MODEL') || DEFAULT_MODEL,
        temperature: 0.15,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You extract tasks from chats, emails, docs, and browser page text for Goalden. Return only valid JSON. Be conservative and never store raw source text.'
          },
          {
            role: 'user',
            content: JSON.stringify(payload)
          }
        ]
      })
    });

    const text = await response.text();
    const body = text ? (JSON.parse(text) as GroqResponse & { error?: { message?: string } }) : {};
    if (!response.ok) throw new Error(body.error?.message ?? `Groq failed with ${response.status}`);

    const content = body.choices?.[0]?.message?.content;
    if (!content) return fallbackExtract(messages);
    const parsed = JSON.parse(content) as { tasks?: ExtractedTask[] };
    return Array.isArray(parsed.tasks) ? parsed.tasks.slice(0, 8) : fallbackExtract(messages);
  } catch {
    return fallbackExtract(messages);
  }
}

function fallbackExtract(messages: SourceMessage[]): ExtractedTask[] {
  const taskPattern =
    /\b(todo|need to|must|deadline|due|finish|send|prepare|write|fix|review|созвон|дедлайн|сделать|надо|нужно|отправ|додел)\b/i;

  return messages
    .filter(message => taskPattern.test(message.text))
    .slice(0, 5)
    .map(message => {
      const title = message.text.replace(/\s+/g, ' ').slice(0, 90);
      return {
        sourceExternalId: message.id,
        title,
        deadline: /today|tonight|сегодня/i.test(message.text) ? 'Today' : 'No deadline',
        nextStep: `Make progress on: ${title}`.slice(0, 180),
        confidence: 0.45,
        evidenceSnippet: title
      };
    });
}

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function clampConfidence(value: unknown) {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 0.5;
  return Math.max(0, Math.min(1, number));
}
