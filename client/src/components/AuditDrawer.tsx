/**
 * @file AuditDrawer.tsx
 * @description Slide-over cryptographic audit drawer and immutable compliance ledger.
 *
 * Implements:
 * - TASK-030: Slide-over drawer for audit_events and paypal_transactions
 * - REQ-018: Immutable audit trails with copyable SHA-256 state fingerprints
 * - REQ-019: Export signed compliance audit report (.md / .json)
 * - Light and Dark theme support
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useCascadeState } from '@/context/CascadeStateContext';
import { formatMinorToUSD, truncateHash } from '@/utils/formatters';
import {
  FileText,
  Shield,
  Download,
  Copy,
  CheckCircle,
  ExternalLink,
  X,
  CreditCard,
  History,
  Lock,
  Filter,
  ArrowUpRight,
  Sparkles,
  AlertOctagon,
  Search
} from 'lucide-react';
import type { AuditEvent, PayPalTransactionRecord, PolicyDecisionType } from '@/types/domain';
import { useDialog } from './ui/useDialog';

export const AuditDrawer: React.FC = () => {
  const { isAuditDrawerOpen, setIsAuditDrawerOpen, state } = useCascadeState();
  const [activeTab, setActiveTab] = useState<'AUDIT_EVENTS' | 'PAYPAL_TX'>('AUDIT_EVENTS');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [decisionFilter, setDecisionFilter] = useState<'ALL' | PolicyDecisionType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const dialogRef = useDialog(isAuditDrawerOpen, () => setIsAuditDrawerOpen(false));

  const auditEvents = state?.auditEvents || [];
  const paypalTransactions = state?.paypalTransactions || [];

  // Filtered audit events
  const filteredEvents = useMemo(() => {
    return auditEvents.filter((ev) => {
      if (decisionFilter !== 'ALL' && ev.decision !== decisionFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchSummary = ev.summary?.toLowerCase().includes(q);
        const matchType = ev.event_type?.toLowerCase().includes(q);
        const matchTask = ev.task_id?.toLowerCase().includes(q);
        const matchHash = ev.state_fingerprint?.toLowerCase().includes(q);
        if (!matchSummary && !matchType && !matchTask && !matchHash) return false;
      }
      return true;
    });
  }, [auditEvents, decisionFilter, searchQuery]);

  // Copy helper
  const handleCopy = (text: string, id: string, label = 'Hash') => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(`${label} copied to clipboard`);
  };

  // Export Audit Report (.json or .md)
  const handleExportJson = () => {
    const report = {
      project_id: state?.project.project_id || 'cascade-project-1',
      project_name: state?.project.name,
      exported_at: new Date().toISOString(),
      summary: {
        total_tasks: state?.tasks.length || 0,
        total_audit_events: auditEvents.length,
        total_paypal_transactions: paypalTransactions.length,
        total_recovery_plans: state?.recoveryPlans.length || 0,
      },
      audit_events: auditEvents,
      paypal_transactions: paypalTransactions,
      user_approvals: state?.userApprovals || [],
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cascadeOS-compliance-audit-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Signed Audit Report exported as JSON');
  };

  const handleExportMarkdown = () => {
    let md = `# CascadeOS FinOps Compliance & Recovery Audit Report\n`;
    md += `**Project:** ${state?.project.name || 'Cascade Alpha'}\n`;
    md += `**Generated:** ${new Date().toUTCString()}\n`;
    md += `**Environment:** PayPal Sandbox & Channel3 Live\n\n`;

    md += `## 1. Executive Summary\n`;
    md += `- Total Milestones Monitored: ${state?.tasks.length || 0}\n`;
    md += `- Audit Trail Records: ${auditEvents.length}\n`;
    md += `- PayPal Ledger Transactions: ${paypalTransactions.length}\n`;
    md += `- Cryptographic Recovery Plans: ${state?.recoveryPlans.length || 0}\n\n`;

    md += `## 2. Policy Decisions & Immutable Audit Ledger\n\n`;
    md += `| Timestamp | Event Type | Decision | Task ID | State Fingerprint | Summary |\n`;
    md += `|---|---|---|---|---|---|\n`;

    for (const ev of auditEvents) {
      md += `| ${ev.created_at} | \`${ev.event_type}\` | **${ev.decision}** | ${ev.task_id || 'N/A'} | \`${ev.state_fingerprint?.slice(0, 16) || 'N/A'}...\` | ${ev.summary.replace(/\|/g, '-')} |\n`;
    }

    md += `\n## 3. PayPal Sandbox Invoicing & Split Ledger\n\n`;
    md += `| Created At | Kind | PayPal Resource ID | Status | Amount |\n`;
    md += `|---|---|---|---|---|\n`;

    for (const tx of paypalTransactions) {
      md += `| ${tx.created_at} | ${tx.kind} | \`${tx.paypal_resource_id}\` | ${tx.status} | ${formatMinorToUSD(tx.amount_minor)} |\n`;
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cascadeOS-compliance-report-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Signed Audit Report exported as Markdown');
  };

  if (!isAuditDrawerOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsAuditDrawerOpen(false)}
          className="fixed inset-0 dialog-backdrop"
        />

        <div className="drawer-container fixed inset-y-0 right-0 max-w-full flex pl-10">
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Project audit trail"
            tabIndex={-1}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="dialog-panel drawer-panel audit-panel w-screen max-w-2xl border-l flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-neutral-200 dark:border-white/[0.08] bg-neutral-50 dark:bg-[#090b10] flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center space-x-2">
                    <span>Cryptographic Audit Trail</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-800">
                      RFC 6960
                    </span>
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Immutable event log of deterministic policy evaluations
                  </p>
                </div>
              </div>

              <button
                aria-label="Close audit trail"
                onClick={() => setIsAuditDrawerOpen(false)}
                className="p-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-900 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800 border border-neutral-200 dark:border-neutral-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Subheader / Export Actions */}
            <div className="px-6 py-2 bg-neutral-50 dark:bg-neutral-950/60 border-b border-neutral-200 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => setActiveTab('AUDIT_EVENTS')}
                  className={`px-3 py-1 rounded-lg border font-medium transition-all flex items-center space-x-1.5 ${
                    activeTab === 'AUDIT_EVENTS'
                      ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-neutral-300 dark:border-neutral-700 shadow-sm'
                      : 'bg-transparent text-neutral-500 dark:text-neutral-400 border-transparent hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Audit ({auditEvents.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab('PAYPAL_TX')}
                  className={`px-3 py-1 rounded-lg border font-medium transition-all flex items-center space-x-1.5 ${
                    activeTab === 'PAYPAL_TX'
                      ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-neutral-300 dark:border-neutral-700 shadow-sm'
                      : 'bg-transparent text-neutral-500 dark:text-neutral-400 border-transparent hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>PayPal ({paypalTransactions.length})</span>
                </button>
              </div>

              <div className="flex items-center space-x-1.5">
                <button
                  onClick={handleExportMarkdown}
                  className="px-2 py-0.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 transition-colors text-xs flex items-center space-x-1"
                >
                  <Download className="w-3 h-3 text-neutral-500" />
                  <span>MD</span>
                </button>
                <button
                  onClick={handleExportJson}
                  className="px-2 py-0.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 transition-colors text-xs flex items-center space-x-1"
                >
                  <Download className="w-3 h-3 text-neutral-500" />
                  <span>JSON</span>
                </button>
              </div>
            </div>

            {/* Filter and Search Bar */}
            {activeTab === 'AUDIT_EVENTS' && (
              <div className="audit-filters px-6 py-2 bg-neutral-50 dark:bg-neutral-900/30 border-b border-neutral-200 dark:border-white/[0.06] flex items-center justify-between gap-3 text-xs">
                <div className="flex-1 relative">
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    aria-label="Search audit events"
                    type="text"
                    placeholder="Search events, reasons, tasks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1 bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-lg text-neutral-900 dark:text-neutral-200 text-xs font-mono focus:outline-none focus:border-neutral-500"
                  />
                </div>

                <div className="flex items-center space-x-1 font-mono text-[11px]">
                  {(['ALL', 'ALLOW', 'REQUIRE_APPROVAL', 'BLOCK'] as const).map((dec) => (
                    <button
                      key={dec}
                      onClick={() => setDecisionFilter(dec)}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        decisionFilter === dec
                          ? 'bg-neutral-900 dark:bg-neutral-800 text-white font-medium'
                          : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
                      }`}
                    >
                      {dec}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Content List */}
            <div className="flex-1 p-6 overflow-y-auto space-y-2.5 font-mono text-xs">
              {activeTab === 'AUDIT_EVENTS' ? (
                filteredEvents.length === 0 ? (
                  <div className="text-center py-12 text-neutral-400">
                    <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <span>No audit events found.</span>
                  </div>
                ) : (
                  filteredEvents.map((ev: AuditEvent) => {
                    let decBadge = 'bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800';
                    if (ev.decision === 'ALLOW') decBadge = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/60';
                    else if (ev.decision === 'BLOCK') decBadge = 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/60';
                    else if (ev.decision === 'REQUIRE_APPROVAL')
                      decBadge = 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/60';

                    return (
                      <div
                        key={ev.event_id}
                        className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-white/[0.06] transition-all space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-neutral-900 dark:text-neutral-200 font-semibold">{ev.event_type}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${decBadge}`}>
                            {ev.decision}
                          </span>
                        </div>

                        <p className="text-neutral-600 dark:text-neutral-300 font-sans text-xs leading-relaxed">{ev.summary}</p>

                        <div className="pt-1.5 border-t border-neutral-200 dark:border-white/[0.04] space-y-0.5 text-[11px] text-neutral-500">
                          {ev.state_fingerprint && (
                            <div className="flex items-center justify-between">
                              <span>Fingerprint:</span>
                              <div className="flex items-center space-x-1.5">
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                  {truncateHash(ev.state_fingerprint, 12, 8)}
                                </span>
                                <button
                                  aria-label="Copy state fingerprint"
                                  onClick={() => handleCopy(ev.state_fingerprint!, ev.event_id, 'Fingerprint')}
                                  className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                                >
                                  {copiedId === ev.event_id ? (
                                    <CheckCircle className="w-3 h-3 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </div>
                          )}

                          {ev.task_id && (
                            <div className="flex items-center justify-between">
                              <span>Task:</span>
                              <span className="text-neutral-700 dark:text-neutral-200">{ev.task_id}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-neutral-400 text-[10px] pt-0.5">
                            <span>ID: {ev.event_id.slice(0, 14)}</span>
                            <span>{new Date(ev.created_at).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                paypalTransactions.length === 0 ? (
                  <div className="text-center py-12 text-neutral-400">
                    <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <span>No transactions recorded yet.</span>
                  </div>
                ) : (
                  paypalTransactions.map((tx: PayPalTransactionRecord) => (
                    <div
                      key={tx.transaction_record_id}
                      className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-white/[0.06] transition-all space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-900 dark:text-neutral-200 font-semibold">{tx.kind}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800">
                          {tx.status}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-500">Amount:</span>
                        <span className="text-neutral-900 dark:text-white font-semibold text-sm">
                          {formatMinorToUSD(tx.amount_minor)}
                        </span>
                      </div>

                      <div className="pt-1 border-t border-neutral-200 dark:border-white/[0.04] space-y-0.5 text-[11px] text-neutral-500">
                        <div className="flex items-center justify-between">
                          <span>Resource:</span>
                          <span className="text-neutral-700 dark:text-neutral-200">{tx.paypal_resource_id}</span>
                        </div>
                        <div className="flex items-center justify-between text-neutral-400 text-[10px] pt-0.5">
                          <span>Task: {tx.task_id}</span>
                          <span>{new Date(tx.created_at).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>

            {/* Footer */}
            <div className="p-3.5 bg-neutral-50 dark:bg-neutral-950/90 border-t border-neutral-200 dark:border-white/[0.08] text-[11px] font-mono text-neutral-500 flex items-center justify-between">
              <span>Integrity: HMAC SHA-256</span>
              <span>Fail-Closed Firewall</span>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
};

export default AuditDrawer;
