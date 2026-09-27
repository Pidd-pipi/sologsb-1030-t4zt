import { useCallback, useEffect, useRef, useState } from 'react';
import { createInitialState } from './data';
import { executionItemViews, executionStats } from './execution';
import type { ChecklistExecution, ChecklistItem, ChecklistProject, ChecklistRevision, ExecutionItemRecord, ExecutionItemStatus, FlightStage, WorkspaceState } from './types';

const STORAGE_KEY = 'sologsb-1030-workspace-v1';
const EXECUTIONS_KEY = 'sologsb-1030-executions-v1';
const NO_EXECUTIONS: ChecklistExecution[] = [];
const clone = <T>(value: T): T => structuredClone(value);
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const now = () => new Date().toISOString();

interface ExecutionStoreState {
  schemaVersion: 1;
  byProject: Record<string, ChecklistExecution[]>;
}

function loadExecutions(): ExecutionStoreState {
  try {
    const saved = localStorage.getItem(EXECUTIONS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as ExecutionStoreState;
      if (parsed.schemaVersion === 1 && parsed.byProject) return parsed;
    }
  } catch {
    // Corrupted execution records fall back to an empty list.
  }
  return { schemaVersion: 1, byProject: {} };
}

function loadState(): WorkspaceState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as WorkspaceState;
      if (parsed.schemaVersion === 1 && parsed.projects?.length) return parsed;
    }
  } catch {
    // Corrupted local draft falls back to the bundled operational checklist.
  }
  return createInitialState();
}

function updateSelected(state: WorkspaceState, mutator: (project: ChecklistProject) => void): WorkspaceState {
  const next = clone(state);
  const project = next.projects.find((entry) => entry.id === next.selectedProjectId);
  if (project) {
    mutator(project);
    project.updatedAt = now();
  }
  return next;
}

