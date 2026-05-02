<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getUnlockLabel } from '@/shared/state';
import { sendMessage } from '@/shared/messaging';
import { SITES } from '@/shared/sites';
import type { GoaldenViewState, SiteId } from '@/shared/types';

const state = ref<GoaldenViewState | null>(null);
const isSaving = ref(false);

const enabledIds = computed(() => new Set(state.value?.enabledSiteIds ?? []));
const latestProgress = computed(() => state.value?.progressLog?.[0]);
const auth = computed(() => state.value?.auth);
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

async function loadState() {
  state.value = await sendMessage<GoaldenViewState>({ type: 'get-state' });
}

async function save(enabledSiteIds: SiteId[], breakMinutes = state.value?.breakMinutes ?? 15) {
  isSaving.value = true;
  state.value = await sendMessage<GoaldenViewState>({
    type: 'save-settings',
    enabledSiteIds,
    breakMinutes
  });
  isSaving.value = false;
}

async function toggleSite(siteId: SiteId) {
  if (!state.value) return;
  const next = new Set(state.value.enabledSiteIds);
  if (next.has(siteId)) next.delete(siteId);
  else next.add(siteId);
  await save([...next]);
}

function openOptions() {
  chrome.runtime.openOptionsPage();
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
  <main class="popup-shell">
    <header class="popup-header">
      <div class="brand-row">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 64 64" fill="none">
            <path d="M31.8 2 36 25l21.8-9.5L40.4 31.8 62 36 39 40.1l9.5 21.7L32.2 44.5 28 62 24 39.2 2 48.7l17.3-16.5L2 28l22.7-4.1L15.3 2.2 31.8 19V2Z" fill="currentColor" />
          </svg>
        </span>
        <div>
          <strong>Goalden</strong>
          <p>{{ isSaving ? 'Saving...' : 'Progress gate is active' }}</p>
        </div>
      </div>
    </header>

    <section class="summary-card card">
      <p class="eyebrow">Current rule</p>
      <h1>Write progress, earn {{ state?.breakMinutes ?? 15 }} minutes.</h1>
      <p class="muted">
        Goalden is holding the feed for: {{ activeTask?.title || 'your next task' }}.
      </p>
      <p class="muted account-line">
        {{ auth?.status === 'signed-in' ? `Synced as ${auth.user?.email}` : 'Local mode. Sign in from the panel to sync.' }}
      </p>
    </section>

    <section class="site-list card">
      <button v-for="site in SITES" :key="site.id" class="site-row" @click="toggleSite(site.id)">
        <span>
          <strong>{{ site.label }}</strong>
          <small>{{ getUnlockLabel(state?.unlocks?.[site.id]) }}</small>
        </span>
        <span class="toggle" :data-active="enabledIds.has(site.id)" />
      </button>
    </section>

    <section v-if="latestProgress" class="latest-card">
      <p class="eyebrow">Last update</p>
      <p>{{ latestProgress.text }}</p>
    </section>

    <footer class="popup-footer">
      <button class="button primary" @click="openOptions">Settings</button>
      <a class="button ghost" href="https://goalden.local/pricing" target="_blank">
        Pricing
      </a>
    </footer>
  </main>
</template>

<style scoped>
.popup-shell {
  width: 390px;
  min-height: 560px;
  background:
    radial-gradient(circle at 0 0, rgb(255 240 203 / 90%), transparent 34%),
    var(--paper-soft);
  padding: 18px;
}

.popup-header {
  margin-bottom: 14px;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-row strong {
  font-size: 18px;
}

.brand-row p {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.summary-card {
  padding: 18px;
}

.summary-card h1 {
  margin: 10px 0 8px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 33px;
  font-weight: 500;
  line-height: 1;
}

.summary-card p:last-child {
  margin-bottom: 0;
  line-height: 1.5;
}

.account-line {
  margin-top: 10px;
  border-top: 1px solid var(--line);
  padding-top: 10px;
  font-size: 13px;
}

.site-list {
  display: grid;
  gap: 0;
  overflow: hidden;
  margin-top: 12px;
}

.site-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  padding: 15px 16px;
  text-align: left;
}

.site-row:last-child {
  border-bottom: 0;
}

.site-row small {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-size: 12px;
}

.latest-card {
  margin-top: 12px;
  border-left: 2px solid var(--gold);
  padding: 10px 0 10px 14px;
}

.latest-card p {
  margin: 6px 0 0;
  color: var(--muted);
  line-height: 1.45;
}

.popup-footer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 16px;
}
</style>
