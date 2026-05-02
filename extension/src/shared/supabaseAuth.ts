import { getState, mergeGoaldenStates, normalizeGoaldenState, saveState } from './state';
import type {
  GoaldenAuthView,
  GoaldenState,
  GoaldenTask,
  GoaldenUser,
  GoaldenViewState,
  ProgressLog,
  SiteId,
  TaskStatus
} from './types';

const SUPABASE_URL = 'https://rlhaibdgdgczlgpgdnag.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_UwRyoF8UlCtULcidz_-I0A_vTPLiPMO';
const AUTH_STORAGE_KEY = 'goalden-auth';

interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

interface SupabaseSessionResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: SupabaseUser | null;
  session?: SupabaseSessionResponse | null;
}

interface StoredAuth {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  user?: GoaldenUser | null;
  pendingEmail?: string;
  lastSyncedAt?: number;
  syncError?: string;
}

interface GoaldenSettingsRow {
  user_id: string;
  enabled_site_ids: SiteId[];
  break_minutes: number;
  active_task_id: string | null;
  unlocks: Partial<Record<SiteId, number>>;
}

interface GoaldenTaskRow {
  id: string;
  user_id: string;
  title: string;
  source: string;
  deadline: string;
  next_step: string;
  status: TaskStatus;
  created_at_bigint: number;
  updated_at_bigint: number;
}

interface GoaldenProgressRow {
  id: string;
  user_id: string;
  site_id: SiteId;
  task_id: string | null;
  task_title: string | null;
  text: string;
  created_at_bigint: number;
  unlock_until_bigint: number;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function toGoaldenUser(user?: SupabaseUser | null): GoaldenUser | null {
  if (!user?.id || !user.email) return null;
  const name = typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : undefined;
  return {
    id: user.id,
    email: user.email,
    name
  };
}

function authView(auth: StoredAuth | null): GoaldenAuthView {
  if (auth?.accessToken && auth.user) {
    return {
      status: 'signed-in',
      user: auth.user,
      lastSyncedAt: auth.lastSyncedAt,
      syncError: auth.syncError
    };
  }

  if (auth?.pendingEmail) {
    return {
      status: 'pending-confirmation',
      user: null,
      pendingEmail: auth.pendingEmail,
      syncError: auth.syncError
    };
  }

  return {
    status: 'signed-out',
    user: null,
    syncError: auth?.syncError
  };
}

async function getStoredAuth(): Promise<StoredAuth | null> {
  const result = await chrome.storage.local.get(AUTH_STORAGE_KEY);
  return (result[AUTH_STORAGE_KEY] as StoredAuth | undefined) ?? null;
}

async function saveAuth(auth: StoredAuth | null) {
  if (!auth) {
    await chrome.storage.local.remove(AUTH_STORAGE_KEY);
    return null;
  }
  await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: auth });
  return auth;
}

function sessionFromResponse(response: SupabaseSessionResponse): SupabaseSessionResponse | null {
  return response.session ?? (response.access_token ? response : null);
}

function storedAuthFromSession(session: SupabaseSessionResponse, fallbackUser?: SupabaseUser | null): StoredAuth {
  const expiresAt = session.expires_at ?? (session.expires_in ? nowSeconds() + session.expires_in : nowSeconds() + 3600);
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt,
    user: toGoaldenUser(session.user ?? fallbackUser),
    syncError: undefined
  };
}

async function supabaseAuthRequest<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken ?? SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });

  return parseSupabaseResponse<T>(response);
}

async function supabaseRestRequest<T>(path: string, init: RequestInit = {}, accessToken: string): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });

  return parseSupabaseResponse<T>(response);
}

