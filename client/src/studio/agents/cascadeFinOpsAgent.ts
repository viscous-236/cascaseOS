/**
 * @file cascadeFinOpsAgent.ts
 * @description AG Studio 3.0 Agent Framework configuration (TASK-034, REQ-016).
 *
 * Implements:
 * - Studio primary AI agent 'cascade-finops-agent'
 * - Delegation to AG Studio's built-in data and widget agents
 * - An AgLlmAdapter that routes every conversational turn through the existing
 *   CascadeOS backend (/api/studio-agent/chat), including its domain tools
 */

import {
  createAiHarness,
  directLlmRunner,
  type AgAiConversationItem,
  type AgAiEvent,
  type AgAiHarnessBuilderContext,
  type AgAiHarnessConfig,
  type AgAiHarnessSetupParams,
  type AgAiOutputMessage,
  type AgAiTool,
  type AgAiToolContext,
  type AgAiToolInvocation,
  type AgLlmAdapter,
  type AgLlmRequest,
  type AgLlmResponse,
  type AgLlmResponseHandler,
} from 'ag-studio';

export interface FinOpsAgentConfigParams {
  projectId?: string;
  /** Resolved per request so a project switch is picked up without remounting Studio. */
  getProjectId?: () => string | undefined;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Callback to trigger the browser PayPal checkout / approval modal. */
  onOpenApprovalModal?: () => void;
}

interface StudioChatResponse {
  role: 'assistant';
  content: string;
  toolCalls?: Array<{
    id: string;
    function: { name: string; arguments: string };
  }>;
  toolResults?: Array<{ name: string; result: unknown }>;
}

export const CASCADE_FINOPS_AGENT_ID = 'cascade-finops-agent';
export const CASCADE_DELEGATE_AGENT_IDS = ['data', 'widget'] as const;

const FINOPS_SYSTEM_PROMPT = `You are the CascadeOS FinOps Agent embedded in AG Studio 3.0.
Your mission is to monitor construction critical paths, prevent crew idling, block supplier price creep, and execute PayPal split invoices.
You have access to real project data in SQLite and live PayPal Sandbox bindings.
Always cite exact dollar amounts and task IDs, and prefer actionable recovery steps over general advice.`;

// ---------------------------------------------------------------------------
// Conversation mapping
// ---------------------------------------------------------------------------

function textFromConversationItem(item: AgAiConversationItem): string | null {
  if (item.type === 'message') {
    return item.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('')
      .trim();
  }
  if (item.type === 'function_call_output') {
    return item.output;
  }
  return null;
}

function toBackendConversation(input: AgAiConversationItem[]): {
  message: string;
  conversationHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
} {
  const turns: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
  for (const item of input) {
    if (item.type !== 'message') continue;
    const content = textFromConversationItem(item);
    if (!content) continue;
    turns.push({ role: item.role, content });
  }

  const lastUserIndex = [...turns].map((turn) => turn.role).lastIndexOf('user');
  if (lastUserIndex < 0) {
    return { message: '', conversationHistory: turns };
  }

  const message = turns[lastUserIndex]!.content;
  return {
    message,
    conversationHistory: turns.filter((_, index) => index !== lastUserIndex),
  };
}

function toOutputMessage(id: string, text: string): AgAiOutputMessage {
  return {
    id,
    kind: 'output',
    type: 'message',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'text', text, annotations: [] }],
  };
}

// ---------------------------------------------------------------------------
// Backend-backed LLM adapter
// ---------------------------------------------------------------------------

