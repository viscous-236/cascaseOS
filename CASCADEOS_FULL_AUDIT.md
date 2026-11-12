# CascadeOS — Full Product & Engineering Audit

**Audit date:** 2026-11-12  
**Repository:** `/Users/vaibhavgoyal/Desktop/cascadeOS`  
**Scope:** Frontend, backend, SQLite schema, REST APIs, deterministic engines, PayPal/Channel3 integrations, AI Copilot tools, audit ledger, tests, and documentation.  
**Mode:** Read-only investigation first; fixes were applied only after root-cause confirmation (see `CASCADEOS_FIX_REPORT.md`).

---

## 1. Executive Summary

CascadeOS is a coherent demo product with a strong deterministic core: integer minor-unit money, a policy firewall, DAG-aware schedule recovery, append-only audit storage, and a thoughtful project-delivery ledger UI. The baseline is green:

| Gate | Baseline result |
|---|---|
| Server tests | **181 / 181 passed** (12 files) |
| Client tests | **19 / 19 passed** (4 files) |
| Monorepo typecheck | **0 errors** |
| Production build | **Succeeded** |

The audit still found material correctness and trust gaps. The most important are:

1. **The audit drawer and README overclaim cryptographic guarantees.** The implementation stores a plain SHA-256 hash of a selected state payload. It is not HMAC, not a digital signature, not RFC 6960, and there is no per-event hash chain or read-time verification.
2. **Unknown supplier freight and tax are persisted as `$0.00`.** The schema, UI, and policy engine all support `null = unknown`; the Channel3 ingestion path defeats that fail-closed design.
3. **Payment events are trusted too broadly.** Webhook verification fails open when `PAYPAL_WEBHOOK_ID` is absent, webhook events are not idempotent, and the capture endpoint does not prove that the order was created by CascadeOS for the task being mutated.
4. **Approval is not idempotent.** A plan can be approved repeatedly, creating duplicate approvals, duplicate PayPal split/reminder operations, and duplicate audit events.
5. **Copilot answers can contradict the data.** The system prompt hardcodes demo amounts, names a tool that does not exist, and the tool results are never sent back to the model for a grounded final answer.
6. **The recovery plan chosen by Scenario A is not chosen by a defined procurement policy.** `existingQuotes[0]` is an ordering artifact, not a business decision. This is why the Copilot can recommend a different supplier total than the plan.
7. **Audit exports are incomplete.** The project state endpoint returns only `PROPOSED`/`APPROVED` plans and no `user_approvals`, so executed plans and every approval disappear from the compliance export.

No live PayPal Sandbox or Channel3 end-to-end flow was exercised during this audit. External integration behavior is therefore **not verified** by this report; only code paths, local tests, and mocked boundaries were.

---

## 2. Method & Evidence Standard

The audit followed four rules:

1. **Screenshots are product evidence, not proof of intent.** A value was only called wrong after tracing its source and meaning.
2. **Every metric gets one authoritative definition.** If two screens calculate different things, they are documented as different metrics rather than forced to match.
3. **Root cause before fix.** No behavior was changed because a label “looked wrong.”
4. **Fail closed.** In financial and security paths, missing data must block, not silently become zero or true.

The following authoritative sources were used:

| Domain | Authoritative source | Notes |
|---|---|---|
| Projects | `projects` table, bootstrapped by `projectBootstrapService.ts` | Canonical demo is `proj_apex_clinic_01` |
| Tasks & schedule | `tasks` table; `criticalPathEngine.ts`; `scheduleRerouter.ts` | Task dates, durations, statuses, idle burn, SLA |
| Dependencies | `task_dependencies` table; `dagValidator.ts` | Finish-to-start edges with lag |
| Supplier quotes | `supplier_quotes` table (`QuoteRepo`) | `source_type` distinguishes incumbent vs Channel3 |
| Recovery proposals | `recovery_plans` table | Fingerprint binds selected quote + unlock + invoice |
| Approvals | `user_approvals` table | One row per sign-off attempt in the current implementation |
| Payments | `paypal_transactions` + `paypal_invoicingService` / `paypalOrdersService` | PayPal is authoritative only after live API response |
| Audit | `audit_events` table; append-only triggers in `schema.sql` | Rows cannot be updated or deleted |
| Policy decisions | `policyEngine.ts` | Deterministic, pure, independent of the LLM |
| Client state | `CascadeStateContext.tsx` + `cascadeApiClient.ts` | Mirrors the server state; never a separate source of truth |

### 2.1 Why the exposure numbers differ

These are **different metrics**, not necessarily a bug:

| Surface | Formula | Canonical Phase 2 value | Meaning |
|---|---|---|---|
| `criticalPathEngine.analyzeProjectBlastRadius` | All downstream blocked task durations × daily idle burn, plus SLA penalty | `$5,100` (`$3,660` idle + `$1,440` SLA) | Full blast radius if the blocked root is not recovered |
| Delivery Overview “overdue” summary | Only tasks whose invoice is already overdue × idle burn, plus SLA | `$2,800` (`2 × $680` + `$1,440`) | Exposure already realized by overdue phases only |
| `activeRecoveryPlan.total_exposure_minor` | Exposure computed when that proposal was created | `$5,100` in the canonical Scenario A plan | Latest recovery analysis, not a live recomputation |
| Active-plan idle labor alone | `idle_labor_cost_minor` | `$3,660` | Labor portion only; excludes SLA |

The formulas can be valid simultaneously. The product problem is **labeling**: the UI does not consistently say which exposure definition is on screen. See `UI-01`.

---

## 3. Severity & Category Taxonomy

**Severity**

