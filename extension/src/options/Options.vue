<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { sendMessage } from '@/shared/messaging';
import { SITES } from '@/shared/sites';
import type {
  AiSettings,
  ConnectableIntegrationProvider,
  GoaldenTask,
  GoaldenViewState,
  IntegrationProvider,
  SiteId,
  TaskDraft,
  TaskStatus
} from '@/shared/types';

type DashboardPage = 'tasks' | 'completed' | 'reports' | 'routines' | 'general' | 'focus' | 'integrations';

const pages: DashboardPage[] = ['tasks', 'completed', 'reports', 'routines', 'general', 'focus', 'integrations'];
const page = ref<DashboardPage>('reports');
const state = ref<GoaldenViewState | null>(null);
const enabledSiteIds = ref<SiteId[]>([]);
const breakMinutes = ref(15);
const savedLabel = ref('');
const authMessage = ref('');
const authError = ref('');
const integrationMessage = ref('');
const integrationError = ref('');
const aiMessage = ref('');
const aiError = ref('');
const isSaving = ref(false);
const isAuthBusy = ref(false);
const isSyncing = ref(false);
const isAiSaving = ref(false);
const isCapturing = ref(false);
const activeIntegration = ref<ConnectableIntegrationProvider | ''>('');
const aiModelDraft = ref('openai/gpt-oss-120b');
const authMode = ref<'sign-in' | 'sign-up'>('sign-in');

const authForm = ref({
  name: '',
  email: '',
  password: ''
});

const draftTask = ref<TaskDraft>({
  title: '',
  source: 'Manual',
  deadline: '',
  nextStep: ''
});

const navSections = [
  {
    label: 'Work',
    items: [
      { page: 'tasks' as const, label: 'My Tasks', mark: 'T' },
      { page: 'completed' as const, label: 'Completed Tasks', mark: 'C' }
    ]
  },
  {
    label: 'Insights',
    items: [
      { page: 'reports' as const, label: 'Reports', mark: 'R' },
      { page: 'routines' as const, label: 'Routines', mark: 'O' }
    ]
  },
  {
    label: 'Settings',
    items: [
      { page: 'general' as const, label: 'General', mark: 'G' },
      { page: 'focus' as const, label: 'Focus Mode', mark: 'F' },
      { page: 'integrations' as const, label: 'Integrations', mark: 'I' }
    ]
  }
];

