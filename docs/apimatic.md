# APIMatic PayPal Client Workflow (ARC-006)

CascadeOS routes every PayPal Invoicing v2 and Orders v2 call through
`server/src/services/paypalClient.ts`. The module is a typed transport whose
request/response contracts mirror the official PayPal OpenAPI specifications.

## Regeneration

1. Download the official specs from the PayPal Developer portal:
   - `paypal_invoicing_v2_openapi.json`
   - `paypal_orders_v2_openapi.json`
2. Set the APIMatic credentials:
   ```bash
   export APIMATIC_API_KEY=...
   export APIMATIC_API_KEY_ID=...
   export APIMATIC_SPEC_DIR=/absolute/path/to/specs
   ```
3. Run:
   ```bash
   bash server/scripts/generate-paypal-client.sh
   ```
4. Review `server/src/services/paypalClient.generated.ts`, replace the checked-in
   transport only if the public signatures remain compatible, and run:
   ```bash
   npm run typecheck && npm test
   ```

## Why the transport is checked in

The hackathon environment does not ship APIMatic portal credentials, so the
generated client cannot be reproduced inside CI. The checked-in module keeps the
same strict request/response typing and is the single seam to swap when the
generated artifact is available. The generation script is the source of truth
for the workflow; it fails closed when specs or credentials are missing.

## Enforcement

- `paypalInvoicingService.ts` and `paypalOrdersService.ts` may not call `fetch`
  directly. All HTTP goes through `paypalFetch`/`paypalHttpRequest`.
- Every call records `provider`, `method`, `path`, `status`, and `latency_ms`
  into `audit_events` (`INTEGRATION_HTTP_CALL`) for GUD-006.
- Errors are redacted through `server/src/utils/redaction.ts` (SEC-008).
