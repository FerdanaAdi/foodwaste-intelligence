# FWI AI Handoff
- **Task:** FWI-INT-005 / `codex/fwi-int-005-persistent-capture`, main base `8f64e62`; Owner D-01–D-06/W-20–W-25 and Linux CI addendum approved.
- **Scope:** isolated capture, two existing POSTs, stable event UUID, exact Decimal/null, five statuses/six provisional bases; no DemoStore mapping, schema or methodology change.
- **Implementation:** journal fails closed/no replay, route context reset, response/input association, scoped Vite boundary; final CI delta changes tests/config/docs only.
- **Regression:** CI typecheck/build/proxy PASS, 101 Vitest PASS; required PostgreSQL 76 tests + six subtests PASS (14 PostgreSQL cases), no skips; kit PASS.
- **Browser:** Linux Chromium 6/6 PASS on prior HEAD `079f78c`, Actions 42221023864, artifact 13502784462; Windows writer NOT RUN. Proposed auth hardening has NOT passed CI yet.
- **Integrity/cleanup:** real 201 + row/audit before W-20/21 test-only 503; one POST/no replay; all six owned schemas absent; PostgreSQL 18.6 fwi_test/fwi_demo_test only, no dev writes; GOV/QA preserved.
- **Evidence:** docs/frontend/ci-browser-integrity.md and fwi-int-005-review-reconciliation.md; always-upload artifacts retained seven days, failure screenshot/trace verified from initial selector failure.
- **Limits:** original FWI-01/02/03/04 unavailable; no full methodology validation, exactly-once/auth or cross-client deduplication; OP-08/FI-02/NI-03 HELD; existing npm advisories need separate follow-up.
- **Review/next:** Owner-approved CI closure proposed: synthetic password, masked browser DSN, localhost-only PostgreSQL publish, and invalid-password probe. Must rerun all three CI jobs and guarded cleanup on new HEAD; six prior schemas absent, abrupt termination residual. Antigravity delta sign-off PENDING; PR #15 Draft, no merge/deploy.
