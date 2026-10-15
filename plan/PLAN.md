---
goal: 'End-to-End Zero-Mock Architecture and Phasewise Implementation Plan for CascadeOS (Payment-Coupled Schedule & Supply-Chain Operating System)'
version: '1.0'
date_created: '2026-10-14'
last_updated: '2026-10-14'
owner: 'Vaibhav Goyal'
status: 'Planned'
tags: ['architecture', 'feature', 'paypal', 'ag-studio', 'bryntum', 'channel3', 'apimatic', 'render', 'agentic-commerce']
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

This implementation plan is the single source of truth for building, testing, and deploying **CascadeOS** for the PayPal AI Hackathon (`https://paypalaihackathon.devpost.com/`)[cite: 1]. **CascadeOS** couples multi-phase project schedules in **Bryntum Gantt** (`@bryntum/gantt-react`) with live **PayPal Sandbox Invoicing v2**, **PayPal Sandbox Orders v2 Checkout**, **PayPal Agent Toolkit** (`@paypal/agent-toolkit`), **Channel3 Live Product Graph APIs**, and **AG Studio 3.0 Embedded Analytics** (`ag-studio-react`)[cite: 1].

Every component specified in this plan executes real network calls against live Sandbox/Production APIs and persists state in a real relational database (`better-sqlite3` with WAL mode enabled). Zero mock services, fake transaction IDs, or stubbed payment responses are permitted anywhere in the codebase[cite: 1].

---

## 1. Requirements & Constraints

### Functional & Domain Requirements

- **REQ-001**: The system MUST persist all projects, task nodes, task dependencies, PayPal invoice records, Channel3 live product quotes, recovery plans, and append-only audit events in a persistent SQLite database (`server/data/cascade_os.sqlite`) using `better-sqlite3` with `PRAGMA journal_mode = WAL;` and `PRAGMA foreign_keys = ON;`.
- **REQ-002**: All monetary values across database columns, TypeScript interfaces, policy evaluations, and API payloads MUST be stored and evaluated as integer minor units (e.g., USD cents where `$1,396.00` = `139600`) to eliminate IEEE-754 floating-point drift[cite: 1].Conversion to major-unit decimal strings (`"1396.00"`) MUST occur exclusively inside the outbound PayPal REST serializer (`formatMinorToPayPalValue(minorUnits, currency)`).
- **REQ-003**: The backend MUST authenticate directly with the live PayPal Sandbox OAuth2 endpoint (`POST https://api-m.sandbox.paypal.com/v1/oauth2/token`) using `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`, caching the bearer token in memory until `expires_in - 60` seconds.
- **REQ-004**: Project creation and database seeding (`POST /api/projects/bootstrap`) MUST execute real PayPal Invoicing v2 API calls (`POST /v2/invoicing/invoices` and `POST /v2/invoicing/invoices/{invoice_id}/send`) to generate and store genuine PayPal Sandbox `invoice_id` strings for each billable project phase[cite: 1].
- **REQ-005**: The Critical-Path & Blast-Radius Engine (`server/src/engine/criticalPathEngine.ts`) MUST deterministically traverse the directed acyclic graph (DAG) of project tasks, identify all tasks blocked by an `OVERDUE` or `UNPAID` PayPal invoice, compute exact idle crew hours and SLA penalty exposure in integer minor units, and identify candidate tasks eligible for promotion (`hard_dependencies` satisfied and `materials_in_warehouse === 1`).
- **REQ-006**: The Supplier Arbitrage Service (`server/src/services/channel3Service.ts`) MUST execute real HTTP requests to the live Channel3 REST API (`https://api.trychannel3.com/v0/search` and `https://api.trychannel3.com/v0/products/{id}`) using header `x-api-key: process.env.CHANNEL3_API_KEY` to retrieve real-time product prices, stock availability, merchant names, and canonical URLs, persisting the observation timestamp (`observed_at`) in SQLite[cite: 1].
- **REQ-007**: The Deterministic Policy Firewall (`server/src/engine/policyEngine.ts`) MUST evaluate every proposed schedule mutation, invoice split, and supplier order independently of the LLM and return a structured decision (`ALLOW`, `BLOCK`, or `REQUIRE_APPROVAL`) with machine-readable `reason_codes` (`HARD_DEPENDENCY_VIOLATION`, `MATERIALS_NOT_IN_WAREHOUSE`, `VENDOR_PRICE_CREEP_EXCEEDED`, `TOTAL_EXCEEDS_PHASE_BUDGET`, `CURRENCY_MISMATCH`, `UNKNOWN_COST_FIELD`, `STALE_FINGERPRINT_APPROVAL`)[cite: 1].
- **REQ-008**: Every recovery plan MUST generate a deterministic SHA-256 fingerprint (`state_fingerprint`) computed over the canonical JSON serialization of `{ projectId, blockedTaskId, promotedTaskId, invoiceId, unlockAmountMinor, channel3ProductId, supplierTotalMinor, currency }`[cite: 1].
- **REQ-009**: When a user approves a recovery plan (`POST /api/recovery-plans/:planId/approve-schedule-and-split`), the backend MUST verify that the newly recomputed `state_fingerprint` matches the approved fingerprint[cite: 1], update the live PayPal Sandbox Invoice via `PUT https://api-m.sandbox.paypal.com/v2/invoicing/invoices/{invoice_id}` to configure partial payment Unlock threshold (`allow_partial_payment: true`, `minimum_amount_due` set to the materials unlock amount), generate a real Base64 PNG QR code via `POST https://api-m.sandbox.paypal.com/v2/invoicing/invoices/{invoice_id}/generate-qr-code`, and dispatch a reminder via `POST https://api-m.sandbox.paypal.com/v2/invoicing/invoices/{invoice_id}/remind`.
- **REQ-010**: When a user initiates supplier arbitrage checkout (`POST /api/paypal/orders/create`), the backend MUST re-verify the policy decision (`decision === 'ALLOW'`) and `state_fingerprint` immediately prior to calling `POST https://api-m.sandbox.paypal.com/v2/checkout/orders` with `PayPal-Request-Id` idempotency headers[cite: 1].
- **REQ-011**: Order settlement (`POST /api/paypal/orders/:orderId/capture`) MUST call `POST https://api-m.sandbox.paypal.com/v2/checkout/orders/{order_id}/capture` and ONLY transition the task state to `MATERIALS_ORDERED` when the authoritative PayPal response payload contains `status === "COMPLETED"` and a valid `purchase_units[0].payments.captures[0].id`[cite: 1].
- **REQ-012**: The backend MUST expose a real webhook receiver (`POST /api/webhooks/paypal`) that verifies incoming PayPal webhook signatures via `POST https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature` and reconciles `INVOICING.INVOICE.PAID`, `INVOICING.INVOICE.UPDATED`, and `PAYMENT.CAPTURE.COMPLETED` events into SQLite[cite: 1].
- **REQ-013**: The frontend MUST render a live **Bryntum Gantt** component (`@bryntum/gantt-react`) bound to the backend task and dependency endpoints, displaying custom task bar badges for live PayPal invoice status (`PAID`, `OVERDUE`, `PARTIAL_UNLOCKED`, `MATERIALS_ORDERED`) and executing animated schedule updates when a recovery plan is applied.
- **REQ-014**: The frontend MUST embed **AG Studio 3.0** (`<AgStudio />` from `ag-studio-react`) in `mode="edit"` configured with three live client-side Data Engine sources (`project_tasks`, `supplier_quotes`, `audit_events`) synchronized with the backend REST API.
- **REQ-015**: The frontend MUST register two custom React widgets inside AG Studio via `createWidgets` (`CascadeRecoveryWidget` and `FriendlyNudgeScoreboardWidget`), each implementing `AgWidgetDefinition` with `dataMapping`, `formatShape`, `ai` metadata, `widgetApi.getData()`, `widgetApi.setDisplayState()`, and `widgetApi.toggleCrossFilter()`.
- **REQ-016**: The frontend MUST configure the **AG Studio Agent Framework** (`directLlmRunner` or `clientToolRunner`) with a custom primary agent (`cascade-finops-agent`) that defines domain tools (`inspectBlastRadius`, `auditSupplierQuoteWithChannel3`) and delegates dashboard construction to AG Studio's built-in `data` and `widget` agents via `tools.delegateTo(['data', 'widget'])`.
- **REQ-017**: The frontend MUST include a live **PayPal JS SDK v6** checkout integration (`@paypal/react-paypal-js` / PayPal v6 SDK script with `enable-funding=paylater`) inside the Approval & Checkout Modal to complete real Sandbox buyer approvals in the browser[cite: 1].
- **REQ-018**: The frontend MUST provide a clearly labeled **Live Scenario Trigger Bar** executing real backend state transitions and live API calls for **Scenario A** (Overdue Client Invoice Reroute & PayPal Invoice Split/QR), **Scenario B** (Supplier 28.95% Price-Creep Block & Channel3 Arbitrage PayPal Checkout), and **Scenario C** (Adversarial Hard-Dependency & Budget Violation Block)[cite: 1].

### Security Requirements