async function parseSupabaseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      payload?.error_description ??
      payload?.msg ??
      payload?.message ??
      payload?.details ??
      payload?.error ??
      `Supabase request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

async function refreshSession(auth: StoredAuth): Promise<StoredAuth | null> {
  if (!auth.refreshToken) return null;
  const response = await supabaseAuthRequest<SupabaseSessionResponse>('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: auth.refreshToken })
  });
  const session = sessionFromResponse(response);
  if (!session?.access_token) return null;
  return saveAuth({
    ...auth,
    ...storedAuthFromSession(session),
    lastSyncedAt: auth.lastSyncedAt
  });
}

async function requireSession(): Promise<StoredAuth | null> {
  const auth = await getStoredAuth();
  if (!auth?.accessToken || !auth.user) return null;
  if ((auth.expiresAt ?? 0) > nowSeconds() + 60) return auth;
  return refreshSession(auth);
}

function taskToRow(task: GoaldenTask, userId: string): GoaldenTaskRow {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    source: task.source,
    deadline: task.deadline,
    next_step: task.nextStep,
    status: task.status,
    created_at_bigint: task.createdAt,
    updated_at_bigint: task.updatedAt
  };
}

function rowToTask(row: GoaldenTaskRow): GoaldenTask {
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    deadline: row.deadline,
    nextStep: row.next_step,
    status: row.status,
    createdAt: row.created_at_bigint,
    updatedAt: row.updated_at_bigint
  };
}

function progressId(item: ProgressLog) {
  return `progress-${item.createdAt}-${item.siteId}-${hashText(`${item.taskId ?? ''}:${item.text}`)}`;
}

function progressToRow(item: ProgressLog, userId: string): GoaldenProgressRow {
  return {
    id: progressId(item),
    user_id: userId,
    site_id: item.siteId,
    task_id: item.taskId ?? null,
    task_title: item.taskTitle ?? null,
    text: item.text,
    created_at_bigint: item.createdAt,
    unlock_until_bigint: item.unlockUntil
  };
}

function rowToProgress(row: GoaldenProgressRow): ProgressLog {
  return {
    siteId: row.site_id,
    taskId: row.task_id ?? undefined,
    taskTitle: row.task_title ?? undefined,
    text: row.text,
    createdAt: row.created_at_bigint,
    unlockUntil: row.unlock_until_bigint
  };
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

async function loadRemoteState(auth: StoredAuth): Promise<GoaldenState | null> {
  if (!auth.accessToken || !auth.user) return null;
  const userId = encodeURIComponent(auth.user.id);
  const [settingsRows, taskRows, progressRows] = await Promise.all([
    supabaseRestRequest<GoaldenSettingsRow[]>(
      `goalden_settings?select=*&user_id=eq.${userId}&limit=1`,
      { method: 'GET' },
      auth.accessToken
    ),
    supabaseRestRequest<GoaldenTaskRow[]>(
      `goalden_tasks?select=*&user_id=eq.${userId}&order=updated_at_bigint.desc`,
      { method: 'GET' },
      auth.accessToken
    ),
    supabaseRestRequest<GoaldenProgressRow[]>(
      `goalden_progress_logs?select=*&user_id=eq.${userId}&order=created_at_bigint.desc&limit=12`,
      { method: 'GET' },
      auth.accessToken
    )
  ]);

  const settings = settingsRows[0];
  if (!settings && !taskRows.length && !progressRows.length) return null;

  return normalizeGoaldenState({
    enabledSiteIds: settings?.enabled_site_ids,
    breakMinutes: settings?.break_minutes,
    activeTaskId: settings?.active_task_id ?? undefined,
    unlocks: settings?.unlocks,
    tasks: taskRows.map(rowToTask),
    progressLog: progressRows.map(rowToProgress)
  });
}

async function saveRemoteState(state: GoaldenState, auth: StoredAuth): Promise<StoredAuth> {
  if (!auth.accessToken || !auth.user) throw new Error('You are not signed in.');
  const userId = auth.user.id;
  const syncedAt = Date.now();

  await supabaseRestRequest(
    'goalden_profiles?on_conflict=user_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: userId,
        email: auth.user.email,
        name: auth.user.name ?? null
      })
    },
    auth.accessToken
  );

  await supabaseRestRequest(
    'goalden_settings?on_conflict=user_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: userId,
        enabled_site_ids: state.enabledSiteIds,
        break_minutes: state.breakMinutes,
        active_task_id: state.activeTaskId,
        unlocks: state.unlocks
      })
    },
    auth.accessToken
  );

  const encodedUserId = encodeURIComponent(userId);
  await Promise.all([
    supabaseRestRequest(
      `goalden_tasks?user_id=eq.${encodedUserId}`,
      { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
      auth.accessToken
    ),
    supabaseRestRequest(
      `goalden_progress_logs?user_id=eq.${encodedUserId}`,
      { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
      auth.accessToken
    )
  ]);

  if (state.tasks.length) {
    await supabaseRestRequest(
      'goalden_tasks?on_conflict=user_id,id',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(state.tasks.map(task => taskToRow(task, userId)))
      },
      auth.accessToken
    );
  }

  if (state.progressLog.length) {
    await supabaseRestRequest(
      'goalden_progress_logs?on_conflict=user_id,id',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(state.progressLog.map(item => progressToRow(item, userId)))
      },
      auth.accessToken
    );
  }

  const nextAuth: StoredAuth = {
    ...auth,
    lastSyncedAt: syncedAt,
    syncError: undefined
  };
  await saveAuth(nextAuth);
  return nextAuth;
}

async function mergeLocalWithRemote(auth: StoredAuth): Promise<GoaldenState> {
  const local = await getState();
  const remote = await loadRemoteState(auth);
  const merged = remote ? mergeGoaldenStates(local, remote) : local;
  const saved = await saveState(merged);
  await saveRemoteState(saved, auth);
  return saved;
}

export async function getAuthView(): Promise<GoaldenAuthView> {
  const auth = await getStoredAuth();
  if (!auth?.accessToken) return authView(auth);
  const active = await requireSession();
  return authView(active);
}

export async function getViewState(state?: GoaldenState): Promise<GoaldenViewState> {
  return {
    ...(state ?? (await getState())),
    auth: await getAuthView()
  };
}

export async function signUpWithEmail(email: string, password: string, name?: string): Promise<GoaldenViewState> {
  const response = await supabaseAuthRequest<SupabaseSessionResponse>('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      data: {
        name: name?.trim() || undefined
      }
    })
  });

  const session = sessionFromResponse(response);
  if (!session?.access_token) {
    await saveAuth({
      pendingEmail: email,
      user: toGoaldenUser(response.user),
      syncError: undefined
    });
    return getViewState();
  }

  const auth = await saveAuth(storedAuthFromSession(session, response.user));
  const state = await mergeLocalWithRemote(auth!);
  return getViewState(state);
}

export async function signInWithEmail(email: string, password: string): Promise<GoaldenViewState> {
  const response = await supabaseAuthRequest<SupabaseSessionResponse>('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });

  const session = sessionFromResponse(response);
  if (!session?.access_token) throw new Error('No session returned from Supabase.');
  const auth = await saveAuth(storedAuthFromSession(session, response.user ?? session.user));
  const state = await mergeLocalWithRemote(auth!);
  return getViewState(state);
}

export async function signOut(): Promise<GoaldenViewState> {
  const auth = await getStoredAuth();
  if (auth?.accessToken) {
    await supabaseAuthRequest('/auth/v1/logout', { method: 'POST', body: JSON.stringify({}) }, auth.accessToken).catch(
      () => undefined
    );
  }
  await saveAuth(null);
  return getViewState();
}

export async function syncStateToSupabase(state?: GoaldenState): Promise<GoaldenViewState> {
  const currentState = state ?? (await getState());
  const auth = await requireSession();
  if (!auth?.accessToken) return getViewState(currentState);

  try {
    const remoteState = state ? null : await loadRemoteState(auth);
    const saved = remoteState ? await saveState(mergeGoaldenStates(currentState, remoteState)) : currentState;
    await saveRemoteState(saved, auth);
    return getViewState(saved);
  } catch (error) {
    await saveAuth({
      ...auth,
      syncError: error instanceof Error ? error.message : 'Sync failed.'
    });
    return getViewState(currentState);
  }
}
