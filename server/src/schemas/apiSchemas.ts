/**
 * @file apiSchemas.ts
 * @description Strict runtime validation schemas for CascadeOS Express API endpoints (TASK-019, SEC-005).
 *
 * Implements:
 * - SEC-005: Strict input validation on all request parameters, bodies, and query strings.
 * - PAT-006: Fail-closed validation for missing or invalid inputs.
 * - Negative and floating-point money amounts fail validation.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// 1. Projects & Health Schemas
// ---------------------------------------------------------------------------

export const bootstrapProjectSchema = z.object({
  body: z
    .object({
      forceReset: z.boolean().optional().default(false),
      skipPayPal: z.boolean().optional().default(false),
      skipChannel3: z.boolean().optional().default(false),
    })
    .strict()
    .default({}),
}).strict();

export const getProjectStateSchema = z.object({
  params: z.object({
    projectId: z.string().min(1, 'projectId is required'),
  }).strict(),
}).strict();

// ---------------------------------------------------------------------------
// 2. Scenario Trigger Schema
// ---------------------------------------------------------------------------

export const triggerScenarioSchema = z.object({
  params: z.object({
    scenarioId: z.enum(['SCENARIO_A', 'SCENARIO_B', 'SCENARIO_C'], {
      errorMap: () => ({
        message: "scenarioId must be 'SCENARIO_A', 'SCENARIO_B', or 'SCENARIO_C'",
      }),
    }),
  }).strict(),
  body: z
    .object({
      projectId: z.string().optional(),
      targetTaskId: z.string().optional(),
      forceRefresh: z.boolean().optional().default(false),
    })
    .strict()
    .default({}),
}).strict();

// ---------------------------------------------------------------------------
// 3. Recovery Plan Approval Schema
// ---------------------------------------------------------------------------

export const approvePlanSchema = z.object({
  params: z.object({
    planId: z.string().min(1, 'planId is required'),
  }).strict(),
  body: z.object({
    approvedFingerprint: z
      .string()
      .regex(/^(sha256:)?[a-f0-9]{64}$/i, 'approvedFingerprint must be a valid SHA-256 fingerprint'),
    approverActor: z.string().min(1, 'approverActor is required'),
    customNudgeNote: z.string().max(1000).optional(),
  }).strict(),
}).strict();

// ---------------------------------------------------------------------------
// 4. PayPal Orders Schemas
// ---------------------------------------------------------------------------

export const createPayPalOrderSchema = z.object({
  body: z.object({
    planId: z.string().min(1, 'planId is required'),
    taskId: z.string().min(1, 'taskId is required'),
    quoteId: z.string().min(1, 'quoteId is required'),
    approvedFingerprint: z
      .string()
      .regex(/^(sha256:)?[a-f0-9]{64}$/i, 'approvedFingerprint must be a valid SHA-256 fingerprint'),
  }).strict(),
}).strict();

export const capturePayPalOrderSchema = z.object({
  params: z.object({
    orderId: z.string().min(1, 'orderId is required'),
  }).strict(),
  body: z.object({
    taskId: z.string().min(1, 'taskId is required'),
    planId: z.string().optional(),
  }).strict(),
}).strict();

// ---------------------------------------------------------------------------
// 5. Studio Agent Chat Schema
// ---------------------------------------------------------------------------

export const studioAgentChatSchema = z.object({
  body: z.object({
    message: z.string().min(1, 'message must not be empty').max(2000),
    conversationHistory: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant', 'system']),
          content: z.string(),
        })
      )
      .optional()
      .default([]),
    projectId: z.string().optional(),
    activeTaskId: z.string().optional(),
  }).strict(),
}).strict();
