# FWI-DATA-001 — Synthetic Demo Data Slice v0.1

**PROVISIONAL / demo only**, not a permanent physical schema or production authorization.
Uses accepted ADR-001/002 and the repo domain contract. Original FWI-02 v1.0,
FWI-03 v1.3 and FWI-04 v0.1 were unavailable locally; no claim of source verification.

## Reversible technical choices

- Five business tables: organizations, sites, waste_events, measurements, audit_events.
  Alembic also maintains its own version table. UUIDs are generated per record.
  `event_id` maps to domain `waste_event_id`; no second event identity is created.
- Organization/site FK scope is enforced, including site ownership. Time columns are
  timezone-aware; the server supplies recorded_at separately from occurred_at/measured_at.
- Minimal event type subset: at_risk_surplus / actual_loss_discard. No transfer,
  disposition or rescue event type. Surplus is not automatically discarded or counted.
- Routes are provisional: POST/GET `/demo/v0.1/events[/{event_id}]` (GET requires ID),
  POST/GET `/demo/v0.1/events/{event_id}/measurements`. No edit/delete/aggregate endpoint.
- Existing provisional mass bases are reused; plate_leftover is not a basis.
  Unit kg only; gross/tare/net retain their original kg values. No conversion occurs.
- Method and provenance are required descriptive text, not final controlled vocabularies.
  Status subset: observed, measured_zero, estimated, missing, not_measured. Missing/not
  measured require NULL masses. Estimates remain explicitly labeled and are never
  promoted to measured data. Validation status is not an observation status; no approval
  workflow or ValidationRecord persistence is introduced in this five-entity demo.
- NUMERIC has no fixed precision/scale; Decimal validation uses exact supplied digits
  without quantization/rounding. API monetary/measurement numbers should be JSON strings
  to avoid upstream binary-float precision loss. Technical input cap: 1000 coefficient
  digits and exponent magnitude 1000; this is a resource limit, not scientific precision.
- Application functions own BEGIN/COMMIT/ROLLBACK. Data plus creation audit flush together;
  no hidden repository commit. Synthetic actor is fixed, never caller-supplied identity.
- Synthetic seeding is explicit and audited; not invoked at application startup.
  Reads do not write audit records. No mutations other than creation are exposed.

## Reproduce with a dedicated synthetic PostgreSQL 18 database

Install existing project dependencies with `python -m pip install -e ".[dev]"`.
Supply `FWI_DATABASE_URL` privately through the environment; no production/real data.
Run `python -m alembic upgrade head` and seed explicitly in a Python session:

```python
import os
from fwi.infrastructure.database.session import create_session_factory
from fwi.infrastructure.database.demo_seed import seed_demo
seed_demo(create_session_factory(os.environ['FWI_DATABASE_URL']))
```

For tests use `FWI_TEST_DATABASE_URL=postgresql+psycopg://fwi_test@127.0.0.1:5432/fwi_demo_test`
with credentials supplied privately by libpq's pgpass file; never print the file.
Set `FWI_REQUIRE_POSTGRES=1` and run `python -B -m pytest -v`.
The fixture fails closed unless the connected role/database are exactly
`fwi_test` / `fwi_demo_test` on PostgreSQL 18, before CREATE SCHEMA.
Tests create a random `fwi_demo_test_<uuid>` schema, apply the real migration, check
mapping drift, seed synthetic org/site, then remove only that schema. User tables are
not targets. Cleanup checks the exact created schema OID and current role ownership,
and never deletes a pre-existing/colliding/replaced schema. The name must have the
`fwi_demo_test_` prefix and a UUID4 hex suffix. The connection needs schema-creation privileges.
Dev migrations require separately verified `fwi_dev` / `fwi_demo_dev`, a clean or
expected Alembic-managed target, and owner authorization; tests never target dev.
Without the URL, PostgreSQL tests skip explicitly: skips are not persistence evidence.
The PR workflow provisions a disposable PostgreSQL 18 service and requires the tests.

Verification covers fresh app/engine reads after restart, two measurements on one event,
independent observation IDs without aggregation, NULL vs zero, estimates, mass rejection,
and failure after BOTH data/audit flush (transaction rolls back both).

## Remaining boundaries

Schema, route naming, vocabulary, rounding policy and reconciliation remain provisional.
No selected-measurement policy, KPI activation (OP-08/FI-02/NI-03 remain HELD), auth,
file storage, offline sync, government integration, or deployment. Routes are for an
isolated synthetic demo; there is no authorization/data-isolation mechanism for real use.
Alembic 1.20.1 is the only added direct dependency, already selected by ADR-001.
