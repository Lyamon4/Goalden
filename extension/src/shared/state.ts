import { DEFAULT_ENABLED_SITE_IDS } from './sites';
import type { AiSettings, GoaldenState, GoaldenTask, ProgressLog, SiteId, TaskDraft, TaskStatus } from './types';

const STORAGE_KEY = 'goalden-state';
const MAX_LOG_ITEMS = 12;
const DEFAULT_TASK_ID = 'task-investor-update';
const FALLBACK_OPEN_TASK_ID = 'task-next-focus';
export const DEFAULT_AI_MODEL = 'openai/gpt-oss-120b';

type LegacyStoredState = Partial<GoaldenState> & { focusTask?: string };

const DEFAULT_TASK: GoaldenTask = {
  id: DEFAULT_TASK_ID,
  title: 'investor update',
  source: 'Slack',
  deadline: 'Today',
  nextStep: 'Finish one small piece',
  status: 'open',
  createdAt: Date.now(),
  updatedAt: Date.now()
};

function decodeLegacy(base64: string) {
  return new TextDecoder().decode(Uint8Array.from(atob(base64), char => char.charCodeAt(0)));
}

const LEGACY_INVESTOR_UPDATE = decodeLegacy('0LjQvdCy0LXRgdGC0L7RgNGB0LrQuNC5INCw0L/QtNC10LnRgg==');
const LEGACY_THIS_TASK = decodeLegacy('0Y3RgtGDINC30LDQtNCw0YfRgw==');

export const DEFAULT_STATE: GoaldenState = {
  enabledSiteIds: DEFAULT_ENABLED_SITE_IDS,
  breakMinutes: 15,
  activeTaskId: DEFAULT_TASK_ID,
  tasks: [DEFAULT_TASK],
  unlocks: {},
  progressLog: [],
  aiSettings: {
    enabled: true,
    model: DEFAULT_AI_MODEL,
    sitePickingEnabled: true
  }
};

function createTaskId() {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function fallbackTask(title?: string): GoaldenTask {
  const now = Date.now();
  return {
    ...DEFAULT_TASK,
    id: DEFAULT_TASK_ID,
    title: cleanLegacyTitle(title) || DEFAULT_TASK.title,
    createdAt: now,
    updatedAt: now
  };
}

function cleanLegacyTitle(title?: string) {
  const value = title?.trim();
  if (!value) return '';
  if (value === LEGACY_INVESTOR_UPDATE) return 'investor update';
  if (value === LEGACY_THIS_TASK) return 'your next task';
  return value;
}

function nextFocusTask(): GoaldenTask {
  return {
    ...fallbackTask('Choose your next real task'),
    id: FALLBACK_OPEN_TASK_ID,
    source: 'Manual',
    deadline: 'No deadline',
    nextStep: 'Write down the next 15 minute step before opening the feed',
    status: 'open'
  };
}

function normalizeStatus(value: unknown): TaskStatus {
  return value === 'done' || value === 'paused' || value === 'open' ? value : 'open';
}

function normalizeAiSettings(value: unknown): AiSettings {
  const settings = value && typeof value === 'object' ? (value as Partial<AiSettings>) : {};
  return {
    enabled: typeof settings.enabled === 'boolean' ? settings.enabled : DEFAULT_STATE.aiSettings.enabled,
    model: settings.model?.trim() || DEFAULT_AI_MODEL,
    sitePickingEnabled:
      typeof settings.sitePickingEnabled === 'boolean'
        ? settings.sitePickingEnabled
        : DEFAULT_STATE.aiSettings.sitePickingEnabled
  };
}

function normalizeUnlocks(value: unknown): Partial<Record<SiteId, number>> {
  const source = value && typeof value === 'object' ? (value as Partial<Record<SiteId, unknown>>) : {};
  const next: Partial<Record<SiteId, number>> = {};
  for (const siteId of DEFAULT_ENABLED_SITE_IDS) {
    const unlockUntil = source[siteId];
    if (typeof unlockUntil === 'number' && Number.isFinite(unlockUntil)) {
      next[siteId] = unlockUntil;
    }
  }
  return next;
}

function normalizeTask(value: unknown, index: number): GoaldenTask | null {
  if (!value || typeof value !== 'object') return null;
  const task = value as Partial<GoaldenTask>;
  const title = cleanLegacyTitle(task.title);
  if (!title) return null;
  const now = Date.now();
  return {
    id: task.id?.trim() || `task-imported-${index}`,
    title,
    source: task.source?.trim() || 'Manual',
    deadline: task.deadline?.trim() || 'No deadline',
    nextStep: task.nextStep?.trim() || 'Finish one small piece',
    status: normalizeStatus(task.status),
    createdAt: Number.isFinite(task.createdAt) ? task.createdAt! : now,
    updatedAt: Number.isFinite(task.updatedAt) ? task.updatedAt! : now
  };
}

function cleanState(value: LegacyStoredState | undefined): GoaldenState {
  const tasks = Array.isArray(value?.tasks)
    ? value.tasks.map(normalizeTask).filter((task): task is GoaldenTask => Boolean(task))
    : [];
  const normalizedTasks = tasks.length ? tasks : [fallbackTask(value?.focusTask)];
  const safeTasks = normalizedTasks.some(task => task.status === 'open')
    ? normalizedTasks
    : [nextFocusTask(), ...normalizedTasks.filter(task => task.id !== FALLBACK_OPEN_TASK_ID)];
  const activeTask =
    safeTasks.find(task => task.id === value?.activeTaskId && task.status === 'open') ??
    safeTasks.find(task => task.status === 'open') ??
    safeTasks[0]!;

  return {
    enabledSiteIds: value?.enabledSiteIds?.length ? value.enabledSiteIds : DEFAULT_STATE.enabledSiteIds,
    breakMinutes: Number.isFinite(value?.breakMinutes) ? Math.max(1, Math.min(60, value!.breakMinutes!)) : 15,
    activeTaskId: activeTask.id,
    tasks: safeTasks,
    unlocks: normalizeUnlocks(value?.unlocks),
    progressLog: Array.isArray(value?.progressLog) ? value.progressLog.slice(0, MAX_LOG_ITEMS) : [],
    aiSettings: normalizeAiSettings(value?.aiSettings)
  };
}

export function normalizeGoaldenState(value: unknown): GoaldenState {
  return cleanState(value as LegacyStoredState | undefined);
}

export async function getState(): Promise<GoaldenState> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return cleanState(result[STORAGE_KEY] as LegacyStoredState | undefined);
}

