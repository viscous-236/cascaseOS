import { lazy, Suspense, useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { Toaster } from 'sonner';
import { AlertCircle, ChevronRight, Menu, Plus, RefreshCw } from 'lucide-react';
import { useCascadeState } from '@/context/CascadeStateContext';
import { Sidebar, Brand, workspaceViews, type WorkspaceView } from '@/components/workspace/Sidebar';
import { DeliveryOverview } from '@/components/workspace/DeliveryOverview';
import { SupplierWorkspace } from '@/components/workspace/SupplierWorkspace';
import { DependencyWorkspace } from '@/components/workspace/DependencyWorkspace';
import { FinOpsWidgetPanel } from '@/components/FinOpsWidgetPanel';
import { ApprovalCheckoutModal } from '@/components/ApprovalCheckoutModal';
import { AuditDrawer } from '@/components/AuditDrawer';
import { AgentChatModal } from '@/components/AgentChatModal';
import { NewProjectModal } from '@/components/NewProjectModal';
import { TaskFinancialsDrawer } from '@/components/TaskFinancialsDrawer';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

const TimelinePane = lazy(() => import('@/components/TimelinePane'));
const StudioWorkspace = lazy(() => import('@/studio/StudioWorkspace'));

function currentView(): WorkspaceView {
  const hash = window.location.hash.slice(1);
  return workspaceViews.find((item) => item.id === hash)?.id ?? 'overview';
}

function LoadingWorkspace() {
  return <div className="workspace-loading" role="status"><p>Loading project workspace…</p><div className="skeleton-summary" /><div className="skeleton-register">{[0, 1, 2, 3, 4].map((row) => <div key={row} />)}</div></div>;
}

export function App() {
  const { state, isLoading, isRefreshing, loadError, refreshedAt, theme, refreshState, openNewProjectModal, projectsList } = useCascadeState();
  const [view, setView] = useState<WorkspaceView>(currentView);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { const update = () => { setView(currentView()); setMenuOpen(false); }; window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  useEffect(() => { if (!menuOpen) return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [menuOpen]);
  const navigate = (next: WorkspaceView) => { setView(next); window.location.hash = next; };
  const label = workspaceViews.find((item) => item.id === view)?.label ?? 'Delivery overview';
  const complete = state?.tasks.filter((task) => task.schedule_status === 'COMPLETED').length ?? 0;

  return <MotionConfig reducedMotion="user"><div className="app-shell">
    <a href="#main-content" className="skip-link" onClick={(event) => { event.preventDefault(); const main = document.getElementById('main-content'); main?.focus(); main?.scrollIntoView({ block: 'start' }); }}>Skip to workspace</a>
    <Toaster position="bottom-right" theme={theme} closeButton />
    <header className="mobile-header"><button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Open navigation" aria-expanded={menuOpen}><Menu size={20} /></button><Brand /><button className="icon-button" onClick={openNewProjectModal} aria-label="New project"><Plus size={20} /></button></header>
    <Sidebar view={view} open={menuOpen} onNavigate={navigate} onClose={() => setMenuOpen(false)} />
    <main id="main-content" className="workspace" tabIndex={-1}>
      <div className="workspace-breadcrumb"><div><span>Projects</span><ChevronRight size={13} /><strong>{label}</strong></div><div className="refresh-control"><span aria-live="polite">{isRefreshing ? 'Synchronizing…' : refreshedAt ? `Updated ${refreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not synchronized'}</span><button className="icon-button" aria-label="Refresh project data" onClick={() => void refreshState()} disabled={isRefreshing || !state}><RefreshCw size={16} className={isRefreshing ? 'spin' : ''} /></button></div></div>
      <header className="project-header"><div><h1>{state?.project.name ?? (isLoading ? 'Your project workspace' : 'Project workspace')}</h1><p>{state ? `${state.tasks.length} milestones · ${complete} complete · ${state.project.currency} financials` : 'Schedules, payments, and the work they make possible.'}</p></div><span className="workspace-mode">{label}</span></header>
      {loadError && <div className="connection-error" role="alert"><AlertCircle size={18} /><p>{loadError}</p><button className="button button-secondary" onClick={() => state || projectsList.length ? void refreshState() : window.location.reload()}>Retry connection</button></div>}
      {isLoading || (isRefreshing && !state) ? <LoadingWorkspace /> : !state ? <section className="first-project"><Brand /><h2>{loadError ? 'Your workspace is unavailable' : 'Start with the work ahead.'}</h2><p>{loadError ? 'Reconnect to load your projects and payment data.' : 'Create a project to connect its milestones, invoices, crews, and suppliers.'}</p>{!loadError && <button className="button button-primary" onClick={openNewProjectModal}><Plus size={17} />Create your first project</button>}</section> : <ErrorBoundary key={`${state.project.project_id}-${view}`} fallbackTitle={label}><Suspense fallback={<LoadingWorkspace />}>
        {view === 'overview' && <DeliveryOverview onNavigate={navigate} />}
        {view === 'schedule' && <section className="dedicated-workspace"><TimelinePane /></section>}
        {view === 'recovery' && <FinOpsWidgetPanel />}
        {view === 'suppliers' && <SupplierWorkspace />}
        {view === 'dependencies' && <DependencyWorkspace />}
        {view === 'analytics' && <section className="dedicated-workspace"><StudioWorkspace /></section>}
      </Suspense></ErrorBoundary>}
      <footer className="workspace-footer"><span>Work moves when the numbers do.</span><span>PayPal sandbox · Channel3 sourcing</span></footer>
    </main>
    <ApprovalCheckoutModal /><AuditDrawer /><AgentChatModal /><NewProjectModal /><TaskFinancialsDrawer />
  </div></MotionConfig>;
}

export default App;