- **Critical** — Allows unauthorized payment/state mutation, or fabricates a security/compliance guarantee.
- **High** — Produces materially wrong financial state, audit state, or operational decisions.
- **Medium** — Causes inconsistency, unreliable UX, or an incomplete workflow, but has a workaround or limited blast radius.
- **Low** — Copy, formatting, minor semantics, or maintainability.

**Category**

`audit` · `financial` · `payment` · `approval` · `procurement` · `copilot` · `state` · `security` · `operations` · `ui` · `docs` · `tests`

---

## 4. Confirmed Bugs

### AUD-01 — Audit reports and UI claim HMAC/RFC 6960 guarantees that do not exist

| Field | Detail |
|---|---|
| **Severity** | High (Critical if treated as a compliance claim) |
| **Category** | audit, docs, security |
| **Evidence** | `server/src/utils/moneyAndHash.ts:173` uses `createHash('sha256')` over canonical JSON. It does not use an HMAC key or a signing key. `client/src/components/AuditDrawer.tsx:177` renders `RFC 6960`; `:386` renders `Integrity: HMAC SHA-256`. `README.md:26` claims “RFC 6960 SHA-256 non-repudiation fingerprints”; `README.md:389` claims “RFC 6960 state signatures.” |
| **Implementation behavior** | A deterministic plain SHA-256 hash is computed over a selected proposal payload. It proves the approver saw that payload, assuming the hash itself is trusted. It does not prove who approved it, cannot detect a malicious rewrite of audit rows by a database owner, and is not an OCSP/RFC 6960 structure. |
| **Root cause** | The term “cryptographic non-repudiation” was used for a state-binding hash. No signing key, HMAC key, certificate, or hash-chain column exists in `schema.sql`. |
| **Expected behavior** | Either implement the claimed mechanism (keyed HMAC/signature plus per-event hash chain and verification endpoint), or label the existing mechanism accurately as a **SHA-256 approval-binding fingerprint**. |
| **Recommended fix** | Documentation and UI copy correction now; treat real non-repudiation as a separate product/security project. Do not claim HMAC, signatures, or RFC 6960 until implemented and tested. |
| **Regression tests** | Copy-level test not practical; add a test asserting the fingerprint format and deterministic behavior. Documentation review is the acceptance gate. |
| **Status** | Fixed (copy only) in Stage 2. Mechanism unchanged by design. |

---

### AUD-02 — `TASK_CREATED` and `DEPENDENCY_CREATED` audit rows contain fabricated fingerprints

| Field | Detail |
|---|---|
| **Severity** | Medium |
| **Category** | audit |
| **Evidence** | `server/src/routes/projectRoutes.ts:374` and `:640` write `` `sha256_${Date.now()}` `` into `state_fingerprint`. |
| **Implementation behavior** | The value looks like a hash but is only a timestamp. It is not reproducible, does not bind any state, and cannot be verified. |
| **Root cause** | A convenience value was used to satisfy the audit column, rather than computing a real fingerprint or using `NULL`. |
| **Expected behavior** | Audit rows that are not approval-bound should store `NULL`; rows that claim state binding should store a verifiable canonical hash. |
| **Recommended fix** | Store `NULL` for creation events. `audit_events.state_fingerprint` is nullable. Keep real fingerprints for approval, task updates, and plan execution. |
| **Regression tests** | Assert `TASK_CREATED`/`DEPENDENCY_CREATED` rows have `state_fingerprint IS NULL` and no `sha256_<timestamp>` pattern. |
| **Status** | Fixed in Stage 2. |

---

### AUD-03 — Compliance exports omit approvals and executed plans

| Field | Detail |
|---|---|
| **Severity** | High |
| **Category** | audit, state |
| **Evidence** | `server/src/routes/projectRoutes.ts:264-296` returns only `activeRecoveryPlan` with `status IN ('PROPOSED','APPROVED')` and does not return `recoveryPlans` or `userApprovals`. `client/src/types/domain.ts:270-276` already expects `recoveryPlans` and `userApprovals`. `client/src/components/AuditDrawer.tsx:81-85` exports `state.recoveryPlans.length` and `state.userApprovals`. |
| **Implementation behavior** | After a plan is executed, it disappears from the state payload. Every approval is absent from the export. The JSON report therefore shows `total_recovery_plans: 0` or a stale count and `user_approvals: []`, even when approvals exist. |
| **Root cause** | The state endpoint was written for the active recovery workflow, not for compliance export. The client types and export code were written for a richer payload that the server never provided. |
| **Expected behavior** | State should include all recovery plans for the project and all related approvals, while retaining `activeRecoveryPlan` for the current workflow. |
| **Recommended fix** | Add `recoveryPlans` (all statuses, newest first) and `userApprovals` (joined by plan) to the state response. Keep `activeRecoveryPlan` for backward compatibility. |
| **Regression tests** | After scenario + approval + capture, `GET /state` returns the executed plan and one approval; export summary counts are non-zero. |
| **Status** | Fixed in Stage 2. |

---

### FIN-01 — Unknown freight and tax are persisted as `$0.00`, bypassing the fail-closed policy check

