<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getUnlockLabel } from '@/shared/state';
import { sendMessage } from '@/shared/messaging';
import { SITES } from '@/shared/sites';
import type {
  GoaldenIntegration,
  GoaldenIntegrationHealth,
  GoaldenTask,
  GoaldenTaskCandidate,
  GoaldenViewState,
  ConnectableIntegrationProvider,
  IntegrationProvider,
  SiteId,
  TaskDraft,
  TaskStatus
} from '@/shared/types';

const state = ref<GoaldenViewState | null>(null);
const enabledSiteIds = ref<SiteId[]>([]);
const breakMinutes = ref(15);
const selectedSiteId = ref<SiteId>('reddit');
const progress = ref('');
const savedLabel = ref('');
const authMessage = ref('');
const authError = ref('');
const isSaving = ref(false);
const isSubmitting = ref(false);
const isAuthBusy = ref(false);
const isSyncing = ref(false);
const isAiSaving = ref(false);
const isCapturing = ref(false);
const showNewTask = ref(false);
const authMode = ref<'sign-in' | 'sign-up'>('sign-in');
const aiModelDraft = ref('openai/gpt-oss-120b');
const aiMessage = ref('');
const aiError = ref('');
const integrations = ref<GoaldenIntegration[]>([]);
const taskCandidates = ref<GoaldenTaskCandidate[]>([]);
const integrationHealth = ref<GoaldenIntegrationHealth | null>(null);
const integrationMessage = ref('');
const integrationError = ref('');
type ConnectedProvider = ConnectableIntegrationProvider;
const activeIntegration = ref<ConnectedProvider | ''>('');

const authForm = ref({
  name: '',
  email: '',
  password: ''
});

const activeEditor = ref<TaskDraft>({
  title: '',
  source: '',
  deadline: '',
  nextStep: ''
});

const draftTask = ref<TaskDraft>({
  title: '',
  source: 'Manual',
  deadline: '',
  nextStep: ''
});

const enabledSet = computed(() => new Set(enabledSiteIds.value));
const tasks = computed(() => state.value?.tasks ?? []);
const doneTasks = computed(() => tasks.value.filter(task => task.status === 'done').length);
const totalTasks = computed(() => Math.max(tasks.value.length, 1));
const taskProgressPercent = computed(() => Math.round((doneTasks.value / totalTasks.value) * 100));
const estimatedMinutes = computed(() => Math.max(1, tasks.value.filter(task => task.status !== 'done').length * 15));
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
const selectedSite = computed(() => SITES.find(site => site.id === selectedSiteId.value) ?? SITES[0]!);
const wordCount = computed(() => progress.value.trim().split(/\s+/).filter(Boolean).length);
const canSubmit = computed(() => Boolean(activeTask.value) && wordCount.value >= 5 && !isSubmitting.value);
const latestProgress = computed(() => state.value?.progressLog?.[0]);
const auth = computed(() => state.value?.auth);
const aiSettings = computed(() => state.value?.aiSettings);
const isSignedIn = computed(() => auth.value?.status === 'signed-in');
const authTitle = computed(() =>
  authMode.value === 'sign-in' ? 'Sign in to use Goalden.' : 'Create your Goalden account.'
);
const authCopy = computed(() =>
  authMode.value === 'sign-in'
    ? 'Goalden needs an account before it starts gating feeds. Tasks, settings, breaks, and progress sync to Supabase.'
    : 'Create an account first. After that, Goalden can block feeds, judge pages, and save your progress.'
);
const integrationCards = computed<Array<{ provider: ConnectedProvider; title: string; copy: string }>>(() => [
  {
    provider: 'telegram',
    title: 'Telegram',
    copy: 'Send or forward work messages to the Goalden bot.'
  },
  {
    provider: 'slack',
    title: 'Slack',
    copy: 'Connect a workspace and sync recent accessible conversations.'
  }
]);
const pendingCandidates = computed(() => taskCandidates.value.filter(candidate => candidate.status === 'new'));
const setupRows = computed(() => [
  {
    label: 'Telegram bot',
    status: integrationHealth.value?.telegram
  },
  {
    label: 'Slack OAuth',
    status: integrationHealth.value?.slack
  },
  {
    label: 'Task AI',
    status: integrationHealth.value?.groq
  }
]);

function syncLocal(nextState: GoaldenViewState, replaceIntegrationData = false) {
  state.value = nextState;
  enabledSiteIds.value = [...nextState.enabledSiteIds];
  breakMinutes.value = nextState.breakMinutes;
  aiModelDraft.value = nextState.aiSettings.model;
  if (replaceIntegrationData || nextState.integrations.length) integrations.value = nextState.integrations;
  if (replaceIntegrationData || nextState.taskCandidates.length) taskCandidates.value = nextState.taskCandidates;
  if (replaceIntegrationData || nextState.integrationHealth) integrationHealth.value = nextState.integrationHealth ?? null;
  syncActiveEditor();
}

function syncActiveEditor() {
  const task = activeTask.value;
  if (!task) return;
  activeEditor.value = {
    title: task.title,
    source: task.source,
    deadline: task.deadline,
    nextStep: task.nextStep
  };
}

async function loadState() {
  syncLocal(await sendMessage<GoaldenViewState>({ type: 'get-state' }));
  if (isSignedIn.value) {
    await loadIntegrationData();
  }
}

async function loadIntegrationData() {
  if (!isSignedIn.value) return;
  try {
    syncLocal(await sendMessage<GoaldenViewState>({ type: 'get-integrations' }), true);
  } catch (error) {
    integrationError.value = error instanceof Error ? error.message : 'Could not load integrations.';
  }
}

