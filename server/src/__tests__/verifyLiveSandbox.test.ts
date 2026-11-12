import { describe, expect, it, vi } from 'vitest';
import {
  runLiveSandboxVerification,
  type LiveSandboxVerifierDeps,
} from '../scripts/verifyLiveSandbox.js';
import { env } from '../config/env.js';

function sentInvoice() {
  return {
    id: 'INV2-ABC123',
    status: 'SENT',
    detail: {
      invoice_number: 'INV-0001',
      metadata: { recipient_view_url: 'https://www.sandbox.paypal.com/invoice/p/#ABC123' },
    },
    configuration: {
      partial_payment: {
        allow_partial_payment: true,
        minimum_amount_due: { currency_code: 'USD', value: '1396.00' },
      },
    },
  };
}

function successfulDeps(): LiveSandboxVerifierDeps {
  return {
    getPayPalAccessToken: vi.fn().mockResolvedValue('A21AA-live-token'),
    createDraftInvoice: vi.fn().mockResolvedValue({
      id: 'INV2-ABC123',
      status: 'DRAFT',
      detail: { invoice_number: 'INV-0001' },
    }),
    sendInvoice: vi.fn().mockResolvedValue(undefined),
    getInvoice: vi.fn().mockResolvedValue(sentInvoice()),
    updateInvoiceForPartialMaterialsUnlock: vi.fn().mockResolvedValue(sentInvoice()),
    generateInvoiceQrCode: vi.fn().mockResolvedValue({
      qr_code_base64: 'iVBORw0KGgoAAAANSUhEUgAAASwAAAEsAQAAAABRBrPY',
    }),
    sendInvoiceReminder: vi.fn().mockResolvedValue(undefined),
    createSupplierOrder: vi.fn().mockResolvedValue({
      id: '5O190127TN364715T',
      status: 'CREATED',
    }),
    searchChannel3Products: vi.fn().mockResolvedValue({
      products: [
        {
          id: 'ch3_prod_trane_xr14',
          title: 'Trane XR14 Commercial Compressor',
          brands: [{ name: 'Trane' }],
          offers: [{ domain: 'hvac.example.com', price: { price: 349 } }],
        },
      ],
    }),
    persistOrder: vi.fn(),
    persistQuote: vi.fn(),
  };
}

