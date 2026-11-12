#!/usr/bin/env bash
# Regenerates server/src/services/paypalClient.ts from the official PayPal
# OpenAPI specifications through APIMatic (ARC-006).
#
# Required environment:
#   APIMATIC_API_KEY          APIMatic account API key
#   APIMATIC_API_KEY_ID       APIMatic API key identifier
#   APIMATIC_SPEC_DIR         Directory containing
#                             paypal_invoicing_v2_openapi.json and
#                             paypal_orders_v2_openapi.json
#
# The generated transport is committed to the repo. When APIMatic credentials
# are unavailable, `server/src/services/paypalClient.ts` remains the checked-in
# typed transport and this script documents the exact regeneration path.
set -euo pipefail

: "${APIMATIC_API_KEY:?APIMATIC_API_KEY is required}"
: "${APIMATIC_API_KEY_ID:?APIMATIC_API_KEY_ID is required}"
: "${APIMATIC_SPEC_DIR:?APIMATIC_SPEC_DIR is required}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${ROOT}/src/services/paypalClient.generated.ts"

for spec in paypal_invoicing_v2_openapi.json paypal_orders_v2_openapi.json; do
  if [[ ! -f "${APIMATIC_SPEC_DIR}/${spec}" ]]; then
    echo "Missing OpenAPI spec: ${APIMATIC_SPEC_DIR}/${spec}" >&2
    exit 1
  fi
done

curl --fail-with-body \
  --request POST \
  --url "https://api.apimatic.io/context/generate" \
  --header "Authorization: X-Auth-Key ${APIMATIC_API_KEY_ID}:${APIMATIC_API_KEY}" \
  --header "Content-Type: application/json" \
  --data @- > "${OUT}" <<JSON
{
  "generator": "typescript-node",
  "specs": [
    "${APIMATIC_SPEC_DIR}/paypal_invoicing_v2_openapi.json",
    "${APIMATIC_SPEC_DIR}/paypal_orders_v2_openapi.json"
  ],
  "options": {
    "packageName": "cascadeos-paypal-client",
    "usePromises": true,
    "strictTyping": true
  }
}
JSON

echo "Generated ${OUT}. Review the diff, then replace the checked-in transport only after tests pass."
