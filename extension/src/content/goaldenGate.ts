type SiteId = 'reddit' | 'youtube' | 'tiktok' | 'instagram';
type TaskStatus = 'open' | 'done' | 'paused';

interface GoaldenTask {
  id: string;
  title: string;
  source: string;
  deadline: string;
  nextStep: string;
  status: TaskStatus;
}

interface GoaldenState {
  enabledSiteIds: SiteId[];
  breakMinutes: number;
  activeTaskId: string;
  tasks: GoaldenTask[];
  unlocks: Partial<Record<SiteId, number>>;
}

interface BlockedSite {
  id: SiteId;
  label: string;
  host: string;
  domains: string[];
}

const SITES: BlockedSite[] = [
  {
    id: 'reddit',
    label: 'Reddit',
    host: 'reddit.com',
    domains: ['reddit.com', 'www.reddit.com', 'old.reddit.com', 'new.reddit.com']
  },
  {
    id: 'youtube',
    label: 'YouTube',
    host: 'youtube.com',
    domains: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    host: 'tiktok.com',
    domains: ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com']
  },
  {
    id: 'instagram',
    label: 'Instagram',
    host: 'instagram.com',
    domains: ['instagram.com', 'www.instagram.com']
  }
];

const ROOT_ID = 'goalden-content-gate';
const INSTALL_KEY = '__goaldenGateInstalled';
const FALLBACK_TASK: GoaldenTask = {
  id: 'task-fallback',
  title: 'your next task',
  source: 'Manual',
  deadline: 'No deadline',
  nextStep: 'Finish one small piece',
  status: 'open'
};

let restoreOverflow = '';
let recheckTimer = 0;
let navigationTimer = 0;
let lastUrl = window.location.href;

function detectSite() {
  const host = window.location.hostname.toLowerCase();
  return SITES.find(site => host === site.host || host.endsWith(`.${site.host}`) || site.domains.includes(host));
}

async function sendMessage<T>(message: unknown): Promise<T> {
  const response = await chrome.runtime.sendMessage(message);
  if (response?.error) {
    throw new Error(response.error);
  }
  return response as T;
}

function isBlocked(state: GoaldenState, siteId: SiteId) {
  return state.enabledSiteIds.includes(siteId) && (state.unlocks[siteId] ?? 0) <= Date.now();
}

function getActiveTask(state: GoaldenState) {
  return (
    state.tasks?.find(task => task.id === state.activeTaskId && task.status === 'open') ??
    state.tasks?.find(task => task.status === 'open') ??
    state.tasks?.[0] ??
    FALLBACK_TASK
  );
}

function getGateKey(site: BlockedSite, state: GoaldenState) {
  const task = getActiveTask(state);
  const unlockUntil = state.unlocks[site.id] ?? 0;
  return `${site.id}:${task.id}:${state.breakMinutes}:${unlockUntil}`;
}

function scheduleRecheck(state: GoaldenState, siteId: SiteId) {
  window.clearTimeout(recheckTimer);
  const unlockUntil = state.unlocks[siteId] ?? 0;
  if (unlockUntil > Date.now()) {
    recheckTimer = window.setTimeout(evaluateGate, Math.max(300, unlockUntil - Date.now() + 300));
  }
}

function scheduleEvaluate(delay = 60) {
  window.clearTimeout(navigationTimer);
  navigationTimer = window.setTimeout(evaluateGate, delay);
}

function removeGate() {
  document.getElementById(ROOT_ID)?.remove();
  document.documentElement.style.overflow = restoreOverflow;
}

