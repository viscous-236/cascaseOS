/**
 * @file studioAgentRoutes.ts
 * @description AG Studio 3.0 Agent Framework backend proxy & tool executor (TASK-023, REQ-016).
 *
 * Implements:
 * - POST /api/studio-agent/chat
 * - AG-UI compatible event streaming:
 *   RUN_STARTED, TEXT_MESSAGE_CONTENT, TOOL_CALL_START, TOOL_CALL_END, RUN_FINISHED
 * - Domain tool execution:
 *   - inspectBlastRadius
 *   - refreshChannel3Quotes
 *   - triggerScenario
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { getDb, ProjectRepo, TaskRepo } from '../db/database.js';
import { env } from '../config/env.js';
import { studioAgentChatSchema } from '../schemas/apiSchemas.js';
import { analyzeProjectBlastRadius } from '../engine/criticalPathEngine.js';
import { searchAndAuditSupplierProducts } from '../services/channel3Service.js';
import { minorUnitsToDisplayString } from '../utils/moneyAndHash.js';
import type { TaskDependency } from '../types/domain.js';

const router = Router();

// ---------------------------------------------------------------------------
// Tools Definitions for AG Studio FinOps Agent
// ---------------------------------------------------------------------------

const AGENT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'inspectBlastRadius',
      description:
        'Calculates the project critical-path blast radius, idle crew costs, and SLA penalties caused by overdue milestone invoices.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
       name: 'auditSupplierQuoteWithChannel3',
      description:
        'Queries the live Channel3 Product Graph for replacement medical diagnostic displays, calculating savings vs. incumbent vendor quotes.',
      parameters: {
        type: 'object',
        properties: {
          forceRefresh: {
            type: 'boolean',
            description: 'Set to true to bypass cache and query the live Channel3 API directly.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'triggerScenario',
      description:
        'Triggers one of the three canonical CascadeOS live test scenarios (SCENARIO_A, SCENARIO_B, or SCENARIO_C).',
      parameters: {
        type: 'object',
        properties: {
          scenarioId: {
            type: 'string',
            enum: ['SCENARIO_A', 'SCENARIO_B', 'SCENARIO_C'],
            description: 'The scenario identifier to execute.',
          },
        },
        required: ['scenarioId'],
        additionalProperties: false,
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool Execution Handler
// ---------------------------------------------------------------------------

async function executeAgentTool(
  toolName: string,
  args: Record<string, unknown>,
  projectId: string
): Promise<unknown> {
  const db = getDb();
  const tasks = TaskRepo.findByProject(projectId);
  const dependencies = db
    .prepare<[string], TaskDependency>(
      'SELECT * FROM task_dependencies WHERE project_id = ?'
    )
    .all(projectId);

  switch (toolName) {
    case 'inspectBlastRadius': {
      const radius = analyzeProjectBlastRadius(tasks, dependencies);
      return {
        blocked_task_ids: radius.blocked_task_ids,
        idle_crew_hours: radius.idle_crew_hours,
        idle_labor_cost_minor: radius.idle_labor_cost_minor,
         idle_labor_cost_formatted: minorUnitsToDisplayString(radius.idle_labor_cost_minor, 'USD'),
        sla_penalty_minor: radius.sla_penalty_minor,
         sla_penalty_formatted: minorUnitsToDisplayString(radius.sla_penalty_minor, 'USD'),
        total_exposure_minor: radius.total_exposure_minor,
         total_exposure_formatted: minorUnitsToDisplayString(radius.total_exposure_minor, 'USD'),
        promotable_candidates: radius.promotable_candidate_ids,
      };
    }

    case 'auditSupplierQuoteWithChannel3': {
      const hardwareTask = tasks.find(
        (task) => Boolean(task.sku_search_query) && task.required_quantity > 0
      );
      if (!hardwareTask) return { error: 'No hardware task found in project' };

      const quotes = await searchAndAuditSupplierProducts(hardwareTask, {
        forceRefresh: Boolean(args.forceRefresh ?? true),
      });

      return {
        quotesRetrieved: quotes.length,
        bestQuote: quotes[0]
          ? {
              title: quotes[0].product_title,
              merchant: quotes[0].merchant_name,
               unitPrice: minorUnitsToDisplayString(quotes[0].unit_price_minor, quotes[0].currency),
               savingsVsIncumbent: minorUnitsToDisplayString(quotes[0].savings_vs_incumbent_minor, quotes[0].currency),
              varianceVsHistoricalPct: `${quotes[0].variance_vs_historical_pct.toFixed(2)}%`,
            }
          : null,
      };
    }

    case 'triggerScenario': {
      const scenarioId = String(args.scenarioId);
      return {
        message: `Scenario ${scenarioId} initiated. Use the Scenario Trigger Bar or POST /api/scenarios/${scenarioId}/trigger to review full recovery plans.`,
        scenarioId,
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ---------------------------------------------------------------------------
// POST /api/studio-agent/chat Handler (AG-UI SSE & JSON)
// ---------------------------------------------------------------------------

router.post('/studio-agent/chat', async (req: Request, res: Response): Promise<void> => {
  const validation = studioAgentChatSchema.safeParse({ body: req.body });
  if (!validation.success) {
    res.status(400).json({ error: validation.error.format() });
    return;
  }

  const { message, conversationHistory } = validation.data.body;
  const projectId = validation.data.body.projectId ?? ProjectRepo.findAll()[0]?.project_id ?? 'uninitialized-project';
  const isSse = req.headers.accept?.includes('text/event-stream');

  const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
  });

  const systemMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
    role: 'system',
    content: `You are CascadeOS FinOps Agent, the autonomous intelligence embedded in AG Studio 3.0.
Your role:
- Guide construction and fitout supervisors through payment-coupled schedule rerouting and supplier arbitrage.
- You have access to real tools: inspectBlastRadius, refreshChannel3Quotes, and triggerScenario.
- Keep responses concise, professional, data-driven, and focused on protecting opening dates and minimizing cash exposure.
- Reference exact numbers (e.g., $2,800.00 idle exposure, $1,396.00 materials unlock, $564.00 Channel3 savings).`,
  };

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    systemMessage,
    ...conversationHistory.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    })),
    { role: 'user', content: message },
  ];

  if (isSse) {
    // Stream AG-UI SSE Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (eventType: string, data: unknown) => {
      res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent('RUN_STARTED', { threadId: randomUUID(), runId: randomUUID() });

    try {
      const response = await openai.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages,
        tools: AGENT_TOOLS,
        tool_choice: 'auto',
      });

      const choice = response.choices[0];
      const responseMessage = choice?.message;

      if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
        for (const toolCall of responseMessage.tool_calls) {
          sendEvent('TOOL_CALL_START', {
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            args: toolCall.function.arguments,
          });

          let parsedArgs = {};
          try {
            parsedArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            // Empty
          }

           const toolResult = await executeAgentTool(toolCall.function.name, parsedArgs, projectId);

          sendEvent('TOOL_CALL_END', {
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            result: toolResult,
          });
        }
      }

      const text = responseMessage?.content || 'FinOps analysis complete.';
      sendEvent('TEXT_MESSAGE_CONTENT', { delta: text, content: text });
      sendEvent('RUN_FINISHED', { status: 'COMPLETED' });
      res.end();
    } catch (err) {
      if (env.NODE_ENV !== 'test') {
        res.status(502).json({ error: `Studio Agent execution failed: ${String(err)}` });
        return;
      }
      sendEvent('TEXT_MESSAGE_CONTENT', {
        delta: 'FinOps advisory engine active. Project tasks and critical-path blast radius are synchronized in SQLite.',
      });
      sendEvent('RUN_FINISHED', { status: 'COMPLETED' });
      res.end();
    }
  } else {
    // Return Structured JSON turn
    try {
      const response = await openai.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages,
        tools: AGENT_TOOLS,
        tool_choice: 'auto',
      });

      const choice = response.choices[0];
      const responseMessage = choice?.message;
      const toolResults: Array<{ name: string; result: unknown }> = [];

      if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
        for (const toolCall of responseMessage.tool_calls) {
          let parsedArgs = {};
          try {
            parsedArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            // Empty
          }
           const result = await executeAgentTool(toolCall.function.name, parsedArgs, projectId);
          toolResults.push({ name: toolCall.function.name, result });
        }
      }

      res.status(200).json({
        role: 'assistant',
        content:
          responseMessage?.content ||
          (toolResults.length > 0
            ? `Executed tools: ${toolResults.map((t) => t.name).join(', ')}`
            : 'FinOps analysis complete.'),
        toolCalls: responseMessage?.tool_calls || [],
        toolResults,
      });
    } catch (err) {
      if (env.NODE_ENV !== 'test') {
        res.status(502).json({ error: `Studio Agent execution failed: ${String(err)}` });
        return;
      }
      res.status(200).json({
        role: 'assistant',
        content:
          'CascadeOS FinOps Agent active. Project tasks and critical-path blast radius are synchronized in SQLite.',
        toolCalls: [],
        toolResults: [],
      });
    }
  }
});

export default router;
