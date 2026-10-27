/**
 * @file createCascadeWidgets.ts
 * @description Registers Custom AG Studio 3.0 React Widgets via createWidgets API (TASK-033, REQ-015).
 */

import { createWidgets } from 'ag-studio-react';
import { _ALL_WIDGET_DEFS } from 'ag-studio';
import { CascadeRecoveryWidget } from './CascadeRecoveryWidget';
import { FriendlyNudgeScoreboardWidget } from './FriendlyNudgeScoreboardWidget';

const formatShape = (params: any) => ( _ALL_WIDGET_DEFS as any).text.formatShape(params);

export const cascadeCustomWidgets = (createWidgets as any)({
  additionalTypes: [
    {
      id: 'CascadeRecoveryWidget',
      comp: CascadeRecoveryWidget,
      label: 'Cascade Schedule Recovery & Arbitrage',
      dataMapping: {
        task: { type: 'fieldset', supportedRoles: ['category'], aiDescription: 'Project task fields for recovery state.' },
        reasonCode: { type: 'field', supportedRoles: ['category'], aiDescription: 'Policy reason code field.' },
      },
      formatShape,
      defaultSize: { width: 600, height: 400 },
      minSize: { width: 300, height: 200 },
      form: (params: any) => params.createDefaults({ supportsCrossHighlight: true, dataMappingItems: [{ key: 'task', label: 'Recovery task' }, { key: 'reasonCode', label: 'Reason code' }] }),
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
      formatShape,
      defaultSize: { width: 600, height: 400 },
      minSize: { width: 300, height: 200 },
      form: (params: any) => params.createDefaults({ supportsCrossHighlight: true, dataMappingItems: [{ key: 'task', label: 'Milestone task' }, { key: 'invoice', label: 'PayPal invoice' }] }),
      ai: { label: 'Client Nudge Scoreboard', description: 'Shows PayPal email, QR, and direct payment channels.', usage: 'Use after approving a partial-payment recovery plan.' },
    },
  ],
});

export default cascadeCustomWidgets;
