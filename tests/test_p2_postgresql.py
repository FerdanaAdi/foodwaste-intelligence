"""Real PostgreSQL 18 tests for the provisional P2 foundations (FR-201/202/203).

Reuses the isolated per-test schema fixture; the KPI registry is seeded with
only codes citable from PRD v0.1 section 11. HELD codes must return no numeric
result on any path, and cost references without a price are N/A, never Rp0.
"""

import pytest
from sqlalchemy import select

from auth_support import TestClient, login_client
from p1_support import p1_post
from test_demo_postgresql import database  # noqa: F401  (shared isolated schema fixture)

from fwi.infrastructure.database.p2_seed import seed_kpi_registry

from fwi.api.app import create_app
from fwi.infrastructure.database.demo_seed import ORGANIZATION_ID, SITE_ID
from fwi.infrastructure.database.models_p1 import P2CostReference, P2KpiEntry
from fwi.infrastructure.database.security_seed import SITE_B

ORG = str(ORGANIZATION_ID)
SITE_A = str(SITE_ID)
SITE_B_ID = str(SITE_B)
PREVIEW_KEYS = {'kpi_code', 'formula_version', 'design_status', 'status', 'reason', 'note'}


def test_held_codes_return_no_numeric_result(database):  # P2-AC-01
    seed_kpi_registry(database)
    app = create_app()
    try:
        with TestClient(app) as client:
            catalogue = client.get('/p2/v0.1/kpi').json()
            codes = {entry['kpi_code']: entry['design_status'] for entry in catalogue}
            assert codes == {'OP-03': 'design_pass', 'OP-04': 'design_pass', 'OP-10': 'design_pass',
                             'OP-08': 'held', 'FI-02': 'held', 'NI-03': 'held'}
            for code in ('OP-08', 'FI-02', 'NI-03'):
                preview = client.get(f'/p2/v0.1/kpi/{code}/preview')
                assert preview.status_code == 200
                body = preview.json()
                assert set(body) == PREVIEW_KEYS  # no numeric field exists at all
                assert body['status'] == 'held_blocked'
            # Even a direct mismatch-free request stays blocked and value-free.
            direct = client.get('/p2/v0.1/kpi/OP-08/preview?numerator_basis=raw&denominator_basis=raw')
            assert direct.json()['status'] == 'held_blocked'
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_registry_is_read_only_and_versions_preserved(database):  # P2-AC-02
    seed_kpi_registry(database)
    app = create_app()
    try:
        with TestClient(app) as client:
            before = client.get('/p2/v0.1/kpi').json()
            # The collection path exists (GET) so mutating methods are 405; the item
            # path has no registered mutation route at all, so it is 404. Either way
            # there is no update path for a definition.
            assert client.patch('/p2/v0.1/kpi', json={}).status_code == 405
            assert client.patch('/p2/v0.1/kpi/OP-08', json={}).status_code == 404
            assert client.delete('/p2/v0.1/kpi/OP-08').status_code == 404
            assert client.get('/p2/v0.1/kpi').json() == before
            design_pass = client.get('/p2/v0.1/kpi/OP-03/preview').json()
            # Design-pass status does not imply field validation: still blocked, still value-free.
            assert design_pass['status'] == 'blocked' and set(design_pass) == PREVIEW_KEYS
            mismatch = client.get('/p2/v0.1/kpi/OP-03/preview?numerator_basis=raw&denominator_basis=cooked')
            assert mismatch.json()['status'] == 'blocked'  # P2-AC-03 reason path
            assert 'DR-11' in mismatch.json()['reason']
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_missing_price_is_na_never_zero_and_valuation_blocked(database):  # P2-AC-05
    app = create_app()
    try:
        with TestClient(app) as client:
            created = p1_post(client, '/p2/v0.1/cost-references', dict(
                organization_id=ORG, site_id=SITE_A, scope_type='lot',
                scope_ref='22222222-2222-4222-8222-222222222222', currency='IDR',
                amount=None, unit_basis='kg_raw', price_source='SYN-PRICE-A',
                price_date='2026-11-01', method_version='managerial-est-v0'), SITE_A)
            assert created.status_code == 201, created.text
            body = created.json()
            reference_id = body['cost_reference_id']
            assert body['amount'] is None and body['price_availability'] == 'not_available'
            read = client.get(f'/p2/v0.1/cost-references/{reference_id}').json()
            assert read['amount'] is None and read['price_availability'] == 'not_available'
            valuation = client.get(f'/p2/v0.1/cost-references/{reference_id}/valuation').json()
            assert valuation['status'] == 'blocked'
            assert valuation['price_availability'] == 'not_available'
            assert not any(key in valuation for key in ('value', 'amount', 'estimated_loss'))
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_new_cost_version_cannot_silently_change_history(database):  # P2-AC-06
    app = create_app()
    try:
        with TestClient(app) as client:
            first = p1_post(client, '/p2/v0.1/cost-references', dict(
                organization_id=ORG, site_id=SITE_A, scope_type='batch',
                scope_ref='22222222-2222-4222-8222-222222222223', currency='IDR',
                amount='10000.00', unit_basis='kg_raw', price_source='SYN-PRICE-A',
                price_date='2026-11-01', method_version='managerial-est-v0'), SITE_A)
            assert first.status_code == 201
            first_id = first.json()['cost_reference_id']
            second = p1_post(client, '/p2/v0.1/cost-references', dict(
                organization_id=ORG, site_id=SITE_A, scope_type='batch',
                scope_ref='22222222-2222-4222-8222-222222222223', currency='IDR',
                amount='12000.00', unit_basis='kg_raw', price_source='SYN-PRICE-B',
                price_date='2026-11-08', method_version='managerial-est-v1'), SITE_A)
            assert second.status_code == 201
            assert client.patch(f'/p2/v0.1/cost-references/{first_id}',
                                json={'amount': '99999'}).status_code == 405
            unchanged = client.get(f'/p2/v0.1/cost-references/{first_id}').json()
            assert unchanged['method_version'] == 'managerial-est-v0'
            assert unchanged['amount'] == '10000.00'
            with database() as session:
                rows = session.scalars(select(P2CostReference).order_by(P2CostReference.recorded_at)).all()
                assert len(rows) == 2
    finally:
        app.state.session_factory.kw['bind'].dispose()


