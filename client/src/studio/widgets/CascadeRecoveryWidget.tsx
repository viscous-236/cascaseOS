/**
 * @file CascadeRecoveryWidget.tsx
 * @description Custom React Widget #1 for AG Studio 3.0 (TASK-031, REQ-015).
 *
 * Implements:
 * - AgWidgetParams integration with AG Studio 3.0 runtime
 * - widgetApi.setDisplayState('displayed')
 * - Incumbent Quote vs Channel3 Arbitrage Quote comparison
 * - Cross-filter toggle on reason codes
 * - 1-Click Trigger for ApprovalCheckoutModal
 * - Light and Dark theme support
 */

import React, { useEffect, useState } from 'react';
import type { AgWidgetParams } from 'ag-studio';
import { useCascadeState } from '@/context/CascadeStateContext';
import { formatMinorToUSD } from '@/utils/formatters';
import {
  ShieldAlert,
  Sparkles,
  ArrowRight,
  TrendingDown,
  Building2,
  DollarSign,
  AlertOctagon,
  ExternalLink
} from 'lucide-react';

export const CascadeRecoveryWidget: React.FC<AgWidgetParams> = ({ widgetApi }) => {
  const { state, openApprovalModal, activePlan, selectedReasonCode, selectReasonCode } = useCascadeState();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    widgetApi.setDisplayState('displayed');
  }, [widgetApi]);

  const quotes = state?.supplierQuotes || [];
  const incumbent = quotes.find((q) => q.source_type === 'INCUMBENT_INVOICE');
  const channel3 = quotes.find((q) => q.source_type === 'CHANNEL3_LIVE');

  const reasonCodes = activePlan?.reason_codes_json
    ? JSON.parse(activePlan.reason_codes_json)
    : ['HARD_DEPENDENCY_VIOLATION', 'VENDOR_PRICE_CREEP_EXCEEDED'];

  const handleReasonClick = (code: string) => {
    selectReasonCode(code);
    try {
      const field = { table: 'audit', field: 'reason_code' };
      widgetApi.toggleCrossFilter({
        group: 0,
        type: 'value',
        field,
        values: [code],
      } as any);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="h-full w-full bg-white dark:bg-[#0c0e14] text-neutral-900 dark:text-neutral-100 p-4 flex flex-col justify-between overflow-y-auto font-sans transition-colors duration-200">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2 mb-3">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-md bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-rose-500">
            <ShieldAlert className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-neutral-900 dark:text-white uppercase tracking-wide">
              Schedule Recovery & Arbitrage
            </h4>
          </div>
        </div>

        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60">
          $2,800 IDLE RISK
        </span>
      </div>

      {/* Comparison Grid */}
      <div className="grid grid-cols-2 gap-2.5 mb-3 text-xs">
        {/* Incumbent Quote */}
        <div className="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 font-mono space-y-1">
          <div className="text-[10px] text-rose-600 dark:text-rose-400 font-medium uppercase flex items-center justify-between">
            <span>Incumbent</span>
            <span>BLOCKED</span>
          </div>
          <div className="text-neutral-800 dark:text-neutral-200 font-medium text-xs truncate">
            {incumbent?.merchant_name || 'Carrier Supply'}
          </div>
          <div className="text-neutral-500 text-[11px]">
            Unit: <strong className="text-neutral-900 dark:text-white">{formatMinorToUSD(incumbent?.unit_price_minor || 49000)}</strong>
          </div>
          <div className="text-[10px] text-rose-600 dark:text-rose-400">+28.95% over baseline</div>
        </div>

        {/* Channel3 Live */}
        <div className="p-2.5 rounded-xl bg-emerald-50/50 dark:bg-neutral-900/50 border border-emerald-200 dark:border-emerald-800/40 font-mono space-y-1">
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium uppercase flex items-center justify-between">
            <span>Channel3</span>
            <span>APPROVED</span>
          </div>
          <div className="text-neutral-800 dark:text-neutral-200 font-medium text-xs truncate">
            {channel3?.merchant_name || 'Trane Direct'}
          </div>
          <div className="text-neutral-500 text-[11px]">
            Unit: <strong className="text-emerald-600 dark:text-emerald-400">{formatMinorToUSD(channel3?.unit_price_minor || 34900)}</strong>
          </div>
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Save $564.00 (28.78%)</div>
        </div>
      </div>

      {/* Reason Codes Cross-Filter Pills */}
      <div className="space-y-1 mb-3">
        <span className="text-[10px] font-mono uppercase text-neutral-500 block">
          Filter by Reason Code:
        </span>
        <div className="flex flex-wrap gap-1">
          {reasonCodes.map((code: string) => (
            <button
              key={code}
              onClick={() => handleReasonClick(code)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all ${
                selectedReasonCode === code
                  ? 'bg-neutral-900 dark:bg-white text-white dark:text-black font-medium border-transparent'
                  : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              {code}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Action Button */}
      <button
        onClick={() => openApprovalModal()}
        className="w-full py-2 px-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-neutral-950 font-medium text-xs font-mono flex items-center justify-center space-x-1.5 transition-all shadow-sm"
      >
        <span>Approve Reroute & Split Invoice</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default CascadeRecoveryWidget;