export function useChecklistStore() {
  const [state, setState] = useState<WorkspaceState>(loadState);
  const past = useRef<WorkspaceState[]>([]);
  const future = useRef<WorkspaceState[]>([]);
  const [, forceHistoryState] = useState(0);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const commit = useCallback((mutator: (project: ChecklistProject) => void) => {
    setState((current) => {
      past.current = [...past.current.slice(-39), clone(current)];
      future.current = [];
      forceHistoryState((value) => value + 1);
      return updateSelected(current, (project) => {
        if (project.status !== 'draft') return;
        mutator(project);
      });
    });
  }, []);

  const directUpdate = useCallback((mutator: (project: ChecklistProject) => void) => {
    setState((current) => {
      past.current = [...past.current.slice(-39), clone(current)];
      future.current = [];
      forceHistoryState((value) => value + 1);
      return updateSelected(current, mutator);
    });
  }, []);

  const selectedProject = state.projects.find((project) => project.id === state.selectedProjectId) ?? state.projects[0];

  const [executionStore, setExecutionStore] = useState<ExecutionStoreState>(loadExecutions);

  useEffect(() => {
    localStorage.setItem(EXECUTIONS_KEY, JSON.stringify(executionStore));
  }, [executionStore]);

  const executions = executionStore.byProject[selectedProject.id] ?? NO_EXECUTIONS;

  // Execution records live outside the undo history so edit/review/freeze flows stay untouched.
  const mutateExecutions = useCallback((mutator: (list: ChecklistExecution[]) => void) => {
    const projectId = selectedProject.id;
    setExecutionStore((current) => {
      const next = clone(current);
      const list = next.byProject[projectId] ?? [];
      mutator(list);
      next.byProject[projectId] = list;
      return next;
    });
  }, [selectedProject.id]);

  const startExecution = useCallback((revision: ChecklistRevision, operator: string, summary: string) => {
    const id = uid('execution');
    mutateExecutions((list) => {
      if (list.some((execution) => execution.status === 'in-progress')) return;
      list.unshift({
        id,
        revisionId: revision.id,
        revision: revision.revision,
        operator: operator.trim(),
        summary: summary.trim(),
        startedAt: now(),
        finishedAt: '',
        status: 'in-progress',
        records: revision.items.map((item) => ({ itemId: item.id, status: 'pending', deviationReason: '', disposition: '', recordedAt: '' }))
      });
    });
    return id;
  }, [mutateExecutions]);

  const setExecutionItemStatus = useCallback((executionId: string, itemId: string, status: ExecutionItemStatus) => {
    mutateExecutions((list) => {
      const execution = list.find((entry) => entry.id === executionId && entry.status === 'in-progress');
      const record = execution?.records.find((entry) => entry.itemId === itemId);
      if (!record) return;
      record.status = status;
      record.recordedAt = status === 'pending' ? '' : now();
    });
  }, [mutateExecutions]);

  const updateExecutionRecord = useCallback((executionId: string, itemId: string, patch: Partial<Pick<ExecutionItemRecord, 'deviationReason' | 'disposition'>>) => {
    mutateExecutions((list) => {
      const execution = list.find((entry) => entry.id === executionId && entry.status === 'in-progress');
      const record = execution?.records.find((entry) => entry.itemId === itemId);
      if (record) Object.assign(record, patch);
    });
  }, [mutateExecutions]);

  const finishExecution = useCallback((project: ChecklistProject, executionId: string) => {
    mutateExecutions((list) => {
      const execution = list.find((entry) => entry.id === executionId && entry.status === 'in-progress');
      if (!execution) return;
      if (!executionStats(executionItemViews(project, execution)).canFinish) return;
      execution.status = 'completed';
      execution.finishedAt = now();
    });
  }, [mutateExecutions]);

  const discardExecution = useCallback((executionId: string) => {
    mutateExecutions((list) => {
      const index = list.findIndex((entry) => entry.id === executionId && entry.status === 'in-progress');
      if (index >= 0) list.splice(index, 1);
    });
  }, [mutateExecutions]);

  const selectProject = useCallback((id: string) => {
    setState((current) => ({ ...current, selectedProjectId: id }));
  }, []);

  const addProject = useCallback(() => {
    const id = uid('project');
    setState((current) => {
      past.current = [...past.current.slice(-39), clone(current)];
      future.current = [];
      const next = clone(current);
      next.projects.push({
        id,
        name: 'Untitled checklist',
        aircraft: '新机型',
        revision: 1,
        status: 'draft',
        updatedAt: now(),
        reviewNote: '',
        stages: [{ id: uid('stage'), name: '飞行前检查', order: 0, description: '说明本阶段目标。' }],
        items: [],
        revisions: []
      });
      next.selectedProjectId = id;
      return next;
    });
  }, []);

  const updateProject = useCallback((patch: Partial<ChecklistProject>) => {
    commit((project) => {
      Object.assign(project, patch);
    });
  }, [commit]);

  const addStage = useCallback(() => {
    commit((project) => {
      project.stages.push({ id: uid('stage'), name: '新飞行阶段', order: project.stages.length, description: '描述阶段目标和适用条件。' });
    });
  }, [commit]);

  const updateStage = useCallback((stageId: string, patch: Partial<FlightStage>) => {
    commit((project) => {
      const stage = project.stages.find((entry) => entry.id === stageId);
      if (stage) Object.assign(stage, patch);
    });
  }, [commit]);

  const moveStage = useCallback((stageId: string, direction: -1 | 1) => {
    commit((project) => {
      project.stages.sort((a, b) => a.order - b.order);
      const index = project.stages.findIndex((entry) => entry.id === stageId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= project.stages.length) return;
      [project.stages[index], project.stages[target]] = [project.stages[target], project.stages[index]];
      project.stages.forEach((entry, order) => { entry.order = order; });
    });
  }, [commit]);

  const deleteStage = useCallback((stageId: string) => {
    commit((project) => {
      if (project.items.some((item) => item.stageId === stageId)) return;
      project.stages = project.stages.filter((stage) => stage.id !== stageId).sort((a, b) => a.order - b.order);
      project.stages.forEach((stage, order) => { stage.order = order; });
    });
  }, [commit]);

  const addItem = useCallback((stageId: string, challenge = '', response = '') => {
    const id = uid('item');
    commit((project) => {
      const stage = project.stages.find((entry) => entry.id === stageId);
      if (!stage) return;
      const order = project.items.filter((item) => item.stageId === stageId).length;
      project.items.push({ id, stageId, order, challenge, response, critical: false, preconditionIds: [], abnormalProcedure: '', updatedAt: now() });
    });
    return id;
  }, [commit]);

  const updateItem = useCallback((itemId: string, patch: Partial<ChecklistItem>) => {
    commit((project) => {
      const item = project.items.find((entry) => entry.id === itemId);
      if (item) Object.assign(item, patch, { updatedAt: now() });
    });
  }, [commit]);

  const deleteItem = useCallback((itemId: string) => {
    commit((project) => {
      project.items = project.items.filter((item) => item.id !== itemId);
      project.items.forEach((item) => { item.preconditionIds = item.preconditionIds.filter((id) => id !== itemId); });
      project.stages.forEach((stage) => {
        project.items.filter((item) => item.stageId === stage.id).sort((a, b) => a.order - b.order).forEach((item, order) => { item.order = order; });
      });
    });
  }, [commit]);

  const reorderItem = useCallback((sourceId: string, targetId: string, before = true) => {
    commit((project) => {
      const source = project.items.find((item) => item.id === sourceId);
      const target = project.items.find((item) => item.id === targetId);
      if (!source || !target || source.id === target.id) return;
      source.stageId = target.stageId;
      const siblings = project.items.filter((item) => item.stageId === target.stageId && item.id !== source.id).sort((a, b) => a.order - b.order);
      const targetIndex = siblings.findIndex((item) => item.id === target.id);
      siblings.splice(Math.max(0, targetIndex + (before ? 0 : 1)), 0, source);
      siblings.forEach((item, order) => { item.order = order; });
    });
  }, [commit]);

  const nudgeItem = useCallback((itemId: string, direction: -1 | 1) => {
    commit((project) => {
      const item = project.items.find((entry) => entry.id === itemId);
      if (!item) return;
      const siblings = project.items.filter((entry) => entry.stageId === item.stageId).sort((a, b) => a.order - b.order);
      const index = siblings.findIndex((entry) => entry.id === itemId);
      const target = index + direction;
      if (target < 0 || target >= siblings.length) return;
      [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
      siblings.forEach((entry, order) => { entry.order = order; });
    });
  }, [commit]);

  const submitForReview = useCallback(() => {
    directUpdate((project) => {
      project.status = 'review';
      project.reviewNote = '';
    });
  }, [directUpdate]);

  const freezeRevision = useCallback((note: string) => {
    directUpdate((project) => {
      const version = project.revision;
      const snapshot: ChecklistRevision = {
        id: uid('revision'),
        revision: version,
        status: 'frozen',
        createdAt: now(),
        note: note.trim() || '复核通过并冻结',
        stages: clone(project.stages),
        items: clone(project.items)
      };
      project.revisions.unshift(snapshot);
      project.status = 'frozen';
      project.reviewNote = note.trim();
    });
  }, [directUpdate]);

  const createRevision = useCallback(() => {
    directUpdate((project) => {
      project.revision += 1;
      project.status = 'draft';
      project.reviewNote = '';
      project.updatedAt = now();
    });
  }, [directUpdate]);

  const undo = useCallback(() => {
    setState((current) => {
      const previous = past.current.pop();
      if (!previous) return current;
      future.current = [clone(current), ...future.current].slice(0, 40);
      forceHistoryState((value) => value + 1);
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    setState((current) => {
      const next = future.current.shift();
      if (!next) return current;
      past.current = [...past.current.slice(-39), clone(current)];
      forceHistoryState((value) => value + 1);
      return next;
    });
  }, []);

  const saveNow = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setState((current) => updateSelected(current, () => undefined));
  }, [state]);

  return {
    state,
    selectedProject,
    executions,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    selectProject,
    addProject,
    updateProject,
    addStage,
    updateStage,
    moveStage,
    deleteStage,
    addItem,
    updateItem,
    deleteItem,
    reorderItem,
    nudgeItem,
    submitForReview,
    freezeRevision,
    createRevision,
    startExecution,
    setExecutionItemStatus,
    updateExecutionRecord,
    finishExecution,
    discardExecution,
    undo,
    redo,
    saveNow
  };
}
