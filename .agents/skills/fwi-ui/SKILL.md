---
name: fwi-ui
description: Build or review mobile-friendly, accessible FWI forms and operational views using the project-selected stack without inventing domain logic.
---
# FWI UI skill
## Scope
Work on UI components, form interactions and responsive layout in a **dedicated branch/worktree**. Confirm API contract and approved stack before introducing dependencies. Do not write database migrations or change calculation policy.

## Requirements
- P0 form: capture site, event category/stage, timestamp, item, mass basis, quantity and method, evidence indicator, quality state. Use actual schema rather than inventing production fields.
- Show explicit units and clear distinction between empty/unknown and measured zero.
- Gross/tare/net feedback must use validated domain utility or API, not an independent UI-only truth.
- Support error messages, keyboard navigation, accessible labels, loading/retry and narrow screens.
- Use synthetic examples only; no student identities or SPPG personal data.
- Do not imply held KPIs are live; do not offer unauthorized rescue flows.

## Done when
UI meets task acceptance criteria, accessibility basics checked, screenshots or text description of result, tests run and handoff written. Load detailed FWI sources only when an actual UI decision depends on them.
