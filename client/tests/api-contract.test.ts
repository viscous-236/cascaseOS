import { afterEach, describe, expect, it, vi } from 'vitest';
import { cascadeApiClient } from '../src/api/cascadeApiClient';

afterEach(() => vi.unstubAllGlobals());

describe('project state API contract', () => {
  it('loads the current server recovery plan after a page reload', async () => {
    const plan = { plan_id: 'proposal-1', status: 'PROPOSED' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      project: { project_id: 'project/one' }, tasks: [], dependencies: [], supplierQuotes: [],
      auditEvents: [], paypalTransactions: [], activeRecoveryPlan: plan,
    }), { headers: { 'Content-Type': 'application/json' } })));
    const state = await cascadeApiClient.getProjectState('project/one');
    expect(fetch).toHaveBeenCalledWith('/api/projects/project%2Fone/state', expect.any(Object));
    expect(state.recoveryPlans).toEqual([plan]);
    expect(state.userApprovals).toEqual([]);
  });

  it('does not invent a proposal when the server has no active recovery', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ activeRecoveryPlan: null }), { headers: { 'Content-Type': 'application/json' } })));
    expect((await cascadeApiClient.getProjectState('empty')).recoveryPlans).toEqual([]);
  });

  it('preserves full histories supplied by a newer server', async () => {
    const recoveryPlans = [{ plan_id: 'approved', status: 'APPROVED' }, { plan_id: 'old', status: 'SUPERSEDED' }];
    const userApprovals = [{ approval_id: 'signed' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ recoveryPlans, userApprovals }), { headers: { 'Content-Type': 'application/json' } })));
    const state = await cascadeApiClient.getProjectState('project');
    expect(state.recoveryPlans).toEqual(recoveryPlans);
    expect(state.userApprovals).toEqual(userApprovals);
  });

  it('keeps server failures actionable instead of normalizing them to empty projects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Project unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    await expect(cascadeApiClient.getProjectState('missing')).rejects.toMatchObject({ status: 503, message: 'Project unavailable' });
  });
});