| Field | Detail |
|---|---|
| **Severity** | High |
| **Category** | financial, procurement, security |
| **Evidence** | `server/src/services/channel3Service.ts:249-250` writes `shipping_minor: 0, tax_minor: 0`. `schema.sql` and both domain types permit `NULL`. `policyEngine.ts:103-109` blocks only when either value is `null`. `client/src/components/workspace/SupplierWorkspace.tsx` displays freight/tax as “Unknown” when `null`. |
| **Implementation behavior** | A Channel3 offer that does not quote delivery or tax is treated as having zero delivery and zero tax. The policy engine sees a fully known cost and may return `ALLOW` (with approval), not `UNKNOWN_COST_FIELD`. |
| **Root cause** | The ingestion path needed a number for the quote object and chose `0` instead of the documented sentinel `null`. |
| **Expected behavior** | Missing third-party cost data must be `null` and must produce `UNKNOWN_COST_FIELD`, blocking the action until freight/tax are known or explicitly confirmed. |
| **Recommended fix** | Set `shipping_minor` and `tax_minor` to `null` in `searchAndAuditSupplierProducts`. Keep `total_minor` as the known goods subtotal until delivered cost is known; the policy engine already treats null components as 0 for display math while blocking. |
| **Regression tests** | Unit test: new Channel3 quote has `shipping_minor === null`, `tax_minor === null`, and the policy evaluation returns `BLOCK` + `UNKNOWN_COST_FIELD`. |
| **Status** | Fixed in Stage 2. |

---

### FIN-02 — Copilot uses hardcoded demo amounts, a nonexistent tool name, and never sees its own tool results

| Field | Detail |
|---|---|
| **Severity** | High |
| **Category** | copilot, financial, state |
| **Evidence** | `server/src/routes/studioAgentRoutes.ts:192-194` names `refreshChannel3Quotes` but the registered tool is `auditSupplierQuoteWithChannel3`; the same prompt hardcodes `$2,800.00` idle exposure, `$1,396.00` unlock, and `$564.00` savings. `:229-251` executes tools and streams results, but never sends the tool results back to the model. `:283-303` returns the first assistant message or a generic “Executed tools” string. |
| **Implementation behavior** | For any project, the model is primed with the canonical demo amounts. If it calls a tool, the user sees tool JSON but the assistant text is not grounded in that result. A different project can receive Apex Clinic numbers. |
| **Root cause** | Demo copy was embedded in the system prompt; the chat handler implemented a single model round rather than the standard tool-call → tool-result → model round trip. |
| **Expected behavior** | The prompt should describe the tools that actually exist and include a compact, project-specific snapshot from SQLite. After tool execution, the results must be sent back to the model for a final grounded answer. |
| **Recommended fix** | Build the system prompt from the live project/tasks/quotes/active plan. Remove all hardcoded amounts. Rename the tool reference. Add a second completion round carrying `role: 'tool'` messages keyed by `tool_call_id`. Validate `triggerScenario` arguments before mutation. |
| **Regression tests** | Mock OpenAI: first response requests a tool, second response must receive the tool result and produce the final content. Prompt must not contain canonical demo constants for a different project. |
| **Status** | Fixed in Stage 2 for grounding and tool-name correctness. Mutation confirmation remains a product decision (`CLIENT-05`). |

---

### FIN-03 — Scenario A selects a supplier quote by row order, not by a defined procurement policy

| Field | Detail |
|---|---|
| **Severity** | High |
| **Category** | procurement, financial |
| **Evidence** | `server/src/services/scenarioExecutionService.ts:169-170` uses `QuoteRepo.findByTask(blockedTask.task_id)[0]`. `server/src/db/database.ts:423` orders by `observed_at DESC` only; rows created in the same refresh share the same timestamp, so ties are resolved by SQLite’s physical order. `channel3Service.ts:262-263` returns quotes sorted by unit price, but that order is not persisted. The Copilot path sorts by unit price (`scenarioExecutionService.ts:362`). |
| **Implementation behavior** | The recovery plan can bind the Staples quote at `$3,199.96` while the Copilot and Channel3 response present Philips at `$344.69`. Both numbers can be “real,” but the selected quote is arbitrary and the plan’s savings/exposure narrative becomes inconsistent. |
| **Root cause** | There is no canonical “best eligible quote” rule. Three layers each choose differently: API response order, repository order, and Copilot SQL. |
| **Expected behavior** | One documented rule, applied server-side, with deterministic tie-breaking. A reasonable policy is: lowest delivered total among quotes that are in stock, within phase budget, and within variance tolerance; then lowest unit price; then newest observation; then quote ID. |
| **Recommended fix** | Define and implement the policy in one place (for example `selectRecoveryQuote`), use it in Scenario A and the Copilot tool, persist the selected quote, and display the rule in the UI. This changes procurement selection policy, so it is **deferred pending product approval** rather than silently changed. |
| **Regression tests** | Seed three quotes with equal `observed_at`, different prices, one out of stock, one over budget; assert the same deterministic winner on every run and in both Scenario A and Copilot. |
| **Status** | Open — requires product decision. |

---

### FIN-04 — Channel3 refreshes create duplicate quote rows for the same product

| Field | Detail |
|---|---|
| **Severity** | Medium |
| **Category** | procurement, state |
| **Evidence** | `server/src/services/channel3Service.ts:208-259` always creates a new `quote_id` and inserts every result. It never checks `external_product_id` + merchant + observation window. `QuoteRepo.findByTask` returns all rows, so the quote register grows on every refresh. |
| **Implementation behavior** | Repeated “Run Live Audit” calls multiply identical products. This inflates the quote count, makes the selected-quote artifact worse (`FIN-03`), and makes historical comparisons noisy. |
| **Root cause** | Ingestion is append-only by design for observations, but there is no deduplication key or “latest observation” query contract. |
| **Expected behavior** | Either (a) preserve history but expose one latest quote per product/merchant to selection and UI, or (b) upsert within a refresh window. The right choice depends on whether price history is a product requirement. |
| **Recommended fix** | Add a canonical `latest quotes` query/view keyed by `(task_id, external_product_id, merchant_name)`; use it for selection and UI. Keep raw observations for audit if desired. |
| **Regression tests** | Two refreshes of the same product produce one visible quote and two observations if history is retained. |
| **Status** | Open — product decision on price-history retention. |