function createStyle() {
  return `
    :host {
      all: initial;
      color-scheme: light;
      font-family: "SF Pro Display", "Helvetica Neue", Arial, sans-serif;
    }

    .shell {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(380px, 520px);
      gap: clamp(28px, 5vw, 72px);
      align-items: center;
      background: #f7f6f3;
      color: #11110f;
      padding: clamp(24px, 5vw, 72px);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: clamp(36px, 8vh, 84px);
      font-size: 22px;
      font-weight: 800;
    }

    .mark {
      display: grid;
      width: 34px;
      height: 34px;
      place-items: center;
      color: #11110f;
    }

    .mark svg {
      width: 34px;
      height: 34px;
    }

    .eyebrow {
      margin: 0;
      color: #956400;
      font-family: "SF Mono", Consolas, monospace;
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    h1 {
      max-width: 780px;
      margin: 16px 0 18px;
      color: #11110f;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(54px, 7vw, 118px);
      font-weight: 500;
      letter-spacing: -0.03em;
      line-height: 0.92;
    }

    .lede {
      max-width: 620px;
      margin: 0;
      color: #6f6a61;
      font-size: clamp(18px, 2vw, 23px);
      line-height: 1.55;
    }

    .stats {
      display: grid;
      max-width: 650px;
      grid-template-columns: repeat(3, 1fr);
      margin-top: 52px;
      border-top: 1px solid #e5e1da;
    }

    .stats div {
      min-width: 0;
      border-right: 1px solid #e5e1da;
      padding: 18px 18px 0 0;
    }

    .stats div:last-child {
      border-right: 0;
    }

    .stats span {
      display: block;
      color: #787774;
      font-size: 12px;
      margin-bottom: 8px;
    }

    .stats strong {
      display: block;
      overflow: hidden;
      color: #11110f;
      font-size: 17px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card {
      overflow: hidden;
      border: 1px solid #e3ded5;
      border-radius: 12px;
      background: #fff;
      box-shadow: 0 24px 80px rgb(17 17 15 / 8%);
    }

    .bar {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 44px;
      border-bottom: 1px solid #eaeaea;
      padding: 0 16px;
      background: #fbfbfa;
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 99px;
      background: #d8d2c8;
    }

    .bar p {
      margin-left: auto;
      color: #787774;
      font-family: "SF Mono", Consolas, monospace;
      font-size: 11px;
    }

    .body {
      padding: 28px;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid #eaeaea;
      border-radius: 999px;
      padding: 7px 11px;
      color: #6f6a61;
      font-size: 13px;
    }

    .pill::before {
      width: 8px;
      height: 8px;
      border-radius: 99px;
      background: #c98212;
      content: "";
    }

    h2 {
      margin: 24px 0 10px;
      color: #11110f;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 38px;
      font-weight: 500;
      letter-spacing: -0.02em;
      line-height: 1;
    }

    .quote {
      margin: 18px 0;
      border: 1px solid #eaeaea;
      border-radius: 10px;
      padding: 14px 16px;
      color: #11110f;
      font-size: 15px;
      line-height: 1.55;
    }

    .quote span {
      display: block;
      margin-bottom: 6px;
      color: #787774;
      font-size: 12px;
    }

    .card-copy {
      margin: 0 0 18px;
      color: #6f6a61;
      font-size: 15px;
      line-height: 1.55;
    }

    label {
      display: block;
      margin-bottom: 9px;
      color: #11110f;
      font-size: 14px;
      font-weight: 800;
    }

    textarea {
      box-sizing: border-box;
      width: 100%;
      min-height: 128px;
      border: 1px solid #eaeaea;
      border-radius: 10px;
      background: #fff;
      color: #11110f;
      font: inherit;
      font-size: 15px;
      line-height: 1.55;
      outline: none;
      padding: 13px 14px;
      resize: vertical;
    }

    textarea:focus {
      border-color: #11110f;
      box-shadow: 0 0 0 4px rgb(17 17 15 / 7%);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin-top: 14px;
    }

    button {
      min-height: 42px;
      border: 1px solid #11110f;
      border-radius: 6px;
      background: #11110f;
      color: #fff;
      cursor: pointer;
      font: inherit;
      font-size: 14px;
      font-weight: 800;
      padding: 0 15px;
    }

    button.secondary {
      border-color: #eaeaea;
      background: #fff;
      color: #11110f;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    .hint {
      color: #787774;
      font-size: 12px;
    }

    .error {
      margin: 12px 0 0;
      color: #9f2f2d;
      font-size: 13px;
      font-weight: 800;
    }

    @media (max-width: 920px) {
      .shell {
        grid-template-columns: 1fr;
        overflow: auto;
      }
    }

    @media (max-width: 620px) {
      .shell {
        padding: 18px;
      }

      .stats {
        grid-template-columns: 1fr;
      }

      .stats div {
        border-right: 0;
      }
    }
  `;
}