def operational_snapshot(factory):
    """Stable snapshot of operational tables; alerts/settings must never touch these."""
    from fwi.infrastructure.database.models import Measurement, WasteEvent
    from fwi.infrastructure.database.models_p1 import P1Delivery, P1Disposition, P1MealService
    with factory() as session:
        return {model.__tablename__: sorted(str(tuple(row)) for row in session.execute(select(*model.__table__.columns)))
                for model in (WasteEvent, Measurement, P1Delivery, P1MealService, P1Disposition)}


def test_recommendations_evaluate_acknowledge_and_never_mutate_operations(database):  # P2-AC-07/08
    from sqlalchemy import func
    from fwi.infrastructure.database.models_p1 import P2Recommendation
    app = create_app()
    try:
        with TestClient(app) as client:
            event = client.post('/demo/v0.1/events', json=dict(
                organization_id=ORG, site_id=SITE_A, event_type='at_risk_surplus',
                occurred_at='2026-11-05T07:00:00+08:00'))
            assert event.status_code == 201  # no measurement: coverage gap
            delivery = p1_post(client, '/p1/v0.1/deliveries', dict(
                organization_id=ORG, site_id=SITE_A, run_id=None, from_site_id=SITE_A,
                to_site_id=SITE_B_ID, dispatch_quantity='100.00', original_unit='kg',
                mass_basis='as_served', dispatched_at='2026-11-05T06:00:00+08:00'), SITE_A)
            delivery_id = delivery.json()['delivery_id']
            receiver = TestClient(app)
            try:
                login_client(receiver, 'site_b_writer')
                assert p1_post(receiver, f'/p1/v0.1/deliveries/{delivery_id}/receiving',
                               dict(received_quantity='95.00', received_at='2026-11-05T09:00:00+08:00'),
                               SITE_B_ID).status_code == 201
            finally:
                receiver.close()
            assert p1_post(client, '/p1/v0.1/services', dict(
                organization_id=ORG, site_id=SITE_A, served_count=190, served_mass=None,
                mass_basis=None, delivery_id=None, sampling_frame=None, sample_size=5,
                sampling_method='visual_tray', coverage=None), SITE_A).status_code == 201
            before_operations = operational_snapshot(database)
            first = p1_post(client, '/p2/v0.1/recommendations/evaluate?site_id=' + SITE_A, {}, SITE_A)
            assert first.status_code == 200, first.text
            body = first.json()
            assert {a['rule_code'] for a in body['alerts']} == {
                'delivery_reconciliation_review', 'event_coverage_insufficient', 'sampling_frame_missing'}
            assert body['rule_version'].startswith('p2-rules-provisional-')
            assert all(a['state'] == 'open' and 'automatic change' in a['recommended_action']
                       for a in body['alerts'])
            second = p1_post(client, '/p2/v0.1/recommendations/evaluate?site_id=' + SITE_A, {}, SITE_A).json()
            assert {a['recommendation_id'] for a in second['alerts']} == \
                {a['recommendation_id'] for a in body['alerts']}  # deterministic, idempotent
            target = next(a for a in body['alerts'] if a['rule_code'] == 'delivery_reconciliation_review')
            ack = p1_post(client, f"/p2/v0.1/recommendations/{target['recommendation_id']}/acknowledge",
                          dict(state='acknowledged', reason='reviewed with the site team; no automated change'),
                          SITE_A)
            assert ack.status_code == 200, ack.text
            assert ack.json()['state'] == 'acknowledged'
            third = p1_post(client, '/p2/v0.1/recommendations/evaluate?site_id=' + SITE_A, {}, SITE_A).json()
            assert len(third['alerts']) == 3  # acknowledged row persists, never regenerated
            assert next(a for a in third['alerts']
                        if a['recommendation_id'] == target['recommendation_id'])['state'] == 'acknowledged'
            with database() as session:
                assert session.scalar(select(func.count()).select_from(P2Recommendation)) == 3
            # P2-AC-08: evaluation and acknowledgement changed no operational record.
            assert operational_snapshot(database) == before_operations
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_global_alert_settings_mutation_is_fail_closed(database):  # Blocker 3 / T-06
    from sqlalchemy import func

    from fwi.infrastructure.database.models_p1 import P2AlertSetting
    app = create_app()
    try:
        with TestClient(app) as client:
            denied = p1_post(client, '/p2/v0.1/recommendations/rules/event_coverage_insufficient/disable',
                             dict(site_id=SITE_A, disabled=True), SITE_A)
            assert denied.status_code == 403  # backend denial, never a UI-only guard
            with database() as session:
                assert session.scalar(select(func.count()).select_from(P2AlertSetting)) == 0
            assert client.get('/p2/v0.1/recommendations/rules').status_code == 200  # read kept (T-08)
    finally:
        app.state.session_factory.kw['bind'].dispose()



