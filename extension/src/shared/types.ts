export type SiteId = 'reddit' | 'youtube' | 'tiktok' | 'instagram';
export type TaskStatus = 'open' | 'done' | 'paused';
export type AuthStatus = 'signed-out' | 'signed-in' | 'pending-confirmation';

export interface TaskDraft {
  title: string;
  source: string;
  deadline: string;
  nextStep: string;
}

export type ExtensionMessage =
  | { type: 'get-state' }
  | { type: 'save-settings'; enabledSiteIds: SiteId[]; breakMinutes: number }
  | { type: 'create-task'; task: TaskDraft; activate?: boolean }
  | { type: 'update-task'; taskId: string; patch: Partial<TaskDraft & { status: TaskStatus }> }
  | { type: 'delete-task'; taskId: string }
  | { type: 'set-active-task'; taskId: string }
  | { type: 'approve-progress'; siteId: SiteId; progress: string; taskId?: string }
  | { type: 'auth-sign-up'; email: string; password: string; name?: string }
  | { type: 'auth-sign-in'; email: string; password: string }
  | { type: 'auth-sign-out' }
  | { type: 'sync-remote' }
  | { type: 'open-side-panel' }
  | { type: 'sync-rules' };

export interface BlockedSite {
  id: SiteId;
  label: string;
  host: string;
  domains: string[];
  ruleBaseId: number;
}

export interface ProgressLog {
  siteId: SiteId;
  taskId?: string;
  taskTitle?: string;
  text: string;
  createdAt: number;
  unlockUntil: number;
}

export interface GoaldenTask {
  id: string;
  title: string;
  source: string;
  deadline: string;
  nextStep: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
}

export interface GoaldenState {
  enabledSiteIds: SiteId[];
  breakMinutes: number;
  activeTaskId: string;
  tasks: GoaldenTask[];
  unlocks: Partial<Record<SiteId, number>>;
  progressLog: ProgressLog[];
}

export interface GoaldenUser {
  id: string;
  email: string;
  name?: string;
}

export interface GoaldenAuthView {
  status: AuthStatus;
  user: GoaldenUser | null;
  pendingEmail?: string;
  lastSyncedAt?: number;
  syncError?: string;
}

export type GoaldenViewState = GoaldenState & {
  auth: GoaldenAuthView;
};