async function saveSettings() {
  isSaving.value = true;
  syncLocal(
    await sendMessage<GoaldenViewState>({
      type: 'save-settings',
      enabledSiteIds: enabledSiteIds.value,
      breakMinutes: breakMinutes.value
    })
  );
  isSaving.value = false;
  flashSaved();
}

async function saveAiSettings(patch: NonNullable<GoaldenViewState['aiSettings']>) {
  isAiSaving.value = true;
  aiError.value = '';
  try {
    syncLocal(
      await sendMessage<GoaldenViewState>({
        type: 'save-ai-settings',
        aiSettings: patch
      })
    );
    aiMessage.value = 'AI settings saved.';
    flashAiMessage();
  } catch (error) {
    aiError.value = error instanceof Error ? error.message : 'AI settings did not save.';
  } finally {
    isAiSaving.value = false;
  }
}

async function saveAiToggle(enabled: boolean) {
  if (!aiSettings.value) return;
  await saveAiSettings({
    ...aiSettings.value,
    enabled
  });
}

async function saveSitePickingToggle(sitePickingEnabled: boolean) {
  if (!aiSettings.value) return;
  await saveAiSettings({
    ...aiSettings.value,
    sitePickingEnabled
  });
}

async function saveAiModel() {
  if (!aiSettings.value) return;
  await saveAiSettings({
    ...aiSettings.value,
    model: aiModelDraft.value
  });
}

async function letAiPickSites() {
  isAiSaving.value = true;
  aiError.value = '';
  try {
    syncLocal(await sendMessage<GoaldenViewState>({ type: 'pick-sites-with-ai' }));
    aiMessage.value = 'Goalden picked the feeds to block.';
    flashAiMessage();
  } catch (error) {
    aiError.value = error instanceof Error ? error.message : 'Goalden could not pick sites.';
  } finally {
    isAiSaving.value = false;
  }
}

function getIntegration(provider: ConnectedProvider) {
  return integrations.value.find(integration => integration.provider === provider);
}

function integrationStatus(provider: ConnectedProvider) {
  return getIntegration(provider)?.status ?? 'disconnected';
}

function integrationStatusText(provider: ConnectedProvider) {
  if (!providerBackendReady(provider)) return 'Setup missing';
  const integration = getIntegration(provider);
  if (!integration) return 'Not connected';
  if (integration.status === 'connected') return integration.lastSyncedAt ? `Synced ${lastSyncLabel(integration.lastSyncedAt)}` : 'Connected';
  if (integration.status === 'connecting') return 'Waiting';
  if (integration.status === 'error') return 'Needs reconnect';
  return 'Not connected';
}

function providerLabel(provider: IntegrationProvider) {
  if (provider === 'telegram') return 'Telegram';
  if (provider === 'slack') return 'Slack';
  return 'Browser';
}

function providerBackendReady(provider: ConnectedProvider) {
  const status = integrationHealth.value?.[provider];
  return status ? status.configured : true;
}

function providerSetupMessage(provider: ConnectedProvider) {
  return integrationHealth.value?.[provider]?.message;
}

function lastSyncLabel(value: number) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function confidenceLabel(value: number) {
  return `${Math.round(value * 100)}%`;
}

async function scanCurrentPage() {
  isCapturing.value = true;
  integrationError.value = '';
  integrationMessage.value = '';
  try {
    syncLocal(await sendMessage<GoaldenViewState>({ type: 'scan-current-page' }), true);
    integrationMessage.value = 'Goalden scanned this page. Review the candidates below.';
  } catch (error) {
    integrationError.value = error instanceof Error ? error.message : 'Goalden could not scan this page.';
  } finally {
    isCapturing.value = false;
  }
}

async function connectIntegration(provider: ConnectedProvider) {
  activeIntegration.value = provider;
  integrationError.value = '';
  integrationMessage.value = '';
  try {
    syncLocal(
      await sendMessage<GoaldenViewState>({
        type: 'start-integration-connect',
        provider
      }),
      true
    );
    integrationMessage.value =
      provider === 'telegram'
        ? 'Telegram opened. Press Start in the bot, then send or forward work messages.'
        : 'Slack connected. Run Sync now to pull task candidates.';
  } catch (error) {
    integrationError.value = error instanceof Error ? error.message : `${providerLabel(provider)} did not connect.`;
  } finally {
    activeIntegration.value = '';
  }
}

async function syncIntegration(provider: ConnectedProvider) {
  activeIntegration.value = provider;
  integrationError.value = '';
  integrationMessage.value = '';
  try {
    syncLocal(
      await sendMessage<GoaldenViewState>({
        type: 'sync-integration',
        provider
      }),
      true
    );
    integrationMessage.value = `${providerLabel(provider)} sync finished.`;
  } catch (error) {
    integrationError.value = error instanceof Error ? error.message : `${providerLabel(provider)} sync failed.`;
  } finally {
    activeIntegration.value = '';
  }
}

async function acceptCandidate(candidateId: string) {
  integrationError.value = '';
  try {
    syncLocal(
      await sendMessage<GoaldenViewState>({
        type: 'accept-task-candidate',
        candidateId,
        activate: true
      }),
      true
    );
    integrationMessage.value = 'Task added and made active.';
  } catch (error) {
    integrationError.value = error instanceof Error ? error.message : 'Could not add this task.';
  }
}

async function dismissCandidate(candidateId: string) {
  integrationError.value = '';
  try {
    syncLocal(
      await sendMessage<GoaldenViewState>({
        type: 'dismiss-task-candidate',
        candidateId
      }),
      true
    );
  } catch (error) {
    integrationError.value = error instanceof Error ? error.message : 'Could not dismiss this task.';
  }
}

async function toggleSite(siteId: SiteId) {
  const next = new Set(enabledSiteIds.value);
  if (next.has(siteId)) next.delete(siteId);
  else next.add(siteId);
  enabledSiteIds.value = [...next];
  await saveSettings();
}

