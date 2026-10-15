# CascadeOS: Complete Resource Directory & Dependency Manifest

**Prepared:** October 14, 2026[cite: 1]  
**Purpose:** Single-source-of-truth reference for all documentation URLs, API endpoints, SDK packages, npm registry configurations, and environment variables required to build **CascadeOS** for the PayPal AI Hackathon[cite: 1].

---

## 1. Official Hackathon & Sponsor Hub Links

* **PayPal AI Hackathon Main Devpost Page:** https://paypalaihackathon.devpost.com/[cite: 1]
* **PayPal AI Hackathon Developer & Sponsor Resources Hub:** https://paypalaihackathon.devpost.com/resources[cite: 1]
* **AG Grid Sponsor Track Page ($10,000 Pool):** https://paypalaihackathon.devpost.com/details/aggrid[cite: 1]
* **Bryntum Sponsor Track Page ($3,000 Pool):** https://paypalaihackathon.devpost.com/details/bryntum[cite: 1]
* **Channel3 Sponsor Track Page ($1,500 Pool):** https://paypalaihackathon.devpost.com/details/channel3[cite: 1]
* **APIMatic Sponsor Track Page ($3,000 Pool):** https://paypalaihackathon.devpost.com/details/apimatic[cite: 1]
* **Render Sponsor Track Page ($2,250 Credits Pool):** https://paypalaihackathon.devpost.com/details/render[cite: 1]
* **KERNEL Sponsor Track Page:** https://paypalaihackathon.devpost.com/details/kernel[cite: 1]
* **Elastic Sponsor Track Page:** https://paypalaihackathon.devpost.com/details/elastic[cite: 1]
* **Postman Sponsor Track Page:** https://paypalaihackathon.devpost.com/details/postman[cite: 1]
* **Zapier Sponsor Track Page:** https://paypalaihackathon.devpost.com/details/zapier[cite: 1]
* **Astropods Sponsor Track Page:** https://paypalaihackathon.devpost.com/details/astropods[cite: 1]

---

## 2. PayPal Developer Platform, REST APIs & AI Toolkit Resources

### 2.1 Official Documentation & Architecture Articles
* **PayPal Developer Portal & Sandbox Dashboard:** https://developer.paypal.com/[cite: 1]
* **PayPal Checkout Documentation:** https://developer.paypal.com/docs/checkout/[cite: 1]
* **PayPal Invoicing v2 REST API Reference:** https://developer.paypal.com/docs/api/invoicing/v2/
* **PayPal Orders v2 REST API Reference:** https://developer.paypal.com/docs/api/orders/v2/
* **PayPal Webhooks v1 REST API Reference:** https://developer.paypal.com/docs/api/webhooks/v1/
* **PayPal Agentic AI Toolkit Article & Quickstart:** https://developer.paypal.com/community/blog/paypal-agentic-ai-toolkit/[cite: 1]
* **PayPal WebMCP / Agent-Ready Storefront Guide:** https://developer.paypal.com/community/blog/WebMCP_PayPal_Agent_Ready/[cite: 1]
* **PayPal Agent Payments Protocol (AP2) Overview:** https://developer.paypal.com/community/blog/PayPal-Agent-Payments-Protocol/[cite: 1]
* **PayPal MCP Tool Discovery Architecture:** https://developer.paypal.com/community/blog/One_connection_2000_tools/[cite: 1]

### 2.2 PayPal Sandbox Base URL & Exact Endpoints Used by CascadeOS
* **Sandbox Base URL:** `https://api-m.sandbox.paypal.com` (Never use `https://api-m.paypal.com` in hackathon builds)[cite: 1].
* **OAuth 2.0 Token Exchange:**
  * `POST https://api-m.sandbox.paypal.com/v1/oauth2/token`
  * Headers: `Authorization: Basic <base64(PAYPAL_CLIENT_ID:PAYPAL_CLIENT_SECRET)>`, `Content-Type: application/x-www-form-urlencoded`
  * Body: `grant_type=client_credentials`
* **Invoicing v2 Endpoints:**
  * **Generate Next Invoice Number:** `POST https://api-m.sandbox.paypal.com/v2/invoicing/generate-next-invoice-number`
  * **Create Draft Invoice:** `POST https://api-m.sandbox.paypal.com/v2/invoicing/invoices`
  * **Send Invoice to Recipient:** `POST https://api-m.sandbox.paypal.com/v2/invoicing/invoices/{invoice_id}/send`
  * **Get Invoice Details:** `GET https://api-m.sandbox.paypal.com/v2/invoicing/invoices/{invoice_id}`
  * **List Invoices:** `GET https://api-m.sandbox.paypal.com/v2/invoicing/invoices?page=1&page_size=20&total_required=true`
  * **Full Update / Partial Payment Split Unlock:** `PUT https://api-m.sandbox.paypal.com/v2/invoicing/invoices/{invoice_id}`
  * **Generate Base64 PayPal QR Code:** `POST https://api-m.sandbox.paypal.com/v2/invoicing/invoices/{invoice_id}/generate-qr-code`
  * **Send Nudge-Bot Invoice Reminder:** `POST https://api-m.sandbox.paypal.com/v2/invoicing/invoices/{invoice_id}/remind`