- **SEC-001**: All secrets (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `CHANNEL3_API_KEY`, `OPENAI_API_KEY`, `AG_STUDIO_LICENSE_KEY`) MUST be loaded exclusively from environment variables validated at startup via Zod (`server/src/config/env.ts`) and MUST NEVER be hardcoded or committed to git[cite: 1].
- **SEC-002**: External strings originating from Channel3 product descriptions, supplier invoice memos, or user inputs MUST be treated as untrusted data and isolated from system prompt instructions and policy engine thresholds to prevent prompt injection[cite: 1].
- **SEC-003**: The LLM MUST NEVER be granted direct tool execution privileges to call `createOrder`, `captureOrder`, or `updateInvoice` without passing through `policyEngine.evaluateRecoveryAction()` and verifying an explicit human approval signature record in SQLite[cite: 1].
- **SEC-004**: All mutating PayPal POST requests (`create_invoice`, `create_order`, `capture_order`) MUST include a deterministic `PayPal-Request-Id` header derived from the action fingerprint to prevent duplicate payment or invoice creation on network retries[cite: 1].
- **SEC-005**: All API inputs on the Express server MUST be validated using strict Zod schemas (`server/src/schemas/apiSchemas.ts`); malformed requests MUST fail closed with HTTP `400 Bad Request`[cite: 1].
- **SEC-006**: Unknown or missing shipping, tax, or fee fields from any external data source MUST be represented as `null` (never coerced to `0`) and MUST cause `policyEngine.ts` to fail closed with `decision: 'BLOCK'` and `reason_codes: ['UNKNOWN_COST_FIELD']`[cite: 1].
- **SEC-007**: Audit log entries in the `audit_events` SQLite table MUST be enforced as append-only via SQLite `BEFORE UPDATE` and `BEFORE DELETE` triggers that raise `ABORT` exceptions (`Audit ledger is append-only`)[cite: 1].
- **SEC-008**: All logs and UI traces MUST redact `Authorization` headers, OAuth bearer tokens, and raw API keys prior to persistence or rendering[cite: 1].

### System Architecture Requirements (`ARC`)

- **ARC-001**: The repository MUST be structured as a npm workspaces monorepo (`package.json` at root with workspaces `["server", "client"]`) using TypeScript `5.6+` with `"strict": true`, `"noUncheckedIndexedAccess": true`, and `"exactOptionalPropertyTypes": true`.
- **ARC-002**: End-to-End System Topology and Data Flow MUST conform to the following architecture:

```text
+--------------------------------------------------------------------------------------------------+
|                                  CLIENT BROWSER (React 18 + Vite + TS)                           |
|                                                                                                  |
|  +------------------------------------------------+  +----------------------------------------+  |
|  | TopScenarioBar.tsx                             |  | ApprovalCheckoutModal.tsx              |  |
|  | - Live PayPal Sandbox & Channel3 Health Badges |  | - Canonical Policy Diff Inspector      |  |
|  | - Scenario A / B / C Live API Execution        |  | - PayPal JS SDK (Orders v2 + PayLater) |  |
|  +-----------------------+------------------------+  +-------------------+--------------------+  |
|                          |                                               ^                       |
|                          v                                               |                       |
|  +-----------------------------------------------------------------------+--------------------+  |
|  | TimelinePane.tsx (@bryntum/gantt-react)                                                    |  |
|  | - Renders DAG tasks, finish-to-start dependencies, critical path, & PayPal Invoice badges  |  |
|  | - Selection event -> dispatches cross-filter to AG Studio API                              |  |
|  +-----------------------------------------------+--------------------------------------------+  |
|                                                  |                                               |
|                                                  v                                               |
|  +--------------------------------------------------------------------------------------------+  |
|  | StudioWorkspace.tsx (ag-studio-react <AgStudio mode="edit"/>)                             |  |
|  | - In-Browser Data Engine Sources: [project_tasks, supplier_quotes, audit_events]           |  |
|  | - Custom Widget 1: CascadeRecoveryWidget (formatShape + AI metadata + toggleCrossFilter)   |  |
|  | - Custom Widget 2: FriendlyNudgeScoreboardWidget (Live Base64 PayPal QR + Nudge-Bot CTA)   |  |
|  | - Studio Agent Framework: cascadeFinOpsAgent -> tools.delegateTo(['data', 'widget'])       |  |
|  +-----------------------------------------------+--------------------------------------------+  |
+--------------------------------------------------|-----------------------------------------------+
                                                   | HTTPS REST (/api/*)
                                                   v
+--------------------------------------------------------------------------------------------------+
|                              BACKEND SERVER (Node.js 22 + Express + TS)                          |
|                                                                                                  |
|  +-----------------------------------------------+  +-----------------------------------------+  |
|  | Deterministic Core (server/src/engine/)       |  | Live External Integrations              |  |
|  | 1. criticalPathEngine.ts                      |  | 1. paypalClient.ts (APIMatic Validated) |  |
|  |    - DAG topological sort & blast radius      |  |    - OAuth2 /v1/oauth2/token            |  |
|  | 2. policyEngine.ts                            |  |    - Invoicing /v2/invoicing/invoices   |  |
|  |    - Integer minor-unit rule evaluator        |  |    - QR Code & Reminders endpoints      |  |
|  | 3. fingerprint.ts                             |  |    - Checkout /v2/checkout/orders       |  |
|  |    - Canonical SHA-256 state hashing          |  | 2. channel3Service.ts                   |  |
|  +-----------------------+-----------------------+  |    - Live /v0/search & /v0/products/:id |  |
|                          |                          | 3. llmAgentService.ts                   |  |
|                          |                          |    - Nudge-Bot & AG-UI LLM Adapter      |  |
|                          +-------------+------------+--------------------+--------------------+  |
|                                        |                                 |                       |
|                                        v                                 v                       |
|  +--------------------------------------------------------------------------------------------+  |
|  | Persistent Storage (server/src/db/database.ts — better-sqlite3 WAL Mode)                   |  |
|  | Tables: projects | tasks | task_dependencies | supplier_quotes | recovery_plans |          |  |
|  |         user_approvals | paypal_transactions | audit_events (Append-Only Trigger Enforced) |  |
|  +--------------------------------------------------------------------------------------------+  |
+--------------------------------------------------------------------------------------------------+
```

- **ARC-003**: Database Schema DDL (`server/src/db/schema.sql`) MUST define the exact tables below without modification:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  version INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  materials_in_warehouse INTEGER NOT NULL CHECK (materials_in_warehouse IN (0, 1)),
  crew_assigned TEXT NOT NULL,
  daily_idle_burn_minor INTEGER NOT NULL CHECK (daily_idle_burn_minor >= 0),
  sla_delay_penalty_minor INTEGER NOT NULL CHECK (sla_delay_penalty_minor >= 0),
  phase_hardware_budget_max_minor INTEGER NOT NULL CHECK (phase_hardware_budget_max_minor >= 0),
  schedule_status TEXT NOT NULL CHECK (
    schedule_status IN (
      'COMPLETED',
      'SCHEDULED',
      'PAYMENT_BLOCKED',
      'READY_TO_PROMOTE',
      'BLOCKED_BY_DEPENDENCY',
      'REROUTED_ACTIVE',
      'MATERIALS_ORDERED'
    )
  ),
  paypal_invoice_id TEXT,
  paypal_invoice_number TEXT,
  paypal_invoice_status TEXT NOT NULL CHECK (
    paypal_invoice_status IN ('DRAFT', 'SENT', 'OVERDUE', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')
  ),
  invoice_total_minor INTEGER NOT NULL CHECK (invoice_total_minor >= 0),
  materials_unlock_minor INTEGER NOT NULL CHECK (materials_unlock_minor >= 0),
  deferred_labor_minor INTEGER NOT NULL CHECK (deferred_labor_minor >= 0),
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  qr_code_base64 TEXT,
  last_nudge_message TEXT,
  last_nudge_sent_at TEXT,
  sku_search_query TEXT,
  required_quantity INTEGER NOT NULL DEFAULT 0,
  incumbent_vendor_name TEXT,
  incumbent_unit_price_minor INTEGER,
  historical_unit_price_minor INTEGER,
  max_allowed_variance_pct REAL NOT NULL DEFAULT 10.0
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  dependency_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  from_task_id TEXT NOT NULL REFERENCES tasks(task_id),
  to_task_id TEXT NOT NULL REFERENCES tasks(task_id),
  lag_days INTEGER NOT NULL DEFAULT 0,
  UNIQUE(project_id, from_task_id, to_task_id)
);