async function createTask() {
  if (!draftTask.value.title.trim()) return;
  syncLocal(
    await sendMessage<GoaldenViewState>({
      type: 'create-task',
      task: draftTask.value,
      activate: true
    })
  );
  draftTask.value = {
    title: '',
    source: 'Manual',
    deadline: '',
    nextStep: ''
  };
  showNewTask.value = false;
  flashSaved();
}

async function saveActiveTask() {
  const task = activeTask.value;
  if (!task || !activeEditor.value.title.trim()) return;
  syncLocal(
    await sendMessage<GoaldenViewState>({
      type: 'update-task',
      taskId: task.id,
      patch: activeEditor.value
    })
  );
  flashSaved();
}

async function setActive(taskId: string) {
  syncLocal(await sendMessage<GoaldenViewState>({ type: 'set-active-task', taskId }));
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

async function removeTask(taskId: string) {
  syncLocal(await sendMessage<GoaldenViewState>({ type: 'delete-task', taskId }));
}

async function submitProgress() {
  if (!canSubmit.value || !activeTask.value) return;
  isSubmitting.value = true;
  syncLocal(
    await sendMessage<GoaldenViewState>({
      type: 'approve-progress',
      siteId: selectedSiteId.value,
      progress: progress.value,
      taskId: activeTask.value.id
    })
  );
  progress.value = '';
  isSubmitting.value = false;
}

async function submitAuth() {
  if (!authForm.value.email.trim() || !authForm.value.password) return;
  isAuthBusy.value = true;
  authError.value = '';
  authMessage.value = '';

  try {
    const nextState =
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
    syncLocal(nextState);
    if (nextState.auth.status === 'signed-in') await loadIntegrationData();
    authMessage.value =
      nextState.auth.status === 'pending-confirmation'
        ? 'Check your email, then come back and sign in.'
        : 'Signed in. Goalden is syncing now.';
    authForm.value.password = '';
  } catch (error) {
    authError.value = error instanceof Error ? error.message : 'Sign in failed.';
  } finally {
    isAuthBusy.value = false;
  }
}

async function signOutUser() {
  isAuthBusy.value = true;
  authError.value = '';
  authMessage.value = '';
  try {
    syncLocal(await sendMessage<GoaldenViewState>({ type: 'auth-sign-out' }));
  } finally {
    isAuthBusy.value = false;
  }
}

async function syncRemote() {
  isSyncing.value = true;
  authError.value = '';
  try {
    syncLocal(await sendMessage<GoaldenViewState>({ type: 'sync-remote' }));
    authMessage.value = 'Synced.';
  } catch (error) {
    authError.value = error instanceof Error ? error.message : 'Sync failed.';
  } finally {
    isSyncing.value = false;
  }
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

function flashSaved() {
  savedLabel.value = 'Saved';
  window.setTimeout(() => {
    savedLabel.value = '';
  }, 1200);
}

function flashAiMessage() {
  window.setTimeout(() => {
    aiMessage.value = '';
  }, 1800);
}

function statusLabel(status: TaskStatus) {
  if (status === 'done') return 'done';
  if (status === 'paused') return 'paused';
  return 'open';
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
  loadState();
  chrome.storage.onChanged.addListener(handleStorageChange);
});

onUnmounted(() => {
  chrome.storage.onChanged.removeListener(handleStorageChange);
});
</script>

<template>
  <main class="sidepanel-shell">
    <header class="panel-header">
      <div class="brand-line">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 64 64" fill="none">
            <path d="M31.8 2 36 25l21.8-9.5L40.4 31.8 62 36 39 40.1l9.5 21.7L32.2 44.5 28 62 24 39.2 2 48.7l17.3-16.5L2 28l22.7-4.1L15.3 2.2 31.8 19V2Z" fill="currentColor" />
          </svg>
        </span>
        <div>
          <strong>Goalden</strong>
          <p>{{ isSignedIn ? (isSaving ? 'Saving...' : 'Focus loop active') : 'Account required' }}</p>
        </div>
      </div>
      <button v-if="isSignedIn" class="text-button" @click="openOptions">Settings</button>
    </header>

    <section class="account-card" :data-state="auth?.status || 'signed-out'">
      <template v-if="isSignedIn">
        <div class="section-head">
          <p class="eyebrow">Account</p>
          <span>Signed in</span>
        </div>
        <h2>{{ auth?.user?.email }}</h2>
        <p>
          Goalden saves tasks, settings, breaks, and progress to Supabase. Local changes still work if your connection drops.
        </p>
        <div class="account-meta">
          <span v-if="auth?.lastSyncedAt">Last sync {{ new Date(auth.lastSyncedAt).toLocaleTimeString() }}</span>
          <span v-else>Waiting for first sync</span>
          <span v-if="auth?.syncError" class="sync-error">{{ auth.syncError }}</span>
        </div>
        <div class="account-actions">
          <button class="button primary" :disabled="isSyncing" @click="syncRemote">
            {{ isSyncing ? 'Syncing...' : 'Sync now' }}
          </button>
          <button class="button ghost" :disabled="isAuthBusy" @click="signOutUser">Sign out</button>
        </div>
      </template>

      <template v-else>
        <div class="section-head">
          <p class="eyebrow">Account</p>
          <span>{{ auth?.status === 'pending-confirmation' ? 'Check email' : 'Required' }}</span>
        </div>
        <h2>{{ authTitle }}</h2>
        <p>{{ authCopy }}</p>

        <div class="auth-tabs" aria-label="Authentication mode">
          <button :data-active="authMode === 'sign-in'" @click="authMode = 'sign-in'">Sign in</button>
          <button :data-active="authMode === 'sign-up'" @click="authMode = 'sign-up'">Create account</button>
        </div>

        <form class="auth-form" @submit.prevent="submitAuth">
          <input
            v-if="authMode === 'sign-up'"
            v-model="authForm.name"
            class="field compact-field"
            type="text"
            autocomplete="name"
            placeholder="Name"
          />
          <input
            v-model="authForm.email"
            class="field compact-field"
            type="email"
            autocomplete="email"
            placeholder="Email"
          />
          <input
            v-model="authForm.password"
            class="field compact-field"
            type="password"
            autocomplete="current-password"
            placeholder="Password"
          />
          <button class="button primary full-width" :disabled="isAuthBusy || !authForm.email.trim() || !authForm.password">
            {{ isAuthBusy ? 'Working...' : authMode === 'sign-in' ? 'Sign in' : 'Create account' }}
          </button>
        </form>
      </template>

      <p v-if="authMessage" class="auth-note">{{ authMessage }}</p>
      <p v-if="authError || auth?.syncError" class="auth-error">{{ authError || auth?.syncError }}</p>
    </section>

    <section v-if="!isSignedIn" class="locked-card">
      <p class="eyebrow">Before the first block</p>
      <h1>Make the account first.</h1>
      <p>
        The demo uses your account to keep tasks, AI settings, feed decisions, and progress tied to one user.
        After sign in, the rest of the panel opens.
      </p>
    </section>

    <template v-if="isSignedIn">
      <section class="workspace-card">
        <div class="workspace-topline">
          <div>
            <p class="eyebrow">My tasks</p>
            <h1>My Tasks</h1>
          </div>
          <span class="user-chip">{{ auth?.user?.email?.slice(0, 1).toUpperCase() }}</span>
        </div>

        <div class="workspace-meta">
          <span>Est: {{ estimatedMinutes }}min</span>
          <span>{{ doneTasks }}/{{ tasks.length }} Done</span>
        </div>
        <div class="progress-track" aria-label="Task progress">
          <span :style="{ width: `${taskProgressPercent}%` }" />
        </div>

        <div class="task-list workspace-list">
          <article v-for="task in tasks" :key="task.id" class="task-row" :data-active="task.id === state?.activeTaskId">
            <div class="task-main">
              <button class="task-dot" :data-done="task.status === 'done'" @click="setStatus(task, task.status === 'done' ? 'open' : 'done')" />
              <div>
                <div class="task-title">
                  <strong>{{ task.title }}</strong>
                  <span :data-status="task.status">{{ statusLabel(task.status) }}</span>
                </div>
                <p>{{ task.nextStep }}</p>
                <small>{{ task.source }} · {{ task.deadline || 'No deadline' }}</small>
              </div>
            </div>
            <div class="task-actions">
              <button class="mini-button" @click="setActive(task.id)">Active</button>
              <button class="mini-button" @click="setStatus(task, task.status === 'paused' ? 'open' : 'paused')">
                {{ task.status === 'paused' ? 'Resume' : 'Pause' }}
              </button>
              <button class="mini-button danger" @click="removeTask(task.id)">Delete</button>
            </div>
          </article>
        </div>

        <button class="add-task-button" @click="showNewTask = !showNewTask">
          {{ showNewTask ? 'Close' : '+ Add task' }}
        </button>

        <div v-if="showNewTask" class="new-task">
          <input v-model="draftTask.title" class="field compact-field" type="text" placeholder="Task title" />
          <input v-model="draftTask.source" class="field compact-field" type="text" placeholder="Source" />
          <input v-model="draftTask.deadline" class="field compact-field" type="text" placeholder="Deadline" />
          <input v-model="draftTask.nextStep" class="field compact-field" type="text" placeholder="Next step" />
          <button class="button primary full-width" :disabled="!draftTask.title.trim()" @click="createTask">
            Add task
          </button>
        </div>
      </section>

      <section class="coach-card">
        <div class="coach-transcript">
          <p class="assistant-bubble">
            I am here to keep your promises visible. Tell me what moved, or scan the page for tasks.
          </p>
          <p v-if="latestProgress" class="user-bubble">
            {{ latestProgress.taskTitle ? `${latestProgress.taskTitle}: ` : '' }}{{ latestProgress.text }}
          </p>
        </div>

        <div class="site-tabs compact-tabs">
          <button
            v-for="site in SITES"
            :key="site.id"
            :data-active="selectedSiteId === site.id"
            @click="selectedSiteId = site.id"
          >
            {{ site.label }}
          </button>
        </div>

        <div class="coach-input-row">
          <textarea
            v-model="progress"
            class="field progress-field"
            rows="3"
            placeholder="Ask anything, or write what you finished..."
          />
          <button class="send-button" :disabled="!canSubmit" @click="submitProgress">
            {{ isSubmitting ? '...' : '↑' }}
          </button>
        </div>
        <p class="hint">Minimum 5 words. Approved progress earns {{ breakMinutes }} minutes.</p>
      </section>

      <section class="panel-section integrations-card">
        <div class="section-head">
          <p class="eyebrow">Find tasks</p>
          <span>{{ pendingCandidates.length }} found</span>
        </div>

        <div class="capture-card">
          <div>
            <strong>Universal capture</strong>
            <p>Scan this page, or highlight any message and right-click Send selected text to Goalden.</p>
          </div>
          <button class="button primary" :disabled="isCapturing" @click="scanCurrentPage">
            {{ isCapturing ? 'Scanning...' : 'Scan page' }}
          </button>
        </div>

        <div class="integration-list">
          <article v-for="card in integrationCards" :key="card.provider" class="integration-row">
            <div>
              <div class="task-title">
                <strong>{{ card.title }}</strong>
                <span :data-status="integrationStatus(card.provider)">{{ integrationStatusText(card.provider) }}</span>
              </div>
              <p>{{ card.copy }}</p>
              <small v-if="getIntegration(card.provider)?.displayName">
                {{ getIntegration(card.provider)?.displayName }}
              </small>
            </div>
            <div class="integration-actions">
              <button
                class="mini-button"
                :disabled="activeIntegration === card.provider || !providerBackendReady(card.provider)"
                @click="connectIntegration(card.provider)"
              >
                {{ integrationStatus(card.provider) === 'connected' ? 'Reconnect' : 'Connect' }}
              </button>
              <button
                class="mini-button"
                :disabled="activeIntegration === card.provider || integrationStatus(card.provider) !== 'connected'"
                @click="syncIntegration(card.provider)"
              >
                {{ activeIntegration === card.provider ? 'Syncing...' : 'Sync' }}
              </button>
            </div>
            <small v-if="providerSetupMessage(card.provider)" class="setup-message">
              {{ providerSetupMessage(card.provider) }}
            </small>
          </article>
        </div>

        <div class="setup-checks" aria-label="Integration setup status">
          <span v-for="row in setupRows" :key="row.label" :data-ready="row.status?.configured ?? false">
            {{ row.label }} · {{ row.status?.configured ? 'ready' : 'missing' }}
          </span>
        </div>

        <div v-if="pendingCandidates.length" class="candidate-list">
          <article v-for="candidate in pendingCandidates" :key="candidate.id" class="candidate-row">
            <div class="candidate-meta">
              <span>{{ providerLabel(candidate.provider) }}</span>
              <span>{{ confidenceLabel(candidate.confidence) }}</span>
            </div>
            <h3>{{ candidate.title }}</h3>
            <p>{{ candidate.nextStep }}</p>
            <small>{{ candidate.deadline || 'No deadline' }}</small>
            <blockquote v-if="candidate.evidenceSnippet">{{ candidate.evidenceSnippet }}</blockquote>
            <div class="task-actions">
              <button class="mini-button" @click="acceptCandidate(candidate.id)">Accept + active</button>
              <button class="mini-button danger" @click="dismissCandidate(candidate.id)">Dismiss</button>
            </div>
          </article>
        </div>

        <p v-else class="empty-note">
          No task candidates yet. Capture selected text, scan the page, or connect Slack and Telegram.
        </p>
        <p v-if="integrationMessage" class="auth-note">{{ integrationMessage }}</p>
        <p v-if="integrationError" class="auth-error">{{ integrationError }}</p>
      </section>

      <section class="panel-section active-editor-card">
        <div class="section-head">
          <p class="eyebrow">Active task</p>
          <span>{{ activeTask?.source || 'Manual' }}</span>
        </div>
        <h2>{{ activeTask?.title || 'Choose your next task' }}</h2>
        <div class="field-grid">
          <label>
            <span>Title</span>
            <input v-model="activeEditor.title" class="field compact-field" type="text" />
          </label>
          <label>
            <span>Source</span>
            <input v-model="activeEditor.source" class="field compact-field" type="text" />
          </label>
          <label>
            <span>Deadline</span>
            <input v-model="activeEditor.deadline" class="field compact-field" type="text" />
          </label>
          <label>
            <span>Next step</span>
            <input v-model="activeEditor.nextStep" class="field compact-field" type="text" />
          </label>
        </div>
        <button class="button primary full-width" :disabled="!activeEditor.title.trim()" @click="saveActiveTask">
          Save active task
        </button>
        <div class="break-row">
          <span>Break after update</span>
          <strong>{{ breakMinutes }}m</strong>
        </div>
        <input v-model.number="breakMinutes" type="range" min="5" max="60" step="5" @change="saveSettings" />
        <p class="saved-label">{{ savedLabel }}</p>
      </section>

      <section class="panel-section ai-card">
        <div class="section-head">
          <p class="eyebrow">AI coach</p>
          <span>Groq ready</span>
        </div>

        <button class="site-row compact" @click="saveAiToggle(!aiSettings?.enabled)">
          <span>
            <strong>AI page checks</strong>
            <small>{{ aiSettings?.enabled ? 'The model reviews gated pages.' : 'Manual feed rules only.' }}</small>
          </span>
          <span class="toggle" :data-active="aiSettings?.enabled" />
        </button>

        <button class="site-row compact" @click="saveSitePickingToggle(!aiSettings?.sitePickingEnabled)">
          <span>
            <strong>AI site picking</strong>
            <small>{{ aiSettings?.sitePickingEnabled ? 'Goalden chooses which feeds to block.' : 'You pick feeds yourself.' }}</small>
          </span>
          <span class="toggle" :data-active="aiSettings?.sitePickingEnabled" />
        </button>

        <div class="ai-model-row">
          <input v-model="aiModelDraft" class="field compact-field" type="text" spellcheck="false" />
          <button class="mini-button" :disabled="isAiSaving" @click="saveAiModel">Save</button>
        </div>
        <button class="button primary full-width" :disabled="isAiSaving" @click="letAiPickSites">
          {{ isAiSaving ? 'Thinking...' : 'Let AI pick feeds' }}
        </button>
        <p v-if="aiMessage" class="auth-note">{{ aiMessage }}</p>
        <p v-if="aiError" class="auth-error">{{ aiError }}</p>
      </section>

      <section class="panel-section feeds-card">
        <div class="section-head">
          <p class="eyebrow">Blocked feeds</p>
          <span>{{ enabledSiteIds.length }} active</span>
        </div>

        <button v-for="site in SITES" :key="site.id" class="site-row compact" @click="toggleSite(site.id)">
          <span>
            <strong>{{ site.label }}</strong>
            <small>{{ getUnlockLabel(state?.unlocks?.[site.id]) }}</small>
          </span>
          <span class="toggle" :data-active="enabledSet.has(site.id)" />
        </button>
      </section>
    </template>
  </main>
</template>

<style scoped>
.sidepanel-shell {
  min-height: 100vh;
  background: #fbfbfa;
  color: #11110f;
  padding: 18px;
}

.panel-header,
.brand-line,
.section-head,
.break-row,
.task-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.panel-header,
.section-head,
.break-row,
.task-title {
  justify-content: space-between;
}

.panel-header {
  border-bottom: 1px solid #eaeaea;
  padding-bottom: 16px;
}

.brand-line {
  min-width: 0;
  gap: 10px;
}

.brand-line strong {
  font-size: 17px;
}

.brand-line p,
.section-head span,
.break-row,
.hint,
.task-row small,
.task-row p {
  color: #787774;
}

.brand-line p,
.section-head span,
.task-row small {
  margin: 1px 0 0;
  font-size: 12px;
}

.text-button {
  border: 0;
  background: transparent;
  color: #787774;
  font-size: 13px;
  font-weight: 700;
}

.account-card,
.task-card,
.panel-section {
  margin-top: 14px;
  border: 1px solid #eaeaea;
  border-radius: 12px;
  background: #fff;
  padding: 14px;
}

.task-card {
  margin-top: 18px;
  padding: 18px;
}

.account-card {
  margin-top: 18px;
  padding: 18px;
}

.locked-card {
  margin-top: 14px;
  border: 1px solid #eaeaea;
  border-radius: 12px;
  background: #fff;
  padding: 18px;
}

.locked-card h1 {
  margin: 10px 0 8px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 34px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1;
}

.locked-card p:last-child {
  margin: 0;
  color: #787774;
  font-size: 13px;
  line-height: 1.5;
}

.account-card h2 {
  margin: 10px 0 8px;
  color: #11110f;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 27px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.05;
}

.account-card p {
  margin: 0;
  color: #787774;
  font-size: 13px;
  line-height: 1.5;
}

.ai-card h2 {
  margin: 10px 0 8px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 27px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.05;
}

.ai-card p {
  margin: 0 0 8px;
  color: #787774;
  font-size: 13px;
  line-height: 1.5;
}

.ai-model-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  margin-top: 10px;
}

