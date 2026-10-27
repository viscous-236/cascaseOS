# Frontend redesign verification

## Delivered direction

The delivery ledger puts project phases and financial readiness ahead of simulations and reporting. A dedicated project sidebar opens the overview, schedule, recovery, supplier register, dependency relationships, and analytics studio. The selected milestone's invoice, warehouse, and predecessor states form the release chain.

Product context is recorded in `PRODUCT.md`; the design rationale and direction contract are in `design-direction.md`. Taste's achromatic-ledger direction used seed `1279394541`, with no redraw. Impeccable's handover-register direction used `seed:65df5e810d11b66a`.

## Implementation

- `src/App.tsx`: navigable hash-based workspaces and contextual loading/error/first-run states.
- `src/components/workspace/`: sidebar, milestone ledger, release chain, supplier register, dependency list, shared statuses.
- `src/index.css`: shared light/dark tokens, responsive layout, vendor theme bridges, and accessible overlay styling.
- `src/components/ui/useDialog.ts`: focus containment, Escape, background isolation, scroll locking, and focus restoration.
- Existing project creation, financial drawers, recovery approval, audit exports, assistant, Bryntum, and AG Studio remain integrated.
- Heavy schedule, analytics, and 3D code load when their workspaces are requested. The initial JS chunk fell from approximately 5.58 MB to 0.86 MB before gzip during implementation.
- `src/api/cascadeApiClient.ts`: adapts the server's `activeRecoveryPlan` response to the existing client history interface.
- Project switching clears project-specific selection and approval state. Refresh reads current data; canonical sandbox reset is explicitly labelled under recovery maintenance.
- Approval evidence uses observed quote prices and current prerequisite/warehouse facts. Removed hardcoded savings, compliance values, progress percentages, and reminder streak claims.

## Checks actually run

| Check | Result |
| --- | --- |
| `npm run typecheck` | Server and client passed |
| `npm run build` | Server and client passed |
| `npm test` | 149 server tests passed |
| `npm run test --workspace=client` | Four API contract tests passed |
| `git diff --check` | Passed |
| Taste production inspection at 1440, 768, 390 | Zero failures; one secondary-text-size warning |
| Taste source lint for the new workspaces, app, and CSS | Zero failures; contextual warnings described below |
| Impeccable detector for the redesigned shell and workspaces | Only common-font warnings for Geist |

Browser automation used installed Chrome against the production assets served at `http://localhost:4000`. The existing Vite preview remains at `http://localhost:5173`.

### Real project browsing

Verified milestone search, attention filter, clear filters, task inspection, modal focus containment and Escape, audit filtering, AI/manual project-builder switching, draft phase addition, all six workspace destinations, schedule composer input, existing recovery-plan opening, project switching, persisted theme, and mobile navigation. Desktop, tablet, phone, and dark-mode screenshots were captured. No browser runtime exceptions occurred.

### Intercepted API boundary checks

Separate browser fixtures verified connection failure, empty accounts, zero financial values, task schedule submission and refreshed values, draft preservation after failed project creation, schedule-only phase creation, and recovery scenario error recovery. Mutation requests were intercepted locally: this proves frontend payload/state behavior, not a live payment or supplier transaction. The server suite separately verifies backend CRUD and policy behavior.

No payment capture, invoice send, or live project-creation transaction was executed through the browser as part of this redesign.

## Visual critique

The milestone register is the dominant working area, the release chain makes readiness inspectable, and the recovery action is visible alongside its evidence. On narrow screens a recovery link moves ahead of the register; the sidebar becomes a drawer. Money is right-aligned and tabular, zero remains zero, and quote alternatives are not summed into invented savings.

Secondary dates, crew labels, and status annotations intentionally use 11–12px on desktop; names and primary data use 13–14px. Phone names and statuses are larger. This accounts for the inspector's small-text warning. Source lint flags the domain term “unlock,” true phase ordering, dialog-only shadows, CSS that disables vendor blur/shadows, and hash typography; these do not indicate decorative effects in the rendered overview. Geist is the Taste-dealt operational face, self-hosted with its OFL license.

## Boundaries

Bryntum is an existing trial dependency and still displays its vendor watermark. AG Studio and Bryntum produce large lazy-loaded chunks, which Vite reports. Supplier tables and the desktop analytics editor scroll within their containers on small screens. The editor starts with an empty canvas because no persisted report layout was present; project datasets and custom widgets remain available.

Screenshots and browser fixtures are local ignored artifacts under `.impeccable/review/` and the repository's `.taste-skill/`. They can contain project details and are not committed. No photographic assets or fabricated customer metrics were added.
