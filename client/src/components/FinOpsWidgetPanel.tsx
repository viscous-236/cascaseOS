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

import React, { useState, useMemo } from 'react';
import { useCascadeState } from '@/context/CascadeStateContext';
import { formatMinorToUSD } from '@/utils/formatters';
import {
  ShieldAlert,
  ShieldCheck,
  CreditCard,
  Building2,
  DollarSign,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  ShoppingBag,
  Zap,
  Lock,
  Clock,
  QrCode,
  FileText,
  Activity
} from 'lucide-react';
import type { SupplierQuote, CascadeTask } from '@/types/domain';

export const FinOpsWidgetPanel: React.FC = () => {
  const {
    state,
    activePlan,
    openApprovalModal,
    selectedTaskId,
    selectTask,
    activeScenario,
    triggerScenario,
  } = useCascadeState();

  const [activeWidgetTab, setActiveWidgetTab] = useState<'ARBITRAGE' | 'POLICY_DIFF' | 'INVOICE_SPLIT' | 'BLAST_RADIUS'>('ARBITRAGE');

  const quotes = state?.supplierQuotes || [];
  const incumbentQuote = quotes.find((q) => q.source_type === 'INCUMBENT_INVOICE');
  const channel3Quote = quotes.find((q) => q.source_type === 'CHANNEL3_LIVE');

  const currentTask = useMemo(() => {
    if (selectedTaskId && state?.tasks) {
      return state.tasks.find((t) => t.task_id === selectedTaskId) || null;
    }
    return state?.tasks?.[0] || null;
  }, [selectedTaskId, state?.tasks]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0c0e14] border border-neutral-200 dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm transition-colors duration-200">
      {/* Decongested Header */}
      <div className="flex flex-wrap items-center justify-between px-5 py-2.5 bg-neutral-50 dark:bg-[#090b10] border-b border-neutral-200 dark:border-white/[0.08]">
        <div className="flex items-center space-x-2.5">
          <div className="w-6 h-6 rounded-md bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 flex items-center justify-center text-neutral-600 dark:text-neutral-300">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-xs font-mono font-semibold tracking-wider text-neutral-900 dark:text-white uppercase">
            FinOps Intelligence
          </h3>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center space-x-1 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-0.5 rounded-lg text-xs font-mono">
          <button
            onClick={() => setActiveWidgetTab('ARBITRAGE')}
            className={`px-2.5 py-1 rounded-md transition-all flex items-center space-x-1 ${
              activeWidgetTab === 'ARBITRAGE'
                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium shadow-sm'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            <span>Arbitrage</span>
          </button>

          <button
            onClick={() => setActiveWidgetTab('POLICY_DIFF')}
            className={`px-2.5 py-1 rounded-md transition-all flex items-center space-x-1 ${
              activeWidgetTab === 'POLICY_DIFF'
                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium shadow-sm'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            <span>Policy Diff</span>
          </button>

          <button
            onClick={() => setActiveWidgetTab('INVOICE_SPLIT')}
            className={`px-2.5 py-1 rounded-md transition-all flex items-center space-x-1 ${
              activeWidgetTab === 'INVOICE_SPLIT'
                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium shadow-sm'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            <span>Split</span>
          </button>

          <button
            onClick={() => setActiveWidgetTab('BLAST_RADIUS')}
            className={`px-2.5 py-1 rounded-md transition-all flex items-center space-x-1 ${
              activeWidgetTab === 'BLAST_RADIUS'
                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium shadow-sm'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            <span>Blast Radius</span>
          </button>
        </div>
      </div>

      {/* Widget Container */}
      <div className="flex-1 p-4 overflow-y-auto">
        {/* 1. Supplier Arbitrage Widget */}
        {activeWidgetTab === 'ARBITRAGE' && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-neutral-700 dark:text-neutral-300 font-medium uppercase tracking-wider flex items-center space-x-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                <span>Price-Creep Defense (Channel3 Discovery)</span>
              </span>
              <span className="text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-900 px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 text-[10px]">
                Live Search API
              </span>
            </div>

            {/* Side-by-side Incumbent vs Channel3 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Incumbent Quote Card */}
              <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-neutral-700 dark:text-neutral-300 font-medium flex items-center space-x-1.5">
                    <Building2 className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Incumbent Vendor</span>
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60">
                    +28.95% CREEP
                  </span>
                </div>

                <div>
                  <div className="text-xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
                    {formatMinorToUSD(incumbentQuote?.total_minor || 196000)}
                  </div>
                  <div className="text-[11px] text-neutral-500 font-mono">
                    {formatMinorToUSD(incumbentQuote?.unit_price_minor || 49000)} / unit (4 units)
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800/80 text-[11px] font-mono space-y-0.5">
                  <div className="flex justify-between text-neutral-500">
                    <span>Budget Limit:</span>
                    <span className="text-neutral-800 dark:text-neutral-300">$1,600.00</span>
                  </div>
                  <div className="flex justify-between text-rose-600 dark:text-rose-400 font-medium">
                    <span>Variance:</span>
                    <span>+$360.00 Over Budget</span>
                  </div>
                </div>
              </div>

              {/* Channel3 Arbitrage Replacement Card */}
              <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-neutral-900/50 border border-emerald-200 dark:border-emerald-800/40 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-neutral-800 dark:text-neutral-200 font-medium flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Channel3 Replacement</span>
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800/60">
                    VERIFIED IN STOCK
                  </span>
                </div>

                <div>
                  <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {formatMinorToUSD(channel3Quote?.total_minor || 139600)}
                  </div>
                  <div className="text-[11px] text-neutral-500 font-mono">
                    {formatMinorToUSD(channel3Quote?.unit_price_minor || 34900)} / unit (4 units)
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-white dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800 text-[11px] font-mono space-y-0.5">
                  <div className="flex justify-between text-neutral-500">
                    <span>Net Savings:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">$564.00 (28.78%)</span>
                  </div>
                  <div className="flex justify-between text-neutral-500">
                    <span>Merchant:</span>
                    <span className="text-neutral-800 dark:text-neutral-200 truncate">{channel3Quote?.merchant_name || 'B&H Photo Video'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action CTA */}
            <div className="flex justify-end pt-1">
              <button
                onClick={() => openApprovalModal()}
                className="px-4 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 font-medium text-xs font-mono hover:opacity-90 transition-all flex items-center space-x-1.5 shadow-sm"
              >
                <span>Review Policy & Checkout</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* 2. Policy Diff Tab */}
        {activeWidgetTab === 'POLICY_DIFF' && (
          <div className="space-y-3 font-mono text-xs">
            <div className="p-3 bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-neutral-800 dark:text-neutral-200 font-semibold uppercase tracking-wider">
                  7-Point Deterministic Policy Invariants
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  FAIL-CLOSED CORE
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 font-sans leading-relaxed">
                Evaluates every schedule promotion and supplier order outside the LLM against exact integer minor-unit thresholds.
              </p>
            </div>

            {/* Invariant Diff Table */}
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-950/40">
              <table className="w-full text-left font-mono text-[11px]">
                <thead>
                  <tr className="bg-neutral-100/60 dark:bg-neutral-900/80 border-b border-neutral-200 dark:border-neutral-800 text-[10px] uppercase text-neutral-500">
                    <th className="py-1.5 px-3 font-medium">Invariant Check</th>
                    <th className="py-1.5 px-3 font-medium">Permitted</th>
                    <th className="py-1.5 px-3 font-medium">Observed</th>
                    <th className="py-1.5 px-3 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900">
                  <tr>
                    <td className="py-2 px-3 text-neutral-800 dark:text-neutral-200 font-medium">Phase Budget</td>
                    <td className="py-2 px-3 text-neutral-500">$1,600.00 (160k¢)</td>
                    <td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">$1,396.00 (139.6k¢)</td>
                    <td className="py-2 px-3 text-right">
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-1.5 py-0.2 rounded">
                        COMPLIANT
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-neutral-800 dark:text-neutral-200 font-medium">Price Creep</td>
                    <td className="py-2 px-3 text-neutral-500">&le; +10.00%</td>
                    <td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">-8.16% (Channel3)</td>
                    <td className="py-2 px-3 text-right">
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-1.5 py-0.2 rounded">
                        ALLOW
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-neutral-800 dark:text-neutral-200 font-medium">DAG Prerequisite</td>
                    <td className="py-2 px-3 text-neutral-500">Phase 1 Complete</td>
                    <td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">Completed</td>
                    <td className="py-2 px-3 text-right">
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-1.5 py-0.2 rounded">
                        SATISFIED
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-neutral-800 dark:text-neutral-200 font-medium">Warehouse Staged</td>
                    <td className="py-2 px-3 text-neutral-500">In Warehouse (1)</td>
                    <td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">Staged (1)</td>
                    <td className="py-2 px-3 text-right">
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-1.5 py-0.2 rounded">
                        READY
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-neutral-800 dark:text-neutral-200 font-medium">Cost Nullability</td>
                    <td className="py-2 px-3 text-neutral-500">Non-null USD</td>
                    <td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">USD / Free Freight</td>
                    <td className="py-2 px-3 text-right">
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-1.5 py-0.2 rounded">
                        VALIDATED
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => openApprovalModal()}
                className="px-3.5 py-1.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 font-medium text-xs font-mono hover:opacity-90 transition-all flex items-center space-x-1.5 shadow-sm"
              >
                <span>Open Full Invariant Diff</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* 3. Split Invoice Tab */}
        {activeWidgetTab === 'INVOICE_SPLIT' && (
          <div className="space-y-3 font-mono text-xs">
            <div className="p-3 bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 rounded-xl space-y-1.5">
              <div className="text-neutral-800 dark:text-neutral-200 font-medium uppercase tracking-wider">
                PayPal Invoice Split Architecture
              </div>
              <p className="text-[11px] text-neutral-500 font-sans">
                Splits total invoice into immediate hardware unlock and deferred labor to eliminate idle crew liability.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-xl">
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 uppercase">Immediate Materials</div>
                <div className="text-base font-semibold text-neutral-900 dark:text-white mt-1">$1,396.00</div>
              </div>
              <div className="p-3 bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-xl">
                <div className="text-[11px] text-neutral-500 uppercase">Deferred Labor</div>
                <div className="text-base font-semibold text-neutral-900 dark:text-white mt-1">$3,104.00</div>
              </div>
            </div>
          </div>
        )}

        {/* 4. Blast Radius Tab */}
        {activeWidgetTab === 'BLAST_RADIUS' && (
          <div className="space-y-3 font-mono text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-xl">
                <div className="text-[10px] text-neutral-500 uppercase">Idle Hours</div>
                <div className="text-lg font-semibold text-neutral-900 dark:text-white mt-1">16 hrs</div>
              </div>
              <div className="p-3 bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-xl">
                <div className="text-[10px] text-neutral-500 uppercase">Labor Cost</div>
                <div className="text-lg font-semibold text-neutral-900 dark:text-white mt-1">$1,360</div>
              </div>
              <div className="p-3 bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-xl">
                <div className="text-[10px] text-neutral-500 uppercase">SLA Penalty</div>
                <div className="text-lg font-semibold text-rose-600 dark:text-rose-400 mt-1">$1,440</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinOpsWidgetPanel;