.integrations-card h2 {
  margin: 10px 0 8px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 27px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.05;
}

.integrations-card > p {
  margin: 0 0 10px;
  color: #787774;
  font-size: 13px;
  line-height: 1.5;
}

.integration-list,
.candidate-list {
  display: grid;
  gap: 8px;
}

.capture-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
  border: 1px solid #dedbd3;
  border-radius: 12px;
  background: #26251e;
  color: #f5f4ef;
  padding: 12px;
}

.capture-card p {
  margin: 6px 0 0;
  color: #cfccc4;
  font-size: 12px;
  line-height: 1.45;
}

.capture-card .button {
  min-width: 126px;
  background: #f0efeb;
  color: #26251e;
}

.integration-row,
.candidate-row {
  border: 1px solid #eaeaea;
  border-radius: 10px;
  background: #f7f6f3;
  padding: 12px;
}

.integration-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.integration-row .setup-message {
  grid-column: 1 / -1;
  border-top: 1px solid #e5e1da;
  padding-top: 8px;
}

.integration-row p,
.integration-row small,
.candidate-row p,
.candidate-row small,
.empty-note {
  color: #787774;
  font-size: 12px;
  line-height: 1.45;
}

.integration-row p,
.candidate-row p {
  margin: 7px 0 3px;
}

