/**
 * @file FriendlyNudgeScoreboardWidget.tsx
 * @description Custom React Widget #2 for AG Studio 3.0 (TASK-032, REQ-015).
 *
 * Implements:
 * - AgWidgetParams integration with AG Studio 3.0 runtime
 * - Client Milestone Collaboration Scoreboard with on-time streak badges
 * - Live Base64 PayPal Sandbox QR Code rendering
 * - Editable AI-drafted warm nudge message (Groq OSS 120B)
 * - 1-Click Action to trigger PayPal invoice split & nudge dispatch
 * - Light and Dark theme support
 */

import React, { useEffect, useState } from 'react';
import type { AgWidgetParams } from 'ag-studio';
import { useCascadeState } from '@/context/CascadeStateContext';
import { formatMinorToUSD } from '@/utils/formatters';
import { toast } from 'sonner';
import {
  Trophy,
  Send,
  QrCode,
  CheckCircle2,
  Clock,
  Sparkles,
  CreditCard,
  Flame,
  ArrowRight
} from 'lucide-react';

export const FriendlyNudgeScoreboardWidget: React.FC<AgWidgetParams> = ({ widgetApi, dataMapping }) => {
  const { state, activePlan, openApprovalModal, approvePlan, lastNotification } = useCascadeState();
  const [nudgeText, setNudgeText] = useState(
    activePlan?.nudge_draft_text || ''
  );
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const fields = Object.values(dataMapping).flat() as any[];
    if (fields.length === 0) {
      widgetApi.setDisplayState('displayed');
      return;
    }
    widgetApi.setDisplayState('loading');
    void widgetApi.getData({ fields }, { crossFilter: 'highlight' })
      .then(() => widgetApi.setDisplayState('displayed'))
      .catch(() => widgetApi.setDisplayState('noData'));
  }, [widgetApi, dataMapping]);

  const tasks = state?.tasks || [];
  const blockedTask = tasks.find((t) => t.schedule_status === 'PAYMENT_BLOCKED')
    || tasks.find((t) => Boolean(t.paypal_invoice_id))
    || tasks[0];

  const handleSendWarmNudge = async () => {
    setIsSending(true);
    const toastId = toast.loading('Sending AI Warm Nudge via PayPal...', {
      description: 'Triggering payment reminder notification to client contact',
    });
    try {
      if (!activePlan) throw new Error('No proposed recovery plan selected');
      const approved = await approvePlan('Client Milestone Collaboration Scoreboard', nudgeText || undefined);
      if (!approved) throw new Error('PayPal notification was not dispatched');
      toast.success('Warm PayPal Nudge Dispatched!', {
        id: toastId,
        description: 'PayPal reminder email, QR code, and direct payment link are live.',
      });
    } catch (error) {
      toast.error('Warm PayPal Nudge failed', { id: toastId, description: String(error) });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="studio-widget h-full w-full p-4 flex flex-col justify-between overflow-y-auto font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2 mb-3">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 flex items-center justify-center text-amber-500">
            <Trophy className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-neutral-900 dark:text-white uppercase tracking-wide">
              Client payment reminder
            </h4>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-mono font-medium">
          <Flame className="w-3 h-3 text-amber-500" />
          <span>{tasks.filter((task) => task.paypal_invoice_status === 'PAID').length} paid milestones</span>
        </div>
      </div>

      {/* QR Code and Invoice Pill */}
      <div className="grid grid-cols-12 gap-3 mb-3 items-center">
        {/* QR Code preview */}
        <div className="col-span-4 flex flex-col items-center justify-center p-2 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
          {(lastNotification?.qrCodeBase64 || blockedTask?.qr_code_base64) ? (
            <img
              src={`data:image/png;base64,${lastNotification?.qrCodeBase64 || blockedTask?.qr_code_base64}`}
              alt="PayPal QR"
              className="w-16 h-16 object-contain rounded bg-white p-1"
            />
          ) : (
            <div className="w-16 h-16 rounded border border-dashed border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-neutral-400">
              <QrCode className="w-8 h-8" />
            </div>
          )}
          <span className="text-[9px] text-neutral-500 font-mono mt-1">Scan to Pay</span>
        </div>

        {/* Invoice details */}
        <div className="col-span-8 space-y-1 font-mono text-xs">
          <div className="flex justify-between text-[11px]">
            <span className="text-neutral-500">Invoice:</span>
            <span className="text-neutral-900 dark:text-white font-medium">{blockedTask?.paypal_invoice_number || 'Not provisioned'}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-neutral-500">Unlock:</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              {formatMinorToUSD(lastNotification?.minimumAmountDueMinor ?? blockedTask?.materials_unlock_minor)}
            </span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-neutral-500">Client:</span>
            <span className="text-neutral-800 dark:text-neutral-200">{blockedTask?.client_name || 'No client recorded'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 mb-3 text-[10px] font-mono">
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/20 p-2">
          <span className="text-emerald-700 dark:text-emerald-300">{lastNotification?.reminderSentAt ? 'PayPal reminder dispatched' : 'No reminder dispatched this session'}</span>
          {lastNotification?.reminderSentAt && <span className="block text-neutral-500 mt-1">{lastNotification.reminderSentAt}</span>}
          {lastNotification?.nudgeMessage && (
            <details className="mt-1 text-neutral-600 dark:text-neutral-400">
              <summary className="cursor-pointer">Preview email</summary>
              <p className="mt-1 whitespace-pre-wrap">{lastNotification.nudgeMessage}</p>
            </details>
          )}
        </div>
        {lastNotification?.recipientViewUrl && (
          <a href={lastNotification.recipientViewUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-sky-200 dark:border-sky-900/60 bg-sky-50/60 dark:bg-sky-950/20 p-2 text-sky-700 dark:text-sky-300 hover:underline">
            Open Client PayPal Payment Page ({formatMinorToUSD(lastNotification.minimumAmountDueMinor)} Minimum Due)
          </a>
        )}
      </div>

      {/* Editable AI Nudge */}
      <div className="space-y-1 mb-3">
        <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500">
          <span className="flex items-center space-x-1">
            <Sparkles className="w-3 h-3 text-neutral-400" />
            <span>AI Nudge Draft:</span>
          </span>
        </div>
        <textarea
          aria-label="Payment reminder draft"
          rows={3}
          value={nudgeText || blockedTask?.last_nudge_message || ''}
          onChange={(e) => setNudgeText(e.target.value)}
          className="w-full p-2 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-800 dark:text-neutral-200 text-[11px] font-sans focus:outline-none focus:border-neutral-400 leading-relaxed resize-none"
        />
      </div>

      {/* CTA Buttons */}
      <div className="flex space-x-2">
        <button
          onClick={handleSendWarmNudge}
          disabled={isSending || activePlan?.status !== 'PROPOSED' || activePlan.policy_decision === 'BLOCK'}
          className="flex-1 py-1.5 px-3 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-800 font-mono text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-50"
        >
          <Send className="w-3 h-3 text-neutral-500" />
          <span>{isSending ? 'Approving & sending…' : 'Approve plan & send reminder'}</span>
        </button>

        <button
          onClick={() => openApprovalModal()}
          disabled={!activePlan}
          className="py-1.5 px-3 rounded-lg bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black font-mono text-xs font-medium flex items-center space-x-1"
        >
          <span>Review Split</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

export default FriendlyNudgeScoreboardWidget;
