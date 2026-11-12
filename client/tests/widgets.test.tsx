// @vitest-environment jsdom
/**
 * @file widgets.test.tsx
 * @description TEST-013: the two CascadeOS custom widgets must mount in the
 * AG Studio runtime, request their mapped data, expose widget-specific format
 * shapes, and cross-filter from their interactive elements (REQ-015).
 */

import React from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const contextRef = vi.hoisted(() => ({ current: {} as Record<string, any> }));

const toastMock = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
    loading: vi.fn(),
  })
);

vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('../src/context/CascadeStateContext', () => ({
  useCascadeState: () => contextRef.current,
}));

import { createStudio } from 'ag-studio';
import { cascadeCustomWidgets } from '../src/studio/widgets/createCascadeWidgets';
import { CascadeRecoveryWidget } from '../src/studio/widgets/CascadeRecoveryWidget';
import { FriendlyNudgeScoreboardWidget } from '../src/studio/widgets/FriendlyNudgeScoreboardWidget';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function field(fieldId: string, name: string) {
  return {
    fieldId,
    key: fieldId.split('.').pop(),
    type: 'column',
    name,
    description: undefined,
    format: undefined,
    notBlank: false,
  } as any;
}

const projectTaskFields = [
  field('project_tasks.task_id', 'Task'),
  field('project_tasks.paypal_invoice_status', 'PayPal invoice status'),
  field('project_tasks.paypal_invoice_number', 'PayPal invoice number'),
];
const supplierQuoteFields = [
  field('supplier_quotes.unit_price_minor', 'Unit price'),
  field('supplier_quotes.savings_vs_incumbent_minor', 'Savings'),
];
const auditField = field('audit_events.reason_code', 'Reason code');

function makeWidgetApi() {
  return {
    getData: vi.fn().mockResolvedValue({ results: { rows: [] } }),
    setDisplayState: vi.fn(),
    toggleCrossFilter: vi.fn(),
    resetCrossFilter: vi.fn(),
    getCrossFilterSelections: vi.fn(),
    isGroupingField: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setSort: vi.fn(),
    exportCsv: vi.fn(),
  } as any;
}

const activePlan = {
  plan_id: 'plan_widget_test',
  blocked_task_id: 'task_blocked',
  total_exposure_minor: 510000,
  reason_codes_json: '["MATERIALS_NOT_IN_WAREHOUSE","BUDGET_EXCEEDED"]',
  status: 'PROPOSED',
  policy_decision: 'REQUIRE_APPROVAL',
  nudge_draft_text: 'Please release the hardware budget.',
};

function recoveryState() {
  return {
    tasks: [
      {
        task_id: 'task_blocked',
        name: 'Display install',
        crew_assigned: 'Crew A',
        schedule_status: 'PAYMENT_BLOCKED',
        paypal_invoice_status: 'SENT',
      },
      {
        task_id: 'task_paid',
        name: 'Signage',
        schedule_status: 'COMPLETE',
        paypal_invoice_status: 'PAID',
      },
    ],
    supplierQuotes: [
      {
        quote_id: 'quote_incumbent',
        task_id: 'task_blocked',
        source_type: 'INCUMBENT_INVOICE',
        merchant_name: 'Incumbent Supply',
        unit_price_minor: 175000,
        variance_vs_historical_pct: 25.4,
      },
      {
        quote_id: 'quote_live',
        task_id: 'task_blocked',
        source_type: 'CHANNEL3_LIVE',
        merchant_name: 'Channel3 Live',
        unit_price_minor: 139600,
        savings_vs_incumbent_minor: 35400,
        availability_status: 'IN_STOCK',
      },
    ],
    auditEvents: [],
  };
}

let studioApi: ReturnType<typeof createStudio>;
let studioHost: HTMLDivElement;

beforeAll(() => {
  (globalThis as any).ResizeObserver = ResizeObserverStub;
  studioHost = document.createElement('div');
  document.body.appendChild(studioHost);
  studioApi = createStudio(studioHost, {});
}, 30000);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  contextRef.current = {};
});

