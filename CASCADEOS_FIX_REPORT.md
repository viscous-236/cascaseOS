# CascadeOS — Stage 2 Fix Report

**Report date:** 2026-11-12  
**Repository:** `/Users/vaibhavgoyal/Desktop/cascadeOS`  
**Companion audit:** `CASCADEOS_FULL_AUDIT.md`  
**Scope:** Confirmed, locally verifiable defects in approval, payment capture, webhook reconciliation, Channel3 cost ingestion, Copilot grounding, project-state completeness, audit truthfulness, and user-facing copy.

---

## 1. Summary

Stage 2 fixed **10 confirmed findings** without changing the product's core financial policies, approval permissions, procurement selection policy, payment lifecycle semantics, or external integration contracts. Each fix is covered by a regression test that was first proven to fail against the original code.

| Area | Findings fixed | Behavior now |
|---|---|---|
| Audit truthfulness | `AUD-01`, `AUD-02`, `AUD-03` | No HMAC/RFC 6960 overclaim; creation events no longer fabricate hashes; state exports include all plans and approvals |
| Financial / procurement | `FIN-01` | Missing Channel3 freight/tax persists as `null` and blocks via `UNKNOWN_COST_FIELD` |
| Copilot | `FIN-02` | Live project snapshot in prompt; real tool name; tool results returned to the model for a grounded answer |
| Approval | `APP-01` | Only `PROPOSED` plans can be approved; replay returns `409` without PayPal side effects |
| Payment capture | `PAY-04` | Capture must match a CascadeOS `ORDER_CREATE` record for the same task/project/plan; replay is rejected |
| Payment policy | `PAY-05` | Persisted budget/baseline values are used; no `||` demo fallbacks |
| Webhooks | `PAY-01`, `PAY-02` | Missing webhook ID fails closed outside test mode; event IDs are idempotent; processing failures return `500` for retry |
| UI / docs | `UI-02`, `UI-03`, `PAY-06` (label) | Money formatter used; “PayPal activity” label; accurate SHA-256 wording |

**Not changed:** quote selection policy (`FIN-03`), duplicate quote retention (`FIN-04`), invoice-split invariant (`FIN-05`), payment-to-staging lifecycle (`PAY-03`), approval fingerprint scope (`APP-02`), global reset scope (`OPS-01`), authentication (`OPS-02`), Copilot mutation confirmation (`CLIENT-05`), and schedule date/duration ownership (`UI-04`). These require explicit product decisions.

---

## 2. Fixes Applied

### 2.1 Audit truthfulness

**`AUD-01` — Copy no longer claims cryptographic non-repudiation**

The implementation stores a plain, deterministic SHA-256 hash over a selected proposal payload. It is **not** HMAC, a digital signature, or RFC 6960. User-facing copy now says “SHA-256 approval binding” / “state fingerprint” and the README explicitly limits the claim.

Files:
- `client/src/components/AuditDrawer.tsx`
- `client/src/components/ApprovalCheckoutModal.tsx`
- `client/src/context/CascadeStateContext.tsx`
- `client/src/components/FinOpsWidgetPanel.tsx`
- `README.md`

No cryptographic mechanism was added, and no stronger guarantee is claimed.

**`AUD-02` — Creation events no longer invent fingerprints**

`TASK_CREATED` and `DEPENDENCY_CREATED` previously wrote `sha256_<timestamp>`, which looked like a hash but bound no state. They now store `NULL`.

Files:
- `server/src/routes/projectRoutes.ts` (task and dependency creation audit inserts)

**`AUD-03` — Project state includes the full compliance lifecycle**

`GET /api/projects/:projectId/state` now returns:

- `recoveryPlans`: every plan for the project, newest first, including `EXECUTED`, `BLOCKED`, and superseded plans.
- `userApprovals`: approvals joined to those plans.
- `activeRecoveryPlan`: retained for current workflow compatibility.

Files:
- `server/src/routes/projectRoutes.ts`

The client already consumed these fields, so no client type change was needed.

### 2.2 Financial and procurement ingestion

**`FIN-01` — Unknown freight/tax fails closed**

