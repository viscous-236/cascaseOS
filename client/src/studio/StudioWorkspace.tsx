/**
 * @file StudioWorkspace.tsx
 * @description AG Studio 3.0 Embedded Analytics Workspace with Custom Widgets (TASK-035, REQ-014).
 *
 * Implements:
 * - <AgStudio /> component integration from ag-studio-react
 * - In-browser Data Engine sources for project tasks, supplier quotes, and audit logs
 * - Custom widgets: CascadeRecoveryWidget and FriendlyNudgeScoreboardWidget
 * - Dynamic mode switching ('edit' drag-and-drop report builder vs 'view' dashboard)
 * - Light and Dark theme support
 */

import React, { useMemo, useState } from 'react';
import { AgStudio } from 'ag-studio-react';
import { studioTheme } from 'ag-studio';
import { useCascadeState } from '@/context/CascadeStateContext';
import { cascadeCustomWidgets } from './widgets/createCascadeWidgets';
import {
  LayoutDashboard,
  Edit3,
  Eye,
  RefreshCw,
} from 'lucide-react';

export const StudioWorkspace: React.FC = () => {
  const { state, isRefreshing, refreshState, theme } = useCascadeState();
  const [studioMode, setStudioMode] = useState<'edit' | 'view'>('edit');
  const workspaceTheme = useMemo(() => {
    const dark = theme === 'dark';
    return studioTheme.withParams({
      fontFamily: 'Geist, sans-serif', fontSize: 13,
      backgroundColor: dark ? '#202224' : '#ffffff',
      textColor: dark ? '#f0f1f2' : '#202326',
      borderColor: dark ? '#34383b' : '#e3e6e8',
      studioCanvasBackgroundColor: dark ? '#18191b' : '#f3f4f5',
      studioCanvasFontFamily: 'Geist, sans-serif',
      studioWidgetBackgroundColor: dark ? '#202224' : '#ffffff',
      studioWidgetTitleFontFamily: 'Geist, sans-serif',
      studioWidgetTitleFontSize: 16,
      studioWidgetTitleTextColor: dark ? '#f0f1f2' : '#202326',
      studioToggleButtonActiveBackgroundColor: dark ? '#303436' : '#eceef0',
      studioToggleButtonActiveColor: dark ? '#f0f1f2' : '#202326',
      chartFontFamily: 'Geist, sans-serif',
      chartPaletteFills1Color: dark ? '#8fb9f8' : '#1d5fbf',
    });
  }, [theme]);

  // Format data sources for AG Studio Data Engine
  const studioData = useMemo(() => {
    return {
      sources: [
        {
          id: 'tasks',
          name: 'Milestone FinOps Tasks',
          data: (state?.tasks || []).map((t) => ({
            id: t.task_id,
            name: t.name,
            crew: t.crew_assigned,
            status: t.schedule_status,
            invoice_status: t.paypal_invoice_status,
            unlock_minor: t.materials_unlock_minor,
            unlock_usd: t.materials_unlock_minor / 100,
            daily_burn_minor: t.daily_idle_burn_minor,
            daily_burn_usd: t.daily_idle_burn_minor / 100,
            sla_penalty_minor: t.sla_delay_penalty_minor,
            sla_penalty_usd: t.sla_delay_penalty_minor / 100,
            in_warehouse: t.materials_in_warehouse === 1 ? 'Yes' : 'No',
            start_date: t.start_date,
            end_date: t.end_date,
            duration: t.duration_days,
          })),
        },
        {
          id: 'quotes',
          name: 'Supplier Quotes & Arbitrage',
          data: (state?.supplierQuotes || []).map((q) => ({
            id: q.quote_id,
            task_id: q.task_id,
            source: q.source_type,
            merchant: q.merchant_name,
            product: q.product_title,
            unit_price_usd: q.unit_price_minor / 100,
            total_usd: q.total_minor / 100,
            savings_usd: q.savings_vs_incumbent_minor / 100,
            variance_pct: q.variance_vs_historical_pct,
            availability: q.availability_status,
          })),
        },
        {
          id: 'audit',
          name: 'Cryptographic Audit Events',
          data: (state?.auditEvents || []).map((a) => ({
            id: a.event_id,
            event: a.event_type,
            decision: a.decision,
            task_id: a.task_id || 'System',
            fingerprint: a.state_fingerprint?.slice(0, 16) || '',
            summary: a.summary,
            created_at: a.created_at,
          })),
        },
      ],
    };
  }, [state?.tasks, state?.supplierQuotes, state?.auditEvents]);

  return (
    <div className="studio-shell flex flex-col h-[760px] w-full">
      {/* Decongested Header */}
      <div className="studio-toolbar">
        <div className="flex items-center space-x-2.5">
          <div className="w-6 h-6 rounded-md bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 flex items-center justify-center text-neutral-600 dark:text-neutral-300">
            <LayoutDashboard className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center space-x-2">
            <h2>
              Analytics studio
            </h2>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-800">
              AG Studio
            </span>
          </div>
        </div>

        {/* Studio Controls */}
        <div className="flex items-center space-x-2 font-mono text-xs">
          <div className="segmented-control">
            <button
              onClick={() => setStudioMode('edit')}
              aria-pressed={studioMode === 'edit'}
              className={`px-2.5 py-0.5 rounded text-[11px] transition-all flex items-center space-x-1 ${
                studioMode === 'edit'
                  ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <Edit3 className="w-3 h-3" />
              <span>Edit</span>
            </button>
            <button
              onClick={() => setStudioMode('view')}
              aria-pressed={studioMode === 'view'}
              className={`px-2.5 py-0.5 rounded text-[11px] transition-all flex items-center space-x-1 ${
                studioMode === 'view'
                  ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>Preview</span>
            </button>
          </div>

          <button
            onClick={() => refreshState()}
            aria-label="Refresh analytics data"
            className="p-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-800 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
            title="Refresh In-Browser Data Engine"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Embedded AG Studio Canvas */}
      <div className="studio-canvas-scroll flex-1 w-full h-full relative" style={{ minHeight: '620px', overflowX: 'auto' }}>
        <AgStudio
          data={studioData as any}
          widgets={cascadeCustomWidgets as any}
          mode={studioMode}
          theme={workspaceTheme}
          className="w-full h-full"
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
};

export default StudioWorkspace;
