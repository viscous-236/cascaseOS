/**
 * @file onboardingSchemas.ts
 * @description Zod validation schemas for Dynamic Multi-Tenant Project Onboarding,
 * AI Schedule Architect, and interactive Bryntum CRUD (TASK-103, SEC-102).
 */

import { z } from 'zod';

// =============================================================================
// REUSABLE SUB-SCHEMAS
// =============================================================================

const IsoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const ScheduleStatusEnum = z.enum([
  'COMPLETED',
  'SCHEDULED',
  'PAYMENT_BLOCKED',
  'READY_TO_PROMOTE',
  'BLOCKED_BY_DEPENDENCY',
  'REROUTED_ACTIVE',
  'MATERIALS_ORDERED',
]);

export const PayPalInvoiceStatusEnum = z.enum([
  'DRAFT',
  'SENT',
  'OVERDUE',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
]);

export const ManualTaskInputSchema = z.object({
  task_id: z.string().min(1).optional(),
  name: z.string().min(2),
  duration_days: z.number().int().positive(),
  start_date: z.string().regex(IsoDateRegex, 'Must be YYYY-MM-DD').optional(),
  end_date: z.string().regex(IsoDateRegex, 'Must be YYYY-MM-DD').optional(),
  materials_in_warehouse: z.boolean().default(false),
  crew_assigned: z.string().min(1).default('General Crew'),
  daily_idle_burn_minor: z.number().int().nonnegative().default(60000), // $600/day
  sla_delay_penalty_minor: z.number().int().nonnegative().default(0),
  phase_hardware_budget_max_minor: z.number().int().nonnegative().default(150000),
  schedule_status: ScheduleStatusEnum.default('SCHEDULED'),
  invoice_total_minor: z.number().int().nonnegative().default(0),
  materials_unlock_minor: z.number().int().nonnegative().default(0),
  deferred_labor_minor: z.number().int().nonnegative().default(0),
  sku_search_query: z.string().nullable().optional(),
  required_quantity: z.number().int().nonnegative().default(0),
  incumbent_vendor_name: z.string().nullable().optional(),
  incumbent_unit_price_minor: z.number().int().nonnegative().nullable().optional(),
  historical_unit_price_minor: z.number().int().nonnegative().nullable().optional(),
  max_allowed_variance_pct: z.number().default(10.0),
  create_live_paypal_invoice: z.boolean().default(false),
}).strict();

export const TaskDependencyInputSchema = z.object({
  from_task_id: z.string().min(1),
  to_task_id: z.string().min(1),
  lag_days: z.number().int().default(0),
}).strict();

// =============================================================================
// AI GENERATED BLUEPRINT SCHEMA (SEC-102)
// Enforces structured output formatting from projectArchitectAiService
// =============================================================================

export const AiTaskBlueprintSchema = z.object({
  task_id: z.string().min(1).describe('Unique slug ID, e.g. phase_1_framing'),
  name: z.string().min(2).describe('Clear descriptive phase title'),
  duration_days: z.number().int().min(1).max(30).describe('Duration in working days'),
  materials_in_warehouse: z
    .boolean()
    .describe('True if physical materials are already staged on-site; false if procurement required'),
  crew_assigned: z.string().min(2).describe('Specialist team or subcontractor name'),
  daily_idle_burn_minor: z
    .number()
    .int()
    .nonnegative()
    .describe('Daily crew idle burn rate in integer minor units (USD cents, e.g. 60000 = $600/d)'),
  sla_delay_penalty_minor: z
    .number()
    .int()
    .nonnegative()
    .describe('Liquidated damages SLA penalty in cents if milestone delayed (e.g. 144000 = $1,440)'),
  phase_hardware_budget_max_minor: z
    .number()
    .int()
    .nonnegative()
    .describe('Approved hardware cap in integer cents (e.g. 160000 = $1,600.00)'),
  invoice_total_minor: z
    .number()
    .int()
    .nonnegative()
    .describe('Client billing invoice total in cents (e.g. 450000 = $4,500.00)'),
  materials_unlock_minor: z
    .number()
    .int()
    .nonnegative()
    .describe('Partial materials payment unlock threshold in cents (e.g. 139600 = $1,396.00)'),
  deferred_labor_minor: z
    .number()
    .int()
    .nonnegative()
    .describe('Deferred labor portion in cents held until delivery (e.g. 310400 = $3,104.00)'),
  sku_search_query: z
    .string()
    .nullable()
    .describe('Search query for Channel3 live hardware discovery or null if labor-only service phase'),
  required_quantity: z
    .number()
    .int()
    .nonnegative()
    .describe('Number of hardware units required (e.g. 4 or 6)'),
  incumbent_vendor_name: z
    .string()
    .nullable()
    .describe('Name of incumbent vendor presenting price quote or null'),
  incumbent_unit_price_minor: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe('Incumbent unit price in cents showing +20% to +35% price-creep or null'),
  historical_unit_price_minor: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe('Historical baseline budget unit price in cents or null'),
  max_allowed_variance_pct: z
    .number()
    .default(10.0)
    .describe('Maximum allowed variance percentage above historical baseline before block'),
}).strict();

