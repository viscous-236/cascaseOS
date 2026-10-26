/**
 * @file cascadeFinOpsAgent.ts
 * @description AG Studio 3.0 Agent Framework Configuration (TASK-034, REQ-016).
 *
 * Implements:
 * - Studio primary AI agent 'cascade-finops-agent'
 * - Delegation to AG Studio's built-in data and widget agents
 * - Custom tools: runScenarioAnalysis, openPayPalApprovalModal, inspectBlastRadius
 * - Connects to Groq OSS 120B backend via /api/studio-agent/chat
 */

import type { AgStudioApi } from 'ag-studio';

export interface FinOpsAgentConfigParams {
  api: AgStudioApi;
  onOpenApprovalModal?: () => void;
  onTriggerScenario?: (scenario: 'SCENARIO_A' | 'SCENARIO_B' | 'SCENARIO_C') => Promise<void>;
}

export function createCascadeStudioAiConfig(params: FinOpsAgentConfigParams) {
  return ({ api }: { api: AgStudioApi }) => {
    return {
      agent: {
        id: 'cascade-finops-agent',
        name: 'CascadeOS FinOps Agent',
        description: 'Autonomous schedule recovery and cashflow arbitrage copilot',
        model: 'groq/gpt-oss-120b',
        systemPrompt: `You are the CascadeOS FinOps Agent embedded in AG Studio 3.0.
Your mission is to monitor construction critical paths, prevent crew idling, block supplier price creep, and execute PayPal split invoices.
You have access to real project data in SQLite and live PayPal Sandbox bindings.`,
        tools: [
          {
            name: 'inspectBlastRadius',
            description: 'Inspect the DAG blast radius and idle crew burn for overdue tasks',
            parameters: {
              type: 'object',
              properties: {
                taskId: { type: 'string', description: 'ID of the blocked task' },
              },
            },
            handler: async (args: { taskId?: string }) => {
              const res = await fetch('/api/studio-agent/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  message: `Calculate blast radius for task ${args.taskId || 'current'}`,
                  conversationHistory: [],
                }),
              });
              return res.json();
            },
          },
          {
            name: 'triggerScenario',
            description: 'Trigger a live FinOps schedule recovery scenario (A, B, or C)',
            parameters: {
              type: 'object',
              properties: {
                scenarioId: {
                  type: 'string',
                  enum: ['SCENARIO_A', 'SCENARIO_B', 'SCENARIO_C'],
                },
              },
              required: ['scenarioId'],
            },
            handler: async (args: { scenarioId: 'SCENARIO_A' | 'SCENARIO_B' | 'SCENARIO_C' }) => {
              if (params.onTriggerScenario) {
                await params.onTriggerScenario(args.scenarioId);
                return { success: true, message: `Triggered ${args.scenarioId}` };
              }
              return { success: false, message: 'Scenario handler not attached' };
            },
          },
          {
            name: 'openPayPalApprovalModal',
            description: 'Open the cryptographic approval and PayPal Sandbox checkout modal',
            parameters: { type: 'object', properties: {} },
            handler: async () => {
              params.onOpenApprovalModal?.();
              return { success: true, message: 'Approval modal opened' };
            },
          },
        ],
      },
    };
  };
}

export default createCascadeStudioAiConfig;
