/**
 * @file TaskFinancialsDrawer.tsx
 * @description Slide-Over Phase Financials & Live Procurement Drawer (TASK-107, REQ-106, REQ-108).
 *
 * Implements:
 * - Direct inspection & live editing of task schedule dates and warehouse staging
 * - Live PayPal Sandbox Invoicing v2 status, split breakdown, and QR code inspection
 * - Channel3 retail hardware price audit, supplier quotes table, and 1-click re-audit
 * - Full Dark & Light theme compatibility with clean institutional design
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Calendar,
  Clock,
  DollarSign,
  PackageCheck,
  AlertTriangle,
  CheckCircle2,
  QrCode,
  Search,
  ShoppingCart,
  TrendingDown,
  Building,
  RefreshCw,
  Zap,
  ExternalLink,
  ShieldCheck,
  Tag
} from 'lucide-react';
import { useCascadeState } from '@/context/CascadeStateContext';
import { formatMinorToUSD } from '@/utils/formatters';
import type { CascadeTask, SupplierQuote } from '@/types/domain';
import { useDialog } from './ui/useDialog';

export const TaskFinancialsDrawer: React.FC = () => {
  const {
    isTaskFinancialsDrawerOpen,
    closeTaskDrawer,
    drawerTaskId,
    selectedTaskId,
    state,
    updateTaskSchedule,
    provisionTaskFinancials,
  } = useCascadeState();

  const activeId = drawerTaskId || selectedTaskId;
  const task = state?.tasks?.find((t) => t.task_id === activeId);

  // Local editable form states
  const [durationDays, setDurationDays] = useState(task?.duration_days || 1);
  const [startDate, setStartDate] = useState(task?.start_date || '');
  const [endDate, setEndDate] = useState(task?.end_date || '');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const dialogRef = useDialog(isTaskFinancialsDrawerOpen && !!task, closeTaskDrawer);

  useEffect(() => {
    if (task) {
      setDurationDays(task.duration_days);
      setStartDate(task.start_date);
      setEndDate(task.end_date);
    }
  }, [task]);

  if (!isTaskFinancialsDrawerOpen || !task) return null;

  // Filter supplier quotes for this task
  const quotes: SupplierQuote[] =
    state?.supplierQuotes?.filter((q) => q.task_id === task.task_id) || [];

  const handleToggleWarehouse = async () => {
    const nextVal = task.materials_in_warehouse === 1 ? false : true;
    setIsUpdating(true);
    try {
      await updateTaskSchedule(task.task_id, {
        materials_in_warehouse: nextVal,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveScheduleDates = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      await updateTaskSchedule(task.task_id, {
        duration_days: durationDays,
        start_date: startDate,
        end_date: endDate,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRunAuditAndInvoice = async () => {
    setIsProvisioning(true);
    try {
      await provisionTaskFinancials(task.task_id);
    } finally {
      setIsProvisioning(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeTaskDrawer}
          className="absolute inset-0 dialog-backdrop"
        />

        {/* Slide-over Drawer Panel */}
        <div className="drawer-container fixed inset-y-0 right-0 max-w-full flex pl-10">
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-dialog-title"
            tabIndex={-1}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="dialog-panel drawer-panel w-screen max-w-xl border-l flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-neutral-200 dark:border-white/[0.08] bg-neutral-50/80 dark:bg-neutral-900/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 flex items-center justify-center shadow-sm">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 id="task-dialog-title" className="text-sm font-semibold text-neutral-900 dark:text-white truncate max-w-xs">
                      {task.name}
                    </h3>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-neutral-200/60 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                      {task.task_id}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 font-mono">
                    Crew: {task.crew_assigned} &bull; Status: {task.schedule_status}
                  </p>
                </div>
              </div>

              <button
                aria-label="Close phase financials"
                onClick={closeTaskDrawer}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Section 1: Schedule & Readiness Controls */}
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-neutral-500 font-semibold">
                    Schedule Dates & Staging
                  </span>
                  <span className="text-[11px] font-mono text-neutral-400">
                    Auto-recomputes critical path
                  </span>
                </div>

                <form onSubmit={handleSaveScheduleDates} className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-mono text-neutral-500 block mb-1">
                        Start Date
                      </label>
                      <input
                        aria-label="Start date"
                        required
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-2 py-1 text-xs font-mono bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-neutral-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-neutral-500 block mb-1">
                        End Date
                      </label>
                      <input
                        aria-label="End date"
                        required
                        min={startDate}
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-2 py-1 text-xs font-mono bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-neutral-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-neutral-500 block mb-1">
                        Duration (d)
                      </label>
                      <input
                        aria-label="Duration in days"
                        type="number"
                        min={1}
                        value={durationDays}
                        onChange={(e) => setDurationDays(parseInt(e.target.value) || 1)}
                        className="w-full px-2 py-1 text-xs font-mono bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-neutral-900 dark:text-white text-center"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    {/* Warehouse Materials Readiness Toggle */}
                    <button
                      type="button"
                      onClick={handleToggleWarehouse}
                      aria-pressed={task.materials_in_warehouse === 1}
                      disabled={isUpdating}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
                        task.materials_in_warehouse === 1
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                          : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                      }`}
                    >
                      <PackageCheck className="w-3.5 h-3.5" />
                      <span>
                        Warehouse Staged:{' '}
                        <strong>{task.materials_in_warehouse === 1 ? 'YES' : 'NO (Procure)'}</strong>
                      </span>
                    </button>

                    <button
                      type="submit"
                      disabled={isUpdating}
                      className="px-3 py-1.5 text-xs font-mono font-medium rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 transition-colors disabled:opacity-50"
                    >
                      {isUpdating ? 'Saving...' : 'Apply Schedule'}
                    </button>
                  </div>
                </form>

                {/* Idle Burn & Penalty */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800/80 font-mono text-[11px]">
                  <div>
                    <span className="text-neutral-500 block">Daily Idle Burn:</span>
                    <strong className="text-rose-600 dark:text-rose-400">
                      {formatMinorToUSD(task.daily_idle_burn_minor)}/day
                    </strong>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">Milestone SLA Penalty:</span>
                    <strong className="text-neutral-800 dark:text-neutral-200">
                      {formatMinorToUSD(task.sla_delay_penalty_minor)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Section 2: PayPal Sandbox Invoicing v2 */}
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                    <span className="text-xs font-mono uppercase tracking-wider text-neutral-500 font-semibold">
                      PayPal Sandbox Invoicing v2
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                      task.paypal_invoice_status === 'OVERDUE'
                        ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-800'
                        : task.paypal_invoice_status === 'PAID'
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-700'
                    }`}
                  >
                    {task.paypal_invoice_status}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                    <span>Invoice Ref:</span>
                    <span className="font-semibold text-neutral-900 dark:text-white">
                      {task.paypal_invoice_id || 'Not Provisioned'}
                    </span>
                  </div>
                  <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                    <span>Invoice Number:</span>
                    <span className="text-neutral-900 dark:text-white">
                      {task.paypal_invoice_number || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                    <span>Client Billing:</span>
                    <span className="text-neutral-900 dark:text-white">{task.client_email}</span>
                  </div>
                  {task.paypal_invoice_view_url && (
                    <a
                      href={task.paypal_invoice_view_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between text-sky-600 dark:text-sky-400 hover:underline"
                    >
                      <span>Buyer Payment Page:</span>
                      <span className="flex items-center gap-1">Open PayPal <ExternalLink className="w-3 h-3" /></span>
                    </a>
                  )}

                  <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Gross Phase Invoice:</span>
                      <strong className="text-neutral-900 dark:text-white">
                        {formatMinorToUSD(task.invoice_total_minor)}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Partial Materials Unlock:
                      </span>
                      <strong className="text-emerald-600 dark:text-emerald-400">
                        {formatMinorToUSD(task.materials_unlock_minor)}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Deferred Labor Portion:</span>
                      <span className="text-neutral-800 dark:text-neutral-200">
                        {formatMinorToUSD(task.deferred_labor_minor)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* QR Code if exists */}
                {task.qr_code_base64 && (
                  <div className="pt-2 flex items-center justify-between bg-white dark:bg-neutral-800 p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700">
                    <div>
                      <span className="text-[11px] font-mono font-medium text-neutral-900 dark:text-white block">
                        PayPal Instant Checkout QR
                      </span>
                      <span className="text-[10px] text-neutral-500 font-mono">
                        Scan to unlock ${task.materials_unlock_minor / 100} in Sandbox
                      </span>
                    </div>
                    <img
                      src={`data:image/png;base64,${task.qr_code_base64}`}
                      alt="PayPal Invoicing QR"
                      className="w-16 h-16 rounded border border-neutral-200 dark:border-neutral-700"
                    />
                  </div>
                )}
              </div>

              {/* Section 3: Channel3 Hardware Procurement Audit */}
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ShoppingCart className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                    <span className="text-xs font-mono uppercase tracking-wider text-neutral-500 font-semibold">
                      Channel3 Retail Hardware Audit
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunAuditAndInvoice}
                    disabled={isProvisioning}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isProvisioning ? 'animate-spin' : ''}`} />
                    <span>Run Live Audit</span>
                  </button>
                </div>

                {task.sku_search_query ? (
                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-white dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Hardware SKU Search:</span>
                        <strong className="text-neutral-900 dark:text-white">
                          "{task.sku_search_query}"
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Required Quantity:</span>
                        <span className="text-neutral-800 dark:text-neutral-200">
                          {task.required_quantity} units
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Incumbent Vendor:</span>
                        <span className="text-neutral-800 dark:text-neutral-200">
                          {task.incumbent_vendor_name || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Incumbent Price:</span>
                        <span className="text-rose-600 dark:text-rose-400 font-semibold">
                          {task.incumbent_unit_price_minor
                            ? `${formatMinorToUSD(task.incumbent_unit_price_minor)}/u`
                            : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Historical Baseline:</span>
                        <span className="text-neutral-700 dark:text-neutral-300">
                          {task.historical_unit_price_minor
                            ? `${formatMinorToUSD(task.historical_unit_price_minor)}/u`
                            : 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Channel3 Sourced Quotes List */}
                    <div className="space-y-2 pt-1">
                      <span className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider block">
                        Live Channel3 Product Quotes ({quotes.length}):
                      </span>

                      {quotes.length === 0 ? (
                        <div className="p-3 text-center rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-500 text-xs">
                          No quotes yet. Click "Run Live Audit" to query Channel3 Graph API.
                        </div>
                      ) : (
                        quotes.map((q) => (
                          <div
                            key={q.quote_id}
                            className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-neutral-900 dark:text-white truncate max-w-[240px]">
                                {q.product_title}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300">
                                {q.merchant_name}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-[11px]">
                              <span>
                                Unit Price: <strong>{formatMinorToUSD(q.unit_price_minor)}</strong>{' '}
                                &bull; Total: <strong>{formatMinorToUSD(q.total_minor)}</strong>
                              </span>
                              {q.savings_vs_incumbent_minor > 0 && (
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                                  <TrendingDown className="w-3 h-3" />
                                  Save {formatMinorToUSD(q.savings_vs_incumbent_minor)}
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500 font-mono">
                    Labor-only milestone. No hardware procurement required for this phase.
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-neutral-200 dark:border-white/[0.08] bg-neutral-50/80 dark:bg-neutral-900/40 flex items-center justify-end">
              <button
                type="button"
                onClick={closeTaskDrawer}
                className="px-4 py-1.5 text-xs font-mono font-medium rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity"
              >
                Close Drawer
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
};

export default TaskFinancialsDrawer;