CREATE TABLE IF NOT EXISTS supplier_quotes (
  quote_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  source_type TEXT NOT NULL CHECK (source_type IN ('INCUMBENT_INVOICE', 'CHANNEL3_LIVE')),
  external_product_id TEXT NOT NULL,
  product_title TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  product_url TEXT,
  image_url TEXT,
  currency TEXT NOT NULL,
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  shipping_minor INTEGER,
  tax_minor INTEGER,
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  variance_vs_historical_pct REAL NOT NULL,
  savings_vs_incumbent_minor INTEGER NOT NULL DEFAULT 0,
  availability_status TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recovery_plans (
  plan_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  blocked_task_id TEXT NOT NULL REFERENCES tasks(task_id),
  promoted_task_id TEXT NOT NULL REFERENCES tasks(task_id),
  selected_quote_id TEXT NOT NULL REFERENCES supplier_quotes(quote_id),
  state_fingerprint TEXT NOT NULL,
  policy_decision TEXT NOT NULL CHECK (policy_decision IN ('ALLOW', 'BLOCK', 'REQUIRE_APPROVAL')),
  reason_codes_json TEXT NOT NULL,
  idle_crew_hours INTEGER NOT NULL,
  idle_labor_cost_minor INTEGER NOT NULL,
  sla_penalty_minor INTEGER NOT NULL,
  total_exposure_minor INTEGER NOT NULL,
  new_promoted_start_date TEXT NOT NULL,
  new_blocked_start_date TEXT NOT NULL,
  immediate_unlock_minor INTEGER NOT NULL,
  deferred_labor_minor INTEGER NOT NULL,
  nudge_draft_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PROPOSED', 'APPROVED', 'EXECUTED', 'BLOCKED', 'SUPERSEDED')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_approvals (
  approval_id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES recovery_plans(plan_id),
  approved_fingerprint TEXT NOT NULL,
  approver_actor TEXT NOT NULL,
  approved_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paypal_transactions (
  transaction_record_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  plan_id TEXT REFERENCES recovery_plans(plan_id),
  kind TEXT NOT NULL CHECK (kind IN ('INVOICE_CREATE', 'INVOICE_SPLIT_UPDATE', 'INVOICE_REMIND', 'ORDER_CREATE', 'ORDER_CAPTURE')),
  paypal_resource_id TEXT NOT NULL,
  paypal_capture_id TEXT,
  status TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  raw_response_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  event_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT,
  plan_id TEXT,
  event_type TEXT NOT NULL,
  decision TEXT,
  reason_codes_json TEXT,
  state_fingerprint TEXT,
  paypal_reference_id TEXT,
  channel3_reference_id TEXT,
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS prevent_audit_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'Audit ledger is append-only: UPDATE prohibited');
END;

CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'Audit ledger is append-only: DELETE prohibited');
END;
```

- **ARC-004**: The Backend Express API MUST expose the exact REST endpoints below with deterministic JSON response envelopes:
  1. `GET /api/health` — Checks live PayPal Sandbox OAuth connectivity, Channel3 API key validity, and SQLite write status.
  2. `POST /api/projects/bootstrap` — Seeds the 6-phase *"Apex Diagnostic Clinic & Studio Buildout"* project in SQLite AND creates/fetches real PayPal Sandbox Invoices (`POST /v2/invoicing/invoices`) so every phase has an authentic PayPal Sandbox `invoice_id`[cite: 1].
  3. `GET /api/projects/:projectId/state` — Returns full project state (`project`, `tasks`, `dependencies`, `supplierQuotes`, `activeRecoveryPlan`, `paypalTransactions`, `auditEvents`) formatted for both Bryntum Gantt and AG Studio 3.0 data sources.
  4. `POST /api/scenarios/:scenarioId/trigger` — Executes real state transitions and evaluations for `SCENARIO_A` (Overdue Invoice + Schedule Reroute + Split Invoice Proposal), `SCENARIO_B` (Incumbent 28.95% Price Hike Block + Live Channel3 Arbitrage Lookup), or `SCENARIO_C` (Adversarial Dependency & Budget Override Block)[cite: 1].
  5. `POST /api/recovery-plans/:planId/approve-schedule-and-split` — Verifies `state_fingerprint`, records human approval in `user_approvals`, updates the task schedule dates in SQLite, calls PayPal Sandbox `PUT /v2/invoicing/invoices/{id}`, calls `POST /v2/invoicing/invoices/{id}/generate-qr-code`, calls `POST /v2/invoicing/invoices/{id}/remind`, and writes an append-only audit event[cite: 1].
  6. `POST /api/paypal/orders/create` — Re-runs `policyEngine.evaluateSupplierOrder()` and fingerprint verification, then calls `POST https://api-m.sandbox.paypal.com/v2/checkout/orders` for the approved Channel3 quote and returns `{ paypalOrderId, status }`[cite: 1].
  7. `POST /api/paypal/orders/:orderId/capture` — Calls `POST https://api-m.sandbox.paypal.com/v2/checkout/orders/{orderId}/capture`, validates `status === 'COMPLETED'`, updates `tasks.schedule_status = 'MATERIALS_ORDERED'`, and records the capture ID in `paypal_transactions` and `audit_events`[cite: 1].
  8. `POST /api/studio-agent/chat` — Implements the AG-UI compatible streaming/turn endpoint for AG Studio's `clientToolRunner` / `directLlmRunner` adapter.
  9. `POST /api/webhooks/paypal` — Verifies and ingests asynchronous PayPal Sandbox webhook events[cite: 1].
- **ARC-005**: Bidirectional UI State Synchronization MUST operate via a centralized React context (`client/src/context/CascadeStateContext.tsx`) that holds the canonical `/api/projects/:projectId/state` response, feeds `<BryntumGantt />` and `<AgStudio />`, and exposes `selectTask(taskId)` so clicking a task bar in Bryntum applies a cross-filter in AG Studio and vice versa.
- **ARC-006**: The APIMatic integration workflow MUST use the official PayPal OpenAPI specification processed via APIMatic Context Plugin / SDK generator (`server/src/services/paypalClient.ts`) to enforce strict request/response typing on all PayPal Invoicing v2 and Orders v2 calls[cite: 1].

### Constraints (`CON`)

- **CON-001**: Zero mock functions, `setTimeout` fake network delays, or hardcoded `"PAYPAL-MOCK-123"` IDs are allowed anywhere in `server/` or `client/`[cite: 1]. Every PayPal ID displayed in the UI MUST come from `api-m.sandbox.paypal.com`[cite: 1].
- **CON-002**: The application MUST run exclusively against PayPal Sandbox (`https://api-m.sandbox.paypal.com`) and never against live production payment endpoints (`api-m.paypal.com`)[cite: 1].
- **CON-003**: Channel3 API calls MUST respect the hackathon rate limit and 20,000 credit quota (`PAYPAL-HACKATHON-2026`), caching responses per `(sku_search_query, project_id)` in the `supplier_quotes` SQLite table with a force-refresh toggle in the UI.
- **CON-004**: All dates and timestamps stored in SQLite and exchanged over JSON MUST be ISO-8601 UTC strings (`YYYY-MM-DDTHH:mm:ss.sssZ` for timestamps and `YYYY-MM-DD` for schedule task dates).
- **CON-005**: The submission repository MUST be public, open-source with an `MIT` `LICENSE` file at the root, and deployable via `render.yaml` on Render[cite: 1].
- **CON-006**: The demo video MUST be under 3 minutes and show real sandbox API executions and real database persistence[cite: 1].
- **CON-007**: All custom widgets in AG Studio MUST define both `formatShape` and `ai` metadata properties so the AG Studio Agent Framework can validate and instantiate them without schema errors.

### Guidelines (`GUD`)

- **GUD-001**: Keep all business rules inside pure, side-effect-free functions in `server/src/engine/` so they can be verified deterministically by Vitest unit tests without network calls[cite: 1].
- **GUD-002**: Always show both the **Observed** and **Permitted** values alongside `reason_codes` whenever a policy decision returns `BLOCK` or `REQUIRE_APPROVAL`[cite: 1].
- **GUD-003**: Design the Nudge-Bot prompt to generate warm, collaborative status updates that emphasize how the partial materials unlock keeps the client's opening date on track, rather than punitive debt-collection language.
- **GUD-004**: Display sample sizes and test denominators transparently in the UI metrics bar (e.g., `10 / 10 Policy Cases Verified`) rather than claiming universal statistical guarantees[cite: 1].
- **GUD-005**: Use dark-mode industrial FinOps styling (`#0B0F17` canvas background, `#111827` surface cards, `#10B981` emerald for `ALLOW`/`PAID`, `#EF4444` crimson for `BLOCK`/`OVERDUE`, `#F59E0B` amber for `REQUIRE_APPROVAL`) across both Bryntum Gantt and AG Studio 3.0.
- **GUD-006**: Log every outbound PayPal and Channel3 HTTP status code and latency (in milliseconds) into the `audit_events` payload for full observability during judge review[cite: 1].

### Patterns (`PAT`)

- **PAT-001**: **Transactional Outbox / Audit Pattern** — Wrap every SQLite state mutation and its corresponding `INSERT INTO audit_events` inside a single `db.transaction(() => { ... })()` block so state and audit logs never diverge[cite: 1].
- **PAT-002**: **Canonical Fingerprint Verification Pattern** — Compute `sha256(canonicalJsonString)` when generating a proposal, require the client to submit `approvedFingerprint` on execution, and recompute the fingerprint from current database state immediately before calling PayPal[cite: 1].
- **PAT-003**: **Minor-Unit Value Object Pattern** — Represent money in TypeScript as `{ amountMinor: number; currency: 'USD' | 'INR' }` and use a single tested converter (`minorUnitsToDecimalString(139600) === "1396.00"`) at the PayPal API boundary[cite: 1].
- **PAT-004**: **AG Studio Custom Widget Contract Pattern** — Implement `AgWidgetDefinition` with `dataMapping`, `formatShape`, `form`, `ai`, and a React component using `widgetApi.getData()` and `widgetApi.toggleCrossFilter()`.
- **PAT-005**: **Multi-Agent Delegation Pattern** — Configure `cascade-finops-agent` as the primary agent in AG Studio's harness and invoke `tools.delegateTo(['data', 'widget'])` for canvas layout and chart creation.
- **PAT-006**: **Fail-Closed Validation Pattern** — Any null cost field, currency mismatch, or unmet dependency immediately halts execution and returns `decision: 'BLOCK'`[cite: 1].

---

## 2. Implementation Steps

### Implementation Phase 1: Monorepo Scaffolding, Environment Validation & SQLite Persistence Layer

- GOAL-001: Initialize the TypeScript monorepo, configure strict compiler and environment validation (`SEC-001`), and build the persistent SQLite database layer (`REQ-001`, `ARC-003`, `SEC-007`) with zero mocks.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Create root `/package.json` with npm workspaces `["server", "client"]`, shared scripts (`dev`, `build`, `test`, `typecheck`), `/tsconfig.base.json` with `"strict": true`, `/.gitignore` (excluding `.env`, `node_modules/`, `dist/`, `*.sqlite*`), and `/LICENSE` (MIT) (`ARC-001`, `CON-005`). | | |
| TASK-002 | Create `/.env.example` and `server/src/config/env.ts` using `zod` and `dotenv` to validate required environment variables at startup: `PORT` (default `4000`), `DATABASE_PATH` (default `./data/cascade_os.sqlite`), `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_API_BASE_URL` (locked to `https://api-m.sandbox.paypal.com`), `PAYPAL_WEBHOOK_ID` (optional for local dev, required for webhook verification), `CHANNEL3_API_KEY`, `CHANNEL3_API_BASE_URL` (default `https://api.trychannel3.com/v0`), `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o`), and `VITE_PAYPAL_CLIENT_ID` (`SEC-001`, `CON-002`). | | |
| TASK-003 | Create `server/src/types/domain.ts` defining all canonical TypeScript interfaces (`Project`, `CascadeTask`, `TaskDependency`, `SupplierQuote`, `CascadeRecoveryPlan`, `PolicyEvaluationResult`, `ReasonCode`, `AuditEvent`, `PayPalTransactionRecord`) using integer minor units (`REQ-002`, `PAT-003`). | | |
| TASK-004 | Create `server/src/db/schema.sql` containing the exact SQLite DDL defined in `ARC-003` (including WAL mode, foreign keys, check constraints, and the `prevent_audit_update` / `prevent_audit_delete` triggers) (`REQ-001`, `SEC-007`). | | |
| TASK-005 | Create `server/src/db/database.ts` using `better-sqlite3` to initialize the database file at `env.DATABASE_PATH`, execute `schema.sql` on startup, and export typed repository methods (`ProjectRepo`, `TaskRepo`, `QuoteRepo`, `RecoveryPlanRepo`, `ApprovalRepo`, `TransactionRepo`, `AuditRepo`) wrapped in `db.transaction()` (`PAT-001`). | | |
| TASK-006 | Create `server/src/utils/moneyAndHash.ts` implementing `formatMinorToPayPalValue(minorUnits: number, currency: string): string`, `parsePayPalValueToMinor(valueStr: string): number`, and `computeStateFingerprint(payload: Record<string, unknown>): string` using deterministic key sorting and `crypto.createHash('sha256')` (`REQ-002`, `REQ-008`, `PAT-002`). | | |