afterAll(() => {
  studioApi?.destroy();
  studioHost?.remove();
});

function customDefinition(id: string) {
  return (cascadeCustomWidgets as any).widgets.find((widget: any) => widget.id === id);
}

describe('custom widget format shapes', () => {
  it('parses the recovery widget format, including widget-specific style flags', () => {
    const shape = customDefinition('CascadeRecoveryWidget').formatShape({ api: studioApi, context: {} });
    const parsed = shape.parse({
      title: { enabled: true, text: 'Recovery' },
      widget: { backgroundColor: '#ffffff', borderRadius: 12, borderEnabled: true, borderWidth: 2 },
      crossFilter: 'highlight',
      triggerCrossFilter: true,
      style: { showComparison: false, showReasonCodes: true, showApproveButton: true },
    });

    expect(parsed.success).toBe(true);
    expect(parsed.value.style).toEqual({ showComparison: false, showReasonCodes: true, showApproveButton: true });
    expect(parsed.value.widget?.borderRadius).toBe(12);
  });

  it('parses the nudge widget format, including widget-specific style flags', () => {
    const shape = customDefinition('FriendlyNudgeScoreboardWidget').formatShape({ api: studioApi, context: {} });
    const parsed = shape.parse({
      title: { enabled: true, text: 'Payment reminder' },
      crossFilter: 'filter',
      style: { showQrCode: false, showNudgeDraft: true, showPaymentLink: false },
    });

    expect(parsed.success).toBe(true);
    expect(parsed.value.style).toEqual({ showQrCode: false, showNudgeDraft: true, showPaymentLink: false });
    expect(parsed.value.crossFilter).toBe('filter');

    const schema = JSON.stringify(shape.toJSONSchema());
    expect(schema).toContain('showQrCode');
    expect(schema).toContain('showNudgeDraft');
    expect(schema).toContain('showPaymentLink');
  });

  it('registers both custom widget definitions without schema errors', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const studio = createStudio(host, { widgets: cascadeCustomWidgets as any });
    try {
      // createStudio binds every definition's formatShape and builds its config;
      // an invalid shape would throw during this call.
      expect(studio.getState().pages.length).toBeGreaterThan(0);
    } finally {
      studio.destroy();
      host.remove();
    }
  });
});

describe('CascadeRecoveryWidget', () => {
  it('requests its mapped fields and displays the widget once loaded', async () => {
    const widgetApi = makeWidgetApi();
    contextRef.current = {
      state: recoveryState(),
      activePlan,
      selectedTaskId: 'task_blocked',
      selectedReasonCode: null,
      selectReasonCode: vi.fn(),
      openApprovalModal: vi.fn(),
    };

    render(
      <CascadeRecoveryWidget
        widgetApi={widgetApi}
        dataMapping={{ task: projectTaskFields, quote: supplierQuoteFields, reasonCode: [auditField] }}
        format={{ crossFilter: 'highlight' }}
      />
    );

    await waitFor(() => expect(widgetApi.setDisplayState).toHaveBeenCalledWith('displayed'));

    const [query, options] = widgetApi.getData.mock.calls[0];
    expect(query.fields).toEqual([...projectTaskFields, ...supplierQuoteFields, auditField]);
    expect(options).toEqual({ crossFilter: 'highlight' });
    expect(screen.getByText('Channel3 Live')).toBeTruthy();
  });

  it('cross-filters on the mapped reason-code field when a reason pill is clicked', async () => {
    const widgetApi = makeWidgetApi();
    const selectReasonCode = vi.fn();
    contextRef.current = {
      state: recoveryState(),
      activePlan,
      selectedTaskId: 'task_blocked',
      selectedReasonCode: null,
      selectReasonCode,
      openApprovalModal: vi.fn(),
    };

    render(
      <CascadeRecoveryWidget
        widgetApi={widgetApi}
        dataMapping={{ task: projectTaskFields, quote: supplierQuoteFields, reasonCode: [auditField] }}
        format={{}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'BUDGET_EXCEEDED' }));

    expect(selectReasonCode).toHaveBeenCalledWith('BUDGET_EXCEEDED');
    expect(widgetApi.toggleCrossFilter).toHaveBeenCalledWith({
      group: 0,
      type: 'value',
      field: auditField,
      value: 'BUDGET_EXCEEDED',
    });
  });

  it('honours crossFilter=none and hides sections disabled by the format', async () => {
    const widgetApi = makeWidgetApi();
    contextRef.current = {
      state: recoveryState(),
      activePlan,
      selectedTaskId: 'task_blocked',
      selectedReasonCode: null,
      selectReasonCode: vi.fn(),
      openApprovalModal: vi.fn(),
    };

    render(
      <CascadeRecoveryWidget
        widgetApi={widgetApi}
        dataMapping={{ task: projectTaskFields, quote: supplierQuoteFields, reasonCode: [auditField] }}
        format={{
          crossFilter: 'none',
          style: { showComparison: false, showReasonCodes: false, showApproveButton: false },
        }}
      />
    );

    const [, options] = widgetApi.getData.mock.calls[0];
    expect(options).toEqual({ crossFilter: 'none' });
    expect(screen.queryByText('Incumbent Supply')).toBeNull();
    expect(screen.queryByRole('button', { name: 'BUDGET_EXCEEDED' })).toBeNull();
    expect(screen.queryByText('Approve Reroute & Split Invoice')).toBeNull();
  });
});

