# FWI — concise project context
Updated: 2026-11-04 | **Working reference, not a regulatory source or production authorization.**

- FWI measures and analyzes food loss/waste for MBG/SPPG as **independent analytical decision support**.
- Authoritative internal sources: FWI-01 v1.0 (research), FWI-02 v1.0 (architecture), FWI-03 v1.3 (methodology), FWI-04 MVP v0.1 (product blueprint). Documents are external to this kit; retain exact source versions and approved amendments.
- Core design: six conceptual operational stages, event ≠ measurement ≠ transfer ≠ disposition; no double counting; mass-basis traceability and measured-vs-estimated data quality.
- MVP P0 priority: organization/access, minimum master data, unique waste event, gross/tare/net measurement, data quality/audit log, CSV/XLSX export. P1 includes lineage/disposition/dashboard. P2 includes controlled KPIs and future integrations.
- KPI candidate status per FWI-03 v1.3: 24 total; 3 design-pass preview, 18 conditional, 3 held (OP-08/FI-02/NI-03). **These are methodological statuses, not deployment authorization.**
- Gates: G0 desk validation complete; G1 internal sign-off not formally complete, G2 expert, G3 bench, G4 field, G5 activation not complete according to available dossier.
- Prototype permitted with synthetic data and relevant FWI-03 desk regression scenarios. No permission implied for government APIs, actual SPPG data, pilot, deployment, or official KPI reports.
- Technology status:
  - ACCEPTED: ADR-001 — backend FastAPI 0.146 line, Python 3.14.x, SQLAlchemy 2.1 line (synchronous Session), Alembic; domain stays plain Python / framework-independent; async deferred until justified by evidence.
  - ACCEPTED: ADR-002 — PostgreSQL 18.x canonical relational database; SQLite is not canonical persistence.
  - OPEN (must not be silently closed): frontend framework; authentication strategy/provider; evidence/object storage; API style (beyond FastAPI baseline); deployment/hosting; offline/sync; correction/supersession persistence policy; final controlled vocabularies (source-gated); external government integration contracts.
  - Accepted ADRs supersede earlier `OPEN` technology statements in older architecture/context documents.
- Current implemented baseline: `src/fwi/domain/` domain package + `tests/test_domain_validation.py`; merged in repo: PRD v0.1, FWI-ARCH-001 v0.1, ADR-001, ADR-002. FWI-ARCH-001 v0.2 is the proposed reconciliation under review in PR #8 (not merged yet — do not describe it as merged until the PR is merged). No backend framework code yet.
- Next work: governance reconciliation first, then backend bootstrap / physical schema as a separate implementation task (per ADR-001/ADR-002 follow-ups).
- AI setup: ChatGPT Plus+Codex; Google AI Pro+Antigravity; GitHub Copilot Student; Z.ai GLM-5.3/Flash; NotebookLM and Gemini Deep Research for reference. User reports model availability; selector names/effort can change; absence from one inventory does not mean a tool/model is unavailable.