### Implementation Phase 2: Deterministic Critical-Path, Blast-Radius & Policy Firewall Engine

- GOAL-002: Implement the pure TypeScript critical-path DAG analyzer and deterministic policy engine (`REQ-005`, `REQ-007`, `SEC-006`) so all financial and scheduling rules are enforced outside the LLM.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-007 | Create `server/src/engine/criticalPathEngine.ts` implementing `analyzeProjectBlastRadius(tasks: CascadeTask[], dependencies: TaskDependency[])`. The function must perform topological sorting on the task DAG, locate any task where `paypal_invoice_status === 'OVERDUE'`, find all transitive downstream dependent tasks, compute `idle_crew_hours = blocked_duration_days * 8`, compute `idle_labor_cost_minor = blocked_duration_days * daily_idle_burn_minor`, add `sla_delay_penalty_minor`, and identify all unblocked candidate tasks where every `from_task_id` dependency has `schedule_status === 'COMPLETED'` and `materials_in_warehouse === 1` (`REQ-005`). | | |
| TASK-008 | Create `server/src/engine/scheduleRerouter.ts` implementing `computeReroutedSchedule(blockedTask: CascadeTask, candidateTask: CascadeTask, dependencies: TaskDependency[])` which swaps `candidateTask` into `blockedTask.start_date`, shifts `blockedTask.start_date` to `candidateTask.end_date + 1 day`, recalculates downstream dates, and verifies zero dependency cycle or finish-to-start violations (`REQ-005`, `GUD-001`). | | |
| TASK-009 | Create `server/src/engine/policyEngine.ts` implementing `evaluateRecoveryAndSupplierAction(input: PolicyEvaluationInput): PolicyEvaluationResult`. Enforce all 7 deterministic checks in order: (1) currency equality (`CURRENCY_MISMATCH`), (2) non-null shipping and tax (`UNKNOWN_COST_FIELD`), (3) all `hard_dependencies` completed (`HARD_DEPENDENCY_VIOLATION`), (4) `materials_in_warehouse === true` for promoted task (`MATERIALS_NOT_IN_WAREHOUSE`), (5) `total_minor <= phase_hardware_budget_max_minor` (`TOTAL_EXCEEDS_PHASE_BUDGET`), (6) `((unit_price_minor - historical_unit_price_minor) / historical_unit_price_minor) * 100 <= max_allowed_variance_pct` (`VENDOR_PRICE_CREEP_EXCEEDED`), and (7) valid user approval fingerprint match (`STALE_FINGERPRINT_APPROVAL`) (`REQ-007`, `SEC-006`, `PAT-006`). | | |
| TASK-010 | Create `server/src/engine/__tests__/engine.test.ts` using `vitest` to verify `criticalPathEngine.ts`, `scheduleRerouter.ts`, and `policyEngine.ts` across Scenario A (`ALLOW` / `REQUIRE_APPROVAL`), Scenario B (`BLOCK` on incumbent `$490.00/unit` quote with `VENDOR_PRICE_CREEP_EXCEEDED` and `TOTAL_EXCEEDS_PHASE_BUDGET`; `ALLOW` on `$349.00/unit` Channel3 quote), Scenario C (`BLOCK` on unmet dependency `task_phase_2_displays`), and null shipping/tax fail-closed cases (`TEST-001` through `TEST-006`). | | |

### Implementation Phase 3: Real PayPal Sandbox Integration (OAuth2, Invoicing v2, Orders v2, Agent Toolkit & Webhooks)

