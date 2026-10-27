/**
 * @file projectArchitectAiService.ts
 * @description Natural-Language AI Project Architect powered by OpenAI (TASK-104, REQ-102, SEC-102).
 *
 * Implements:
 * - Natural Language -> Valid DAG Blueprint generation
 * - Strict schema validation with AiGeneratedProjectBlueprintSchema (SEC-102)
 * - Cycle-detection enforcement with validateAcyclicGraph (SEC-101)
 * - Deterministic integer minor units for all monetary values (REQ-002)
 * - Real Channel3 search queries and vendor baseline prices
 */

import OpenAI from 'openai';
import { env } from '../config/env.js';
import {
  AiGeneratedProjectBlueprintSchema,
  type AiGeneratedProjectBlueprint,
} from '../schemas/onboardingSchemas.js';
import { validateAcyclicGraph } from '../engine/dagValidator.js';

export interface GenerateProjectBlueprintInput {
  prompt: string;
  clientName: string;
  clientEmail: string;
  startDate: string;
  currency?: 'USD';
}

let _openaiClient: OpenAI | null = null;

const PROJECT_BLUEPRINT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['project_name', 'currency', 'tasks', 'dependencies'],
  properties: {
    project_name: { type: 'string', minLength: 3 },
    currency: { type: 'string', enum: ['USD'] },
    tasks: {
      type: 'array',
      minItems: 4,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'task_id', 'name', 'duration_days', 'materials_in_warehouse',
          'crew_assigned', 'daily_idle_burn_minor', 'sla_delay_penalty_minor',
          'phase_hardware_budget_max_minor', 'invoice_total_minor',
          'materials_unlock_minor', 'deferred_labor_minor', 'sku_search_query',
          'required_quantity', 'incumbent_vendor_name', 'incumbent_unit_price_minor',
          'historical_unit_price_minor', 'max_allowed_variance_pct',
        ],
        properties: {
          task_id: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 2 },
          duration_days: { type: 'integer', minimum: 1, maximum: 30 },
          materials_in_warehouse: { type: 'boolean' },
          crew_assigned: { type: 'string', minLength: 2 },
          daily_idle_burn_minor: { type: 'integer', minimum: 0 },
          sla_delay_penalty_minor: { type: 'integer', minimum: 0 },
          phase_hardware_budget_max_minor: { type: 'integer', minimum: 0 },
          invoice_total_minor: { type: 'integer', minimum: 0 },
          materials_unlock_minor: { type: 'integer', minimum: 0 },
          deferred_labor_minor: { type: 'integer', minimum: 0 },
          sku_search_query: { type: ['string', 'null'] },
          required_quantity: { type: 'integer', minimum: 0 },
          incumbent_vendor_name: { type: ['string', 'null'] },
          incumbent_unit_price_minor: { type: ['integer', 'null'], minimum: 0 },
          historical_unit_price_minor: { type: ['integer', 'null'], minimum: 0 },
          max_allowed_variance_pct: { type: 'number', minimum: 0 },
        },
      },
    },
    dependencies: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from_task_id', 'to_task_id', 'lag_days'],
        properties: {
          from_task_id: { type: 'string', minLength: 1 },
          to_task_id: { type: 'string', minLength: 1 },
          lag_days: { type: 'integer', minimum: 0 },
        },
      },
    },
  },
} as const;

function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    _openaiClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
    });
  }
  return _openaiClient;
}

/**
 * Generates a valid project schedule DAG and procurement specification from a plain-text prompt.
 */
