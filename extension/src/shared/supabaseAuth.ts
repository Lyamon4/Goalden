import { getState, mergeGoaldenStates, normalizeGoaldenState, saveState } from './state';
import type { GoaldenAuthView, GoaldenState, GoaldenUser, GoaldenViewState } from './types';

const SUPABASE_URL = 'https://rlhaibdgdgczlgpgdnag.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_UwRyoF8UlCtULcidz_-I0A_vTPLiPMO';
const AUTH_STORAGE_KEY = 'goalden-auth';
const REMOTE_STATE_KEY = 'goalden_state';
const SYNCED_AT_KEY = 'goalden_synced_at';

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

async function supabaseRequest<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken ?? SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.error_description ??
      payload?.msg ??
      payload?.message ??
      payload?.error ??
      `Supabase request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

async function refreshSession(auth: StoredAuth): Promise<StoredAuth | null> {
  if (!auth.refreshToken) return null;
  const response = await supabaseRequest<SupabaseSessionResponse>('/auth/v1/token?grant_type=refresh_token', {
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

async function getSupabaseUser(auth: StoredAuth): Promise<SupabaseUser> {
  return supabaseRequest<SupabaseUser>('/auth/v1/user', { method: 'GET' }, auth.accessToken);
}

async function updateRemoteState(state: GoaldenState, auth: StoredAuth): Promise<StoredAuth> {
  if (!auth.accessToken) throw new Error('You are not signed in.');
  const syncedAt = Date.now();
  const user = await supabaseRequest<SupabaseUser>(
    '/auth/v1/user',
    {
      method: 'PUT',
      body: JSON.stringify({
        data: {
          [REMOTE_STATE_KEY]: normalizeGoaldenState(state),
          [SYNCED_AT_KEY]: syncedAt
        }
      })
    },
    auth.accessToken
  );

  const nextAuth: StoredAuth = {
    ...auth,
    user: toGoaldenUser(user) ?? auth.user,
    lastSyncedAt: syncedAt,
    syncError: undefined
  };
  await saveAuth(nextAuth);
  return nextAuth;
}

async function mergeLocalWithRemote(auth: StoredAuth, remoteUser?: SupabaseUser | null): Promise<GoaldenState> {
  const user = remoteUser ?? (auth.accessToken ? await getSupabaseUser(auth) : null);
  const local = await getState();
  const remoteState = user?.user_metadata?.[REMOTE_STATE_KEY];
  const merged = remoteState ? mergeGoaldenStates(local, remoteState) : local;
  const saved = await saveState(merged);
  await updateRemoteState(saved, auth);
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
  const response = await supabaseRequest<SupabaseSessionResponse>('/auth/v1/signup', {
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
  const state = await mergeLocalWithRemote(auth!, response.user ?? session.user);
  return getViewState(state);
}

export async function signInWithEmail(email: string, password: string): Promise<GoaldenViewState> {
  const response = await supabaseRequest<SupabaseSessionResponse>('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });

  const session = sessionFromResponse(response);
  if (!session?.access_token) throw new Error('No session returned from Supabase.');
  const auth = await saveAuth(storedAuthFromSession(session, response.user ?? session.user));
  const state = await mergeLocalWithRemote(auth!, response.user ?? session.user);
  return getViewState(state);
}

export async function signOut(): Promise<GoaldenViewState> {
  const auth = await getStoredAuth();
  if (auth?.accessToken) {
    await supabaseRequest('/auth/v1/logout', { method: 'POST', body: JSON.stringify({}) }, auth.accessToken).catch(
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
    const user = await getSupabaseUser(auth);
    const remoteState = user.user_metadata?.[REMOTE_STATE_KEY];
    const merged = remoteState ? mergeGoaldenStates(currentState, remoteState) : currentState;
    const saved = await saveState(merged);
    await updateRemoteState(saved, auth);
    return getViewState(saved);
  } catch (error) {
    await saveAuth({
      ...auth,
      syncError: error instanceof Error ? error.message : 'Sync failed.'
    });
    return getViewState(currentState);
  }
}
