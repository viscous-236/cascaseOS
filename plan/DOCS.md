# CascadeOS: Master Product & Engineering Specification

**Prepared:** October 14, 2026  
**Target Event:** [PayPal AI Hackathon on Devpost](https://paypalaihackathon.devpost.com/) · [Sponsor & Developer Resources](https://paypalaihackathon.devpost.com/resources)  
**Submission Deadline:** November 12, 2026 @ 12:00 PM PST  
**Eligible Prize Stack ($32,750+ Total Pool):**
* **Overall Top 3:** $12,000 (1st) / $8,000 (2nd) / $5,000 (3rd)
* **Core Categories:** Best Use of PayPal + AI ($5,000) · Best Use of Agentic Commerce ($5,000) · Most Impactful ($5,000) · Best Demo Delivery ($5,000)
* **Sponsor Tracks:** Best Use of AG Grid ($5,000 1st / $2,000 2nd / 3x $1,000 3rd) · Best Use of Bryntum (3x $1,000) · Best Use of Channel3 ($1,500) · Best Use of APIMatic (3x $1,000 + 6-mo Business Plan) · Best Use of Render ($1,000 / $750 / $500 Credits)

> **Governance & Safety Notice:** This document specifies a hackathon prototype and implementation plan, not an official PayPal product or statement of endorsement. Confirm all API endpoints, sponsor eligibility rules, and submission requirements on Devpost. Use exclusively PayPal Sandbox/test transactions and synthetic customer data for demonstrations. Never commit live API credentials, private keys, or sensitive personal data to source control or expose them in the demo video.

---

## 1. Executive Summary & Product Concept

### One-Line Pitch
**CascadeOS is a payment-coupled project timeline and supply-chain operating system that automatically reroutes schedules in Bryntum, splits overdue client invoices in PayPal, and switches overpriced suppliers via Channel3 inside an AG Studio 3.0 command center.**

### Elevator Pitch
In real-world project businesses—such as medical/surgical clinic buildouts, studio installations, custom hardware manufacturing, and technical agencies—time and money are physically locked together:
* You cannot order **Phase 2 hardware** from a supplier on Tuesday until **Client A pays their Phase 2 PayPal Invoice** on Monday.
* Your **installation crew** cannot mount the hardware on Thursday unless it ships on Tuesday.

Today, project management tools (Gantt charts and calendars) have zero awareness of whether a PayPal invoice has been paid, and PayPal has zero awareness of which crews, tasks, or supplier orders are blocked when an invoice goes overdue. Worse, when suppliers quietly hike unit prices on hardware invoices by 20–30%, busy project managers often overpay because they lack real-time retail market comparisons.

**CascadeOS** links every task on a **Bryntum Gantt/Scheduler timeline** to its incoming **PayPal Invoice** and outgoing **Supplier Order**. When a client payment slips or a vendor overcharges, a **Deterministic Graph & FinOps Engine** calculates the exact idle-crew blast radius in integer minor units, audits supplier line items against **Channel3’s 100M+ real-time product catalog**, and uses the **AG Studio 3.0 Agent Framework** to spawn an interactive recovery workspace. Upon explicit human approval, CascadeOS executes a coordinated 3-part recovery:
1. **Self-Reroutes the Bryntum Schedule:** Promotes unblocked tasks whose materials are already in stock, cutting projected idle labor loss to **$0**.
2. **Splits the Overdue PayPal Invoice:** Uses `@paypal/agent-toolkit` (`update_invoicing`, `generate_invoice_qr_code`, `send_invoice_reminder`) to split an overdue $4,500 phase invoice into an immediate **$1,396 "Materials-Only Critical Path Unlock"** (with **PayPal Pay Later** enabled) accompanied by a warm AI "Nudge-Bot" reminder.
3. **Executes Supplier Arbitrage Checkout:** Blocks the overpriced incumbent vendor bill ($1,960) and purchases the identical in-stock hardware discovered via **Channel3** ($1,396 — saving **28.78%**) via **PayPal Sandbox Checkout** (`Orders v2`).

### Strategic Fit Matrix

| Dimension | CascadeOS Design |
| :--- | :--- |
| **Primary Persona** | Operations Manager / Project Lead at an equipment installation, buildout, or technical agency |
| **Core User Value** | Eliminates idle crew burn from overdue client invoices and stops margin bleed from supplier price hikes |
| **AI's Role** | Intent parsing, empathetic "Nudge-Bot" drafting, Channel3 SKU matching, and AG Studio dashboard generation |
| **Deterministic Backbone** | Integer minor-unit critical-path blast-radius calculator, dependency verifier, and budget policy firewall |
| **PayPal's Role** | Central state machine: Invoicing v2 (create, update/split, QR code, reminders), Orders v2 Checkout, and Pay Later |
| **Sponsor Stack** | **AG Studio 3.0** (`ag-studio-react`) + **Bryntum** (`@bryntum/gantt-react`) + **Channel3** + **APIMatic** + **Render** |

---

## 2. The Problem & Why Prompt-Only AI Fails

### Operational Bottlenecks
1. **The Late-Payment Domino Effect:** When a $4,500 milestone invoice is 3 days late, managers rarely realize that only $1,396 of that invoice is needed immediately to ship hardware with a 48-hour lead time. Because the full invoice stalls, the hardware isn't ordered, technicians sit idle on Thursday, and downstream phases miss their SLA deadlines.
2. **Silent Vendor Price Creep:** Suppliers routinely increase prices on repeat hardware or consumable line items by 15%–30%, relying on operational urgency to push the bill through unchallenged.
3. **Disconnected Tooling:** Financial data sits in PayPal, schedules sit in a Gantt chart, and market pricing sits across thousands of retail sites.

### Why aDeterministic Engine Is Required Outside the LLM
Instructing an LLM via a system prompt to *"rearrange the schedule and pay the cheapest supplier"* is unsafe:
* An LLM can hallucinate physical task dependencies (e.g., scheduling optical calibration *before* the monitors are mounted).
* An LLM can make floating-point rounding errors or misread currency/shipping totals.
* Hostile text in a vendor invoice note or product description could attempt prompt injection to force payment to an unverified account.

In **CascadeOS**, the LLM is never permitted to mutate the schedule or call PayPal payment endpoints directly. All dependency checks, idle-burn calculations, price-variance thresholds, and budget caps are enforced by a **deterministic TypeScript policy engine** operating in integer minor units (cents/paise) immediately prior to execution.

---

## 3. Target Users & Default Demo Scenario

### Target Personas
* **Primary User (Operations / Project Manager):** Needs real-time visibility into which unpaid PayPal invoices threaten project timelines, automated schedule rerouting to keep crews productive, and instant price checks on supplier bills.
* **Secondary User (Client / Project Sponsor):** Wants transparent schedule updates and flexible payment options (such as paying only the materials portion upfront via PayPal QR code or Pay Later while deferring labor billing).

### Default Demo Scenario: *"Apex Diagnostic Clinic & Studio Buildout"*
CascadeOS boots with a realistic, high-stakes 6-phase installation project so judges understand the scenario in under 10 seconds:

| Phase ID | Task Name | Dependencies | Materials Status | Client PayPal Invoice | Schedule State |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `task_phase_1` | Power & Conduit Rough-In | None | Installed | `$3,200.00` (`PAID`) | `COMPLETED` |
| `task_phase_2` | **4K Diagnostic Display Mounting** | `task_phase_1` | **Needs Order (4 Units)** | **`$4,500.00` (`OVERDUE`)** | **`PAYMENT_BLOCKED`** |
| `task_phase_3` | **Acoustic Paneling & Network Rack** | `task_phase_1` | **In Warehouse** | `$2,800.00` (`PAID`) | **`READY_TO_PROMOTE`** |
| `task_phase_4` | Optical Calibration & Burn-In | `task_phase_2` | N/A (Service) | `$1,800.00` (`DRAFT`) | **`BLOCKED_BY_PHASE_2`** |
| `task_phase_5` | Clinical Staff Workflow Training | `task_phase_3`, `task_phase_4` | In Warehouse | `$1,500.00` (`DRAFT`) | `SCHEDULED` |
| `task_phase_6` | Final Handover & Sign-Off | `task_phase_5` | N/A | `$1,200.00` (`DRAFT`) | `SCHEDULED` |

---

## 4. End-to-End User & Agent Workflow

1. **Monitor the Coupled Workspace:** The user views the **Bryntum Gantt Timeline** (upper pane) synchronized with the **AG Studio 3.0 Financial Canvas** (lower pane).
2. **Ingest the Double Crisis:**
   * **Crisis 1 (Client Late Payment):** Client A’s Phase 2 PayPal Invoice (`$4,500.00`) turns `OVERDUE`, blocking `task_phase_2` and cascading into `task_phase_4`.
   * **Crisis 2 (Supplier Overcharge):** Incumbent vendor *MedTech Supply Co.* submits a quote/bill for 4x 32" 4K Ergonomic Monitors at **$490.00/unit ($1,960.00 total)**—a **28.95% price hike** over the **$380.00/unit** historical baseline and above the **$1,600.00** phase hardware budget cap.
3. **Run the Deterministic Blast-Radius & Arbitrage Engine:**
   * The backend **Critical-Path Calculator** computes that `task_phase_2` and `task_phase_4` put **16 crew hours ($1,360.00)** and a **$1,440.00 SLA penalty** at risk (**$2,800.00 total exposure**).
   * It identifies that `task_phase_3` depends only on `task_phase_1` (completed) and has all materials in the warehouse (`materials_in_warehouse: true`).
   * The **Supplier Price-Creep Auditor** calls **Channel3 (`/search` and `/lookup`)** and locates the exact specification (*LG 32UN880-B 32" UltraFine Ergo 4K*) in stock from a verified retailer at **$349.00/unit ($1,396.00 total)**—saving **$564.00 (28.78%)**.
4. **Spawn the AG Studio Crisis Dashboard:**
   * Through the **AG Studio Agent Framework**, the custom **Cascade FinOps Agent** delegates to Studio's built-in `data` and `widget` agents (`tools.delegateTo(['data', 'widget'])`) to update the canvas and populate two custom React widgets: `CascadeRecoveryWidget` and `FriendlyNudgeScoreboardWidget`.
5. **Enforce Deterministic Policy Guardrails:**
   * The Policy Engine returns `BLOCK` (`["VENDOR_PRICE_CREEP_EXCEEDED", "TOTAL_EXCEEDS_PHASE_BUDGET"]`) against the incumbent vendor's $1,960.00 bill.
   * It evaluates the proposed recovery plan (promote Phase 3, split the client invoice to $1,396.00 materials unlock, and buy from the Channel3 merchant for $1,396.00) and returns `REQUIRE_APPROVAL` with a cryptographic `state_fingerprint`.
6. **Human Approval & One-Click Execution:**
   * The manager reviews the side-by-side policy diff and clicks **"Approve & Execute Recovery Plan"**.
   * **Bryntum Action:** Animates `task_phase_3` into Thursday's slot and shifts `task_phase_2` to Monday, dropping idle labor exposure from **$2,800.00 to $0.00**.
   * **PayPal Invoicing Action:** Calls PayPal Sandbox (`update_invoicing`, `generate_invoice_qr_code`, `send_invoice_reminder`) to set the immediate unlock to **$1,396.00**, render a live scannable **PayPal QR Code**, and send the empathetic Nudge-Bot message.
   * **PayPal Checkout Action:** Opens the **PayPal JS SDK v6 Sandbox Checkout** for the **$1,396.00** Channel3 replacement order, captures the sandbox payment via `Orders v2`, records the authoritative `paypal_order_id` and `capture_id`, and flips `task_phase_2` on the Bryntum timeline to emerald green (`MATERIALS_ORDERED — ON TRACK`).

---

## 5. MVP Scope

### Must-Have
* Split-screen React application integrating **Bryntum Gantt** and **AG Studio 3.0 (`<AgStudio />`)**.
* Pure TypeScript **Deterministic Graph & Policy Engine** using integer minor-unit arithmetic (cents/paise).
* Live **Channel3 API** client (`/search` and `/lookup`) with automatic fallback to a labeled deterministic fixture if offline.
* Live **PayPal Sandbox Invoicing v2** integration (`create_invoice`, `update_invoicing`, `generate_invoice_qr_code`, `send_invoice_reminder`, `get_invoice`) and **PayPal Sandbox Orders v2** checkout/capture flow.
* Two custom React widgets registered in AG Studio via `createWidgets` (`CascadeRecoveryWidget` and `FriendlyNudgeScoreboardWidget`) supporting `formatShape`, `ai` metadata, and `widgetApi.toggleCrossFilter()`.
* **Studio Agent Framework** wiring with a custom primary agent delegating to Studio’s built-in `data` and `widget` agents.
* **Demo Test Console** featuring 3 repeatable one-click test cases (Scenarios A, B, and C).
* Append-only Audit Ledger displaying `state_fingerprint`, policy reason codes, and real PayPal Sandbox transaction/invoice IDs.

### Should-Have
* Bidirectional cross-filtering between the Bryntum timeline and AG Studio widgets.
* Last-millisecond cart and schedule hash revalidation immediately prior to PayPal order creation.
* One-click Markdown/JSON export of the signed recovery and audit report.

### Out of Scope for MVP (Deferred)
* Real-money autonomous capture without human approval.
* Two-way sync with legacy ERPs (SAP, Oracle, NetSuite).
* Unconstrained headless browser scraping of arbitrary third-party login portals.

---

## 6. Data Schemas & Deterministic Policy Engine Specification

### 6.1 Canonical Task Schema (`CascadeTask`)
```json
{
  "task_id": "task_phase_2_displays",
  "project_id": "proj_apex_clinic_01",
  "version": 1,
  "name": "Phase 2: 4K Diagnostic Display Mounting",
  "start_date": "2026-10-16",
  "end_date": "2026-10-18",
  "duration_days": 2,
  "hard_dependencies": ["task_phase_1_wiring"],
  "materials_in_warehouse": false,
  "crew_assigned": "Tech Team Alpha",
  "daily_idle_burn_minor": 68000,
  "sla_delay_penalty_minor": 144000,
  "phase_hardware_budget_max_minor": 160000,
  "currency": "USD",
  "client_invoice": {
    "paypal_invoice_id": "INV2-ABCD-1234-EFGH-5678",
    "status": "OVERDUE",
    "total_amount_minor": 450000,
    "materials_unlock_minor": 139600,
    "deferred_labor_minor": 310400,
    "client_name": "Apex Medical Group",
    "client_email": "billing-sandbox@apexclinic.example"
  },
  "supplier_requirement": {
    "sku_search_query": "32 inch 4K UHD IPS Monitor Ergonomic Stand",
    "quantity": 4,
    "incumbent_vendor_id": "vendor_medtech_99",
    "incumbent_vendor_name": "MedTech Supply Co.",
    "incumbent_unit_price_minor": 49000,
    "incumbent_total_minor": 196000,
    "historical_unit_price_minor": 38000,
    "max_allowed_variance_pct": 10.0
  }
}
```

### 6.2 Canonical Recovery Plan Schema (`CascadeRecoveryPlan`)
```json
{
  "plan_id": "plan_2026_884",
  "state_fingerprint": "sha256:4a7d1ed414474e4033ac29ccb8653d9b0000",
  "blast_radius": {
    "blocked_task_ids": ["task_phase_2_displays", "task_phase_4_calibration"],
    "idle_crew_hours": 16,
    "idle_labor_cost_minor": 136000,
    "sla_penalty_minor": 144000,
    "total_exposure_minor": 280000
  },
  "schedule_reroute": {
    "blocked_task_id": "task_phase_2_displays",
    "promoted_task_id": "task_phase_3_networking",
    "new_promoted_start_date": "2026-10-16",
    "new_blocked_start_date": "2026-10-19",
    "dependency_check_passed": true,
    "exposure_mitigated_minor": 280000
  },
  "invoice_split_proposal": {
    "paypal_invoice_id": "INV2-ABCD-1234-EFGH-5678",
    "immediate_materials_unlock_minor": 139600,
    "deferred_labor_milestone_minor": 310400,
    "enable_pay_later": true,
    "nudge_message": "Hi Apex team! To keep your clinic opening on track for Oct 24, we promoted network cabling to Thursday and generated a $1,396.00 materials-only PayPal link (Pay Later enabled) so we can ship your 4K displays today and defer labor billing to next week."
  },
  "channel3_arbitrage": {
    "channel3_product_id": "ch3_lg_32un880b",
    "product_title": "LG 32UN880-B 32\" UltraFine Display Ergo 4K HDR10",
    "merchant_name": "Verified Channel3 Commercial Partner",
    "unit_price_minor": 34900,
    "quantity": 4,
    "shipping_minor": 0,
    "tax_minor": 0,
    "total_minor": 139600,
    "savings_vs_incumbent_minor": 56400,
    "savings_pct": 28.78,
    "observed_at": "2026-10-14T15:30:00Z"
  }
}
```

### 6.3 Deterministic Policy Engine Implementation (`policyEngine.ts`)
```typescript
export type PolicyDecisionType = 'ALLOW' | 'BLOCK' | 'REQUIRE_APPROVAL';

export type ReasonCode =
  | 'HARD_DEPENDENCY_VIOLATION'
  | 'MATERIALS_NOT_IN_WAREHOUSE'
  | 'VENDOR_PRICE_CREEP_EXCEEDED'
  | 'TOTAL_EXCEEDS_PHASE_BUDGET'
  | 'CURRENCY_MISMATCH'
  | 'UNKNOWN_COST_FIELD'
  | 'STALE_FINGERPRINT_APPROVAL';

export interface PolicyEvaluationResult {
  decision: PolicyDecisionType;
  reason_codes: ReasonCode[];
  observed: {
    currency: string;
    total_minor: number;
    variance_pct: number;
    unmet_dependencies: string[];
  };
  permitted: {
    currency: string;
    max_budget_minor: number;
    max_variance_pct: number;
  };
  requires_user_action: boolean;
}

export function evaluateScheduleAndSupplierAction(params: {
  taskToPromote: {
    id: string;
    hard_dependencies: string[];
    materials_in_warehouse: boolean;
  };
  completedTaskIds: string[];
  phaseCurrency: string;
  phaseBudgetMaxMinor: number;
  historicalUnitPriceMinor: number;
  maxAllowedVariancePct: number;
  proposedQuote: {
    currency: string;
    unitPriceMinor: number;
    quantity: number;
    shippingMinor: number | null;
    taxMinor: number | null;
  };
  hasExplicitUserApproval: boolean;
}): PolicyEvaluationResult {
  const reasonCodes: ReasonCode[] = [];

  // 1. Check currency consistency
  if (params.proposedQuote.currency !== params.phaseCurrency) {
    reasonCodes.push('CURRENCY_MISMATCH');
  }

  // 2. Fail closed on unknown shipping or tax
  if (params.proposedQuote.shippingMinor === null || params.proposedQuote.taxMinor === null) {
    reasonCodes.push('UNKNOWN_COST_FIELD');
  }

  // 3. Verify physical task dependencies and warehouse readiness
  const unmetDeps = params.taskToPromote.hard_dependencies.filter(
    (depId) => !params.completedTaskIds.includes(depId)
  );
  if (unmetDeps.length > 0) {
    reasonCodes.push('HARD_DEPENDENCY_VIOLATION');
  }
  if (!params.taskToPromote.materials_in_warehouse) {
    reasonCodes.push('MATERIALS_NOT_IN_WAREHOUSE');
  }

  // 4. Integer minor-unit total calculation
  const subtotalMinor = params.proposedQuote.unitPriceMinor * params.proposedQuote.quantity;
  const totalMinor =
    subtotalMinor +
    (params.proposedQuote.shippingMinor ?? 0) +
    (params.proposedQuote.taxMinor ?? 0);

  if (totalMinor > params.phaseBudgetMaxMinor) {
    reasonCodes.push('TOTAL_EXCEEDS_PHASE_BUDGET');
  }

  // 5. Supplier price-creep check against historical baseline
  const variancePct =
    ((params.proposedQuote.unitPriceMinor - params.historicalUnitPriceMinor) /
      params.historicalUnitPriceMinor) *
    100;

  if (variancePct > params.maxAllowedVariancePct) {
    reasonCodes.push('VENDOR_PRICE_CREEP_EXCEEDED');
  }

  if (reasonCodes.length > 0) {
    return {
      decision: 'BLOCK',
      reason_codes: reasonCodes,
      observed: {
        currency: params.proposedQuote.currency,
        total_minor: totalMinor,
        variance_pct: Number(variancePct.toFixed(2)),
        unmet_dependencies: unmetDeps,
      },
      permitted: {
        currency: params.phaseCurrency,
        max_budget_minor: params.phaseBudgetMaxMinor,
        max_variance_pct: params.maxAllowedVariancePct,
      },
      requires_user_action: true,
    };
  }

  return {
    decision: params.hasExplicitUserApproval ? 'ALLOW' : 'REQUIRE_APPROVAL',
    reason_codes: [],
    observed: {
      currency: params.proposedQuote.currency,
      total_minor: totalMinor,
      variance_pct: Number(variancePct.toFixed(2)),
      unmet_dependencies: [],
    },
    permitted: {
      currency: params.phaseCurrency,
      max_budget_minor: params.phaseBudgetMaxMinor,
      max_variance_pct: params.maxAllowedVariancePct,
    },
    requires_user_action: !params.hasExplicitUserApproval,
  };
}
```

---

## 7. System Architecture & Repository Structure

### 7.1 High-Level Architecture Diagram
```text
+---------------------------------------------------------------------------------------+
|                          FRONTEND: CASCADEOS STUDIO (React + Vite)                    |
|                                                                                       |
|  +----------------------------------------+  +-------------------------------------+  |
|  | BRYNTUM TIMELINE ENGINE                |  | DEMO TEST CONSOLE & PAYPAL MODAL    |  |
|  | (<BryntumGantt/>)                     |  | - 1-Click Scenarios A, B, C         |  |
|  | - Payment-coupled dependency bars      |  | - PayPal JS SDK v6 Sandbox Buttons  |  |
|  | - Animated schedule rerouting          |  | - Policy Diff & Approval Modal      |  |
|  +-------------------+--------------------+  +------------------+------------------+  |
|                      |                                          |                     |
|  +-------------------+------------------------------------------+------------------+  |
|  |                  AG STUDIO 3.0 EMBEDDED ANALYTICS (<AgStudio/>)                |  |
|  |  - Custom Widget 1: CascadeRecoveryWidget (Blast radius, Channel3 diff, CTA)    |  |
|  |  - Custom Widget 2: FriendlyNudgeScoreboardWidget (PayPal QR + Nudge-Bot)       |  |
|  |  - Studio Agent Framework: Cascade FinOps Agent -> delegates to data & widget   |  |
|  +----------------------------------------+----------------------------------------+  |
+-------------------------------------------|-------------------------------------------+
                                            | HTTPS / JSON + AG-UI Events
                                            v
+---------------------------------------------------------------------------------------+
|                      BACKEND: DETERMINISTIC GRAPH & FINOPS SERVER                     |
|                                                                                       |
|  1. Critical-Path & Policy Engine (policyEngine.ts — Integer Minor Units)             |
|     - Validates dependencies, calculates crew burn exposure, enforces budget caps     |
|                                                                                       |
|  2. Supplier Arbitrage Service (channel3Service.ts)                                   |
|     - Queries Channel3 /search & /lookup APIs for live retail pricing & stock         |
|                                                                                       |
|  3. PayPal Sandbox Service (paypalService.ts — APIMatic Validated)                    |
|     - @paypal/agent-toolkit + REST v2:                                                |
|       * Invoicing: create_invoice, update_invoicing, generate_invoice_qr_code,        |
|                    send_invoice_reminder, get_invoice, list_invoices                  |
|       * Orders: create_order, capture_order, get_order                                |
|                                                                                       |
|  4. Append-Only Audit Store (auditStore.ts — SQLite / PostgreSQL)                     |
+---------------------------------------------------------------------------------------+
```

### 7.2 Monorepo File Tree
```text
cascade-os/
├── LICENSE
├── README.md
├── render.yaml
├── .env.example
├── package.json
├── server/
│   ├── src/
│   │   ├── index.ts                  # Express API entry point
│   │   ├── engine/
│   │   │   ├── policyEngine.ts       # Deterministic ALLOW / BLOCK / REQUIRE_APPROVAL rules
│   │   │   ├── criticalPath.ts       # Blast-radius & idle-labor minor-unit calculator
│   │   │   └── policyEngine.test.ts  # Unit tests for Scenarios A, B, and C
│   │   ├── services/
│   │   │   ├── paypalService.ts      # PayPal Sandbox Invoicing v2 + Orders v2 + Agent Toolkit
│   │   │   ├── channel3Service.ts    # Channel3 /search and /lookup product oracle
│   │   │   └── nudgeAgentService.ts  # LLM Nudge-Bot & FinOps summary generator
│   │   ├── db/
│   │   │   ├── seedProject.ts        # Default 6-phase Apex Clinic Buildout fixture
│   │   │   └── auditLedger.ts        # Append-only event & transaction log
│   │   └── routes/
│   │       ├── projectRoutes.ts
│   │       ├── recoveryRoutes.ts
│   │       └── paypalRoutes.ts
└── client/
    ├── index.html
    ├── vite.config.ts
    └── src/
        ├── App.tsx                   # Split-screen layout + Demo Test Console
        ├── components/
        │   ├── TopScenarioBar.tsx    # 1-Click Scenario A / B / C triggers & KPI pills
        │   ├── TimelinePane.tsx      # Bryntum Gantt wrapper with custom PayPal status pills
        │   ├── ApprovalModal.tsx     # Policy diff viewer + PayPal JS SDK v6 Checkout
        │   └── AuditDrawer.tsx       # Append-only audit log with Sandbox IDs
        └── studio/
            ├── StudioWorkspace.tsx   # <AgStudio/> setup, theme, and Agent Framework harness
            ├── agents/
            │   └── cascadeFinOpsAgent.ts  # Primary agent delegating to 'data' and 'widget'
            └── widgets/
                ├── createCascadeWidgets.ts
                ├── CascadeRecoveryWidget.tsx        # Custom React Widget #1
                └── FriendlyNudgeScoreboardWidget.tsx # Custom React Widget #2
```

---

## 8. Sponsor-by-Sponsor Technical Integration Details

### 8.1 PayPal Developer Platform (`@paypal/agent-toolkit` + REST v2 + JS SDK v6)
* **Sandbox Invoicing Lifecycle:**
  * `POST /v2/invoicing/invoices` (`create_invoice`): Seeds the milestone invoices in Sandbox so every demo run interacts with a genuine PayPal Invoice ID.
  * `PUT /v2/invoicing/invoices/{invoice_id}` (`update_invoicing`): Updates the invoice breakdown or partial payment terms when the user approves the Materials-Only Critical Path Unlock (`$1,396.00`).
  * `POST /v2/invoicing/invoices/{invoice_id}/generate-qr-code` (`generate_invoice_qr_code`): Returns the base64 PNG QR code rendered live inside the `FriendlyNudgeScoreboardWidget`.
  * `POST /v2/invoicing/invoices/{invoice_id}/remind` (`send_invoice_reminder`): Sends the empathetic AI-generated nudge note to the sandbox recipient.
* **Sandbox Orders & Checkout Lifecycle:**
  * `POST /v2/checkout/orders` (`create_order`): Called only after `evaluateScheduleAndSupplierAction()` returns `ALLOW` for the `$1,396.00` Channel3 replacement cart.
  * `POST /v2/checkout/orders/{id}/capture` (`pay_order` / capture): Confirms authoritative sandbox settlement and persists the `capture_id` in the audit ledger.

### 8.2 AG Grid / AG Studio 3.0 (`ag-studio-react` — $10,000 Track)
* **Custom Widget Registration (`createCascadeWidgets.ts`):**
  * Both `CascadeRecoveryWidget` and `FriendlyNudgeScoreboardWidget` implement `AgWidgetDefinition` with:
    * `dataMapping`: Binds to the `project_tasks` and `supplier_quotes` tables in Studio's client-side Data Engine.
    * `formatShape` & `ai`: Exposes a typed schema and AI description so AG Studio's built-in `widget` agent can autonomously instantiate and configure our custom widgets on the canvas.
    * `widgetApi.toggleCrossFilter()`: Clicking a blocked task badge or price-creep alert inside `CascadeRecoveryWidget` cross-filters all other charts and grids in `<AgStudio />`.
* **Studio Agent Framework (`cascadeFinOpsAgent.ts`):**
  * Defines `cascade-finops-agent` as the `primary` agent in the Studio harness and attaches `tools.delegateTo(['data', 'widget'])` alongside custom tools (`inspectBlastRadius`, `compareChannel3Prices`).

### 8.3 Bryntum (`@bryntum/gantt-react` — $3,000 Track)
* Configures `<BryntumGantt />` with task dependencies, critical-path highlighting, and a custom `taskRenderer` that injects a live status pill (`PAID`, `OVERDUE — $2.8k AT RISK`, `REROUTED`, `MATERIALS ORDERED`) into each timeline bar.
* Implements two-way selection sync: clicking a task bar in Bryntum triggers `studioApi.setFilter()` on `<AgStudio />`.

### 8.4 Channel3 (`$1,500 Track`)
* Queries Channel3’s `/search` and `/lookup` endpoints with the task's required hardware spec, normalizing price into integer minor units and retaining the product ID, merchant name, URL, and observation timestamp.

### 8.5 APIMatic (`$3,000 Track`) & Render (`$2,250 Credits Track`)
* **APIMatic:** Uses APIMatic’s PayPal Context Plugin in the IDE to generate type-safe PayPal Invoicing v2 and Orders v2 request/response wrappers.
* **Render:** Includes a complete `render.yaml` Blueprint deploying both the web service and static frontend with environment-isolated sandbox secrets.

---

## 9. Safety, Threat Model & Responsible Engineering

| Threat / Failure Mode | Deterministic Control |
| :--- | :--- |
| **Prompt injection in vendor notes or product text** | External strings are treated strictly as untrusted data and never alter policy thresholds or dependency arrays. |
| **AI proposes promoting a task with unmet dependencies** | `evaluateScheduleAndSupplierAction()` checks `hard_dependencies` and `materials_in_warehouse` in pure TypeScript and returns `BLOCK`. |
| **Floating-point rounding errors on currency** | All amounts are stored and evaluated as integer minor units (e.g., `139600` cents for `$1,396.00`). |
| **Missing shipping or tax amounts** | Unknown cost fields are represented as `null` (never assumed to be `0`) and trigger a fail-closed `BLOCK`. |
| **Cart or schedule changes after user approval** | User approval is bound to a SHA-256 `state_fingerprint`; any change invalidates prior consent. |
| **False "Payment Succeeded" message** | UI state transitions to `MATERIALS_ORDERED` only after verifying PayPal's authoritative capture status. |

---

## 10. Repeatable Demo Test Scenarios & Evaluation Metrics

### Three One-Click Scenarios in the Demo Test Console
1. **Scenario A — Late Client Invoice Reroute & Empathetic Split (`ALLOW` with Approval):**
   * *Input:* Phase 2 invoice (`$4,500.00`) is `OVERDUE`; Phase 3 has met dependencies and warehouse stock.
   * *Expected Result:* Policy engine permits promoting Phase 3 (`$2,800.00` idle exposure saved), splits the PayPal Sandbox invoice via `update_invoicing` into a `$1,396.00` immediate materials unlock, renders a live PayPal QR code (`generate_invoice_qr_code`), and sends the friendly Nudge-Bot reminder.
2. **Scenario B — Vendor Price-Creep Block & Channel3 Arbitrage Checkout (`BLOCK` Incumbent -> `ALLOW` Replacement):**
   * *Input:* Incumbent vendor bills `$490.00/unit` (`$1,960.00` total, `+28.95%` hike over `$380.00` baseline).
   * *Expected Result:* Policy engine blocks the incumbent bill (`["VENDOR_PRICE_CREEP_EXCEEDED", "TOTAL_EXCEEDS_PHASE_BUDGET"]`), queries **Channel3** to find the identical monitor at `$349.00/unit` (`$1,396.00` total — saving `$564.00`), and completes **PayPal Sandbox Checkout** (`Orders v2`) upon user approval.
3. **Scenario C — Adversarial Dependency & Budget Violation (`BLOCK`):**
   * *Input:* A prompt injection or invalid command attempts to schedule *Phase 4 (Optical Calibration)* before *Phase 2 (Display Mounting)* and pay an unapproved `$2,100.00` quote.
   * *Expected Result:* Policy engine returns `BLOCK` (`["HARD_DEPENDENCY_VIOLATION", "TOTAL_EXCEEDS_PHASE_BUDGET"]`); zero Bryntum or PayPal mutations occur.

### Prototype Evaluation Metrics (Displayed in UI & README)
* **Policy Engine Decision Accuracy:** `10 / 10` prototype test cases (`100%` match against expected ground truth).
* **Unauthorized Schedule or Payment Overrides Accepted:** `0`.
* **Scenario A Idle Labor Exposure Mitigated:** `$2,800.00` (16 technician hours + SLA penalty avoided).
* **Scenario B Supplier Arbitrage Savings:** `$564.00` (`28.78%` savings via Channel3 vs. incumbent quote).

---

## 11. Phased Build Plan & 3-Minute Video Script

### Phased Build Plan
* **Phase 1 (Days 1–2): PayPal Sandbox Proof** — Configure PayPal Developer Sandbox credentials; verify `create_invoice`, `update_invoicing`, `generate_invoice_qr_code`, `create_order`, and `capture_order` end-to-end.
* **Phase 2 (Days 3–4): Deterministic Engine & Tests** — Build `policyEngine.ts` and `criticalPath.ts` with integer minor-unit math and pass all 10 unit tests across Scenarios A, B, and C.
* **Phase 3 (Days 5–6): Channel3 & Nudge-Bot Integration** — Connect Channel3 `/search` and `/lookup` endpoints and wire the LLM Nudge-Bot and FinOps prompts.
* **Phase 4 (Days 7–10): Bryntum + AG Studio 3.0 Frontend** — Build the split-screen React UI, custom Bryntum task renderer, custom AG Studio widgets (`CascadeRecoveryWidget` and `FriendlyNudgeScoreboardWidget`), and Studio Agent Framework delegation.
* **Phase 5 (Days 11–14): Deployment & Demo Video** — Deploy on Render via `render.yaml`, test from a clean browser session, finalize documentation, and record the 3-minute YouTube submission.

### 3-Minute Demo Video Script
* **0:00–0:20 | The Hook & Problem:** Show the CascadeOS split screen. Explain how a single overdue client invoice or vendor price hike cascades through a physical project schedule—and why calendars and PayPal must work as one state machine.
* **0:20–0:50 | Triggering the Crisis:** Click **Scenario A+B** in the Demo Test Console. Show Phase 2 turning red on the **Bryntum Gantt timeline** (`$2,800 Exposure`) and the **AG Studio Agent** automatically spawning our custom recovery widgets.
* **0:50–1:35 | The Differentiator (Policy Block, Schedule Reroute & Nudge-Bot QR):** Show the deterministic policy engine blocking the incumbent vendor's 29% price hike and rejecting unsafe dependency overrides (Scenario C). Approve the recovery plan: watch Bryntum animate Phase 3 forward (cutting idle loss to `$0`) and see the live **PayPal QR Code** and friendly Nudge-Bot message appear in the `FriendlyNudgeScoreboardWidget`.
* **1:35–2:15 | Live Channel3 Arbitrage + PayPal Sandbox Checkout:** Inspect the **Channel3** match (`$349/unit` vs. `$490/unit` = `$564 saved`), complete the **PayPal JS SDK v6 Sandbox Checkout** for `$1,396.00`, and show the authoritative PayPal Order/Capture ID flipping Phase 2 on the Bryntum timeline to emerald green.
* **2:15–2:45 | AG Studio Agent Co-Editing & Cross-Filtering:** Click a badge inside our custom React widget to cross-filter the AG Studio canvas, then ask the Studio Chat Agent in natural language to add a *Supplier Variance by Phase* chart live.
* **2:45–3:00 | Measured Results & Close:** Show the append-only audit log and prototype test scorecard (`10/10` policy accuracy, `$2,800` idle labor saved, `$564` arbitrage savings).
