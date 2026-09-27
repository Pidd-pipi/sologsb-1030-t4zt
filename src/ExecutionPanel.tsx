import { useEffect, useState } from 'react';
import { Badge, Button, Callout, Card, Flex, Heading, Progress, Select, Text, TextArea, TextField } from '@radix-ui/themes';
import { buildExecutionReportHtml, executionItemViews, executionStats, findExecutionRevision, formatDateTime } from './execution';
import type { ExecutionItemView } from './execution';
import type { useChecklistStore } from './store';
import type { ChecklistExecution, ChecklistProject } from './types';

type Store = ReturnType<typeof useChecklistStore>;

export function ExecutionPanel({ project, store }: { project: ChecklistProject; store: Store }) {
  const executions = store.executions;
  const [activeExecutionId, setActiveExecutionId] = useState('');
  const [revisionId, setRevisionId] = useState('');
  const [operator, setOperator] = useState('');
  const [summary, setSummary] = useState('');

  useEffect(() => {
    if (!executions.some((execution) => execution.id === activeExecutionId)) {
      setActiveExecutionId(executions[0]?.id ?? '');
    }
  }, [executions, activeExecutionId]);

  useEffect(() => {
    if (!project.revisions.some((revision) => revision.id === revisionId)) {
      setRevisionId(project.revisions[0]?.id ?? '');
    }
  }, [project.revisions, revisionId]);

  const running = executions.find((execution) => execution.status === 'in-progress');
  const active = executions.find((execution) => execution.id === activeExecutionId);

  function startExecution() {
    const revision = project.revisions.find((entry) => entry.id === revisionId);
    if (!revision || !operator.trim()) return;
    const id = store.startExecution(revision, operator, summary);
    setActiveExecutionId(id);
    setSummary('');
  }

  if (running) {
    return <ExecutionRunner project={project} execution={running} store={store} />;
  }

  return (
    <div className="content-page">
      <Heading size="7">执行记录</Heading>
      <Text color="gray" as="p">从冻结版本发起执行：填写运行人和说明后逐项标记完成或偏差；偏差需写明原因，关键项偏差需补充处置，全部处理完才能结束并生成只读报告。</Text>

      {project.revisions.length ? (
        <Card className="exec-start-card">
          <Heading size="4">开始新的执行</Heading>
          <div className="exec-start-grid">
            <label>
              <span>冻结版本</span>
              <Select.Root value={revisionId || undefined} onValueChange={setRevisionId}>
                <Select.Trigger variant="soft" aria-label="选择冻结版本" />
                <Select.Content position="popper">
                  {project.revisions.map((revision) => (
                    <Select.Item key={revision.id} value={revision.id}>r{revision.revision} · {new Date(revision.createdAt).toLocaleDateString('zh-CN')} · {revision.note}</Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </label>
            <label>
              <span>运行人</span>
              <TextField.Root value={operator} placeholder="姓名 / 机组（必填）" onChange={(event) => setOperator(event.target.value)} />
            </label>
            <label className="exec-start-summary">
              <span>说明</span>
              <TextArea value={summary} placeholder="本次执行的航班、任务或背景说明" onChange={(event) => setSummary(event.target.value)} />
            </label>
          </div>
          <Flex justify="end">
            <Button disabled={!revisionId || !operator.trim()} onClick={startExecution}>开始执行</Button>
          </Flex>
        </Card>
      ) : (
        <Callout.Root color="amber" mb="4">
          <Callout.Text>还没有冻结版本。请先完成「编辑 → 复核 → 冻结」流程，冻结后才能从该版本开始执行。</Callout.Text>
        </Callout.Root>
      )}

      {executions.length ? (
        <>
          <Heading size="4" mb="3">执行历史（最近一次在最前）</Heading>
          <div className="exec-history">
            {executions.map((execution) => (
              <button key={execution.id} className={`exec-history-item ${execution.id === activeExecutionId ? 'active' : ''}`} onClick={() => setActiveExecutionId(execution.id)}>
                <Flex gap="2" align="center">
                  <strong>r{execution.revision} · {execution.operator || '未填写运行人'}</strong>
                  <Badge size="1" color={execution.status === 'completed' ? 'green' : 'amber'}>{execution.status === 'completed' ? '已结束' : '执行中'}</Badge>
                </Flex>
                <small>{formatDateTime(execution.startedAt)}</small>
              </button>
            ))}
          </div>
          {active && <ExecutionReport project={project} execution={active} />}
        </>
      ) : (
        <div className="empty-page"><strong>暂无执行记录</strong><span>选择冻结版本、填写运行人后开始第一次执行。</span></div>
      )}
    </div>
  );
}

function ExecutionRunner({ project, execution, store }: { project: ChecklistProject; execution: ChecklistExecution; store: Store }) {
  const views = executionItemViews(project, execution);
  const stats = executionStats(views);
  const revision = findExecutionRevision(project, execution);
  const stages = (revision?.stages ?? []).slice().sort((a, b) => a.order - b.order);
  const blockers = [
    stats.pending ? `${stats.pending} 项未处理` : '',
    stats.missingReason ? `${stats.missingReason} 个偏差缺少原因` : '',
    stats.missingDisposition ? `${stats.missingDisposition} 个关键偏差缺少处置` : ''
  ].filter(Boolean);

  return (
    <div className="content-page">
      <Flex justify="between" align="start" mb="3">
        <div>
          <Heading size="7">执行检查单 · r{execution.revision}</Heading>
          <Text color="gray" as="p">运行人 {execution.operator} · 开始于 {formatDateTime(execution.startedAt)}{execution.summary ? ` · ${execution.summary}` : ''}</Text>
        </div>
        <Badge color="amber" size="2">执行中</Badge>
      </Flex>

      <Card className="exec-progress-card">
        <Flex justify="between" mb="2">
          <Text size="2" weight="bold">进度 {stats.handled}/{stats.total}</Text>
          <Text size="2" color="gray">{stats.completed} 完成 · {stats.deviations} 偏差 · {stats.percent}%</Text>
        </Flex>
        <Progress value={stats.percent} color={stats.deviations ? 'amber' : 'green'} />
      </Card>

      {stages.map((stage) => {
        const stageViews = views.filter((view) => view.item.stageId === stage.id);
        if (!stageViews.length) return null;
        const handled = stageViews.filter((view) => view.record.status !== 'pending').length;
        return (
          <Card key={stage.id} className="exec-stage-card">
            <header className="exec-stage-head">
              <Heading size="4">{stage.name}</Heading>
              <Text size="1" color="gray">{handled}/{stageViews.length} 已处理</Text>
            </header>
            {stageViews.map((view) => <ExecutionRow key={view.item.id} view={view} execution={execution} store={store} />)}
          </Card>
        );
      })}

      <Flex justify="between" align="center" gap="3" className="exec-footer">
        <Button color="red" variant="soft" onClick={() => { if (window.confirm('放弃本次执行？已填写的内容将被删除。')) store.discardExecution(execution.id); }}>放弃执行</Button>
        <Text size="2" color={blockers.length ? 'amber' : 'gray'}>{blockers.length ? `还不能结束：${blockers.join(' · ')}` : '全部项目已处理，可以结束。'}</Text>
        <Button color="green" disabled={!stats.canFinish} onClick={() => store.finishExecution(project, execution.id)}>结束执行并生成报告</Button>
      </Flex>
    </div>
  );
}

function ExecutionRow({ view, execution, store }: { view: ExecutionItemView; execution: ChecklistExecution; store: Store }) {
  const { item, record } = view;
  return (
    <div className={`exec-row status-${record.status}`}>
      <div className="exec-row-main">
        <div className="check-item-copy">
          <Flex gap="2" align="center" wrap="wrap">
            <strong>{item.challenge || '未命名检查项'}</strong>
            {item.critical && <Badge color="red" size="1">关键</Badge>}
            <Badge size="1" variant="soft" color={record.status === 'completed' ? 'green' : record.status === 'deviation' ? 'red' : 'gray'}>
              {record.status === 'completed' ? '已完成' : record.status === 'deviation' ? '偏差' : '待处理'}
            </Badge>
          </Flex>
          <span className="response-preview">{item.response || '未填写回应'}</span>
          {item.abnormalProcedure && <small>异常处置参考：{item.abnormalProcedure}</small>}
        </div>
        <div className="exec-row-actions">
          <Button size="1" color="green" variant={record.status === 'completed' ? 'solid' : 'soft'} onClick={() => store.setExecutionItemStatus(execution.id, item.id, record.status === 'completed' ? 'pending' : 'completed')}>完成</Button>
          <Button size="1" color="red" variant={record.status === 'deviation' ? 'solid' : 'soft'} onClick={() => store.setExecutionItemStatus(execution.id, item.id, record.status === 'deviation' ? 'pending' : 'deviation')}>偏差</Button>
        </div>
      </div>
      {record.status === 'deviation' && (
        <div className="exec-deviation-form">
          <TextArea size="1" placeholder="偏差原因（必填）" value={record.deviationReason} onChange={(event) => store.updateExecutionRecord(execution.id, item.id, { deviationReason: event.target.value })} />
          {item.critical && <TextArea size="1" placeholder="关键项处置措施（必填）" value={record.disposition} onChange={(event) => store.updateExecutionRecord(execution.id, item.id, { disposition: event.target.value })} />}
        </div>
      )}
    </div>
  );
}

function ExecutionReport({ project, execution }: { project: ChecklistProject; execution: ChecklistExecution }) {
  const views = executionItemViews(project, execution);
  const stats = executionStats(views);
  const revision = findExecutionRevision(project, execution);
  const deviations = views.filter((view) => view.record.status === 'deviation');

  return (
    <article className="print-sheet exec-report">
      <header>
        <div>
          <Heading size="7">执行报告 · r{execution.revision}</Heading>
          <Text color="gray" as="p">{project.name} · {project.aircraft}{revision?.note ? ` · ${revision.note}` : ''}</Text>
        </div>
        <Flex gap="2" align="center" className="exec-report-actions">
          <Badge color={execution.status === 'completed' ? 'green' : 'amber'} size="2">{execution.status === 'completed' ? '已结束 · 只读' : '执行中'}</Badge>
          <Button variant="soft" onClick={() => exportExecutionReport(project, execution)}>导出 HTML</Button>
        </Flex>
      </header>

      <div className="exec-report-meta">
        <div><span>运行人</span><strong>{execution.operator || '—'}</strong></div>
        <div><span>开始时间</span><strong>{formatDateTime(execution.startedAt)}</strong></div>
        <div><span>结束时间</span><strong>{formatDateTime(execution.finishedAt)}</strong></div>
        <div><span>执行进度</span><strong>{stats.handled}/{stats.total} 项 · {stats.percent}%</strong></div>
        <div><span>完成</span><strong>{stats.completed} 项</strong></div>
        <div><span>偏差</span><strong>{stats.deviations} 项</strong></div>
      </div>

      {execution.summary && (
        <div className="exec-report-summary">
          <Text size="2" weight="bold">说明</Text>
          <Text size="2" as="p">{execution.summary}</Text>
        </div>
      )}

      <section>
        <Heading size="4" mb="3">偏差与处置（{deviations.length}）</Heading>
        {deviations.length ? (
          <table>
            <thead><tr><th>阶段</th><th>检查项</th><th>预期回应</th><th>偏差原因</th><th>处置</th></tr></thead>
            <tbody>
              {deviations.map((view) => (
                <tr key={view.item.id}>
                  <td>{view.stageName}</td>
                  <td>{view.item.critical && <span className="critical-mark">◆</span>}{view.item.challenge || '未命名检查项'}</td>
                  <td>{view.item.response || '—'}</td>
                  <td>{view.record.deviationReason || '—'}</td>
                  <td>{view.record.disposition || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Callout.Root color="green"><Callout.Text>本次执行全部按检查单完成，无偏差。</Callout.Text></Callout.Root>}
      </section>

      <section>
        <Heading size="4" mb="3">逐项结果</Heading>
        <table>
          <thead><tr><th>阶段</th><th>挑战语</th><th>预期回应</th><th>结果</th><th>记录时间</th></tr></thead>
          <tbody>
            {views.map((view) => (
              <tr key={view.item.id}>
                <td>{view.stageName}</td>
                <td>{view.item.critical && <span className="critical-mark">◆</span>}{view.item.challenge || '未命名检查项'}</td>
                <td>{view.item.response || '—'}</td>
                <td>{view.record.status === 'completed' ? '完成' : view.record.status === 'deviation' ? '偏差' : '未处理'}</td>
                <td>{formatDateTime(view.record.recordedAt)}</td>
              </tr>
            ))}
            {!views.length && <tr><td colSpan={5}>该版本没有检查项</td></tr>}
          </tbody>
        </table>
      </section>
    </article>
  );
}

function exportExecutionReport(project: ChecklistProject, execution: ChecklistExecution) {
  const html = buildExecutionReportHtml(project, execution);
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${project.name.replace(/[^\p{L}\p{N}-]+/gu, '-')}-r${execution.revision}-执行报告.html`;
  anchor.click();
  URL.revokeObjectURL(url);
}
