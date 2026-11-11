import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  PAYPAL_INVOICING_SCOPE,
  clearPayPalTokenCache,
  getPayPalAccessToken,
  getPayPalInvoicingAccessToken,
} from '../services/paypalAuthService.js';
import { createDraftInvoice } from '../services/paypalInvoicingService.js';

const originalFetch = globalThis.fetch;

function tokenResponse(accessToken: string, scope: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope,
    }),
  };
}

function requestBody(call: unknown[]): URLSearchParams {
  return new URLSearchParams(String((call[1] as RequestInit).body));
}

beforeEach(() => {
  clearPayPalTokenCache();
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearPayPalTokenCache();
});

describe('PayPal Invoicing token scope', () => {
  it('requests the Invoicing scope for the invoicing token', async () => {
    const mockFetch = vi.fn().mockResolvedValue(tokenResponse('INVOICING_TOKEN', PAYPAL_INVOICING_SCOPE));
    globalThis.fetch = mockFetch;

    const token = await getPayPalInvoicingAccessToken();

    expect(token).toBe('INVOICING_TOKEN');
    const body = requestBody(mockFetch.mock.calls[0]!);
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('scope')).toBe(PAYPAL_INVOICING_SCOPE);
  });

  it('keeps the default token and invoicing token in separate caches', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse('DEFAULT_TOKEN', ''))
      .mockResolvedValueOnce(tokenResponse('INVOICING_TOKEN', PAYPAL_INVOICING_SCOPE));
    globalThis.fetch = mockFetch;

    expect(await getPayPalAccessToken()).toBe('DEFAULT_TOKEN');
    expect(await getPayPalInvoicingAccessToken()).toBe('INVOICING_TOKEN');
    expect(await getPayPalAccessToken()).toBe('DEFAULT_TOKEN');
    expect(await getPayPalInvoicingAccessToken()).toBe('INVOICING_TOKEN');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(requestBody(mockFetch.mock.calls[0]!).get('scope')).toBeNull();
    expect(requestBody(mockFetch.mock.calls[1]!).get('scope')).toBe(PAYPAL_INVOICING_SCOPE);
  });

  it('creates invoices with the Invoicing-scoped token', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse('INVOICING_TOKEN', PAYPAL_INVOICING_SCOPE))
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: 'INV2-LIVE-SCOPED', status: 'DRAFT' }),
      });
    globalThis.fetch = mockFetch;

    const invoice = await createDraftInvoice({
      requestId: 'req-scoped-token-001',
      invoicerBusinessName: 'CascadeOS',
      invoicerEmail: 'merchant@example.com',
      recipientEmail: 'buyer@example.com',
      memo: 'Scoped token verification',
      currency: 'USD',
      items: [{ name: 'Verification item', quantity: 1, unitPriceMinor: 100 }],
    });

    expect(invoice.id).toBe('INV2-LIVE-SCOPED');
    expect(requestBody(mockFetch.mock.calls[0]!).get('scope')).toBe(PAYPAL_INVOICING_SCOPE);

    const invoiceHeaders = (mockFetch.mock.calls[1]![1] as RequestInit).headers as Record<string, string>;
    expect(invoiceHeaders.Authorization).toBe('Bearer INVOICING_TOKEN');
  });

  it('follows the 201 self link to return the full created invoice', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse('INVOICING_TOKEN', PAYPAL_INVOICING_SCOPE))
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          rel: 'self',
          href: 'https://api.sandbox.paypal.com/v2/invoicing/invoices/INV2-LINK-ONLY',
          method: 'GET',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'INV2-LINK-ONLY',
          status: 'DRAFT',
          detail: { currency_code: 'USD', memo: 'Link response invoice' },
        }),
      });
    globalThis.fetch = mockFetch;

    const invoice = await createDraftInvoice({
      requestId: 'req-link-response-001',
      invoicerBusinessName: 'CascadeOS',
      invoicerEmail: 'merchant@example.com',
      recipientEmail: 'buyer@example.com',
      memo: 'Link response invoice',
      currency: 'USD',
      items: [{ name: 'Verification item', quantity: 1, unitPriceMinor: 100 }],
    });

    expect(invoice.id).toBe('INV2-LINK-ONLY');
    expect(invoice.status).toBe('DRAFT');

    const [fetchUrl, fetchInit] = mockFetch.mock.calls[2] as [string, RequestInit];
    expect(fetchUrl).toBe('https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV2-LINK-ONLY');
    expect(fetchInit.method).toBe('GET');
  });

  it('rejects a create response that contains neither an invoice ID nor a self link', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse('INVOICING_TOKEN', PAYPAL_INVOICING_SCOPE))
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ rel: 'self', method: 'GET' }),
      });
    globalThis.fetch = mockFetch;

    await expect(
      createDraftInvoice({
        requestId: 'req-link-missing-001',
        invoicerBusinessName: 'CascadeOS',
        invoicerEmail: 'merchant@example.com',
        recipientEmail: 'buyer@example.com',
        memo: 'Missing link',
        currency: 'USD',
        items: [{ name: 'Verification item', quantity: 1, unitPriceMinor: 100 }],
      })
    ).rejects.toThrow(/invoice ID/i);
  });

  it('clears the invoicing token cache', async () => {
    const mockFetch = vi.fn().mockResolvedValue(tokenResponse('INVOICING_TOKEN', PAYPAL_INVOICING_SCOPE));
    globalThis.fetch = mockFetch;

    await getPayPalInvoicingAccessToken();
    clearPayPalTokenCache();
    await getPayPalInvoicingAccessToken();

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
