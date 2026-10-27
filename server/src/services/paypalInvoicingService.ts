/**
 * @file paypalInvoicingService.ts
 * @description Live PayPal Invoicing v2 REST client.
 *
 * Implements all 6 operations required by REQ-004 and REQ-009:
 * 1. createDraftInvoice  — POST /v2/invoicing/invoices
 * 2. sendInvoice         — POST /v2/invoicing/invoices/{id}/send
 * 3. getInvoice          — GET  /v2/invoicing/invoices/{id}
 * 4. updateInvoiceForPartialMaterialsUnlock — PUT /v2/invoicing/invoices/{id}
 * 5. generateInvoiceQrCode  — POST /v2/invoicing/invoices/{id}/generate-qr-code
 * 6. sendInvoiceReminder    — POST /v2/invoicing/invoices/{id}/remind
 *
 * All monetary values enter as integer minor units and are converted to
 * PayPal decimal strings ONLY inside this file (REQ-002, PAT-003).
 * Every outbound mutating POST carries a PayPal-Request-Id header (SEC-004).
 *
 * APIMatic-validated payload structures are used throughout (ARC-006).
 */

import { getPayPalAccessToken } from './paypalAuthService.js';
import { formatMinorToPayPalValue } from '../utils/moneyAndHash.js';
import { env } from '../config/env.js';

// ---------------------------------------------------------------------------
// PayPal Invoicing v2 Types (APIMatic-validated shapes — ARC-006)
// ---------------------------------------------------------------------------

export interface PayPalMoneyAmount {
  currency_code: string;
  value: string; // decimal string e.g. "1396.00"
}

export interface PayPalInvoicerInfo {
  name?: {
    given_name?: string;
    surname?: string;
  };
  email_address?: string;
  business_name?: string;
}

export interface PayPalRecipientInfo {
  email_address?: string;
  billing_info?: {
    name?: { full_name?: string };
    email_address?: string;
  };
}

export interface PayPalInvoiceItem {
  name: string;
  description?: string;
  quantity: string; // PayPal requires string
  unit_amount: PayPalMoneyAmount;
  unit_of_measure?: string;
}

export interface PayPalPartialPaymentConfig {
  allow_partial_payment: boolean;
  minimum_amount_due?: PayPalMoneyAmount;
}

export interface PayPalInvoiceConfiguration {
  partial_payment?: PayPalPartialPaymentConfig;
  allow_tip?: boolean;
  tax_calculated_after_discount?: boolean;
  tax_inclusive?: boolean;
}

export interface CreateInvoiceParams {
  /** Unique idempotency key (SEC-004) */
  requestId: string;
  invoicerBusinessName: string;
  invoicerEmail: string;
  recipientEmail: string;
  memo: string;
  currency: string;
  /** Line items — amounts in integer minor units internally */
  items: Array<{
    name: string;
    description?: string;
    quantity: number;
    unitPriceMinor: number;
  }>;
  /** ISO-8601 date string e.g. "2026-10-20" */
  dueDate?: string;
}

export interface PayPalInvoice {
  id: string;
  status: string;
  detail: {
    invoice_number?: string;
    invoice_date?: string;
    payment_term?: { due_date?: string };
    memo?: string;
    currency_code: string;
    metadata?: {
      recipient_view_url?: string;
      [key: string]: unknown;
    };
  };
  invoicer?: PayPalInvoicerInfo;
  primary_recipients?: PayPalRecipientInfo[];
  items?: PayPalInvoiceItem[];
  configuration?: PayPalInvoiceConfiguration;
  amount?: {
    breakdown?: { custom?: PayPalMoneyAmount };
    value?: string;
    currency_code?: string;
  };
  due_amount?: PayPalMoneyAmount;
  links?: Array<{ href: string; rel: string; method: string }>;
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

async function paypalRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PUT',
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
  const requestInit: RequestInit = {
    method,
    headers,
  };
  if (options.body !== undefined) {
    requestInit.body = JSON.stringify(options.body);
  }

  try {
    response = await fetch(url, requestInit);
  } catch (networkError) {
    throw new Error(
      `PayPalInvoicingService: network error [${method} ${url}]: ${String(networkError)}`
    );
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '(unreadable)');
    if (response.status === 403 && /NOT_AUTHORIZED|insufficient permissions/i.test(errorBody)) {
      throw new Error(
        `PayPal Invoicing permission denied for ${method} ${path}. ` +
        'Enable the Invoicing product for this Sandbox app and use credentials belonging to the Sandbox business merchant account. ' +
        `PayPal response: ${errorBody}`
      );
    }
    throw new Error(
      `PayPalInvoicingService: [${method} ${url}] returned HTTP ${response.status}: ${errorBody}`
    );
  }

  if (options.expectEmptyBody === true || response.status === 204) {
    return {} as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(
      `PayPalInvoicingService: failed to parse JSON response from [${method} ${url}]`
    );
  }
}

// ---------------------------------------------------------------------------
// 1. Create Draft Invoice
// ---------------------------------------------------------------------------

/**
 * Creates a draft PayPal Sandbox invoice.
 * Returns the full invoice object containing the real sandbox invoice_id.
 * (REQ-004, ARC-006, SEC-004)
 */
