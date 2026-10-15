/**
 * @file env.ts
 * @description Zod-validated environment configuration for CascadeOS server.
 *
 * This module is the ONLY place secrets are loaded from process.env.
 * It validates all required variables at startup and fails FAST with a
 * human-readable error if any are missing or invalid (SEC-001).
 *
 * NEVER import process.env directly anywhere else in the server codebase.
 */

import { config } from 'dotenv';
import { z } from 'zod';

// Load .env file (no-op in production where env vars are injected directly)
config();

const envSchema = z.object({
  // ─── Server ─────────────────────────────────────────────────────────────────
  PORT: z
    .string()
    .default('4000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().min(1).max(65535)),

  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  DATABASE_PATH: z.string().min(1).default('./data/cascade_os.sqlite'),

  // ─── PayPal Sandbox (CON-002: sandbox ONLY) ──────────────────────────────────
  PAYPAL_CLIENT_ID: z.string().min(1, 'PAYPAL_CLIENT_ID is required'),

  PAYPAL_CLIENT_SECRET: z.string().min(1, 'PAYPAL_CLIENT_SECRET is required'),

  /** Locked to sandbox — any other value is rejected at startup (CON-002) */
  PAYPAL_API_BASE_URL: z
    .string()
    .url()
    .default('https://api-m.sandbox.paypal.com')
    .refine(
      (url) => url === 'https://api-m.sandbox.paypal.com',
      'PAYPAL_API_BASE_URL MUST be the sandbox URL (https://api-m.sandbox.paypal.com). Production endpoints are forbidden (CON-002).'
    ),

  /** Optional locally; required for webhook signature verification (REQ-012) */
  PAYPAL_WEBHOOK_ID: z.string().optional(),

  PAYPAL_SANDBOX_MERCHANT_EMAIL: z
    .string()
    .email()
    .default('sb-merchant@business.example.com'),

  PAYPAL_SANDBOX_BUYER_EMAIL: z
    .string()
    .email()
    .default('sb-buyer@personal.example.com'),

  // ─── Channel3 ────────────────────────────────────────────────────────────────
  CHANNEL3_API_KEY: z.string().min(1, 'CHANNEL3_API_KEY is required'),

  CHANNEL3_API_BASE_URL: z
    .string()
    .url()
    .default('https://api.trychannel3.com/v0'),

  // ─── LLM ─────────────────────────────────────────────────────────────────────
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),

  OPENAI_MODEL: z.string().default('gpt-4o'),
});

/**
 * Parsed and validated environment configuration.
 * Fails fast at process startup if any required variable is missing.
 */
const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('❌  CascadeOS startup failed — invalid environment configuration:');
  console.error(parseResult.error.format());
  process.exit(1);
}

export const env = parseResult.data;

/** Convenience: true when running in the test environment */
export const isTest = env.NODE_ENV === 'test';

/** Convenience: true when running in production */
export const isProduction = env.NODE_ENV === 'production';