Channel3 offers do not quote delivery or tax. The ingestion path previously persisted `0`, which made the policy engine see a fully known cost. It now persists `null`, so `evaluateRecoveryAndSupplierAction` returns `BLOCK` with `UNKNOWN_COST_FIELD`.

Files:
- `server/src/services/channel3Service.ts` (`searchAndAuditSupplierProducts`)

`total_minor` remains the known goods subtotal; it is not presented as a delivered total.

### 2.3 Copilot grounding

**`FIN-02` — Live state, correct tools, and a second model round**

The Copilot route now:

1. Builds a project snapshot from SQLite (project, tasks, active recovery plan, recent supplier quotes).
2. Removes the hardcoded `$2,800.00 / $1,396.00 / $564.00` examples and the nonexistent `refreshChannel3Quotes` tool name.
3. Executes tools, appends `role: 'tool'` messages keyed by `tool_call_id`, and makes a second completion call so the final answer is grounded in actual tool output.
4. Validates `triggerScenario` scenario IDs and target task ownership before mutation.

Files:
- `server/src/routes/studioAgentRoutes.ts`

`triggerScenario` still executes without a confirmation gate. That is deferred as `CLIENT-05`.

### 2.4 Approval idempotency

**`APP-01` — Approval is a one-way transition**

The approval endpoint now requires `plan.status === 'PROPOSED'` and rejects an existing `user_approvals` row **before** any PayPal invoice split, QR generation, or reminder call. A replay returns `409` and writes no second approval or audit event.

Files:
- `server/src/routes/recoveryRoutes.ts` (`POST /api/recovery-plans/:planId/approve-schedule-and-split`)

### 2.5 Payment capture ownership and replay protection

**`PAY-04` — Capture must match a stored CascadeOS order**

Before calling PayPal, the capture endpoint now loads the `ORDER_CREATE` row for the path `orderId` and verifies:

- the order record exists (`404` if not);
- the record's task and project match the request (`409` if not);
- the record's plan matches a supplied `planId` (`409` if not);
- the order has not already been captured (`409` if it has).

Files:
- `server/src/routes/recoveryRoutes.ts` (`POST /api/paypal/orders/:orderId/capture`)

Note: the pre-existing optional `planId` check requires the plan's `promoted_task_id` to equal the capture task. The client already omits `planId` when the blocked and promoted tasks differ. This report does not change that lifecycle rule (`PAY-03` / product decision).

### 2.6 Payment policy inputs

**`PAY-05` — No invented fallback financial values**

Order creation now uses the task's persisted `phase_hardware_budget_max_minor` and `historical_unit_price_minor` with `??`, not `||` demo fallbacks. A missing or zero budget/baseline fails closed instead of silently becoming `$1,600` / `$380`.

Files:
- `server/src/routes/recoveryRoutes.ts` (`POST /api/paypal/orders/create`)

### 2.7 Webhook security and idempotency

**`PAY-01` — Verification fails closed outside test mode**

If `PAYPAL_WEBHOOK_ID` is missing, empty, or a placeholder, the handler now returns `false` unless `NODE_ENV === 'test'`. A misconfigured deployment rejects unverified events rather than accepting forged ones.

**`PAY-02` — Event-level idempotency and retry semantics**

Added `processed_webhook_events`:

```sql
CREATE TABLE IF NOT EXISTS processed_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TEXT NOT NULL
);
```

Reconciliation inserts the PayPal event ID inside the same transaction as the state mutation and audit row. Duplicate deliveries return `200` with `{ received: true, duplicate: true }`. A reconciliation failure rolls back and returns `500` so PayPal retries.

Files:
- `server/src/routes/webhookRoutes.ts`
- `server/src/db/schema.sql`

`schema.sql` is executed with `CREATE TABLE IF NOT EXISTS` on database initialization, so existing local databases gain the table on next startup.

### 2.8 UI and documentation corrections

