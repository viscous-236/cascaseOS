/**
 * @file ApprovalCheckoutModal.tsx
 * @description Production Deterministic Policy Diff & PayPal Sandbox Checkout Modal.
 *
 * Implements:
 * - TASK-029: Cryptographic Approval with SHA-256 fingerprint validation
 * - REQ-010: Side-by-side Deterministic Policy Diff (Permitted vs Observed)
 * - REQ-011: Split PayPal Invoice & Live PayPal Sandbox QR Code
 * - REQ-017: Live PayPal Buttons capture with canvas-confetti burst
 * - Integer minor units formatted via formatMinorToUSD
 * - Full Dark & Light theme support
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { toast } from 'sonner';
import { useCascadeState } from '@/context/CascadeStateContext';
import { formatMinorToUSD, formatMinorToPayPalValue, formatVariancePct, truncateHash } from '@/utils/formatters';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  Copy,
  ExternalLink,
  QrCode,
  DollarSign,
  ArrowRight,
  Sparkles,
  Lock,
  X,
  CreditCard,
  Send,
  AlertOctagon,
  TrendingDown,
  Building2,
  FileCheck2,
  Layers
} from 'lucide-react';
import type { ReasonCode } from '@/types/domain';
import { useDialog } from './ui/useDialog';

export const ApprovalCheckoutModal: React.FC = () => {
  const {
    isApprovalModalOpen,
    closeApprovalModal,
    activePlan,
    state,
    approvePlan,
    refreshState,
  } = useCascadeState();

  const [approverName, setApproverName] = useState('VP of Construction FinOps');
  const [customNote, setCustomNote] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<'DIFF' | 'PAYPAL_CHECKOUT' | 'SUCCESS'>('DIFF');
  const dialogRef = useDialog(isApprovalModalOpen && !!activePlan, () => { if (!isSubmitting) closeApprovalModal(); });
  useEffect(() => { if (isApprovalModalOpen) { setCheckoutStep('DIFF'); setIsCopied(false); } }, [isApprovalModalOpen, activePlan?.plan_id]);
  const canApprove = activePlan?.status === 'PROPOSED' && activePlan.policy_decision !== 'BLOCK' && !!approverName.trim();

  // Parse reason codes from JSON
  const reasonCodes: ReasonCode[] = useMemo(() => {
    if (!activePlan?.reason_codes_json) return [];
    try {
      return JSON.parse(activePlan.reason_codes_json);
    } catch {
      return [];
    }
  }, [activePlan?.reason_codes_json]);

  // Lookup associated tasks
  const blockedTask = useMemo(() => {
    if (!activePlan || !state?.tasks) return null;
    return state.tasks.find((t) => t.task_id === activePlan.blocked_task_id) || null;
  }, [activePlan, state?.tasks]);

  const promotedTask = useMemo(() => {
    if (!activePlan || !state?.tasks) return null;
    return state.tasks.find((t) => t.task_id === activePlan.promoted_task_id) || null;
  }, [activePlan, state?.tasks]);

  const selectedQuote = useMemo(
    () => state?.supplierQuotes.find((quote) => quote.quote_id === activePlan?.selected_quote_id) ?? null,
    [activePlan?.selected_quote_id, state?.supplierQuotes],
  );
  const phaseBudgetMinor = blockedTask?.phase_hardware_budget_max_minor;
  const maxVariancePct = blockedTask?.max_allowed_variance_pct;
  const observedTotal = selectedQuote?.total_minor ?? activePlan?.immediate_unlock_minor;
  const budgetDifference = phaseBudgetMinor === undefined || observedTotal === undefined ? null : phaseBudgetMinor - observedTotal;
  const predecessorTasks = (state?.dependencies ?? []).filter((edge) => edge.to_task_id === promotedTask?.task_id).map((edge) => state?.tasks.find((task) => task.task_id === edge.from_task_id));
  const unmetCount = predecessorTasks.filter((task) => task?.schedule_status !== 'COMPLETED').length;

  // Copy fingerprint to clipboard
  const handleCopyFingerprint = () => {
    if (activePlan?.state_fingerprint) {
      navigator.clipboard.writeText(activePlan.state_fingerprint);
      setIsCopied(true);
      toast.success('SHA-256 Fingerprint copied to clipboard');
    }
  };

  // Trigger confetti burst
  const fireCelebration = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#10b981', '#38bdf8', '#fbbf24', '#ffffff'],
    });
  };

  // Handle plan approval
  const handleApprove = async () => {
    if (!activePlan || !canApprove || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const ok = await approvePlan(approverName, customNote || undefined);
      if (ok) {
        fireCelebration();
        setCheckoutStep('SUCCESS');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isApprovalModalOpen || !activePlan) {
    return null;
  }

  const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;

  const unlockAmountUSD = formatMinorToPayPalValue(activePlan.immediate_unlock_minor);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeApprovalModal}
          className="fixed inset-0 dialog-backdrop"
        />

        {/* Modal Window: Double-Bezel Hardware Enclosure */}
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="approval-dialog-title"
          tabIndex={-1}
          initial={{ scale: 0.95, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 16 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="dialog-panel approval-panel relative w-full max-w-4xl overflow-hidden z-10 my-8"
        >
          {/* Top Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-white/[0.08] bg-neutral-50 dark:bg-[#090b10]">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-neutral-900 border border-amber-200 dark:border-neutral-800 flex items-center justify-center text-amber-500">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60">
                    {activePlan.policy_decision}
                  </span>
                </div>
                <h3 id="approval-dialog-title" className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Review recovery plan
                </h3>
              </div>
            </div>

            <button
              aria-label="Close recovery approval"
              onClick={closeApprovalModal}
              className="p-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-900 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800 border border-neutral-200 dark:border-neutral-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Stepper Tabs: Clean Monochromatic Segmented Control */}
          <div className="flex border-b border-neutral-200 dark:border-white/[0.08] bg-neutral-50 dark:bg-neutral-950/60 px-6 py-2 text-xs font-mono gap-2">
            <button
              onClick={() => setCheckoutStep('DIFF')}
              className={`px-3 py-1.5 rounded-lg border font-medium transition-all flex items-center space-x-2 ${
                checkoutStep === 'DIFF'
                  ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-neutral-300 dark:border-neutral-700 shadow-sm'
                  : 'bg-transparent text-neutral-500 dark:text-neutral-400 border-transparent hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>1. Policy Diff & Exposure</span>
            </button>
            <button
              onClick={() => setCheckoutStep('PAYPAL_CHECKOUT')}
              className={`px-3 py-1.5 rounded-lg border font-medium transition-all flex items-center space-x-2 ${
                checkoutStep === 'PAYPAL_CHECKOUT'
                  ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-neutral-300 dark:border-neutral-700 shadow-sm'
                  : 'bg-transparent text-neutral-500 dark:text-neutral-400 border-transparent hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>2. Live PayPal Checkout</span>
            </button>
          </div>

          {/* Body Content */}
          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            {checkoutStep === 'DIFF' && (
              <>
                {/* Fingerprint Card */}
                <div className="p-3 bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-white/[0.06] rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-2.5">
                    <Lock className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" />
                    <div>
                      <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">
                        State Fingerprint (SHA-256 Non-Repudiation)
                      </div>
                      <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-medium break-all">
                        {activePlan.state_fingerprint}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleCopyFingerprint}
                    className="flex-shrink-0 px-2.5 py-1 text-xs font-mono rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 flex items-center space-x-1.5 transition-colors"
                  >
                    {isCopied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{isCopied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                {/* Reason Codes */}
                {reasonCodes.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-neutral-500">
                      Reason Codes:
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {reasonCodes.map((code) => (
                        <span
                          key={code}
                          className="px-2 py-0.5 rounded text-xs font-mono font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 flex items-center space-x-1"
                        >
                          <AlertOctagon className="w-3 h-3 text-rose-500" />
                          <span>{code}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Deterministic Policy Diff Table (REQ-010, TASK-029, GUD-002) */}
                <div className="rounded-xl border border-neutral-200 dark:border-white/[0.08] overflow-hidden bg-white dark:bg-neutral-950/40">
                  <div className="px-3.5 py-2 bg-neutral-100/70 dark:bg-neutral-900/80 border-b border-neutral-200 dark:border-white/[0.08] flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <FileCheck2 className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                      <span className="text-xs font-mono font-semibold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                        Side-by-Side Deterministic Policy Diff
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-200/60 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                      RFC-6960 Invariant Matrix
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono text-xs">
                      <thead>
                        <tr className="border-b border-neutral-200 dark:border-white/[0.06] bg-neutral-50 dark:bg-neutral-900/30 text-[10px] uppercase text-neutral-500">
                          <th className="py-2 px-3 font-medium">Policy Invariant</th>
                          <th className="py-2 px-3 font-medium">Permitted Threshold</th>
                          <th className="py-2 px-3 font-medium">Observed Value</th>
                          <th className="py-2 px-3 font-medium text-right">Compliance Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-white/[0.04]">
                        {/* Row 1: Phase Hardware Budget Cap */}
                        <tr className="hover:bg-neutral-50/50 dark:hover:bg-white/[0.02]">
                          <td className="py-2 px-3">
                            <span className="font-semibold text-neutral-800 dark:text-neutral-200">Phase Budget Cap</span>
                            <div className="text-[10px] text-neutral-500 font-sans">{blockedTask?.name ?? activePlan.blocked_task_id}</div>
                          </td>
                          <td className="py-2 px-3">
                            <span className="text-neutral-700 dark:text-neutral-300 font-medium">{phaseBudgetMinor ? formatMinorToUSD(phaseBudgetMinor) : '—'}</span>
                            <div className="text-[10px] text-neutral-500">{phaseBudgetMinor ? `(${phaseBudgetMinor.toLocaleString()}¢)` : 'No budget loaded'}</div>
                          </td>
                          <td className="py-2 px-3">
                            {budgetDifference !== null && budgetDifference < 0 ? (
                              <>
                                 <span className="text-rose-600 dark:text-rose-400 font-semibold">{observedTotal === undefined ? '—' : formatMinorToUSD(observedTotal)}</span>
                                <div className="text-[10px] text-neutral-500">Selected proposal</div>
                              </>
                            ) : (
                              <>
                                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{observedTotal === undefined ? '—' : formatMinorToUSD(observedTotal)}</span>
                                  <div className="text-[10px] text-neutral-500">Selected quote total</div>
                              </>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {budgetDifference !== null && budgetDifference < 0 ? (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60">
                                {budgetDifference === null ? 'Not evaluated' : `${formatMinorToUSD(Math.abs(budgetDifference))} over budget`}
                              </span>
                            ) : (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/50">
                                {budgetDifference === null ? 'Not evaluated' : budgetDifference >= 0 ? `${formatMinorToUSD(budgetDifference)} headroom` : 'Over budget'}
                              </span>
                            )}
                          </td>
                        </tr>

                        {/* Row 2: Supplier Unit Price-Creep Ceiling */}
                        <tr className="hover:bg-neutral-50/50 dark:hover:bg-white/[0.02]">
                          <td className="py-2 px-3">
                            <span className="font-semibold text-neutral-800 dark:text-neutral-200">Price-Creep Variance</span>
                              <div className="text-[10px] text-neutral-500 font-sans">{blockedTask?.name ?? activePlan.blocked_task_id}<br />Baseline: {blockedTask?.historical_unit_price_minor ? `${formatMinorToUSD(blockedTask.historical_unit_price_minor)} / unit` : '—'}</div>
                          </td>
                          <td className="py-2 px-3">
                           <span className="text-neutral-700 dark:text-neutral-300 font-medium">&le; {maxVariancePct ?? '—'}%</span>
                            <div className="text-[10px] text-neutral-500">Max allowed tolerance</div>
                          </td>
                          <td className="py-2 px-3">
                            {selectedQuote && maxVariancePct !== undefined && selectedQuote.variance_vs_historical_pct > maxVariancePct ? (
                              <>
                                 <span className="text-rose-600 dark:text-rose-400 font-semibold">{selectedQuote ? `${formatVariancePct(selectedQuote.variance_vs_historical_pct)} (${formatMinorToUSD(selectedQuote.unit_price_minor)}/u)` : '—'}</span>
                                <div className="text-[10px] text-neutral-500">Selected quote</div>
                              </>
                            ) : (
                              <>
                                 <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{selectedQuote ? `${formatVariancePct(selectedQuote.variance_vs_historical_pct)} (${formatMinorToUSD(selectedQuote.unit_price_minor)}/u)` : '—'}</span>
                                <div className="text-[10px] text-neutral-500">Channel3 Live Discovery</div>
                              </>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {selectedQuote && maxVariancePct !== undefined && selectedQuote.variance_vs_historical_pct > maxVariancePct ? (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60">
                                CREEP BLOCKED
                              </span>
                            ) : (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/50">
                                 {selectedQuote ? 'Within price threshold' : 'Not evaluated'}
                              </span>
                            )}
                          </td>
                        </tr>

                        {/* Row 3: Hard DAG Dependencies */}
                        <tr className="hover:bg-neutral-50/50 dark:hover:bg-white/[0.02]">
                          <td className="py-2 px-3">
                            <span className="font-semibold text-neutral-800 dark:text-neutral-200">Hard Dependencies</span>
                            <div className="text-[10px] text-neutral-500 font-sans">Release: {promotedTask?.name ?? activePlan.promoted_task_id}</div>
                          </td>
                          <td className="py-2 px-3">
                            <span className="text-neutral-700 dark:text-neutral-300 font-medium">All Completed</span>
                            <div className="text-[10px] text-neutral-500">Zero unmet prerequisites</div>
                          </td>
                          <td className="py-2 px-3">
                            {unmetCount > 0 ? (
                              <>
                                <span className="text-rose-600 dark:text-rose-400 font-semibold">{unmetCount} unfinished predecessors</span>
                                <div className="text-[10px] text-neutral-500">Violates topological sequence</div>
                              </>
                            ) : (
                              <>
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{predecessorTasks.length - unmetCount} of {predecessorTasks.length} complete</span>
                                <div className="text-[10px] text-neutral-500">{unmetCount} unmet dependencies</div>
                              </>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {unmetCount > 0 ? (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60">
                                VIOLATION
                              </span>
                            ) : (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/50">
                                {unmetCount ? 'Needs review' : 'Predecessors complete'}
                              </span>
                            )}
                          </td>
                        </tr>

                        {/* Row 4: Warehouse Physical Inventory */}
                        <tr className="hover:bg-neutral-50/50 dark:hover:bg-white/[0.02]">
                          <td className="py-2 px-3">
                            <span className="font-semibold text-neutral-800 dark:text-neutral-200">Warehouse Staging</span>
                            <div className="text-[10px] text-neutral-500 font-sans">Release: {promotedTask?.name ?? activePlan.promoted_task_id}</div>
                          </td>
                          <td className="py-2 px-3">
                            <span className="text-neutral-700 dark:text-neutral-300 font-medium">materials_in_warehouse == 1</span>
                            <div className="text-[10px] text-neutral-500">On-site inventory ready</div>
                          </td>
                          <td className="py-2 px-3">
                            {!promotedTask?.materials_in_warehouse ? (
                              <span className="text-rose-600 dark:text-rose-400 font-semibold">Not in warehouse (0)</span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{promotedTask?.materials_in_warehouse ? 'Staged in warehouse' : 'Not staged'}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {!promotedTask?.materials_in_warehouse ? (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60">
                                NOT STAGED
                              </span>
                            ) : (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/50">
                                {promotedTask?.materials_in_warehouse ? 'Staged' : 'Needs review'}
                              </span>
                            )}
                          </td>
                        </tr>

                        {/* Row 5: Fail-Closed Cost Fields & Currency */}
                        <tr className="hover:bg-neutral-50/50 dark:hover:bg-white/[0.02]">
                          <td className="py-2 px-3">
                            <span className="font-semibold text-neutral-800 dark:text-neutral-200">Cost Nullability & FX</span>
                            <div className="text-[10px] text-neutral-500 font-sans">{selectedQuote?.product_title ?? 'No selected quote'}</div>
                          </td>
                          <td className="py-2 px-3">
                            <span className="text-neutral-700 dark:text-neutral-300 font-medium">USD / Non-null Costs</span>
                            <div className="text-[10px] text-neutral-500">Zero null shipping/tax</div>
                          </td>
                          <td className="py-2 px-3">
                            {!selectedQuote || selectedQuote.shipping_minor === null || selectedQuote.tax_minor === null || selectedQuote.currency !== state?.project.currency ? (
                              <span className="text-rose-600 dark:text-rose-400 font-semibold">Missing costs or currency mismatch</span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{selectedQuote ? `${selectedQuote.currency} / ${selectedQuote.shipping_minor === null || selectedQuote.tax_minor === null ? 'Incomplete costs' : 'Costs recorded'}` : 'No selected quote'}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {!selectedQuote || selectedQuote.shipping_minor === null || selectedQuote.tax_minor === null || selectedQuote.currency !== state?.project.currency ? (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60">
                                UNKNOWN COST BLOCK
                              </span>
                            ) : (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/50">
                                {selectedQuote && selectedQuote.shipping_minor !== null && selectedQuote.tax_minor !== null ? 'Recorded' : 'Needs review'}
                              </span>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Financial Impact Comparison Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-white/[0.06]">
                    <div className="text-[11px] font-mono text-neutral-500 uppercase">Idle crew hours at risk</div>
                    <div className="mt-1 text-xl font-semibold font-mono text-neutral-900 dark:text-white flex items-baseline space-x-1">
                      <span>{activePlan.idle_crew_hours}</span>
                      <span className="text-xs font-normal text-neutral-500">hours</span>
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      Idle Labor: <strong className="text-neutral-800 dark:text-neutral-200">{formatMinorToUSD(activePlan.idle_labor_cost_minor)}</strong>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-white/[0.06]">
                    <div className="text-[11px] font-mono text-neutral-500 uppercase">SLA penalty exposure</div>
                    <div className="mt-1 text-xl font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                      {formatMinorToUSD(activePlan.sla_penalty_minor)}
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5">Estimated by the recovery engine</div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-900/40 border border-rose-200 dark:border-rose-900/40">
                    <div className="text-[11px] font-mono text-rose-600 dark:text-rose-400 uppercase font-medium">Total exposure</div>
                    <div className="mt-1 text-xl font-semibold font-mono text-rose-600 dark:text-rose-400">
                      {formatMinorToUSD(activePlan.total_exposure_minor)}
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5">Net balance protection</div>
                  </div>
                </div>

                {/* Schedule Reroute Diff */}
                <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-900/30 border border-neutral-200 dark:border-white/[0.06] space-y-2.5">
                  <div className="text-xs font-mono uppercase tracking-wider text-neutral-700 dark:text-neutral-300 font-medium flex items-center space-x-2">
                    <TrendingDown className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Schedule Rerouting Plan</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-rose-50/50 dark:bg-neutral-950/60 border border-rose-200 dark:border-rose-900/40">
                      <div className="text-rose-600 dark:text-rose-400 font-medium mb-0.5 text-[10px]">DEFERRED MILESTONE</div>
                      <div className="text-neutral-900 dark:text-white font-medium">{blockedTask?.name || activePlan.blocked_task_id}</div>
                      <div className="text-neutral-500 text-[11px] mt-0.5">
                        Deferred Labor: {formatMinorToUSD(activePlan.deferred_labor_minor)}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-emerald-50/50 dark:bg-neutral-950/60 border border-emerald-200 dark:border-emerald-900/40">
                      <div className="text-emerald-600 dark:text-emerald-400 font-medium mb-0.5 text-[10px]">PROMOTED MILESTONE</div>
                      <div className="text-neutral-900 dark:text-white font-medium">{promotedTask?.name || activePlan.promoted_task_id}</div>
                      <div className="text-neutral-500 text-[11px] mt-0.5">
                        Materials Unlock: <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{formatMinorToUSD(activePlan.immediate_unlock_minor)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Draft Nudge Preview */}
                {activePlan.nudge_draft_text && (
                  <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-white/[0.06] space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-neutral-700 dark:text-neutral-300 font-medium flex items-center space-x-1.5">
                        <Send className="w-3 h-3 text-neutral-500" />
                        <span>Draft payment reminder</span>
                      </span>
                    </div>
                    <p className="text-xs text-neutral-600 dark:text-neutral-300 italic bg-white dark:bg-neutral-950/80 p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 leading-relaxed font-sans">
                      "{activePlan.nudge_draft_text}"
                    </p>
                  </div>
                )}

                {/* Approver Sign-off Section */}
                <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-white/10 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div>
                      <label className="text-neutral-500 block mb-1 font-mono text-[10px]">Approver Identity / Role</label>
                      <input
                        aria-label="Approver identity or role"
                        type="text"
                        value={approverName}
                        onChange={(e) => setApproverName(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-lg text-neutral-900 dark:text-white font-mono focus:outline-none focus:border-neutral-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-neutral-500 block mb-1 font-mono text-[10px]">Audit Note (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Approved per protocol CP-44"
                        aria-label="Audit note (optional)"
                        value={customNote}
                        onChange={(e) => setCustomNote(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-lg text-neutral-900 dark:text-white font-mono focus:outline-none focus:border-neutral-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="pt-1 flex flex-col sm:flex-row items-center justify-end gap-2">
                    <button
                      onClick={() => setCheckoutStep('PAYPAL_CHECKOUT')}
                      className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 font-medium text-xs font-mono border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors flex items-center justify-center space-x-1.5"
                    >
                      <CreditCard className="w-3.5 h-3.5 text-neutral-500" />
                      <span>Review PayPal Sandbox</span>
                    </button>

                    <button
                      onClick={handleApprove}
                      disabled={isSubmitting || !canApprove}
                      className="w-full sm:w-auto px-5 py-1.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 font-medium text-xs font-mono hover:opacity-90 transition-all flex items-center justify-center space-x-1.5 shadow-sm disabled:opacity-50"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>{isSubmitting ? 'Signing...' : 'Sign & Execute Reroute'}</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Step 2: Live PayPal Sandbox Checkout */}
            {checkoutStep === 'PAYPAL_CHECKOUT' && (
              <div className="space-y-4">
                <div className="p-3 bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-white/[0.06] rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-neutral-800 dark:text-white font-medium uppercase tracking-wider flex items-center space-x-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-neutral-500" />
                      <span>PayPal Sandbox Live Split Payment</span>
                    </span>
                    <span className="text-neutral-500 text-[10px]">OAuth2 Live</span>
                  </div>
                  <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed font-sans">
                    CascadeOS splits the blocked milestone into an immediate materials unlock of{' '}
                    <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{formatMinorToUSD(activePlan.immediate_unlock_minor)}</strong>.
                  </p>
                </div>

                {/* QR Code and Live Buttons */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                  <div className="flex flex-col items-center justify-center p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-200 dark:border-white/[0.06] text-center">
                    <div className="text-[10px] font-mono text-neutral-500 mb-2 uppercase tracking-wider">
                      Mobile Pay (QR Code)
                    </div>
                    {blockedTask?.qr_code_base64 ? (
                      <div className="p-2 bg-white rounded-xl shadow-sm border">
                        <img
                          src={`data:image/png;base64,${blockedTask.qr_code_base64}`}
                          alt="PayPal Invoice QR Code"
                          className="w-36 h-36 object-contain"
                        />
                      </div>
                    ) : (
                      <div className="w-36 h-36 rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-800 flex flex-col items-center justify-center text-neutral-400 text-xs font-mono p-3">
                        <QrCode className="w-8 h-8 mb-1" />
                        <span>Generated on execution</span>
                      </div>
                    )}
                    <div className="text-[10px] text-neutral-500 font-mono mt-2">
                       Invoice #{blockedTask?.paypal_invoice_number || 'Not provisioned'}
                    </div>
                  </div>

                  <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-200 dark:border-white/[0.06] space-y-3">
                    <div className="text-xs font-mono text-neutral-700 dark:text-neutral-300 font-medium uppercase tracking-wider">
                      Pay via PayPal Sandbox
                    </div>
                    <div className="text-sm font-mono text-neutral-500 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-1.5">
                      <span>Materials Unlock:</span>
                      <span className="text-base font-semibold text-neutral-900 dark:text-white font-mono">
                        ${unlockAmountUSD} USD
                      </span>
                    </div>

                     <div className="pt-1">
                       {!paypalClientId && (
                         <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                           PayPal JS SDK client ID missing. Set <code>VITE_PAYPAL_CLIENT_ID</code> to enable checkout.
                         </div>
                       )}
                       {paypalClientId && (
                       <PayPalScriptProvider
                        options={{
                          clientId: paypalClientId,
                          currency: 'USD',
                          intent: 'capture',
                          enableFunding: 'paylater',
                        }}
                      >
                        <PayPalButtons
                          disabled={isSubmitting || !canApprove}
                          style={{
                            layout: 'vertical',
                            color: 'gold',
                            shape: 'rect',
                            label: 'pay',
                            height: 38,
                          }}
                          createOrder={(_data, actions) => {
                            return actions.order.create({
                              intent: 'CAPTURE',
                              purchase_units: [
                                {
                                  reference_id: activePlan.plan_id,
                                  description: `CascadeOS Materials Unlock: ${promotedTask?.name || 'Milestone Unlock'}`,
                                  amount: {
                                    currency_code: 'USD',
                                    value: unlockAmountUSD,
                                  },
                                },
                              ],
                            });
                          }}
                          onApprove={async (_data, actions) => {
                            if (actions.order) {
                              const capture = await actions.order.capture();
                              fireCelebration();
                              toast.success('PayPal Sandbox Order Captured!', {
                                description: `Order ID: ${capture.id} • Status: ${capture.status}`,
                              });
                              await handleApprove();
                            }
                          }}
                          onError={(err) => {
                            console.warn('PayPal button error:', err);
                            toast.error('PayPal checkout error', {
                              description: String(err),
                            });
                          }}
                        />
                       </PayPalScriptProvider>
                       )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-neutral-200 dark:border-white/[0.08]">
                  <button
                    onClick={() => setCheckoutStep('DIFF')}
                    className="text-xs font-mono text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
                  >
                    <span>&larr; Back to Diff</span>
                  </button>

                  <button
                    onClick={handleApprove}
                    disabled={isSubmitting || !canApprove}
                    className="px-4 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 font-medium text-xs font-mono hover:opacity-90 transition-all flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? 'Executing...' : 'Complete Sign-Off'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Success Screen */}
            {checkoutStep === 'SUCCESS' && (
              <div className="py-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-500 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Plan Approved & Schedule Rerouted!</h3>
                <p className="text-xs text-neutral-600 dark:text-neutral-300 max-w-md mx-auto leading-relaxed">
                  The schedule reroute has been cryptographically signed. The promoted milestone is now active.
                </p>
                <div className="pt-2 flex justify-center space-x-2 font-mono text-xs">
                  <button
                    onClick={() => {
                      closeApprovalModal();
                      setCheckoutStep('DIFF');
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-800 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={async () => {
                      await refreshState();
                      closeApprovalModal();
                      setCheckoutStep('DIFF');
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 font-medium hover:opacity-90 transition-colors"
                  >
                    View Gantt
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ApprovalCheckoutModal;