.integration-row small,
.candidate-row small {
  display: block;
}

.integration-actions {
  display: grid;
  gap: 6px;
}

.setup-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.setup-checks span {
  border: 1px solid #e0ded8;
  border-radius: 999px;
  background: #f7f6f3;
  color: #7b7770;
  padding: 6px 9px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.setup-checks span[data-ready="true"] {
  border-color: #b8d5bb;
  background: #eef6ee;
  color: #346538;
}

.candidate-list {
  margin-top: 10px;
  border-top: 1px solid #eaeaea;
  padding-top: 10px;
}

.candidate-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #956400;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.candidate-row h3 {
  margin: 8px 0;
  font-size: 17px;
  line-height: 1.15;
}

.candidate-row blockquote {
  margin: 10px 0 0;
  border-left: 2px solid #d8d2c8;
  padding-left: 10px;
  color: #55514b;
  font-size: 12px;
  line-height: 1.45;
}

.candidate-row .task-actions {
  grid-template-columns: repeat(2, 1fr);
}

.empty-note {
  margin: 10px 0 0;
}

.account-meta {
  display: grid;
  gap: 5px;
  margin-top: 12px;
  color: #787774;
  font-size: 12px;
}

.sync-error,
.auth-error {
  color: #9f2f2d;
}

.auth-note {
  margin-top: 10px !important;
  color: #346538 !important;
  font-weight: 700;
}

