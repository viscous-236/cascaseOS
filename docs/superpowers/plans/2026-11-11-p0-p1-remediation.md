# CascadeOS P0 + P1 Remediation Plan

**Date:** 2026-11-11
**Scope:** Close the 6 P0 blockers and 13 P1 spec gaps found in the completion audit. P2/P3 (README, demo video, chunk splitting) are out of scope.
**Constraint:** No commit or push unless explicitly requested. Preserve the three pre-existing whitespace-only client modifications.

## P0 tasks

### P0-1 — Typed PayPal client (ARC-006)

**Files**
- `server/src/services/paypalClient.ts` (new)
- `server/src/services/integrationAudit.ts` (new)
- `server/src/utils/redaction.ts` (new)
- `server/scripts/generate-paypal-client.sh` (new)
- `docs/apimatic.md` (new)
- Refactor: `paypalInvoicingService.ts`, `paypalOrdersService.ts`

**API**
```ts
export interface PayPalHttpRequest<TBody> {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  body?: TBody;
  requestId?: string;
  accept?: string;
  responseType?: 'json' | 'text' | 'arrayBuffer';
}
export interface PayPalHttpResponse<T> {
  status: number;
  headers: Headers;
  body: T;
  latencyMs: number;
}
export async function paypalHttpRequest<T, TBody = unknown>(
  request: PayPalHttpRequest<TBody>,
  options?: { tokenProvider?: () => Promise<string>; apiBaseUrl?: string }
): Promise<PayPalHttpResponse<T>>;
```
- Fails closed on non-2xx; redacts request headers from errors.
- Calls `recordIntegrationHttpCall` for every attempt (success and failure), provider `PAYPAL`.
- Documented header: generated from PayPal Invoicing v2 + Orders v2 OpenAPI via APIMatic; regeneration script + workflow doc.

**Tests**
- New `server/src/__tests__/paypalClient.test.ts`: request headers/idempotency, non-2xx throws, latency/audit row written, secrets redacted.

### P0-2 — Onboarding/CRUD suite (FILE-041, TASK-052, TEST-015–018)

**File:** `server/src/__tests__/onboardingAndCrud.test.ts` (new)

Covers:
- TEST-015 cyclic dependency POST → 400 `DAG_CYCLE_DETECTED`.
- TEST-016 custom task IDs `custom_phase_a`…`custom_phase_d`, SCENARIO_A/B resolves them without default IDs.
- TEST-017 `POST /api/projects/create-custom` persists live-format `INV2-...`, view URL, `CHANNEL3_LIVE` quotes (services mocked at network boundary).
- TEST-018 PATCH persists recalculated blast radius + policy decision in `audit_events`.

### P0-3 — Browser checkout uses backend order routes (REQ-010, REQ-011, TEST-014)

**Files**
- `client/src/api/cascadeApiClient.ts`: align create/capture response types with server.
- `client/src/context/CascadeStateContext.tsx`: add `createSupplierOrder` + `captureSupplierOrder`.
- `client/src/components/ApprovalCheckoutModal.tsx`: replace `actions.order.create/capture` with backend calls.
- `client/tests/checkoutFlow.test.tsx` (new): modal calls backend create then capture; no `actions.order` usage.
- `server/src/__tests__/apiIntegration.test.ts`: capture test asserts `capture_id` persistence + `MATERIALS_ORDERED`.

### P0-4 — Client widget coverage (TEST-013)

**Files**
- `client/tests/widgets.test.tsx` (new, jsdom)
- `client/src/studio/widgets/createCascadeWidgets.ts`: widget-specific `formatShape`.
- `client/vitest.config.ts`: include `tests/**/*.test.tsx`, environment per-file.
- Add dev deps: `jsdom`, `@testing-library/react`, `@testing-library/dom`.

Covers: both widgets mount, `getData` called with `project_tasks`/`supplier_quotes`, `formatShape.parse()` succeeds, badge click calls `toggleCrossFilter`.

### P0-5 — Live verifier persistence + status (TEST-011/012)