---

### FIN-05 — Invoice split invariant is not enforced

| Field | Detail |
|---|---|
| **Severity** | Medium |
| **Category** | financial, validation |
| **Evidence** | `server/src/schemas/onboardingSchemas.ts` validates each amount independently. `server/src/routes/projectRoutes.ts:346-347` defaults to `floor(40%)` and `floor(60%)`; `:483-485` accepts independent PATCHes. `TaskFinancialsDrawer` displays both fields independently. |
| **Implementation behavior** | A task can persist `materials_unlock_minor + deferred_labor_minor !== invoice_total_minor`, or amounts greater than the invoice. The canonical Phase 2 values happen to satisfy `$1,396 + $3,104 = $4,500`. |
| **Root cause** | No schema-level or route-level invariant ties the three amounts together. |
| **Expected behavior** | `materials_unlock_minor + deferred_labor_minor === invoice_total_minor` for every task, except explicit partial/adjustment states if the product supports them. |
| **Recommended fix** | Add a Zod `superRefine` for create and patch, and a SQLite `CHECK` only if a migration is acceptable. Return 400 with a clear message. This is a financial business rule, so **deferred pending product approval**. |
| **Regression tests** | Reject split sum mismatch; accept canonical `$1,396 + $3,104 = $4,500`. |
| **Status** | Open — requires product decision. |

---

### APP-01 — Recovery plans can be approved repeatedly

| Field | Detail |
|---|---|
| **Severity** | High |
| **Category** | approval, payment, audit |
| **Evidence** | `server/src/routes/recoveryRoutes.ts:66-119` loads the plan and verifies the fingerprint but never requires `plan.status === 'PROPOSED'`. `:197-207` inserts a new `user_approvals` row and sets status to `APPROVED` unconditionally. The only UI guard is `canApprove` in `ApprovalCheckoutModal.tsx:73`, which is not a security boundary. |
| **Implementation behavior** | Replaying the same approval request re-runs PayPal invoice split, QR generation, and reminder sending, then appends another approval and audit event. The plan’s fingerprint can still match, so the request succeeds. |
| **Root cause** | The endpoint was written as an action, not as an idempotent state transition. |
| **Expected behavior** | Only a `PROPOSED` plan may be approved. An approval for a non-proposed or already-approved plan returns `409` with the current status and does not call PayPal or write audit rows. |
| **Recommended fix** | Validate `plan.status === 'PROPOSED'` and reject an existing `user_approvals` row before any external call. |
| **Regression tests** | First approval succeeds; second approval returns `409`, creates no second approval, and does not call PayPal again. |
| **Status** | Fixed in Stage 2. |

---

### APP-02 — Approval fingerprint does not bind schedule dates or task versions

| Field | Detail |
|---|---|
| **Severity** | Medium |
| **Category** | approval, audit |
| **Evidence** | `server/src/routes/recoveryRoutes.ts:82-93` hashes project ID, blocked/promoted task IDs, invoice ID, unlock amount, product ID, supplier total, and currency. It excludes `new_promoted_start_date`, `new_blocked_start_date`, task versions, and dependency state. |
| **Implementation behavior** | A schedule date can change between proposal and approval without invalidating the fingerprint, as long as the financial/quote fields match. The user approves a financial payload, not the full proposed schedule. |
| **Root cause** | Fingerprint scope was optimized for quote tampering, not full proposal integrity. |
| **Expected behavior** | Approval should bind the complete proposed mutation: dates, task versions, dependencies, amounts, and quote identity. |
| **Recommended fix** | Extend the fingerprint payload and store the versioned canonical proposal. Requires migration/recompute of existing plans and a decision about backward compatibility. Deferred. |
| **Regression tests** | Change only a proposed start date → approval returns `409 STALE_FINGERPRINT_APPROVAL`. |
| **Status** | Open — approval semantics decision. |

---

### PAY-01 — PayPal webhook verification fails open when `PAYPAL_WEBHOOK_ID` is missing

| Field | Detail |
|---|---|
| **Severity** | Critical |
| **Category** | payment, security |
| **Evidence** | `server/src/routes/webhookRoutes.ts:74-78`: if the ID is `undefined`, empty, or starts with `your_`, the function returns `true` with a comment “skip.” The route then reconciles any event body. |
| **Implementation behavior** | A deployment that forgets `PAYPAL_WEBHOOK_ID` accepts unsigned, forged webhook events. A forged `INVOICING.INVOICE.PAID` marks an invoice paid; a forged `PAYMENT.CAPTURE.COMPLETED` can transition a task to `MATERIALS_ORDERED`. |
| **Root cause** | Local-development convenience was left in the production verification function. |
| **Expected behavior** | Missing webhook configuration must fail closed in production. Local testing must opt in explicitly, never by accident. |
| **Recommended fix** | Return `false` when the ID is missing in production; allow unverified webhooks only in test/local mode with an explicit environment flag (or test-only branch). Log a clear configuration error. |
| **Regression tests** | Missing ID + `NODE_ENV=production` → `400`; missing ID + test mode → existing reconciliation tests still pass. |
| **Status** | Fixed in Stage 2 (production fail-closed; test-mode preserved). |

---

### PAY-02 — Webhook events are not idempotent

