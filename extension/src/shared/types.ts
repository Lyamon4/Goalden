export type SiteId = 'reddit' | 'youtube' | 'tiktok' | 'instagram';
export type TaskStatus = 'open' | 'done' | 'paused';
export type AuthStatus = 'signed-out' | 'signed-in' | 'pending-confirmation';
export type AiDecisionSource = 'ai' | 'fallback';
export type IntegrationProvider = 'telegram' | 'slack' | 'browser';
export type ConnectableIntegrationProvider = Exclude<IntegrationProvider, 'browser'>;
export type IntegrationStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TaskDraft {
  title: string;
  source: string;
  deadline: string;
  nextStep: string;
  sourceProvider?: IntegrationProvider;
  sourceExternalId?: string;
  evidenceSnippet?: string;
  confidence?: number;
}

export type ExtensionMessage =
  | { type: 'get-state' }
  | { type: 'save-settings'; enabledSiteIds: SiteId[]; breakMinutes: number }
  | { type: 'save-ai-settings'; aiSettings: Partial<AiSettings> }
  | { type: 'save-groq-api-key'; apiKey: string }
  | { type: 'clear-groq-api-key' }
  | { type: 'get-ai-key-status' }
  | { type: 'evaluate-page'; url: string; title?: string }
  | { type: 'pick-sites-with-ai' }
  | { type: 'create-task'; task: TaskDraft; activate?: boolean }
  | { type: 'update-task'; taskId: string; patch: Partial<TaskDraft & { status: TaskStatus }> }
  | { type: 'delete-task'; taskId: string }
  | { type: 'set-active-task'; taskId: string }
  | { type: 'approve-progress'; siteId: SiteId; progress: string; taskId?: string }
  | { type: 'auth-sign-up'; email: string; password: string; name?: string }
  | { type: 'auth-sign-in'; email: string; password: string }
  | { type: 'auth-sign-out' }
  | { type: 'sync-remote' }
  | { type: 'get-integrations' }
  | { type: 'get-task-candidates' }
  | { type: 'start-integration-connect'; provider: ConnectableIntegrationProvider }
  | { type: 'sync-integration'; provider: ConnectableIntegrationProvider }
  | { type: 'capture-browser-text'; text: string; sourceUrl?: string; sourceTitle?: string; mode?: 'selection' | 'page' }
  | { type: 'scan-current-page' }
  | { type: 'accept-task-candidate'; candidateId: string; activate?: boolean }
  | { type: 'dismiss-task-candidate'; candidateId: string }
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
  sourceProvider?: IntegrationProvider;
  sourceExternalId?: string;
  evidenceSnippet?: string;
  confidence?: number;
}

export interface GoaldenIntegration {
  id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  displayName: string;
  externalAccountId?: string;
  lastSyncedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface GoaldenTaskCandidate {
  id: string;
  provider: IntegrationProvider;
  integrationId?: string;
  sourceExternalId?: string;
  title: string;
  deadline: string;
  nextStep: string;
  confidence: number;
  evidenceSnippet: string;
  status: 'new' | 'accepted' | 'dismissed';
  createdAt: number;
  updatedAt: number;
}

export interface IntegrationSetupStatus {
  configured: boolean;
  missing: string[];
  message: string;
}

export interface GoaldenIntegrationHealth {
  telegram: IntegrationSetupStatus;
  slack: IntegrationSetupStatus;
  groq: IntegrationSetupStatus;
  checkedAt: number;
}

export interface AiSettings {
  enabled: boolean;
  model: string;
  sitePickingEnabled: boolean;
}

export interface AiDecision {
  shouldBlock: boolean;
  confidence: number;
  reason: string;
  coachMessage: string;
  question: string;
  source: AiDecisionSource;
  evaluatedAt: number;
}

export interface AiKeyStatus {
  hasKey: boolean;
  updatedAt?: number;
}

export interface GoaldenState {
  enabledSiteIds: SiteId[];
  breakMinutes: number;
  activeTaskId: string;
  tasks: GoaldenTask[];
  unlocks: Partial<Record<SiteId, number>>;
  progressLog: ProgressLog[];
  aiSettings: AiSettings;
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
  integrations: GoaldenIntegration[];
  taskCandidates: GoaldenTaskCandidate[];
  integrationHealth?: GoaldenIntegrationHealth;
};
