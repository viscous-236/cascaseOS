/**
 * @file paypalAgentToolkitBridge.ts
 * @description @paypal/agent-toolkit integration for the CascadeOS FinOps
 * and Nudge-Bot agent.
 *
 * Implements DEP-002 / TASK-014: Initializes the PayPal Agent Toolkit with
 * Sandbox credentials and exposes native PayPal agent tools for use by the
 * AG Studio FinOps agent and nudge service.
 *
 * Tools exposed from @paypal/agent-toolkit:
 * - list_invoices          — list invoices filtered by status/date
 * - get_invoice            — fetch a single invoice by ID
 * - send_invoice_reminder  — send a reminder with a custom note
 * - generate_invoice_qr_code — generate a Base64 QR code PNG
 * - get_merchant_insights  — aggregated FinOps statistics
 *
 * Security:
 * - Credentials loaded from env (SEC-001)
 * - Toolkit is Sandbox-only (CON-002)
 * - LLM is NEVER granted direct tool execution for create/capture (SEC-003)
 */

import { PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk';
import { env } from '../config/env.js';

// ---------------------------------------------------------------------------
// Toolkit instance (module singleton)
// ---------------------------------------------------------------------------

/**
 * Lazily initialized PayPal Agent Toolkit instance.
 * Use getPayPalAgentToolkit() — do not access _toolkit directly.
 */
let _toolkit: PayPalAgentToolkit | null = null;

/**
 * Returns (or creates) the singleton PayPal Agent Toolkit instance
 * configured for PayPal Sandbox.
 *
 * The toolkit is initialized with read-only + reminder operations.
 * Payment creation and capture are NOT delegated to the LLM (SEC-003).
 */
export function getPayPalAgentToolkit(): PayPalAgentToolkit {
  if (_toolkit !== null) {
    return _toolkit;
  }

  _toolkit = new PayPalAgentToolkit({
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
    configuration: {
      actions: {
        // Grant read and reminder capabilities only (SEC-003)
        invoices: { read: true, create: false, send: false, delete: false },
        orders: { read: true, create: false, capture: false },
        payments: { read: true },
        products: { read: true },
        subscriptions: { read: false },
        disputes: { read: true },
        shipment: { read: false, create: false },
        catalog: { read: true },
      },
    },
  });

  console.log('[PayPalAgentToolkit] Initialized for Sandbox environment (read + reminder only)');
  return _toolkit;
}

/**
 * Returns the array of AI SDK-compatible tool definitions for use in
 * OpenAI function-calling and AG Studio's directLlmRunner.
 *
 * Pass these tools to the LLM runner; they are read-only operations.
 * Payment mutation tools are handled directly by paypalOrdersService and
 * paypalInvoicingService (never via the LLM path — SEC-003).
 */
export function getPayPalAgentTools(): ReturnType<PayPalAgentToolkit['getTools']> {
  return getPayPalAgentToolkit().getTools();
}

/**
 * Clears the toolkit singleton. Primarily for testing.
 */
export function clearPayPalAgentToolkit(): void {
  _toolkit = null;
}