| Field | Detail |
|---|---|
| **Severity** | High |
| **Category** | payment, audit |
| **Evidence** | `server/src/routes/webhookRoutes.ts:150-265` reconciles every delivery with no processed-event table or event-ID check. `:299-306` returns `200` even when reconciliation throws, specifically to stop retries. |
| **Implementation behavior** | PayPal retries can append duplicate `WEBHOOK_INVOICE_PAID` / `WEBHOOK_CAPTURE_COMPLETED` audit rows and repeat state transitions. A transient SQLite failure is acknowledged with `200`, so PayPal will not retry and the event is lost. |
| **Root cause** | The handler conflates “acknowledge receipt” with “successfully processed.” |
| **Expected behavior** | Persist the PayPal event ID exactly once. Duplicate deliveries return `200` without re-applying state. Failed processing returns `5xx` so PayPal retries, which is safe because processing is now idempotent. |
| **Recommended fix** | Add a `processed_webhook_events` table (`event_id` primary key, type, processed_at). Insert inside the same transaction as the reconciliation. Return `200` on duplicate, `500` on processing failure. |
| **Regression tests** | Deliver the same event twice → one state change and one audit row; second response is `200` with `duplicate: true`. Force a reconciliation error → `500`. |
| **Status** | Fixed in Stage 2. |

---

### PAY-03 — Payment capture is treated as physical materials staging

| Field | Detail |
|---|---|
| **Severity** | High |
| **Category** | payment, project lifecycle |
| **Evidence** | `server/src/routes/recoveryRoutes.ts:548-553` sets `schedule_status = 'MATERIALS_ORDERED', materials_in_warehouse = 1` on capture. `server/src/routes/webhookRoutes.ts:233-237` does the same for `PAYMENT.CAPTURE.COMPLETED`. |
| **Implementation behavior** | Paying for materials instantly marks them as physically in the warehouse. The release chain then shows “Materials: Staged,” and the policy engine’s `MATERIALS_NOT_IN_WAREHOUSE` check no longer protects later promotion. |
| **Root cause** | The status enum has no separate “PAID, awaiting delivery” state, so capture was mapped directly to the closest-looking status. |
| **Expected behavior** | Payment should transition to a paid/ordered state. Physical staging should require an explicit receiving action or delivery confirmation. |
| **Recommended fix** | Introduce a distinct state (for example `MATERIALS_PAID_AWAITING_DELIVERY`) or set only `schedule_status = 'MATERIALS_ORDERED'` and leave `materials_in_warehouse` unchanged. This changes payment semantics and lifecycle behavior, so **deferred pending product approval**. |
| **Regression tests** | Capture does not set `materials_in_warehouse = 1`; release chain shows “Paid, awaiting delivery”; a separate staging action sets staged. |
| **Status** | Open — requires product decision. |

---

### PAY-04 — Capture endpoint does not verify that the order belongs to CascadeOS or to the claimed task

| Field | Detail |
|---|---|
| **Severity** | Critical |
| **Category** | payment, security |
| **Evidence** | `server/src/routes/recoveryRoutes.ts:503-553` validates the body `taskId` exists and the optional `planId` relationship, then calls PayPal with the path `orderId` and mutates `taskId`. It never queries the `ORDER_CREATE` row for that `orderId` to confirm `task_id` or `plan_id`. |
| **Implementation behavior** | An attacker who knows any task ID and any PayPal order ID (their own sandbox order, for example) can call capture with a mismatched `taskId`. If PayPal returns `COMPLETED` for that order, the arbitrary task is marked `MATERIALS_ORDERED` and staged. |
| **Root cause** | The route trusts request correlation instead of the persisted order record. |
| **Expected behavior** | A capture must match a stored `ORDER_CREATE` row for the same `orderId`, `taskId`, and (when supplied) `planId`. Unknown orders return `404`; mismatches return `409`. |
| **Recommended fix** | Look up the `ORDER_CREATE` transaction before the PayPal call. Validate task/project/plan. Reject a second capture of the same order. |
| **Regression tests** | Capture with an unknown order → `404`; capture with a different task → `409`; valid order → `200`; second capture → `409`. |
| **Status** | Fixed in Stage 2. |

---

### PAY-05 — Order policy uses invented fallback financial values

| Field | Detail |
|---|---|
| **Severity** | Medium |
| **Category** | payment, policy |
| **Evidence** | `server/src/routes/recoveryRoutes.ts:386-405` passes `phaseBudgetMaxMinor: task.phase_hardware_budget_max_minor || 160000`, `historicalUnitPriceMinor: task.historical_unit_price_minor || 38000`, and `materials_in_warehouse: true`, `hasExplicitUserApproval: true`. |
| **Implementation behavior** | A task with a missing or zero budget is evaluated against `$1,600`; a missing historical baseline is evaluated against `$380`. This can turn a should-block order into an `ALLOW`. `materials_in_warehouse: true` is defensible for a procurement evaluation (materials are not staged yet), but it must be documented because it bypasses check 4. |
| **Root cause** | `||` was used as a null fallback, so legitimate zero values are replaced. |
| **Expected behavior** | Use persisted values exactly. A missing/zero budget must fail closed (`TOTAL_EXCEEDS_PHASE_BUDGET`), not inherit a demo default. Keep `hasExplicitUserApproval` tied to the verified approval record. |
| **Recommended fix** | Replace `||` with `??` and remove demo fallbacks. Add a comment explaining the procurement semantics of `materials_in_warehouse`. |
| **Regression tests** | Task with `phase_hardware_budget_max_minor = 0` → order blocked; missing historical price → no invented baseline; valid canonical task → unchanged `ALLOW`. |
| **Status** | Fixed in Stage 2 for fallback values. The `materials_in_warehouse` semantics and payment lifecycle remain `PAY-03`. |

---

### PAY-06 — Bootstrap invoices are not recorded as PayPal ledger transactions