- `client/src/components/TaskFinancialsDrawer.tsx`: QR caption uses `formatMinorToUSD` instead of raw division.
- `client/src/components/AuditDrawer.tsx`: tab is “PayPal activity”; export is “Audit Report”; “Recovery Plans”; “State binding: SHA-256”.
- `README.md`: corrected RFC 6960/HMAC/signature claims.
- `client/src/components/ApprovalCheckoutModal.tsx`: “SHA-256 Approval Binding”; “Policy Invariant Matrix”; success copy no longer claims cryptographic signing.
- `client/src/components/FinOpsWidgetPanel.tsx`: “SHA-256 state fingerprints”.
- `client/src/context/CascadeStateContext.tsx`: approval toast says “fingerprint-bound approval”.

`PAY-06` is only a label fix. Bootstrap invoice creation is still not written to `paypal_transactions`; ledger semantics remain deferred.

---

## 3. Regression Tests Added

| Test | File | Original behavior (RED) | Fixed behavior (GREEN) |
|---|---|---|---|
| Channel3 unknown freight/tax → `UNKNOWN_COST_FIELD` | `server/src/__tests__/channel3Service.test.ts` | `shipping_minor` / `tax_minor` were `0` | Both `null`; policy `BLOCK` with `UNKNOWN_COST_FIELD` |
| Duplicate approval → `409` | `server/src/__tests__/apiIntegration.test.ts` | Second approval returned `200` and wrote another row | `409`; one approval and one approval audit event |
| Executed plans and approvals in state | `server/src/__tests__/apiIntegration.test.ts` | `recoveryPlans` / `userApprovals` absent | Executed plan and approval returned |
| Unknown order capture → `404` | `server/src/__tests__/apiIntegration.test.ts` | PayPal mock returned undefined → `500` | `404`; no PayPal call |
| Mismatched order/task capture → `409` | `server/src/__tests__/apiIntegration.test.ts` | Capture proceeded / `500` | `409`; no PayPal capture call |
| Duplicate capture → `409` | `server/src/__tests__/apiIntegration.test.ts` | Second capture returned `200` | `409`; PayPal called once |
| Duplicate webhook event ID | `server/src/__tests__/phase3.test.ts` | Second delivery applied state again | `200 duplicate`; one audit row; one processed-event row |
| Missing webhook ID in production | `server/src/__tests__/phase3.test.ts` | Unverified event returned `200` | `400`; task unchanged |
| Creation audit fingerprint `NULL` | `server/src/__tests__/dynamicProjectsIntegration.test.ts` | `sha256_<timestamp>` | `NULL` |
| Copilot live snapshot + tool round trip | `server/src/__tests__/studioAgentGrounding.test.ts` | Prompt contained demo constants; only one model call; answer was “Executed tools: …” | Prompt contains live project; tool result sent back; grounded final answer |
| Copilot rejects out-of-project scenario target | `server/src/__tests__/studioAgentGrounding.test.ts` | Tool executed and returned “Executed tools: triggerScenario” | Tool returns “does not belong”; grounded answer |

### RED/GREEN evidence

With the five fixed implementation files temporarily restored to their pre-fix versions:

```
Test Files  5 failed (5)
Tests       11 failed | 48 passed (59)
```

Representative failures:

- `expected +0 to be null` (Channel3 freight/tax)
- `expected 200 to be 409` (duplicate approval and duplicate capture)
- `expected 500 to be 404` / `expected 500 to be 409` (capture ownership)
- `expected 'sha256_1794470620687' to be null` (creation audit)
- `expected { received: true } to deeply equal { received: true, duplicate: true }` (webhook replay)
- `expected 200 to be 400` (fail-closed webhook verification)
- `expected 'Executed tools: inspectBlastRadius' to be 'Grounded: …'` (Copilot grounding)

After restoring the fixes:

```
Test Files  5 passed (5)
Tests       59 passed (59)
```

---

## 4. Verification Results

| Gate | Result |
|---|---|
| Full server suite | **189 / 189 passed** (13 files) |
| Client suite | **19 / 19 passed** (4 files) |
| Monorepo typecheck | **0 errors** |
| Production build | **Succeeded** |
| Targeted regression suite | **59 / 59 passed** after fixes; **11 failures** proven against original code |

Commands run:

```bash
npm test                    # server: 189 passed
npm test --workspace=client # client: 19 passed
npm run typecheck           # server + client: 0 errors
npm run build               # production build succeeded
```

