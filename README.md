# CascadeOS: Autonomous FinOps & Payment-Coupled Schedule Recovery

> **PayPal AI Hackathon 2026** — Multi-Tenant Autonomous Milestone FinOps, AI Schedule Architect, Channel3 Product Graph Arbitrage, Interactive Bryntum Gantt 7.3 & AG Studio 3.0 Analytics.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests: 149/149 Passing](https://img.shields.io/badge/Tests-149%2F149%20Passing%20(100%25)-emerald.svg)](#10-automated-test-verification)
[![Zero-Mock Production Sandbox](https://img.shields.io/badge/PayPal%20Sandbox-Verified%20Live-emerald.svg)](https://developer.paypal.com)
[![Channel3 Product Graph](https://img.shields.io/badge/Channel3-Live%20Graph%20API-sky.svg)](https://trychannel3.com)
[![AG Studio 3.0](https://img.shields.io/badge/AG%20Studio-3.0%20Custom%20Widgets-purple.svg)](https://www.ag-grid.com/studio/)
[![Bryntum Gantt](https://img.shields.io/badge/Bryntum%20Gantt-7.3%20Interactive%20CRUD-amber.svg)](https://bryntum.com/products/gantt/)
[![Deterministic Policy Engine](https://img.shields.io/badge/Firewall-10%2F10%20Invariants%20Active-emerald.svg)](#4-deterministic-policy-firewall-10-invariants)

---

## 1. Executive Summary

In commercial construction, EPC contracting, IT buildouts, and high-stakes capital projects, **unpaid client invoices and supplier price-creep idle high-cost specialized crews** ($680/day per crew), triggering cascading delay penalties ($1,440/day) and liquidated damages liability.

**CascadeOS** is an autonomous FinOps operating system that programmatically couples milestone schedules in **Bryntum Gantt** with live **PayPal Invoicing v2**, **PayPal Orders v2 Checkout**, and **Channel3 Live Product Graph APIs**:

1. **Multi-Tenant Onboarding & Project Switcher**: Not limited to a single hardcoded demo. Any company, agency, or contractor can create, switch between, and manage multiple capital projects with tenant-isolated task DAGs, budgets, and invoices.
2. **AI Project Architect (Natural Language to Valid DAG)**: Ingests a high-level English project brief (e.g. *"Build an ultra-low latency E-Sports Studio by Dec 2026"*) and uses OpenAI Structured Outputs (`gpt-4o`) to generate an acyclic 4–8 phase DAG with crew allocations, daily burn rates, client billing invoices, and concrete retail hardware SKU queries.
3. **Live Per-Task PayPal Sandbox Invoicing v2**: Automatically provisions genuine PayPal Sandbox invoices for project milestones with direct links, partial payment unlock thresholds (`allow_partial_payment: true`), and live Base64 QR codes.
4. **Channel3 Live Product Graph Arbitrage**: Programmatically queries Channel3's real retail graph for hardware SKUs, detects supplier price-creep (>10% variance, e.g., +28.95%), locks incumbent orders, and drafts replacement orders saving $564.00 (28.78%).
5. **Interactive Bryntum Gantt CRUD & FinOps Drawer**: Drag, resize, and edit task dates live in Bryntum Gantt with automatic SQLite persistence; double-click any phase to open the **Phase Financials & Hardware Drawer** to toggle warehouse staging, inspect PayPal invoices, or trigger on-demand price audits.
6. **Deterministic Policy Firewall**: A fail-closed 10-invariant rule engine running independently of the LLM. It generates RFC 6960 SHA-256 non-repudiation fingerprints over canonical financial states to prevent hallucinated payouts or unauthorized dependency bypasses.

---

## 2. Architecture & System Flow

```text
+--------------------------------------------------------------------------------------------------+
|                                  CLIENT BROWSER (React 18 + Vite + TS)                           |
|                                                                                                  |
|  +------------------------------------------------+  +----------------------------------------+  |
|  | TopScenarioBar.tsx                             |  | NewProjectModal.tsx                    |  |
|  | - Live Project Switcher Dropdown               |  | - Mode A: AI Schedule Architect        |  |
|  | - "+ New Project" Onboarding Button            |  | - Mode B: Manual Structured Builder    |  |
|  | - Dark / Light Theme Toggle                    |  | - Kahn DAG Cycle Detection Gate        |  |
|  | - Bento Financial KPI Spotlights (Aceternity)  |  | - Live Progress Stepper                |  |
|  | - 1-Click Scenario Controls (A, B, C)          |  +----------------------------------------+  |
|  +-----------------------+------------------------+                                              |
|                          |                                                                       |
|                          v                                                                       |
|  +-----------------------------------------------+  +-----------------------------------------+  |
|  | TimelinePane.tsx (@bryntum/gantt-react)       |  | TaskFinancialsDrawer.tsx                |  |
|  | - Interactive Task Drag & Resize Sync         |  | - Schedule Dates & Duration Adjuster    |  |
|  | - Critical Path Highlighting                   |  | - Materials Warehouse Staging Toggle    |  |
|  | - "+ Add Phase" Interactive Modal Trigger      |  | - PayPal Invoice Status & QR Preview    |  |
|  | - Double-Click Task Drawer Trigger            |  | - Channel3 Live SKU Re-Audit Button     |  |
|  +-----------------------+-----------------------+  +-------------------+---------------------+  |
|                          |                                               ^                       |
|                          v                                               |                       |
|  +-----------------------------------------------------------------------+--------------------+  |
|  | FinOps3DTopology.tsx (Three.js WebGL Interactive Dependency Mesh)                          |  |
|  | - Real-time color-coded nodes synchronized with schedule & payment states                     |  |
|  +--------------------------------------------------------------------------------------------+  |
|                          |                                                                       |
|                          v                                                                       |
|  +-----------------------------------------------+  +-----------------------------------------+  |
|  | FinOpsWidgetPanel.tsx                         |  | ApprovalCheckoutModal.tsx               |  |
|  | - Channel3 Supplier Arbitrage Quotes          |  | - Deterministic Policy Diff             |  |
|  | - 10-Invariant Policy Firewall Breakdown      |  | - PayPal JS SDK (Orders v2 Capture)     |  |
|  | - Split Invoice & Blast Radius Calculation    |  | - Base64 Invoice QR Code Display        |  |
|  +-----------------------------------------------+  +-----------------------------------------+  |
|                          |                                                                       |
|                          v                                                                       |
|  +--------------------------------------------------------------------------------------------+  |
|  | StudioWorkspace.tsx (ag-studio-react <AgStudio mode="edit"/>)                             |  |
|  | - In-Browser Data Engine: [project_tasks, supplier_quotes, audit_events]                    |  |
|  | - Custom Widget 1: CascadeRecoveryWidget (Cross-filtering & Arbitrage)                      |  |
|  | - Custom Widget 2: FriendlyNudgeScoreboardWidget (PayPal QR & AI Draft Nudge)               |  |
|  +-----------------------------------------------+--------------------------------------------+  |
+--------------------------------------------------|-----------------------------------------------+
                                                   | HTTPS REST (/api/*)
                                                   v
+--------------------------------------------------------------------------------------------------+
|                              BACKEND SERVER (Node.js 22 + Express + TS)                          |
|                                                                                                  |
|  +-----------------------------------------------+  +-----------------------------------------+  |
|  | Deterministic Core (server/src/engine/)       |  | Multi-Tenant Project Provisioning       |  |
|  | 1. dagValidator.ts (Kahn's in-degree algorithm)|  | 1. projectRoutes.ts                     |  |
|  | 2. criticalPathEngine.ts (Blast Radius)       |  |    - GET /projects (KPI Summaries)      |  |
|  | 3. policyEngine.ts (10 Invariants Firewall)   |  |    - POST /projects/create-custom       |  |
|  | 4. fingerprint.ts (Canonical SHA-256)         |  |    - POST/PATCH /projects/:id/tasks     |  |
|  | 5. scheduleRerouter.ts (Schedule Recovery)    |  |    - POST/DELETE /projects/:id/deps     |  |
|  +-----------------------+-----------------------+  | 2. projectArchitectAiService.ts (gpt-4o)|  |
|                          |                          | 3. customProjectProvisioner.ts          |  |
|                          v                          +--------------------+--------------------+  |
|  +-----------------------------------------------+                       |                       |
|  | Live External Integrations                    |                       |                       |
|  | 1. paypalAuthService.ts (OAuth2 /v1/oauth2)   |<----------------------+                       |
|  | 2. paypalInvoicingService.ts (Invoicing v2)   |                                               |
|  | 3. paypalOrdersService.ts (Checkout v2)       |                                               |
|  | 4. channel3Service.ts (Live Product Graph)    |                                               |
|  | 5. Groq OSS 120B / OpenAI (AI Nudge Copilot)  |                                               |
|  +-----------------------+-----------------------+                                               |
|                          |                                                                       |
|                          v                                                                       |
|  +--------------------------------------------------------------------------------------------+  |
|  | SQLite Persistent WAL Database (better-sqlite3)                                            |  |
|  | - projects, tasks, task_dependencies, supplier_quotes, recovery_plans                       |  |
|  | - audit_events (Enforced APPEND-ONLY via SQLite triggers)                                  |  |
|  +--------------------------------------------------------------------------------------------+  |
+--------------------------------------------------------------------------------------------------+
```

---

## 3. How Anyone Can Use the Platform (Multi-Tenant User Flow)

CascadeOS is not a static single-company mockup. It is a full multi-tenant system where any general contractor, engineering firm, or startup can register new projects and manage payment-coupled schedules.

### Step 1: Switch or Create a Project
- Use the **Project Switcher** in the top navigation bar to select existing projects (`Apex Diagnostic Clinic`, `Nova E-Sports Studio`, etc.).
- Click **"+ New Project"** to open the dual-mode onboarding modal.

### Step 2: Onboard via Mode A (AI Project Architect)
1. Select the **"AI Project Architect"** tab.
2. Choose one of the quick industry presets (*E-Sports Broadcast Studio*, *Autonomous Robotics R&D Arena*, or *Hackathon AV Stage*) or type your own custom project prompt.
3. Configure the **Target Start Date**, **Budget Limit**, and **Client Billing Email**.
4. Check **"Auto-Provision Live PayPal Sandbox Invoices"** and **"Auto-Search Channel3 Retail Catalog"**.
5. Click **"Generate Project Blueprint & Deploy"**.
   - OpenAI Structured Outputs converts your prompt into a deterministic DAG.
   - Kahn's algorithm validates that the graph is 100% acyclic (`SEC-101`).
   - Authentic PayPal Sandbox invoices are created for milestone billing (`REQ-103`).
   - Channel3 queries live retail SKUs, benchmarks prices, and stores quotes (`REQ-104`).
   - The UI automatically switches to your newly created project.

### Step 3: Onboard via Mode B (Structured Manual DAG Builder)
1. Select the **"Manual Phase Builder"** tab.
2. Enter project name, client details, and currency (`USD`).
3. Add sequential or parallel phases with crew names, daily idle burn rates, invoice amounts, and hardware SKUs.
4. Set phase dependencies (`1 -> 2`, `2 -> 3`, etc.).
5. Click **"Deploy Custom Project"**.
   - Kahn's algorithm rejects any cyclic dependency before database writes.
   - Phases and dependencies are persisted directly to SQLite.

### Step 4: Interactive Schedule Edits in Bryntum Gantt
- **Drag & Resize**: Drag milestone bars or resize phase durations directly on the Bryntum timeline. Changes automatically persist to the backend (`PATCH /api/projects/:projectId/tasks/:taskId`).
- **+ Add Phase**: Click the **"+ Add Phase"** button on the Bryntum toolbar to append a custom milestone phase to the active project.
- **Double-Click Phase**: Double-click any milestone bar in Bryntum Gantt to open the **Phase Financials & Hardware Drawer**.

### Step 5: Phase Financials & Hardware Drawer
Inside the slide-over drawer:
- **Adjust Schedule**: Edit start dates, end dates, and duration in real time.
- **Warehouse Staging**: Toggle **"Materials Staged in Warehouse"** (`true`/`false`) to simulate inventory arrivals.
- **PayPal Invoicing**: Inspect the live PayPal Sandbox Invoice ID, status (`DRAFT`, `SENT`, `PAID`, `OVERDUE`), and preview the live PayPal payment QR code.
- **Channel3 Price Audit**: Trigger an on-demand live Channel3 price audit for the milestone's hardware query.

### Step 6: Simulate & Recover Payment Crises
- **Scenario A (Invoice Delay & Reroute)**: Simulates client invoice default on a hardware phase, computes idle crew exposure, and reroutes the critical path to promote unblocked warehouse-ready tasks.
- **Scenario B (Price-Creep Defense)**: Simulates an incumbent supplier introducing a +28.95% price increase, triggers the deterministic `BLOCK` policy, searches Channel3 for OEM replacements, and generates a $564.00 savings arbitrage plan.
- **Scenario C (Adversarial Bypass Block)**: Demonstrates the deterministic policy firewall rejecting an illegal dependency bypass without completed predecessors.

---

## 4. Deterministic Policy Firewall (10 Invariants)

The policy firewall (`server/src/engine/policyEngine.ts`) guarantees safety independently of the LLM:

| Invariant Code | Enforcement Rule | Decision |
|---|---|---|
| `HARD_DEPENDENCY_VIOLATION` | Cannot promote a task unless all preceding DAG dependencies are `COMPLETED`. | `BLOCK` |
| `MATERIALS_NOT_IN_WAREHOUSE` | Cannot promote physical milestones unless `materials_in_warehouse === 1`. | `BLOCK` |
| `VENDOR_PRICE_CREEP_EXCEEDED` | Rejects quotes with >10.00% price increase above historical baseline. | `BLOCK` |
| `TOTAL_EXCEEDS_PHASE_BUDGET` | Rejects orders that exceed the phase budget cap ($1,600.00). | `BLOCK` |
| `UNKNOWN_COST_FIELD` | Rejects quotes with null or missing shipping/tax fields (fail-closed, `SEC-006`). | `BLOCK` |
| `CURRENCY_MISMATCH` | Rejects transactions with mismatched currency codes (must be `USD`). | `BLOCK` |
| `STALE_FINGERPRINT_APPROVAL` | Rejects approvals if underlying state mutated after plan generation. | `BLOCK` (409) |
| `APPEND_ONLY_AUDIT_LEDGER` | SQLite triggers abort any `UPDATE` or `DELETE` on `audit_events`. | `ABORT` (500) |
| `INTEGER_MINOR_UNITS` | All arithmetic evaluated as integer cents ($1,396.00 = `139600`). | Strict Type |
| `REQUIRE_APPROVAL` | Valid promotion scenarios require human cryptographic sign-off. | `REQUIRE_APPROVAL` |

---

## 5. Sponsor Technology Integrations

### PayPal Sandbox (Orders v2, Invoicing v2 & Partial Split Thresholds)
- **Zero Mock Policy (`CON-001`)**: All payment endpoints hit `https://api-m.sandbox.paypal.com`.
- **OAuth2 Token Caching**: `paypalAuthService.ts` caches the bearer token in memory with automated refresh before expiration.
- **Invoicing v2 Partial Payment Threshold**: When a recovery plan is approved, `paypalInvoicingService.ts` configures `allow_partial_payment: true` and `minimum_amount_due: materialsUnlockAmount`.
- **Base64 QR Code Generation**: Dispatches `POST /v2/invoicing/invoices/{id}/generate-qr-code` to generate a live QR code rendered inside the UI.
- **Orders v2 Checkout & Idempotency**: `createSupplierOrder()` sends `POST /v2/checkout/orders` with a unique `PayPal-Request-Id` derived from the plan fingerprint.
- **PayPal JS SDK v6**: Embedded in `ApprovalCheckoutModal.tsx` for 1-click in-browser buyer approval.

### Channel3 Product Graph API
- **Live Catalog Queries**: `channel3Service.ts` queries `https://api.trychannel3.com/v0/search` using the sponsor hackathon API key.
- **Price-Creep Defense**: Evaluates real vendor quotes against historical baselines, detects +28.95% creep, searches Channel3 for OEM replacements, and generates guaranteed savings ($564.00 / 28.78%).

### AG Studio 3.0 (`ag-studio-react`)
- **Embedded In-Browser Analytics**: Mounts `<AgStudio />` in both `edit` (report builder) and `view` (executive dashboard) modes.
- **Custom Widget Registration**: Implements `createCascadeWidgets.ts` registering `CascadeRecoveryWidget` and `FriendlyNudgeScoreboardWidget` with Zod `formatShape` schema validation, cross-filtering, and AI metadata.
- **Studio Agent Framework**: Configured with `cascade-finops-agent` delegating to Studio's built-in `data` and `widget` agents via `tools.delegateTo(['data', 'widget'])`.

### Bryntum Gantt 7.3 (`@bryntum/gantt-react`)
- **Payment-Coupled Timeline**: Visualizes milestone WBS, assignees, critical paths, and custom FinOps status pills (`PAID`, `PAYMENT BLOCKED`, `REROUTED ACTIVE`, `READY TO PROMOTE`, `MATERIALS ORDERED`).
- **Interactive Bi-Directional Filtering**: Clicking any milestone bar filters the 3D topology and AG Studio analytics to that specific task.
- **Interactive CRUD & Drag Sync**: `onAfterTaskDrop` and `onAfterTaskEdit` automatically update SQLite backend dates and recalculate the project critical path.

---

## 6. Getting Started & Local Installation

### Prerequisites
- **Node.js**: `>= 20.11.0` (with native C++ compilation tools for `better-sqlite3`)
- **npm**: `>= 10.0.0`
- **PayPal Developer Account**: Sandbox client ID and secret (`https://developer.paypal.com`)
- **Channel3 API Key**: (`https://trychannel3.com`)
- **OpenAI or Groq API Key**: For AI Project Architect and Copilot

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/VaibhavGoyal11/cascadeOS.git
cd cascadeOS
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` in the root directory:
```bash
cp .env.example .env
```

Ensure your `.env` contains:
```env
NODE_ENV=development
PORT=4000
DATABASE_PATH=./server/data/cascade_os.sqlite

# PayPal Sandbox
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=your_paypal_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_paypal_sandbox_client_secret
PAYPAL_WEBHOOK_ID=

# Channel3 API
CHANNEL3_API_KEY=your_channel3_api_key
CHANNEL3_BASE_URL=https://api.trychannel3.com/v0

# OpenAI (for AI Project Architect) / Groq
OPENAI_API_KEY=your_openai_or_groq_api_key
OPENAI_MODEL=gpt-4o
OPENAI_BASE_URL=https://api.openai.com/v1

# Frontend Vite
VITE_PAYPAL_CLIENT_ID=your_paypal_sandbox_client_id
```

---

## 7. How to Run & Test (Step-by-Step)

### Method 1: Run Full Stack in Development Mode (Recommended)
This starts both the Express API server (port 4000) and the Vite frontend (port 5173) with hot reloading:
```bash
npm run dev
```

You can also run them in separate terminal tabs:
```bash
# Terminal 1 - Backend Server (Port 4000)
npm run dev --workspace=server

# Terminal 2 - Frontend Client (Port 5173)
npm run dev --workspace=client
```

Open your browser to: **[http://localhost:5173](http://localhost:5173)**

### Method 2: Build & Run in Production Mode
Compiles TypeScript for backend and builds client bundle (`dist/`), serving everything from Express on port 4000:
```bash
npm run build
npm start
```
Open your browser to: **[http://localhost:4000](http://localhost:4000)**

### Method 3: Automated Test Suite (149 Tests)
Run the full Vitest suite covering all engines, cycle detectors, database repositories, PayPal integrations, and REST endpoints:
```bash
npm test
```
Or directly via Vitest:
```bash
npx vitest run
```

### Method 4: Live Sandbox Smoke Test
Directly tests genuine network requests against PayPal Sandbox and Channel3 API:
```bash
npm run verify:sandbox
```

---

## 8. Interactive Testing & Verification Guide

Once the app is running at `http://localhost:5173`, follow these steps to verify every feature:

| Step | Action | Expected Result |
|---|---|---|
| **1. Switch Theme** | Click the **Sun / Moon** icon in the top right. | Seamlessly toggles between sleek Dark Mode and crisp Light Mode without visual glitching. |
| **2. Switch Projects** | Click the **Project Switcher** dropdown in the top bar and select another project. | The Bento KPIs, 3D Topology, Bryntum Gantt, and AG Studio widgets instantly re-render for the selected project. |
| **3. Create Project via AI** | Click **"+ New Project"** > select **"E-Sports Broadcast Studio"** preset > click **"Generate Project Blueprint & Deploy"**. | Watch the live multi-step stepper validate DAG cyclicity, create PayPal Sandbox invoices, fetch Channel3 quotes, and load the new project into Bryntum Gantt. |
| **4. Edit Schedule in Bryntum** | Drag or resize a milestone bar in Bryntum Gantt. | Changes persist instantly to the backend SQLite database and re-calculate critical paths. |
| **5. Add a Phase** | Click **"+ Add Phase"** in the Bryntum toolbar, fill phase details, and submit. | Appends the phase to SQLite, checks DAG cycle safety, and adds the task row to Bryntum Gantt. |
| **6. Open Task Drawer** | Double-click any milestone bar in Bryntum Gantt. | Opens the slide-over **Task Financials Drawer** showing schedule fields, warehouse toggle, PayPal invoice details, and live Channel3 quotes. |
| **7. Test Scenario A** | Click **"Scenario A"** in the top bar. | Phase 2 invoice is flagged as overdue, blast radius calculates idle crew exposure ($5,100.00), and Phase 3 is promoted with a $1,396 split plan. |
| **8. PayPal Checkout Capture** | Click **"Review Policy & Checkout"** in Scenario A. | Opens the PayPal checkout modal displaying the deterministic policy diff and live PayPal Smart Buttons to execute Orders v2 capture. |
| **9. Test Scenario B** | Click **"Scenario B"** in the top bar. | Incumbent quote (+28.95% creep) is blocked, Channel3 product graph is queried, and a $564.00 savings arbitrage plan is drafted. |
| **10. Audit Ledger** | Click **"Audit"** in the top bar. | Opens the cryptographic audit drawer showing immutable SHA-256 event logs with one-click Markdown/JSON export. |

---

## 9. Monorepo File Structure

```text
cascadeOS/
├── client/                     # React 18 + Vite + TypeScript Frontend
│   ├── src/
│   │   ├── api/                # Strongly typed REST client (cascadeApiClient.ts)
│   │   ├── components/         # High-end FinOps components
│   │   │   ├── ui/             # Aceternity UI (CardSpotlight, ShimmerButton, BackgroundDots)
│   │   │   ├── TopScenarioBar.tsx        # Project Switcher, Theme Toggle, Scenario Triggers
│   │   │   ├── NewProjectModal.tsx       # AI Architect & Manual DAG Builder
│   │   │   ├── TaskFinancialsDrawer.tsx  # Interactive Phase Financials & Hardware Drawer
│   │   │   ├── TimelinePane.tsx          # Bryntum Gantt 7.3 Integration & CRUD
│   │   │   ├── FinOps3DTopology.tsx      # Three.js 3D WebGL Dependency Mesh
│   │   │   ├── FinOpsWidgetPanel.tsx     # Channel3 Arbitrage & Invariant Policy Panel
│   │   │   ├── ApprovalCheckoutModal.tsx # PayPal JS SDK v6 Modal & Split QR Display
│   │   │   ├── AuditDrawer.tsx           # Cryptographic Audit Ledger & Compliance Exporter
│   │   │   └── AgentChatModal.tsx        # AI FinOps Copilot Dialog
│   │   ├── context/            # CascadeStateContext (State, Switcher, Projects, Themes)
│   │   ├── studio/             # AG Studio 3.0 Custom Widgets & Workspace
│   │   │   ├── widgets/        # CascadeRecoveryWidget & FriendlyNudgeScoreboardWidget
│   │   │   └── agents/         # AG Studio Agent Framework adapter
│   │   └── types/              # Domain interfaces and integer minor-unit types
├── server/                     # Node.js 22 + Express + TypeScript Backend
│   ├── data/                   # SQLite WAL database (cascade_os.sqlite)
│   ├── src/
│   │   ├── config/             # Zod environment validation (env.ts)
│   │   ├── db/                 # SQLite DDL schema & repository methods (database.ts)
│   │   ├── engine/             # Deterministic Critical-Path, Policy & Fingerprint engines
│   │   │   ├── dagValidator.ts         # Kahn's in-degree topological sorter & cycle detector
│   │   │   ├── criticalPathEngine.ts   # Dynamic blast radius analyzer
│   │   │   ├── policyEngine.ts         # 10 fail-closed invariant firewall
│   │   │   ├── fingerprint.ts          # Canonical SHA-256 state hashing
│   │   │   └── scheduleRerouter.ts     # Schedule recovery recalculation
│   │   ├── routes/             # Express REST endpoints & PayPal webhooks
│   │   │   ├── projectRoutes.ts        # Projects, dynamic tasks & dependency CRUD
│   │   │   ├── scenarioRoutes.ts       # Dynamic crisis simulation routes
│   │   │   └── webhookRoutes.ts        # PayPal webhook signature verification
│   │   ├── schemas/            # Zod API validation schemas (onboardingSchemas.ts)
│   │   ├── scripts/            # verifyLiveSandbox.ts smoke test runner
│   │   └── services/           # Live external integration services
│   │       ├── projectArchitectAiService.ts  # OpenAI Structured Output DAG generator
│   │       ├── customProjectProvisioner.ts   # Multi-tenant SQLite + PayPal/Channel3 hooks
│   │       ├── paypalAuthService.ts          # PayPal OAuth2 token caching
│   │       ├── paypalInvoicingService.ts     # PayPal Invoicing v2 & QR generation
│   │       ├── paypalOrdersService.ts        # PayPal Orders v2 checkout
│   │       └── channel3Service.ts            # Channel3 Live Product Graph API
├── plan/                       # Architecture & Implementation Plans
├── render.yaml                 # Render Infrastructure-as-Code deployment blueprint
├── package.json                # npm workspaces root configuration
└── README.md                   # System documentation
```

---

## 10. Automated Test Verification

All **149/149 tests** pass with zero errors:

```text
 ✓ server/src/engine/__tests__/engine.test.ts (43)
 ✓ server/src/engine/__tests__/dagValidator.test.ts (6)
 ✓ server/src/__tests__/phase1.test.ts (48)
 ✓ server/src/__tests__/phase3.test.ts (24)
 ✓ server/src/__tests__/phase4.test.ts (6)
 ✓ server/src/__tests__/channel3Service.test.ts (4)
 ✓ server/src/__tests__/dynamicProjectsIntegration.test.ts (6)
 ✓ server/src/__tests__/apiIntegration.test.ts (12)

 Test Files  8 passed (8)
      Tests  149 passed (149)
```

- **`dagValidator.test.ts`**: Kahn's in-degree topological sort, cycle detection gate (`SEC-101`), linear DAGs, parallel DAGs, and disconnected components.
- **`dynamicProjectsIntegration.test.ts`**: `GET /api/projects` KPI summaries, `POST /api/projects/create-custom` with live Kahn cycle verification, task schedule updating, dependency CRUD, and on-demand PayPal/Channel3 provisioning.
- **`engine.test.ts`**: Minor-unit currency conversions, canonical RFC 6960 SHA-256 fingerprint determinism, blast radius calculations, and all 10 policy invariants.
- **`phase1.test.ts`**: SQLite WAL mode, foreign key constraints, table schemas, and append-only triggers on `audit_events`.
- **`phase3.test.ts`**: PayPal OAuth2 token refresh, Invoicing v2 draft, partial payment thresholds, QR generation, Orders v2 creation, and webhook signature verification.
- **`channel3Service.test.ts`**: Live product search, SKU quote normalization, caching, and variance percentage computation.
- **`phase4.test.ts`**: Project seeder and Groq OSS 120B empathetic nudge generator.
- **`apiIntegration.test.ts`**: End-to-end REST API integration testing all scenario triggers, state synchronization, approval workflows, and studio copilot chat.

---

## 11. License

MIT License — Copyright (c) 2026 Vaibhav Goyal. Free and open-source software for the PayPal AI Hackathon.
