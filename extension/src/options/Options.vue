<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { sendMessage } from '@/shared/messaging';
import { SITES } from '@/shared/sites';
import type { GoaldenTask, GoaldenViewState, SiteId, TaskDraft, TaskStatus } from '@/shared/types';

const state = ref<GoaldenViewState | null>(null);
const breakMinutes = ref(15);
const enabledSiteIds = ref<SiteId[]>([]);
const savedLabel = ref('');
const syncLabel = ref('');
const isSyncing = ref(false);

const draftTask = ref<TaskDraft>({
  title: '',
  source: 'Manual',
  deadline: '',
  nextStep: ''
});

const enabledSet = computed(() => new Set(enabledSiteIds.value));
const tasks = computed(() => state.value?.tasks ?? []);
const auth = computed(() => state.value?.auth);
const isSignedIn = computed(() => auth.value?.status === 'signed-in');

async function loadState() {
  const nextState = await sendMessage<GoaldenViewState>({ type: 'get-state' });
  syncLocal(nextState);
}

function syncLocal(nextState: GoaldenViewState) {
  state.value = nextState;
  breakMinutes.value = nextState.breakMinutes;
  enabledSiteIds.value = [...nextState.enabledSiteIds];
}

function toggleSite(siteId: SiteId) {
  const next = new Set(enabledSiteIds.value);
  if (next.has(siteId)) next.delete(siteId);
  else next.add(siteId);
  enabledSiteIds.value = [...next];
}

