/**
 * @file FinOpsWidgetPanel.tsx
 * @description AG Studio 3.0 FinOps Intelligence & Arbitrage Engine.
 *
 * Implements:
 * - Supplier Arbitrage: Incumbent Quote vs Live Channel3 Discovery
 * - Deterministic Policy Diff & RFC 6960 state signatures
 * - PayPal Split Invoice Architecture
 * - Decongested, minimal layout with full Dark & Light theme support
 */

import { useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useCascadeState } from '@/context/CascadeStateContext';
import { formatMinorToUSD as money, formatVariancePct } from '@/utils/formatters';
import { TopScenarioBar } from './TopScenarioBar';
import { phaseName, Status, shortDate } from './workspace/Status';
import { ReleaseChain } from './workspace/DeliveryOverview';

export function FinOpsWidgetPanel() {
  const { state, activePlan, openApprovalModal, selectedTaskId, selectTask, openTaskDrawer } = useCascadeState();
  const [tab, setTab] = useState('policy');
  const task = state?.tasks.find((item) => item.task_id === selectedTaskId) ?? state?.tasks.find((item) => item.task_id === activePlan?.blocked_task_id) ?? state?.tasks.find((item) => item.schedule_status === 'PAYMENT_BLOCKED') ?? state?.tasks[0];
  const quotes = state?.supplierQuotes.filter((quote) => quote.task_id === task?.task_id) ?? [];
  const incumbent = quotes.find((quote) => quote.source_type === 'INCUMBENT_INVOICE');
  const replacement = quotes.find((quote) => quote.quote_id === activePlan?.selected_quote_id) ?? quotes.find((quote) => quote.source_type === 'CHANNEL3_LIVE');
  const proposedTask = state?.tasks.find((item) => item.task_id === activePlan?.promoted_task_id);
  const blockedTask = state?.tasks.find((item) => item.task_id === activePlan?.blocked_task_id);
  const unmet = (state?.dependencies.filter((edge) => edge.to_task_id === task?.task_id) ?? []).filter((edge) => state?.tasks.find((item) => item.task_id === edge.from_task_id)?.schedule_status !== 'COMPLETED');

  return <div className="recovery-workspace">
    {/* Decongested Header */}
    <div className="section-heading"><div><h2>Recovery decision</h2><p>Inspect the evidence, then approve a specific schedule change.</p></div>{activePlan && <Status value={activePlan.status} />}</div>
    <div className="recovery-layout"><section className="recovery-evidence">
      <label className="field-label" htmlFor="recovery-phase">Browse milestone evidence</label><select className="workspace-select" id="recovery-phase" value={task?.task_id ?? ''} onChange={(event) => selectTask(event.target.value)}>{state?.tasks.map((item) => <option value={item.task_id} key={item.task_id}>{phaseName(item.name)}</option>)}</select>
      <p className="cell-note">This selection changes the evidence below. The project recovery proposal remains scoped to its named milestones.</p>
      {/* Tab Controls */}
      <nav className="underline-tabs" aria-label="Financial evidence">{[['policy', 'Readiness & policy'], ['quotes', 'Supplier comparison'], ['split', 'Invoice split'], ['exposure', 'Delay exposure']].map(([id, label]) => <button key={id} onClick={() => setTab(id!)} aria-pressed={tab === id}>{label}</button>)}</nav>
      {/* Widget Container */}
      {task ? <>
        {/* 1. Supplier Arbitrage Widget */}
        {tab === 'quotes' && <div className="evidence-body"><h3>Observed supplier costs</h3><p className="evidence-description">Quotes belong to {phaseName(task.name)}. Unknown freight or tax needs review.</p>
          {/* Side-by-side Incumbent vs Channel3 */}
          <div className="quote-comparison">
            {/* Incumbent Quote Card */}
            <div><span>Incumbent supplier</span><strong>{incumbent ? money(incumbent.total_minor) : '—'}</strong><p>{incumbent?.merchant_name ?? 'No incumbent quote recorded'}</p><small>{incumbent ? `${formatVariancePct(incumbent.variance_vs_historical_pct)} vs historical unit price` : 'Run a supplier audit to compare prices.'}</small></div>
            {/* Channel3 Arbitrage Replacement Card */}
            <div><span>{replacement?.source_type === 'CHANNEL3_LIVE' ? 'Channel3 alternative' : 'Selected quote'}</span><strong>{replacement ? money(replacement.total_minor) : '—'}</strong><p>{replacement?.merchant_name ?? 'No replacement quote recorded'}</p><small>{replacement ? replacement.availability_status.toLowerCase().replace(/_/g, ' ') : 'No availability verified.'}</small></div>
          </div>
          {incumbent && replacement && <dl className="financial-facts"><div><dt>Quoted difference</dt><dd>{money(incumbent.total_minor - replacement.total_minor)}</dd></div><div><dt>Phase budget</dt><dd>{money(task.phase_hardware_budget_max_minor)}</dd></div><div><dt>Replacement freight</dt><dd>{replacement.shipping_minor === null ? 'Unknown' : money(replacement.shipping_minor)}</dd></div><div><dt>Replacement tax</dt><dd>{replacement.tax_minor === null ? 'Unknown' : money(replacement.tax_minor)}</dd></div></dl>}
          {/* Action CTA */}
          <button className="button button-secondary" onClick={() => openTaskDrawer(task.task_id)}>Inspect procurement<ArrowRight size={15} /></button>
        </div>}
        {/* 2. Policy Diff Tab */}
        {tab === 'policy' && <div className="evidence-body"><h3>Selected milestone readiness</h3><p className="evidence-description">Current evidence for {phaseName(task.name)}.</p><ReleaseChain task={task} />
          {/* Invariant Diff Table */}
          <div className="data-table-scroll"><table className="data-table policy-table"><thead><tr><th>Check</th><th>Required</th><th>Current evidence</th></tr></thead><tbody>
            <tr><td>Hard dependencies</td><td>All predecessors complete</td><td>{unmet.length ? `${unmet.length} unfinished` : 'No unfinished predecessors'}</td></tr>
            <tr><td>Warehouse staging</td><td>Materials staged</td><td>{task.materials_in_warehouse ? 'Staged' : 'Not staged'}</td></tr>
            <tr><td>Hardware budget</td><td className="number">{money(task.phase_hardware_budget_max_minor)}</td><td className="number">{replacement ? money(replacement.total_minor) : 'No quote selected'}</td></tr>
            <tr><td>Unit-price increase</td><td className="number">At most {task.max_allowed_variance_pct}%</td><td className="number">{replacement ? formatVariancePct(replacement.variance_vs_historical_pct) : 'No quote selected'}</td></tr>
            <tr><td>Complete costs</td><td>Known freight, tax, currency</td><td>{replacement ? `${replacement.currency} · ${replacement.shipping_minor === null || replacement.tax_minor === null ? 'Missing costs' : 'Costs recorded'}` : 'No quote selected'}</td></tr>
          </tbody></table></div><p className="evidence-note"><ShieldCheck size={16} />These are current facts. The server revalidates policy and the state fingerprint when you approve.</p></div>}
        {/* 3. Split Invoice Tab */}
        {tab === 'split' && <div className="evidence-body"><h3>Separate materials from labor</h3><p className="evidence-description">The milestone invoice stays visible alongside the amount required for materials.</p><div className="invoice-proportion" role="img" aria-label={`${money(task.materials_unlock_minor)} materials and ${money(task.deferred_labor_minor)} deferred labor`}><span style={{ width: `${task.invoice_total_minor > 0 ? Math.min(100, task.materials_unlock_minor / task.invoice_total_minor * 100) : 0}%` }} /></div><dl className="financial-facts"><div><dt>Materials unlock</dt><dd>{money(task.materials_unlock_minor)}</dd></div><div><dt>Deferred labor</dt><dd>{money(task.deferred_labor_minor)}</dd></div><div><dt>Invoice total</dt><dd>{money(task.invoice_total_minor)}</dd></div></dl><button className="button button-secondary" onClick={() => openTaskDrawer(task.task_id)}>Open invoice details<ArrowRight size={15} /></button></div>}
        {/* 4. Blast Radius Tab */}
        {tab === 'exposure' && <div className="evidence-body"><h3>Recovery proposal exposure</h3><p className="evidence-description">{activePlan ? `Downstream exposure from ${phaseName(blockedTask?.name ?? activePlan.blocked_task_id)}. These proposal totals do not change with the milestone evidence selector.` : 'A recovery proposal is needed to calculate downstream exposure.'}</p><dl className="financial-facts"><div><dt>Idle crew hours</dt><dd>{activePlan ? `${activePlan.idle_crew_hours} hours` : '—'}</dd></div><div><dt>Idle labor cost</dt><dd>{activePlan ? money(activePlan.idle_labor_cost_minor) : '—'}</dd></div><div><dt>SLA penalties</dt><dd>{activePlan ? money(activePlan.sla_penalty_minor) : '—'}</dd></div><div><dt>Total exposure</dt><dd>{activePlan ? money(activePlan.total_exposure_minor) : '—'}</dd></div></dl></div>}
      </> : <p className="inline-empty">Add a milestone to inspect its readiness.</p>}
    </section><aside className="proposal-panel"><div className="section-heading"><h2>Proposed schedule change</h2><ShieldCheck size={17} /></div>{activePlan ? <><Status value={activePlan.policy_decision} /><div className="proposal-step"><span>Release next</span><h3>{phaseName(proposedTask?.name ?? activePlan.promoted_task_id)}</h3><p>Start {shortDate(activePlan.new_promoted_start_date)}</p></div><div className="proposal-step"><span>Reschedule blocked work</span><h3>{phaseName(state?.tasks.find((item) => item.task_id === activePlan.blocked_task_id)?.name ?? activePlan.blocked_task_id)}</h3><p>Start {shortDate(activePlan.new_blocked_start_date)}</p></div><dl className="financial-facts"><div><dt>Materials unlock</dt><dd>{money(activePlan.immediate_unlock_minor)}</dd></div></dl><button className="button button-primary full-width" onClick={() => openApprovalModal(activePlan)} disabled={activePlan.status !== 'PROPOSED' || activePlan.policy_decision === 'BLOCK'}>{activePlan.status === 'APPROVED' ? 'Already approved' : 'Review & approve'}<ArrowRight size={15} /></button></> : <div className="empty-state"><h3>No recovery proposal</h3><p>Run an invoice-delay or supplier-defense scenario below to evaluate the project.</p></div>}</aside></div>
    <TopScenarioBar />
  </div>;
}
export default FinOpsWidgetPanel;
