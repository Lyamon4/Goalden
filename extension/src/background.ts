import {
  addTask,
  createUnlock,
  deleteTask,
  getState,
  saveState,
  setActiveTask,
  updateAiSettings,
  updateState,
  updateTask
} from './shared/state';
import {
  clearGroqApiKey,
  evaluatePageWithAi,
  getAiKeyStatus,
  pickSitesWithAi,
  reviewProgressWithAi,
  saveGroqApiKey
} from './shared/aiCoach';
import { findSiteByUrl, getAllRuleIds, SITES } from './shared/sites';
import { getAuthView, getViewState, signInWithEmail, signOut, signUpWithEmail, syncStateToSupabase } from './shared/supabaseAuth';
import type { ExtensionMessage, GoaldenState } from './shared/types';

const UNLOCK_ALARM = 'goalden-unlock-expired';

function configureSidePanel() {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => undefined);
}

async function syncRules() {
  const state = await getState();

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: getAllRuleIds()
  });

  await scheduleUnlockAlarm(state);
  await refreshOpenBlockedTabs();
}

async function scheduleUnlockAlarm(state: GoaldenState) {
  await chrome.alarms.clear(UNLOCK_ALARM);
  const now = Date.now();
  const nextUnlock = Object.values(state.unlocks)
    .filter((value): value is number => typeof value === 'number' && value > now)
    .sort((a, b) => a - b)[0];

  if (nextUnlock) {
    chrome.alarms.create(UNLOCK_ALARM, { when: nextUnlock + 250 });
  }
}

async function refreshOpenBlockedTabs() {
  const jobs: Promise<unknown>[] = [];
  for (const site of SITES) {
    const tabs = await chrome.tabs.query({
      url: [`*://${site.host}/*`, `*://*.${site.host}/*`]
    });

    for (const tab of tabs) {
      if (!tab.id) continue;
      jobs.push(
        chrome.tabs
          .sendMessage(tab.id, { type: 'goalden-evaluate' })
          .catch(() =>
            chrome.scripting.executeScript({
              target: { tabId: tab.id! },
              files: ['content.js']
            })
          )
      );
    }
  }

  await Promise.allSettled(jobs);
}

async function handleMessage(message: ExtensionMessage) {
  if (message.type === 'get-state') {
    return getViewState();
  }

  if (message.type === 'open-side-panel') {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.windowId) {
      await chrome.sidePanel.open({ windowId: activeTab.windowId }).catch(() => undefined);
    }
    return getViewState();
  }

  if (message.type === 'save-settings') {
    await requireSignedIn();
    const current = await getState();
    const state = await saveState({
      ...current,
      enabledSiteIds: message.enabledSiteIds,
      breakMinutes: message.breakMinutes
    });
    await syncRules();
    return syncStateToSupabase(state);
  }

  if (message.type === 'save-ai-settings') {
    await requireSignedIn();
    const state = await updateState(current => updateAiSettings(current, message.aiSettings));
    await syncRules();
    return syncStateToSupabase(state);
  }

  if (message.type === 'save-groq-api-key') {
    await requireSignedIn();
    return saveGroqApiKey(message.apiKey);
  }

  if (message.type === 'clear-groq-api-key') {
    await requireSignedIn();
    return clearGroqApiKey();
  }

  if (message.type === 'get-ai-key-status') {
    return getAiKeyStatus();
  }

  if (message.type === 'evaluate-page') {
    const state = await getState();
    const site = findSiteByUrl(message.url);
    if (!site) {
      return {
        shouldBlock: false,
        confidence: 0,
        reason: 'Goalden only reviews the feeds it can gate right now.',
        coachMessage: 'This page is outside the current Goalden gate.',
        question: 'What changed on your task?',
        source: 'fallback',
        evaluatedAt: Date.now()
      };
    }
    return evaluatePageWithAi(state, site, message.url, message.title);
  }

  if (message.type === 'pick-sites-with-ai') {
    await requireSignedIn();
    const current = await getState();
    const enabledSiteIds = await pickSitesWithAi(current);
    const state = await saveState({
      ...current,
      enabledSiteIds
    });
    await syncRules();
    return syncStateToSupabase(state);
  }

  if (message.type === 'create-task') {
    await requireSignedIn();
    const state = await updateState(current => addTask(current, message.task, message.activate ?? true));
    await syncRules();
    return syncStateToSupabase(state);
  }

  if (message.type === 'update-task') {
    await requireSignedIn();
    const state = await updateState(current => updateTask(current, message.taskId, message.patch));
    await syncRules();
    return syncStateToSupabase(state);
  }

  if (message.type === 'delete-task') {
    await requireSignedIn();
    const state = await updateState(current => deleteTask(current, message.taskId));
    await syncRules();
    return syncStateToSupabase(state);
  }

  if (message.type === 'set-active-task') {
    await requireSignedIn();
    const state = await updateState(current => setActiveTask(current, message.taskId));
    await syncRules();
    return syncStateToSupabase(state);
  }

  if (message.type === 'approve-progress') {
    await requireSignedIn();
    const current = await getState();
    const review = await reviewProgressWithAi(current, message.siteId, message.progress, current.progressLog);
    if (!review.approved) {
      throw new Error(review.coachMessage);
    }
    const state = await saveState(createUnlock(current, message.siteId, message.progress, message.taskId));
    await syncRules();
    return syncStateToSupabase(state);
  }

  if (message.type === 'auth-sign-up') {
    const state = await signUpWithEmail(message.email, message.password, message.name);
    await syncRules();
    return state;
  }

  if (message.type === 'auth-sign-in') {
    const state = await signInWithEmail(message.email, message.password);
    await syncRules();
    return state;
  }

  if (message.type === 'auth-sign-out') {
    return signOut();
  }

  if (message.type === 'sync-remote') {
    await requireSignedIn();
    const state = await syncStateToSupabase();
    await syncRules();
    return state;
  }

  if (message.type === 'sync-rules') {
    await syncRules();
    return getViewState();
  }

  return getViewState();
}

async function requireSignedIn() {
  const auth = await getAuthView();
  if (auth.status !== 'signed-in') {
    throw new Error('Create an account before using Goalden.');
  }
}

chrome.runtime.onInstalled.addListener(() => {
  configureSidePanel();
  syncRules();
});

chrome.runtime.onStartup.addListener(() => {
  configureSidePanel();
  syncRules();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes['goalden-state']) {
    syncRules();
  }
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === UNLOCK_ALARM) {
    syncRules();
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch(error => {
      sendResponse({ error: error instanceof Error ? error.message : 'Unknown extension error' });
    });
  return true;
});

configureSidePanel();
syncRules();