def test_missing_reference_yields_insufficient_data_not_a_claim(database):  # P2-AC-07
    from sqlalchemy import func
    from fwi.infrastructure.database.models_p1 import P2Recommendation
    app = create_app()
    try:
        with TestClient(app) as client:
            event = client.post('/demo/v0.1/events', json=dict(
                organization_id=ORG, site_id=SITE_A, event_type='actual_loss_discard',
                occurred_at='2026-11-05T07:00:00+08:00'))
            event_id = event.json()['event_id']
            assert p1_post(client, '/p1/v0.1/dispositions', dict(
                organization_id=ORG, site_id=SITE_A, event_id=event_id, outcome_type='compost',
                quantity='1.00', original_unit='kg', mass_basis='cooked',
                occurred_at='2026-11-05T10:00:00+08:00', food_safety_status='not_assessed',
                handover_ref=None), SITE_A, event_id=event_id).status_code == 201
            result = p1_post(client, '/p2/v0.1/recommendations/evaluate?site_id=' + SITE_A, {}, SITE_A).json()
            insufficient_codes = {item['rule_code'] for item in result['insufficient']}
            assert 'allocation_exceeds_reference' in insufficient_codes
            assert all(item['state'] == 'insufficient_data' for item in result['insufficient'])
            assert 'allocation_exceeds_reference' not in {a['rule_code'] for a in result['alerts']}
            with database() as session:
                assert session.scalar(select(func.count()).select_from(P2Recommendation).where(
                    P2Recommendation.rule_code == 'allocation_exceeds_reference')) == 0
    finally:
        app.state.session_factory.kw['bind'].dispose()