* **Orders v2 (Checkout) Endpoints:**
  * **Create Order:** `POST https://api-m.sandbox.paypal.com/v2/checkout/orders`
  * **Get Order Details:** `GET https://api-m.sandbox.paypal.com/v2/checkout/orders/{order_id}`
  * **Capture Order Payment:** `POST https://api-m.sandbox.paypal.com/v2/checkout/orders/{order_id}/capture`
* **Webhook Signature Verification Endpoint:**
  * **Verify Webhook Signature:** `POST https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature`

### 2.3 PayPal NPM Packages
* **Backend AI Agent Toolkit:** `@paypal/agent-toolkit` (`npm install @paypal/agent-toolkit`)
* **Frontend React PayPal JS Wrapper:** `@paypal/react-paypal-js` (`npm install @paypal/react-paypal-js`)
* **Frontend PayPal JS SDK Script URL:** `https://www.paypal.com/sdk/js?client-id=${VITE_PAYPAL_CLIENT_ID}&currency=USD&intent=capture&enable-funding=paylater`

---

## 3. AG Grid & AG Studio 3.0 Resources ($10,000 Track)

### 3.1 Official AG Studio 3.0 Documentation URLs
* **React Quick Start (`AgStudio` Component):** https://www.ag-grid.com/studio/react/quick-start/
* **Custom Widgets & `createWidgets` API:** https://www.ag-grid.com/studio/react/custom-widgets/
* **Studio Agent Framework Architecture & Runners:** https://www.ag-grid.com/studio/react/ai-agents/
* **Direct LLM Runner Guide:** https://www.ag-grid.com/studio/react/ai-direct-llm-runner/
* **Client Tool Runner Guide:** https://www.ag-grid.com/studio/react/ai-client-tool-runner/
* **Custom Runner Guide:** https://www.ag-grid.com/studio/react/ai-custom-runner/
* **Built-In Agents Reference (`data` & `widget` agents):** https://www.ag-grid.com/studio/react/ai-builtin-agents/
* **Agent Configuration & Delegation (`tools.delegateTo`):** https://www.ag-grid.com/studio/react/ai-custom-agents/
* **Agent Context Inspection:** https://www.ag-grid.com/studio/react/ai-context/
* **AG-UI Wire Event Protocol Docs (`AgAiEvent`):** https://docs.ag-ui.com
* **Blog — Introducing the AG Studio Agent Framework:** https://www.ag-grid.com/blog/introducing-the-ag-studio-agent-framework/
* **Blog — Adding a Custom Widget to AG Studio:** https://www.ag-grid.com/blog/1-prompt-88-seconds-i-added-a-new-chart-type-to-ag-studio-dashboard/
* **Recorded Session — Self-Serve Dashboards in 30 Lines of Code:** https://app.livestorm.co/ag-grid/self-service-dashboards-30-lines-of-code

### 3.2 AG Studio NPM Packages & Imports
* **Install Command:**
  ```bash
  npm install ag-studio-react ag-studio
  ```
* **Core React Imports:**
  ```typescript
  import {
    AgStudio,
    createWidgets,
    type AgWidgetDefinition,
    type AgWidgetParams,
    type AgStudioApi,
  } from 'ag-studio-react';
  ```
* **Key Widget Lifecycle & Cross-Filter APIs:**
  * `widgetApi.setDisplayState('loading' | 'displayed' | 'noData' | 'incompleteDataMapping', { prominent: boolean })`
  * `await widgetApi.getData({ kind: 'flat', fields: [...], filter: [...], sort: [...], limit: ... })`
  * `widgetApi.getSchema()`
  * `widgetApi.toggleCrossFilter({ group: 0, field: fieldRef, value: selectedValue })`
  * `widgetApi.resetCrossFilter(0)`
  * `widgetApi.getCrossFilterSelections()`

---

## 4. Bryntum Gantt & Scheduler Pro Resources ($3,000 Track)

