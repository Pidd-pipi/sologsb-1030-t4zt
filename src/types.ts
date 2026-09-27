export type WorkflowStatus = 'draft' | 'review' | 'frozen';
export type IssueLevel = 'error' | 'warning' | 'info';
export type IssueType = 'duplicate' | 'missing-response' | 'unreachable-precondition' | 'stage-order' | 'orphan-stage';

export interface FlightStage {
  id: string;
  name: string;
  order: number;
  description: string;
}

export interface ChecklistItem {
  id: string;
  stageId: string;
  order: number;
  challenge: string;
  response: string;
  critical: boolean;
  preconditionIds: string[];
  abnormalProcedure: string;
  updatedAt: string;
}

export interface ChecklistRevision {
  id: string;
  revision: number;
  status: WorkflowStatus;
  createdAt: string;
  note: string;
  stages: FlightStage[];
  items: ChecklistItem[];
}

export interface ChecklistProject {
  id: string;
  name: string;
  aircraft: string;
  revision: number;
  status: WorkflowStatus;
  updatedAt: string;
  reviewNote: string;
  stages: FlightStage[];
  items: ChecklistItem[];
  revisions: ChecklistRevision[];
}

export interface WorkspaceState {
  schemaVersion: 1;
  selectedProjectId: string;
  projects: ChecklistProject[];
}

export type RunItemResult = 'completed' | 'deviation';

export interface ChecklistRunRecord {
  itemId: string;
  result: RunItemResult | null;
  reason: string;
  handling: string;
  recordedAt: string | null;
}

export interface ChecklistRun {
  id: string;
  projectId: string;
  revisionId: string;
  revision: number;
  revisionNote: string;
  checklistName: string;
  aircraft: string;
  operator: string;
  note: string;
  startedAt: string;
  finishedAt: string | null;
  stages: FlightStage[];
  items: ChecklistItem[];
  records: ChecklistRunRecord[];
}

export interface ValidationIssue {
  id: string;
  type: IssueType;
  level: IssueLevel;
  stageId?: string;
  itemId?: string;
  title: string;
  detail: string;
}

export interface VersionOption {
  id: string;
  label: string;
}

export interface DiffEntry {
  type: 'added' | 'removed' | 'changed' | 'stage';
  key: string;
  stage: string;
  before: string;
  after: string;
}