| Field | Detail |
|---|---|
| **Severity** | Medium |
| **Category** | audit, payment |
| **Evidence** | `server/src/services/projectBootstrapService.ts` creates and sends invoices but does not insert `INVOICE_CREATE` rows into `paypal_transactions`. The audit drawer labels the tab `PayPal (${paypalTransactions.length})` (`AuditDrawer.tsx:218`). |
| **Implementation behavior** | A project can have six live invoices and `PayPal (0)` because no transaction rows exist yet. The label reads like an invoice count but is actually an activity count. The JSON export has the same ambiguity. |
| **Root cause** | `paypal_transactions` was used for order/split events, while invoice creation remained only in task fields. The UI label did not state the distinction. |
| **Expected behavior** | Either record every invoice lifecycle event in `paypal_transactions`, or label the tab and export explicitly as “PayPal activity (recorded transactions).” |
| **Recommended fix** | Short term: label it accurately. Medium term: write `INVOICE_CREATE` rows during provisioning, with the invoice ID and amount. Ledger semantics are a product decision, so only the label is changed now. |
| **Regression tests** | After bootstrap, audit export distinguishes invoice count from transaction count. |
| **Status** | Partially fixed (label accuracy). Ledger recording deferred. |

---

### OPS-01 — `/api/projects/reset` is a destructive global reset with no scope or authorization

| Field | Detail |
|---|---|
| **Severity** | High |
| **Category** | operations, security, project lifecycle |
| **Evidence** | `server/src/routes/projectRoutes.ts:170-190` deletes `user_approvals`, `paypal_transactions`, `recovery_plans`, `supplier_quotes`, `task_dependencies`, `tasks`, and **all** `projects`. It does not delete `audit_events` (append-only), then bootstraps with `{ forceReset: true, skipPayPal: true, skipChannel3: true }`. |
| **Implementation behavior** | Any caller can wipe every tenant’s project. The response says “All projects and tables reset cleanly to factory defaults,” but the new canonical project has no live PayPal invoices or Channel3 quotes. Old audit events remain, so the ledger and state diverge. |
| **Root cause** | A demo convenience endpoint was implemented without tenant scope or an admin boundary. |
| **Expected behavior** | Reset either one project (`/projects/:projectId/reset`) or the entire demo database behind an explicit admin control. Preserve audit intent by appending a reset event. Re-provision live integrations or clearly report they were skipped. |
| **Recommended fix** | Scope the endpoint, add an admin confirmation token, and return integration status. This is destructive lifecycle behavior, so **deferred pending product approval**. |
| **Regression tests** | Reset one project leaves others untouched; reset appends an audit event; response reports `paypalSkipped`/`channel3Skipped`. |
| **Status** | Open — requires product decision. |

---

### OPS-02 — No authentication or authorization layer

| Field | Detail |
|---|---|
| **Severity** | Critical for any public deployment; acceptable only as a local demo limitation |
| **Category** | security |
| **Evidence** | Express routes are mounted without auth middleware. Anyone with the URL can create projects, approve plans, create PayPal sandbox orders, capture them, and reset data. |
| **Implementation behavior** | The application has no user identity, session, API key, or role check. `approverActor` is a free-text string. |
| **Root cause** | The hackathon demo scope did not include identity. |
| **Expected behavior** | At minimum, an operator API key or session gate for mutating routes; ideally per-user roles for approval. |
| **Recommended fix** | Treat as a documented deployment limitation. If public deployment is intended, add authentication before exposing the service. This is a scope/product decision, not a silent code change. |
| **Regression tests** | Unauthenticated mutation → `401`; approver identity comes from the session, not the body. |
| **Status** | Open — deployment scope decision. |

---

### UI-01 — Exposure labels do not identify which formula is being shown

| Field | Detail |
|---|---|
| **Severity** | Medium |
| **Category** | ui, financial |
| **Evidence** | `TopScenarioBar` shows `activePlan.total_exposure_minor` labeled “From the latest recovery analysis” when a plan exists, and a fallback formula otherwise. `DeliveryOverview` sums overdue tasks. `criticalPathEngine` sums all downstream blocked tasks. |
| **Implementation behavior** | Users see `$2,800`, `$3,660`, and `$5,100` in different places without a consistent definition. This looks like contradictory math. |
| **Root cause** | Labels describe location (“overview”, “latest recovery analysis”) rather than scope (“all downstream blocked work”, “overdue phases only”, “labor only”). |
| **Expected behavior** | Every exposure number states its scope and formula in the label or tooltip. |
| **Recommended fix** | Copy-only clarification: “All downstream blocked work (idle + SLA)”, “Overdue phases only”, “Idle labor only”, “Latest proposal snapshot.” |
| **Regression tests** | Visual/copy review; no behavioral test. |
| **Status** | Open — copy change recommended (not mixed into Stage 2 to avoid destabilizing the accepted `TopScenarioBar` design). |

---

### UI-02 — QR code caption uses raw division instead of the money formatter

| Field | Detail |
|---|---|
| **Severity** | Low |
| **Category** | ui, financial |
| **Evidence** | `client/src/components/TaskFinancialsDrawer.tsx:352` renders `${task.materials_unlock_minor / 100}`. |
| **Implementation behavior** | Values render without thousands separators or fixed cents; a non-USD or fractional case would be misleading. |
| **Root cause** | Inline arithmetic bypassed `formatMinorToUSD`. |
| **Expected behavior** | Use the shared formatter. |
| **Recommended fix** | Replace with `formatMinorToUSD(task.materials_unlock_minor)`. |
| **Regression tests** | Component test or lint rule; small formatting fix. |
| **Status** | Fixed in Stage 2. |

---

### UI-03 — “PayPal (n)” tab label is ambiguous

