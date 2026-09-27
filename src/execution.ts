import type { ChecklistExecution, ChecklistItem, ChecklistProject, ChecklistRevision, ExecutionItemRecord, FlightStage } from './types';

export interface ExecutionItemView {
  item: ChecklistItem;
  record: ExecutionItemRecord;
  stage: FlightStage | undefined;
  stageName: string;
}

export interface ExecutionStats {
  total: number;
  handled: number;
  completed: number;
  deviations: number;
  pending: number;
  missingReason: number;
  missingDisposition: number;
  percent: number;
  canFinish: boolean;
}

export const formatDateTime = (value: string): string => (value ? new Date(value).toLocaleString('zh-CN') : '—');

export function findExecutionRevision(project: ChecklistProject, execution: ChecklistExecution): ChecklistRevision | undefined {
  return project.revisions.find((revision) => revision.id === execution.revisionId);
}

export function executionItemViews(project: ChecklistProject, execution: ChecklistExecution): ExecutionItemView[] {
  const revision = findExecutionRevision(project, execution);
  if (!revision) return [];
  const stageById = new Map(revision.stages.map((stage) => [stage.id, stage]));
  const recordByItemId = new Map(execution.records.map((record) => [record.itemId, record]));
  return revision.items
    .slice()
    .sort((a, b) => {
      const stageDelta = (stageById.get(a.stageId)?.order ?? 0) - (stageById.get(b.stageId)?.order ?? 0);
      return stageDelta || a.order - b.order;
    })
    .map((item) => {
      const stage = stageById.get(item.stageId);
      return {
        item,
        stage,
        stageName: stage?.name ?? '未分配阶段',
        record: recordByItemId.get(item.id) ?? { itemId: item.id, status: 'pending', deviationReason: '', disposition: '', recordedAt: '' }
      };
    });
}

export function executionStats(views: ExecutionItemView[]): ExecutionStats {
  const total = views.length;
  const completed = views.filter((view) => view.record.status === 'completed').length;
  const deviations = views.filter((view) => view.record.status === 'deviation').length;
  const pending = total - completed - deviations;
  const missingReason = views.filter((view) => view.record.status === 'deviation' && !view.record.deviationReason.trim()).length;
  const missingDisposition = views.filter((view) => view.record.status === 'deviation' && view.item.critical && !view.record.disposition.trim()).length;
  const handled = total - pending;
  return {
    total,
    handled,
    completed,
    deviations,
    pending,
    missingReason,
    missingDisposition,
    percent: total ? Math.round((handled / total) * 100) : 0,
    canFinish: pending === 0 && missingReason === 0 && missingDisposition === 0
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

export function buildExecutionReportHtml(project: ChecklistProject, execution: ChecklistExecution): string {
  const views = executionItemViews(project, execution);
  const stats = executionStats(views);
  const revision = findExecutionRevision(project, execution);
  const deviations = views.filter((view) => view.record.status === 'deviation');
  const statusLabel = { pending: '未处理', completed: '完成', deviation: '偏差' } as const;

  const deviationRows = deviations.map((view) => `
    <tr><td>${escapeHtml(view.stageName)}</td><td>${view.item.critical ? '<strong>◆</strong> ' : ''}${escapeHtml(view.item.challenge || '未命名检查项')}</td><td>${escapeHtml(view.item.response || '—')}</td><td>${escapeHtml(view.record.deviationReason || '—')}</td><td>${escapeHtml(view.record.disposition || '—')}</td></tr>
  `).join('');

  const resultRows = views.map((view) => `
    <tr><td>${escapeHtml(view.stageName)}</td><td>${view.item.critical ? '<strong>◆</strong> ' : ''}${escapeHtml(view.item.challenge || '未命名检查项')}</td><td>${escapeHtml(view.item.response || '—')}</td><td class="status-${view.record.status}">${statusLabel[view.record.status]}</td><td>${escapeHtml(formatDateTime(view.record.recordedAt))}</td></tr>
  `).join('');

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(project.name)} · r${execution.revision} 执行报告</title><style>
    body{font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111;margin:36px}
    h1{margin:0 0 4px} .meta{color:#666;margin-bottom:6px} h2{border-bottom:2px solid #222;padding-bottom:5px;margin-top:26px}
    table{width:100%;border-collapse:collapse} th,td{border:1px solid #bbb;padding:7px;text-align:left;vertical-align:top} th{background:#eee}
    .summary{background:#f4f4f4;border:1px solid #ddd;border-radius:8px;padding:10px;margin:14px 0}
    .stats{display:flex;gap:18px;margin:16px 0;flex-wrap:wrap} .stats div{border:1px solid #ccc;border-radius:8px;padding:8px 16px} .stats strong{display:block;font-size:18px}
    .status-completed{color:#18794e;font-weight:700} .status-deviation{color:#cd2b31;font-weight:700} .status-pending{color:#888}
    @media print{body{margin:15mm}section{break-inside:avoid}}
  </style></head><body>
  <h1>${escapeHtml(project.name)} · 执行报告</h1>
  <div class="meta">${escapeHtml(project.aircraft)} · 冻结版本 r${execution.revision}${revision?.note ? `（${escapeHtml(revision.note)}）` : ''} · 导出 ${escapeHtml(new Date().toLocaleString('zh-CN'))}</div>
  <div class="meta">运行人：${escapeHtml(execution.operator || '—')} · 开始：${escapeHtml(formatDateTime(execution.startedAt))} · 结束：${escapeHtml(formatDateTime(execution.finishedAt))}</div>
  ${execution.summary ? `<div class="summary"><strong>说明：</strong>${escapeHtml(execution.summary)}</div>` : ''}
  <div class="stats">
    <div><strong>${stats.total}</strong>检查项</div>
    <div><strong>${stats.completed}</strong>完成</div>
    <div><strong>${stats.deviations}</strong>偏差</div>
    <div><strong>${stats.percent}%</strong>处理进度</div>
  </div>
  <section><h2>偏差与处置（${deviations.length}）</h2>
    ${deviations.length ? `<table><thead><tr><th>阶段</th><th>检查项</th><th>预期回应</th><th>偏差原因</th><th>处置</th></tr></thead><tbody>${deviationRows}</tbody></table>` : '<p>本次执行全部按检查单完成，无偏差。</p>'}
  </section>
  <section><h2>逐项结果</h2>
    <table><thead><tr><th>阶段</th><th>挑战语</th><th>预期回应</th><th>结果</th><th>记录时间</th></tr></thead><tbody>${resultRows || '<tr><td colspan="5">该版本没有检查项</td></tr>'}</tbody></table>
  </section>
  </body></html>`;
}