export const AiGeneratedProjectBlueprintSchema = z.object({
  project_name: z.string().min(3),
  currency: z.literal('USD'),
  tasks: z
    .array(AiTaskBlueprintSchema)
    .min(4)
    .max(8)
    .describe('4 to 8 sequential and parallel construction or studio buildout phases'),
  dependencies: z
    .array(TaskDependencyInputSchema)
    .describe('Directed finish-to-start dependencies linking upstream and downstream phases'),
}).strict();

export type AiGeneratedProjectBlueprint = z.infer<typeof AiGeneratedProjectBlueprintSchema>;

// =============================================================================
// POST /api/projects/create-custom REQUEST SCHEMA (REQ-102)
// =============================================================================

export const CreateCustomProjectSchema = z
  .object({
    mode: z.enum(['AI_ARCHITECT', 'MANUAL_STRUCTURED']),
    project_name: z.string().min(3),
    currency: z.enum(['USD']).default('USD'),
    start_date: z.string().regex(IsoDateRegex, 'Must be YYYY-MM-DD'),
    client_name: z.string().min(2),
    client_email: z.string().email(),
    ai_prompt: z.string().min(10).optional(),
    tasks: z.array(ManualTaskInputSchema).optional(),
    dependencies: z.array(TaskDependencyInputSchema).optional(),
    create_live_paypal_invoices: z.boolean().default(true),
    run_live_channel3_audit: z.boolean().default(true),
  })
  .strict()
  .refine(
    (data) => {
      if (data.mode === 'AI_ARCHITECT') {
        return typeof data.ai_prompt === 'string' && data.ai_prompt.trim().length >= 10;
      }
      if (data.mode === 'MANUAL_STRUCTURED') {
        return Array.isArray(data.tasks) && data.tasks.length >= 2;
      }
      return false;
    },
    {
      message:
        'AI_ARCHITECT mode requires an ai_prompt (min 10 chars); MANUAL_STRUCTURED requires at least 2 tasks.',
    }
  );

export type CreateCustomProjectInput = z.infer<typeof CreateCustomProjectSchema>;

// =============================================================================
// TASK & DEPENDENCY CRUD SCHEMAS (REQ-105)
// =============================================================================

export const UpsertTaskSchema = z.object({
  task_id: z.string().min(1).optional(),
  name: z.string().min(2).optional(),
  start_date: z.string().regex(IsoDateRegex).optional(),
  end_date: z.string().regex(IsoDateRegex).optional(),
  duration_days: z.number().int().positive().optional(),
  materials_in_warehouse: z.boolean().optional(),
  crew_assigned: z.string().min(1).optional(),
  daily_idle_burn_minor: z.number().int().nonnegative().optional(),
  sla_delay_penalty_minor: z.number().int().nonnegative().optional(),
  phase_hardware_budget_max_minor: z.number().int().nonnegative().optional(),
  schedule_status: ScheduleStatusEnum.optional(),
  paypal_invoice_status: PayPalInvoiceStatusEnum.optional(),
  invoice_total_minor: z.number().int().nonnegative().optional(),
  materials_unlock_minor: z.number().int().nonnegative().optional(),
  deferred_labor_minor: z.number().int().nonnegative().optional(),
  sku_search_query: z.string().nullable().optional(),
  required_quantity: z.number().int().nonnegative().optional(),
  incumbent_vendor_name: z.string().nullable().optional(),
  incumbent_unit_price_minor: z.number().int().nonnegative().nullable().optional(),
  historical_unit_price_minor: z.number().int().nonnegative().nullable().optional(),
  max_allowed_variance_pct: z.number().optional(),
  create_live_paypal_invoice: z.boolean().optional(),
  run_live_channel3_audit: z.boolean().optional(),
}).strict();

export type UpsertTaskInput = z.infer<typeof UpsertTaskSchema>;

export const CreateDependencySchema = z.object({
  from_task_id: z.string().min(1),
  to_task_id: z.string().min(1),
  lag_days: z.number().int().default(0),
}).strict();

export type CreateDependencyInput = z.infer<typeof CreateDependencySchema>;