export async function generateProjectBlueprintFromPrompt(
  input: GenerateProjectBlueprintInput
): Promise<AiGeneratedProjectBlueprint> {
  const safePrompt = input.prompt.replace(/[\r\n\t]/g, ' ').slice(0, 1000);
  const safeClient = input.clientName.replace(/[\r\n\t]/g, ' ').slice(0, 80);

  const systemInstructions = `You are CascadeOS AI Schedule & FinOps Architect.
Your role is to transform natural language project briefs into a mathematically sound, payment-coupled construction or AV/hardware buildout schedule.

Requirements (SEC-102):
1. Output MUST be valid JSON adhering strictly to the schema.
2. Generate between 4 and 6 sequential and parallel phases.
3. Every phase MUST have:
   - task_id (slug like "phase_1_power_lighting", "phase_2_displays")
   - name (descriptive title)
   - duration_days (integer 1-30)
   - materials_in_warehouse (boolean). IMPORTANT: At least one non-initial phase MUST have materials_in_warehouse: true so it can serve as a schedule promotion candidate!
   - crew_assigned (e.g. "Master Electricians", "AV Integration Crew", "Acoustics Specialist")
   - daily_idle_burn_minor (integer USD cents, e.g. 60000 = $600/day)
   - sla_delay_penalty_minor (integer USD cents, e.g. 144000 = $1,440 or 0)
   - phase_hardware_budget_max_minor (integer USD cents, e.g. 160000 = $1,600.00)
   - invoice_total_minor (integer USD cents, e.g. 450000 = $4,500.00)
   - materials_unlock_minor (integer USD cents, e.g. 139600 = $1,396.00)
   - deferred_labor_minor (integer USD cents, e.g. 310400 = $3,104.00, sum equals invoice_total_minor)
   - sku_search_query (concrete retail query for live Channel3 product search, e.g. "32 inch 4K OLED Monitor Ergonomic Stand" or "Cat6A Shielded Patch Panel 48 Port", or null for pure labor phases)
   - required_quantity (integer > 0 for hardware phases, 0 for labor)
   - incumbent_vendor_name (e.g. "ProSupply Distributors" or null)
   - incumbent_unit_price_minor (unit price in cents showing ~25-30% price creep, e.g. 49000 = $490.00)
   - historical_unit_price_minor (baseline budget unit price in cents, e.g. 38000 = $380.00)
   - max_allowed_variance_pct (typically 10.0)
4. Dependencies MUST form a valid Acyclic Directed Graph (DAG) with finish-to-start links (from_task_id -> to_task_id). No cycles allowed!`;

  const userQuery = `Create an execution blueprint for this buildout:
Client: "${safeClient}"
Start Date: "${input.startDate}"
Currency: "USD"
User Specification:
"${safePrompt}"`;

  try {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: env.OPENAI_MODEL || 'gpt-4o',
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'cascade_project_blueprint',
          strict: true,
          schema: PROJECT_BLUEPRINT_JSON_SCHEMA,
        },
      },
      messages: [
        { role: 'system', content: systemInstructions },
        { role: 'user', content: userQuery },
      ],
      temperature: 0.2,
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error('Empty response from OpenAI');
    }

    const parsedJson = JSON.parse(rawContent);
    const validated = AiGeneratedProjectBlueprintSchema.parse(parsedJson);

    // Validate acyclic graph (SEC-101)
    const taskIds = validated.tasks.map((t) => t.task_id);
    if (new Set(taskIds).size !== taskIds.length) {
      throw new Error('AI blueprint contains duplicate task IDs');
    }
    const taskIdSet = new Set(taskIds);
    if (validated.dependencies.some((dependency) => !taskIdSet.has(dependency.from_task_id) || !taskIdSet.has(dependency.to_task_id))) {
      throw new Error('AI blueprint dependency references an unknown task');
    }
    for (const task of validated.tasks) {
      if (task.materials_unlock_minor + task.deferred_labor_minor !== task.invoice_total_minor) {
        throw new Error(`AI blueprint invoice split does not balance for ${task.task_id}`);
      }
      if ((task.sku_search_query === null) !== (task.required_quantity === 0)) {
        throw new Error(`AI blueprint hardware fields are inconsistent for ${task.task_id}`);
      }
    }
    const dagCheck = validateAcyclicGraph(taskIds, validated.dependencies);
    if (!dagCheck.valid) {
      throw new Error(
        `AI generated circular dependency involving nodes: ${dagCheck.cycleNodes.join(', ')}`
      );
    }

    // Require a warehouse-ready candidate. Never mutate model output after validation.
    if (!validated.tasks.some((task, index) => index > 0 && task.materials_in_warehouse)) {
      throw new Error('AI blueprint must contain a warehouse-ready task');
    }

    return validated;
  } catch (err) {
    throw new Error(`AI project blueprint generation failed: ${String(err)}`);
  }
}