async function saveSettings() {
  syncLocal(
    await sendMessage<GoaldenViewState>({
      type: 'save-settings',
      enabledSiteIds: enabledSiteIds.value,
      breakMinutes: breakMinutes.value
    })
  );
  flashSaved();
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

async function deleteTask(taskId: string) {
  syncLocal(await sendMessage<GoaldenViewState>({ type: 'delete-task', taskId }));
}

async function syncRemote() {
  isSyncing.value = true;
  syncLabel.value = '';
  try {
    syncLocal(await sendMessage<GoaldenViewState>({ type: 'sync-remote' }));
    syncLabel.value = 'Synced';
  } catch (error) {
    syncLabel.value = error instanceof Error ? error.message : 'Sync failed';
  } finally {
    isSyncing.value = false;
  }
}

async function signOutUser() {
  syncLocal(await sendMessage<GoaldenViewState>({ type: 'auth-sign-out' }));
}

async function openPanel() {
  await sendMessage<GoaldenViewState>({ type: 'open-side-panel' });
}

function flashSaved() {
  savedLabel.value = 'Saved';
  window.setTimeout(() => {
    savedLabel.value = '';
  }, 1400);
}

function statusText(status: TaskStatus) {
  if (status === 'done') return 'Done';
  if (status === 'paused') return 'Paused';
  return 'Open';
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
  <main class="options-shell">
    <header class="options-hero">
      <div class="brand-row">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 64 64" fill="none">
            <path d="M31.8 2 36 25l21.8-9.5L40.4 31.8 62 36 39 40.1l9.5 21.7L32.2 44.5 28 62 24 39.2 2 48.7l17.3-16.5L2 28l22.7-4.1L15.3 2.2 31.8 19V2Z" fill="currentColor" />
          </svg>
        </span>
        <strong>Goalden</strong>
      </div>
      <p class="eyebrow">Extension settings</p>
      <h1>{{ isSignedIn ? 'Run the focus loop before AI enters.' : 'Create an account first.' }}</h1>
      <p>
        {{
          isSignedIn
            ? 'Choose blocked feeds, set break length, and keep a small task list. Goalden uses this list for overlay prompts and progress checks.'
            : 'Goalden needs sign in before settings unlock. Open the side panel and create an account to start the demo.'
        }}
      </p>
    </header>

    <section v-if="!isSignedIn" class="locked-options card">
      <p class="eyebrow">Account required</p>
      <h2>Sign in from the Goalden panel.</h2>
      <p class="muted">
        After registration, these settings open: blocked feeds, break length, tasks, AI checks, and Supabase sync.
      </p>
      <button class="button primary" @click="openPanel">Open sign in</button>
    </section>

    <section v-else class="settings-grid">
      <div class="card settings-card account-settings">
        <div class="setting-head">
          <div>
            <p class="eyebrow">Account</p>
            <h2>{{ auth?.status === 'signed-in' ? 'Supabase sync is on' : 'Sign in from the side panel' }}</h2>
          </div>
          <span>{{ auth?.status || 'signed-out' }}</span>
        </div>
        <p class="muted">
          {{
            auth?.status === 'signed-in'
              ? `Signed in as ${auth.user?.email}. Goalden saves your local state to Supabase.`
              : 'Open the extension panel to sign in with email and password. Local mode still works.'
          }}
        </p>
        <div v-if="auth?.status === 'signed-in'" class="account-actions">
          <button class="button primary" :disabled="isSyncing" @click="syncRemote">
            {{ isSyncing ? 'Syncing...' : 'Sync now' }}
          </button>
          <button class="button ghost" @click="signOutUser">Sign out</button>
          <span>{{ syncLabel || (auth.lastSyncedAt ? `Last sync ${new Date(auth.lastSyncedAt).toLocaleString()}` : '') }}</span>
        </div>
      </div>

      <div class="card settings-card">
        <div class="setting-head">
          <div>
            <p class="eyebrow">Blocked feeds</p>
            <h2>Sites</h2>
          </div>
          <span>{{ enabledSiteIds.length }} active</span>
        </div>

        <button v-for="site in SITES" :key="site.id" class="option-row" @click="toggleSite(site.id)">
          <span>
            <strong>{{ site.label }}</strong>
            <small>{{ site.host }}</small>
          </span>
          <span class="toggle" :data-active="enabledSet.has(site.id)" />
        </button>
      </div>

      <div class="card settings-card">
        <p class="eyebrow">Break rule</p>
        <h2>How long progress unlocks the feed</h2>
        <div class="minutes-row">
          <input v-model.number="breakMinutes" type="range" min="5" max="60" step="5" />
          <strong>{{ breakMinutes }} minutes</strong>
        </div>
        <p class="muted">
          Short breaks keep the gate useful. The timer is stored locally and rechecked after Chrome restarts.
        </p>
      </div>

      <div class="card settings-card task-manager">
        <div class="setting-head">
          <div>
            <p class="eyebrow">Local tasks</p>
            <h2>Tasks Goalden can hold you to</h2>
          </div>
          <span>{{ tasks.length }} total</span>
        </div>

        <div class="task-form">
          <input v-model="draftTask.title" class="field" type="text" placeholder="Investor update" />
          <input v-model="draftTask.source" class="field" type="text" placeholder="Slack, Notion, Manual" />
          <input v-model="draftTask.deadline" class="field" type="text" placeholder="Tomorrow, Friday, No deadline" />
          <input v-model="draftTask.nextStep" class="field" type="text" placeholder="Send the draft before opening the feed" />
          <button class="button primary" :disabled="!draftTask.title.trim()" @click="createTask">Add task</button>
        </div>

        <div class="task-list">
          <article v-for="task in tasks" :key="task.id" class="task-row" :data-active="task.id === state?.activeTaskId">
            <div>
              <div class="task-title">
                <strong>{{ task.title }}</strong>
                <span :data-status="task.status">{{ statusText(task.status) }}</span>
              </div>
              <p>{{ task.nextStep }}</p>
              <small>{{ task.source }} · {{ task.deadline || 'No deadline' }}</small>
            </div>
            <div class="task-actions">
              <button class="mini-button" @click="setActive(task.id)">Make active</button>
              <button class="mini-button" @click="setStatus(task, task.status === 'paused' ? 'open' : 'paused')">
                {{ task.status === 'paused' ? 'Resume' : 'Pause' }}
              </button>
              <button class="mini-button" @click="setStatus(task, task.status === 'done' ? 'open' : 'done')">
                {{ task.status === 'done' ? 'Reopen' : 'Done' }}
              </button>
              <button class="mini-button danger" @click="deleteTask(task.id)">Delete</button>
            </div>
          </article>
        </div>
      </div>
    </section>

    <footer v-if="isSignedIn" class="options-footer">
      <button class="button primary" @click="saveSettings">Save settings</button>
      <span>{{ savedLabel }}</span>
    </footer>
  </main>
</template>

<style scoped>
.options-shell {
  min-height: 100vh;
  background:
    radial-gradient(circle at 20% 0, rgb(255 240 203 / 80%), transparent 24%),
    #f5f2ed;
  padding: clamp(24px, 5vw, 70px);
}

.options-hero {
  max-width: 880px;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 70px;
  font-size: 22px;
}

.options-hero h1 {
  max-width: 760px;
  margin: 18px 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(52px, 6vw, 96px);
  font-weight: 500;
  line-height: 0.96;
}

.options-hero > p:last-child {
  max-width: 650px;
  margin: 0;
  color: var(--muted);
  font-size: 19px;
  line-height: 1.6;
}

.settings-grid {
  display: grid;
  max-width: 1120px;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.8fr);
  gap: 18px;
  margin-top: 42px;
}

.locked-options {
  max-width: 620px;
  margin-top: 42px;
  padding: 24px;
}

.locked-options h2 {
  margin: 8px 0 10px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 36px;
  font-weight: 500;
  line-height: 1.05;
}

.locked-options .button {
  margin-top: 18px;
}

.settings-card {
  padding: 24px;
}

.task-manager {
  grid-column: 1 / -1;
}

.account-settings {
  grid-column: 1 / -1;
}

.account-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-top: 18px;
}