- GOAL-003: Implement authentic PayPal Sandbox API clients (`REQ-003`, `REQ-004`, `REQ-009`, `REQ-010`, `REQ-011`, `REQ-012`) using APIMatic-validated schemas and `@paypal/agent-toolkit` with zero mocked endpoints.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-011 | Create `server/src/services/paypalAuthService.ts` implementing `getPayPalAccessToken(): Promise<string>` against `POST https://api-m.sandbox.paypal.com/v1/oauth2/token` with HTTP Basic Auth (`Buffer.from(`${clientId}:${clientSecret}`).toString('base64')`) and body `grant_type=client_credentials`, caching the token in memory with automatic refresh 60 seconds prior to expiry (`REQ-003`, `SEC-008`). | | |
| TASK-012 | Create `server/src/services/paypalInvoicingService.ts` implementing real PayPal Invoicing v2 REST operations using APIMatic-validated payload structures: (1) `createDraftInvoice(params)` (`POST /v2/invoicing/invoices`), (2) `sendInvoice(invoiceId)` (`POST /v2/invoicing/invoices/{id}/send`), (3) `getInvoice(invoiceId)` (`GET /v2/invoicing/invoices/{id}`), (4) `updateInvoiceForPartialMaterialsUnlock(invoiceId, fullInvoicePayload, unlockMinor, currency, note)` (`PUT /v2/invoicing/invoices/{id}` setting `configuration.partial_payment = { allow_partial_payment: true, minimum_amount_due: { currency_code: currency, value: formatMinorToPayPalValue(unlockMinor, currency) } }`), (5) `generateInvoiceQrCode(invoiceId)` (`POST /v2/invoicing/invoices/{id}/generate-qr-code` with `{ width: 300, height: 300, action: "pay" }` returning the Base64 PNG string), and (6) `sendInvoiceReminder(invoiceId, subject, note)` (`POST /v2/invoicing/invoices/{id}/remind`) (`REQ-004`, `REQ-009`, `ARC-006`, `SEC-004`). | | |
| TASK-013 | Create `server/src/services/paypalOrdersService.ts` implementing real PayPal Orders v2 REST operations: (1) `createSupplierOrder(params)` (`POST /v2/checkout/orders` with `intent: "CAPTURE"`, `purchase_units` containing the exact Channel3 item breakdown, `custom_id: planId`, `invoice_id: uniqueRef`, and header `PayPal-Request-Id`), (2) `captureSupplierOrder(orderId)` (`POST /v2/checkout/orders/{orderId}/capture`), and (3) `getOrderDetails(orderId)` (`GET /v2/checkout/orders/{orderId}`). Persist every raw JSON response into the `paypal_transactions` SQLite table (`REQ-010`, `REQ-011`, `SEC-004`). | | |
| TASK-014 | Create `server/src/services/paypalAgentToolkitBridge.ts` initializing `@paypal/agent-toolkit` configured with `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and Sandbox environment to expose PayPal's native agent tools (`list_invoices`, `get_invoice`, `send_invoice_reminder`, `generate_invoice_qr_code`, `get_merchant_insights`) to the FinOps & Nudge-Bot agent (`DEP-002`). | | |
| TASK-015 | Create `server/src/routes/webhookRoutes.ts` implementing `POST /api/webhooks/paypal` that verifies headers (`paypal-transmission-id`, `paypal-transmission-time`, `paypal-cert-url`, `paypal-auth-algo`, `paypal-transmission-sig`) against `POST /v1/notifications/verify-webhook-signature` and updates `tasks.paypal_invoice_status` and `audit_events` when an invoice or order event arrives (`REQ-012`). | | |

### Implementation Phase 4: Live Channel3 Product Graph Service & AI Nudge-Bot / FinOps Service

- GOAL-004: Build the live Channel3 product discovery & price-arbitrage client (`REQ-006`) and the LLM Nudge-Bot and AG-UI agent adapter (`REQ-016`, `SEC-002`).

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-016 | Create `server/src/services/channel3Service.ts` implementing `searchAndAuditSupplierProducts(task: CascadeTask): Promise<SupplierQuote[]>`. Execute a live HTTP request to `https://api.trychannel3.com/v0/search` (or `GET /v0/products`) with header `x-api-key: env.CHANNEL3_API_KEY` and query `task.sku_search_query`. Parse the returned products, convert their live retail price into integer minor units (`unit_price_minor`), compute `total_minor = unit_price_minor * task.required_quantity`, compute `variance_vs_historical_pct` against `task.historical_unit_price_minor`, compute `savings_vs_incumbent_minor = (task.incumbent_unit_price_minor * task.required_quantity) - total_minor`, and insert the records into the `supplier_quotes` SQLite table with `source_type = 'CHANNEL3_LIVE'` and current UTC `observed_at` (`REQ-006`, `CON-003`). | | |
| TASK-017 | Create `server/src/services/nudgeAndFinOpsAiService.ts` using the official `openai` SDK (`response_format: { type: "json_object" }`) to generate: (1) a warm, relationship-preserving client nudge message referencing the exact deterministic numbers computed by `criticalPathEngine.ts` and `policyEngine.ts` without allowing the LLM to alter any numbers, and (2) an explanation of policy blocks and recovery steps (`SEC-002`, `SEC-003`, `GUD-003`). | | |
| TASK-018 | Create `server/src/services/projectBootstrapService.ts` implementing `bootstrapApexClinicProject()`. If `proj_apex_clinic_01` does not yet exist in SQLite (or when `forceReset: true` is passed), create the 6 canonical tasks of the *"Apex Diagnostic Clinic & Studio Buildout"* project, create real PayPal Sandbox invoices via `paypalInvoicingService.createDraftInvoice()` and `sendInvoice()` for Phase 2 (`$4,500.00` = `450000` cents) and Phase 3 (`$2,800.00` = `280000` cents), execute a live Channel3 search via `channel3Service.searchAndAuditSupplierProducts()` for Phase 2's 4K monitors, and store all resulting live IDs in SQLite (`REQ-004`, `REQ-006`, `CON-001`). | | |

### Implementation Phase 5: Express API Controllers, Zod Request Validation & Scenario Orchestration

- GOAL-005: Expose all backend REST endpoints (`ARC-004`, `SEC-005`) and wire the three repeatable live test scenarios (`REQ-018`).

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-019 | Create `server/src/schemas/apiSchemas.ts` defining strict Zod validation schemas for `/api/projects/bootstrap`, `/api/scenarios/:scenarioId/trigger`, `/api/recovery-plans/:planId/approve-schedule-and-split`, `/api/paypal/orders/create`, `/api/paypal/orders/:orderId/capture`, and `/api/studio-agent/chat` (`SEC-005`). | | |
| TASK-020 | Create `server/src/routes/projectRoutes.ts` implementing `GET /api/health`, `POST /api/projects/bootstrap`, and `GET /api/projects/:projectId/state` (`ARC-004`). | | |
| TASK-021 | Create `server/src/routes/scenarioRoutes.ts` implementing `POST /api/scenarios/:scenarioId/trigger` for: (1) `SCENARIO_A`: Marks Phase 2 invoice `OVERDUE`, runs `criticalPathEngine`, evaluates promoting Phase 3 (`task_phase_3_networking`), drafts the `$1,396.00` materials-unlock split plan, and logs the `REQUIRE_APPROVAL` plan in SQLite; (2) `SCENARIO_B`: Evaluates the incumbent vendor's `$490.00/unit` (`$1,960.00` total) quote through `policyEngine`—recording a real `BLOCK` audit event (`["VENDOR_PRICE_CREEP_EXCEEDED", "TOTAL_EXCEEDS_PHASE_BUDGET"]`)—then fetches live Channel3 quotes (`~34900` cents/unit), evaluates the Channel3 quote (`REQUIRE_APPROVAL` / `ALLOW` upon approval), and creates the recovery plan; (3) `SCENARIO_C`: Evaluates an adversarial attempt to promote `task_phase_4_calibration` ahead of `task_phase_2_displays` with a `$2,100.00` unapproved vendor quote, returning a deterministic `BLOCK` (`["HARD_DEPENDENCY_VIOLATION", "MATERIALS_NOT_IN_WAREHOUSE", "TOTAL_EXCEEDS_PHASE_BUDGET"]`) and logging the blocked attempt in `audit_events` (`REQ-018`). | | |
| TASK-022 | Create `server/src/routes/recoveryRoutes.ts` implementing `POST /api/recovery-plans/:planId/approve-schedule-and-split` and `POST /api/paypal/orders/create` + `POST /api/paypal/orders/:orderId/capture`. Enforce `computeStateFingerprint()` matching before calling `paypalInvoicingService.updateInvoiceForPartialMaterialsUnlock()`, `generateInvoiceQrCode()`, `sendInvoiceReminder()`, `paypalOrdersService.createSupplierOrder()`, and `captureSupplierOrder()` (`REQ-008`, `REQ-009`, `REQ-010`, `REQ-011`, `PAT-002`). | | |
| TASK-023 | Create `server/src/routes/studioAgentRoutes.ts` implementing `POST /api/studio-agent/chat` to proxy LLM requests and custom tool executions (`inspectBlastRadius`, `refreshChannel3Quotes`, `triggerScenario`) using AG-UI compatible event objects (`RUN_STARTED`, `TEXT_MESSAGE_CONTENT`, `TOOL_CALL_START`, `TOOL_CALL_END`, `RUN_FINISHED`) (`REQ-016`). | | |
| TASK-024 | Create `server/src/index.ts` wiring CORS, JSON body parsing (preserving raw body buffer on `/api/webhooks/paypal` for signature verification), route mounting, global error handling, and automatic database initialization on server boot (`ARC-004`). | | |

### Implementation Phase 6: React Frontend, Bryntum Gantt Timeline & Live PayPal JS SDK v6 Modal

