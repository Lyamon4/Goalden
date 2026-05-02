<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getSite, getSiteHomeUrl } from '@/shared/sites';
import { sendMessage } from '@/shared/messaging';
import type { GoaldenState, SiteId } from '@/shared/types';

const params = new URLSearchParams(window.location.search);
const site = getSite(params.get('site'));
const state = ref<GoaldenState | null>(null);
const progress = ref('');
const isSubmitting = ref(false);
const approved = ref(false);
const errorMessage = ref('');

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
const focusTask = computed(() => activeTask.value?.title || 'your next task');
const nextStep = computed(() => activeTask.value?.nextStep || 'Finish one small piece');
const wordCount = computed(() => progress.value.trim().split(/\s+/).filter(Boolean).length);
const canSubmit = computed(() => wordCount.value >= 5 && !isSubmitting.value);
const unlockLabel = computed(() => {
  const until = state.value?.unlocks[site.id];
  if (!until || until <= Date.now()) return `${state.value?.breakMinutes ?? 15} minutes`;
  return `${Math.max(1, Math.ceil((until - Date.now()) / 60000))} minutes`;
});

async function loadState() {
  state.value = await sendMessage<GoaldenState>({ type: 'get-state' });
}

async function submitProgress() {
  if (!canSubmit.value) return;
  isSubmitting.value = true;
  errorMessage.value = '';

  try {
    state.value = await sendMessage<GoaldenState>({
      type: 'approve-progress',
      siteId: site.id as SiteId,
      progress: progress.value,
      taskId: activeTask.value?.id
    });
    approved.value = true;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Couldn't start the break.";
  } finally {
    isSubmitting.value = false;
  }
}

function openFeed() {
  window.location.href = getSiteHomeUrl(site.id);
}

onMounted(loadState);
</script>

<template>
  <main class="blocked-shell">
    <section class="blocked-copy">
      <div class="brand-row">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 64 64" fill="none">
            <path d="M31.8 2 36 25l21.8-9.5L40.4 31.8 62 36 39 40.1l9.5 21.7L32.2 44.5 28 62 24 39.2 2 48.7l17.3-16.5L2 28l22.7-4.1L15.3 2.2 31.8 19V2Z" fill="currentColor" />
          </svg>
        </span>
        <strong>Goalden</strong>
      </div>

      <p class="eyebrow">Progress before the feed</p>
      <h1>You said you'd work on {{ focusTask }}.</h1>
      <p class="lede">
        Do one small piece, write what changed, and Goalden will open {{ site.label }}
        for {{ state?.breakMinutes ?? 15 }} minutes.
      </p>

      <div class="promise-grid">
        <div>
          <span>Found from chats</span>
          <strong>{{ focusTask }}</strong>
        </div>
        <div>
          <span>Next useful step</span>
          <strong>{{ nextStep }}</strong>
        </div>
        <div>
          <span>Break earned</span>
          <strong>{{ state?.breakMinutes ?? 15 }}m</strong>
        </div>
      </div>
    </section>

    <section class="coach-card card" aria-label="Goalden coach">
      <div class="browser-bar">
        <span />
        <span />
        <span />
        <p>{{ site.host }} held by Goalden</p>
      </div>

      <div class="coach-body">
        <div class="site-pill">
          <span class="site-dot" />
          {{ site.label }} is paused
        </div>

        <div class="coach-message">
          <p class="eyebrow">AI coach</p>
          <h2>What changed?</h2>
          <p>
            Be specific: what did you write, send, decide, or get stuck on?
            "I worked on it" is too vague.
          </p>
        </div>

        <label class="progress-label" for="progress">Progress update</label>
        <textarea
          id="progress"
          v-model="progress"
          class="field"
          rows="5"
          placeholder="I wrote the churn section, added the April numbers, and asked Masha for the missing expansion figure."
        />

        <div class="coach-actions">
          <button class="button primary" :disabled="!canSubmit" @click="submitProgress">
            {{ isSubmitting ? 'Checking...' : 'Submit progress' }}
          </button>
          <button v-if="approved" class="button" @click="openFeed">
            Open {{ site.label }} for {{ unlockLabel }}
          </button>
          <span v-else class="muted">{{ Math.max(0, 5 - wordCount) }} more words to pass the check</span>
        </div>

        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

        <div v-if="approved" class="approval">
          Accepted. You have {{ unlockLabel }}. When the timer ends, Goalden turns the gate back on.
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.blocked-shell {
  display: grid;
  min-height: 100vh;
  grid-template-columns: minmax(0, 0.95fr) minmax(460px, 1.05fr);
  gap: clamp(36px, 6vw, 92px);
  align-items: center;
  padding: clamp(28px, 5vw, 72px);
  background:
    radial-gradient(circle at 18% 20%, rgb(255 240 203 / 80%), transparent 28%),
    linear-gradient(135deg, #f7f4ee 0%, #ede7dc 100%);
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 68px;
  font-size: 22px;
}

.blocked-copy h1 {
  max-width: 780px;
  margin: 16px 0 20px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(64px, 8vw, 136px);
  font-weight: 500;
  letter-spacing: 0;
  line-height: 0.9;
}

.lede {
  max-width: 630px;
  margin: 0;
  color: var(--muted);
  font-size: clamp(18px, 2vw, 23px);
  line-height: 1.55;
}

.promise-grid {
  display: grid;
  max-width: 690px;
  grid-template-columns: repeat(3, 1fr);
  margin-top: 58px;
  border-top: 1px solid var(--line);
}

.promise-grid div {
  padding: 20px 22px 4px 0;
  border-right: 1px solid var(--line);
}

.promise-grid div:last-child {
  border-right: 0;
}

.promise-grid span {
  display: block;
  margin-bottom: 9px;
  color: var(--muted);
  font-size: 13px;
}

.promise-grid strong {
  font-size: 19px;
}

.coach-card {
  overflow: hidden;
  min-height: 640px;
}

.browser-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 46px;
  border-bottom: 1px solid var(--line);
  padding: 0 18px;
  background: #faf7f1;
}

.browser-bar span {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #d9d1c4;
}

.browser-bar p {
  margin-left: auto;
  color: var(--muted);
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 12px;
}

.coach-body {
  padding: clamp(24px, 4vw, 48px);
}

.coach-message {
  margin: 28px 0 24px;
}

.coach-message h2 {
  max-width: 560px;
  margin: 8px 0 12px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(34px, 4vw, 54px);
  font-weight: 500;
  line-height: 1;
}

.coach-message p:not(.eyebrow) {
  max-width: 550px;
  margin: 0;
  color: var(--muted);
  font-size: 16px;
  line-height: 1.6;
}

.progress-label {
  display: block;
  margin-bottom: 10px;
  font-weight: 800;
}

.coach-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-top: 18px;
}

.error-text {
  color: var(--danger);
  font-weight: 700;
}

.approval {
  margin-top: 24px;
  border: 1px solid rgb(16 122 76 / 22%);
  border-radius: 14px;
  background: rgb(16 122 76 / 7%);
  padding: 14px 16px;
  color: var(--success);
  font-weight: 700;
}

@media (max-width: 980px) {
  .blocked-shell {
    grid-template-columns: 1fr;
  }

  .brand-row {
    margin-bottom: 36px;
  }

  .coach-card {
    min-height: auto;
  }
}

@media (max-width: 640px) {
  .blocked-shell {
    padding: 20px;
  }

  .promise-grid {
    grid-template-columns: 1fr;
  }

  .promise-grid div {
    border-right: 0;
  }
}
</style>
