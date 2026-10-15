/**
 * @file paypalOrdersService.ts
 * @description Live PayPal Orders v2 REST client for supplier arbitrage checkout.
 *
 * Implements:
 * - REQ-010: createSupplierOrder with PayPal-Request-Id idempotency header (SEC-004)
 * - REQ-011: captureSupplierOrder — only transitions state when status === 'COMPLETED'
 * - getOrderDetails for status polling
 *
 * All monetary amounts are passed as integer minor units and converted to
 * PayPal decimal strings exclusively inside this file (REQ-002, PAT-003).
 * Every raw PayPal response is returned to the caller for persistence in
 * paypal_transactions (REQ-010).
 */

import { getPayPalAccessToken } from './paypalAuthService.js';
import { formatMinorToPayPalValue } from '../utils/moneyAndHash.js';
import { env } from '../config/env.js';

// ---------------------------------------------------------------------------
// Types (APIMatic-validated — ARC-006)
// ---------------------------------------------------------------------------

export interface CreateOrderParams {
  /** Unique plan ID used as the PayPal-Request-Id (SEC-004) */
  planId: string;
  /** Task ID that will receive the materials */
  taskId: string;
  /** Total amount in integer minor units */
  totalMinor: number;
  currency: string;
  /** Human-readable description of what is being purchased */
  description: string;
  /** Channel3 product title for line-item display */
  productTitle: string;
  /** Quantity of units ordered */
  quantity: number;
  /** Unit price in integer minor units */
  unitPriceMinor: number;
  /** Optional: the unique invoice reference shown to the buyer */
  invoiceReference?: string;
}

export interface PayPalOrderCapture {
  id: string;
  status: string;
  purchase_units: Array<{
    reference_id: string;
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
        amount: { currency_code: string; value: string };
        final_capture?: boolean;
        create_time?: string;
      }>;
    };
  }>;
  create_time?: string;
  update_time?: string;
}

export interface PayPalOrderDetails {
  id: string;
  status: string;
  intent?: string;
  purchase_units?: Array<{
    reference_id?: string;
    description?: string;
    custom_id?: string;
    invoice_id?: string;
    amount: { currency_code: string; value: string };
    items?: Array<{
      name: string;
      quantity: string;
      unit_amount: { currency_code: string; value: string };
    }>;
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
        amount: { currency_code: string; value: string };
      }>;
    };
  }>;
  links?: Array<{ href: string; rel: string; method: string }>;
  create_time?: string;
  update_time?: string;
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

async function ordersRequest<T = unknown>(
  method: 'GET' | 'POST',
  path: string,
  options: {
    requestId?: string;
    body?: unknown;
    expectEmptyBody?: boolean;
  } = {}
): Promise<T> {
  const token = await getPayPalAccessToken();
  const url = `${env.PAYPAL_API_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'PayPal-Partner-Attribution-Id': 'CascadeOS-Hackathon-2026',
  };

  if (options.requestId !== undefined) {
    headers['PayPal-Request-Id'] = options.requestId;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (networkError) {
    throw new Error(
      `PayPalOrdersService: network error [${method} ${url}]: ${String(networkError)}`
    );
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '(unreadable)');
    throw new Error(
      `PayPalOrdersService: [${method} ${url}] returned HTTP ${response.status}: ${errorBody}`
    );
  }

  if (options.expectEmptyBody === true || response.status === 204) {
    return {} as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(
      `PayPalOrdersService: failed to parse JSON response from [${method} ${url}]`
    );
  }
}

// ---------------------------------------------------------------------------
// 1. Create Supplier Order
// ---------------------------------------------------------------------------

/**
 * Creates a PayPal Orders v2 CAPTURE-intent order for the approved Channel3
 * supplier quote.
 *
 * Returns the raw PayPal order response (id + status) for persistence.
 * The PayPal-Request-Id is derived from planId to ensure idempotency on retries.
 *
 * (REQ-010, SEC-004)
 */
export async function createSupplierOrder(
  params: CreateOrderParams
): Promise<PayPalOrderDetails> {
  const payload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: params.taskId,
        description: params.description,
        custom_id: params.planId,
        ...(params.invoiceReference !== undefined && {
          invoice_id: params.invoiceReference,
        }),
        amount: {
          currency_code: params.currency,
          value: formatMinorToPayPalValue(params.totalMinor, params.currency),
          breakdown: {
            item_total: {
              currency_code: params.currency,
              value: formatMinorToPayPalValue(
                params.unitPriceMinor * params.quantity,
                params.currency
              ),
            },
          },
        },
        items: [
          {
            name: params.productTitle,
            description: params.description,
            quantity: String(params.quantity),
            unit_amount: {
              currency_code: params.currency,
              value: formatMinorToPayPalValue(
                params.unitPriceMinor,
                params.currency
              ),
            },
            category: 'PHYSICAL_GOODS',
          },
        ],
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
          brand_name: 'CascadeOS Supplier Arbitrage',
          landing_page: 'LOGIN',
          user_action: 'PAY_NOW',
          return_url: 'https://cascadeos.app/paypal/success',
          cancel_url: 'https://cascadeos.app/paypal/cancel',
        },
      },
    },
  };

  return ordersRequest<PayPalOrderDetails>('POST', '/v2/checkout/orders', {
    requestId: `cascade-order-${params.planId}`,
    body: payload,
  });
}

// ---------------------------------------------------------------------------
// 2. Capture Supplier Order
// ---------------------------------------------------------------------------

/**
 * Captures a previously approved PayPal order.
 *
 * IMPORTANT (REQ-011): The caller MUST verify that the returned
 * capture object has status === 'COMPLETED' and a non-empty
 * purchase_units[0].payments.captures[0].id before transitioning
 * task state to MATERIALS_ORDERED.
 *
 * (REQ-011)
 */
export async function captureSupplierOrder(
  orderId: string
): Promise<PayPalOrderCapture> {
  return ordersRequest<PayPalOrderCapture>(
    'POST',
    `/v2/checkout/orders/${orderId}/capture`,
    {
      requestId: `cascade-capture-${orderId}`,
      body: {}, // empty body required for capture
    }
  );
}

// ---------------------------------------------------------------------------
// 3. Get Order Details
// ---------------------------------------------------------------------------

/**
 * Retrieves the current state of a PayPal order.
 * Used for status polling and reconciliation after webhook events.
 */
export async function getOrderDetails(
  orderId: string
): Promise<PayPalOrderDetails> {
  return ordersRequest<PayPalOrderDetails>(
    'GET',
    `/v2/checkout/orders/${orderId}`
  );
}