**File:** `server/src/scripts/verifyLiveSandbox.ts`
- Add injectable `persistOrder` and `persistQuote` deps (default DB-backed).
- Assert `order.status === 'CREATED'` before persisting; persist `paypal_transactions` row (`ORDER_CREATE`).
- Persist normalized Channel3 quote into `supplier_quotes` with `source_type = 'CHANNEL3_LIVE'`.
- Extend report with `orderPersisted`, `quotePersisted`.
- Update `server/src/__tests__/verifyLiveSandbox.test.ts`.

### P0-6 — TEST-007/009 correctness

**Files**
- `server/src/schemas/apiSchemas.ts`: `createPayPalOrderSchema` accepts optional `expectedTotalMinor` (positive integer) for optimistic validation.
- `server/src/routes/recoveryRoutes.ts`: if supplied, compare to quote total → 409 on mismatch; never trust it as the charge amount.
- `server/src/__tests__/apiIntegration.test.ts`:
  - TEST-007 mutates quote by 1 cent after approval → POST orders/create → 409 `STALE_FINGERPRINT_APPROVAL`.
  - TEST-009 sends negative minor unit, floating `1396.55`, and missing fields → 400.

## P1 tasks

### P1-1 — Studio sources + dashboard + cross-filter
- `StudioWorkspace.tsx`: IDs `project_tasks`, `supplier_quotes`, `audit_events`; add `initialState` with two custom widgets + native Phase Budget vs Exposure bar chart + Supplier Quote Variance grid.
- `CascadeRecoveryWidget.tsx`: cross-filter field uses `audit_events`.
- `FriendlyNudgeScoreboardWidget.tsx`: cross-filter on paid-milestone badge (`project_tasks`, `paypal_invoice_status`).

### P1-2 — Gantt columns/pills/dependencies
- `TimelinePane.tsx`: unhide Crew, PayPal Invoice Status, Unlock Amount (and other useful columns).
- `taskRenderer`: status pill for `PAID`, `OVERDUE — BLOCKING`, `REROUTED — ACTIVE`, `MATERIALS ORDERED`.
- `onDependencyCreateDrop` → `createDependency`; delete via Bryntum event if available.
- Add project switcher + “+ New Project” to `TopScenarioBar` (TASK-051 location).

### P1-3 — Scenario bar badges/KPIs
- `TopScenarioBar.tsx`: `PayPal Sandbox OAuth: Connected`, `Channel3 API: Live`, `Policy Accuracy: 10/10`, and KPI pills: Idle Exposure At Risk, Channel3 Arbitrage Savings, Active PayPal Invoices.

### P1-4 — CSV/JSON importer
- `NewProjectModal.tsx`: file input accepts `.csv,.json`; parse tasks + dependencies into the manual builder; validation errors surfaced.

### P1-5 — Client agent tools + backend triggerScenario
- `cascadeFinOpsAgent.ts`: register `runScenarioAnalysis` and `openPayPalApprovalModal` tools.
- `studioAgentRoutes.ts`: `triggerScenario` invokes scenario service with `{ projectId, targetTaskId? }` and returns the real plan result.

### P1-6 — Task PATCH policy persistence
- `projectRoutes.ts`: recompute blast radius; evaluate policy; insert `TASK_UPDATED` audit with real decision, reason codes, canonical fingerprint, and payload `{ patch, blastRadius, policyResult }`; return `policyResult`.

### P1-7 — Startup bootstrap (RISK-007)
- `index.ts`/`projectBootstrapService.ts`: `ensureStartupBootstrap()` called from `startServer` when no projects exist; live PayPal + Channel3 by default; testable with injected deps.

### P1-8 — GUD-006 + SEC-008
- Integration audit rows for PayPal + Channel3 HTTP status/latency.
- `redaction.ts` applied to PayPal client errors, Channel3 errors, verifier logs, and auth service logs.

## Verification gates
1. `npm test` (server) — 0 failures.
2. `npm test --workspace=client` — 0 failures.
3. `npm run typecheck` — exit 0.
4. `npm run build` — exit 0.
5. Report remaining limitations (real APIMatic credentials, browser E2E against live sandbox).