describe('FriendlyNudgeScoreboardWidget', () => {
  it('requests its mapped fields and displays the widget once loaded', async () => {
    const widgetApi = makeWidgetApi();
    contextRef.current = {
      state: recoveryState(),
      activePlan,
      openApprovalModal: vi.fn(),
      approvePlan: vi.fn(),
      lastNotification: undefined,
    };

    render(
      <FriendlyNudgeScoreboardWidget
        widgetApi={widgetApi}
        dataMapping={{ task: projectTaskFields, invoice: supplierQuoteFields }}
        format={{}}
      />
    );

    await waitFor(() => expect(widgetApi.setDisplayState).toHaveBeenCalledWith('displayed'));

    const [query, options] = widgetApi.getData.mock.calls[0];
    expect(query.fields).toEqual([...projectTaskFields, ...supplierQuoteFields]);
    expect(options).toEqual({ crossFilter: 'highlight' });
    expect(screen.getByText('1 paid milestones')).toBeTruthy();
  });

  it('cross-filters on project_tasks.paypal_invoice_status when the paid badge is clicked', async () => {
    const widgetApi = makeWidgetApi();
    contextRef.current = {
      state: recoveryState(),
      activePlan,
      openApprovalModal: vi.fn(),
      approvePlan: vi.fn(),
      lastNotification: undefined,
    };

    render(
      <FriendlyNudgeScoreboardWidget
        widgetApi={widgetApi}
        dataMapping={{ task: projectTaskFields, invoice: supplierQuoteFields }}
        format={{}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /paid milestones/i }));

    expect(widgetApi.toggleCrossFilter).toHaveBeenCalledWith({
      group: 0,
      type: 'value',
      field: projectTaskFields[1],
      value: 'PAID',
    });
  });

  it('hides the QR, draft and payment link when the format disables them', async () => {
    const widgetApi = makeWidgetApi();
    contextRef.current = {
      state: recoveryState(),
      activePlan,
      openApprovalModal: vi.fn(),
      approvePlan: vi.fn(),
      lastNotification: {
        recipientViewUrl: 'https://www.sandbox.paypal.com/invoice/p/#INV2-TEST',
        minimumAmountDueMinor: 139600,
      },
    };

    render(
      <FriendlyNudgeScoreboardWidget
        widgetApi={widgetApi}
        dataMapping={{ task: projectTaskFields, invoice: supplierQuoteFields }}
        format={{ style: { showQrCode: false, showNudgeDraft: false, showPaymentLink: false } }}
      />
    );

    expect(screen.queryByText('Scan to Pay')).toBeNull();
    expect(screen.queryByLabelText('Payment reminder draft')).toBeNull();
    expect(screen.queryByText(/Open Client PayPal Payment Page/)).toBeNull();
  });
});