export async function createDraftInvoice(
  params: CreateInvoiceParams
): Promise<PayPalInvoice> {
  const payload = {
    detail: {
      currency_code: params.currency,
      memo: params.memo,
      ...(params.dueDate !== undefined && {
        payment_term: { due_date: params.dueDate },
      }),
    },
    invoicer: {
      business_name: params.invoicerBusinessName,
      email_address: params.invoicerEmail,
    },
    primary_recipients: [
      {
        billing_info: {
          email_address: params.recipientEmail,
        },
      },
    ],
    items: params.items.map((item) => ({
      name: item.name,
      ...(item.description !== undefined && { description: item.description }),
      quantity: String(item.quantity),
      unit_amount: {
        currency_code: params.currency,
        value: formatMinorToPayPalValue(item.unitPriceMinor, params.currency),
      },
      unit_of_measure: 'QUANTITY',
    })),
    configuration: {
      allow_tip: false,
      tax_calculated_after_discount: false,
      tax_inclusive: false,
    },
  };

  return paypalRequest<PayPalInvoice>('POST', '/v2/invoicing/invoices', {
    requestId: params.requestId,
    body: payload,
  });
}

// ---------------------------------------------------------------------------
// 2. Send Invoice
// ---------------------------------------------------------------------------

/**
 * Sends a draft invoice to the recipient, transitioning it to SENT/UNPAID state.
 * Required before QR code generation and reminders work (RISK-002).
 * (REQ-004)
 */
export async function sendInvoice(invoiceId: string): Promise<void> {
  await paypalRequest<Record<string, never>>(
    'POST',
    `/v2/invoicing/invoices/${invoiceId}/send`,
    {
      requestId: `cascade-send-${invoiceId}`,
      body: { send_to_invoicer: false, send_to_recipient: true },
      expectEmptyBody: true,
    }
  );
}

// ---------------------------------------------------------------------------
// 3. Get Invoice
// ---------------------------------------------------------------------------

/**
 * Retrieves the full invoice object from PayPal Sandbox by invoice_id.
 * Used to reconcile live status after webhook events.
 * (REQ-009)
 */
export async function getInvoice(invoiceId: string): Promise<PayPalInvoice> {
  return paypalRequest<PayPalInvoice>(
    'GET',
    `/v2/invoicing/invoices/${invoiceId}`
  );
}

// ---------------------------------------------------------------------------
// 4. Update Invoice for Partial Materials Unlock
// ---------------------------------------------------------------------------

/**
 * Updates a SENT PayPal invoice to enable partial payment with a minimum
 * materials-unlock threshold.
 *
 * Scenario A: Splits the $4,500 Phase 2 invoice so the client can pay
 * $1,396 immediately to unblock hardware delivery.
 *
 * PUT /v2/invoicing/invoices/{id} with allow_partial_payment: true
 * and minimum_amount_due set to unlockMinor.
 *
 * (REQ-009, SEC-004, ARC-006)
 */
export async function updateInvoiceForPartialMaterialsUnlock(
  invoiceId: string,
  /** Current full invoice payload retrieved via getInvoice() */
  currentInvoice: PayPalInvoice,
  unlockMinor: number,
  currency: string,
  note: string
): Promise<PayPalInvoice> {
  // PayPal rejects read-only fields returned by GET when they are sent back in PUT.
  const {
    id: _id,
    status: _status,
    links: _links,
    metadata: _metadata,
    invoice_number: _invoiceNumber,
    amount: _amount,
    due_amount: _dueAmount,
    ...mutableInvoice
  } = currentInvoice as PayPalInvoice & Record<string, unknown>;
  const { metadata: _detailMetadata, ...mutableDetail } = currentInvoice.detail;

  // Build an updated payload preserving only mutable invoice fields.
  const updatedPayload = {
    ...mutableInvoice,
    detail: {
      ...mutableDetail,
      memo: note,
    },
    configuration: {
      ...(currentInvoice.configuration ?? {}),
      partial_payment: {
        allow_partial_payment: true,
        minimum_amount_due: {
          currency_code: currency,
          value: formatMinorToPayPalValue(unlockMinor, currency),
        },
      },
    },
  };

  return paypalRequest<PayPalInvoice>(
    'PUT',
    `/v2/invoicing/invoices/${invoiceId}`,
    {
      requestId: `cascade-unlock-${invoiceId}`,
      body: updatedPayload,
    }
  );
}

// ---------------------------------------------------------------------------
// 5. Generate Invoice QR Code
// ---------------------------------------------------------------------------

export interface QrCodeResponse {
  /** Raw Base64-encoded PNG image data (no data: URI prefix) */
  qr_code_base64: string;
}

/**
 * Generates a real PayPal QR code for an invoice in SENT/UNPAID state.
 * Returns the Base64 PNG string for rendering in FriendlyNudgeScoreboardWidget.
 *
 * POST /v2/invoicing/invoices/{id}/generate-qr-code
 * Body: { width: 300, height: 300, action: "pay" }
 *
 * (REQ-009, CLI verification 7.3)
 */
export async function generateInvoiceQrCode(
  invoiceId: string
): Promise<QrCodeResponse> {
  return paypalRequest<QrCodeResponse>(
    'POST',
    `/v2/invoicing/invoices/${invoiceId}/generate-qr-code`,
    {
      requestId: `cascade-qr-${invoiceId}`,
      body: { width: 300, height: 300, action: 'pay' },
    }
  );
}

// ---------------------------------------------------------------------------
// 6. Send Invoice Reminder (Nudge-Bot)
// ---------------------------------------------------------------------------

/**
 * Sends an invoice reminder with a warm Nudge-Bot message.
 *
 * POST /v2/invoicing/invoices/{id}/remind
 * Body: { subject, note, send_to_invoicer: false, send_to_recipient: true }
 *
 * (REQ-009, GUD-003)
 */
export async function sendInvoiceReminder(
  invoiceId: string,
  subject: string,
  note: string
): Promise<void> {
  await paypalRequest<Record<string, never>>(
    'POST',
    `/v2/invoicing/invoices/${invoiceId}/remind`,
    {
      requestId: `cascade-remind-${invoiceId}`,
      body: {
        subject,
        note,
        send_to_invoicer: false,
        send_to_recipient: true,
      },
      expectEmptyBody: true,
    }
  );
}
