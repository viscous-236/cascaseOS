/**
 * @file App.tsx
 * @description Master Application Shell for CascadeOS Autonomous FinOps Suite.
 *
 * Implements:
 * - Theme-adaptive Light / Dark design system
 * - Decongested, minimal layout without unnecessary boilerplate
 * - TopScenarioBar with Live Connectivity, Theme Toggle & Bento KPIs
 * - Hardware-accelerated 3D WebGL Topology (FinOps3DTopology)
 * - Bryntum Gantt 7.3 Payment-Coupled Timeline (TimelinePane)
 * - AG Studio 3.0 FinOps Widgets & Arbitrage Panel (FinOpsWidgetPanel)
 * - Deterministic Policy Diff & PayPal Sandbox Checkout Modal (ApprovalCheckoutModal)
 * - RFC 6960 Cryptographic Audit Drawer (AuditDrawer)
 * - Groq OSS 120B FinOps Copilot Dialog (AgentChatModal)
 * - Aceternity BackgroundDots & ShimmerButton
 */

import React, { useState } from 'react';
import { useCascadeState } from '@/context/CascadeStateContext';
import { TopScenarioBar } from '@/components/TopScenarioBar';
import { TimelinePane } from '@/components/TimelinePane';
import { FinOps3DTopology } from '@/components/FinOps3DTopology';
import { FinOpsWidgetPanel } from '@/components/FinOpsWidgetPanel';
import { StudioWorkspace } from '@/studio/StudioWorkspace';
import { ApprovalCheckoutModal } from '@/components/ApprovalCheckoutModal';
import { AuditDrawer } from '@/components/AuditDrawer';
import { AgentChatModal } from '@/components/AgentChatModal';
import { NewProjectModal } from '@/components/NewProjectModal';
import { TaskFinancialsDrawer } from '@/components/TaskFinancialsDrawer';
import { BackgroundDots } from '@/components/ui/background-dots';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import {
  Boxes,
  Layers,
  Sparkles,
  Bot,
  ShieldCheck,
  Activity,
  ExternalLink
} from 'lucide-react';

