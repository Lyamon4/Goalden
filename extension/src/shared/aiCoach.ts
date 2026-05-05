import { getActiveTask } from './state';
import { SITES } from './sites';
import type { AiDecision, AiKeyStatus, BlockedSite, GoaldenState, ProgressLog, SiteId } from './types';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEY_STORAGE_KEY = 'goalden-groq-key';
const DEMO_GROQ_API_KEY = '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';
const DECISION_TTL_MS = 4 * 60 * 1000;

interface StoredGroqKey {
  apiKey?: string;
  updatedAt?: number;
}

interface GroqChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface PageDecisionPayload {
  shouldBlock?: boolean;
  confidence?: number;
  reason?: string;
  coachMessage?: string;
  question?: string;
}

interface ProgressReviewPayload {
  approved?: boolean;
  reason?: string;
  coachMessage?: string;
}

interface SitePickPayload {
  siteIds?: SiteId[];
  reason?: string;
}

interface CachedDecision {
  key: string;
  expiresAt: number;
  decision: AiDecision;
}

let cachedDecision: CachedDecision | null = null;

export async function getAiKeyStatus(): Promise<AiKeyStatus> {
  const stored = await getStoredGroqKey();
  return {
    hasKey: Boolean(stored.apiKey),
    updatedAt: stored.updatedAt
  };
}

export async function saveGroqApiKey(apiKey: string): Promise<AiKeyStatus> {
  const value = apiKey.trim();
  if (!value) return clearGroqApiKey();
  await chrome.storage.local.set({
    [GROQ_KEY_STORAGE_KEY]: {
      apiKey: value,
      updatedAt: Date.now()
    } satisfies StoredGroqKey
  });
  return getAiKeyStatus();
}

export async function clearGroqApiKey(): Promise<AiKeyStatus> {
  await chrome.storage.local.remove(GROQ_KEY_STORAGE_KEY);
  cachedDecision = null;
  return getAiKeyStatus();
}

export async function evaluatePageWithAi(state: GoaldenState, site: BlockedSite, url: string, title = '') {
  const fallback = fallbackDecision(state, site);
  if (!state.aiSettings.enabled) return fallback;

  const stored = await getStoredGroqKey();
  if (!stored.apiKey) return fallback;

  const task = getActiveTask(state);
  const cacheKey = `${url}|${title}|${task.id}|${task.updatedAt}|${state.aiSettings.model}`;
  if (cachedDecision?.key === cacheKey && cachedDecision.expiresAt > Date.now()) {
    return cachedDecision.decision;
  }

  try {
    const payload = await groqJson<PageDecisionPayload>(stored.apiKey, state.aiSettings.model, [
      {
        role: 'system',
        content:
          'You are Goalden, a direct focus coach inside a Chrome extension. Decide whether the current page should be blocked because it pulls the user away from the active task. Return only valid JSON.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          outputSchema: {
            shouldBlock: 'boolean',
            confidence: 'number from 0 to 1',
            reason: 'one short sentence, plain English',
            coachMessage: 'one direct sentence shown on the block screen',
            question: 'one specific question asking what progress changed'
          },
          rules: [
            'Block obvious feeds, shorts, recommendations, endless comments, and passive scrolling.',
            'Allow pages that clearly help the active task, even if they are on YouTube or Reddit.',
            'If unsure, block only when the page looks more like consumption than work.',
            'Do not shame the user. Be blunt, but useful.'
          ],
          activeTask: {
            title: task.title,
            source: task.source,
            deadline: task.deadline,
            nextStep: task.nextStep
          },
          page: {
            site: site.label,
            url,
            title
          }
        })
      }
    ]);

    const decision = cleanDecision(payload, fallback);
    cachedDecision = {
      key: cacheKey,
      expiresAt: Date.now() + DECISION_TTL_MS,
      decision
    };
    return decision;
  } catch {
    return fallback;
  }
}

export async function reviewProgressWithAi(state: GoaldenState, siteId: SiteId, progress: string, recentProgress: ProgressLog[]) {
  if (!state.aiSettings.enabled) return fallbackProgressReview(progress);

  const stored = await getStoredGroqKey();
  if (!stored.apiKey) return fallbackProgressReview(progress);

  const site = SITES.find(item => item.id === siteId);
  const task = getActiveTask(state);

  try {
    const payload = await groqJson<ProgressReviewPayload>(stored.apiKey, state.aiSettings.model, [
      {
        role: 'system',
        content:
          'You are Goalden, a practical progress coach. Decide whether the user wrote a real progress update. Return only valid JSON.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          outputSchema: {
            approved: 'boolean',
            reason: 'one short sentence',
            coachMessage: 'if rejected, one useful question; if approved, one short confirmation'
          },
          approvalRules: [
            'Approve if the update names a concrete action, draft, decision, message, bug, file, number, blocker, or next step.',
            'Reject vague updates like "worked on it", "did stuff", "later", or empty motivational text.',
            'Do not demand a finished task. A real 15 minute step is enough.'
          ],
          activeTask: {
            title: task.title,
            source: task.source,
            deadline: task.deadline,
            nextStep: task.nextStep
          },
          requestedSite: site?.label ?? siteId,
          recentProgress: recentProgress.slice(0, 4),
          progress
        })
      }
    ]);

    return {
      approved: Boolean(payload.approved),
      reason: cleanSentence(payload.reason, 'Goalden checked the update.'),
      coachMessage: cleanSentence(payload.coachMessage, 'Name the exact thing that changed before opening the feed.')
    };
  } catch {
    return fallbackProgressReview(progress);
  }
}

