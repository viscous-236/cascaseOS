import { lazy, Suspense, useState } from 'react';
import { ArrowRight, Box, ListTree } from 'lucide-react';
import { useCascadeState } from '@/context/CascadeStateContext';
import { phaseName, Status } from './Status';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

const FinOps3DTopology = lazy(() => import('@/components/FinOps3DTopology'));

export function DependencyWorkspace() {
  const { state, openTaskDrawer, selectTask, selectedTaskId } = useCascadeState();
  const [spatial, setSpatial] = useState(false);
  return <section className="dependency-workspace"><div className="section-heading"><div><h2>What the next phase depends on</h2><p>Finish-to-start relationships from the project schedule.</p></div><div className="segmented-control"><button onClick={() => setSpatial(false)} aria-pressed={!spatial}><ListTree size={15} />Relationships</button><button onClick={() => setSpatial(true)} aria-pressed={spatial}><Box size={15} />3D view</button></div></div>
    {spatial && <ErrorBoundary fallbackTitle="3D dependency view"><Suspense fallback={<p className="inline-empty">Loading spatial view…</p>}><FinOps3DTopology /></Suspense></ErrorBoundary>}
    <div className="dependency-list">{state?.tasks.map((task) => {
      const incoming = state.dependencies.filter((edge) => edge.to_task_id === task.task_id);
      return <article className={`dependency-row ${selectedTaskId === task.task_id ? 'is-selected' : ''}`} key={task.task_id}><div><button className="phase-name" onClick={() => openTaskDrawer(task.task_id)}>{phaseName(task.name)}</button><Status value={task.schedule_status} /></div><ArrowRight size={17} aria-hidden="true" /><div><span className="cell-note">Required predecessors</span>{incoming.length ? incoming.map((edge) => {
        const from = state.tasks.find((item) => item.task_id === edge.from_task_id);
        return <button key={edge.dependency_id} className="dependency-predecessor" onClick={() => selectTask(edge.from_task_id)}><span>{phaseName(from?.name ?? edge.from_task_id)}</span><Status value={from?.schedule_status ?? 'SCHEDULED'} />{edge.lag_days !== 0 && <small>{edge.lag_days} day lag</small>}</button>;
      }) : <p className="inline-empty">No predecessors. This phase can start the sequence.</p>}</div></article>;
    })}</div>
    {!state?.tasks.length && <p className="inline-empty">Add project milestones to define their dependencies.</p>}
  </section>;
}