const tasks = computed(() => state.value?.tasks ?? []);
const openTasks = computed(() => tasks.value.filter(task => task.status !== 'done'));
const completedTasks = computed(() => tasks.value.filter(task => task.status === 'done'));
const auth = computed(() => state.value?.auth);
const isSignedIn = computed(() => auth.value?.status === 'signed-in');
const integrations = computed(() => state.value?.integrations ?? []);
const taskCandidates = computed(() => state.value?.taskCandidates ?? []);
const integrationHealth = computed(() => state.value?.integrationHealth ?? null);
const pendingCandidates = computed(() => taskCandidates.value.filter(candidate => candidate.status === 'new'));
const enabledSet = computed(() => new Set(enabledSiteIds.value));
const activeTask = computed(() => {
  const current = state.value;
  if (!current) return null;
  return (
    current.tasks.find(task => task.id === current.activeTaskId && task.status === 'open') ??
    current.tasks.find(task => task.status === 'open') ??
    current.tasks[0] ??
    null
  );
});
const progressLog = computed(() => state.value?.progressLog ?? []);
const userName = computed(() => auth.value?.user?.name || auth.value?.user?.email?.split('@')[0] || 'founder');
const totalFocusMinutes = computed(() =>
  progressLog.value.reduce((sum, log) => {
    const earned = Math.round(((log.unlockUntil || 0) - (log.createdAt || 0)) / 60000);
    return sum + Math.max(0, earned || breakMinutes.value);
  }, 0)
);
const avgTaskMinutes = computed(() =>
  completedTasks.value.length ? Math.max(1, Math.round(totalFocusMinutes.value / completedTasks.value.length)) : 0
);
const onTimeRate = computed(() => {
  if (!completedTasks.value.length) return 0;
  const withDeadline = completedTasks.value.filter(task => task.deadline.trim()).length;
  return withDeadline ? Math.round((withDeadline / completedTasks.value.length) * 100) : 100;
});
const bestDay = computed(() => {
  if (!progressLog.value.length) return 'Today';
  const counts = new Map<string, number>();
  for (const log of progressLog.value) {
    const day = new Date(log.createdAt).toLocaleDateString(undefined, { weekday: 'short' });
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Today';
});
const pulseScore = computed(() => {
  const taskScore = Math.min(45, completedTasks.value.length * 15);
  const focusScore = Math.min(45, Math.round(totalFocusMinutes.value / 2));
  const candidatePenalty = Math.min(10, pendingCandidates.value.length);
  return Math.max(12, Math.min(99, 10 + taskScore + focusScore - candidatePenalty));
});
const insightCards = computed(() => [
  { label: 'Focus minutes', value: `${totalFocusMinutes.value}m`, detail: 'earned through progress' },
  { label: 'Tasks done', value: String(completedTasks.value.length), detail: `${tasks.value.length} total` },
  { label: 'Avg per task', value: `${avgTaskMinutes.value}m`, detail: 'actual focus time' },
  { label: 'On-time rate', value: `${onTimeRate.value}%`, detail: completedTasks.value.length ? 'closed with deadline' : 'no finished tasks yet' },
  { label: 'Best day', value: bestDay.value, detail: 'strongest completion day' },
  { label: 'Found tasks', value: String(pendingCandidates.value.length), detail: 'waiting for review' }
]);
const heatmapDays = computed(() => {
  const today = startOfDay(Date.now());
  const counts = new Map<string, number>();
  for (const log of progressLog.value) {
    const key = toDateKey(log.createdAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from({ length: 126 }, (_, index) => {
    const time = today - (125 - index) * 86400000;
    const count = counts.get(toDateKey(time)) ?? 0;
    return {
      key: toDateKey(time),
      count,
      intensity: Math.min(4, count)
    };
  });
});
const weekBars = computed(() => {
  const today = startOfDay(Date.now());
  return Array.from({ length: 7 }, (_, index) => {
    const time = today - (6 - index) * 86400000;
    const minutes = progressLog.value
      .filter(log => startOfDay(log.createdAt) === time)
      .reduce((sum, log) => sum + Math.max(1, Math.round(((log.unlockUntil || 0) - (log.createdAt || 0)) / 60000)), 0);
    return {
      label: new Date(time).toLocaleDateString(undefined, { weekday: 'short' }),
      minutes,
      height: `${Math.max(8, Math.min(100, minutes * 4))}%`
    };
  });
});
const siteUsage = computed(() =>
  SITES.map(site => {
    const count = progressLog.value.filter(log => log.siteId === site.id).length;
    return {
      ...site,
      count,
      minutes: count * breakMinutes.value,
      enabled: enabledSet.value.has(site.id)
    };
  }).sort((a, b) => b.count - a.count)
);
const productivityRows = computed(() => [
  { label: 'Focus', value: totalFocusMinutes.value, percent: pulseScore.value, tone: 'focus' },
  { label: 'Blocked feeds', value: enabledSiteIds.value.length, percent: Math.min(100, enabledSiteIds.value.length * 25), tone: 'blocked' },
  { label: 'Breaks earned', value: progressLog.value.length, percent: Math.min(100, progressLog.value.length * 18), tone: 'break' },
  { label: 'Unreviewed tasks', value: pendingCandidates.value.length, percent: Math.min(100, pendingCandidates.value.length * 16), tone: 'review' }
]);
const integrationCards = computed(() => [
  {
    provider: 'browser' as IntegrationProvider,
    title: 'Universal Capture',
    group: 'Capture',
    copy: 'Highlight any message in the browser and send it to Goalden. Or scan the current page.',
    action: 'Scan page',
    status: 'Ready'
  },
  {
    provider: 'telegram' as IntegrationProvider,
    title: 'Telegram',
    group: 'Work chats',
    copy: 'Forward messages to the Goalden bot. Goalden stores the task, next step, and a short snippet.',
    action: 'Connect',
    status: integrationStatusText('telegram')
  },
  {
    provider: 'slack' as IntegrationProvider,
    title: 'Slack',
    group: 'Work chats',
    copy: 'Connect a workspace, then sync selected conversations for task candidates.',
    action: 'Connect',
    status: integrationStatusText('slack')
  },
  {
    provider: 'gmail' as const,
    title: 'Gmail',
    group: 'Composio next',
    copy: 'Email promises and follow-ups will come through the Composio connector.',
    action: 'Soon',
    status: 'Planned'
  },
  {
    provider: 'calendar' as const,
    title: 'Google Calendar',
    group: 'Composio next',
    copy: 'Meetings and prep tasks will feed the same blocker loop.',
    action: 'Soon',
    status: 'Planned'
  },
  {
    provider: 'notion' as const,
    title: 'Notion',
    group: 'Task managers',
    copy: 'Bring saved tasks and project notes into Goalden.',
    action: 'Soon',
    status: 'Planned'
  },
  {
    provider: 'whatsapp' as const,
    title: 'WhatsApp',
    group: 'Coming soon',
    copy: 'Official personal chat reading is not available yet. Capture forwarding comes first.',
    action: 'Soon',
    status: 'Research'
  }
]);
const groupedIntegrations = computed(() => {
  const groups: Record<string, typeof integrationCards.value> = {};
  for (const card of integrationCards.value) {
    groups[card.group] ??= [];
    groups[card.group].push(card);
  }
  return groups;
});

function readPageFromUrl() {
  const next = new URLSearchParams(window.location.search).get('page') as DashboardPage | null;
  page.value = next && pages.includes(next) ? next : 'reports';
}

function go(nextPage: DashboardPage) {
  page.value = nextPage;
  const url = new URL(window.location.href);
  url.searchParams.set('page', nextPage);
  window.history.replaceState({}, '', url);
}

async function loadState() {
  try {
    const next = await sendMessage<GoaldenViewState>({ type: 'get-state' });
    syncLocal(next);
    if (next.auth.status === 'signed-in') {
      await loadIntegrationData();
    }
  } catch (error) {
    authError.value = error instanceof Error ? error.message : 'Goalden could not load settings.';
  }
}

async function loadIntegrationData() {
  if (!isSignedIn.value) return;
  try {
    syncLocal(await sendMessage<GoaldenViewState>({ type: 'get-integrations' }));
  } catch (error) {
    integrationError.value = error instanceof Error ? error.message : 'Goalden could not load integrations.';
  }
}

function syncLocal(next: GoaldenViewState) {
  state.value = next;
  enabledSiteIds.value = [...next.enabledSiteIds];
  breakMinutes.value = next.breakMinutes;
  aiModelDraft.value = next.aiSettings.model;
}

async function submitAuth() {
  if (!authForm.value.email.trim() || !authForm.value.password) return;
  isAuthBusy.value = true;
  authError.value = '';
  authMessage.value = '';

  try {
    const next =
      authMode.value === 'sign-in'
        ? await sendMessage<GoaldenViewState>({
            type: 'auth-sign-in',
            email: authForm.value.email.trim(),
            password: authForm.value.password
          })
        : await sendMessage<GoaldenViewState>({
            type: 'auth-sign-up',
            email: authForm.value.email.trim(),
            password: authForm.value.password,
            name: authForm.value.name.trim()
          });
    syncLocal(next);
    authForm.value.password = '';
    authMessage.value = next.auth.status === 'pending-confirmation' ? 'Check your email, then sign in.' : 'Signed in.';
    if (next.auth.status === 'signed-in') await loadIntegrationData();
  } catch (error) {
    authError.value = error instanceof Error ? error.message : 'Sign in failed.';
  } finally {
    isAuthBusy.value = false;
  }
}

async function signOutUser() {
  isAuthBusy.value = true;
  try {
    syncLocal(await sendMessage<GoaldenViewState>({ type: 'auth-sign-out' }));
  } finally {
    isAuthBusy.value = false;
  }
}

async function syncRemote() {
  isSyncing.value = true;
  try {
    syncLocal(await sendMessage<GoaldenViewState>({ type: 'sync-remote' }));
    authMessage.value = 'Synced.';
  } catch (error) {
    authError.value = error instanceof Error ? error.message : 'Sync failed.';
  } finally {
    isSyncing.value = false;
  }
}

async function createTask() {
  if (!draftTask.value.title.trim()) return;
  syncLocal(
    await sendMessage<GoaldenViewState>({
      type: 'create-task',
      task: { ...draftTask.value },
      activate: true
    })
  );
  draftTask.value = { title: '', source: 'Manual', deadline: '', nextStep: '' };
  flashSaved();
}

async function setStatus(task: GoaldenTask, status: TaskStatus) {
  syncLocal(
    await sendMessage<GoaldenViewState>({
      type: 'update-task',
      taskId: task.id,
      patch: { status }
    })
  );
}

async function setActive(taskId: string) {
  syncLocal(await sendMessage<GoaldenViewState>({ type: 'set-active-task', taskId }));
}

async function removeTask(taskId: string) {
  syncLocal(await sendMessage<GoaldenViewState>({ type: 'delete-task', taskId }));
}

async function saveSettings() {
  isSaving.value = true;
  try {
    syncLocal(
      await sendMessage<GoaldenViewState>({
        type: 'save-settings',
        enabledSiteIds: enabledSiteIds.value,
        breakMinutes: breakMinutes.value
      })
    );
    flashSaved();
  } finally {
    isSaving.value = false;
  }
}

async function toggleSite(siteId: SiteId) {
  const next = new Set(enabledSiteIds.value);
  if (next.has(siteId)) next.delete(siteId);
  else next.add(siteId);
  enabledSiteIds.value = [...next];
  await saveSettings();
}

async function saveAiSettings(patch: Partial<AiSettings>) {
  if (!state.value) return;
  isAiSaving.value = true;
  aiMessage.value = '';
  aiError.value = '';
  try {
    syncLocal(
      await sendMessage<GoaldenViewState>({
        type: 'save-ai-settings',
        aiSettings: patch
      })
    );
    aiMessage.value = 'AI settings saved.';
    window.setTimeout(() => {
      aiMessage.value = '';
    }, 1400);
  } catch (error) {
    aiError.value = error instanceof Error ? error.message : 'AI settings did not save.';
  } finally {
    isAiSaving.value = false;
  }
}

async function saveAiToggle(enabled: boolean) {
  await saveAiSettings({ enabled });
}

async function saveSitePickingToggle(sitePickingEnabled: boolean) {
  await saveAiSettings({ sitePickingEnabled });
}

async function saveAiModel() {
  await saveAiSettings({ model: aiModelDraft.value });
}

async function letAiPickSites() {
  isAiSaving.value = true;
  aiMessage.value = '';
  aiError.value = '';
  try {
    syncLocal(await sendMessage<GoaldenViewState>({ type: 'pick-sites-with-ai' }));
    aiMessage.value = 'Goalden picked the feeds to block.';
  } catch (error) {
    aiError.value = error instanceof Error ? error.message : 'Goalden could not pick sites.';
  } finally {
    isAiSaving.value = false;
  }
}

async function scanCurrentPage() {
  isCapturing.value = true;
  integrationMessage.value = '';
  integrationError.value = '';
  try {
    syncLocal(await sendMessage<GoaldenViewState>({ type: 'scan-current-page' }));
    integrationMessage.value = 'Goalden scanned the current page.';
    go('integrations');
  } catch (error) {
    integrationError.value = error instanceof Error ? error.message : 'Goalden could not scan this page.';
  } finally {
    isCapturing.value = false;
  }
}

async function connectIntegration(provider: ConnectableIntegrationProvider) {
  activeIntegration.value = provider;
  integrationMessage.value = '';
  integrationError.value = '';
  try {
    syncLocal(
      await sendMessage<GoaldenViewState>({
        type: 'start-integration-connect',
        provider
      })
    );
    integrationMessage.value =
      provider === 'telegram'
        ? 'Telegram opened. Press Start in the bot, then forward task messages.'
        : 'Slack connected. Run sync to pull task candidates.';
  } catch (error) {
    integrationError.value = error instanceof Error ? error.message : `${providerLabel(provider)} did not connect.`;
  } finally {
    activeIntegration.value = '';
  }
}

async function syncIntegration(provider: ConnectableIntegrationProvider) {
  activeIntegration.value = provider;
  integrationMessage.value = '';
  integrationError.value = '';
  try {
    syncLocal(await sendMessage<GoaldenViewState>({ type: 'sync-integration', provider }));
    integrationMessage.value = `${providerLabel(provider)} sync finished.`;
  } catch (error) {
    integrationError.value = error instanceof Error ? error.message : `${providerLabel(provider)} sync failed.`;
  } finally {
    activeIntegration.value = '';
  }
}

async function acceptCandidate(candidateId: string, activate = true) {
  integrationError.value = '';
  try {
    syncLocal(
      await sendMessage<GoaldenViewState>({
        type: 'accept-task-candidate',
        candidateId,
        activate
      })
    );
    integrationMessage.value = activate ? 'Task added and made active.' : 'Task added.';
  } catch (error) {
    integrationError.value = error instanceof Error ? error.message : 'Could not add this task.';
  }
}

async function dismissCandidate(candidateId: string) {
  try {
    syncLocal(await sendMessage<GoaldenViewState>({ type: 'dismiss-task-candidate', candidateId }));
  } catch (error) {
    integrationError.value = error instanceof Error ? error.message : 'Could not dismiss this task.';
  }
}

function getIntegration(provider: ConnectableIntegrationProvider) {
  return integrations.value.find(integration => integration.provider === provider);
}

function integrationStatusText(provider: ConnectableIntegrationProvider) {
  if (!providerBackendReady(provider)) return 'Setup missing';
  const integration = getIntegration(provider);
  if (!integration) return 'Not connected';
  if (integration.status === 'connected') return integration.lastSyncedAt ? `Synced ${formatShortTime(integration.lastSyncedAt)}` : 'Connected';
  if (integration.status === 'connecting') return 'Waiting';
  if (integration.status === 'error') return 'Needs reconnect';
  return 'Not connected';
}

function providerBackendReady(provider: ConnectableIntegrationProvider) {
  const health = integrationHealth.value?.[provider];
  return health ? health.configured : true;
}

function providerSetupMessage(provider: ConnectableIntegrationProvider) {
  return integrationHealth.value?.[provider]?.message;
}

function providerLabel(provider: IntegrationProvider) {
  if (provider === 'telegram') return 'Telegram';
  if (provider === 'slack') return 'Slack';
  return 'Browser';
}

function confidenceLabel(value: number) {
  return `${Math.round(value * 100)}%`;
}

function statusLabel(status: TaskStatus) {
  if (status === 'done') return 'Done';
  if (status === 'paused') return 'Paused';
  return 'Open';
}

function formatShortTime(value: number) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function toDateKey(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

function startOfDay(value: number) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function flashSaved() {
  savedLabel.value = 'Saved';
  window.setTimeout(() => {
    savedLabel.value = '';
  }, 1200);
}

function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>, areaName: string) {
  if (
    areaName === 'local' &&
    (changes['goalden-state']?.newValue || changes['goalden-auth']?.newValue || changes['goalden-last-capture']?.newValue)
  ) {
    loadState();
  }
}

onMounted(() => {
  readPageFromUrl();
  loadState();
  chrome.storage.onChanged.addListener(handleStorageChange);
});

onUnmounted(() => {
  chrome.storage.onChanged.removeListener(handleStorageChange);
});
</script>

<template>
  <main class="dashboard-shell">
    <aside class="sidebar">
      <button class="brand-button" @click="go('reports')">
        <span class="brand-mark small" aria-hidden="true">
          <svg viewBox="0 0 64 64" fill="none">
            <path d="M31.8 2 36 25l21.8-9.5L40.4 31.8 62 36 39 40.1l9.5 21.7L32.2 44.5 28 62 24 39.2 2 48.7l17.3-16.5L2 28l22.7-4.1L15.3 2.2 31.8 19V2Z" fill="currentColor" />
          </svg>
        </span>
        <strong>Goalden</strong>
      </button>

      <div class="plan-card">
        <span>Plan</span>
        <strong>Demo</strong>
      </div>

      <button class="create-link" @click="go('tasks')">+ Create new task</button>

      <nav class="side-nav" aria-label="Goalden dashboard">
        <section v-for="section in navSections" :key="section.label">
          <p>{{ section.label }}</p>
          <button
            v-for="item in section.items"
            :key="item.page"
            :data-active="page === item.page"
            @click="go(item.page)"
          >
            <span>{{ item.mark }}</span>
            {{ item.label }}
          </button>
        </section>
      </nav>

      <div class="sidebar-footer">
        <button @click="saveSitePickingToggle(!(state?.aiSettings.sitePickingEnabled ?? false))">
          {{ state?.aiSettings.sitePickingEnabled ? 'Manual site picks' : 'AI site picks' }}
        </button>
      </div>
    </aside>

    <section class="dashboard-main">
      <header class="topbar">
        <div>
          <h1>Good day, <span>{{ userName }}</span></h1>
          <p>Goalden keeps the work visible before the feeds open.</p>
        </div>
        <div class="top-actions">
          <button @click="syncRemote" :disabled="isSyncing || !isSignedIn">{{ isSyncing ? 'Syncing' : 'Sync' }}</button>
          <button @click="go('integrations')">Integrations</button>
          <button @click="go('general')">Settings</button>
          <span class="avatar">{{ userName.slice(0, 1).toUpperCase() }}</span>
        </div>
      </header>

      <section v-if="!isSignedIn" class="auth-screen">
        <div class="auth-card">
          <p class="eyebrow">Account</p>
          <h2>{{ authMode === 'sign-in' ? 'Sign in to Goalden.' : 'Create your Goalden account.' }}</h2>
          <p>Tasks, settings, integrations, and progress sync to Supabase after sign in.</p>

          <div class="auth-tabs">
            <button :data-active="authMode === 'sign-in'" @click="authMode = 'sign-in'">Sign in</button>
            <button :data-active="authMode === 'sign-up'" @click="authMode = 'sign-up'">Create account</button>
          </div>

          <form class="auth-form" @submit.prevent="submitAuth">
            <input v-if="authMode === 'sign-up'" v-model="authForm.name" class="field" type="text" placeholder="Name" autocomplete="name" />
            <input v-model="authForm.email" class="field" type="email" placeholder="Email" autocomplete="email" />
            <input v-model="authForm.password" class="field" type="password" placeholder="Password" autocomplete="current-password" />
            <button class="button primary" :disabled="isAuthBusy || !authForm.email.trim() || !authForm.password">
              {{ isAuthBusy ? 'Working...' : authMode === 'sign-in' ? 'Sign in' : 'Create account' }}
            </button>
          </form>

          <p v-if="authMessage" class="notice">{{ authMessage }}</p>
          <p v-if="authError" class="error">{{ authError }}</p>
        </div>
      </section>

      <template v-else>
        <section v-if="page === 'reports'" class="page-stack">
          <div class="page-heading">
            <div>
              <p class="eyebrow">Productivity insights</p>
              <h2>Reports</h2>
            </div>
            <button class="share-button">Share stats</button>
          </div>

          <div class="insight-grid">
            <article v-for="card in insightCards" :key="card.label" class="insight-card">
              <span class="metric-icon">{{ card.label.slice(0, 1) }}</span>
              <p>{{ card.label }}</p>
              <strong>{{ card.value }}</strong>
              <small>{{ card.detail }}</small>
            </article>
          </div>

          <article class="report-card streak-card">
            <div class="streak-top">
              <div>
                <strong>{{ Math.max(1, completedTasks.length) }} day streak</strong>
                <p>Keep closing small promises. The blocker loop gets sharper with every accepted task.</p>
              </div>
              <div>
                <span>Total tasks done</span>
                <strong>{{ completedTasks.length }}</strong>
              </div>
            </div>
            <div class="heatmap" aria-label="Progress heatmap">
              <span
                v-for="day in heatmapDays"
                :key="day.key"
                :data-intensity="day.intensity"
                :title="`${day.key}: ${day.count} progress checks`"
              />
            </div>
            <div class="heatmap-legend">
              <span>Less</span>
              <i data-intensity="1" />
              <i data-intensity="2" />
              <i data-intensity="3" />
              <i data-intensity="4" />
              <span>More</span>
            </div>
          </article>

          <article class="report-card">
            <div class="card-title">
              <h3>Productivity metrics</h3>
              <span>Total time</span>
            </div>
            <div class="metric-rows">
              <div v-for="row in productivityRows" :key="row.label" class="metric-row" :data-tone="row.tone">
                <span>{{ row.label }}</span>
                <div><i :style="{ width: `${row.percent}%` }" /></div>
                <strong>{{ row.value }}</strong>
              </div>
            </div>
          </article>

          <article class="report-card pulse-card">
            <div class="pulse-ring" :style="{ '--score': `${pulseScore}%` }">
              <strong>{{ pulseScore }}</strong>
              <span>score</span>
            </div>
            <div class="pulse-columns">
              <div>
                <p>Productive</p>
                <strong>{{ totalFocusMinutes }}m</strong>
              </div>
              <div>
                <p>Distracting</p>
                <strong>{{ pendingCandidates.length }} open</strong>
              </div>
              <div>
                <p>Neutral</p>
                <strong>{{ openTasks.length }} tasks</strong>
              </div>
            </div>
          </article>

          <div class="two-column">
            <article class="report-card activity-card">
              <h3>Activity</h3>
              <div class="bar-chart">
                <div v-for="bar in weekBars" :key="bar.label">
                  <span :style="{ height: bar.height }" />
                  <small>{{ bar.label }}</small>
                </div>
              </div>
            </article>

            <article class="report-card sites-card">
              <h3>Most used sites</h3>
              <div v-for="site in siteUsage" :key="site.id" class="site-row">
                <div>
                  <strong>{{ site.host }}</strong>
                  <span>{{ site.enabled ? 'Gated' : 'Allowed' }}</span>
                </div>
                <small>{{ site.minutes }}m</small>
              </div>
            </article>
          </div>

          <article class="report-card">
            <h3>Completed tasks</h3>
            <div class="completed-list compact">
              <div v-for="task in completedTasks" :key="task.id">
                <strong>{{ task.title }}</strong>
                <span>{{ task.source }} · {{ task.deadline || 'No deadline' }}</span>
              </div>
              <p v-if="!completedTasks.length" class="empty">No completed tasks yet.</p>
            </div>
          </article>
        </section>

        <section v-else-if="page === 'integrations'" class="page-stack narrow-page">
          <div class="page-heading">
            <div>
              <p class="eyebrow">Task sources</p>
              <h2>Integrations</h2>
            </div>
            <button class="icon-button" :disabled="isCapturing" @click="scanCurrentPage">{{ isCapturing ? 'Scanning' : 'Scan page' }}</button>
          </div>

          <p v-if="integrationMessage" class="notice">{{ integrationMessage }}</p>
          <p v-if="integrationError" class="error">{{ integrationError }}</p>

          <section v-for="(cards, group) in groupedIntegrations" :key="group" class="integration-group">
            <p>{{ group }}</p>
            <article v-for="card in cards" :key="card.title" class="integration-tile">
              <div class="integration-badge">{{ card.title.slice(0, 1) }}</div>
              <div>
                <h3>{{ card.title }}</h3>
                <p>{{ card.copy }}</p>
                <small>{{ card.status }}</small>
                <small v-if="card.provider === 'telegram' && !providerBackendReady('telegram')" class="setup-warning">
                  {{ providerSetupMessage('telegram') }}
                </small>
                <small v-if="card.provider === 'slack' && !providerBackendReady('slack')" class="setup-warning">
                  {{ providerSetupMessage('slack') }}
                </small>
              </div>
              <div class="tile-actions">
                <button
                  v-if="card.provider === 'browser'"
                  class="button primary"
                  :disabled="isCapturing"
                  @click="scanCurrentPage"
                >
                  {{ isCapturing ? 'Scanning...' : 'Scan page' }}
                </button>
                <template v-else-if="card.provider === 'telegram' || card.provider === 'slack'">
                  <button
                    class="button primary"
                    :disabled="activeIntegration === card.provider || !providerBackendReady(card.provider)"
                    @click="connectIntegration(card.provider)"
                  >
                    {{ activeIntegration === card.provider ? 'Working...' : 'Connect' }}
                  </button>
                  <button
                    class="button ghost"
                    :disabled="activeIntegration === card.provider || !getIntegration(card.provider)"
                    @click="syncIntegration(card.provider)"
                  >
                    Sync
                  </button>
                </template>
                <button v-else class="button ghost" disabled>{{ card.action }}</button>
              </div>
            </article>
          </section>

          <article class="report-card">
            <div class="card-title">
              <h3>Found tasks</h3>
              <span>{{ pendingCandidates.length }} pending</span>
            </div>
            <div class="candidate-list">
              <article v-for="candidate in pendingCandidates" :key="candidate.id" class="candidate-card">
                <div>
                  <p>{{ providerLabel(candidate.provider) }} · {{ confidenceLabel(candidate.confidence) }}</p>
                  <h3>{{ candidate.title }}</h3>
                  <span>{{ candidate.nextStep }}</span>
                  <blockquote>{{ candidate.evidenceSnippet }}</blockquote>
                </div>
                <div class="candidate-actions">
                  <button class="button primary" @click="acceptCandidate(candidate.id, true)">Make active</button>
                  <button class="button ghost" @click="acceptCandidate(candidate.id, false)">Accept</button>
                  <button class="button ghost" @click="dismissCandidate(candidate.id)">Dismiss</button>
                </div>
              </article>
              <p v-if="!pendingCandidates.length" class="empty">No task candidates waiting right now.</p>
            </div>
          </article>
        </section>

        <section v-else-if="page === 'completed'" class="page-stack narrow-page">
          <div class="page-heading">
            <div>
              <p class="eyebrow">Closed promises</p>
              <h2>Completed Tasks</h2>
            </div>
            <div class="stats-line">
              <span>{{ completedTasks.length }} tasks</span>
              <span>{{ totalFocusMinutes }}m focus</span>
              <span>{{ avgTaskMinutes }}m avg</span>
            </div>
          </div>

          <div class="completed-list">
            <article v-for="task in completedTasks" :key="task.id" class="completed-row">
              <span class="done-dot" />
              <div>
                <h3>{{ task.title }}</h3>
                <p>{{ task.source }} · {{ task.deadline || 'No deadline' }} · {{ task.nextStep }}</p>
              </div>
              <button class="button ghost" @click="setStatus(task, 'open')">Reopen</button>
            </article>
            <p v-if="!completedTasks.length" class="empty">Finish one task and it lands here.</p>
          </div>
        </section>

        <section v-else-if="page === 'tasks'" class="page-stack narrow-page">
          <div class="page-heading">
            <div>
              <p class="eyebrow">Current work</p>
              <h2>My Tasks</h2>
            </div>
            <span>{{ completedTasks.length }}/{{ tasks.length }} done</span>
          </div>

          <article class="report-card task-composer">
            <input v-model="draftTask.title" class="field" type="text" placeholder="Task title" />
            <input v-model="draftTask.source" class="field" type="text" placeholder="Source" />
            <input v-model="draftTask.deadline" class="field" type="text" placeholder="Deadline" />
            <input v-model="draftTask.nextStep" class="field" type="text" placeholder="Next step" />
            <button class="button primary" :disabled="!draftTask.title.trim()" @click="createTask">Add task</button>
          </article>

          <article v-for="task in tasks" :key="task.id" class="task-tile" :data-active="task.id === activeTask?.id">
            <div>
              <p>{{ statusLabel(task.status) }} · {{ task.source }}</p>
              <h3>{{ task.title }}</h3>
              <span>{{ task.nextStep }}</span>
            </div>
            <div class="task-tile-actions">
              <button class="button ghost" @click="setActive(task.id)">Active</button>
              <button class="button ghost" @click="setStatus(task, task.status === 'done' ? 'open' : 'done')">
                {{ task.status === 'done' ? 'Reopen' : 'Done' }}
              </button>
              <button class="button ghost" @click="removeTask(task.id)">Delete</button>
            </div>
          </article>
        </section>

        <section v-else-if="page === 'general'" class="page-stack narrow-page">
          <div class="page-heading">
            <div>
              <p class="eyebrow">Settings</p>
              <h2>General</h2>
            </div>
            <button class="button primary" :disabled="isSaving" @click="saveSettings">{{ isSaving ? 'Saving...' : savedLabel || 'Save' }}</button>
          </div>

          <article class="report-card settings-card">
            <label>
              Break length
              <input v-model.number="breakMinutes" class="field" type="number" min="5" max="90" />
            </label>
            <label>
              AI model
              <input v-model="aiModelDraft" class="field" type="text" />
            </label>
            <button class="button primary" :disabled="isAiSaving" @click="saveAiModel">Save model</button>
            <p v-if="aiMessage" class="notice">{{ aiMessage }}</p>
            <p v-if="aiError" class="error">{{ aiError }}</p>
            <button class="button ghost" :disabled="isAuthBusy" @click="signOutUser">Sign out</button>
          </article>
        </section>

        <section v-else-if="page === 'focus'" class="page-stack narrow-page">
          <div class="page-heading">
            <div>
              <p class="eyebrow">Blocker loop</p>
              <h2>Focus Mode</h2>
            </div>
            <button class="button primary" :disabled="isAiSaving" @click="letAiPickSites">Let AI pick</button>
          </div>

          <article class="report-card focus-card">
            <div class="toggle-row">
              <div>
                <strong>AI page decisions</strong>
                <p>Goalden judges whether a page is distracting for your current task.</p>
              </div>
              <button class="toggle" :data-active="state?.aiSettings.enabled" @click="saveAiToggle(!(state?.aiSettings.enabled ?? false))" />
            </div>
            <div class="toggle-row">
              <div>
                <strong>AI site picking</strong>
                <p>Goalden can pick which feed sites to gate based on your task list.</p>
              </div>
              <button class="toggle" :data-active="state?.aiSettings.sitePickingEnabled" @click="saveSitePickingToggle(!(state?.aiSettings.sitePickingEnabled ?? false))" />
            </div>

            <div class="site-grid">
              <button v-for="site in SITES" :key="site.id" :data-active="enabledSet.has(site.id)" @click="toggleSite(site.id)">
                <span class="site-dot" />
                {{ site.label }}
              </button>
            </div>
          </article>
        </section>

        <section v-else class="page-stack narrow-page">
          <div class="page-heading">
            <div>
              <p class="eyebrow">Habits</p>
              <h2>Routines</h2>
            </div>
          </div>
          <article class="report-card">
            <h3>Demo routine</h3>
            <p class="muted">Finish one concrete task before opening a feed. Earn {{ breakMinutes }} minutes, then the gate returns.</p>
          </article>
        </section>
      </template>
    </section>
  </main>
</template>

<style scoped>
.dashboard-shell {
  display: grid;
  min-height: 100vh;
  grid-template-columns: 256px 1fr;
  background: #f7f7f4;
  color: #26251e;
}

.sidebar {
  position: sticky;
  top: 0;
  display: flex;
  height: 100vh;
  flex-direction: column;
  border-right: 1px solid #dfddd6;
  background: #f7f7f4;
  padding: 28px 16px 18px;
}

.brand-button,
.create-link,
.side-nav button,
.sidebar-footer button,
.top-actions button,
.icon-button,
.share-button {
  border: 0;
  background: transparent;
  color: inherit;
}

.brand-button {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  width: fit-content;
  margin-bottom: 24px;
  font-size: 18px;
  font-weight: 800;
}

.brand-mark.small {
  width: 27px;
  height: 27px;
}

.plan-card {
  display: flex;
  gap: 5px;
  align-items: center;
  border: 1px solid #dfddd6;
  border-radius: 12px;
  background: #f0efeb;
  padding: 14px 16px;
  color: #6f6a61;
  font-size: 13px;
}

.plan-card strong {
  color: #b77b12;
}

.create-link {
  width: 100%;
  margin: 16px 0 22px;
  padding: 10px 8px;
  text-align: left;
  color: #57534a;
  font-weight: 700;
}

.side-nav {
  display: grid;
  gap: 24px;
}

.side-nav section {
  display: grid;
  gap: 6px;
}

.side-nav p {
  margin: 0 0 4px;
  padding-left: 8px;
  color: #777168;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.side-nav button {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  border-radius: 10px;
  padding: 0 10px;
  color: #4d4941;
  font-weight: 700;
  text-align: left;
}

.side-nav button span {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border: 1px solid #d6d2c7;
  border-radius: 5px;
  font-size: 10px;
}

.side-nav button[data-active='true'] {
  background: #e6e5e0;
  color: #11110f;
}

.sidebar-footer {
  margin-top: auto;
  border-top: 1px solid #dfddd6;
  padding-top: 14px;
}

.sidebar-footer button {
  color: #6b655c;
  font-weight: 700;
}

.dashboard-main {
  min-width: 0;
  padding: 30px 36px 64px;
}

.topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin: 0 auto 46px;
  max-width: 1280px;
}

.topbar h1 {
  margin: 0;
  font-size: clamp(24px, 3vw, 32px);
  letter-spacing: 0;
}

.topbar h1 span {
  color: #9c6d19;
}

.topbar p {
  margin: 8px 0 0;
  color: #6f6a61;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.top-actions button,
.icon-button,
.share-button {
  min-height: 34px;
  border: 1px solid #dfddd6;
  border-radius: 999px;
  background: #f0efeb;
  padding: 0 14px;
  font-weight: 700;
}

.avatar {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid #c79b3c;
  border-radius: 999px;
  color: #8d610e;
  font-weight: 800;
}

.auth-screen,
.page-stack {
  max-width: 1280px;
  margin: 0 auto;
}

.narrow-page {
  max-width: 900px;
}

.auth-card,
.report-card,
.task-tile,
.integration-tile,
.insight-card {
  border: 1px solid #dfddd6;
  border-radius: 14px;
  background: #fffdfa;
  box-shadow: 0 12px 30px rgb(38 37 30 / 4%);
}

.auth-card {
  max-width: 520px;
  padding: 28px;
}

.auth-card h2,
.page-heading h2,
.report-card h3,
.task-tile h3,
.integration-tile h3 {
  margin: 0;
  letter-spacing: 0;
}

.auth-card p {
  color: #6f6a61;
}

.auth-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 18px 0;
}

.auth-tabs button {
  min-height: 38px;
  border: 1px solid #dfddd6;
  border-radius: 10px;
  background: #f0efeb;
  font-weight: 800;
}

.auth-tabs button[data-active='true'] {
  background: #26251e;
  color: #fffdfa;
}

.auth-form,
.task-composer {
  display: grid;
  gap: 10px;
}

.notice,
.error,
.empty {
  margin: 12px 0 0;
  color: #6f6a61;
  font-size: 14px;
}

.error,
.setup-warning {
  color: #9b2f2f;
}

.page-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 26px;
}

.page-heading h2 {
  margin-top: 6px;
  font-size: 30px;
}

.stats-line {
  display: flex;
  gap: 18px;
  color: #6f6a61;
  font-weight: 700;
}

.insight-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
}