Baseline before Stage 2 was 181 server tests and 19 client tests. The server suite grew to 189 with eight new regression tests; additional assertions were added to existing Channel3 and task-creation tests.

---

## 5. Deferred Product Decisions

These were intentionally **not** changed because they alter business rules, permission semantics, lifecycle behavior, or external contracts.

| ID | Decision needed | Current behavior retained |
|---|---|---|
| `FIN-03` | Canonical quote selection policy | Scenario A still uses `QuoteRepo.findByTask(...)[0]`; Copilot sorts by unit price |
| `FIN-04` | Quote history vs latest-quote view | Every refresh still appends observations |
| `FIN-05` | Invoice split invariant | `materials_unlock + deferred_labor === invoice_total` is not enforced |
| `PAY-03` | Payment vs physical staging | Capture still sets `MATERIALS_ORDERED` and `materials_in_warehouse = 1` |
| `APP-02` | Fingerprint scope and migration | Fingerprint still excludes proposed schedule dates/task versions |
| `OPS-01` | Global reset scope/authorization | `POST /api/projects/reset` still wipes all projects |
| `OPS-02` | Authentication and roles | No auth layer; demo assumes local/private use |
| `CLIENT-05` | Copilot mutation confirmation | `triggerScenario` still executes immediately |
| `UI-04` | Schedule date/duration source of truth | PATCH can persist contradictory `end_date` and `duration_days` |
| `DOC-01` | Live provisioning status per project | Bootstrap paths still use `skipPayPal` / `skipChannel3` with no UI status field |
| `PAY-06` | PayPal ledger semantics | Invoices are still not recorded as `INVOICE_CREATE` transactions |

`UI-01` (exposure labels) also remains a copy recommendation. The values themselves are distinct metrics, not bugs.

---

## 6. External Integration Limitations

No live PayPal Sandbox or Channel3 end-to-end flow was exercised during this work. Verification used:

- unit and integration tests with mocked PayPal Orders/Channel3 boundaries,
- local SQLite state transitions,
- deterministic AI fallbacks and mocked OpenAI responses.

**Not verified:**

- live PayPal invoice creation/send/partial payment/QR/reminder,
- live PayPal order approval/capture and error envelopes,
- real webhook transmission headers, certificate validation, and replay behavior,
- live Channel3 product search, availability, freight/tax fields, and rate limits,
- live Groq/OpenAI tool-calling round trips.

`npm run verify:sandbox` was **not** run because real sandbox credentials and a registered webhook ID were not available in this environment. README “Verified Live” language should still be treated as requiring that run.

---

## 7. Repository State

All changes remain **uncommitted**. No commit, tag, or push was performed.

Modified implementation and copy files:

- `server/src/db/schema.sql`
- `server/src/services/channel3Service.ts`
- `server/src/routes/projectRoutes.ts`
- `server/src/routes/recoveryRoutes.ts`
- `server/src/routes/studioAgentRoutes.ts`
- `server/src/routes/webhookRoutes.ts`
- `client/src/components/AuditDrawer.tsx`
- `client/src/components/ApprovalCheckoutModal.tsx`
- `client/src/components/FinOpsWidgetPanel.tsx`
- `client/src/components/TaskFinancialsDrawer.tsx`
- `client/src/context/CascadeStateContext.tsx`
- `README.md`

Earlier accepted work also remains uncommitted:

- `client/src/components/TopScenarioBar.tsx`
- `client/src/index.css`

New documents and tests:

- `CASCADEOS_FULL_AUDIT.md`
- `CASCADEOS_FIX_REPORT.md`
- `server/src/__tests__/studioAgentGrounding.test.ts`

No `.env` file or secret was added or tracked.

---

## 8. Remaining Risk

The product is materially safer and more truthful after Stage 2, but it is **not production-ready for public exposure**:

1. No authentication/authorization exists (`OPS-02`).
2. Payment capture still conflates payment with physical staging (`PAY-03`).
3. Quote selection is still order-dependent (`FIN-03`).
4. The destructive global reset remains open (`OPS-01`).
5. External integrations remain locally tested only.

Those are scope and product decisions, not silent code fixes.
