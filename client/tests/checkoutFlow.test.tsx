// @vitest-environment jsdom
/**
 * @file checkoutFlow.test.tsx
 * @description TEST-014 browser contract: the approval modal must create and
 * capture the supplier order through the CascadeOS backend (REQ-010, REQ-011).
 *
 * The PayPal JS SDK is mocked at the component boundary. The real modal code,
 * including its createOrder/onApprove handlers, executes unmodified.
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApprovalCheckoutModal } from '../src/components/ApprovalCheckoutModal';

const paypalActions = vi.hoisted(() => ({
  create: vi.fn(),
  capture: vi.fn(),
}));

const contextRef = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

const toastMock = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
    loading: vi.fn(),
  })
);

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

vi.mock('../src/context/CascadeStateContext', () => ({
  useCascadeState: () => contextRef.current,
}));

vi.mock('@paypal/react-paypal-js', () => ({
  PayPalScriptProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PayPalButtons: (props: any) => (
    <button
      data-testid="paypal-submit"
      onClick={async () => {
        const actions = { order: paypalActions };
        try {
          const orderId = await props.createOrder({}, actions);
          await props.onApprove({ orderID: orderId }, actions);
        } catch (error) {
          props.onError?.(error);
        }
      }}
    >
      PayPal Sandbox Checkout
    </button>
  ),
}));

const plan = {
  plan_id: 'plan_reroute_test_01',
  project_id: 'proj_apex_clinic_01',
  blocked_task_id: 'task_phase_2_displays',
  promoted_task_id: 'task_phase_3_networking',
  selected_quote_id: 'quote_test_01',
  state_fingerprint: `sha256:${'a'.repeat(64)}`,
  policy_decision: 'REQUIRE_APPROVAL',
  reason_codes_json: '["MATERIALS_NOT_IN_WAREHOUSE"]',
  idle_crew_hours: 56,
  idle_labor_cost_minor: 366000,
  sla_penalty_minor: 144000,
  total_exposure_minor: 510000,
  new_promoted_start_date: '2026-10-16',
  new_blocked_start_date: '2026-10-20',
  immediate_unlock_minor: 139600,
  deferred_labor_minor: 310400,
  nudge_draft_text: 'Approve the materials unlock to release hardware.',
  status: 'PROPOSED',
  created_at: '2026-11-11T00:00:00.000Z',
};

const blockedTask = {
  task_id: 'task_phase_2_displays',
  project_id: 'proj_apex_clinic_01',
  name: 'Display Installation',
  start_date: '2026-10-14',
  end_date: '2026-10-20',
  duration_days: 5,
  materials_in_warehouse: 0,
  crew_assigned: 'AV Crew',
  daily_idle_burn_minor: 60000,
  sla_delay_penalty_minor: 144000,
  phase_hardware_budget_max_minor: 160000,
  schedule_status: 'PAYMENT_BLOCKED',
  paypal_invoice_id: 'INV2-TEST-0001',
  paypal_invoice_number: 'INV-002',
  paypal_invoice_view_url: 'https://www.sandbox.paypal.com/invoice/p/#INV2-TEST-0001',
  paypal_invoice_status: 'OVERDUE',
  invoice_total_minor: 450000,
  materials_unlock_minor: 139600,
  deferred_labor_minor: 310400,
  client_name: 'Apex Clinic',
  client_email: 'client@example.com',
  qr_code_base64: null,
  last_nudge_message: null,
  last_nudge_sent_at: null,
  sku_search_query: '32 inch 4K display',
  required_quantity: 4,
  incumbent_vendor_name: 'Incumbent AV',
  incumbent_unit_price_minor: 49000,
  historical_unit_price_minor: 34900,
  max_allowed_variance_pct: 10,
  version: 1,
};

const promotedTask = {
  ...blockedTask,
  task_id: 'task_phase_3_networking',
  name: 'Network Fitout',
  materials_in_warehouse: 1,
  schedule_status: 'READY_TO_PROMOTE',
};

const quote = {
  quote_id: 'quote_test_01',
  task_id: 'task_phase_2_displays',
  source_type: 'CHANNEL3_LIVE',
  external_product_id: 'ch3-display-349',
  product_title: '32 inch 4K UHD IPS Monitor',
  merchant_name: 'Verified Supplier',
  product_url: 'https://supplier.example.com/display',
  image_url: null,
  currency: 'USD',
  unit_price_minor: 34900,
  quantity: 4,
  shipping_minor: 0,
  tax_minor: 0,
  total_minor: 139600,
  variance_vs_historical_pct: -8.16,
  savings_vs_incumbent_minor: 56400,
  availability_status: 'IN_STOCK',
  observed_at: '2026-11-11T00:00:00.000Z',
};

function buildContext(overrides: Record<string, unknown> = {}) {
  return {
    isApprovalModalOpen: true,
    closeApprovalModal: vi.fn(),
    activePlan: plan,
    state: {
      project: { project_id: 'proj_apex_clinic_01', name: 'Apex', currency: 'USD' },
      tasks: [blockedTask, promotedTask],
      dependencies: [{ dependency_id: 'd1', from_task_id: 'task_phase_1_wiring', to_task_id: 'task_phase_3_networking', lag_days: 0 }],
      supplierQuotes: [quote],
      recoveryPlans: [plan],
      userApprovals: [],
      paypalTransactions: [],
      auditEvents: [],
    },
    approvePlan: vi.fn().mockResolvedValue(true),
    createSupplierOrder: vi.fn().mockResolvedValue({
      success: true,
      paypalOrderId: 'ORDER-BACKEND-1',
      status: 'CREATED',
      totalMinor: 139600,
      currency: 'USD',
    }),
    captureSupplierOrder: vi.fn().mockResolvedValue({
      success: true,
      orderId: 'ORDER-BACKEND-1',
      captureId: 'CAPTURE-9XY12345',
      status: 'COMPLETED',
      task: { ...blockedTask, schedule_status: 'MATERIALS_ORDERED' },
    }),
    refreshState: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function openPayPalStep() {
  render(<ApprovalCheckoutModal />);
  fireEvent.click(screen.getByText('2. Live PayPal Checkout'));
  const button = await screen.findByTestId('paypal-submit');
  fireEvent.click(button);
  return button;
}

describe('TEST-014 browser checkout backend wiring', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PAYPAL_CLIENT_ID', 'sandbox-client-id');
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    paypalActions.create.mockReset();
    paypalActions.capture.mockReset();
    toastMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('signs the plan, creates the backend order, then captures by backend order ID', async () => {
    const context = buildContext();
    contextRef.current = context;

    await openPayPalStep();

    await waitFor(() => expect(context.createSupplierOrder).toHaveBeenCalledTimes(1));
    expect(context.approvePlan).toHaveBeenCalledWith(
      'VP of Construction FinOps',
      undefined,
      { closeModal: false }
    );
    expect(context.createSupplierOrder).toHaveBeenCalledWith({
      planId: 'plan_reroute_test_01',
      taskId: 'task_phase_2_displays',
      quoteId: 'quote_test_01',
      approvedFingerprint: plan.state_fingerprint,
      expectedTotalMinor: 139600,
    });

    await waitFor(() =>
      expect(context.captureSupplierOrder).toHaveBeenCalledWith(
        'ORDER-BACKEND-1',
        'task_phase_2_displays',
        undefined
      )
    );

    // The browser must never mutate the PayPal order directly through the SDK.
    expect(paypalActions.create).not.toHaveBeenCalled();
    expect(paypalActions.capture).not.toHaveBeenCalled();

    expect(await screen.findByText('Plan Approved & Schedule Rerouted!')).toBeTruthy();
    expect(context.refreshState).toHaveBeenCalledWith(true);
  });

  it('skips re-approval when the plan is already APPROVED', async () => {
    const context = buildContext({ activePlan: { ...plan, status: 'APPROVED' } });
    contextRef.current = context;

    await openPayPalStep();

    await waitFor(() => expect(context.createSupplierOrder).toHaveBeenCalledTimes(1));
    expect(context.approvePlan).not.toHaveBeenCalled();
    await waitFor(() => expect(context.captureSupplierOrder).toHaveBeenCalledTimes(1));
  });

  it('does not show success when backend capture fails', async () => {
    const context = buildContext({
      captureSupplierOrder: vi.fn().mockRejectedValue(new Error('capture rejected by PayPal')),
    });
    contextRef.current = context;

    await openPayPalStep();

    await waitFor(() => expect(context.captureSupplierOrder).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Plan Approved & Schedule Rerouted!')).toBeNull();
    expect(toastMock.error).toHaveBeenCalledWith(
      'PayPal capture failed',
      expect.objectContaining({ description: expect.stringContaining('capture rejected') })
    );
  });
});