.insight-card {
  min-height: 150px;
  padding: 20px;
}

.metric-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 12px;
  background: #f0efeb;
  color: #9c6d19;
  font-weight: 900;
}

.insight-card p,
.insight-card small,
.card-title span,
.integration-tile p,
.integration-tile small,
.task-tile p,
.task-tile span,
.completed-row p {
  color: #6f6a61;
}

.insight-card p {
  margin: 16px 0 4px;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.insight-card strong {
  display: block;
  font-size: 25px;
}

.report-card {
  margin-top: 32px;
  padding: 24px;
}

.streak-card {
  padding: 28px;
}

.streak-top,
.card-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.streak-top strong {
  font-size: 24px;
}

.streak-top p {
  margin: 6px 0 0;
  color: #6f6a61;
}

.streak-top span {
  color: #8c8378;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.heatmap {
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(7, 13px);
  gap: 4px;
  overflow: hidden;
  margin-top: 28px;
  border: 1px solid #ebe8df;
  border-radius: 12px;
  padding: 18px;
}

.heatmap span,
.heatmap-legend i {
  width: 13px;
  height: 13px;
  border-radius: 3px;
  background: #ece8dd;
}

.heatmap span[data-intensity='1'],
.heatmap-legend i[data-intensity='1'] {
  background: #e0d3ae;
}

.heatmap span[data-intensity='2'],
.heatmap-legend i[data-intensity='2'] {
  background: #d2b86c;
}

.heatmap span[data-intensity='3'],
.heatmap-legend i[data-intensity='3'] {
  background: #bf9331;
}

.heatmap span[data-intensity='4'],
.heatmap-legend i[data-intensity='4'] {
  background: #8e6518;
}

.heatmap-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  margin-top: 14px;
  color: #6f6a61;
  font-size: 12px;
}