- GOAL-006: Build the React + Vite frontend workspace (`client/`), integrate `<BryntumGantt />` (`REQ-013`), wire the Live Scenario Trigger Bar (`REQ-018`), and embed the live **PayPal JS SDK v6** Checkout and Invoice QR modal (`REQ-017`).

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-025 | Initialize `client/package.json`, `client/vite.config.ts` (with `/api` proxy to `http://localhost:4000`), `client/tsconfig.json`, and TailwindCSS dark FinOps theme (`GUD-005`). Install `ag-studio-react`, `@bryntum/gantt`, `@bryntum/gantt-react`, `@paypal/react-paypal-js`, `lucide-react`, and `zod`. | | |
| TASK-026 | Create `client/src/api/cascadeApiClient.ts` providing strongly typed fetch wrappers for all 9 backend endpoints defined in `ARC-004`, plus `client/src/context/CascadeStateContext.tsx` managing real-time state updates, active cross-filter selection (`selectedTaskId`, `selectedReasonCode`), and toast error/status notifications (`ARC-005`). | | |
| TASK-027 | Create `client/src/components/TopScenarioBar.tsx` displaying live connectivity status badges (`PayPal Sandbox OAuth: Connected`, `Channel3 API: Live`, `Policy Accuracy: 10/10`), top-level financial KPI pills (`Idle Exposure At Risk`, `Channel3 Arbitrage Savings`, `Active PayPal Invoices`), a `"Bootstrap / Reset Live Sandbox Project"` button, and the three 1-click scenario triggers (`Scenario A: Overdue Invoice & Reroute`, `Scenario B: Vendor Price-Creep & Channel3 Arbitrage`, `Scenario C: Adversarial Dependency Block`) (`REQ-018`, `GUD-004`). | | |
| TASK-028 | Create `client/src/components/TimelinePane.tsx` wrapping `<BryntumGantt />` (`@bryntum/gantt-react`). Configure columns (`Name`, `Crew`, `PayPal Invoice Status`, `Unlock Amount`), finish-to-start dependency lines, critical-path highlighting, and a custom `taskRenderer` that renders high-contrast status pills (`PAID`, `OVERDUE — BLOCKING ($2,800 RISK)`, `REROUTED — ACTIVE`, `MATERIALS ORDERED`) directly inside each timeline bar. Wire `onTaskClick` to `selectTask(taskRecord.id)` to cross-filter AG Studio (`REQ-013`, `ARC-005`). | | |
| TASK-029 | Create `client/src/components/ApprovalCheckoutModal.tsx` rendering: (1) the side-by-side **Deterministic Policy Diff** (`Permitted` vs. `Observed` values in minor and major units plus `reason_codes` and `state_fingerprint`), (2) the **"Approve Schedule Reroute & Split PayPal Invoice"** action button that triggers live PayPal Sandbox invoice update + QR generation, and (3) the live `<PayPalScriptProvider options={{ clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID, currency: "USD", intent: "capture", enableFunding: "paylater" }}>` and `<PayPalButtons createOrder={...} onApprove={...} />` flow that creates and captures the real PayPal Sandbox order for the Channel3 supplier replacement (`REQ-010`, `REQ-011`, `REQ-017`). | | |
| TASK-030 | Create `client/src/components/AuditDrawer.tsx` rendering the append-only `audit_events` and `paypal_transactions` tables with copyable `state_fingerprint` hashes, clickable PayPal Sandbox Invoice/Order/Capture IDs, and a 1-click **"Export Signed Audit Report (.md / .json)"** button (`REQ-001`, `SEC-007`). | | |

### Implementation Phase 7: AG Studio 3.0 Embedded Analytics, Custom React Widgets & Studio Agent Framework

- GOAL-007: Implement the `<AgStudio />` 3.0 workspace (`REQ-014`), register the two custom React widgets via `createWidgets` (`REQ-015`, `CON-007`), and wire the **Studio Agent Framework** with delegation to Studio's built-in `data` and `widget` agents (`REQ-016`, `PAT-005`).

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-031 | Create `client/src/studio/widgets/CascadeRecoveryWidget.tsx` implementing Custom React Widget #1 (`AgWidgetParams`). Use `widgetApi.setDisplayState('loading' | 'displayed')` and `widgetApi.getData()` to query `project_tasks` and `supplier_quotes`. Render the blocked task blast radius (`$2,800.00` idle exposure), the side-by-side **Incumbent Quote (`$490.00/u` — `BLOCKED`) vs. Live Channel3 Quote (`$349.00/u` — `Save $564.00 / 28.78%`)**, reason-code badges that call `widgetApi.toggleCrossFilter({ group: 0, field: 'schedule_status', value })` when clicked, and a primary CTA button that opens `ApprovalCheckoutModal` (`REQ-015`, `PAT-004`). | | |
| TASK-032 | Create `client/src/studio/widgets/FriendlyNudgeScoreboardWidget.tsx` implementing Custom React Widget #2 (`AgWidgetParams`). Render a gamified **"Client Milestone Collaboration Scoreboard"** showing each phase's PayPal Invoice ID, on-time streak badge, the live Base64 **PayPal QR Code** (`data:image/png;base64,${qr_code_base64}`) generated by PayPal Sandbox, the editable AI-drafted friendly nudge message, and a custom toolbar action (`Send Warm PayPal Nudge`) that invokes `POST /api/recovery-plans/:planId/approve-schedule-and-split` (`REQ-009`, `REQ-015`). | | |
| TASK-033 | Create `client/src/studio/widgets/createCascadeWidgets.ts` calling `createWidgets<CascadeStudioRegistry>` from `ag-studio-react`. Register `cascadeRecoveryWidget` and `friendlyNudgeScoreboardWidget` with complete `dataMapping`, `formatShape` schema validation functions, `form` builder definitions, `defaultSize`, and `ai` metadata descriptions so AG Studio's built-in `widget` agent can autonomously spawn and configure both custom widgets (`REQ-015`, `CON-007`). | | |
| TASK-034 | Create `client/src/studio/agents/cascadeFinOpsAgent.ts` configuring the **AG Studio Agent Framework** harness. Define `cascade-finops-agent` as the `primary` agent with dynamic `instructions` and `tools` callbacks (`tools.delegateTo(['data', 'widget'])` plus custom client tools `runScenarioAnalysis` and `openPayPalApprovalModal`) driven by `directLlmRunner` / `clientToolRunner` connected to `/api/studio-agent/chat` (`REQ-016`, `PAT-005`). | | |
| TASK-035 | Create `client/src/studio/StudioWorkspace.tsx` rendering `<AgStudio data={studioData} widgets={cascadeWidgets} ai={studioAiConfig} mode="edit" />` with a pre-configured initial multi-widget dashboard layout containing `CascadeRecoveryWidget`, `FriendlyNudgeScoreboardWidget`, a native AG Studio *Phase Budget vs. Exposure* bar chart, and a native *Supplier Quote Variance* grid (`REQ-014`). | | |
| TASK-036 | Create `client/src/App.tsx` assembling `TopScenarioBar`, `TimelinePane` (Bryntum Gantt), `StudioWorkspace` (AG Studio 3.0), `ApprovalCheckoutModal`, and `AuditDrawer` in a responsive split-pane layout (`ARC-002`). | | |

### Implementation Phase 8: End-to-End Integration Testing, Render Deployment & Submission Verification

- GOAL-008: Verify all deterministic unit tests and live Sandbox integration tests (`TEST-001` through `TEST-014`), configure declarative cloud deployment (`render.yaml`), and validate full compliance with Devpost submission rules (`CON-005`, `CON-006`).

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-037 | Create `server/src/__tests__/apiIntegration.test.ts` testing the Express endpoints against a test SQLite instance and verifying that SQLite `prevent_audit_update` and `prevent_audit_delete` triggers abort any attempt to tamper with `audit_events` (`SEC-007`, `TEST-007` through `TEST-011`). | | |
| TASK-038 | Create `server/src/scripts/verifyLiveSandbox.ts` (runnable via `npm run verify:sandbox`) that executes a live smoke test against PayPal Sandbox OAuth2, creates a draft PayPal Sandbox invoice, generates a real QR code, creates a PayPal Sandbox order, and queries Channel3 `/v0/search`, printing the real returned IDs to stdout (`CON-001`, `TEST-012`, `TEST-013`). | | |
| TASK-039 | Create `/render.yaml` configuring the Render Web Service (serving both the Node/Express API and the built Vite static bundle from `client/dist`) with persistent disk mounted at `/var/data/cascade_os.sqlite` and environment variable declarations (`CON-005`). | | |
| TASK-040 | Create comprehensive `/README.md` documenting the system architecture diagram, APIMatic Context Plugin workflow, AG Studio 3.0 Custom Widgets & Agent Framework architecture, Bryntum Gantt coupling, Channel3 arbitrage integration, local setup steps, `.env.example` variables, and reproducible test commands (`CON-005`, `GUD-004`). | | |

---

## 3. Alternatives

- **ALT-001**: **Prompt-Only Guardrails Inside the LLM** — Rejected because LLMs are vulnerable to prompt injection from untrusted product descriptions or invoice memos and can make floating-point calculation errors[cite: 1]. All dependency and budget checks are enforced in `server/src/engine/policyEngine.ts` outside the model[cite: 1].
- **ALT-002**: **Mocked In-Memory PayPal Responses** — Rejected because the user and hackathon rules require a genuine working integration with the PayPal Developer Platform in Sandbox[cite: 1]. All invoices, QR codes, reminders, and orders hit `https://api-m.sandbox.paypal.com`.
- **ALT-003**: **Standalone AG Grid Instead of AG Studio 3.0** — Rejected because the "Best Use of AG Grid" prize track explicitly rewards building inside **AG Studio** (`ag-studio-react`) with custom widgets, theming, cross-filtering, and the **Studio Agent Framework**.
- **ALT-004**: **Reactive Dispute Summarizer (DisputePilot)** — Rejected because PayPal Sandbox dispute state transitions are restricted in test environments and reactive document summarization is less visually compelling than live schedule rerouting and supplier arbitrage[cite: 1].
- **ALT-005**: **Floating-Point Currency Storage (`REAL` / `number` dollars)** — Rejected due to precision errors (e.g., `19.99 * 100` precision drift); integer minor units (`INTEGER` cents/paise) are enforced across the entire stack[cite: 1].

---

## 4. Dependencies