export async function saveState(nextState: GoaldenState): Promise<GoaldenState> {
  const cleaned = cleanState(nextState);
  await chrome.storage.local.set({ [STORAGE_KEY]: cleaned });
  return cleaned;
}

export async function updateState(updater: (state: GoaldenState) => GoaldenState): Promise<GoaldenState> {
  const current = await getState();
  return saveState(updater(current));
}

export function isUnlocked(state: GoaldenState, siteId: SiteId, now = Date.now()) {
  return (state.unlocks[siteId] ?? 0) > now;
}

export function getUnlockLabel(unlockUntil: number | undefined, now = Date.now()) {
  if (!unlockUntil || unlockUntil <= now) return 'locked';
  const minutes = Math.max(1, Math.ceil((unlockUntil - now) / 60000));
  return `${minutes}m left`;
}

export function getActiveTask(state: GoaldenState): GoaldenTask {
  return (
    state.tasks.find(task => task.id === state.activeTaskId && task.status === 'open') ??
    state.tasks.find(task => task.status === 'open') ??
    state.tasks[0] ??
    fallbackTask()
  );
}

export function createTaskFromDraft(task: TaskDraft, now = Date.now()): GoaldenTask {
  return {
    id: createTaskId(),
    title: task.title.trim(),
    source: task.source.trim() || 'Manual',
    deadline: task.deadline.trim() || 'No deadline',
    nextStep: task.nextStep.trim() || 'Finish one small piece',
    status: 'open',
    createdAt: now,
    updatedAt: now
  };
}

export function addTask(state: GoaldenState, task: TaskDraft, activate = true): GoaldenState {
  const nextTask = createTaskFromDraft(task);
  return {
    ...state,
    activeTaskId: activate ? nextTask.id : state.activeTaskId,
    tasks: [nextTask, ...state.tasks]
  };
}

