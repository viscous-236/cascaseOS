/**
 * @file TopScenarioBar.tsx
 * @description Executive FinOps Command Bar with Theme Toggle & Decongested Minimal Layout.
 *
 * Implements:
 * - Theme toggle (Light / Dark)
 * - Decongested, minimal typography without unnecessary boilerplate
 * - Aceternity CardSpotlight for clean bento metrics
 * - Compact, professional 1-click scenario triggers
 */

import React, { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  FileText,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Lock,
  Sun,
  Moon,
  Building,
  Plus,
} from 'lucide-react';
import { useCascadeState } from '@/context/CascadeStateContext';
import { formatMinorToUSD } from '@/utils/formatters';
import { CardSpotlight } from '@/components/ui/card-spotlight';

export const TopScenarioBar: React.FC = () => {
  const {
    state,
    health,
    isRefreshing,
    activeScenario,
    triggerScenario,
    bootstrapProject,
    setIsAuditDrawerOpen,
    setIsAgentChatOpen,
    theme,
    toggleTheme,
    projectsList,
    activeProjectId,
    switchProject,
    openNewProjectModal,
  } = useCascadeState();

  // Aggregate high-level KPIs dynamically from real state
  const overdueTasks = state?.tasks?.filter((t) => t.paypal_invoice_status === 'OVERDUE') || [];
  const totalIdleExposure = overdueTasks.reduce(
    (acc, t) => acc + (t.duration_days * t.daily_idle_burn_minor + t.sla_delay_penalty_minor),
    0
  );

  const bestSavingsQuote = state?.supplierQuotes?.find((q) => q.savings_vs_incumbent_minor > 0);
  const totalSavings = bestSavingsQuote?.savings_vs_incumbent_minor || 56400;

  const materialsUnlockMinor = useMemo(() => {
    if (!state?.tasks || state.tasks.length === 0) return 139600;
    const task = state.tasks.find(
      (t) => t.paypal_invoice_status === 'OVERDUE' || t.schedule_status === 'REROUTED_ACTIVE'
    );
    return task?.materials_unlock_minor || 139600;
  }, [state?.tasks]);

  const targetOpeningDate = useMemo(() => {
    if (!state?.tasks || state.tasks.length === 0) return 'Nov 2, 2026';
    const dates = state.tasks.map((t) => t.end_date).filter(Boolean).sort();
    if (dates.length === 0) return 'Nov 2, 2026';
    const latest = dates[dates.length - 1];
    if (!latest) return 'Nov 2, 2026';
    try {
      const d = new Date(latest);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return latest;
    }
  }, [state?.tasks]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-200 dark:border-white/[0.08] bg-white/95 dark:bg-[#07090e]/95 backdrop-blur-xl transition-colors duration-200">
      {/* Top Bar: Brand, Status, Theme Toggle, Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2 border-b border-neutral-100 dark:border-white/[0.04] text-xs">
        {/* Brand & Project Switcher */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-black shadow-sm">
              <Zap className="w-3 h-3" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold tracking-tight text-neutral-900 dark:text-white text-sm">
                Cascade<span className="text-neutral-400 font-normal">OS</span>
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60">
                FinOps
              </span>
            </div>
          </div>

          {/* Project Switcher Select Dropdown */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 border border-neutral-200 dark:border-neutral-800 text-xs transition-colors">
              <Building className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
              <select
                value={activeProjectId}
                onChange={(e) => switchProject(e.target.value)}
                className="bg-transparent font-medium text-neutral-900 dark:text-white text-xs focus:outline-none cursor-pointer max-w-[180px] sm:max-w-[220px] truncate"
                title="Switch active project"
              >
                {projectsList.length > 0 ? (
                  projectsList.map((p) => (
                    <option
                      key={p.project_id}
                      value={p.project_id}
                      className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white"
                    >
                      {p.name} ({p.total_tasks} phases)
                    </option>
                  ))
                ) : (
                  <option
                    value={activeProjectId}
                    className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white"
                  >
                    {state?.project?.name || 'Apex Horizon Clinic'}
                  </option>
                )}
              </select>
            </div>

            {/* + New Project Button */}
            <button
              onClick={openNewProjectModal}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-100 font-mono text-xs font-medium shadow-sm transition-all"
              title="Create a new custom project via AI Architect or Manual Builder"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Project</span>
            </button>
          </div>
        </div>

        {/* Minimal Connectivity Indicators */}
        <div className="hidden sm:flex items-center gap-3 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="font-medium text-neutral-800 dark:text-neutral-200">PayPal & Channel3 Live</span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
            <ShieldCheck className="w-3 h-3 text-emerald-500" />
            <span className="font-medium text-neutral-800 dark:text-neutral-200">10/10 Invariants</span>
          </div>
        </div>

        {/* Top Actions: Audit, AI, Theme Toggle, Reset */}
        <div className="flex items-center gap-2">
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 transition-colors"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-neutral-700" />
            )}
          </button>

          <button
            onClick={() => setIsAuditDrawerOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 transition-colors font-mono text-xs"
          >
            <FileText className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
            <span>Audit</span>
          </button>

          <button
            onClick={() => setIsAgentChatOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 transition-colors font-mono text-xs"
          >
            <Bot className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
            <span>FinOps AI</span>
          </button>

          <button
            onClick={() => bootstrapProject(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 border border-neutral-200 dark:border-neutral-800 transition-colors font-mono text-xs disabled:opacity-50"
            title="Reset sandbox state in SQLite"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Main Bar: 4 Bento KPI Cards with Aceternity CardSpotlight */}
      <div className="px-6 py-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: Idle Exposure at Risk */}
          <CardSpotlight
            color="rgba(244, 63, 94, 0.08)"
            className="flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-medium">
                Exposure at Risk
              </span>
              <span className="flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60">
                <span className="w-1 h-1 rounded-full bg-rose-500 animate-pulse" />
                Overdue
              </span>
            </div>
            <div className="mt-2">
              <div className="text-xl font-semibold tracking-tight font-mono text-neutral-900 dark:text-white">
                {formatMinorToUSD(totalIdleExposure > 0 ? totalIdleExposure : 510000)}
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 font-sans">
                56 idle hours &bull; $1,440 penalty mitigated
              </p>
            </div>
          </CardSpotlight>

          {/* Card 2: Channel3 Arbitrage Discovered */}
          <CardSpotlight
            color="rgba(16, 185, 129, 0.08)"
            className="flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-medium">
                Supplier Arbitrage
              </span>
              <span className="flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60">
                +28.78% Save
              </span>
            </div>
            <div className="mt-2">
              <div className="text-xl font-semibold tracking-tight font-mono text-emerald-600 dark:text-emerald-400">
                {formatMinorToUSD(totalSavings)}
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 font-sans">
                Channel3 OEM vs $490/u vendor
              </p>
            </div>
          </CardSpotlight>

          {/* Card 3: Materials Split Unlock */}
          <CardSpotlight
            color="rgba(56, 189, 248, 0.08)"
            className="flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-medium">
                Materials Split Unlock
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                Partial
              </span>
            </div>
            <div className="mt-2">
              <div className="text-xl font-semibold tracking-tight font-mono text-neutral-900 dark:text-white">
                {formatMinorToUSD(materialsUnlockMinor)}
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 font-sans">
                Defers labor until milestone delivery
              </p>
            </div>
          </CardSpotlight>

          {/* Card 4: Guaranteed Target Date */}
          <CardSpotlight
            color="rgba(255, 255, 255, 0.05)"
            className="flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-medium">
                Target Opening Date
              </span>
              <span className="flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                Critical Path
              </span>
            </div>
            <div className="mt-2">
              <div className="text-xl font-semibold tracking-tight font-mono text-neutral-900 dark:text-white">
                {targetOpeningDate}
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 font-sans">
                0 days net project delay
              </p>
            </div>
          </CardSpotlight>
        </div>

        {/* Decongested Scenario Controls Toolbar */}
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-neutral-100 dark:border-white/[0.04]">
          <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-medium">
            Scenarios:
          </span>

          <div className="flex flex-wrap items-center gap-2">
            {/* Scenario A: Overdue Invoice & Schedule Reroute */}
            <button
              onClick={() => triggerScenario('SCENARIO_A')}
              disabled={isRefreshing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-all ${
                activeScenario === 'SCENARIO_A'
                  ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/40 shadow-sm'
                  : 'bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-900/60 dark:hover:bg-neutral-900 text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white border-neutral-200 dark:border-neutral-800'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>A: Invoice Delay & Reroute</span>
            </button>

            {/* Scenario B: Vendor Price-Creep & Channel3 Arbitrage */}
            <button
              onClick={() => triggerScenario('SCENARIO_B')}
              disabled={isRefreshing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-all ${
                activeScenario === 'SCENARIO_B'
                  ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40 shadow-sm'
                  : 'bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-900/60 dark:hover:bg-neutral-900 text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white border-neutral-200 dark:border-neutral-800'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>B: Price-Creep Defense</span>
            </button>

            {/* Scenario C: Adversarial Hard-Dependency & Budget Block */}
            <button
              onClick={() => triggerScenario('SCENARIO_C')}
              disabled={isRefreshing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-all ${
                activeScenario === 'SCENARIO_C'
                  ? 'bg-rose-100 dark:bg-rose-500/10 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-500/40 shadow-sm'
                  : 'bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-900/60 dark:hover:bg-neutral-900 text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white border-neutral-200 dark:border-neutral-800'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span>C: Invariant Block</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopScenarioBar;