- **DEP-001**: `@paypal/agent-toolkit` (`^1.x`) — Official PayPal AI Agent Toolkit for Invoicing, Orders, and Insights tool definitions.
- **DEP-002**: `@paypal/react-paypal-js` (`^8.x`) & PayPal JS SDK v6 — Official browser SDK for rendering PayPal Checkout and Pay Later sandbox buttons.
- **DEP-003**: `ag-studio-react` & `ag-studio` (`^3.0.0`) — Official AG Studio 3.0 React embedded analytics component, client-side Data Engine, `createWidgets` API, and Studio Agent Framework.
- **DEP-004**: `@bryntum/gantt` & `@bryntum/gantt-react` (`^6.x`) — Official Bryntum Gantt chart engine and React wrapper for payment-coupled timeline scheduling (using the hackathon trial registry).
- **DEP-005**: `better-sqlite3` (`^11.x`) & `@types/better-sqlite3` — Synchronous, high-performance embedded SQLite driver supporting WAL mode and ACID transactions.
- **DEP-006**: `express` (`^4.21.x`) & `@types/express` — HTTP server framework for REST API and PayPal webhook endpoints.
- **DEP-007**: `zod` (`^3.23.x`) — Runtime schema validation for environment variables, API request bodies, and custom widget `formatShape` schemas.
- **DEP-008**: `openai` (`^4.x`) — LLM client for the Nudge-Bot message generator and AG Studio Agent Framework LLM adapter.
- **DEP-009**: `react` (`^18.3.x`) & `react-dom` (`^18.3.x`) — Frontend UI library.
- **DEP-010**: `vite` (`^5.4.x`) & `@vitejs/plugin-react` — Frontend build tool and dev server.
- **DEP-011**: `tailwindcss` (`^3.4.x`), `postcss`, `autoprefixer`, and `lucide-react` — Styling and iconography for the dark FinOps UI.
- **DEP-012**: `vitest` (`^2.1.x`) & `supertest` (`^7.x`) — Unit and HTTP integration testing framework.
- **DEP-013**: **PayPal Developer Sandbox Account** — Provides `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` against `https://api-m.sandbox.paypal.com`[cite: 1].
- **DEP-014**: **Channel3 API Account** — Provides `CHANNEL3_API_KEY` (using hackathon code `PAYPAL-HACKATHON-2026`) against `https://api.trychannel3.com/v0`.
- **DEP-015**: **APIMatic Context Plugin** — Used to validate and generate strongly typed PayPal Invoicing v2 and Orders v2 client models[cite: 1].
- **DEP-016**: **Render Cloud Platform** — Hosts the unified web service and persistent SQLite disk defined in `render.yaml`[cite: 1].

---

## 5. Files

- **FILE-001**: `/package.json` — Root npm workspace configuration and scripts (`dev`, `build`, `test`, `verify:sandbox`).
- **FILE-002**: `/tsconfig.base.json` — Shared strict TypeScript compiler configuration.
- **FILE-003**: `/.env.example` — Template of all required environment variables with safe placeholder names[cite: 1].
- **FILE-004**: `/render.yaml` — Render Infrastructure-as-Code blueprint with persistent disk mount.
- **FILE-005**: `/LICENSE` — Open-source MIT license required by Devpost rules[cite: 1].
- **FILE-006**: `/README.md` — Architecture, setup instructions, sponsor integration guide, and test documentation[cite: 1].
- **FILE-007**: `/server/package.json` — Backend dependencies and scripts.
- **FILE-008**: `/server/tsconfig.json` — Backend TypeScript configuration.
- **FILE-009**: `/server/src/config/env.ts` — Zod environment validator failing fast on missing credentials.
- **FILE-010**: `/server/src/types/domain.ts` — Canonical domain interfaces and minor-unit types.
- **FILE-011**: `/server/src/utils/moneyAndHash.ts` — Minor-unit currency formatters and SHA-256 `state_fingerprint` generator.
- **FILE-012**: `/server/src/db/schema.sql` — SQLite DDL with foreign keys, check constraints, and append-only audit triggers.
- **FILE-013**: `/server/src/db/database.ts` — `better-sqlite3` connection manager and transactional repositories.
- **FILE-014**: `/server/src/engine/criticalPathEngine.ts` — Deterministic DAG traversal, blocked task detector, and idle crew burn calculator.
- **FILE-015**: `/server/src/engine/scheduleRerouter.ts` — Deterministic schedule promotion and date recalculation engine.
- **FILE-016**: `/server/src/engine/policyEngine.ts` — Deterministic `ALLOW` / `BLOCK` / `REQUIRE_APPROVAL` firewall with 7 rule checks.
- **FILE-017**: `/server/src/engine/__tests__/engine.test.ts` — Vitest unit test suite for critical path, rerouting, and policy rules.
- **FILE-018**: `/server/src/services/paypalAuthService.ts` — Live PayPal Sandbox OAuth2 token client with expiry caching.
- **FILE-019**: `/server/src/services/paypalInvoicingService.ts` — Live PayPal Invoicing v2 client (`create`, `send`, `get`, `update` partial unlock, `generate-qr-code`, `remind`).
- **FILE-020**: `/server/src/services/paypalOrdersService.ts` — Live PayPal Orders v2 client (`create`, `capture`, `get`) with idempotency headers.
- **FILE-021**: `/server/src/services/paypalAgentToolkitBridge.ts` — `@paypal/agent-toolkit` integration module.
- **FILE-022**: `/server/src/services/channel3Service.ts` — Live Channel3 `/v0/search` and `/v0/products/:id` client and quote normalizer.
- **FILE-023**: `/server/src/services/nudgeAndFinOpsAiService.ts` — OpenAI structured-output client for empathetic Nudge-Bot drafting and FinOps summaries.
- **FILE-024**: `/server/src/services/projectBootstrapService.ts` — Live project seeder creating real PayPal Sandbox invoices and Channel3 quotes.
- **FILE-025**: `/server/src/schemas/apiSchemas.ts` — Zod HTTP request validation schemas.
- **FILE-026**: `/server/src/routes/projectRoutes.ts` — Health, bootstrap, and project state endpoints.
- **FILE-027**: `/server/src/routes/scenarioRoutes.ts` — Live Scenario A, B, and C execution endpoints.
- **FILE-028**: `/server/src/routes/recoveryRoutes.ts` — Human approval, schedule reroute, PayPal invoice split, and PayPal order creation/capture endpoints.
- **FILE-029**: `/server/src/routes/studioAgentRoutes.ts` — AG Studio Agent Framework LLM & tool execution endpoint.
- **FILE-030**: `/server/src/routes/webhookRoutes.ts` — PayPal Sandbox webhook signature verifier and event handler.
- **FILE-031**: `/server/src/index.ts` — Express server entry point.
- **FILE-032**: `/server/src/scripts/verifyLiveSandbox.ts` — CLI verification script proving live PayPal Sandbox and Channel3 connectivity.
- **FILE-033**: `/client/src/components/TimelinePane.tsx` — `<BryntumGantt />` timeline component with custom PayPal status badges.
- **FILE-034**: `/client/src/studio/StudioWorkspace.tsx` — `<AgStudio />` 3.0 workspace registering `CascadeRecoveryWidget`, `FriendlyNudgeScoreboardWidget`, and `cascadeFinOpsAgent`.

---

## 6. Testing