.auth-error {
  margin-top: 10px !important;
  font-weight: 700;
}

.auth-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 14px;
}

.auth-tabs button {
  min-height: 34px;
  border: 1px solid #eaeaea;
  border-radius: 8px;
  background: #f7f6f3;
  color: #55514b;
  font-size: 12px;
  font-weight: 800;
}

.auth-tabs button[data-active="true"] {
  border-color: #11110f;
  background: #11110f;
  color: #fff;
}

.auth-form,
.account-actions {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.account-actions {
  grid-template-columns: 1fr 1fr;
}

.task-card h1 {
  margin: 10px 0 14px;
  color: #11110f;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 30px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.02;
}

.field-grid,
.new-task {
  display: grid;
  gap: 8px;
}

.field-grid label span {
  display: block;
  margin-bottom: 5px;
  color: #787774;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.compact-field {
  min-height: 40px;
  padding: 9px 11px;
}

.full-width {
  width: 100%;
  margin-top: 10px;
}

.break-row {
  margin-top: 16px;
  font-size: 13px;
}

.break-row strong {
  color: #11110f;
  font-size: 16px;
}

input[type="range"] {
  width: 100%;
  margin-top: 10px;
  accent-color: #11110f;
}

.saved-label {
  min-height: 18px;
  margin: 8px 0 0;
  color: var(--success);
  font-size: 12px;
  font-weight: 700;
}

.task-list {
  display: grid;
  gap: 8px;
}

.new-task {
  margin-bottom: 10px;
  border-bottom: 1px solid #eaeaea;
  padding-bottom: 12px;
}

.task-row {
  border: 1px solid #eaeaea;
  border-radius: 10px;
  background: #f7f6f3;
  padding: 12px;
}

.task-row[data-active="true"] {
  border-color: #11110f;
  background: #fff;
}

.task-title strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.task-title span {
  border: 1px solid #eaeaea;
  border-radius: 999px;
  background: #fff;
  padding: 3px 7px;
  color: #787774;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
}

.task-title span[data-status="done"] {
  background: #edf3ec;
  color: #346538;
}

.task-title span[data-status="paused"] {
  background: #fbf3db;
  color: #956400;
}

.task-title span[data-status="connected"] {
  background: #edf3ec;
  color: #346538;
}

.task-title span[data-status="connecting"] {
  background: #fbf3db;
  color: #956400;
}

.task-title span[data-status="error"] {
  background: #f7e7e5;
  color: #9f2f2d;
}

.task-row p {
  margin: 7px 0 3px;
  font-size: 12px;
  line-height: 1.45;
}

.task-actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-top: 10px;
}