export function updateTask(state: GoaldenState, taskId: string, patch: Partial<TaskDraft & { status: TaskStatus }>): GoaldenState {
  const now = Date.now();
  const tasks = state.tasks.map(task => {
    if (task.id !== taskId) return task;
    return {
      ...task,
      title: patch.title?.trim() || task.title,
      source: patch.source?.trim() || task.source,
      deadline: patch.deadline?.trim() || task.deadline,
      nextStep: patch.nextStep?.trim() || task.nextStep,
      status: patch.status ? normalizeStatus(patch.status) : task.status,
      updatedAt: now
    };
  });
  const currentActive = tasks.find(task => task.id === state.activeTaskId && task.status === 'open');
  const nextActive = currentActive ?? tasks.find(task => task.status === 'open') ?? tasks[0] ?? fallbackTask();

  return {
    ...state,
    activeTaskId: nextActive.id,
    tasks: tasks.length ? tasks : [nextActive]
  };
}

export function deleteTask(state: GoaldenState, taskId: string): GoaldenState {
  const tasks = state.tasks.filter(task => task.id !== taskId);
  const safeTasks = tasks.length ? tasks : [fallbackTask('Choose your next real task')];
  const activeTask =
    safeTasks.find(task => task.id === state.activeTaskId && task.status === 'open') ??
    safeTasks.find(task => task.status === 'open') ??
    safeTasks[0]!;

  return {
    ...state,
    activeTaskId: activeTask.id,
    tasks: safeTasks
  };
}

export function setActiveTask(state: GoaldenState, taskId: string): GoaldenState {
  const task = state.tasks.find(item => item.id === taskId);
  if (!task) return state;
  return {
    ...state,
    activeTaskId: task.id,
    tasks: state.tasks.map(item => (item.id === taskId && item.status !== 'open' ? { ...item, status: 'open' } : item))
  };
}

export function updateAiSettings(state: GoaldenState, patch: Partial<AiSettings>): GoaldenState {
  return {
    ...state,
    aiSettings: normalizeAiSettings({
      ...state.aiSettings,
      ...patch
    })
  };
}

export function createUnlock(state: GoaldenState, siteId: SiteId, progress: string, taskId?: string, now = Date.now()): GoaldenState {
  const breakMs = state.breakMinutes * 60 * 1000;
  const unlockUntil = now + breakMs;
  const task = state.tasks.find(item => item.id === taskId) ?? getActiveTask(state);

  return {
    ...state,
    unlocks: {
      ...state.unlocks,
      [siteId]: unlockUntil
    },
    progressLog: [
      {
        siteId,
        taskId: task.id,
        taskTitle: task.title,
        text: progress.trim(),
        createdAt: now,
        unlockUntil
      },
      ...state.progressLog
    ].slice(0, MAX_LOG_ITEMS)
  };
}

function pickTask(current: GoaldenTask | undefined, candidate: GoaldenTask) {
  if (!current) return candidate;
  return candidate.updatedAt > current.updatedAt ? candidate : current;
}

function progressKey(item: ProgressLog) {
  return `${item.createdAt}:${item.siteId}:${item.taskId ?? ''}:${item.text}`;
}

export function mergeGoaldenStates(localValue: unknown, remoteValue: unknown): GoaldenState {
  const local = normalizeGoaldenState(localValue);
  const remote = normalizeGoaldenState(remoteValue);
  const taskMap = new Map<string, GoaldenTask>();

  for (const task of remote.tasks) {
    taskMap.set(task.id, pickTask(taskMap.get(task.id), task));
  }
  for (const task of local.tasks) {
    taskMap.set(task.id, pickTask(taskMap.get(task.id), task));
  }

  const tasks = [...taskMap.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  const activeTask =
    tasks.find(task => task.id === local.activeTaskId && task.status === 'open') ??
    tasks.find(task => task.id === remote.activeTaskId && task.status === 'open') ??
    tasks.find(task => task.status === 'open') ??
    tasks[0] ??
    fallbackTask();

  const progressMap = new Map<string, ProgressLog>();
  for (const item of remote.progressLog) progressMap.set(progressKey(item), item);
  for (const item of local.progressLog) progressMap.set(progressKey(item), item);

  return normalizeGoaldenState({
    enabledSiteIds: local.enabledSiteIds.length ? local.enabledSiteIds : remote.enabledSiteIds,
    breakMinutes: local.breakMinutes || remote.breakMinutes,
    activeTaskId: activeTask.id,
    tasks,
    unlocks: {
      ...remote.unlocks,
      ...local.unlocks
    },
    progressLog: [...progressMap.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_LOG_ITEMS),
    aiSettings: normalizeAiSettings({
      ...remote.aiSettings,
      ...local.aiSettings
    })
  });
}