.metric-rows {
  display: grid;
  gap: 18px;
  margin-top: 24px;
}

.metric-row {
  display: grid;
  grid-template-columns: 120px 1fr 70px;
  align-items: center;
  gap: 16px;
  font-weight: 800;
}

.metric-row div {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #ebe8df;
}

.metric-row i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #c79b3c;
}

.metric-row[data-tone='blocked'] i {
  background: #26251e;
}

.metric-row[data-tone='break'] i {
  background: #8c8378;
}

.metric-row[data-tone='review'] i {
  background: #a9563e;
}

.pulse-card {
  display: grid;
  grid-template-columns: 150px 1fr;
  align-items: center;
  gap: 34px;
}

.pulse-ring {
  display: grid;
  width: 124px;
  height: 124px;
  place-items: center;
  border-radius: 999px;
  background: conic-gradient(#c79b3c var(--score), #ebe8df 0);
  color: #26251e;
  position: relative;
}

.pulse-ring::after {
  position: absolute;
  inset: 13px;
  border-radius: inherit;
  background: #fffdfa;
  content: '';
}

.pulse-ring strong,
.pulse-ring span {
  position: relative;
  z-index: 1;
}

.pulse-ring strong {
  align-self: end;
  font-size: 30px;
}

.pulse-ring span {
  align-self: start;
  color: #6f6a61;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.pulse-columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 22px;
}

.pulse-columns p {
  color: #6f6a61;
  font-weight: 800;
}

.pulse-columns strong {
  display: block;
  border-bottom: 6px solid #c79b3c;
  padding-bottom: 8px;
  font-size: 28px;
}

.two-column {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
  gap: 32px;
}

.activity-card {
  min-height: 320px;
}

.bar-chart {
  display: grid;
  height: 230px;
  grid-template-columns: repeat(7, 1fr);
  align-items: end;
  gap: 10px;
  margin-top: 24px;
}

.bar-chart div {
  display: grid;
  height: 100%;
  align-items: end;
  gap: 8px;
}

.bar-chart span {
  min-height: 8px;
  border-radius: 10px 10px 0 0;
  background: #c79b3c;
}

.bar-chart small {
  color: #8c8378;
  text-align: center;
}

.site-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #ebe8df;
  padding: 14px 0;
}