describe('verifyLiveSandbox', () => {
  it('returns a verified report only after every live integration succeeds', async () => {
    const deps = successfulDeps();
    const log = vi.fn();

    const report = await runLiveSandboxVerification(deps, log);

    expect(report.invoiceId).toBe('INV2-ABC123');
    expect(report.invoiceStatus).toBe('SENT');
    expect(report.partialPaymentEnabled).toBe(true);
    expect(report.partialPaymentMinimum).toBe('1396.00');
    expect(report.qrCodeBase64Length).toBeGreaterThan(0);
    expect(report.reminderSent).toBe(true);
    expect(report.orderId).toBe('5O190127TN364715T');
    expect(report.orderStatus).toBe('CREATED');
    expect(report.orderPersisted).toBe(true);
    expect(report.channel3ProductCount).toBe(1);
    expect(report.channel3Price).toBe(349);
    expect(report.quotePersisted).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('SUCCESS'));

    expect(deps.createDraftInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        invoicerEmail: env.PAYPAL_SANDBOX_MERCHANT_EMAIL,
        recipientEmail: env.PAYPAL_SANDBOX_BUYER_EMAIL,
      })
    );
    expect(deps.sendInvoice).toHaveBeenCalledWith('INV2-ABC123');
    expect(deps.generateInvoiceQrCode).toHaveBeenCalledWith('INV2-ABC123');
    expect(deps.sendInvoiceReminder).toHaveBeenCalledWith(
      'INV2-ABC123',
      expect.any(String),
      expect.any(String)
    );
    expect(deps.persistOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: '5O190127TN364715T',
        status: 'CREATED',
        amountMinor: 139600,
        currency: 'USD',
      })
    );
    expect(deps.persistQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        externalProductId: 'ch3_prod_trane_xr14',
        unitPriceMinor: 34900,
        totalMinor: 34900,
      })
    );
  });

  it('fails closed when PayPal returns an order that is not CREATED', async () => {
    const deps = successfulDeps();
    deps.createSupplierOrder = vi.fn().mockResolvedValue({
      id: '5O190127TN364715T',
      status: 'COMPLETED',
    });

    await expect(runLiveSandboxVerification(deps, vi.fn())).rejects.toThrow(
      /expected CREATED status/i
    );
    expect(deps.persistOrder).not.toHaveBeenCalled();
  });

  it('fails closed when order persistence throws', async () => {
    const deps = successfulDeps();
    deps.persistOrder = vi.fn().mockImplementation(() => {
      throw new Error('FK constraint failed');
    });

    await expect(runLiveSandboxVerification(deps, vi.fn())).rejects.toThrow(
      /order persistence failed/i
    );
  });

  it('fails closed when the Channel3 product has no external ID', async () => {
    const deps = successfulDeps();
    deps.searchChannel3Products = vi.fn().mockResolvedValue({
      products: [
        {
          title: 'Unidentified product',
          offers: [{ domain: 'shop.example.com', price: { price: 349 } }],
        },
      ],
    });

    await expect(runLiveSandboxVerification(deps, vi.fn())).rejects.toThrow(
      /external product ID/i
    );
    expect(deps.persistQuote).not.toHaveBeenCalled();
  });

  it('fails closed when PayPal invoice creation fails', async () => {
    const deps = successfulDeps();
    deps.createDraftInvoice = vi.fn().mockRejectedValue(new Error('invoicing disabled'));
    const log = vi.fn();

    await expect(runLiveSandboxVerification(deps, log)).rejects.toThrow(
      /invoice verification failed/i
    );
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('SUCCESS'));
  });

  it('fails closed when the invoice cannot be sent', async () => {
    const deps = successfulDeps();
    deps.sendInvoice = vi.fn().mockRejectedValue(new Error('recipient country blocked'));

    await expect(runLiveSandboxVerification(deps, vi.fn())).rejects.toThrow(
      /invoice send verification failed/i
    );
  });

  it('fails closed when partial payment cannot be enabled', async () => {
    const deps = successfulDeps();
    deps.updateInvoiceForPartialMaterialsUnlock = vi
      .fn()
      .mockRejectedValue(new Error('Partial payments are not available in your country'));

    await expect(runLiveSandboxVerification(deps, vi.fn())).rejects.toThrow(
      /partial payment verification failed/i
    );
  });

  it('fails closed when the QR code is empty', async () => {
    const deps = successfulDeps();
    deps.generateInvoiceQrCode = vi.fn().mockResolvedValue({ qr_code_base64: '' });

    await expect(runLiveSandboxVerification(deps, vi.fn())).rejects.toThrow(
      /QR code verification failed/i
    );
  });

  it('fails closed when the reminder cannot be sent', async () => {
    const deps = successfulDeps();
    deps.sendInvoiceReminder = vi.fn().mockRejectedValue(new Error('remind failed'));

    await expect(runLiveSandboxVerification(deps, vi.fn())).rejects.toThrow(
      /reminder verification failed/i
    );
  });

  it('rejects fallback invoice IDs instead of reporting a live verification', async () => {
    const deps = successfulDeps();
    deps.createDraftInvoice = vi.fn().mockResolvedValue({
      id: 'INV2-FALLBACK-035188',
      status: 'DRAFT',
      detail: { invoice_number: 'INV-0001' },
    });

    await expect(runLiveSandboxVerification(deps, vi.fn())).rejects.toThrow(
      /fallback|live invoice/i
    );
  });

  it('fails when Channel3 returns no priced product', async () => {
    const deps = successfulDeps();
    deps.searchChannel3Products = vi.fn().mockResolvedValue({
      products: [{ title: 'Unpriced product', offers: [] }],
    });

    await expect(runLiveSandboxVerification(deps, vi.fn())).rejects.toThrow(
      /priced product|channel3/i
    );
  });
});