export function createCascadeLlmAdapter(params: FinOpsAgentConfigParams = {}): AgLlmAdapter {
  const fetchImpl = params.fetchImpl ?? fetch;

  return {
    executeTurn(request: AgLlmRequest, options?): AgLlmResponseHandler {
      const { message, conversationHistory } = toBackendConversation(request.input);
      const responseId = `cascade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const responsePromise: Promise<AgLlmResponse> = (async () => {
        const activeProjectId = params.getProjectId?.() ?? params.projectId;
        const res = await fetchImpl('/api/studio-agent/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            message,
            conversationHistory,
            ...(activeProjectId ? { projectId: activeProjectId } : {}),
          }),
          ...(options?.signal ? { signal: options.signal } : {}),
        });

        if (!res.ok) {
          throw new Error(`CascadeOS agent request failed with HTTP ${res.status}`);
        }

        const payload = (await res.json()) as StudioChatResponse;
        const content = payload.content?.trim() || 'FinOps analysis complete.';

        return {
          id: responseId,
          createdAt: Date.now(),
          status: 'completed',
          output: [toOutputMessage(responseId, content)],
        };
      })();

      const stream = (async function* streamTurn(): AsyncIterable<AgAiEvent> {
        const response = await responsePromise;
        const messageId = `${responseId}-message`;
        const output = response.output[0];
        const text =
          output && output.type === 'message'
            ? output.content.map((part) => (part.type === 'text' ? part.text : '')).join('')
            : '';

        yield { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' };
        if (text) {
          yield { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: text };
        }
        yield { type: 'TEXT_MESSAGE_END', messageId };
      })();

      return { stream, complete: responsePromise };
    },
  };
}

// ---------------------------------------------------------------------------
// Client-side FinOps Agent Tools
// ---------------------------------------------------------------------------

export function createRunScenarioAnalysisTool(params: FinOpsAgentConfigParams = {}): AgAiTool {
  const fetchImpl = params.fetchImpl ?? fetch;
  return {
    name: 'runScenarioAnalysis',
    description:
      'Triggers CascadeOS scenario analysis (SCENARIO_A, SCENARIO_B, or SCENARIO_C) to calculate idle exposure, fetch supplier quotes, and generate recovery plans.',
    kind: 'client',
    schema: () => ({
      name: 'runScenarioAnalysis',
      description:
        'Triggers CascadeOS scenario analysis (SCENARIO_A, SCENARIO_B, or SCENARIO_C) to calculate idle exposure, fetch supplier quotes, and generate recovery plans.',
      parameters: {
        type: 'object',
        properties: {
          scenarioId: {
            type: 'string',
            enum: ['SCENARIO_A', 'SCENARIO_B', 'SCENARIO_C'],
            description: 'The scenario ID to evaluate (SCENARIO_A, SCENARIO_B, or SCENARIO_C)',
          },
        },
        required: ['scenarioId'],
      },
      kind: 'client',
    }),
    async execute(call: AgAiToolInvocation, ctx: AgAiToolContext) {
      try {
        const scenarioId = (call.args.scenarioId as string) || 'SCENARIO_A';
        const activeProjectId = params.getProjectId?.() ?? params.projectId;
        const res = await fetchImpl(`/api/scenarios/${encodeURIComponent(scenarioId)}/trigger`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            ...(activeProjectId ? { projectId: activeProjectId } : {}),
          }),
          signal: ctx.signal,
        });

        if (!res.ok) {
          const err = await res.text();
          return ctx.error(`Scenario run failed with HTTP ${res.status}: ${err}`);
        }

        const data = await res.json();
        return ctx.success(`Scenario ${scenarioId} executed successfully. Recovery plan generated.`, data);
      } catch (err) {
        return ctx.error(`Failed to execute scenario: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

export function createOpenPayPalApprovalModalTool(params: FinOpsAgentConfigParams = {}): AgAiTool {
  return {
    name: 'openPayPalApprovalModal',
    description: 'Opens the browser PayPal checkout modal on the client for user review and approval of the recovery plan.',
    kind: 'client',
    schema: () => ({
      name: 'openPayPalApprovalModal',
      description: 'Opens the browser PayPal checkout modal on the client for user review and approval of the recovery plan.',
      parameters: {
        type: 'object',
        properties: {},
      },
      kind: 'client',
    }),
    async execute(_call: AgAiToolInvocation, ctx: AgAiToolContext) {
      if (params.onOpenApprovalModal) {
        params.onOpenApprovalModal();
        return ctx.success('PayPal approval modal opened on client.', { opened: true });
      }
      return ctx.error('Approval modal handler is not configured on the client.');
    },
  };
}

// ---------------------------------------------------------------------------
// AG Studio harness configuration
// ---------------------------------------------------------------------------

export function buildCascadeHarnessConfig(
  ctx: AgAiHarnessBuilderContext,
  params: FinOpsAgentConfigParams = {}
): AgAiHarnessConfig {
  const adapter = createCascadeLlmAdapter(params);
  const runScenarioTool = createRunScenarioAnalysisTool(params);
  const openApprovalModalTool = createOpenPayPalApprovalModalTool(params);

  const finOpsAgent = directLlmRunner({
    id: CASCADE_FINOPS_AGENT_ID,
    name: 'CascadeOS FinOps Agent',
    description: 'Autonomous schedule recovery and cashflow arbitrage copilot',
    instructions: () => FINOPS_SYSTEM_PROMPT,
    tools: () => [
      ctx.tools.delegateTo([...CASCADE_DELEGATE_AGENT_IDS]),
      runScenarioTool,
      openApprovalModalTool,
    ],
    adapter,
  });

  // The built-in data and widget agents become real delegation targets. Their
  // turns are routed through the same CascadeOS backend, which owns the live
  // project schema and domain tools.
  const dataAgent = directLlmRunner({ ...ctx.builtIn.data, adapter });
  const widgetAgent = directLlmRunner({ ...ctx.builtIn.widget, adapter });

  return {
    primary: CASCADE_FINOPS_AGENT_ID,
    agents: [finOpsAgent, dataAgent, widgetAgent],
  };
}

/**
 * Returns the `ai` prop value for <AgStudio />. Studio calls the setup function
 * with its own API instance once the dashboard is initialised.
 */
export function createCascadeStudioAiConfig(params: FinOpsAgentConfigParams = {}) {
  return ({ api }: AgAiHarnessSetupParams) =>
    createAiHarness(api, (ctx) => buildCascadeHarnessConfig(ctx, params));
}

export default createCascadeStudioAiConfig;