| Field | Detail |
|---|---|
| **Severity** | Low |
| **Category** | ui, audit |
| **Evidence** | `AuditDrawer.tsx:218` counts `paypalTransactions.length`, not invoices or payments. |
| **Implementation behavior** | A project with six invoices can show `PayPal (0)` until an order/split transaction occurs. |
| **Root cause** | The label does not say “activity” or “transactions.” |
| **Expected behavior** | “PayPal activity (n)” or separate invoice and transaction counts. |
| **Recommended fix** | Rename the tab and export summary field. |
| **Regression tests** | Copy review. |
| **Status** | Fixed in Stage 2. |

---

### UI-04 — Task schedule dates and duration can contradict each other

| Field | Detail |
|---|---|
| **Severity** | Medium |
| **Category** | ui, state, scheduling |
| **Evidence** | `TaskFinancialsDrawer.tsx:90-94` sends `duration_days`, `start_date`, and `end_date` together. `projectRoutes.ts:469-475` computes `end_date` from duration+start, then overwrites it with the submitted `end_date`. |
| **Implementation behavior** | The persisted `end_date` can disagree with `start_date + duration_days - 1`. The Gantt and exposure engine then disagree about the task length. |
| **Root cause** | Three independently editable fields with no canonical derivation rule. |
| **Expected behavior** | Choose one source of truth: either end date is derived from start + duration, or duration is derived from start/end. Reject contradictory payloads. |
| **Recommended fix** | UI edit one pair; server validates consistency. This is scheduling/lifecycle behavior, so deferred pending product approval. |
| **Regression tests** | Contradictory payload → `400`; derived end date is consistent after patch. |
| **Status** | Open — product decision. |

---

### CLIENT-05 — Copilot can execute state-changing scenarios without confirmation

| Field | Detail |
|---|---|
| **Severity** | High |
| **Category** | copilot, security, UX |
| **Evidence** | `studioAgentRoutes.ts:148-159` executes `triggerScenario` immediately. `AgentChatModal.tsx:122-124` refreshes state whenever any tool result exists. There is no confirmation gate or dry-run mode. |
| **Implementation behavior** | A natural-language request or a model misclassification can mutate the project (mark invoices overdue, create plans, reroute schedules) without an explicit user confirmation. |
| **Root cause** | Tool execution is treated as read-only analysis even for mutating tools. |
| **Expected behavior** | Read-only tools may run automatically. Mutating tools must return a proposed action and require an explicit confirmation endpoint/UI step. |
| **Recommended fix** | Split tools into read-only and mutating; require a confirmation token or a second request for `triggerScenario`. This is a product/UX decision, so **deferred pending approval**. |
| **Regression tests** | Mutating tool without confirmation → no state change; with confirmation → executes once. |
| **Status** | Open — requires product decision. |

---

### DOC-01 — README and UI copy describe different product behavior than the code

| Field | Detail |
|---|---|
| **Severity** | Medium |
| **Category** | docs |
| **Evidence** | Beyond `AUD-01`: README claims “Zero-Mock Production Sandbox / Verified Live,” but `GET /api/projects` auto-bootstraps with `skipPayPal: true, skipChannel3: true` (`projectRoutes.ts:128-130`), and the reset path does the same. The README also describes live invoice/quote provisioning on first load. |
| **Implementation behavior** | A fresh database can show the canonical project without live invoices or quotes, depending on which endpoint created it. |
| **Root cause** | Bootstrap has multiple call sites with different integration flags. |
| **Expected behavior** | Documentation states exactly which paths provision live integrations and which do not. The UI should surface integration state per project. |
| **Recommended fix** | Copy correction and a `provisioning` status field; do not silently claim live data. |
| **Regression tests** | Documentation review; integration-state test for bootstrap flags. |
| **Status** | Open — related to product provisioning decision. |

---

## 5. Potential Bugs & Product Decisions Requiring Clarification

These are plausible issues, but changing them would alter a business rule, permission model, or external contract. They were **not** changed in Stage 2.

| ID | Issue | Why it needs a product decision |
|---|---|---|
| PD-01 | Quote selection policy (`FIN-03`) | “Cheapest” vs “best compliant” vs “incumbent replacement” are different procurement policies. |
| PD-02 | Payment → staging semantics (`PAY-03`) | Requires a new lifecycle state or receiving workflow. |
| PD-03 | Invoice split invariant (`FIN-05`) | Need to confirm whether partial/adjustment states are allowed. |
| PD-04 | Reset scope (`OPS-01`) | Need tenant/admin model and whether audit rows should be preserved. |
| PD-05 | Copilot mutation confirmation (`CLIENT-05`) | Need confirmation UX and API contract. |
| PD-06 | Authentication (`OPS-02`) | Need deployment audience and identity provider. |
| PD-07 | Approval fingerprint scope (`APP-02`) | Need backward compatibility/migration plan for existing plans. |
| PD-08 | Task date/duration source of truth (`UI-04`) | Need scheduling UX decision (edit dates vs duration). |
| PD-09 | Quote history retention (`FIN-04`) | Need to know whether price observations are a product feature. |
| PD-10 | Missing webhook ID in local dev (`PAY-01`) | Test-mode bypass is preserved; production policy is now fail-closed. |

---

## 6. Missing Functionality

1. **No per-project integration status.** The UI cannot tell whether a project has live PayPal invoices, live Channel3 quotes, or only placeholders.
2. **No receive/delivery confirmation step.** Payment is the only signal that materials are staged.
3. **No approval revocation or supersession workflow.** A plan can be approved or blocked, but not explicitly withdrawn with an audit reason.
4. **No read-time audit verification.** There is no endpoint or UI action that recomputes fingerprints or verifies a hash chain.
5. **No pagination or retention policy for audit events.** A long-lived project will grow the audit payload indefinitely.
6. **No rate limiting or request authentication.** Mutating endpoints are open.
7. **No operator-visible distinction between sandbox and production PayPal credentials.** The environment is shown in health, but not at the point of payment.
8. **No explicit currency conversion.** Multi-currency projects are stored with a single currency; cross-currency quotes fail policy, which is correct, but there is no FX workflow.