function showGate(site: BlockedSite, state: GoaldenState) {
  const task = getActiveTask(state);
  const gateKey = getGateKey(site, state);
  const existing = document.getElementById(ROOT_ID);
  if (existing?.dataset.goaldenKey === gateKey) return;
  const wasShowing = Boolean(existing);
  existing?.remove();

  if (!wasShowing) {
    restoreOverflow = document.documentElement.style.overflow;
  }
  document.documentElement.style.overflow = 'hidden';

  const host = document.createElement('goalden-gate');
  host.id = ROOT_ID;
  host.dataset.goaldenKey = gateKey;

  const shadow = host.attachShadow({ mode: 'open' });
  const focusTask = task.title || FALLBACK_TASK.title;
  const source = task.source || FALLBACK_TASK.source;
  const deadline = task.deadline || FALLBACK_TASK.deadline;
  const nextStep = task.nextStep || FALLBACK_TASK.nextStep;
  const breakMinutes = state.breakMinutes || 15;

  shadow.innerHTML = `
    <style>${createStyle()}</style>
    <main class="shell" role="dialog" aria-modal="true" aria-label="Goalden progress gate">
      <section>
        <div class="brand">
          <span class="mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" fill="none">
              <path d="M31.8 2 36 25l21.8-9.5L40.4 31.8 62 36 39 40.1l9.5 21.7L32.2 44.5 28 62 24 39.2 2 48.7l17.3-16.5L2 28l22.7-4.1L15.3 2.2 31.8 19V2Z" fill="currentColor" />
            </svg>
          </span>
          <span>Goalden</span>
        </div>
        <p class="eyebrow">Progress before the feed</p>
        <h1>You said you'd work on ${escapeHtml(focusTask)}.</h1>
        <p class="lede">Do one small piece, write what changed, and Goalden will open ${escapeHtml(site.label)} for ${breakMinutes} minutes.</p>
        <div class="stats">
          <div>
            <span>Current promise</span>
            <strong>${escapeHtml(focusTask)}</strong>
          </div>
          <div>
            <span>Source</span>
            <strong>${escapeHtml(source)}</strong>
          </div>
          <div>
            <span>Deadline</span>
            <strong>${escapeHtml(deadline)}</strong>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="bar">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
          <p>${escapeHtml(site.host)} held by Goalden</p>
        </div>
        <div class="body">
          <span class="pill">${escapeHtml(site.label)} is paused</span>
          <h2>What changed?</h2>
          <div class="quote">
            <span>Next step</span>
            ${escapeHtml(nextStep)}
          </div>
          <p class="card-copy">Be specific: what did you write, send, decide, or get stuck on? "I worked on it" is too vague.</p>
          <label for="goalden-progress">Progress update</label>
          <textarea id="goalden-progress" placeholder="I wrote the churn section, sent the draft, and listed the numbers I still need."></textarea>
          <div class="actions">
            <button id="goalden-submit" disabled>Submit progress</button>
            <button id="goalden-panel" class="secondary">Open panel</button>
            <span class="hint" id="goalden-hint">5 more words to pass the check</span>
          </div>
          <p class="error" id="goalden-error" hidden></p>
        </div>
      </section>
    </main>
  `;

  (document.documentElement || document.body).appendChild(host);

  const textarea = shadow.getElementById('goalden-progress') as HTMLTextAreaElement | null;
  const submit = shadow.getElementById('goalden-submit') as HTMLButtonElement | null;
  const hint = shadow.getElementById('goalden-hint');
  const error = shadow.getElementById('goalden-error');
  const panel = shadow.getElementById('goalden-panel') as HTMLButtonElement | null;

  textarea?.addEventListener('input', () => {
    const count = wordCount(textarea.value);
    if (submit) submit.disabled = count < 5;
    if (hint) hint.textContent = count < 5 ? `${5 - count} more words to pass the check` : 'Ready to submit';
  });

  submit?.addEventListener('click', async () => {
    if (!textarea || wordCount(textarea.value) < 5) return;
    submit.disabled = true;
    submit.textContent = 'Checking...';
    if (error) error.hidden = true;

    try {
      await sendMessage<GoaldenState>({
        type: 'approve-progress',
        siteId: site.id,
        progress: textarea.value,
        taskId: task.id
      });
      removeGate();
    } catch (reason) {
      submit.disabled = false;
      submit.textContent = 'Submit progress';
      if (error) {
        error.hidden = false;
        error.textContent = reason instanceof Error ? reason.message : "Couldn't start the break.";
      }
    }
  });

  panel?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'open-side-panel' });
  });
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return entities[char] ?? char;
  });
}

async function evaluateGate() {
  const site = detectSite();
  if (!site) {
    removeGate();
    return;
  }

  try {
    const state = await sendMessage<GoaldenState>({ type: 'get-state' });
    if (isBlocked(state, site.id)) {
      showGate(site, state);
    } else {
      removeGate();
    }
    scheduleRecheck(state, site.id);
  } catch {
    removeGate();
  }
}

function installNavigationHooks() {
  const windowWithFlag = window as typeof window & { [INSTALL_KEY]?: boolean };
  if (windowWithFlag[INSTALL_KEY]) {
    scheduleEvaluate();
    return;
  }
  windowWithFlag[INSTALL_KEY] = true;

  const wrapHistoryMethod = (method: 'pushState' | 'replaceState') => {
    const original = history[method];
    history[method] = function wrappedHistoryMethod(this: History, ...args: Parameters<History[typeof method]>) {
      const result = original.apply(this, args);
      scheduleEvaluate();
      return result;
    } as History[typeof method];
  };

  wrapHistoryMethod('pushState');
  wrapHistoryMethod('replaceState');
  window.addEventListener('popstate', () => scheduleEvaluate());
  window.addEventListener('hashchange', () => scheduleEvaluate());

  window.setInterval(() => {
    if (lastUrl === window.location.href) return;
    lastUrl = window.location.href;
    scheduleEvaluate();
  }, 700);

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'goalden-evaluate') {
      scheduleEvaluate();
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes['goalden-state']) {
      scheduleEvaluate();
    }
  });

  scheduleEvaluate(0);
}

installNavigationHooks();
