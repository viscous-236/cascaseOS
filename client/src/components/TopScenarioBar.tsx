import { useState } from 'react';
import { ArrowRight, FlaskConical, RefreshCw } from 'lucide-react';
import { useCascadeState } from '@/context/CascadeStateContext';

export function TopScenarioBar() {
  const { triggerScenario, activeScenario, isRefreshing, bootstrapProject } = useCascadeState();
  const [scenario, setScenario] = useState<'SCENARIO_A' | 'SCENARIO_B' | 'SCENARIO_C'>('SCENARIO_A');
  const descriptions = {
    SCENARIO_A: 'Mark an invoice overdue and evaluate a schedule recovery proposal for this project.',
    SCENARIO_B: 'Evaluate supplier price increases and search Channel3 for a replacement quote.',
    SCENARIO_C: 'Test that the policy engine blocks a dependency bypass with incomplete costs.',
  };
  return <section className="scenario-workbench"><div className="section-heading"><div><h2><FlaskConical size={17} /> Sandbox scenarios</h2><p>These actions change the active project’s sandbox state and may call live integrations.</p></div></div><div className="scenario-controls"><label htmlFor="scenario-select">Scenario<select id="scenario-select" value={scenario} disabled={isRefreshing} onChange={(event) => setScenario(event.target.value as typeof scenario)}><option value="SCENARIO_A">Invoice delay & recovery</option><option value="SCENARIO_B">Supplier price defense</option><option value="SCENARIO_C">Dependency bypass test</option></select></label><p>{descriptions[scenario]}</p><button className="button button-secondary" onClick={() => void triggerScenario(scenario)} disabled={isRefreshing}>{isRefreshing ? <RefreshCw size={15} className="spin" /> : <ArrowRight size={15} />}{isRefreshing ? 'Running…' : 'Run scenario'}</button></div>{activeScenario && <p className="cell-note">Last selected scenario: {activeScenario.replace('SCENARIO_', '')}</p>}<details className="sandbox-reset"><summary>Sandbox maintenance</summary><p>Reset replaces the canonical demo project’s state and reprovisions its integrations.</p><button className="button button-secondary" disabled={isRefreshing} onClick={() => { if (window.confirm('Reset the canonical sandbox project? Its current demo state will be replaced.')) void bootstrapProject(true); }}>Reset canonical demo</button></details></section>;
}
export default TopScenarioBar;
