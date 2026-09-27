import type { ChecklistRun } from './types';

export interface RunStats {
  total: number;
  completed: number;
  deviations: number;
  pending: number;
  percent: number;
}

export function getRunStats(run: ChecklistRun): RunStats {
  const total = run.records.length;
  const completed = run.records.filter((record) => record.result === 'completed').length;
  const deviations = run.records.filter((record) => record.result === 'deviation').length;
  const pending = total - completed - deviations;
  const marked = completed + deviations;
  return { total, completed, deviations, pending, percent: total ? Math.round((marked / total) * 100) : 100 };
}

export function getRunBlockers(run: ChecklistRun): string[] {
  const stats = getRunStats(run);
  const blockers: string[] = [];
  if (stats.pending > 0) blockers.push(`还有 ${stats.pending} 项未选择完成或偏差`);
  const missingReason = run.records.filter((record) => record.result === 'deviation' && !record.reason.trim()).length;
  if (missingReason > 0) blockers.push(`${missingReason} 项偏差未填写原因`);
  const missingHandling = run.records.filter((record) => {
    if (record.result !== 'deviation' || record.handling.trim()) return false;
    return run.items.some((item) => item.id === record.itemId && item.critical);
  }).length;
  if (missingHandling > 0) blockers.push(`${missingHandling} 项关键偏差未填写处置`);
  return blockers;
}

export function canFinishRun(run: ChecklistRun): boolean {
  return !run.finishedAt && getRunBlockers(run).length === 0;
}

export const formatRunTime = (iso: string | null): string => (iso ? new Date(iso).toLocaleString('zh-CN') : '—');

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

export function buildRunReportHtml(run: ChecklistRun): string {
  const stats = getRunStats(run);
  const stages = run.stages.slice().sort((a, b) => a.order - b.order);

  const deviationRows = run.records
    .filter((record) => record.result === 'deviation')
    .map((record) => {
      const item = run.items.find((entry) => entry.id === record.itemId);
      if (!item) return '';
      const stage = run.stages.find((entry) => entry.id === item.stageId);
      return `<tr><td>${escapeHtml(stage?.name ?? '—')}</td><td>${item.critical ? '<strong class="critical">◆</strong> ' : ''}${escapeHtml(item.challenge)}</td><td>${escapeHtml(item.response || '未填写')}</td><td>${escapeHtml(record.reason)}</td><td>${escapeHtml(record.handling || '—')}</td></tr>`;
    })
    .join('');

  const stageSections = stages
    .map((stage) => {
      const rows = run.items
        .filter((item) => item.stageId === stage.id)
        .sort((a, b) => a.order - b.order)
        .map((item) => {
          const record = run.records.find((entry) => entry.itemId === item.id);
          const result = record?.result === 'deviation' ? '<span class="dev">偏差</span>' : record?.result === 'completed' ? '<span class="ok">完成</span>' : '—';
          const detail = record?.result === 'deviation'
            ? [record.reason.trim() && `原因：${record.reason.trim()}`, record.handling.trim() && `处置：${record.handling.trim()}`].filter(Boolean).join('；')
            : '';
          return `<tr><td>${item.critical ? '<strong class="critical">◆</strong> ' : ''}${escapeHtml(item.challenge)}</td><td>${escapeHtml(item.response || '未填写')}</td><td>${result}</td><td>${escapeHtml(detail) || '—'}</td></tr>`;
        })
        .join('');
      return `<section><h2>${escapeHtml(stage.name)}</h2><table><thead><tr><th>检查项</th><th>预期回应</th><th>结果</th><th>偏差与处置</th></tr></thead><tbody>${rows || '<tr><td colspan="4">本阶段暂无项目</td></tr>'}</tbody></table></section>`;
    })
    .join('');

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(run.checklistName)} r${run.revision} 执行报告</title><style>
    body{font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:#111;margin:36px}
    h1{margin:0 0 4px} .meta{color:#555;margin-bottom:6px} .summary{margin:14px 0 26px;padding:10px 14px;border:1px solid #ccc;border-radius:8px;background:#f6f7f9}
    h2{border-bottom:2px solid #222;padding-bottom:5px;margin-top:28px}
    table{width:100%;border-collapse:collapse} th,td{border:1px solid #bbb;padding:7px;text-align:left;vertical-align:top} th{background:#eee}
    .ok{color:#18794e;font-weight:700} .dev{color:#b25e09;font-weight:700} .critical{color:#cd2b31}
    @media print{body{margin:15mm}section{break-inside:avoid}}
  </style></head><body>
  <h1>${escapeHtml(run.checklistName)} · 执行报告</h1>
  <div class="meta">${escapeHtml(run.aircraft)} · 版本 r${run.revision}${run.revisionNote ? `（${escapeHtml(run.revisionNote)}）` : ''} · 只读报告</div>
  <div class="meta">运行人：${escapeHtml(run.operator)} · 说明：${escapeHtml(run.note || '—')}</div>
  <div class="meta">开始：${formatRunTime(run.startedAt)} · 结束：${formatRunTime(run.finishedAt)} · 导出 ${new Date().toLocaleString('zh-CN')}</div>
  <div class="summary"><strong>进度：</strong>共 ${stats.total} 项，完成 ${stats.completed} 项，偏差 ${stats.deviations} 项，标记率 ${stats.percent}%。</div>
  <section><h2>偏差与处置（${stats.deviations}）</h2>
    ${stats.deviations ? `<table><thead><tr><th>阶段</th><th>检查项</th><th>预期回应</th><th>偏差原因</th><th>处置</th></tr></thead><tbody>${deviationRows}</tbody></table>` : '<p>本次执行无偏差。</p>'}
  </section>
  ${stageSections}
  </body></html>`;
}
