import { addTask, createUnlock, deleteTask, getState, saveState, setActiveTask, updateState, updateTask } from './shared/state';
import { getAllRuleIds, SITES } from './shared/sites';
import { getViewState, signInWithEmail, signOut, signUpWithEmail, syncStateToSupabase } from './shared/supabaseAuth';
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
    const current = await getState();
    const state = await saveState({
      ...current,
      enabledSiteIds: message.enabledSiteIds,
      breakMinutes: message.breakMinutes
    });
    await syncRules();
    return syncStateToSupabase(state);
  }

  if (message.type === 'create-task') {
    const state = await updateState(current => addTask(current, message.task, message.activate ?? true));
    await syncRules();
    return syncStateToSupabase(state);
  }

  if (message.type === 'update-task') {
    const state = await updateState(current => updateTask(current, message.taskId, message.patch));
    await syncRules();
    return syncStateToSupabase(state);
  }

  if (message.type === 'delete-task') {
    const state = await updateState(current => deleteTask(current, message.taskId));
    await syncRules();
    return syncStateToSupabase(state);
  }

  if (message.type === 'set-active-task') {
    const state = await updateState(current => setActiveTask(current, message.taskId));
    await syncRules();
    return syncStateToSupabase(state);
  }

  if (message.type === 'approve-progress') {
    const state = await updateState(current => createUnlock(current, message.siteId, message.progress, message.taskId));
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
