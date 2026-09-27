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

export type ExecutionStatus = 'in-progress' | 'completed';
export type ExecutionItemStatus = 'pending' | 'completed' | 'deviation';

export interface ExecutionItemRecord {
  itemId: string;
  status: ExecutionItemStatus;
  deviationReason: string;
  disposition: string;
  recordedAt: string;
}

export interface ChecklistExecution {
  id: string;
  revisionId: string;
  revision: number;
  operator: string;
  summary: string;
  startedAt: string;
  finishedAt: string;
  status: ExecutionStatus;
  records: ExecutionItemRecord[];
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
