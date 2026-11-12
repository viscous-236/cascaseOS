import { describe, expect, it, vi } from 'vitest';
import type {
  AgAiHarnessBuilderContext,
  AgAiTool,
  AgLlmRequest,
} from 'ag-studio';
import {
  buildCascadeHarnessConfig,
  createCascadeLlmAdapter,
} from '../src/studio/agents/cascadeFinOpsAgent';

function stubAgent(id: string) {
  return {
    id,
    name: id,
    instructions: () => `You are the ${id} agent.`,
    tools: () => [],
  };
}

function harnessContext() {
  const delegateTool = {
    name: 'delegate_to',
    description: 'Delegate work to another agent',
    kind: 'client',
    schema: () => undefined,
    execute: vi.fn(),
  } as unknown as AgAiTool;
  const delegateTo = vi.fn().mockReturnValue(delegateTool);

  const builtIn = {
    lead: stubAgent('lead'),
    data: stubAgent('data'),
    page: stubAgent('page'),
    planning: stubAgent('planning'),
    widget: stubAgent('widget'),
  };

  return {
    delegateTo,
    delegateTool,
    ctx: {
      tools: { delegateTo },
      builtIn,
    } as unknown as AgAiHarnessBuilderContext,
  };
}

describe('CascadeOS Studio agent configuration', () => {
  it('registers the FinOps agent as primary and exposes delegation to the data and widget agents', () => {
    const { ctx, delegateTo, delegateTool } = harnessContext();

    const config = buildCascadeHarnessConfig(ctx);

    expect(config.primary).toBe('cascade-finops-agent');
    expect(config.agents.map((agent) => agent.id)).toEqual(
      expect.arrayContaining(['cascade-finops-agent', 'data', 'widget'])
    );

    const finOpsAgent = config.agents.find((agent) => agent.id === 'cascade-finops-agent');
    expect(finOpsAgent).toBeDefined();

    const tools = finOpsAgent!.tools!(
      { api: {} as never, studio: {} as never, tools: ctx.tools },
      undefined
    );

    expect(delegateTo).toHaveBeenCalledWith(['data', 'widget']);
    expect(tools).toContain(delegateTool);
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['delegate_to', 'runScenarioAnalysis', 'openPayPalApprovalModal'])
    );
  });

  it('executes client-side tools openPayPalApprovalModal and runScenarioAnalysis', async () => {
    const { ctx } = harnessContext();
    const onOpenApprovalModal = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, plan: { id: 'plan_123' } }), {
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const config = buildCascadeHarnessConfig(ctx, {
      projectId: 'proj_xyz',
      onOpenApprovalModal,
      fetchImpl,
    });
    const finOpsAgent = config.agents.find((agent) => agent.id === 'cascade-finops-agent')!;
    const tools = finOpsAgent.tools!({ api: {} as never, studio: {} as never, tools: ctx.tools }, undefined);

    const modalTool = tools.find((t) => t.name === 'openPayPalApprovalModal');
    expect(modalTool).toBeDefined();
    const dummyCtx = {
      signal: new AbortController().signal,
      run: { threadId: 't1', runId: 'r1' },
      success: (res: string, data?: unknown) => ({ success: true as const, response: res, data }),
      error: (msgs: string | string[]) => ({
        success: false as const,
        issues: (Array.isArray(msgs) ? msgs : [msgs]).map((m) => ({ message: m })),
      }),
    };

    const modalResult = await modalTool!.execute!({ toolCallId: 'c1', name: 'openPayPalApprovalModal', args: {} }, dummyCtx);
    expect(modalResult.success).toBe(true);
    expect(onOpenApprovalModal).toHaveBeenCalledTimes(1);

    const runTool = tools.find((t) => t.name === 'runScenarioAnalysis');
    expect(runTool).toBeDefined();
    const runResult = await runTool!.execute!(
      { toolCallId: 'c2', name: 'runScenarioAnalysis', args: { scenarioId: 'SCENARIO_B' } },
      dummyCtx
    );
    expect(runResult.success).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/scenarios/SCENARIO_B/trigger',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ projectId: 'proj_xyz' }),
      })
    );
  });

  it('routes chat turns through the CascadeOS backend and emits AG-UI text events', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          role: 'assistant',
          content: 'Current idle exposure is $2,800.00.',
          toolCalls: [],
          toolResults: [],
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    );

    const adapter = createCascadeLlmAdapter({
      fetchImpl,
      getProjectId: () => 'proj_test_01',
    });
    const request: AgLlmRequest = {
      input: [
        {
          id: 'msg-1',
          kind: 'input',
          type: 'message',
          role: 'user',
          content: [{ type: 'text', text: 'What is our current exposure?' }],
          status: 'completed',
        },
      ],
      responseFormat: { type: 'text' },
    };

    const response = adapter.executeTurn(request);
    const events = [];
    for await (const event of response.stream) {
      events.push(event);
    }

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/studio-agent/chat',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body));
    expect(body.message).toBe('What is our current exposure?');
    expect(body.projectId).toBe('proj_test_01');
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'TEXT_MESSAGE_CONTENT',
          delta: 'Current idle exposure is $2,800.00.',
        }),
      ])
    );

    const completed = await response.complete;
    expect(completed.status).toBe('completed');
    expect(completed.output).toEqual([
      expect.objectContaining({
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Current idle exposure is $2,800.00.', annotations: [] },
        ],
      }),
    ]);
  });
});