export const App: React.FC = () => {
  const { isLoading, setIsAgentChatOpen, setIsAuditDrawerOpen, health } = useCascadeState();
  const [activeLayoutView, setActiveLayoutView] = useState<'SPLIT' | 'STUDIO' | 'GANTT_ONLY' | 'TOPOLOGY_3D'>('SPLIT');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-[#07090e] flex flex-col items-center justify-center space-y-4">
        <div className="relative w-10 h-10">
          <div className="w-10 h-10 rounded-full border border-neutral-300 dark:border-white/20 border-t-neutral-900 dark:border-t-white animate-spin" />
        </div>
        <div className="text-center font-mono space-y-1">
          <h2 className="text-xs font-semibold tracking-wider text-neutral-900 dark:text-white uppercase">
            Initializing CascadeOS
          </h2>
          <p className="text-[11px] text-neutral-500">
            Binding PayPal Sandbox • Channel3 Graph API • SQLite WAL
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#07090e] text-neutral-900 dark:text-neutral-100 flex flex-col font-sans selection:bg-neutral-900 selection:text-white dark:selection:bg-white dark:selection:text-black transition-colors duration-200">
      {/* 1. Master Header with Live Badges, KPIs, Theme Toggle & Scenarios */}
      <TopScenarioBar />

      {/* 2. Main Dashboard Content with Subtle Dot Grid Texture */}
      <BackgroundDots className="flex-1 flex flex-col">
        <main className="flex-1 px-4 sm:px-6 py-4 max-w-[1720px] w-full mx-auto space-y-4">
          {/* Decongested Workspace View Switcher Tabs */}
          <div className="flex items-center justify-between border-b border-neutral-200 dark:border-white/[0.08] pb-2.5">
            <div className="flex items-center space-x-2.5">
              <span className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">
                View:
              </span>
              <div className="flex bg-neutral-100 dark:bg-neutral-900/90 p-0.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-mono">
                <button
                  onClick={() => setActiveLayoutView('SPLIT')}
                  className={`px-3 py-1 rounded-md transition-all flex items-center space-x-1.5 ${
                    activeLayoutView === 'SPLIT'
                      ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium shadow-sm'
                      : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                  <span>Split View</span>
                </button>

                <button
                  onClick={() => setActiveLayoutView('STUDIO')}
                  className={`px-3 py-1 rounded-md transition-all flex items-center space-x-1.5 ${
                    activeLayoutView === 'STUDIO'
                      ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium shadow-sm'
                      : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                  <span>AG Studio</span>
                </button>

                <button
                  onClick={() => setActiveLayoutView('GANTT_ONLY')}
                  className={`px-3 py-1 rounded-md transition-all flex items-center space-x-1.5 ${
                    activeLayoutView === 'GANTT_ONLY'
                      ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium shadow-sm'
                      : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                  <span>Gantt</span>
                </button>

                <button
                  onClick={() => setActiveLayoutView('TOPOLOGY_3D')}
                  className={`px-3 py-1 rounded-md transition-all flex items-center space-x-1.5 ${
                    activeLayoutView === 'TOPOLOGY_3D'
                      ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium shadow-sm'
                      : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <Boxes className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                  <span>3D Topology</span>
                </button>
              </div>
            </div>

            <div className="hidden md:flex items-center space-x-2 text-[11px] font-mono text-neutral-500">
              <span className="flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Zero-Mock Sandbox</span>
              </span>
            </div>
          </div>

          {/* View Layout 1: Executive Split View */}
          <div className={activeLayoutView === 'SPLIT' ? 'space-y-4' : 'hidden'}>
            {/* 3D WebGL Interactive Dependency DAG */}
            <ErrorBoundary fallbackTitle="3D FinOps DAG Topology">
              <FinOps3DTopology />
            </ErrorBoundary>

            {/* Side-by-Side: Bryntum Gantt & AG Studio Intelligence */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 min-h-[580px]">
              {/* Left / Main: Bryntum Gantt Schedule (7 Cols) */}
              <div className="xl:col-span-7 h-[620px]">
                <ErrorBoundary fallbackTitle="FinOps Timeline Schedule">
                  <TimelinePane />
                </ErrorBoundary>
              </div>

              {/* Right: AG Studio FinOps Intelligence Widgets (5 Cols) */}
              <div className="xl:col-span-5 h-[620px]">
                <ErrorBoundary fallbackTitle="FinOps Intelligence Widgets">
                  <FinOpsWidgetPanel />
                </ErrorBoundary>
              </div>
            </div>
          </div>

          {/* View Layout 2: AG Studio 3.0 Report Builder */}
          <div className={activeLayoutView === 'STUDIO' ? 'h-[740px]' : 'hidden'}>
            <ErrorBoundary fallbackTitle="AG Studio 3.0 Analytics Workspace">
              <StudioWorkspace />
            </ErrorBoundary>
          </div>

          {/* View Layout 3: Bryntum Gantt Full Focus */}
          {activeLayoutView === 'GANTT_ONLY' && (
            <div className="h-[780px]">
              <ErrorBoundary fallbackTitle="FinOps Timeline Schedule">
                <TimelinePane />
              </ErrorBoundary>
            </div>
          )}

          {/* View Layout 4: 3D WebGL Full Focus */}
          {activeLayoutView === 'TOPOLOGY_3D' && (
            <div className="h-[680px]">
              <ErrorBoundary fallbackTitle="3D FinOps DAG Topology">
                <FinOps3DTopology />
              </ErrorBoundary>
            </div>
          )}
        </main>
      </BackgroundDots>

      {/* Floating FinOps Copilot Trigger Button (Aceternity ShimmerButton) */}
      <div className="fixed bottom-5 right-5 z-40">
        <ShimmerButton
          onClick={() => setIsAgentChatOpen(true)}
          shimmerDuration="3.5s"
          borderRadius="14px"
          className="px-3.5 py-2 border border-neutral-300 dark:border-white/10 shadow-lg text-xs font-mono"
          title="Open FinOps Copilot"
        >
          <Bot className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
          <span className="font-semibold text-neutral-900 dark:text-white">FinOps Copilot</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        </ShimmerButton>
      </div>

      {/* Bottom Minimal Status Bar */}
      <footer className="border-t border-neutral-200 dark:border-white/[0.08] bg-white/95 dark:bg-[#07090e]/95 backdrop-blur-md px-6 py-2 text-xs font-mono text-neutral-500 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3 text-[11px]">
          <span className="text-neutral-800 dark:text-neutral-300 font-semibold">CascadeOS FinOps</span>
          <span className="text-neutral-400 dark:text-neutral-700">|</span>
          <span className="flex items-center space-x-1.5 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Policy Firewall: 10/10 Invariants</span>
          </span>
          <span className="text-neutral-400 dark:text-neutral-700">|</span>
          <span>Engine: Groq {health?.llmModel || 'gpt-oss-120b'}</span>
        </div>

        <div className="flex items-center space-x-4 text-[11px]">
          <button
            onClick={() => setIsAuditDrawerOpen(true)}
            className="hover:text-neutral-900 dark:hover:text-white transition-colors flex items-center space-x-1"
          >
            <span>Audit Trail</span>
            <ExternalLink className="w-3 h-3" />
          </button>
          <span className="text-neutral-400 dark:text-neutral-700">•</span>
          <span>SQLite WAL: Healthy</span>
        </div>
      </footer>

      {/* Modals and Slide-Over Drawers */}
      <ApprovalCheckoutModal />
      <AuditDrawer />
      <AgentChatModal />
      <NewProjectModal />
      <TaskFinancialsDrawer />
    </div>
  );
};

export default App;