### 4.1 Official Documentation URLs
* **Bryntum Gantt React Guide:** https://bryntum.com/products/gantt/docs/guide/Gantt/integration/react/guide
* **Bryntum Gantt NPM Repository Setup Guide:** https://bryntum.com/products/gantt/docs/guide/Gantt/npm-repository
* **Bryntum Scheduler Pro React Guide:** https://bryntum.com/products/schedulerpro/docs/guide/SchedulerPro/integration/react/guide
* **Bryntum Task Board Docs:** https://bryntum.com/products/taskboard/docs/

### 4.2 Bryntum Trial NPM Registry Configuration (`.npmrc`)
To install `@bryntum/gantt` and `@bryntum/gantt-react` without a paid commercial license during the hackathon trial:
1. Configure `client/.npmrc` with the Bryntum registry:
   ```ini
   @bryntum:registry=[https://npm.bryntum.com](https://npm.bryntum.com)
   ```
2. Log in to the Bryntum trial registry using your email as username (replacing `@` with `..`) and `"trial"` as the password:
   ```bash
   npm login --registry=[https://npm.bryntum.com](https://npm.bryntum.com)
   ```
3. Install the trial packages mapped to the standard package aliases in `client/package.json`:
   ```json
   {
     "dependencies": {
       "@bryntum/gantt": "npm:@bryntum/gantt-trial@^6.1.0",
       "@bryntum/gantt-react": "^6.1.0"
     }
   }
   ```
4. Import the required dark theme CSS in `client/src/main.tsx` or `TimelinePane.tsx`:
   ```typescript
   import '@bryntum/gantt/gantt.classic-dark.css';
   import { BryntumGantt } from '@bryntum/gantt-react';
   ```

---

## 5. Channel3, APIMatic & Render Resources

### 5.1 Channel3 Product Graph API ($1,500 Track)
* **Hackathon Details & Promo Code (`PAYPAL-HACKATHON-2026` for 20,000 free credits):** https://paypalaihackathon.devpost.com/details/channel3[cite: 1]
* **Channel3 Website & Developer Portal:** https://trychannel3.com
* **API Base URL:** `https://api.trychannel3.com/v0`
* **Required Auth Header:** `x-api-key: ${CHANNEL3_API_KEY}`
* **Endpoints Used by CascadeOS:**
  * **Product Search:** `POST https://api.trychannel3.com/v0/search` (or `GET https://api.trychannel3.com/v0/search?q=...`)
    * Payload: `{ "query": "32 inch 4K UHD IPS Monitor Ergonomic Stand", "limit": 5 }`
  * **Product Lookup by ID:** `GET https://api.trychannel3.com/v0/products/{product_id}`

### 5.2 APIMatic Context Plugins ($3,000 Track)
* **APIMatic Sponsor Details:** https://paypalaihackathon.devpost.com/details/apimatic[cite: 1]
* **Official Hackathon Webinar (Setting up APIMatic Context Plugins for PayPal):** https://www.youtube.com/watch?v=zRWixN68tDg
* **APIMatic Portal:** https://www.apimatic.io/

### 5.3 Render Cloud Hosting ($2,250 Credits Track)
* **Render Sponsor Details:** https://paypalaihackathon.devpost.com/details/render[cite: 1]
* **Render Blueprint Specification (`render.yaml`):** https://render.com/docs/blueprint-spec
* **Render Persistent Disks Documentation (for SQLite):** https://render.com/docs/disks

---

## 6. Exact Package Manifests for Autonomous Agent Execution

### 6.1 Root `/package.json`
```json
{
  "name": "cascade-os-monorepo",
  "version": "1.0.0",
  "private": true,
  "license": "MIT",
  "workspaces": [
    "server",
    "client"
  ],
  "scripts": {
    "dev": "concurrently \"npm run dev --workspace=server\" \"npm run dev --workspace=client\"",
    "build": "npm run build --workspace=server && npm run build --workspace=client",
    "start": "npm run start --workspace=server",
    "test": "npm run test --workspace=server",
    "typecheck": "npm run typecheck --workspace=server && npm run typecheck --workspace=client",
    "verify:sandbox": "npm run verify:sandbox --workspace=server"
  },
  "devDependencies": {
    "concurrently": "^9.0.1",
    "typescript": "^5.6.3"
  },
  "engines": {
    "node": ">=20.11.0",
    "npm": ">=10.0.0"
  }
}
```

