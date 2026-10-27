# CascadeOS

<!-- impeccable:product-schema 1 -->

## Platform
web

## Product Purpose
Connect milestone schedules to payment readiness so teams can identify unpaid work, understand crew exposure, compare supplier quotes, and approve recovery plans.

## Users
Confirmed primary users: project managers, finance approvers, and procurement teams. Their core job is recovering blocked milestones using invoice, supplier, and schedule data. Construction and capital-project use cases are documented in README.md. The user confirmed this audience and workflow during Impeccable initialization and asked to continue the redesign.

## Operating Context
Frequent desktop review of project milestones; tablet and phone access for checking readiness and inspecting invoices. Daylit office and site environments motivate a light default, with a persistent dark option.

## Capabilities and Constraints
- React 18, TypeScript, Vite, Tailwind, Express, and SQLite.
- Project switching and AI/manual project creation.
- Bryntum schedule editing, dependencies, and critical paths.
- Task dates, warehouse readiness, invoices, and supplier quotes.
- Deterministic policy checks, fingerprinted human approval, PayPal sandbox checkout, and audit exports.
- Channel3 procurement, conversational assistant, and AG Studio analytics.
- Monetary values are integer minor units. Missing financial facts must not become invented values or compliance claims.
- Preserve current APIs, business rules, and existing uncommitted functionality.

## Brand Commitments
Keep the CascadeOS name. User explicitly requests a new visual identity, no generic dashboard styling, and cohesive accessible responsive implementation.

## Evidence on Hand
README.md, client/src/types/domain.ts, client/src/api/cascadeApiClient.ts, server/src/routes, and the current project API. No marketing photography, customer proof, or invented business metrics are needed.

## Product Principles
Show the work that needs attention before aggregate reporting. Keep financial evidence next to the decision. Scope every action to the active project. Explain missing data and failure with a concrete next action.