- **TEST-001**: **Minor-Unit Conversion & SHA-256 Fingerprint Determinism (`engine.test.ts`)** — Verify `formatMinorToPayPalValue(139600, 'USD') === "1396.00"`, `parsePayPalValueToMinor("1396.00") === 139600`, and `computeStateFingerprint()` produces identical hashes regardless of object key insertion order[cite: 1].
- **TEST-002**: **Critical-Path Blast Radius Calculation (`engine.test.ts`)** — Given `task_phase_2_displays` (`OVERDUE`, 2 days, `68000` cents/day burn, `144000` cents SLA penalty) blocking `task_phase_4_calibration`, verify `analyzeProjectBlastRadius()` returns `idle_crew_hours === 16`, `idle_labor_cost_minor === 136000`, `sla_penalty_minor === 144000`, `total_exposure_minor === 280000`, and selects `task_phase_3_networking` as the promotable candidate.
- **TEST-003**: **Scenario A Policy Evaluation (`engine.test.ts`)** — Verify promoting `task_phase_3_networking` (`hard_dependencies: ['task_phase_1_wiring']` completed, `materials_in_warehouse: true`) returns `decision === 'REQUIRE_APPROVAL'` before human sign-off and `decision === 'ALLOW'` with `reason_codes === []` once approved[cite: 1].
- **TEST-004**: **Scenario B Incumbent Vendor Price-Creep Block (`engine.test.ts`)** — Given historical unit price `38000` cents (`$380.00`), max variance `10.0%`, phase budget cap `160000` cents (`$1,600.00`), and incumbent quote `49000` cents x 4 (`196000` cents total, `+28.95%`), verify `evaluateRecoveryAndSupplierAction()` returns `decision === 'BLOCK'` with `reason_codes` containing both `'VENDOR_PRICE_CREEP_EXCEEDED'` and `'TOTAL_EXCEEDS_PHASE_BUDGET'`[cite: 1].
- **TEST-005**: **Scenario B Channel3 Replacement Quote Approval (`engine.test.ts`)** — Given the Channel3 quote at `34900` cents x 4 (`139600` cents total, `-8.16%` vs. historical baseline, `$564.00` savings vs. incumbent) and matching user approval fingerprint, verify `evaluateRecoveryAndSupplierAction()` returns `decision === 'ALLOW'`[cite: 1].
- **TEST-006**: **Scenario C Adversarial Dependency & Unknown Cost Fail-Closed Block (`engine.test.ts`)** — Verify attempting to promote `task_phase_4_calibration` while `task_phase_2_displays` is incomplete OR passing `shippingMinor: null` returns `decision === 'BLOCK'` with `'HARD_DEPENDENCY_VIOLATION'` and `'UNKNOWN_COST_FIELD'`[cite: 1].
- **TEST-007**: **Fingerprint Mutation Invalidation (`apiIntegration.test.ts`)** — Verify that modifying the quote price by `1` cent after `user_approvals` is recorded causes `POST /api/paypal/orders/create` to reject the request with HTTP `409 Conflict` and `reason_codes: ['STALE_FINGERPRINT_APPROVAL']`[cite: 1].
- **TEST-008**: **Append-Only Audit Ledger Enforcement (`apiIntegration.test.ts`)** — Verify that executing `UPDATE audit_events SET decision = 'ALLOW'` or `DELETE FROM audit_events` throws a SQLite `ABORT` error (`SEC-007`)[cite: 1].
- **TEST-009**: **Zod Input Validation Gate (`apiIntegration.test.ts`)** — Verify that sending negative minor units, floating-point numbers (`1396.55`), or missing fields to `/api/paypal/orders/create` fails closed with HTTP `400 Bad Request` (`SEC-005`).
- **TEST-010**: **Live PayPal Sandbox OAuth2 & Invoicing v2 Verification (`verifyLiveSandbox.ts`)** — Execute a real Sandbox token exchange, create a draft invoice on `api-m.sandbox.paypal.com`, update its partial payment configuration, and generate a real Base64 QR code, asserting HTTP `200`/`201` and non-empty `invoice_id` and `qr_code_base64`[cite: 1].
- **TEST-011**: **Live PayPal Sandbox Orders v2 Creation (`verifyLiveSandbox.ts`)** — Execute `createSupplierOrder()` for `$1,396.00` (`139600` cents) against `POST https://api-m.sandbox.paypal.com/v2/checkout/orders` and assert a valid PayPal Order ID (`status === 'CREATED'`) is persisted in `paypal_transactions`[cite: 1].
- **TEST-012**: **Live Channel3 Product Search & Normalization (`verifyLiveSandbox.ts`)** — Query Channel3 `/v0/search` for `"32 inch 4K UHD IPS Monitor Ergonomic Stand"`, assert HTTP `200`, and verify that returned products are normalized into integer minor units and persisted in `supplier_quotes` with `source_type === 'CHANNEL3_LIVE'`.
- **TEST-013**: **AG Studio Custom Widget Schema & Cross-Filter Test** — Verify `CascadeRecoveryWidget` and `FriendlyNudgeScoreboardWidget` mount inside `<AgStudio />`, render live rows from `project_tasks` and `supplier_quotes`, validate format state through `formatShape.parse()`, and invoke `widgetApi.toggleCrossFilter()` on badge click.
- **TEST-014**: **End-to-End Browser Checkout & Timeline Transition Test** — Complete the PayPal Sandbox buyer approval flow in `ApprovalCheckoutModal`, verify `POST /api/paypal/orders/:orderId/capture` records the authoritative PayPal `capture_id`, and assert that `task_phase_2_displays` transitions to `MATERIALS_ORDERED` on `<BryntumGantt />`[cite: 1].

---

## 7. Risks & Assumptions

- **RISK-001**: **PayPal Sandbox Invoicing Rate Limits or Latency Spikes** — Creating 6 invoices sequentially during project bootstrap can take 4–7 seconds on PayPal Sandbox. *Mitigation:* Persist created `paypal_invoice_id` values in SQLite (`cascade_os.sqlite`) so subsequent page loads read existing real Sandbox invoices via `GET /v2/invoicing/invoices/{id}` unless the user explicitly clicks `"Reset & Re-create Sandbox Invoices"`.
- **RISK-002**: **PayPal Sandbox QR Code Require Sent Invoice State** — PayPal Invoicing v2 `/generate-qr-code` and `/remind` require the invoice to be in `SENT` or `UNPAID` status (not `DRAFT`). *Mitigation:* `projectBootstrapService.ts` immediately transitions newly created milestone invoices from `DRAFT` to `SENT` via `POST /v2/invoicing/invoices/{id}/send` (`send_to_invoicer: false`, `send_to_recipient: true`).
- **RISK-003**: **Channel3 Search Returning Variable Retail Pricing Over Time** — Live retail prices on Channel3 can fluctuate between days. *Mitigation:* `policyEngine.ts` dynamically evaluates whatever live `unit_price_minor` Channel3 returns against `phase_hardware_budget_max_minor` (`160000` cents) and `historical_unit_price_minor` (`38000` cents), selecting the lowest-priced compliant in-stock SKU and caching the timestamped quote in `supplier_quotes`[cite: 1].
- **RISK-004**: **Bryntum & AG Studio Trial Package Registry Configuration** — Both `@bryntum/gantt-react` and `ag-studio-react` require trial configuration/license tokens provided by the hackathon sponsors. *Mitigation:* Document the exact `.npmrc` and trial key environment variable (`VITE_AG_STUDIO_LICENSE_KEY`) in `.env.example` and `README.md`.
- **RISK-005**: **LLM Latency Blocking Deterministic UI Updates** — Waiting for an LLM call before showing the schedule blast radius slows down the UI. *Mitigation:* Run `criticalPathEngine.ts` and `policyEngine.ts` synchronously (<5ms) so the blast radius and policy decision render immediately, while the Nudge-Bot text streams in asynchronously.
- **RISK-006**: **Duplicate Clicks on PayPal Order or Split Invoice Buttons** — Users or judges double-clicking action buttons could trigger duplicate API calls. *Mitigation:* Disable action buttons while requests are in flight and attach deterministic `PayPal-Request-Id: ${planId}-${actionType}` idempotency headers to every outbound PayPal POST request[cite: 1].
- **RISK-007**: **SQLite Ephemeral Storage on Free Cloud Redeploys** — Standard container filesystems reset on redeploy. *Mitigation:* Configure a persistent disk in `render.yaml` mounted at `/var/data` and auto-run `bootstrapApexClinicProject()` if the SQLite database is empty on startup.
- **ASSUMPTION-001**: The developer has created a free PayPal Developer account (`https://developer.paypal.com`) and obtained Sandbox `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` credentials[cite: 1].
- **ASSUMPTION-002**: The developer has redeemed the hackathon Channel3 API key (`PAYPAL-HACKATHON-2026`) and set `CHANNEL3_API_KEY` in `.env`.
- **ASSUMPTION-003**: Node.js `>=20.11.0` (with native C++ build tools for `better-sqlite3`) and npm `>=10.0.0` are installed in the execution environment.
- **ASSUMPTION-004**: The AG Studio 45-day free trial license key from the PayPal AI Hackathon sponsor page is available or AG Studio is run in trial evaluation mode during local development.
- **ASSUMPTION-005**: An OpenAI-compatible API key (`OPENAI_API_KEY`) is configured in `.env` for Nudge-Bot copy generation and AG Studio Agent Framework natural-language queries.
- **ASSUMPTION-006**: All demo transactions are executed using PayPal Sandbox personal/buyer and business/merchant test accounts, with zero real-money movement[cite: 1].

---

## 8. Related Specifications / Further Reading

- [PayPal AI Hackathon Official Devpost Hub](https://paypalaihackathon.devpost.com/)[cite: 1]
- [PayPal AI Hackathon Sponsor & Developer Resources](https://paypalaihackathon.devpost.com/resources)[cite: 1]
- [PayPal Invoicing v2 REST API Specification](https://developer.paypal.com/docs/api/invoicing/v2/)
- [PayPal Orders v2 Checkout REST API Specification](https://developer.paypal.com/docs/api/orders/v2/)
- [PayPal Agentic AI Toolkit Documentation](https://developer.paypal.com/community/blog/paypal-agentic-ai-toolkit/)[cite: 1]
- [AG Studio React Quick Start Documentation](https://www.ag-grid.com/studio/react/quick-start/)
- [AG Studio Custom Widgets & Schema Documentation](https://www.ag-grid.com/studio/react/custom-widgets/)
- [AG Studio Agent Framework & Runners Documentation](https://www.ag-grid.com/studio/react/ai-agents/)
- [Bryntum Gantt React Integration Guide](https://bryntum.com/products/gantt/docs/guide/Gantt/integration/react/guide)
- [Channel3 API Reference & Hackathon Details](https://paypalaihackathon.devpost.com/details/channel3)[cite: 1]
- [APIMatic PayPal Context Plugin Details](https://paypalaihackathon.devpost.com/details/apimatic)[cite: 1]