### 6.2 Backend `/server/package.json`
```json
{
  "name": "@cascade-os/server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "verify:sandbox": "tsx src/scripts/verifyLiveSandbox.ts"
  },
  "dependencies": {
    "@paypal/agent-toolkit": "^1.0.0",
    "better-sqlite3": "^11.5.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.1",
    "openai": "^4.71.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/node": "^22.9.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

### 6.3 Frontend `/client/package.json`
```json
{
  "name": "@cascade-os/client",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 5173",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@bryntum/gantt": "npm:@bryntum/gantt-trial@^6.1.0",
    "@bryntum/gantt-react": "^6.1.0",
    "@paypal/react-paypal-js": "^8.7.0",
    "ag-studio": "^3.0.0",
    "ag-studio-react": "^3.0.0",
    "lucide-react": "^0.454.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3",
    "vite": "^5.4.10"
  }
}
```

### 6.4 Environment Variable Template (`/.env.example`)
Commit this exact file to git and copy it to `/.env` locally[cite: 1]:
```ini
# Server Configuration
PORT=4000
NODE_ENV=development
DATABASE_PATH=./data/cascade_os.sqlite

# PayPal Sandbox Credentials ([https://developer.paypal.com/dashboard/applications/sandbox](https://developer.paypal.com/dashboard/applications/sandbox))
PAYPAL_CLIENT_ID=your_paypal_sandbox_client_id_here
PAYPAL_CLIENT_SECRET=your_paypal_sandbox_client_secret_here
PAYPAL_API_BASE_URL=[https://api-m.sandbox.paypal.com](https://api-m.sandbox.paypal.com)
PAYPAL_WEBHOOK_ID=your_paypal_sandbox_webhook_id_here
PAYPAL_SANDBOX_MERCHANT_EMAIL=sb-merchant@business.example.com
PAYPAL_SANDBOX_BUYER_EMAIL=sb-buyer@personal.example.com

# Channel3 Product Graph API ([https://paypalaihackathon.devpost.com/details/channel3](https://paypalaihackathon.devpost.com/details/channel3))
CHANNEL3_API_KEY=your_channel3_api_key_here
CHANNEL3_API_BASE_URL=[https://api.trychannel3.com/v0](https://api.trychannel3.com/v0)

# LLM Configuration (Used for Nudge-Bot & AG Studio Agent Framework Adapter)
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o

# Frontend Vite Environment Variables
VITE_API_BASE_URL=/api
VITE_PAYPAL_CLIENT_ID=your_paypal_sandbox_client_id_here
VITE_AG_STUDIO_LICENSE_KEY=your_ag_studio_45_day_trial_key_here
```

---

## 7. CLI Verification Commands for the Coding Agent

Before starting frontend development, the coding agent can verify every external credential using these direct commands:

### 7.1 Verify PayPal Sandbox OAuth2 Credentials
```bash
curl -s -X POST "[https://api-m.sandbox.paypal.com/v1/oauth2/token](https://api-m.sandbox.paypal.com/v1/oauth2/token)" \
  -u "${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials"
```
*Expected Result:* JSON object containing `"access_token": "A21AA..."`, `"token_type": "Bearer"`, and `"expires_in": 32400`.

### 7.2 Verify PayPal Sandbox Order Creation (`Orders v2`)
```bash
curl -s -X POST "[https://api-m.sandbox.paypal.com/v2/checkout/orders](https://api-m.sandbox.paypal.com/v2/checkout/orders)" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${PAYPAL_ACCESS_TOKEN}" \
  -H "PayPal-Request-Id: cascade-verify-order-001" \
  -d '{
    "intent": "CAPTURE",
    "purchase_units": [
      {
        "reference_id": "task_phase_2_displays",
        "description": "4x 32-inch 4K Ergonomic Display Monitors (Channel3 Verified)",
        "amount": {
          "currency_code": "USD",
          "value": "1396.00"
        }
      }
    ]
  }'
```
*Expected Result:* HTTP `201 Created` with `"id": "<PAYPAL_ORDER_ID>"` and `"status": "CREATED"`[cite: 1].

### 7.3 Verify PayPal Sandbox QR Code Generation (`Invoicing v2`)
```bash
curl -s -X POST "[https://api-m.sandbox.paypal.com/v2/invoicing/invoices/$](https://api-m.sandbox.paypal.com/v2/invoicing/invoices/$){INVOICE_ID}/generate-qr-code" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${PAYPAL_ACCESS_TOKEN}" \
  -d '{
    "width": 300,
    "height": 300,
    "action": "pay"
  }'
```
*Expected Result:* HTTP `200 OK` returning a multipart/base64-encoded PNG image string for rendering inside `FriendlyNudgeScoreboardWidget`.

### 7.4 Verify Channel3 Live Product Search
```bash
curl -s -X POST "[https://api.trychannel3.com/v0/search](https://api.trychannel3.com/v0/search)" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${CHANNEL3_API_KEY}" \
  -d '{
    "query": "32 inch 4K UHD IPS Monitor Ergonomic Stand",
    "limit": 5
  }'
```
*Expected Result:* HTTP `200 OK` returning structured retail listings with product IDs, titles, prices, merchant names, and stock availability.