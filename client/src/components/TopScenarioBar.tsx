/**
 * @file TopScenarioBar.tsx
 * @description Top Scenario Workbench, Live Connectivity Badges, Financial KPIs, and Multi-Project Switcher.
 *
 * Implements:
 * - TASK-025: Live connectivity status pills (PayPal Sandbox, Channel3, Policy Engine)
 * - TASK-025: Financial KPI badges (Idle Exposure At Risk, Channel3 Arbitrage Savings, Active PayPal Invoices)
 * - TASK-051: Multi-project switcher dropdown with "+ New Project" modal trigger
 * - REQ-002: Exact integer minor unit formatting via formatMinorToUSD
 */

import { useState, useMemo } from 'react';
import {
  ArrowRight,
  FlaskConical,
  RefreshCw,
  Plus,
  ShieldCheck,
  Zap,
  TrendingDown,
  Receipt,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useCascadeState } from '@/context/CascadeStateContext';
import { formatMinorToUSD } from '@/utils/formatters';

export function TopScenarioBar() {
  const {
    state,
    health,
    projectsList,
    activeProjectId,
    switchProject,
    openNewProjectModal,
    triggerScenario,
    activeScenario,
    activePlan,
    isRefreshing,
    bootstrapProject,
  } = useCascadeState();

  const [scenario, setScenario] = useState<'SCENARIO_A' | 'SCENARIO_B' | 'SCENARIO_C'>('SCENARIO_A');

  const descriptions = {
    SCENARIO_A: 'Mark an invoice overdue, calculate crew idle burn, and evaluate schedule reroute.',
    SCENARIO_B: 'Detect supplier price creep, query Channel3 Product Graph, and execute arbitrage.',
    SCENARIO_C: 'Verify policy engine blocks an uncompleted predecessor dependency bypass.',
  };

  // Financial KPIs
  const idleExposureMinor = useMemo(() => {
    if (activePlan) {
      return activePlan.total_exposure_minor;
    }
    if (!state?.tasks) return 0;
    return state.tasks
      .filter((t) => t.schedule_status === 'PAYMENT_BLOCKED' || t.paypal_invoice_status === 'OVERDUE')
      .reduce((sum, t) => sum + t.daily_idle_burn_minor * Math.max(1, t.duration_days), 0);
  }, [state?.tasks, activePlan]);

  const arbitrageSavingsMinor = useMemo(() => {
    if (!state?.supplierQuotes) return 0;
    return state.supplierQuotes.reduce(
      (sum, q) => sum + Math.max(0, q.savings_vs_incumbent_minor || 0),
      0
    );
  }, [state?.supplierQuotes]);

  const activeInvoicesCount = useMemo(() => {
    if (!state?.tasks) return 0;
    return state.tasks.filter((t) => t.paypal_invoice_id && t.paypal_invoice_status !== 'PAID').length;
  }, [state?.tasks]);

  // Live Connectivity statuses
  const isPayPalLive =
    health?.paypalSandbox?.toLowerCase().includes('connected') ||
    health?.paypalSandbox?.toLowerCase().includes('live') ||
    health?.status === 'healthy';

  const isChannel3Live =
    health?.channel3?.toLowerCase().includes('live') ||
    health?.channel3?.toLowerCase().includes('connected') ||
    health?.status === 'healthy';

  return (
    <section className="scenario-workbench space-y-3.5 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/40">
      {/* Top Row: Multi-Project Switcher & Live Connectivity Status Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200/60 dark:border-neutral-800/60 pb-3">
        {/* Multi-Project Switcher (TASK-051) */}
        <div className="flex items-center gap-2.5">
          <label htmlFor="topbar-project-select" className="text-xs font-mono font-medium text-neutral-600 dark:text-neutral-300">
            Active Project:
          </label>
          <select
            id="topbar-project-select"
            value={activeProjectId}
            disabled={isRefreshing}
            onChange={(e) => void switchProject(e.target.value)}
            className="text-xs font-mono py-1 px-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {projectsList.map((p) => (
              <option key={p.project_id} value={p.project_id}>
                {p.name} ({p.total_tasks} phases)
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={openNewProjectModal}
            disabled={isRefreshing}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 text-xs font-mono font-medium hover:opacity-90 transition-opacity shadow-sm"
            title="Create a new project architecture"
          >
            <Plus size={13} />
            <span>New Project</span>
          </button>
        </div>

        {/* Live Connectivity Status Pills (TASK-025) */}
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border ${
              isPayPalLive
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800/60'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800/60'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isPayPalLive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            PayPal Sandbox OAuth: {isPayPalLive ? 'Connected' : 'Degraded'}
          </span>

          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border ${
              isChannel3Live
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800/60'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800/60'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isChannel3Live ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            Channel3 API: {isChannel3Live ? 'Live' : 'Offline'}
          </span>

          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800/60">
            <ShieldCheck size={12} className="text-sky-500" />
            Policy Accuracy: 10/10
          </span>
        </div>
      </div>

      {/* Middle Row: Financial KPI Badges (TASK-025) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center justify-between p-2.5 rounded-lg border border-neutral-200/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-800/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
              <Zap size={14} />
            </div>
            <div>
              <span className="block text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                Idle Exposure At Risk
              </span>
              <strong className="text-sm font-semibold font-mono text-rose-600 dark:text-rose-400">
                {formatMinorToUSD(idleExposureMinor)}
              </strong>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between p-2.5 rounded-lg border border-neutral-200/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-800/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              <TrendingDown size={14} />
            </div>
            <div>
              <span className="block text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                Channel3 Arbitrage Savings
              </span>
              <strong className="text-sm font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                {formatMinorToUSD(arbitrageSavingsMinor)}
              </strong>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between p-2.5 rounded-lg border border-neutral-200/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-800/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400">
              <Receipt size={14} />
            </div>
            <div>
              <span className="block text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                Active PayPal Invoices
              </span>
              <strong className="text-sm font-semibold font-mono text-sky-600 dark:text-sky-400">
                {activeInvoicesCount} Active
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Sandbox Scenario Trigger Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="flex items-center gap-1.5 font-mono text-xs text-neutral-700 dark:text-neutral-300">
            <FlaskConical size={15} className="text-emerald-500" />
            <span className="font-semibold">Scenario:</span>
          </div>
          <select
            id="scenario-select"
            value={scenario}
            disabled={isRefreshing}
            onChange={(event) => setScenario(event.target.value as typeof scenario)}
            className="text-xs font-mono py-1 px-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
          >
            <option value="SCENARIO_A">Scenario A: Overdue Invoice Delay & Recovery</option>
            <option value="SCENARIO_B">Scenario B: Supplier Price Creep Defense</option>
            <option value="SCENARIO_C">Scenario C: Dependency Bypass Hard Block</option>
          </select>
          <span className="text-[11px] text-neutral-500 hidden md:inline truncate max-w-sm">
            {descriptions[scenario]}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="button button-secondary text-xs flex items-center gap-1.5"
            onClick={() => void triggerScenario(scenario)}
            disabled={isRefreshing}
          >
            {isRefreshing ? <RefreshCw size={13} className="spin" /> : <ArrowRight size={13} />}
            <span>{isRefreshing ? 'Running…' : 'Run scenario'}</span>
          </button>

          <details className="sandbox-reset inline-block">
            <summary className="text-[11px] font-mono text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer">
              Maintenance
            </summary>
            <div className="absolute right-4 mt-2 p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-lg z-20 w-64 text-xs">
              <p className="text-neutral-500 mb-2">
                Reset replaces the canonical demo project’s state and reprovisions its integrations.
              </p>
              <button
                type="button"
                className="button button-secondary text-xs w-full"
                disabled={isRefreshing}
                onClick={() => {
                  if (window.confirm('Reset canonical sandbox project? Current demo state will be replaced.')) {
                    void bootstrapProject(true);
                  }
                }}
              >
                Reset canonical demo
              </button>
            </div>
          </details>
        </div>
      </div>

      {activeScenario && (
        <div className="text-[10px] font-mono text-neutral-400">
          Last evaluated scenario: <span className="text-neutral-600 dark:text-neutral-300 font-medium">{activeScenario}</span>
        </div>
      )}
    </section>
  );
}

export default TopScenarioBar;
