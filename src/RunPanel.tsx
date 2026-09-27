import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Callout,
  Card,
  Dialog,
  Flex,
  Grid,
  Heading,
  Progress,
  ScrollArea,
  Select,
  Text,
  TextArea,
  TextField
} from '@radix-ui/themes';
import { buildRunReportHtml, formatRunTime, getRunBlockers, getRunStats } from './runs';
import type { ChecklistStore } from './store';
import type { ChecklistItem, ChecklistProject, ChecklistRun, ChecklistRunRecord } from './types';

export function RunPanel({ project, store }: { project: ChecklistProject; store: ChecklistStore }) {
  const projectRuns = useMemo(
    () => store.runs.filter((run) => run.projectId === project.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [store.runs, project.id]
  );
  const [selectedRunId, setSelectedRunId] = useState('');
  const selectedRun = projectRuns.find((run) => run.id === selectedRunId) ?? projectRuns[0];

  const [startOpen, setStartOpen] = useState(false);
  const [revisionId, setRevisionId] = useState('');
  const [operator, setOperator] = useState('');
  const [note, setNote] = useState('');

  const openStartDialog = () => {
    setRevisionId(project.revisions[0]?.id ?? '');
    setOperator('');
    setNote('');
    setStartOpen(true);
  };

  const confirmStart = () => {
    const id = store.startRun(revisionId, operator, note);
    if (id) {
      setSelectedRunId(id);
      setStartOpen(false);
    }
  };

  return (
    <div className="content-page runs-page">
      <Flex justify="between" align="center" mb="4" wrap="wrap" gap="3">
        <div>
          <Heading size="7">执行记录</Heading>
          <Text color="gray" as="p">从冻结版本发起执行，逐项标记完成或偏差；未处理完不能结束，结束后生成只读报告。</Text>
        </div>
        <Button onClick={openStartDialog} disabled={!project.revisions.length}>＋ 开始新执行</Button>
      </Flex>
      {!project.revisions.length && (
        <Callout.Root color="amber" mb="4">
          <Callout.Text>当前项目还没有冻结版本。请先完成「编辑 → 复核 → 冻结」流程，再从冻结版本开始执行。</Callout.Text>
        </Callout.Root>
      )}

      <div className="runs-layout">
        <aside className="runs-sidebar">
          <Text size="1" color="gray">最近执行（{projectRuns.length}）</Text>
          <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: 'calc(100vh - 300px)' }}>
            <div className="run-list">
              {projectRuns.map((run) => {
                const stats = getRunStats(run);
                return (
                  <button key={run.id} className={`run-card ${selectedRun?.id === run.id ? 'active' : ''}`} onClick={() => setSelectedRunId(run.id)}>
                    <Flex justify="between" align="center" gap="2">
                      <strong>r{run.revision} · {run.operator}</strong>
                      <Badge size="1" color={run.finishedAt ? 'green' : 'amber'}>{run.finishedAt ? '已完成' : '进行中'}</Badge>
                    </Flex>
                    <small>{formatRunTime(run.startedAt)}</small>
                    <small>已标记 {stats.completed + stats.deviations}/{stats.total} · 偏差 {stats.deviations}</small>
                  </button>
                );
              })}
              {!projectRuns.length && <div className="run-list-empty">还没有执行记录。</div>}
            </div>
          </ScrollArea>
        </aside>

        <section className="run-detail">
          {selectedRun ? (
            selectedRun.finishedAt ? <RunReport run={selectedRun} /> : <RunExecution run={selectedRun} store={store} />
          ) : (
            <div className="empty-page">
              <strong>暂无执行记录</strong>
              <span>点击「开始新执行」，从冻结版本生成一份可逐项打钩的执行单。</span>
            </div>
          )}
        </section>
      </div>

      <Dialog.Root open={startOpen} onOpenChange={setStartOpen}>
        <Dialog.Content maxWidth="520px">
          <Dialog.Title>开始新执行</Dialog.Title>
          <Dialog.Description size="2" color="gray">执行基于冻结版本的快照，不影响编辑、复核和冻结流程。</Dialog.Description>
          <div className="start-run-form">
            <label>
              <span>冻结版本</span>
              <Select.Root value={revisionId} onValueChange={setRevisionId}>
                <Select.Trigger aria-label="选择冻结版本" variant="soft" />
                <Select.Content position="popper">
                  {project.revisions.map((revision) => (
                    <Select.Item key={revision.id} value={revision.id}>
                      r{revision.revision} · {new Date(revision.createdAt).toLocaleDateString('zh-CN')} · {revision.note || '无说明'}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </label>
            <label>
              <span>运行人（必填）</span>
              <TextField.Root value={operator} onChange={(event) => setOperator(event.target.value)} placeholder="执行本次检查单的机组 / 签派" />
            </label>
            <label>
              <span>说明</span>
              <TextArea value={note} onChange={(event) => setNote(event.target.value)} placeholder="航班号、任务背景或执行条件" />
            </label>
          </div>
          <Flex gap="3" justify="end" mt="4">
            <Dialog.Close><Button variant="soft">取消</Button></Dialog.Close>
            <Button disabled={!revisionId || !operator.trim()} onClick={confirmStart}>开始执行</Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}

function RunExecution({ run, store }: { run: ChecklistRun; store: ChecklistStore }) {
  const stats = getRunStats(run);
  const blockers = getRunBlockers(run);
  const stages = run.stages.slice().sort((a, b) => a.order - b.order);

  return (
    <div className="run-detail-inner">
      <Card className="run-head">
        <Flex justify="between" align="start" gap="3">
          <div>
            <Heading size="5">{run.checklistName} · r{run.revision}</Heading>
            <Text size="1" color="gray" as="p">
              基于冻结版本 r{run.revision}{run.revisionNote ? `（${run.revisionNote}）` : ''} · 开始于 {formatRunTime(run.startedAt)}
            </Text>
          </div>
          <Badge color="amber" size="2">进行中</Badge>
        </Flex>
        <Grid columns="2" gap="3" mt="3" className="run-meta-form">
          <label className="run-field">
            <span>运行人</span>
            <TextField.Root value={run.operator} onChange={(event) => store.updateRunMeta(run.id, { operator: event.target.value })} />
          </label>
          <label className="run-field">
            <span>说明</span>
            <TextField.Root value={run.note} onChange={(event) => store.updateRunMeta(run.id, { note: event.target.value })} placeholder="本次执行背景、航班或任务说明" />
          </label>
        </Grid>
        <Flex align="center" gap="3" mt="3">
          <Progress value={stats.percent} style={{ flex: 1 }} color={stats.pending ? 'blue' : 'green'} />
          <Text size="1" color="gray">已标记 {stats.completed + stats.deviations}/{stats.total} · 偏差 {stats.deviations}</Text>
        </Flex>
      </Card>

      {stages.map((stage) => {
        const items = run.items.filter((item) => item.stageId === stage.id).sort((a, b) => a.order - b.order);
        if (!items.length) return null;
        return (
          <Card key={stage.id} className="run-stage">
            <Flex justify="between" align="center" mb="2">
              <Heading size="3">{stage.name}</Heading>
              <Text size="1" color="gray">{items.filter((item) => run.records.find((record) => record.itemId === item.id)?.result).length}/{items.length} 已标记</Text>
            </Flex>
            <div className="run-items">
              {items.map((item) => {
                const record = run.records.find((entry) => entry.itemId === item.id);
                if (!record) return null;
                return <RunItemRow key={item.id} run={run} item={item} record={record} store={store} />;
              })}
            </div>
          </Card>
        );
      })}

      <Card className="run-finish">
        {blockers.length ? (
          <Callout.Root color="amber" mb="3">
            <Callout.Text>未处理完不能结束：{blockers.join('；')}。</Callout.Text>
          </Callout.Root>
        ) : (
          <Callout.Root color="green" mb="3">
            <Callout.Text>全部项目已处理，可以结束执行并生成只读报告。</Callout.Text>
          </Callout.Root>
        )}
        <Flex justify="end">
          <Button color="green" disabled={blockers.length > 0} onClick={() => store.finishRun(run.id)}>结束执行并生成报告</Button>
        </Flex>
      </Card>
    </div>
  );
}

function RunItemRow({ run, item, record, store }: { run: ChecklistRun; item: ChecklistItem; record: ChecklistRunRecord; store: ChecklistStore }) {
  return (
    <div className={`run-item ${record.result ?? ''}`}>
      <div className="run-item-main">
        <div className="run-item-copy">
          <Flex gap="2" align="center" wrap="wrap">
            <strong>{item.challenge || '未命名检查项'}</strong>
            {item.critical && <Badge color="red" size="1">关键</Badge>}
          </Flex>
          <span className="run-response">预期：{item.response || '未填写'}</span>
        </div>
        <div className="run-result-toggle" role="group" aria-label={`${item.challenge} 执行结果`}>
          <button type="button" className={record.result === 'completed' ? 'active-completed' : ''} onClick={() => store.setRunItemResult(run.id, item.id, 'completed')}>✓ 完成</button>
          <button type="button" className={record.result === 'deviation' ? 'active-deviation' : ''} onClick={() => store.setRunItemResult(run.id, item.id, 'deviation')}>⚠ 偏差</button>
        </div>
      </div>
      {record.result === 'deviation' && (
        <div className="run-deviation-fields">
          <TextArea size="1" value={record.reason} placeholder="偏差原因（必填）：实际结果与预期回应的差异" onChange={(event) => store.setRunItemReason(run.id, item.id, event.target.value)} />
          {item.critical && (
            <TextArea size="1" value={record.handling} placeholder="关键项处置（必填）：采取的处置措施与结果" onChange={(event) => store.setRunItemHandling(run.id, item.id, event.target.value)} />
          )}
        </div>
      )}
    </div>
  );
}

function RunReport({ run }: { run: ChecklistRun }) {
  const stats = getRunStats(run);
  const stages = run.stages.slice().sort((a, b) => a.order - b.order);
  const deviations = run.records
    .map((record) => ({ record, item: run.items.find((item) => item.id === record.itemId) }))
    .filter((entry): entry is { record: ChecklistRunRecord; item: ChecklistItem } => entry.record.result === 'deviation' && Boolean(entry.item));

  const exportReport = () => {
    const url = URL.createObjectURL(new Blob([buildRunReportHtml(run)], { type: 'text/html;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${run.checklistName.replace(/[^\p{L}\p{N}-]+/gu, '-')}-r${run.revision}-执行报告.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="run-detail-inner">
      <Card className="run-head">
        <Flex justify="between" align="start" gap="3">
          <div>
            <Heading size="5">{run.checklistName} · r{run.revision} 执行报告</Heading>
            <Text size="1" color="gray" as="p">只读报告 · 结束后不可再修改</Text>
          </div>
          <Flex gap="2" align="center">
            <Badge color="green" size="2">已完成</Badge>
            <Button variant="soft" onClick={exportReport}>导出 HTML 报告</Button>
          </Flex>
        </Flex>
        <div className="run-meta-grid">
          <div><span>版本</span><strong>r{run.revision}{run.revisionNote ? ` · ${run.revisionNote}` : ''}</strong></div>
          <div><span>运行人</span><strong>{run.operator}</strong></div>
          <div><span>说明</span><strong>{run.note || '—'}</strong></div>
          <div><span>开始时间</span><strong>{formatRunTime(run.startedAt)}</strong></div>
          <div><span>结束时间</span><strong>{formatRunTime(run.finishedAt)}</strong></div>
          <div><span>进度</span><strong>完成 {stats.completed} · 偏差 {stats.deviations} · 共 {stats.total}</strong></div>
        </div>
        <Flex align="center" gap="3" mt="3">
          <Progress value={stats.percent} color="green" style={{ flex: 1 }} />
          <Text size="1" color="gray">{stats.percent}% 已标记</Text>
        </Flex>
      </Card>

      <Card className="run-stage">
        <Flex justify="between" align="center" mb="2">
          <Heading size="3">偏差与处置</Heading>
          <Badge color={deviations.length ? 'amber' : 'green'}>{deviations.length} 项偏差</Badge>
        </Flex>
        {deviations.length ? (
          <table className="run-report-table">
            <thead><tr><th>阶段</th><th>检查项</th><th>预期回应</th><th>偏差原因</th><th>处置</th></tr></thead>
            <tbody>
              {deviations.map(({ record, item }) => (
                <tr key={record.itemId}>
                  <td>{run.stages.find((stage) => stage.id === item.stageId)?.name ?? '—'}</td>
                  <td>{item.critical && <span className="critical-mark">◆</span>}{item.challenge}</td>
                  <td>{item.response || '未填写'}</td>
                  <td>{record.reason}</td>
                  <td>{record.handling || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Callout.Root color="green"><Callout.Text>本次执行无偏差，全部项目按预期完成。</Callout.Text></Callout.Root>
        )}
      </Card>

      {stages.map((stage) => {
        const items = run.items.filter((item) => item.stageId === stage.id).sort((a, b) => a.order - b.order);
        if (!items.length) return null;
        return (
          <Card key={stage.id} className="run-stage">
            <Heading size="3" mb="2">{stage.name}</Heading>
            <table className="run-report-table">
              <thead><tr><th>检查项</th><th>预期回应</th><th>结果</th><th>偏差与处置</th></tr></thead>
              <tbody>
                {items.map((item) => {
                  const record = run.records.find((entry) => entry.itemId === item.id);
                  return (
                    <tr key={item.id}>
                      <td>{item.critical && <span className="critical-mark">◆</span>}{item.challenge}</td>
                      <td>{item.response || '未填写'}</td>
                      <td>{record?.result === 'deviation' ? <Badge color="amber" size="1">偏差</Badge> : <Badge color="green" size="1">完成</Badge>}</td>
                      <td>{record?.result === 'deviation' ? [record.reason && `原因：${record.reason}`, record.handling && `处置：${record.handling}`].filter(Boolean).join('；') : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        );
      })}
    </div>
  );
}