.account-actions span {
  color: var(--muted);
  font-size: 13px;
}

.setting-head,
.option-row,
.task-title,
.options-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.setting-head {
  align-items: start;
  margin-bottom: 12px;
}

.setting-head h2,
.settings-card h2 {
  margin: 8px 0 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 34px;
  font-weight: 500;
  line-height: 1.05;
}

.setting-head span,
.task-title span {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #fff;
  padding: 7px 10px;
  color: var(--muted);
  font-size: 13px;
}

.option-row {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  padding: 18px 0;
  text-align: left;
}

.option-row:last-child {
  border-bottom: 0;
}

.option-row small,
.task-row small {
  display: block;
  margin-top: 4px;
  color: var(--muted);
}

.minutes-row {
  display: flex;
  align-items: center;
  gap: 18px;
  margin: 28px 0 18px;
}

input[type="range"] {
  width: 100%;
  accent-color: #11110f;
}

.task-form {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
  gap: 10px;
  border-bottom: 1px solid var(--line);
  padding: 14px 0 18px;
}

.task-list {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}

.task-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--paper-soft);
  padding: 16px;
}

.task-row[data-active="true"] {
  border-color: #11110f;
  background: #fff;
}

.task-title {
  justify-content: flex-start;
}

.task-title strong {
  font-size: 16px;
}

.task-title span {
  padding: 4px 8px;
  font-size: 11px;
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
  margin: 8px 0 0;
  color: var(--muted);
  line-height: 1.5;
}

.task-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}

.mini-button {
  min-height: 34px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  color: #11110f;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 800;
}

.mini-button.danger {
  color: #9f2f2d;
}

.options-footer {
  justify-content: flex-start;
  margin-top: 22px;
}

.options-footer span {
  color: var(--success);
  font-weight: 700;
}

@media (max-width: 960px) {
  .settings-grid,
  .task-form,
  .task-row {
    grid-template-columns: 1fr;
  }

  .task-actions {
    justify-content: flex-start;
  }
}
</style>
