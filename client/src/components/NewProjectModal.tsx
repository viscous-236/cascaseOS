/**
 * @file NewProjectModal.tsx
 * @description Dynamic Multi-Tenant Project Onboarding Modal (TASK-106, REQ-102, REQ-108).
 *
 * Implements:
 * - Dual Mode: Tab 1 (AI Project Architect) & Tab 2 (Structured Manual / JSON Phase Builder)
 * - 3 Industry Presets: E-Sports Studio, Hackathon AV Arena, Robotics R&D Lab
 * - Live Submission Pipeline Stepper (Kahn DAG Verification -> PayPal Sandbox Invoicing -> Channel3 Product Graph)
 * - Full Dark & Light theme compatibility with clean institutional styling
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Layers,
  Zap,
  CheckCircle2,
  Clock,
  DollarSign,
  AlertTriangle,
  X,
  Plus,
  Trash2,
  ArrowRight,
  ShieldCheck,
  Bot,
  Building,
  Mail,
  Calendar,
  FileCode,
  Search,
  ShoppingCart
} from 'lucide-react';
import { useCascadeState } from '@/context/CascadeStateContext';
import type { CreateCustomProjectPayload, ManualTaskInput, TaskDependencyInput } from '@/types/domain';

interface PresetItem {
  id: string;
  badge: string;
  title: string;
  clientName: string;
  clientEmail: string;
  projectName: string;
  prompt: string;
}

const PRESETS: PresetItem[] = [
  {
    id: 'esports',
    badge: 'Production Studio',
    title: 'E-Sports & Podcast Studio',
    clientName: 'Apex Horizon Media LLC',
    clientEmail: 'billing-sandbox@apexhorizon.com',
    projectName: 'Apex E-Sports & Soundstage Buildout',
    prompt:
      'Design a 5-phase schedule for an ultra-low latency E-Sports gaming arena and podcast soundstage. Requires acoustic wall baffling installation, dual 4K PTZ broadcast cameras, 4K 120Hz commercial displays, custom streamer consoles, and live stream network stress testing. The displays need live hardware sourcing with a budget cap of $1,600 and incumbent price of $490 each.',
  },
  {
    id: 'hackathon',
    badge: 'Mainstage Event AV',
    title: 'Hackathon AV & Streaming Arena',
    clientName: 'Global Hackathon League Inc.',
    clientEmail: 'procurement@globalhackathon.io',
    projectName: 'GHL 2026 Arena Mainstage AV',
    prompt:
      'Architect a 4-phase deployment for a 500-attendee mainstage hackathon AV arena. Requires structural truss assembly, central 4K LED video wall panel sourcing (6 panels at historical $280 each, incumbent quoting $390), wireless microphone systems, and gigabit fiber backbone testing.',
  },
  {
    id: 'robotics',
    badge: 'Industrial Lab',
    title: 'Autonomous Robotics R&D Lab',
    clientName: 'Nova Robotics Corporation',
    clientEmail: 'finops@novarobotics.ai',
    projectName: 'Nova R&D Precision Robotics Lab',
    prompt:
      'Build a 5-phase autonomous robotics testing facility. Phases include ESD static-dissipative flooring, ceiling optical motion capture cameras, aluminum server racks, industrial power backup UPS units, and perimeter safety gating. Motion capture cameras need live retail supplier auditing.',
  },
];

export const NewProjectModal: React.FC = () => {
  const { isNewProjectModalOpen, closeNewProjectModal, createCustomProject } = useCascadeState();

  const [activeTab, setActiveTab] = useState<'AI_ARCHITECT' | 'MANUAL_STRUCTURED'>('AI_ARCHITECT');

  // Common metadata
  const [projectName, setProjectName] = useState('Apex E-Sports & Soundstage Buildout');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [clientName, setClientName] = useState('Apex Horizon Media LLC');
  const [clientEmail, setClientEmail] = useState('billing-sandbox@apexhorizon.com');
  const [createPayPalInvoices, setCreatePayPalInvoices] = useState(true);
  const [runChannel3Audit, setRunChannel3Audit] = useState(true);

  // Tab 1: AI Prompt
  const [aiPrompt, setAiPrompt] = useState(PRESETS[0]?.prompt || '');

  // Tab 2: Manual builder states
  const [manualTasks, setManualTasks] = useState<ManualTaskInput[]>([
    {
      task_id: 'phase_1_framing',
      name: 'Structural Framing & Wall Baffling',
      duration_days: 4,
      crew_assigned: 'Carpentry & Acoustic Techs',
      daily_idle_burn_minor: 60000,
      sla_delay_penalty_minor: 0,
      phase_hardware_budget_max_minor: 150000,
      schedule_status: 'SCHEDULED',
      invoice_total_minor: 450000,
      materials_unlock_minor: 139600,
      deferred_labor_minor: 310400,
      materials_in_warehouse: true,
      sku_search_query: null,
      required_quantity: 0,
      incumbent_vendor_name: null,
      incumbent_unit_price_minor: null,
      historical_unit_price_minor: null,
      max_allowed_variance_pct: 10,
      create_live_paypal_invoice: true,
    },
    {
      task_id: 'phase_2_displays',
      name: 'Commercial 4K Displays & Video Wall',
      duration_days: 5,
      crew_assigned: 'AV Video Specialists',
      daily_idle_burn_minor: 90000,
      sla_delay_penalty_minor: 144000,
      phase_hardware_budget_max_minor: 160000,
      schedule_status: 'SCHEDULED',
      invoice_total_minor: 580000,
      materials_unlock_minor: 196000,
      deferred_labor_minor: 384000,
      materials_in_warehouse: false,
      sku_search_query: 'LG 65-Inch Commercial Display 4K 120Hz',
      required_quantity: 4,
      incumbent_vendor_name: 'Metro AV Pro Supplies',
      incumbent_unit_price_minor: 49000,
      historical_unit_price_minor: 38000,
      max_allowed_variance_pct: 10,
      create_live_paypal_invoice: true,
    },
    {
      task_id: 'phase_3_audio',
      name: 'Digital Audio & Studio Intercom Rigging',
      duration_days: 3,
      crew_assigned: 'Acoustic & Audio Engineers',
      daily_idle_burn_minor: 75000,
      sla_delay_penalty_minor: 0,
      phase_hardware_budget_max_minor: 120000,
      schedule_status: 'SCHEDULED',
      invoice_total_minor: 380000,
      materials_unlock_minor: 110000,
      deferred_labor_minor: 270000,
      materials_in_warehouse: true,
      sku_search_query: null,
      required_quantity: 0,
      incumbent_vendor_name: null,
      incumbent_unit_price_minor: null,
      historical_unit_price_minor: null,
      max_allowed_variance_pct: 10,
      create_live_paypal_invoice: false,
    },
    {
      task_id: 'phase_4_testing',
      name: 'Final Broadcast Stress Testing & Sign-off',
      duration_days: 2,
      crew_assigned: 'Lead Systems Architect',
      daily_idle_burn_minor: 50000,
      sla_delay_penalty_minor: 0,
      phase_hardware_budget_max_minor: 50000,
      schedule_status: 'SCHEDULED',
      invoice_total_minor: 200000,
      materials_unlock_minor: 50000,
      deferred_labor_minor: 150000,
      materials_in_warehouse: true,
      sku_search_query: null,
      required_quantity: 0,
      incumbent_vendor_name: null,
      incumbent_unit_price_minor: null,
      historical_unit_price_minor: null,
      max_allowed_variance_pct: 10,
      create_live_paypal_invoice: false,
    },
  ]);

  const [manualDependencies, setManualDependencies] = useState<TaskDependencyInput[]>([
    { from_task_id: 'phase_1_framing', to_task_id: 'phase_2_displays', lag_days: 0 },
    { from_task_id: 'phase_2_displays', to_task_id: 'phase_3_audio', lag_days: 0 },
    { from_task_id: 'phase_3_audio', to_task_id: 'phase_4_testing', lag_days: 0 },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const applyPreset = (preset: PresetItem) => {
    setProjectName(preset.projectName);
    setClientName(preset.clientName);
    setClientEmail(preset.clientEmail);
    setAiPrompt(preset.prompt);
  };

  const handleAddPhase = () => {
    const idx = manualTasks.length + 1;
    const newId = `phase_${idx}_custom`;
    setManualTasks((prev) => [
      ...prev,
      {
        task_id: newId,
        name: `Phase ${idx}: System Milestone`,
        duration_days: 3,
        crew_assigned: 'Integration Crew',
        daily_idle_burn_minor: 60000,
        sla_delay_penalty_minor: 0,
        phase_hardware_budget_max_minor: 100000,
        schedule_status: 'SCHEDULED',
        invoice_total_minor: 300000,
        materials_unlock_minor: 80000,
        deferred_labor_minor: 220000,
        materials_in_warehouse: true,
        sku_search_query: null,
        required_quantity: 0,
        incumbent_vendor_name: null,
        incumbent_unit_price_minor: null,
        historical_unit_price_minor: null,
        max_allowed_variance_pct: 10,
        create_live_paypal_invoice: true,
      },
    ]);
  };

  const handleRemovePhase = (index: number) => {
    if (manualTasks.length <= 2) return;
    const removedItem = manualTasks[index];
    const removedId = removedItem?.task_id;
    setManualTasks((prev) => prev.filter((_, i) => i !== index));
    if (removedId) {
      setManualDependencies((prev) =>
        prev.filter((d) => d.from_task_id !== removedId && d.to_task_id !== removedId)
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setCurrentStepIndex(0);

    const stepInterval = setInterval(() => {
      setCurrentStepIndex((prev) => (prev < 2 ? prev + 1 : prev));
    }, 1200);

    try {
      const payload: CreateCustomProjectPayload =
        activeTab === 'AI_ARCHITECT'
          ? {
              mode: 'AI_ARCHITECT',
              project_name: projectName,
              currency: 'USD',
              start_date: startDate,
              client_name: clientName,
              client_email: clientEmail,
              ai_prompt: aiPrompt,
              create_live_paypal_invoices: createPayPalInvoices,
              run_live_channel3_audit: runChannel3Audit,
            }
          : {
              mode: 'MANUAL_STRUCTURED',
              project_name: projectName,
              currency: 'USD',
              start_date: startDate,
              client_name: clientName,
              client_email: clientEmail,
              tasks: manualTasks,
              dependencies: manualDependencies,
              create_live_paypal_invoices: createPayPalInvoices,
              run_live_channel3_audit: runChannel3Audit,
            };

      const success = await createCustomProject(payload);
      if (success) {
        closeNewProjectModal();
      }
    } finally {
      clearInterval(stepInterval);
      setIsSubmitting(false);
    }
  };

  if (!isNewProjectModalOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={isSubmitting ? undefined : closeNewProjectModal}
          className="fixed inset-0 bg-neutral-950/70 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-[#0c0e14] border border-neutral-200 dark:border-white/[0.1] rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10 transition-colors"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-white/[0.08] bg-neutral-50/80 dark:bg-neutral-900/40">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 flex items-center justify-center shadow-sm">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
                  Create New FinOps Project
                </h2>
                <p className="text-xs text-neutral-500 font-mono">
                  Multi-Tenant Project Provisioner with Live PayPal & Channel3 Graph Audits
                </p>
              </div>
            </div>

            <button
              onClick={closeNewProjectModal}
              disabled={isSubmitting}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-2 px-6 pt-3 pb-2 border-b border-neutral-100 dark:border-white/[0.04]">
            <button
              type="button"
              onClick={() => setActiveTab('AI_ARCHITECT')}
              disabled={isSubmitting}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                activeTab === 'AI_ARCHITECT'
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm'
                  : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Mode A: AI Schedule Architect</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('MANUAL_STRUCTURED')}
              disabled={isSubmitting}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                activeTab === 'MANUAL_STRUCTURED'
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm'
                  : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Mode B: Structured Phase Builder</span>
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Project Metadata Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-neutral-500 mb-1">
                  Project Title
                </label>
                <input
                  type="text"
                  required
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400 font-sans"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-neutral-500 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-neutral-500 mb-1">
                  Client / Tenant Name
                </label>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400 font-sans"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-neutral-500 mb-1">
                  Client Billing Email (PayPal)
                </label>
                <input
                  type="email"
                  required
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400 font-mono"
                />
              </div>
            </div>

            {/* TAB 1: AI ARCHITECT */}
            {activeTab === 'AI_ARCHITECT' && (
              <div className="space-y-4">
                {/* 3 Quick Presets */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">
                      Industry Blueprint Presets:
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono">
                      Click to auto-populate prompt & metadata
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPreset(p)}
                        disabled={isSubmitting}
                        className="text-left p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 hover:bg-neutral-100 dark:hover:bg-neutral-800/80 transition-all group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-medium">
                            {p.badge}
                          </span>
                          <span className="text-neutral-300 dark:text-neutral-700 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">
                            &rarr;
                          </span>
                        </div>
                        <h4 className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                          {p.title}
                        </h4>
                        <p className="text-[11px] text-neutral-500 line-clamp-2 mt-1">
                          {p.prompt}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Natural Language Prompt Box */}
                <div>
                  <label className="block text-[11px] font-mono text-neutral-500 mb-1.5 flex items-center justify-between">
                    <span>Natural Language Project Description & Sourcing Requirements:</span>
                    <span className="text-[10px] text-neutral-400 font-mono">
                      Powered by OpenAI Structured Outputs (Zod DAG Format)
                    </span>
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="Describe phases, hardware search queries, daily burn, and milestones..."
                    className="w-full p-3 text-xs bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400 font-sans resize-none leading-relaxed"
                  />
                </div>
              </div>
            )}

            {/* TAB 2: MANUAL STRUCTURED BUILDER */}
            {activeTab === 'MANUAL_STRUCTURED' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-neutral-900 dark:text-white">
                      Custom Phase & Sourcing Table
                    </span>
                    <p className="text-[11px] text-neutral-500">
                      Configure duration, crew, idle burn, and live retail hardware lookup
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddPhase}
                    disabled={isSubmitting}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 border border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Phase</span>
                  </button>
                </div>

                <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                  {manualTasks.map((t, index) => (
                    <div
                      key={t.task_id || index}
                      className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="font-mono text-[10px] text-neutral-400 px-1.5 py-0.5 rounded bg-neutral-200/60 dark:bg-neutral-800">
                            #{index + 1}
                          </span>
                          <input
                            type="text"
                            value={t.name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setManualTasks((prev) =>
                                prev.map((item, i) => (i === index ? { ...item, name: val } : item))
                              );
                            }}
                            className="font-medium text-xs bg-transparent border-b border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white focus:outline-none flex-1 py-0.5"
                            placeholder="Phase title..."
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-neutral-500">Duration:</span>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={t.duration_days}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 1;
                              setManualTasks((prev) =>
                                prev.map((item, i) =>
                                  i === index ? { ...item, duration_days: val } : item
                                )
                              );
                            }}
                            className="w-14 px-1.5 py-0.5 text-center font-mono text-xs bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded"
                          />
                          <span className="text-[11px] text-neutral-400">days</span>

                          <button
                            type="button"
                            onClick={() => handleRemovePhase(index)}
                            disabled={manualTasks.length <= 2 || isSubmitting}
                            className="p-1 text-neutral-400 hover:text-rose-500 transition-colors disabled:opacity-30"
                            title="Remove phase"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Hardware search query & incumbent pricing */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-neutral-100 dark:border-white/[0.04] text-[11px]">
                        <div>
                          <label className="text-neutral-500 block text-[10px] font-mono">
                            Channel3 SKU Query:
                          </label>
                          <input
                            type="text"
                            value={t.sku_search_query || ''}
                            onChange={(e) => {
                              const val = e.target.value || null;
                              setManualTasks((prev) =>
                                prev.map((item, i) =>
                                  i === index ? { ...item, sku_search_query: val } : item
                                )
                              );
                            }}
                            placeholder="e.g. Commercial 4K Display"
                            className="w-full px-2 py-1 text-xs bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-neutral-900 dark:text-white"
                          />
                        </div>

                        <div>
                          <label className="text-neutral-500 block text-[10px] font-mono">
                            Incumbent Unit Price ($):
                          </label>
                          <input
                            type="number"
                            value={
                              t.incumbent_unit_price_minor
                                ? t.incumbent_unit_price_minor / 100
                                : ''
                            }
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              const minor = isNaN(val) ? null : Math.round(val * 100);
                              setManualTasks((prev) =>
                                prev.map((item, i) =>
                                  i === index
                                    ? { ...item, incumbent_unit_price_minor: minor }
                                    : item
                                )
                              );
                            }}
                            placeholder="490.00"
                            className="w-full px-2 py-1 text-xs bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-neutral-900 dark:text-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-neutral-500 block text-[10px] font-mono">
                            Required Quantity:
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={t.required_quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setManualTasks((prev) =>
                                prev.map((item, i) =>
                                  i === index ? { ...item, required_quantity: val } : item
                                )
                              );
                            }}
                            className="w-full px-2 py-1 text-xs bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-neutral-900 dark:text-white font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live API Toggles */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createPayPalInvoices}
                  onChange={(e) => setCreatePayPalInvoices(e.target.checked)}
                  disabled={isSubmitting}
                  className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-400"
                />
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  Provision Live PayPal Sandbox Invoices
                </span>
                <span className="font-mono text-[10px] text-neutral-400">
                  (POST /v2/invoicing/invoices)
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={runChannel3Audit}
                  onChange={(e) => setRunChannel3Audit(e.target.checked)}
                  disabled={isSubmitting}
                  className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-400"
                />
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  Execute Channel3 Retail Price Graph Audits
                </span>
                <span className="font-mono text-[10px] text-neutral-400">
                  (POST /v0/search)
                </span>
              </label>
            </div>

            {/* Live Provisioning Stepper when submitting */}
            {isSubmitting && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-mono space-y-2 text-xs"
              >
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-600">
                  <span>Provisioning Engine Active</span>
                  <span className="animate-pulse flex items-center gap-1.5 text-emerald-400 dark:text-emerald-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Executing Live Pipelines...
                  </span>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-2">
                    {currentStepIndex >= 0 ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-neutral-500" />
                    )}
                    <span className={currentStepIndex === 0 ? 'font-bold underline' : ''}>
                      1. Kahn In-Degree DAG Cycle Verification & Topological Ordering
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {currentStepIndex >= 1 ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-neutral-500" />
                    )}
                    <span className={currentStepIndex === 1 ? 'font-bold underline' : ''}>
                      2. Provisioning Live PayPal Sandbox Invoices & Sending Client Drafts
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {currentStepIndex >= 2 ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-neutral-500" />
                    )}
                    <span className={currentStepIndex === 2 ? 'font-bold underline' : ''}>
                      3. Querying Channel3 Product Graph & Auditing Supplier Arbitrage
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100 dark:border-white/[0.04]">
              <button
                type="button"
                onClick={closeNewProjectModal}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-mono text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 font-mono text-xs font-medium shadow-md transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-white/20 dark:border-black/20 border-t-white dark:border-t-black animate-spin" />
                    <span>Provisioning Project...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    <span>Generate & Launch Project</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default NewProjectModal;
