import { BarChart3, CalendarRange, ClipboardList, GitBranch, LifeBuoy, Moon, Plus, ReceiptText, ShieldCheck, Sun, X, MessageSquare, ArrowUpRight } from 'lucide-react';
import { useCascadeState } from '@/context/CascadeStateContext';
import { useDialog } from '@/components/ui/useDialog';

export const workspaceViews = [
  { id: 'overview', label: 'Delivery overview', icon: ClipboardList },
  { id: 'schedule', label: 'Schedule', icon: CalendarRange },
  { id: 'recovery', label: 'Recovery plans', icon: LifeBuoy },
  { id: 'suppliers', label: 'Supplier quotes', icon: ReceiptText },
  { id: 'dependencies', label: 'Dependencies', icon: GitBranch },
  { id: 'analytics', label: 'Analytics studio', icon: BarChart3 },
] as const;
export type WorkspaceView = typeof workspaceViews[number]['id'];

export function Brand() {
  return <span className="brand"><svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M3 4h11v5H3zM8 11h14v5H8zM14 18h11v5H14z" fill="currentColor" /></svg><span>Cascade<span className="brand-os">OS</span></span></span>;
}

export function Sidebar({ view, open, onNavigate, onClose }: { view: WorkspaceView; open: boolean; onNavigate: (view: WorkspaceView) => void; onClose: () => void }) {
  const { projectsList, activeProjectId, switchProject, isRefreshing, openNewProjectModal, setIsAuditDrawerOpen, setIsAgentChatOpen, theme, toggleTheme, activePlan, health } = useCascadeState();
  const navigationRef = useDialog(open, onClose);
  return <>
    {open && <button className="nav-backdrop" onClick={onClose} aria-label="Close navigation" />}
    <aside ref={navigationRef} tabIndex={-1} role={open ? 'dialog' : undefined} aria-modal={open ? true : undefined} className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Project workspace">
      <div className="sidebar-brand"><a href="#overview" onClick={() => { onNavigate('overview'); onClose(); }} aria-label="CascadeOS delivery overview"><Brand /></a><button className="icon-button mobile-only" onClick={onClose} aria-label="Close navigation"><X size={18} /></button></div>
      <div className="sidebar-project"><label htmlFor="project-switcher">Project workspace</label><select id="project-switcher" value={activeProjectId} disabled={isRefreshing || !projectsList.length} onChange={(event) => { void switchProject(event.target.value); onClose(); }}>
        {!projectsList.length && <option value="">No projects yet</option>}
        {projectsList.map((project) => <option value={project.project_id} key={project.project_id}>{project.name}</option>)}
      </select><button className="sidebar-new" onClick={() => { openNewProjectModal(); onClose(); }}><Plus size={15} /> New project</button></div>
      <nav className="primary-nav" aria-label="Workspace views">{workspaceViews.map(({ id, label, icon: Icon }) => <a href={`#${id}`} key={id} onClick={() => { onNavigate(id); onClose(); }} aria-current={view === id ? 'page' : undefined}><Icon size={18} strokeWidth={1.7} /><span>{label}</span>{id === 'recovery' && activePlan?.status === 'PROPOSED' && <span className="nav-count">1</span>}</a>)}</nav>
      <div className="sidebar-bottom">
        <button onClick={() => { setIsAuditDrawerOpen(true); onClose(); }}><ShieldCheck size={18} strokeWidth={1.7} /> Audit trail<ArrowUpRight size={14} className="trailing-icon" /></button>
        <button onClick={() => { setIsAgentChatOpen(true); onClose(); }}><MessageSquare size={18} strokeWidth={1.7} /> FinOps assistant<ArrowUpRight size={14} className="trailing-icon" /></button>
        <button onClick={toggleTheme}>{theme === 'light' ? <Moon size={18} strokeWidth={1.7} /> : <Sun size={18} strokeWidth={1.7} />}<span>{theme === 'light' ? 'Dark appearance' : 'Light appearance'}</span></button>
        <div className="environment-note"><span className={`status-dot ${health?.status === 'healthy' ? 'tone-success' : 'tone-warning'}`} /><div><strong>Sandbox workspace</strong><span>{health ? health.status === 'healthy' ? 'Integrations connected' : 'Integration needs attention' : 'Checking connections'}</span></div></div>
      </div>
    </aside>
  </>;
}