---

## 7. Improvement Opportunities

- **Single recovery-plan selector.** Centralize quote ranking and plan construction so Scenario A, Scenario B, and Copilot cannot diverge (`FIN-03`, `FIN-04`).
- **Canonical audit event builder.** Replace repeated inline SQL with one function that enforces `state_fingerprint` rules and event taxonomy (`AUD-02`).
- **Event-sourced payment reconciliation.** Model invoice, order, and capture events as append-only rows with a projection into task state (`PAY-02`, `PAY-06`).
- **Policy result persistence.** Store the full policy evaluation JSON with every approval, not only reason codes.
- **Exposure glossary in the UI.** A small “What this number means” popover would resolve most of the apparent cross-screen conflict (`UI-01`).
- **Bootstrap integration flags in the response.** Return `paypalProvisioned`, `channel3Provisioned`, and `skipped` reasons.
- **Contract tests for webhook signatures and PayPal error envelopes.** Current tests cover the happy path and some validation, but not retry/duplicate semantics.
- **Bundle budget.** The production build ships large Bryntum and AG Studio chunks (about 5 MB and 5.4 MB before gzip). This is expected for the feature set but should be watched.

---

## 8. External Integration Verification Status

| Integration | What was verified | What was **not** verified |
|---|---|---|
| PayPal Invoicing v2 | Typed client, request construction, mocked lifecycle in tests, local state transitions | Live sandbox invoice creation/send/partial-payment/QR/reminder against a real merchant |
| PayPal Orders v2 | Typed client, mocked order create/capture, local fingerprint validation | Live sandbox order approval/capture, buyer-country restrictions, capture error envelopes |
| PayPal Webhooks | Signature-verification code path and mocked reconciliation | Real PayPal transmission headers, certificate URL validation, replay behavior |
| Channel3 Product Graph | Typed request, minor-unit conversion, caching, mocked search responses | Live product search, availability semantics, merchant/shipping/tax fields, rate limits |
| LLM / Copilot | Deterministic test-mode fallback and schema validation | Live model tool-calling round trip against Groq/OpenAI |

**Conclusion:** External integrations are **implemented and locally tested**, but **not verified end-to-end** in this audit. The README’s “Verified Live” badge should be treated as aspirational until `npm run verify:sandbox` is run successfully with real credentials.

---

## 9. Baseline Reproduction

Commands used:

```bash
npm test                 # server: 181 passed
npm test --workspace=client  # client: 19 passed
npm run typecheck        # server + client: 0 errors
npm run build            # production build succeeded
```

No test failures were observed before changes. The findings above are therefore not regressions from a failing baseline; they are latent correctness and trust gaps.

---

## 10. Prioritized Remediation Plan

### Stage 2 — Safe, confirmed fixes applied immediately

| Priority | Finding | Change |
|---|---|---|
| P0 | `PAY-01` | Production webhook verification fails closed when the webhook ID is missing; test mode retains the explicit bypass. |
| P0 | `PAY-02` | Add processed-webhook-event idempotency; return `500` on processing failure. |
| P0 | `PAY-04` | Capture validates the stored `ORDER_CREATE` row, task, and plan; reject duplicate capture. |
| P1 | `APP-01` | Approval requires `PROPOSED`; reject duplicate approval before PayPal calls. |
| P1 | `FIN-01` | Channel3 unknown shipping/tax persisted as `null`, triggering `UNKNOWN_COST_FIELD`. |
| P1 | `FIN-02` | Copilot prompt uses live project data, correct tool names, and a second grounded completion round. |
| P1 | `AUD-03` | State endpoint returns all plans and approvals. |
| P1 | `AUD-02` | Creation audit events stop fabricating hash-like timestamps. |
| P2 | `PAY-05` | Order policy uses persisted financial values, not `||` demo fallbacks. |
| P2 | `AUD-01`, `UI-02`, `UI-03` | Accurate SHA-256/audit copy and money formatting. |

### Stage 3 — Requires product approval (do not change silently)

| Finding | Decision needed |
|---|---|
| `FIN-03`, `FIN-04` | Canonical quote ranking and price-history retention |
| `FIN-05` | Invoice split invariant and allowed adjustment states |
| `PAY-03` | Payment vs physical staging lifecycle |
| `APP-02` | Full proposal fingerprint scope and migration |
| `OPS-01` | Reset scope and admin authorization |
| `CLIENT-05` | Copilot mutation confirmation |
| `OPS-02` | Authentication model |
| `UI-04` | Schedule date/duration source of truth |

### Stage 4 — Hardening / product improvements

- Audit hash chain and read-time verification, if non-repudiation is a real requirement.
- Per-project integration status and provisioning indicators.
- Webhook replay/certificate validation contract tests.
- Pagination and retention for audit data.
- Live sandbox verification run with real credentials.

---

## 11. Acceptance Criteria for the Fix Stage

1. All new regression tests fail before the fix and pass after it.
2. Existing 200 tests remain green.
3. Typecheck and production build remain clean.
4. No financial business rule, approval permission, procurement selection policy, payment semantic, project lifecycle behavior, recovery execution semantic, or external integration contract is changed without an explicit product decision recorded in this document.
5. Any external integration claim is backed by a live verification run or explicitly marked unverified.
