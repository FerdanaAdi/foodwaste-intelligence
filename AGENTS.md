# FWI — agent contract (short / always-on)

## Goal
Build a **synthetic-data-only prototype** of FoodWaste Intelligence (FWI), an independent measurement/analytics/decision-support layer for MBG/SPPG food loss/waste. **Not** an official BGN system or automatic integration with government APIs.

## Source precedence (by concern)
Apply the source that governs the concern at hand; this is not a single global ranking:
- Product scope/priorities -> PRD `docs/product/PRD-v0.1.md` / FWI-04 MVP Blueprint v0.1.
- Methodology/KPI/mass rules -> FWI-03 Methodology v1.3 (measurement/KPI definitions).
- Event/data semantics -> FWI-02 Architecture v1.0 + repo domain contract `docs/domain/waste-event-measurement-v0.1.md`.
- Accepted technology choices -> accepted ADRs (`docs/architecture/adr/`).
- Active task control files (e.g. this file, `docs/ai/TASK_TEMPLATE.md`) may constrain how files change but cannot override higher-level accepted decisions.

Accepted ADRs supersede earlier `OPEN` technology statements in older architecture/context documents. Check latest approved versions. If a source is unavailable: report the gap; do not guess regulations/formulas.

## Nonnegotiable domain constraints
- A single actual waste-generation occurrence has **one stable event identity**. Remeasurement, transfer, rescue and disposal are **not** new generation events.
- Separate waste event, measurement, material transfer and disposition concepts. Keep raw vs cooked vs served/leftover **mass basis** explicit; do not invent universal conversion factors.
- For measurements, preserve gross/tare/net, units, method, provenance, precision and quality status. Distinguish **measured zero**, missing, not measured, N/A, estimated and blocked.
- Preserve distinct edible/inedible, avoidability and food-safety attributes. Never optimize waste KPIs by compromising nutrition or safety.
- Held KPIs **OP-08, FI-02, NI-03** remain disabled; do not activate unapproved KPIs.
- No assumed authorization to read/write SIPGN, AKSIS, LPDH or Stop Boros Pangan. Do not invent daily regulatory mandates.
- No production claims, field validation claims, personal student data, live SPPG data, hardcoded API keys or unapproved outbound transfer.

## Execution / token economy
1. Before editing: read task/acceptance criteria and relevant files only; name affected files and assumptions briefly.
2. One implementer per task; isolated branch/worktree. Never rewrite another agent's concurrent workspace.
3. Small, testable diffs. Avoid large unsolicited refactors, introducing dependencies, rewriting docs, or running commands with side effects.
4. Run the narrowest relevant tests; for domain/KPI changes include applicable FWI-03 desk regression cases where available. Report exact commands and results, never invent passes.
5. Ask for approval before new dependencies, architectural changes, external services, production deploy, destructive commands, license-sensitive copying or accessing sensitive data.
6. Stop after **two evidence-free failed attempts**; record reproducible error, files, logs summary, and next hypothesis in `docs/ai/HANDOFF.md`.
7. Responses and handoff: <= 10 concise lines unless user requests analysis. Cite file paths and unknowns.

## Skills on demand
- Domain/data logic: `.agents/skills/fwi-domain/SKILL.md`
- UI/forms: `.agents/skills/fwi-ui/SKILL.md`
- PR review: `.agents/skills/fwi-review/SKILL.md`
- Open-source repo audit: `.agents/skills/fwi-oss-audit/SKILL.md`

## Handoff
Read `docs/ai/HANDOFF.md` only when resuming work; update after meaningful task completion. PR must include tests, risk, and human approval.
