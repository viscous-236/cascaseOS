/**
 * @file createCascadeWidgets.ts
 * @description Registers Custom AG Studio 3.0 React Widgets via createWidgets API (TASK-033, REQ-015).
 */

import { createWidgets } from 'ag-studio-react';
import { CascadeRecoveryWidget } from './CascadeRecoveryWidget';
import { FriendlyNudgeScoreboardWidget } from './FriendlyNudgeScoreboardWidget';

export const cascadeCustomWidgets = (createWidgets as any)({
  additionalTypes: [
    {
      id: 'cascadeRecoveryWidget',
      comp: CascadeRecoveryWidget,
      label: 'Cascade Schedule Recovery & Arbitrage',
      defaultSize: { w: 6, h: 4 },
      minSize: { w: 3, h: 2 },
      form: (params: any) => params.createDefaults({ supportsCrossHighlight: false }),
    },
    {
      id: 'friendlyNudgeScoreboardWidget',
      comp: FriendlyNudgeScoreboardWidget,
      label: 'Client Collaboration Scoreboard',
      defaultSize: { w: 6, h: 4 },
      minSize: { w: 3, h: 2 },
      form: (params: any) => params.createDefaults({ supportsCrossHighlight: false }),
    },
  ],
});

export default cascadeCustomWidgets;

