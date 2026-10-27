import { useState } from 'react';
import { ArrowRight, Check, ChevronRight, PackageCheck, Search, ShieldCheck } from 'lucide-react';
import { useCascadeState } from '@/context/CascadeStateContext';
import { formatMinorToUSD as money } from '@/utils/formatters';
import { phaseName, shortDate, Status, statusTone } from './Status';
import type { CascadeTask } from '@/types/domain';
import type { WorkspaceView } from './Sidebar';

export function ReleaseChain({ task }: { task: CascadeTask }) {
  const { state } = useCascadeState();
  const predecessors = state?.dependencies.filter((edge) => edge.to_task_id === task.task_id) ?? [];
  const ready = predecessors.every((edge) => state?.tasks.find((t) => t.task_id === edge.from_task_id)?.schedule_status === 'COMPLETED');
  const items = [
    { label: 'Invoice', value: task.paypal_invoice_status === 'PAID' ? 'Paid' : task.paypal_invoice_status === 'OVERDUE' ? 'Overdue' : 'Awaiting payment', ready: task.paypal_invoice_status === 'PAID' },
    { label: 'Materials', value: task.materials_in_warehouse ? 'Staged' : 'Not staged', ready: !!task.materials_in_warehouse },
    { label: 'Predecessors', value: ready ? 'Complete' : 'Unfinished', ready },
  ];
  return <ol className="release-chain" aria-label={`Release conditions for ${task.name}`}>{items.map((item) => <li key={item.label} className={item.ready ? 'is-ready' : ''}><span className="chain-node" aria-hidden="true">{item.ready ? <Check size={12} /> : <span />}</span><span>{item.label}</span><strong>{item.value}</strong></li>)}</ol>;
}

export function RecoveryRail({ onNavigate }: { onNavigate: (view: WorkspaceView) => void }) {
  const { state, activePlan, openApprovalModal, openTaskDrawer, selectedTaskId } = useCascadeState();
  const task = state?.tasks.find((t) => t.task_id === selectedTaskId) ?? state?.tasks.find((t) => t.schedule_status === 'PAYMENT_BLOCKED' || t.paypal_invoice_status === 'OVERDUE') ?? state?.tasks.find((t) => t.schedule_status !== 'COMPLETED');
  const proposal = activePlan?.status === 'PROPOSED' && (activePlan.blocked_task_id === task?.task_id || activePlan.promoted_task_id === task?.task_id) ? activePlan : null;
  return <aside className="recovery-rail">
    <div className="section-heading"><h2>{selectedTaskId ? 'Milestone readiness' : 'Next decision'}</h2><ShieldCheck size={17} /></div>
    {task ? <><Status value={task.schedule_status} /><h3>{phaseName(task.name)}</h3><p className="rail-description">{task.schedule_status === 'PAYMENT_BLOCKED' ? 'Payment is holding this phase. Review the invoice and material requirements before releasing work.' : 'Review payment, materials, and predecessors before changing this milestone.'}</p>
      <ReleaseChain task={task} />
      <dl className="financial-facts"><div><dt>Materials to unlock</dt><dd>{money(task.materials_unlock_minor)}</dd></div><div><dt>Deferred labor</dt><dd>{money(task.deferred_labor_minor)}</dd></div><div><dt>Crew idle cost</dt><dd>{money(task.daily_idle_burn_minor)}<small> / day</small></dd></div></dl>
      {proposal ? <button className="button button-primary full-width" onClick={() => openApprovalModal(proposal)}>Review recovery plan<ArrowRight size={16} /></button> : <button className="button button-primary full-width" onClick={() => openTaskDrawer(task.task_id)}>Inspect phase financials<ArrowRight size={16} /></button>}
      <button className="text-button full-width" onClick={() => onNavigate('recovery')}>{proposal ? 'View policy and exposure' : 'Open recovery workspace'}<ChevronRight size={15} /></button>
    </> : <div className="empty-state"><PackageCheck size={24} /><h3>{state?.tasks.length ? 'Every phase is complete' : 'No milestones yet'}</h3><p>{state?.tasks.length ? 'Use the schedule to inspect completed work.' : 'Create a project with its first milestones to track release conditions.'}</p></div>}
  </aside>;
}

export function ProjectSummary() {
  const { state } = useCascadeState();
  const tasks = state?.tasks ?? [];
  const overdue = tasks.filter((task) => task.paypal_invoice_status === 'OVERDUE');
  const exposure = overdue.reduce((sum, task) => sum + task.duration_days * task.daily_idle_burn_minor + task.sla_delay_penalty_minor, 0);
  const paid = tasks.filter((task) => task.paypal_invoice_status === 'PAID').reduce((sum, task) => sum + task.invoice_total_minor, 0);
  const total = tasks.reduce((sum, task) => sum + task.invoice_total_minor, 0);
  const end = tasks.map((task) => task.end_date).sort().at(-1);
  return <dl className="project-summary">
    <div className="summary-lead"><dt>Delay exposure</dt><dd>{money(exposure)}</dd><span>{overdue.length} overdue {overdue.length === 1 ? 'milestone' : 'milestones'}</span></div>
    <div><dt>Paid milestone value</dt><dd>{money(paid)}</dd><span>of {money(total)} invoiced</span></div>
    <div><dt>Phases complete</dt><dd>{tasks.filter((task) => task.schedule_status === 'COMPLETED').length}<small> / {tasks.length}</small></dd><span>Based on schedule status</span></div>
    <div><dt>Scheduled finish</dt><dd>{shortDate(end)}</dd><span>{end ? `${end.slice(0, 4)} · latest phase end` : 'Add a milestone to begin'}</span></div>
  </dl>;
}

