# Delivery ledger redesign

## Discovery
- Objects: projects, milestones, dependency edges, invoices, supplier quotes, recovery plans, audit events.
- Milestones carry dates, duration, crew, invoice status, warehouse readiness and integer-cent costs.
- The current project has six phases; the interface must also handle empty and larger projects.
- Project managers inspect blocked work; finance approves a fingerprinted proposal; procurement compares complete costs.
- Readiness is not equivalent to payment. Warehouse and predecessor states must remain visible.
- Supplier alternatives are mutually exclusive: never sum their potential savings into a claimed project saving.
- The API returns `activeRecoveryPlan`, while the existing client expects `recoveryPlans`; normalize the contract at the client boundary.
- Refresh must read current state, not reset the sandbox.
- Existing React, Bryntum, AG Studio, PayPal and Channel3 integrations remain.
- No invented progress percentages or hardcoded policy successes.

## Direction contract
THESIS: A delivery ledger that answers “What is blocking the next milestone, and what can we release?” The milestone register takes precedence over decorative metrics and simulations.

OWN-WORLD: Drawing-register clarity: cool paper, graphite text, black controls, blue schedule marks, and small red/amber state signals. Geist supplies compact readable tabular figures. Consistent compact controls and flat sheets replace nested decorative cards.

STORY: Choose the project, inspect the milestone register, follow the invoice/materials/work release chain, then inspect financial evidence or review the recovery proposal. Timeline, procurement, analytics and audit remain explicit destinations.

FIRST VIEWPORT: A 224px labelled project sidebar; fluid workspace with 32px equal gutters. A project title and undivided financial summary precede a roughly 2:1 milestone register and recovery rail. Six real milestones fit on desktop. Mobile folds navigation and presents readable phase rows.

FORM: Grounded list: construction drawing register, progress certificate, material delivery docket, project handover register, site wayfinding, engineering specification, procurement comparison sheet. Assigned fourth direction: project handover register. Impeccable seed:65df5e810d11b66a. Taste achromatic-ledger seed 1279394541; no redraw. Its open-plane shell and ink controls fit the operational task. Product-specific signature: an invoice/materials/work release chain linked to the selected milestone. UI/UX search recommendations were off-topic marketing layouts; only verified general accessibility guidance is applied.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Challenger assessment
The emission rail, dance notation, cassette, annual plates, and reference typography lose audience identification and product clarity to the handover register. Their useful disciplines are consistent state encoding, aligned parallel tracks, bounded capacity, precise spacing, and nearby annotations. Transit mapping is competitive on dependency clarity but weaker for financial work: retain graph clarity as an interaction requirement, not transit decoration.

## Screen questions
Overview: what needs attention next? Schedule: when can each phase run? Recovery: what does the proposal change? Suppliers: what does each complete quote cost? Dependencies: which prerequisite blocks work? Analytics: what do the underlying project records show?