export async function pickSitesWithAi(state: GoaldenState): Promise<SiteId[]> {
  if (!state.aiSettings.enabled || !state.aiSettings.sitePickingEnabled) return state.enabledSiteIds;

  const stored = await getStoredGroqKey();
  if (!stored.apiKey) return state.enabledSiteIds;

  const task = getActiveTask(state);
  try {
    const payload = await groqJson<SitePickPayload>(stored.apiKey, state.aiSettings.model, [
      {
        role: 'system',
        content:
          'You are Goalden. Pick which distracting feeds should be blocked for the user right now. Return only valid JSON.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          outputSchema: {
            siteIds: 'array of site ids to block',
            reason: 'one short sentence'
          },
          allowedSiteIds: SITES.map(site => site.id),
          activeTask: {
            title: task.title,
            source: task.source,
            deadline: task.deadline,
            nextStep: task.nextStep
          },
          rule: 'Block feeds that are likely to pull attention away from this task. Keep any site unblocked only if it is likely useful for the task.'
        })
      }
    ]);

    const valid = new Set(SITES.map(site => site.id));
    const picked = (payload.siteIds ?? []).filter((siteId): siteId is SiteId => valid.has(siteId));
    return picked.length ? picked : state.enabledSiteIds;
  } catch {
    return state.enabledSiteIds;
  }
}

async function getStoredGroqKey(): Promise<StoredGroqKey> {
  const result = await chrome.storage.local.get(GROQ_KEY_STORAGE_KEY);
  const stored = result[GROQ_KEY_STORAGE_KEY] as StoredGroqKey | undefined;
  if (stored?.apiKey) return stored;
  return {
    apiKey: DEMO_GROQ_API_KEY
  };
}

async function groqJson<T>(apiKey: string, model: string, messages: Array<{ role: 'system' | 'user'; content: string }>): Promise<T> {
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      response_format: { type: 'json_object' }
    })
  });

  const text = await response.text();
  const body = text ? (JSON.parse(text) as GroqChatResponse & { error?: { message?: string } }) : {};
  if (!response.ok) {
    throw new Error(body.error?.message ?? `Groq request failed with ${response.status}`);
  }

  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq returned an empty response.');
  return JSON.parse(content) as T;
}

function fallbackDecision(state: GoaldenState, site: BlockedSite): AiDecision {
  const task = getActiveTask(state);
  const shouldBlock = state.enabledSiteIds.includes(site.id);
  return {
    shouldBlock,
    confidence: shouldBlock ? 0.72 : 0.45,
    reason: shouldBlock ? `${site.label} is on your blocked feed list.` : `${site.label} is not blocked right now.`,
    coachMessage: `You said you'd work on ${task.title}. Do one small piece first.`,
    question: `What changed on ${task.title}?`,
    source: 'fallback',
    evaluatedAt: Date.now()
  };
}

function cleanDecision(payload: PageDecisionPayload, fallback: AiDecision): AiDecision {
  return {
    shouldBlock: typeof payload.shouldBlock === 'boolean' ? payload.shouldBlock : fallback.shouldBlock,
    confidence: clampConfidence(payload.confidence),
    reason: cleanSentence(payload.reason, fallback.reason),
    coachMessage: cleanSentence(payload.coachMessage, fallback.coachMessage),
    question: cleanSentence(payload.question, fallback.question),
    source: 'ai',
    evaluatedAt: Date.now()
  };
}

function fallbackProgressReview(progress: string) {
  const wordCount = progress.trim().split(/\s+/).filter(Boolean).length;
  return {
    approved: wordCount >= 5,
    reason: wordCount >= 5 ? 'The update is specific enough for a short break.' : 'The update is too vague.',
    coachMessage:
      wordCount >= 5
        ? 'Accepted. Take the break, then come back.'
        : 'Write what you changed, sent, decided, or got stuck on.'
  };
}

function clampConfidence(value: unknown) {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 0.5;
  return Math.max(0, Math.min(1, number));
}

function cleanSentence(value: unknown, fallback: string) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.slice(0, 220) || fallback;
}