export function DeliveryOverview({ onNavigate }: { onNavigate: (view: WorkspaceView) => void }) {
  const { state, openTaskDrawer, selectTask, selectedTaskId, setIsAuditDrawerOpen } = useCascadeState();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const tasks = state?.tasks ?? [];
  const blocked = tasks.filter((task) => task.schedule_status === 'PAYMENT_BLOCKED' || task.schedule_status === 'BLOCKED_BY_DEPENDENCY');
  const filtered = tasks.filter((task) => (filter !== 'attention' || blocked.includes(task)) && `${task.name} ${task.crew_assigned}`.toLowerCase().includes(query.toLowerCase()));
  const dates = tasks.flatMap((task) => [Date.parse(task.start_date), Date.parse(task.end_date)]).filter(Number.isFinite);
  const start = dates.length ? Math.min(...dates) : 0;
  const end = dates.length ? Math.max(...dates) + 86400000 : 1;
  return <>
    <ProjectSummary />
    {blocked.length > 0 && <button className="mobile-decision-link" onClick={() => onNavigate('recovery')}><strong>{blocked.length} phases need attention</strong><span>Review recovery</span><ArrowRight size={16} /></button>}
    <div className="delivery-grid">
      <section className="milestone-register" aria-labelledby="milestones-title">
        <div className="section-heading"><div><h2 id="milestones-title">Milestone register</h2><p>Payment and readiness, phase by phase.</p></div><button className="text-button" onClick={() => onNavigate('schedule')}>Open schedule<ArrowRight size={15} /></button></div>
        <div className="register-toolbar"><div className="segmented-control" aria-label="Filter milestones"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All phases <span>{tasks.length}</span></button><button aria-pressed={filter === 'attention'} onClick={() => setFilter('attention')}>Needs attention <span>{blocked.length}</span></button></div><label className="search-field"><Search size={15} /><input aria-label="Search milestones" placeholder="Find a phase…" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        <div className="milestone-table-wrap"><table className="milestone-table"><thead><tr><th>Phase / crew</th><th>Schedule</th><th className="number">Invoice</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map((task, index) => <tr key={task.task_id} className={selectedTaskId === task.task_id ? 'is-selected' : ''}>
          <td><div className="phase-cell"><span className={`phase-marker tone-${statusTone(task.schedule_status)}`} aria-hidden="true">{task.schedule_status === 'COMPLETED' ? <Check size={13} /> : String(tasks.indexOf(task) + 1).padStart(2, '0')}</span><div><button className="phase-name" onClick={() => { selectTask(task.task_id); openTaskDrawer(task.task_id); }}>{phaseName(task.name)}</button><span className="phase-crew">{task.crew_assigned || 'Crew unassigned'}</span><Status value={task.schedule_status} /></div></div></td>
          <td className="schedule-cell"><span>{shortDate(task.start_date)}–{shortDate(task.end_date)}</span><div className="phase-track" aria-label={`${task.duration_days} days`}><span className={`tone-${statusTone(task.schedule_status)}`} style={{ left: `${Math.max(0, (Date.parse(task.start_date) - start) / (end - start) * 100)}%`, width: `${Math.max(2, (Date.parse(task.end_date) + 86400000 - Date.parse(task.start_date)) / (end - start) * 100)}%` }} /></div></td>
          <td className="number"><strong>{money(task.invoice_total_minor)}</strong><span className={`invoice-label tone-${statusTone(task.paypal_invoice_status)}`}>{task.paypal_invoice_status.toLowerCase().replace(/_/g, ' ')}</span></td>
          <td><button className="icon-button" onClick={() => selectTask(selectedTaskId === task.task_id ? null : task.task_id)} aria-label={`Show readiness for ${task.name}`} aria-pressed={selectedTaskId === task.task_id}><ChevronRight size={17} /></button></td>
        </tr>)}</tbody></table></div>
        {!filtered.length && <div className="empty-state"><h3>{tasks.length ? 'No matching milestones' : 'Your schedule starts here'}</h3><p>{tasks.length ? 'Try another phase name or show all phases.' : 'Add a phase from the schedule workspace.'}</p>{tasks.length > 0 && <button className="button button-secondary" onClick={() => { setQuery(''); setFilter('all'); }}>Clear filters</button>}</div>}
        <div className="register-footer"><span>{filtered.length} of {tasks.length} phases</span>{selectedTaskId ? <button className="text-button" onClick={() => selectTask(null)}>Clear selection</button> : <span>{state?.dependencies.length ?? 0} finish-to-start dependencies</span>}</div>
      </section>
      <RecoveryRail onNavigate={onNavigate} />
    </div>
    <section className="recent-activity"><div className="section-heading"><h2>Latest project activity</h2><button className="text-button" onClick={() => setIsAuditDrawerOpen(true)}>Full audit trail<ArrowRight size={15} /></button></div>
      {(state?.auditEvents ?? []).slice(0, 3).map((event) => <div className="activity-row" key={event.event_id}><Status value={event.decision} /><p>{event.summary}</p><time dateTime={event.created_at}>{shortDate(event.created_at)}</time></div>)}
      {!state?.auditEvents.length && <p className="inline-empty">Project changes and policy decisions will appear here.</p>}
    </section>
  </>;
}
