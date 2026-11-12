/**
 * @file widgetFormat.ts
 * @description Shared runtime helpers for the CascadeOS custom AG Studio widgets.
 *
 * AG Studio drops any format property that the widget's `formatShape` does not
 * declare, so the shape in `createCascadeWidgets.ts` and the rendering here must
 * stay in sync.
 */

import type { CSSProperties } from 'react';
import type { AgTitle, AgWidgetAppearance, AgWidgetDataFormat } from 'ag-studio';

export interface CascadeRecoveryStyle {
  showComparison?: boolean;
  showReasonCodes?: boolean;
  showApproveButton?: boolean;
}

export interface FriendlyNudgeStyle {
  showQrCode?: boolean;
  showNudgeDraft?: boolean;
  showPaymentLink?: boolean;
}

export type CascadeWidgetStyle = CascadeRecoveryStyle & FriendlyNudgeStyle;

export type CascadeWidgetFormat = AgWidgetDataFormat<CascadeWidgetStyle> & {
  /**
   * Declared for parity with AG Studio 3.1's cross-filter trigger control.
   * Treated as `true` when unset, matching the built-in widgets.
   */
  triggerCrossFilter?: boolean;
};

/** Returns the display text for a title/subtitle/caption that is enabled. */
export function formatText(title?: AgTitle): string | undefined {
  return title?.enabled !== false && title?.text ? title.text : undefined;
}

/** Maps the persisted `format.widget` appearance to inline CSS. */
export function widgetAppearanceStyle(format?: CascadeWidgetFormat): CSSProperties | undefined {
  const appearance: AgWidgetAppearance | undefined = format?.widget;
  if (!appearance) return undefined;

  const style: CSSProperties = {};
  if (appearance.backgroundColor) style.backgroundColor = appearance.backgroundColor;
  if (typeof appearance.borderRadius === 'number') style.borderRadius = appearance.borderRadius;
  if (appearance.borderEnabled) {
    style.borderStyle = 'solid';
    style.borderWidth = appearance.borderWidth ?? 1;
    style.borderColor = appearance.borderColor ?? 'currentColor';
  }
  return style;
}

/**
 * Finds a mapped data field by its column key. Studio field identifiers are
 * either the bare key (`paypal_invoice_status`) or table-qualified
 * (`project_tasks.paypal_invoice_status`).
 */
export function findMappedField<TField>(fields: readonly TField[] | undefined, columnKey: string): TField | undefined {
  return fields?.find((field) => {
    const identifiers = [(field as any)?.fieldId, (field as any)?.key];
    return identifiers.some(
      (identifier) =>
        typeof identifier === 'string' &&
        (identifier === columnKey || identifier.endsWith(`.${columnKey}`))
    );
  });
}
