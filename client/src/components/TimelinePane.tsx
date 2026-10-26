/**
 * @file TimelinePane.tsx
 * @description Production FinOps Gantt Timeline powered by Bryntum Gantt React.
 *
 * Implements:
 * - TASK-028: Bryntum Gantt Component with custom columns, dependencies, critical paths
 * - REQ-002: Integer minor units formatted via formatMinorToUSD
 * - Decongested, minimal header without unnecessary helper text
 * - Full Dark & Light theme support
 */

import React, { useRef, useMemo, useState, useEffect } from 'react';
import { BryntumGantt } from '@bryntum/gantt-react';
import { useCascadeState } from '@/context/CascadeStateContext';
import { formatMinorToUSD } from '@/utils/formatters';
import {
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  Zap,
  FilterX,
  Layers,
  ArrowRight,
  Maximize2,
  DollarSign,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import type { CascadeTask, ScheduleStatus, PayPalInvoiceStatus } from '@/types/domain';

export const TimelinePane: React.FC = () => {
  const {
    state,
    selectedTaskId,
    selectTask,
    isRefreshing,
    openTaskDrawer,
    addNewTaskPhase,
    updateTaskSchedule,
  } = useCascadeState();
  const ganttRef = useRef<BryntumGantt>(null);

  const [criticalPathEnabled, setCriticalPathEnabled] = useState(true);
  const [viewPreset, setViewPreset] = useState<'weekAndDay' | 'monthAndYear' | 'dayAndWeek'>('weekAndDay');

  // Transform domain tasks into Bryntum TaskModel data
  const projectData = useMemo(() => {
    if (!state?.tasks || state.tasks.length === 0) {
      return { tasks: [], dependencies: [] };
    }

    const tasks = state.tasks.map((task: CascadeTask) => {
      let percentDone = 0;
      if (task.schedule_status === 'COMPLETED') percentDone = 100;
      else if (task.schedule_status === 'REROUTED_ACTIVE') percentDone = 40;
      else if (task.schedule_status === 'READY_TO_PROMOTE') percentDone = 20;

      const statusClass = `status-${task.schedule_status.toLowerCase().replace(/_/g, '-')}`;
      const isSelected = selectedTaskId === task.task_id ? 'b-selected-milestone' : '';

      return {
        id: task.task_id,
        name: task.name,
        startDate: task.start_date,
        endDate: task.end_date,
        duration: task.duration_days,
        durationUnit: 'd',
        percentDone,
        cls: `${statusClass} ${isSelected}`,
        crewAssigned: task.crew_assigned,
        scheduleStatus: task.schedule_status,
        invoiceStatus: task.paypal_invoice_status,
        invoiceTotalMinor: task.invoice_total_minor,
        materialsUnlockMinor: task.materials_unlock_minor,
        dailyIdleBurnMinor: task.daily_idle_burn_minor,
        slaPenaltyMinor: task.sla_delay_penalty_minor,
        materialsInWarehouse: task.materials_in_warehouse,
        paypalInvoiceId: task.paypal_invoice_id,
        paypalInvoiceNumber: task.paypal_invoice_number,
      };
    });

    const dependencies = (state.dependencies || []).map((dep) => ({
      id: dep.dependency_id,
      from: dep.from_task_id,
      to: dep.to_task_id,
      type: 2, // Finish-to-Start
      lag: dep.lag_days,
    }));

    return { tasks, dependencies };
  }, [state?.tasks, state?.dependencies, selectedTaskId]);

  // Defensive unmount cleanup for Bryntum criticalPaths observer to prevent race conditions during unmount
  useEffect(() => {
    return () => {
      try {
        const inst = ganttRef.current?.instance;
        if (inst && !inst.isDestroyed) {
          const cp = (inst as any).features?.criticalPaths;
          if (cp) {
            if (cp.criticalPathObserver) {
              try {
                const graph = (inst.project as any)?.getGraph?.();
                if (graph && typeof graph.removeIdentifier === 'function') {
                  graph.removeIdentifier(cp.criticalPathObserver);
                }
              } catch {
                // Ignore graph detach errors
              }
              cp.criticalPathObserver = null;
            }
          }
        }
      } catch {
        // Safe unmount
      }
    };
  }, []);

  // Bryntum Column configurations with rich HTML renderers
  const columns = useMemo(() => [
    {
      type: 'wbs',
      text: 'WBS',
      width: 50,
      align: 'center',
    },
    {
      type: 'name',
      text: 'Milestone',
      width: 240,
      renderer: ({ record }: any) => {
        const isSelected = selectedTaskId === record.id;
        return `
          <div class="flex items-center space-x-2 py-0.5 ${isSelected ? 'font-bold text-emerald-500' : ''}">
            <span class="truncate">${record.name}</span>
          </div>
        `;
      },
    },
    {
      text: 'Crew',
      field: 'crewAssigned',
      width: 150,
      renderer: ({ record }: any) => `
        <div class="flex items-center space-x-1.5 text-xs font-mono opacity-80">
          <span class="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
          <span class="truncate">${record.crewAssigned || 'Unassigned'}</span>
        </div>
      `,
    },
    {
      text: 'Status',
      field: 'scheduleStatus',
      width: 150,
      renderer: ({ record }: any) => {
        const st: ScheduleStatus = record.scheduleStatus;
        let badgeColor = 'bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-300 dark:border-neutral-800';
        let dotColor = 'bg-neutral-400';
        let label: string = st;

        if (st === 'COMPLETED') {
          badgeColor = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800/50';
          dotColor = 'bg-emerald-500';
        } else if (st === 'PAYMENT_BLOCKED') {
          badgeColor = 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800/60 font-semibold';
          dotColor = 'bg-rose-500';
        } else if (st === 'REROUTED_ACTIVE') {
          badgeColor = 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800/50';
          dotColor = 'bg-sky-500';
        } else if (st === 'READY_TO_PROMOTE') {
          badgeColor = 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800/50';
          dotColor = 'bg-amber-500';
        } else if (st === 'MATERIALS_ORDERED') {
          badgeColor = 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800/50';
          dotColor = 'bg-purple-500';
        }

        return `
          <div class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-mono border ${badgeColor}">
            <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
            <span class="tracking-wide">${label.replace(/_/g, ' ')}</span>
          </div>
        `;
      },
    },
    {
      text: 'PayPal Invoice',
      field: 'invoiceStatus',
      width: 140,
      renderer: ({ record }: any) => {
        const inv: PayPalInvoiceStatus = record.invoiceStatus;
        let badgeColor = 'bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-300 dark:border-neutral-800';
        let dotColor = 'bg-neutral-400';

        if (inv === 'PAID') {
          badgeColor = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800/50 font-medium';
          dotColor = 'bg-emerald-500';
        } else if (inv === 'OVERDUE') {
          badgeColor = 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800/60 font-semibold';
          dotColor = 'bg-rose-500';
        } else if (inv === 'PARTIALLY_PAID') {
          badgeColor = 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800/50 font-medium';
          dotColor = 'bg-sky-500';
        } else if (inv === 'SENT') {
          badgeColor = 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800/50';
          dotColor = 'bg-amber-500';
        }

        return `
          <div class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-mono border ${badgeColor}">
            <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
            <span>${inv}</span>
          </div>
        `;
      },
    },
    {
      text: 'Unlock Amount',
      field: 'materialsUnlockMinor',
      width: 120,
      renderer: ({ record }: any) => {
        const amt = formatMinorToUSD(record.materialsUnlockMinor);
        return `<span class="font-mono text-xs font-medium text-emerald-600 dark:text-emerald-400">${amt}</span>`;
      },
    },
    {
      text: 'Idle Burn',
      field: 'dailyIdleBurnMinor',
      width: 100,
      renderer: ({ record }: any) => {
        const amt = formatMinorToUSD(record.dailyIdleBurnMinor);
        return `<span class="font-mono text-xs text-rose-600 dark:text-rose-400">${amt}/d</span>`;
      },
    },
    {
      type: 'date',
      text: 'Start',
      field: 'startDate',
      width: 95,
      format: 'YYYY-MM-DD',
    },
    {
      type: 'date',
      text: 'End',
      field: 'endDate',
      width: 95,
      format: 'YYYY-MM-DD',
    },
  ], [selectedTaskId]);

  const ganttConfig = useMemo(() => ({
    viewPreset,
    rowHeight: 46,
    barMargin: 8,
    criticalPathsFeature: {
      disabled: !criticalPathEnabled,
    },
    taskRenderer: ({ taskRecord }: any) => {
      const invoiceStatus = taskRecord.invoiceStatus;
      const scheduleStatus = taskRecord.scheduleStatus;

      let badgeText = scheduleStatus?.replace(/_/g, ' ') || 'SCHEDULED';
      let badgeCls = 'bg-neutral-800 text-neutral-200 border-neutral-700';

      if (invoiceStatus === 'PAID') {
        badgeText = 'PAID';
        badgeCls = 'bg-emerald-600/90 text-white border-emerald-400/40 shadow-sm';
      } else if (invoiceStatus === 'OVERDUE' || scheduleStatus === 'PAYMENT_BLOCKED') {
        badgeText = 'OVERDUE — BLOCKING ($2,800 RISK)';
        badgeCls = 'bg-rose-600 text-white font-bold border-rose-400/40 animate-pulse shadow-sm';
      } else if (scheduleStatus === 'REROUTED_ACTIVE') {
        badgeText = 'REROUTED — ACTIVE';
        badgeCls = 'bg-sky-600/90 text-white font-semibold border-sky-400/40 shadow-sm';
      } else if (scheduleStatus === 'MATERIALS_ORDERED') {
        badgeText = 'MATERIALS ORDERED';
        badgeCls = 'bg-purple-600/90 text-white font-semibold border-purple-400/40 shadow-sm';
      } else if (scheduleStatus === 'READY_TO_PROMOTE') {
        badgeText = 'READY TO PROMOTE';
        badgeCls = 'bg-amber-600/90 text-white font-semibold border-amber-400/40 shadow-sm';
      }

      return `
        <div class="b-gantt-task-content flex items-center justify-between w-full h-full px-2.5 overflow-hidden text-xs">
          <span class="truncate font-medium text-white drop-shadow-sm">${taskRecord.name}</span>
          <span class="ml-2 px-2 py-0.5 rounded text-[10px] font-mono tracking-wider uppercase border whitespace-nowrap ${badgeCls}">
            ${badgeText}
          </span>
        </div>
      `;
    },
    taskTooltipFeature: {
      template: ({ taskRecord }: any) => {
        const unlock = formatMinorToUSD(taskRecord.materialsUnlockMinor || 0);
        const burn = formatMinorToUSD(taskRecord.dailyIdleBurnMinor || 0);
        const penalty = formatMinorToUSD(taskRecord.slaPenaltyMinor || 0);
        return `
          <div class="p-2 space-y-1 text-xs font-mono">
            <div class="font-bold border-b pb-1">${taskRecord.name}</div>
            <div class="flex justify-between"><span>Status:</span><span>${taskRecord.scheduleStatus}</span></div>
            <div class="flex justify-between"><span>Materials Unlock:</span><span class="text-emerald-500 font-bold">${unlock}</span></div>
            <div class="flex justify-between"><span>Daily Burn:</span><span class="text-rose-500">${burn}/d</span></div>
            <div class="flex justify-between"><span>SLA Penalty:</span><span>${penalty}</span></div>
          </div>
        `;
      },
    },
  }), [criticalPathEnabled, viewPreset]);

  // Handle task selection
  const handleSelectionChange = ({ selected }: any) => {
    if (selected && selected.length > 0) {
      const selectedId = selected[0].id as string;
      selectTask(selectedId);
    } else {
      selectTask(null);
    }
  };

  const handleZoomToFit = () => {
    ganttRef.current?.instance?.zoomToFit({
      leftMargin: 30,
      rightMargin: 30,
    });
  };

  // Find currently selected task record for quick inspection banner
  const activeTask = useMemo(() => {
    if (!selectedTaskId || !state?.tasks) return null;
    return state.tasks.find((t) => t.task_id === selectedTaskId) || null;
  }, [selectedTaskId, state?.tasks]);

  const handleQuickAddPhase = async () => {
    const currentCount = state?.tasks?.length || 0;
    const newPhaseNum = currentCount + 1;
    const newId = `phase_${newPhaseNum}_custom`;

    let startDate = new Date().toISOString().slice(0, 10);
    if (state?.tasks && state.tasks.length > 0) {
      const sorted = [...state.tasks].sort((a, b) => a.end_date.localeCompare(b.end_date));
      const lastTask = sorted[sorted.length - 1];
      if (lastTask && lastTask.end_date) {
        const d = new Date(lastTask.end_date);
        d.setDate(d.getDate() + 1);
        startDate = d.toISOString().slice(0, 10);
      }
    }

    await addNewTaskPhase({
      task_id: newId,
      name: `Phase ${newPhaseNum}: Operational Commissioning`,
      duration_days: 3,
      start_date: startDate,
      crew_assigned: 'Integration & Testing Crew',
      daily_idle_burn_minor: 65000,
      sla_delay_penalty_minor: 0,
      phase_hardware_budget_max_minor: 100000,
      schedule_status: 'SCHEDULED',
      invoice_total_minor: 320000,
      materials_unlock_minor: 96000,
      deferred_labor_minor: 224000,
      materials_in_warehouse: true,
      create_live_paypal_invoice: true,
      run_live_channel3_audit: false,
    });
  };

  const handleTaskDblClick = ({ taskRecord }: any) => {
    if (taskRecord?.id) {
      openTaskDrawer(String(taskRecord.id));
    }
  };

  const handleCellDblClick = ({ record }: any) => {
    if (record?.id) {
      openTaskDrawer(String(record.id));
    }
  };

  const handleAfterTaskDrop = async ({ context }: any) => {
    if (context?.taskRecord) {
      const t = context.taskRecord;
      const sDate = t.startDate ? new Date(t.startDate).toISOString().slice(0, 10) : undefined;
      const eDate = t.endDate ? new Date(t.endDate).toISOString().slice(0, 10) : undefined;
      const duration = Math.max(1, Math.round(t.duration || 1));
      await updateTaskSchedule(String(t.id), {
        start_date: sDate,
        end_date: eDate,
        duration_days: duration,
      });
    }
  };

  const handleAfterTaskEdit = async ({ taskRecord }: any) => {
    if (taskRecord) {
      const sDate = taskRecord.startDate ? new Date(taskRecord.startDate).toISOString().slice(0, 10) : undefined;
      const eDate = taskRecord.endDate ? new Date(taskRecord.endDate).toISOString().slice(0, 10) : undefined;
      const duration = Math.max(1, Math.round(taskRecord.duration || 1));
      await updateTaskSchedule(String(taskRecord.id), {
        start_date: sDate,
        end_date: eDate,
        duration_days: duration,
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0c0e14] border border-neutral-200 dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm transition-colors duration-200">
      {/* Decongested Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-5 py-2.5 bg-neutral-50 dark:bg-[#090b10] border-b border-neutral-200 dark:border-white/[0.08]">
        <div className="flex items-center space-x-2.5">
          <div className="w-6 h-6 rounded-md bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 flex items-center justify-center text-neutral-600 dark:text-neutral-300">
            <Layers className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xs font-mono font-semibold tracking-wider text-neutral-900 dark:text-white uppercase">
              Schedule Timeline
            </h2>
            {isRefreshing && (
              <span className="flex h-1.5 w-1.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2 font-mono text-xs">
          {/* + Add Phase Button */}
          <button
            onClick={handleQuickAddPhase}
            disabled={isRefreshing}
            className="px-2.5 py-1 text-xs font-mono rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-medium hover:opacity-90 flex items-center space-x-1.5 transition-all shadow-sm disabled:opacity-50"
            title="Add a new milestone phase to this project"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Phase</span>
          </button>

          {/* Critical Path Toggle */}
          <button
            onClick={() => setCriticalPathEnabled((v) => !v)}
            className={`px-2.5 py-1 text-xs font-mono rounded-lg border transition-all flex items-center space-x-1.5 ${
              criticalPathEnabled
                ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800/60'
                : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800 hover:text-neutral-900 dark:hover:text-white'
            }`}
            title="Toggle Critical Path"
          >
            <AlertTriangle className="w-3 h-3 text-rose-500" />
            <span>Critical Path</span>
          </button>

          {/* Preset Buttons */}
          <div className="flex bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setViewPreset('dayAndWeek')}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                viewPreset === 'dayAndWeek'
                  ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-semibold shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              Days
            </button>
            <button
              onClick={() => setViewPreset('weekAndDay')}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                viewPreset === 'weekAndDay'
                  ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-semibold shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              Weeks
            </button>
            <button
              onClick={() => setViewPreset('monthAndYear')}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                viewPreset === 'monthAndYear'
                  ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-semibold shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              Months
            </button>
          </div>

          {/* Zoom to fit */}
          <button
            onClick={handleZoomToFit}
            className="p-1 rounded-lg bg-neutral-100 dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-800 hover:text-neutral-800 dark:hover:text-white transition-all"
            title="Zoom to Fit Schedule"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          {/* Clear Filter / Deselect */}
          {selectedTaskId && (
            <button
              onClick={() => selectTask(null)}
              className="px-2 py-1 text-xs font-mono rounded-lg bg-amber-50 dark:bg-neutral-900 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 flex items-center space-x-1"
              title="Clear filter"
            >
              <FilterX className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Cross-Filtering Active Minimal Banner */}
      {activeTask && (
        <div className="bg-emerald-50/80 dark:bg-slate-900/90 border-b border-emerald-200 dark:border-emerald-500/30 px-5 py-1.5 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="font-semibold text-neutral-900 dark:text-slate-100">{activeTask.name}</span>
            <span className="text-neutral-500 dark:text-neutral-400">({activeTask.task_id})</span>
          </div>
          <div className="flex items-center space-x-3 font-mono text-[11px]">
            <span>Unlock: <strong className="text-emerald-600 dark:text-emerald-400">{formatMinorToUSD(activeTask.materials_unlock_minor)}</strong></span>
            <span>Burn: <strong className="text-rose-600 dark:text-rose-400">{formatMinorToUSD(activeTask.daily_idle_burn_minor)}/d</strong></span>
            <button
              onClick={() => openTaskDrawer(activeTask.task_id)}
              className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-mono text-[11px] font-medium hover:opacity-90 transition-opacity shadow-sm ml-2"
              title="Inspect task financial split and Channel3 hardware quotes"
            >
              <span>Inspect Financials</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Bryntum Gantt View Container */}
      <div className="flex-1 min-h-[460px] w-full relative">
        <BryntumGantt
          ref={ganttRef}
          tasks={projectData.tasks}
          dependencies={projectData.dependencies}
          columns={columns as any}
          {...ganttConfig}
          onSelectionChange={handleSelectionChange}
          onCellDblClick={handleCellDblClick}
          onTaskDblClick={handleTaskDblClick}
          onAfterTaskDrop={handleAfterTaskDrop}
          onAfterTaskEdit={handleAfterTaskEdit}
          cls="w-full h-full"
        />
      </div>
    </div>
  );
};

export default TimelinePane;
