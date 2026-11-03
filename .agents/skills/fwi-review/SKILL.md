---
name: fwi-review
description: Independent, evidence-based PR review for FWI focusing on event integrity, mass-basis correctness, security, test coverage and scoped changes.
---
# FWI code review skill
Use `git diff --stat`, PR summary, changed source files and relevant tests; only open more files when needed. Reviewer must not silently implement or merge changes.

## Review gates
- Correct domain lineage; no double counting.
- Measurement states and mass basis respected; no false zero or unsupported conversion.
- Test acceptance criteria; identify missing negative/boundary tests.
- RBAC/data isolation, permissions, logs without secrets, safe dependencies, limited external calls.
- No held KPI activation or production/integration claims.
- No unrelated changes; branch ownership and conflicts checked.

## Output contract
`PASS / PASS_WITH_CONDITIONS / CHANGES_REQUIRED`; list findings by severity (blocker/major/minor), file+line, evidence/reproduction, recommended fix, actual test results, residual uncertainties. Never claim tested if tests not run. Human approval always required.