.site-row div {
  display: grid;
  gap: 4px;
}

.site-row span {
  width: fit-content;
  border-radius: 999px;
  background: #f0efeb;
  padding: 3px 8px;
  color: #6f6a61;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.completed-list {
  display: grid;
  gap: 12px;
}

.completed-list.compact div,
.completed-row {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid #ebe8df;
  border-radius: 12px;
  padding: 14px;
}

.completed-list.compact div {
  justify-content: space-between;
}

.done-dot {
  width: 11px;
  height: 11px;
  border-radius: 999px;
  background: #c79b3c;
}

.completed-row div {
  flex: 1;
}

.integration-group {
  display: grid;
  gap: 12px;
  margin-top: 24px;
}

.integration-group > p {
  margin: 0;
  color: #6f6a61;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.integration-tile {
  display: grid;
  grid-template-columns: 46px 1fr auto;
  align-items: center;
  gap: 16px;
  padding: 14px;
}

.integration-badge {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 11px;
  background: #f0efeb;
  color: #9c6d19;
  font-weight: 900;
}

.tile-actions,
.candidate-actions,
.task-tile-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.candidate-list {
  display: grid;
  gap: 12px;
}

.candidate-card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  border: 1px solid #ebe8df;
  border-radius: 12px;
  padding: 16px;
}