.mini-button {
  min-height: 30px;
  border: 1px solid #eaeaea;
  border-radius: 7px;
  background: #fff;
  color: #11110f;
  font-size: 11px;
  font-weight: 800;
}

.mini-button.danger {
  color: #9f2f2d;
}

.toggle {
  position: relative;
  width: 38px;
  height: 22px;
  flex: 0 0 auto;
  border: 1px solid #d8d2c8;
  border-radius: 999px;
  background: #f1eee8;
}

.toggle::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: #9b958b;
  content: "";
  transition: transform 160ms ease, background 160ms ease;
}

.toggle[data-active="true"] {
  border-color: #11110f;
  background: #11110f;
}

.toggle[data-active="true"]::after {
  background: #fff;
  transform: translateX(16px);
}

.site-row {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  border: 0;
  border-bottom: 1px solid #eaeaea;
  background: transparent;
  text-align: left;
}

.site-row.compact {
  padding: 12px 0;
}

.site-row:last-child {
  border-bottom: 0;
}

.site-row strong {
  display: block;
  font-size: 14px;
}

.site-row small {
  display: block;
  margin-top: 2px;
  color: #787774;
  font-size: 12px;
}

.site-tabs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  margin-bottom: 10px;
}

.site-tabs button {
  min-height: 36px;
  border: 1px solid #eaeaea;
  border-radius: 8px;
  background: #f7f6f3;
  color: #55514b;
  font-weight: 700;
}

.site-tabs button[data-active="true"] {
  border-color: #11110f;
  background: #11110f;
  color: #fff;
}

.progress-field {
  min-height: 116px;
}

.hint {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.45;
}

.latest-note {
  margin-top: 14px;
  border-left: 2px solid var(--gold);
  padding: 4px 0 4px 12px;
}

.latest-note p:last-child {
  margin: 8px 0 0;
  color: #55514b;
  font-size: 13px;
  line-height: 1.45;
}

/* Goalden white workspace */
.sidepanel-shell {
  min-height: 100vh;
  background: #ffffff;
  color: #26251e;
  padding: 12px;
  font-family: "Product Sans", "SF Pro Display", "Helvetica Neue", Arial, sans-serif;
}

.panel-header {
  min-height: 42px;
  border: 0;
  border-bottom: 1px solid #eaeaea;
  border-radius: 0;
  background: #ffffff;
  padding: 8px 8px 14px;
}

.brand-mark {
  width: 21px;
  height: 21px;
  color: #26251e;
}

.brand-line strong {
  color: #26251e;
  font-size: 13px;
}

.brand-line p {
  color: #777168;
  font-size: 10px;
}

.text-button {
  color: #777168;
}

.account-card,
.workspace-card,
.coach-card,
.task-card,
.panel-section,
.locked-card {
  border: 1px solid #eaeaea;
  border-radius: 12px;
  background: #ffffff;
  color: #26251e;
  box-shadow: none;
}

.account-card {
  margin-top: 12px;
  border-color: #eaeaea;
  background: #ffffff;
  color: #26251e;
  padding: 14px;
}

.account-card[data-state="signed-in"] h2,
.account-card[data-state="signed-in"] p {
  display: none;
}

.account-card h2,
.locked-card h1,
.active-editor-card h2 {
  color: #26251e;
  font-family: "Product Sans", "SF Pro Display", "Helvetica Neue", Arial, sans-serif;
}

.workspace-card {
  min-height: 360px;
  margin-top: 12px;
  border-color: #eaeaea;
  background: #ffffff;
  padding: 18px;
}

.workspace-topline,
.workspace-meta,
.task-main,
.coach-input-row {
  display: flex;
  align-items: center;
}

.workspace-topline,
.workspace-meta {
  justify-content: space-between;
}

.workspace-topline h1 {
  margin: 4px 0 0;
  color: #26251e;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.user-chip {
  display: inline-flex;
  width: 34px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid #eaeaea;
  background: #ffffff;
  color: #26251e;
  font-size: 12px;
  font-weight: 900;
}

.workspace-meta {
  margin-top: 18px;
  color: #787774;
  font-size: 12px;
}

.progress-track {
  height: 5px;
  margin-top: 12px;
  overflow: hidden;
  border-radius: 999px;
  background: #efefec;
}

