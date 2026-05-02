<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getUnlockLabel } from '@/shared/state';
import { sendMessage } from '@/shared/messaging';
import { SITES } from '@/shared/sites';
import type { GoaldenTask, GoaldenViewState, SiteId, TaskDraft, TaskStatus } from '@/shared/types';

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
const showNewTask = ref(false);
const authMode = ref<'sign-in' | 'sign-up'>('sign-in');

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
const isSignedIn = computed(() => auth.value?.status === 'signed-in');
const authTitle = computed(() =>
  authMode.value === 'sign-in' ? 'Sign in to sync Goalden.' : 'Create your Goalden account.'
);
const authCopy = computed(() =>
  authMode.value === 'sign-in'
    ? 'Your tasks, settings, breaks, and progress log will be saved to Supabase.'
    : 'Use an email and password for now. Google login can wait until the store listing is ready.'
);

function syncLocal(nextState: GoaldenViewState) {
  state.value = nextState;
  enabledSiteIds.value = [...nextState.enabledSiteIds];
  breakMinutes.value = nextState.breakMinutes;
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

function statusLabel(status: TaskStatus) {
  if (status === 'done') return 'done';
  if (status === 'paused') return 'paused';
  return 'open';
}

function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>, areaName: string) {
  if (areaName === 'local' && (changes['goalden-state']?.newValue || changes['goalden-auth']?.newValue)) {
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
          <p>{{ isSaving ? 'Saving...' : 'Local focus loop' }}</p>
        </div>
      </div>
      <button class="text-button" @click="openOptions">Settings</button>
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
          <span>{{ auth?.status === 'pending-confirmation' ? 'Check email' : 'Local only' }}</span>
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

    <section class="task-card">
      <div class="section-head">
        <p class="eyebrow">Active task</p>
        <span>{{ activeTask?.source || 'Manual' }}</span>
      </div>
      <h1>You said you'd work on {{ activeTask?.title || 'your next task' }}.</h1>

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

    <section class="panel-section">
      <div class="section-head">
        <p class="eyebrow">Tasks</p>
        <button class="text-button" @click="showNewTask = !showNewTask">
          {{ showNewTask ? 'Close' : 'New' }}
        </button>
      </div>

      <div v-if="showNewTask" class="new-task">
        <input v-model="draftTask.title" class="field compact-field" type="text" placeholder="Task title" />
        <input v-model="draftTask.source" class="field compact-field" type="text" placeholder="Source" />
        <input v-model="draftTask.deadline" class="field compact-field" type="text" placeholder="Deadline" />
        <input v-model="draftTask.nextStep" class="field compact-field" type="text" placeholder="Next step" />
        <button class="button primary full-width" :disabled="!draftTask.title.trim()" @click="createTask">
          Add task
        </button>
      </div>

      <div class="task-list">
        <article v-for="task in tasks" :key="task.id" class="task-row" :data-active="task.id === state?.activeTaskId">
          <div>
            <div class="task-title">
              <strong>{{ task.title }}</strong>
              <span :data-status="task.status">{{ statusLabel(task.status) }}</span>
            </div>
            <p>{{ task.nextStep }}</p>
            <small>{{ task.source }} · {{ task.deadline || 'No deadline' }}</small>
          </div>
          <div class="task-actions">
            <button class="mini-button" @click="setActive(task.id)">Active</button>
            <button class="mini-button" @click="setStatus(task, task.status === 'paused' ? 'open' : 'paused')">
              {{ task.status === 'paused' ? 'Resume' : 'Pause' }}
            </button>
            <button class="mini-button" @click="setStatus(task, task.status === 'done' ? 'open' : 'done')">
              {{ task.status === 'done' ? 'Reopen' : 'Done' }}
            </button>
            <button class="mini-button danger" @click="removeTask(task.id)">Delete</button>
          </div>
        </article>
      </div>
    </section>

    <section class="panel-section">
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

    <section class="panel-section">
      <div class="section-head">
        <p class="eyebrow">Coach check</p>
        <span>{{ selectedSite.label }}</span>
      </div>

      <div class="site-tabs">
        <button
          v-for="site in SITES"
          :key="site.id"
          :data-active="selectedSiteId === site.id"
          @click="selectedSiteId = site.id"
        >
          {{ site.label }}
        </button>
      </div>

      <textarea
        v-model="progress"
        class="field progress-field"
        rows="5"
        placeholder="I wrote one section, sent the message, and removed one blocker."
      />

      <button class="button primary full-width" :disabled="!canSubmit" @click="submitProgress">
        {{ isSubmitting ? 'Checking...' : 'Submit progress' }}
      </button>
      <p class="hint">Minimum 5 words. Goalden will attach this update to the active task.</p>
    </section>

    <section v-if="latestProgress" class="latest-note">
      <p class="eyebrow">Last update</p>
      <p>{{ latestProgress.taskTitle ? `${latestProgress.taskTitle}: ` : '' }}{{ latestProgress.text }}</p>
    </section>
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
</style>