.candidate-card p {
  margin: 0 0 6px;
  color: #8c8378;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.candidate-card blockquote {
  margin: 12px 0 0;
  border-left: 3px solid #d5be7d;
  padding-left: 12px;
  color: #6f6a61;
}

.task-composer {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.task-composer .button {
  grid-column: 1 / -1;
}

.task-tile {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
  padding: 18px;
}

.task-tile[data-active='true'] {
  border-color: #c79b3c;
  background: #fff8df;
}

.settings-card,
.focus-card {
  display: grid;
  gap: 16px;
}

.settings-card label {
  display: grid;
  gap: 8px;
  font-weight: 800;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border-bottom: 1px solid #ebe8df;
  padding-bottom: 16px;
}

.toggle-row p {
  margin: 6px 0 0;
  color: #6f6a61;
}

.site-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.site-grid button {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  border: 1px solid #dfddd6;
  border-radius: 12px;
  background: #fffdfa;
  padding: 0 14px;
  font-weight: 800;
}

.site-grid button[data-active='true'] {
  border-color: #c79b3c;
  background: #fff8df;
}

.button {
  min-height: 38px;
  border-radius: 10px;
  font-size: 13px;
}

.button.primary {
  border-color: #26251e;
  background: #26251e;
  color: #fffdfa;
}

.button.ghost {
  background: #f0efeb;
}

.field {
  min-height: 44px;
  border-radius: 12px;
  background: #fffdfa;
}

.toggle {
  flex: 0 0 auto;
}

@media (max-width: 1100px) {
  .dashboard-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: static;
    height: auto;
  }

  .insight-grid,
  .two-column {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 720px) {
  .dashboard-main {
    padding: 22px 16px 48px;
  }

  .topbar,
  .page-heading,
  .pulse-card,
  .integration-tile,
  .candidate-card,
  .task-tile {
    grid-template-columns: 1fr;
    display: grid;
  }

  .top-actions,
  .tile-actions,
  .candidate-actions,
  .task-tile-actions {
    justify-content: flex-start;
  }

  .insight-grid,
  .two-column,
  .pulse-columns,
  .task-composer,
  .site-grid {
    grid-template-columns: 1fr;
  }
}
</style>