.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #26251e;
  transition: width 180ms ease;
}

.workspace-list {
  margin-top: 30px;
}

.task-row,
.integration-row,
.candidate-row {
  border-color: #eaeaea;
  background: #fbfbfa;
}

.task-row[data-active="true"] {
  border-color: #c9a64a;
  background: #fffdf8;
}

.task-main {
  min-width: 0;
  gap: 12px;
}

.task-dot {
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
  border: 1px solid #b8b5ad;
  border-radius: 999px;
  background: transparent;
}

.task-dot[data-done="true"] {
  border-color: #26251e;
  background: #26251e;
}

.task-title strong,
.site-row strong {
  color: #26251e;
}

.task-row p,
.task-row small,
.integration-row p,
.integration-row small,
.candidate-row p,
.candidate-row small,
.empty-note,
.hint,
.section-head span,
.account-meta,
.break-row {
  color: #787774;
}

.task-title span {
  border-color: #eaeaea;
  background: #ffffff;
  color: #787774;
}

.task-title span[data-status="open"],
.task-title span[data-status="connected"] {
  background: #fbf3db;
  color: #956400;
}

.add-task-button {
  margin-top: 22px;
  border: 0;
  background: transparent;
  color: #57534a;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.coach-card {
  margin-top: 10px;
  padding: 14px;
}

.coach-transcript {
  display: grid;
  gap: 10px;
  min-height: 88px;
  align-content: end;
  padding: 4px 0 12px;
}

.assistant-bubble,
.user-bubble {
  width: fit-content;
  max-width: 92%;
  margin: 0;
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.45;
}

.assistant-bubble {
  border: 1px solid #eaeaea;
  background: #fbfbfa;
  color: #26251e;
}

.user-bubble {
  justify-self: end;
  border: 1px solid #ead9aa;
  background: #fbf3db;
  color: #26251e;
}

.compact-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.compact-tabs button {
  min-height: 26px;
  border-color: #eaeaea;
  background: #fbfbfa;
  color: #57534a;
  font-size: 11px;
}

.compact-tabs button[data-active="true"] {
  border-color: #26251e;
  background: #ffffff;
  color: #26251e;
}

.coach-input-row {
  gap: 8px;
  margin-top: 8px;
  border: 1px solid #eaeaea;
  border-radius: 12px;
  background: #fbfbfa;
  padding: 8px;
}

.coach-input-row .progress-field {
  min-height: 42px;
  border: 0;
  background: transparent;
  padding: 8px 6px;
  resize: none;
}

.send-button {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border: 1px solid #eaeaea;
  border-radius: 12px;
  background: #ffffff;
  color: #787774;
  font-size: 16px;
  font-weight: 900;
}

.send-button:not(:disabled) {
  border-color: #26251e;
  background: #26251e;
  color: #ffffff;
}

.send-button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.panel-section,
.active-editor-card {
  margin-top: 10px;
  border-color: #eaeaea;
  background: #ffffff;
  color: #26251e;
  padding: 14px;
}

.section-head {
  border-bottom: 0;
}

.eyebrow {
  color: #9a6a00;
}

.integrations-card h2,
.ai-card h2,
.active-editor-card h2 {
  margin: 8px 0 10px;
  color: #26251e;
  font-family: "Product Sans", "SF Pro Display", "Helvetica Neue", Arial, sans-serif;
  font-size: 18px;
  font-weight: 800;
}

.capture-card {
  grid-template-columns: minmax(0, 1fr);
  border-color: #eaeaea;
  background: #fbfbfa;
  color: #26251e;
}

.capture-card p {
  color: #787774;
}

.capture-card .button {
  width: 100%;
  background: #ffffff;
  color: #26251e;
}

.button.primary,
.mini-button {
  border-color: #eaeaea;
  background: #ffffff;
  color: #26251e;
}

.button.primary {
  border-color: #26251e;
  background: #ffffff;
  color: #26251e;
}

.capture-card .button.primary {
  background: #ffffff;
  color: #26251e;
}

.button.ghost {
  border-color: #eaeaea;
  background: #fbfbfa;
  color: #26251e;
}

.field {
  border-color: #eaeaea;
  background: #ffffff;
  color: #26251e;
}

.field::placeholder {
  color: #827c72;
}

.new-task {
  margin-top: 12px;
  border-color: #eaeaea;
}

.field-grid label span {
  color: #777168;
}

input[type="range"] {
  accent-color: #26251e;
}

.site-row {
  border-color: #eaeaea;
}

.panel-section .site-row strong {
  color: #26251e;
}

.toggle {
  border-color: #d8d8d2;
  background: #f1f1ee;
}

.toggle[data-active="true"] {
  border-color: #26251e;
  background: #26251e;
}

.toggle[data-active="true"]::after {
  background: #ffffff;
}

.setup-checks span {
  border-color: #eaeaea;
  background: #fbfbfa;
  color: #777168;
}

.setup-checks span[data-ready="true"] {
  border-color: #ead9aa;
  background: #fbf3db;
  color: #7d5700;
}

.auth-note {
  color: #7d5700 !important;
}

.auth-error,
.mini-button.danger {
  color: #9f2f2d;
}

.account-actions .button.primary,
.account-actions .button.ghost {
  min-height: 42px;
  background: #ffffff;
  color: #26251e;
}

.account-actions .button.primary {
  border-color: #26251e;
}

.auth-tabs button[data-active="true"],
.site-tabs button[data-active="true"] {
  border-color: #26251e;
  background: #ffffff;
  color: #26251e;
}

.task-actions {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.task-actions .mini-button {
  background: #ffffff;
}

.mini-button:hover,
.button:hover,
.compact-tabs button:hover {
  border-color: #cfcfc8;
}

.mini-button:disabled,
.button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
