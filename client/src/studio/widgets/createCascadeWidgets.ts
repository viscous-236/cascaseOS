/**
 * @file createCascadeWidgets.ts
 * @description Registers Custom AG Studio 3.0 React Widgets via createWidgets API (TASK-033, REQ-015).
 *
 * Each widget declares its own `formatShape` (rather than reusing the built-in
 * text shape) so that widget-specific display options, the shared title /
 * appearance controls, and `format.crossFilter` all survive a report reload.
 */

import { createWidgets } from 'ag-studio-react';
import { CascadeRecoveryWidget } from './CascadeRecoveryWidget';
import { FriendlyNudgeScoreboardWidget } from './FriendlyNudgeScoreboardWidget';

// The public shape builder is surfaced through `api.defineAiCommand`; using it
// avoids depending on AG Studio's internal `shape()` export while still
// producing a real `AgShape` that the widget registry can internalise.
type ShapeBuilder = any;

function titleShape(s: ShapeBuilder) {
  return s.object({
    enabled: s.boolean().optional(),
    text: s.string().optional(),
    typography: s.object({
      fontFamily: s.string().optional(),
      fontSize: s.number().optional(),
      fontWeight: s.enum(['normal', 'bold']).optional(),
      fontStyle: s.enum(['normal', 'italic']).optional(),
    }).optional(),
    color: s.string().optional(),
    textAlign: s.enum(['left', 'center', 'right']).optional(),
    wrapping: s.boolean().optional(),
  }).optional();
}

function widgetAppearanceShape(s: ShapeBuilder) {
  return s.object({
    backgroundColor: s.string().optional(),
    borderRadius: s.number().gte(0).optional(),
    borderEnabled: s.boolean().optional(),
    borderWidth: s.number().gt(0).optional(),
    borderColor: s.string().optional(),
  }).optional();
}

function buildFormatShape(params: any, styleShape: (s: ShapeBuilder) => any, description: string) {
  return params.api.defineAiCommand((s: ShapeBuilder) => ({
    input: s.object({
      title: titleShape(s),
      subtitle: titleShape(s),
      caption: titleShape(s),
      widget: widgetAppearanceShape(s),
      style: styleShape(s).optional(),
      crossFilter: s.enum(['highlight', 'filter', 'none']).optional(),
      triggerCrossFilter: s.boolean().optional(),
    }).optional(),
    execute: () => ({ success: true, value: undefined }),
  })).shape;
}

export const cascadeRecoveryFormatShape = (params: any) =>
  buildFormatShape(
    params,
    (s) => s.object({
      showComparison: s.boolean().optional(),
      showReasonCodes: s.boolean().optional(),
      showApproveButton: s.boolean().optional(),
    }),
    'Cascade recovery widget configuration. `style` controls which sections are visible; `crossFilter` controls how reason-code clicks affect the rest of the dashboard.'
  );

export const friendlyNudgeFormatShape = (params: any) =>
  buildFormatShape(
    params,
    (s) => s.object({
      showQrCode: s.boolean().optional(),
      showNudgeDraft: s.boolean().optional(),
      showPaymentLink: s.boolean().optional(),
    }),
    'Client collaboration scoreboard configuration. `style` controls which payment-reminder sections are visible; `crossFilter` controls how the paid-milestone badge affects the rest of the dashboard.'
  );

interface StyleToggle {
  id: string;
  label: string;
  defaultValue: boolean;
}

/**
 * Appends the shared appearance controls and a widget-specific style section
 * to the default form. The form builder helpers are not part of AG Studio's
 * public exports in 3.0, so this composes the returned plain form objects.
 */
function appendFormatSections(form: any, params: any, toggles: StyleToggle[], styleLabel: string) {
  const appearance = params.createWidgetAppearanceSection();
  const styleSection = {
    type: 'section' as const,
    key: 'style',
    label: styleLabel,
    defaultExpanded: false,
    items: toggles.map((toggle) => ({
      type: 'toggle' as const,
      id: toggle.id,
      label: toggle.label,
      defaultValue: toggle.defaultValue,
    })),
  };

  return {
    ...form,
    items: (form.items ?? []).map((tab: any) =>
      tab?.type === 'tab' && tab.key === 'format'
        ? { ...tab, items: [...(tab.items ?? []), appearance, styleSection] }
        : tab
    ),
  };
}

export const cascadeCustomWidgets = (createWidgets as any)({
  additionalTypes: [
    {
      id: 'CascadeRecoveryWidget',
      comp: CascadeRecoveryWidget,
      label: 'Cascade Schedule Recovery & Arbitrage',
      dataMapping: {
        task: { type: 'fieldset', supportedRoles: ['category'], aiDescription: 'Project task fields for recovery state.' },
        quote: { type: 'fieldset', supportedRoles: ['numeric'], aiDescription: 'Supplier quote fields compared in the arbitrage view.' },
        reasonCode: { type: 'field', supportedRoles: ['category'], aiDescription: 'Policy reason code field.' },
      },
      formatShape: cascadeRecoveryFormatShape,
      defaultSize: { width: 600, height: 400 },
      minSize: { width: 300, height: 200 },
      featureConfig: { crossFilter: { supportsHighlight: true } },
      form: (params: any) =>
        appendFormatSections(
          params.createDefaults({
            supportsCrossHighlight: true,
            dataMappingItems: [
              { key: 'task', label: 'Recovery task' },
              { key: 'quote', label: 'Supplier quote' },
              { key: 'reasonCode', label: 'Reason code' },
            ],
          }),
          params,
          [
            { id: 'format.style.showComparison', label: 'Show quote comparison', defaultValue: true },
            { id: 'format.style.showReasonCodes', label: 'Show reason-code filters', defaultValue: true },
            { id: 'format.style.showApproveButton', label: 'Show approval button', defaultValue: true },
          ],
          'Recovery display'
        ),
      ai: { label: 'Cascade Recovery', description: 'Shows blocked milestones, policy reasons, and supplier arbitrage.', usage: 'Use for schedule recovery and approval decisions.' },
    },
    {
      id: 'FriendlyNudgeScoreboardWidget',
      comp: FriendlyNudgeScoreboardWidget,
      label: 'Client Collaboration Scoreboard',
      dataMapping: {
        task: { type: 'fieldset', supportedRoles: ['category'], aiDescription: 'Milestone and invoice fields.' },
        invoice: { type: 'fieldset', supportedRoles: ['category', 'numeric'], aiDescription: 'PayPal invoice and notification fields.' },
      },
      formatShape: friendlyNudgeFormatShape,
      defaultSize: { width: 600, height: 400 },
      minSize: { width: 300, height: 200 },
      featureConfig: { crossFilter: { supportsHighlight: true } },
      form: (params: any) =>
        appendFormatSections(
          params.createDefaults({
            supportsCrossHighlight: true,
            dataMappingItems: [
              { key: 'task', label: 'Milestone task' },
              { key: 'invoice', label: 'PayPal invoice' },
            ],
          }),
          params,
          [
            { id: 'format.style.showQrCode', label: 'Show PayPal QR code', defaultValue: true },
            { id: 'format.style.showNudgeDraft', label: 'Show reminder draft', defaultValue: true },
            { id: 'format.style.showPaymentLink', label: 'Show payment link', defaultValue: true },
          ],
          'Reminder display'
        ),
      ai: { label: 'Client Nudge Scoreboard', description: 'Shows PayPal email, QR, and direct payment channels.', usage: 'Use after approving a partial-payment recovery plan.' },
    },
  ],
});

export default cascadeCustomWidgets;
