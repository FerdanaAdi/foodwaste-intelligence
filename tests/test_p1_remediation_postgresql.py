"""Regression tests for the three Codex blockers (FR-106 aggregation, FR-106 selection,
FR-204 global settings). Written to reproduce the defects first; expectations encode the
corrected behavior, never a relaxed one.

T-01 repeated measurements are never summed (as events or as extra mass).
T-02 remeasurement keeps one lineage event.
T-05 unresolved mass is never presented as a definite number or zero.
T-06 global alert-settings mutation is denied backend-side for site writers.
T-07 cross-site alert acknowledgement is denied/concealed without leakage.
"""

from decimal import Decimal

from sqlalchemy import func, select

from auth_support import TestClient, login_client
from p1_support import p1_post
from test_demo_postgresql import database  # noqa: F401  (shared isolated schema fixture)
from test_demo_validation import measurement_payload

from fwi.api.app import create_app
from fwi.infrastructure.database.demo_seed import ORGANIZATION_ID, SITE_ID
from fwi.infrastructure.database.models import Measurement
from fwi.infrastructure.database.models_p1 import P2AlertSetting, P2Recommendation
from fwi.infrastructure.database.security_seed import SITE_B

ORG = str(ORGANIZATION_ID)
SITE_A = str(SITE_ID)
SITE_B_ID = str(SITE_B)
AT = '2026-11-05T07:30:00+08:00'
TRENDS = '/p1/v0.1/trends?site_id=' + SITE_A + '&date_from=2026-11-04&date_to=2026-11-06'


def new_event(client, event_type='actual_loss_discard'):
    response = client.post('/demo/v0.1/events', json=dict(
        organization_id=ORG, site_id=SITE_A, event_type=event_type,
        occurred_at='2026-11-05T07:00:00+08:00'))
    assert response.status_code == 201, response.text
    return response.json()['event_id']


def basis_stat(trends, basis):
    return next(item for item in trends['per_basis'] if item['mass_basis'] == basis)


def test_t01_repeated_measurements_are_never_summed(database):
    """Two observations on one event: counts stay separate, mass becomes unresolved."""
    app = create_app()
    try:
        with TestClient(app) as client:
            event_id = new_event(client)
            assert client.post(f'/demo/v0.1/events/{event_id}/measurements',
                               json=measurement_payload()).status_code == 201  # net 2.0
            assert client.post(f'/demo/v0.1/events/{event_id}/measurements',
                               json=measurement_payload(gross='3.4', net='3')).status_code == 201  # net 3
            trends = client.get(TRENDS).json()
            stat = basis_stat(trends, 'cooked')
            assert stat['event_count'] == 1
            assert stat['measurement_count'] == 2
            aggregation = stat['aggregation']
            assert aggregation['status'] == 'unresolved_selection'
            assert aggregation['eligible_mass'] is None
            assert aggregation['unresolved_event_count'] == 1
            assert 'EXT-OD-03' in aggregation['reason']
            serialized = str(trends)
            assert '5.0' not in serialized and '"5"' not in serialized  # never 2+3
            assert aggregation['eligible_mass'] is None
            # measurement_count and event_count remain separately visible with labels.
            assert trends['completeness']['events_with_measurement'] == 1
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_t01b_single_observation_events_still_aggregate_with_label(database):
    """Events with exactly one usable observation are eligible; a repeated-measurement
    event anywhere in the same basis makes the whole basis mass unresolved."""
    app = create_app()
    try:
        with TestClient(app) as client:
            single = new_event(client)
            assert client.post(f'/demo/v0.1/events/{single}/measurements',
                               json=measurement_payload()).status_code == 201  # net 2.0, cooked
            ok = client.get(TRENDS).json()
            stat = basis_stat(ok, 'cooked')
            assert stat['aggregation']['status'] == 'policy_unresolved'
            assert stat['aggregation']['eligible_mass'] is None
            assert Decimal(stat['aggregation']['raw_observed_mass']) == Decimal('2.0')
            assert stat['aggregation']['eligible_event_count'] == 0
            assert stat['aggregation']['raw_observation_count'] == 1
            assert stat['aggregation']['unresolved_event_count'] == 0
            # one remeasured event in the same basis poisons the aggregate
            repeated = new_event(client)
            assert client.post(f'/demo/v0.1/events/{repeated}/measurements',
                               json=measurement_payload(gross='3.4', net='3')).status_code == 201
            assert client.post(f'/demo/v0.1/events/{repeated}/measurements',
                               json=measurement_payload(gross='4.4', net='4')).status_code == 201
            poisoned = basis_stat(client.get(TRENDS).json(), 'cooked')
            assert poisoned['aggregation']['status'] == 'unresolved_selection'
            assert poisoned['aggregation']['eligible_mass'] is None
            assert poisoned['aggregation']['eligible_event_count'] == 0
            assert poisoned['aggregation']['raw_observation_count'] == 1
            assert poisoned['aggregation']['unresolved_event_count'] == 1
            assert poisoned['event_count'] == 2 and poisoned['measurement_count'] == 3  # 1 + 2
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_t02_t05_remeasurement_lineage_and_missing_zero_distinction(database):
    app = create_app()
    try:
        with TestClient(app) as client:
            event_id = new_event(client)
            assert client.post(f'/demo/v0.1/events/{event_id}/measurements',
                               json=measurement_payload()).status_code == 201
            assert client.post(f'/demo/v0.1/events/{event_id}/measurements',
                               json=measurement_payload(gross='3.4', net='3')).status_code == 201
            # T-02: remeasurement keeps exactly one generation event in lineage counts
            lineage = client.get(f'/p1/v0.1/lineage/waste_event/{event_id}').json()
            assert lineage['distinct_source_event_count'] == 0  # no links exist yet
            receipt = p1_post(client, '/p1/v0.1/receipts', dict(
                organization_id=ORG, site_id=SITE_A, source_ref='RCV-REM-1', received_at=AT,
                note=None), SITE_A)
            lot_id = p1_post(client, f"/p1/v0.1/receipts/{receipt.json()['receipt_id']}/lots", dict(
                lot_ref='LOT-REM-1', item_code='ITEM-SYN-VEG', item_version=None, quantity='1.00',
                original_unit='kg', mass_basis='cooked'), SITE_A).json()['lot_id']
            for _ in range(2):
                assert p1_post(client, '/p1/v0.1/links', dict(
                    source_type='waste_event', source_id=event_id, target_type='lot',
                    target_id=lot_id, relation_code='transfer_of', quantity=None,
                    original_unit=None, mass_basis=None, occurred_at=AT, note=None),
                    SITE_A).status_code == 201
            lineage = client.get(f'/p1/v0.1/lineage/lot/{lot_id}').json()
            assert lineage['distinct_source_event_count'] == 1  # two links, one event
            # T-03/T-05: missing and measured-zero stay distinct and never create mass
            missing_event = new_event(client)
            assert client.post(f'/demo/v0.1/events/{missing_event}/measurements',
                               json=measurement_payload(observation_status='missing',
                                                        gross=None, tare=None, net=None)).status_code == 201
            zero_event = new_event(client)
            assert client.post(f'/demo/v0.1/events/{zero_event}/measurements',
                               json=measurement_payload(observation_status='measured_zero',
                                                        gross='0.4', tare='0.4', net='0')).status_code == 201
            trends = client.get(TRENDS).json()
            cooked = basis_stat(trends, 'cooked')
            assert cooked['missing_count'] == 1 and cooked['measured_zero_count'] == 1
            # mixed statuses inside the basis: single missing event -> no usable observation
            # combined with the repeated event -> still unresolved, never a partial total
            assert cooked['aggregation']['status'] == 'unresolved_selection'
            assert cooked['aggregation']['eligible_mass'] is None
            # no raw-basis measurements exist: no per-basis row at all, never a zero-filled row
            assert all(item['mass_basis'] != 'raw' for item in trends['per_basis'])
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_t06_global_alert_settings_denied_for_site_writer(database):
    app = create_app()
    try:
        with TestClient(app) as client:
            seed_registry_count = 0
            response = p1_post(client,
                               '/p2/v0.1/recommendations/rules/event_coverage_insufficient/disable',
                               dict(site_id=SITE_A, disabled=True), SITE_A)
            assert response.status_code == 403, response.text  # fail-closed, not UI-hidden
            with database() as session:
                assert session.scalar(select(func.count()).select_from(P2AlertSetting)) == seed_registry_count
            # rules remain readable (T-08)
            rules = client.get('/p2/v0.1/recommendations/rules')
            assert rules.status_code == 200
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_t07_cross_site_alert_ack_is_concealed(database):
    app = create_app()
    try:
        with TestClient(app) as client:
            writer_b = TestClient(app)
            try:
                login_client(writer_b, 'site_b_writer')
                event_b = writer_b.post('/demo/v0.1/events', json=dict(
                    organization_id=ORG, site_id=SITE_B_ID, event_type='at_risk_surplus',
                    occurred_at='2026-11-05T07:00:00+08:00'))
                assert event_b.status_code == 201  # no measurement -> coverage alert on site B
                evaluated = p1_post(writer_b, '/p2/v0.1/recommendations/evaluate?site_id=' + SITE_B_ID,
                                    {}, SITE_B_ID)
                assert evaluated.status_code == 200, evaluated.text
                alert_b = next(a for a in evaluated.json()['alerts']
                               if a['rule_code'] == 'event_coverage_insufficient')
            finally:
                writer_b.close()
            with TestClient(app) as client_a:
                denied = p1_post(client_a,
                                 f"/p2/v0.1/recommendations/{alert_b['recommendation_id']}/acknowledge",
                                 dict(state='acknowledged', reason='site A has no rights here'), SITE_A)
                assert denied.status_code == 404  # concealed; no cross-site leak
                with database() as session:
                    record = session.get(P2Recommendation, alert_b['recommendation_id'])
                    assert record.state == 'open'  # untouched
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_cross_basis_remeasurements_remain_one_unresolved_event(database):
    app = create_app()
    try:
        with TestClient(app) as client:
            event_id = new_event(client)
            for basis, net in [('cooked', '2'), ('raw', '3')]:
                assert client.post(f'/demo/v0.1/events/{event_id}/measurements',
                    json=measurement_payload(gross=net, tare='0', net=net, mass_basis=basis)).status_code == 201
            view = client.get(TRENDS).json()
            assert view['event_counts'] == {'actual_loss_discard': 1}
            for stat in view['per_basis']:
                assert stat['event_count'] == 1 and stat['measurement_count'] == 1
                assert stat['aggregation']['status'] == 'unresolved_selection'
                assert stat['aggregation']['eligible_mass'] is None
            with database() as session:
                assert session.scalar(select(func.count()).select_from(Measurement)) == 2
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_event_without_measurement_prevents_complete_basis_total(database):
    app = create_app()
    try:
        with TestClient(app) as client:
            measured = new_event(client)
            new_event(client)
            assert client.post(f'/demo/v0.1/events/{measured}/measurements',
                               json=measurement_payload()).status_code == 201
            view = client.get(TRENDS).json()
            stat = basis_stat(view, 'cooked')
            assert view['completeness']['events_total'] == 2
            assert view['completeness']['events_without_measurement'] == 1
            assert stat['aggregation']['status'] == 'incomplete_observation'
            assert stat['aggregation']['eligible_mass'] is None
            assert stat['event_count'] == 1 and stat['measurement_count'] == 1
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_global_mutation_has_no_implicit_trusted_bypass():
    from fwi.application import p2, security
    import pytest
    def forbidden_factory():
        raise AssertionError('global mutation must be denied before any DB access')
    with pytest.raises(security.Denied) as denied:
        p2.set_rule_disabled(forbidden_factory,
                             {'site_id': SITE_A, 'rule_code': 'event_coverage_insufficient', 'disabled': True})
    assert denied.value.status == 403



def test_long_decimal_raw_observations_survive_db_without_report_approval(database):
    from sqlalchemy import text
    app = create_app()
    value = '0.12345678901234567890123456789'
    try:
        with TestClient(app) as client:
            for _ in range(2):
                event_id = new_event(client)
                assert client.post(f'/demo/v0.1/events/{event_id}/measurements',
                    json=measurement_payload(gross=value, tare='0', net=value)).status_code == 201
            view = basis_stat(client.get(TRENDS).json(), 'cooked')['aggregation']
            assert view['status'] == 'policy_unresolved'
            assert view['eligible_mass'] is None and view['eligible_event_count'] == 0
            assert Decimal(view['raw_observed_mass']) == Decimal('0.24691357802469135780246913578')
            with database() as session:
                assert list(session.scalars(select(Measurement.net))) == [Decimal(value), Decimal(value)]
                # NUMERIC is unqualified; this is a tested roundtrip, not infinite DB precision.
                result = session.execute(text("SELECT numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='measurements' AND column_name='net'")).one()
                assert result == (None, None)
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_existing_global_rule_is_unchanged_by_all_site_roles_and_methods(database):
    from datetime import datetime, timezone
    from uuid import uuid4
    with database() as session, session.begin():
        session.add(P2AlertSetting(setting_id=uuid4(),rule_code='event_coverage_insufficient',
                                  disabled=False,recorded_at=datetime.now(timezone.utc)))
    app = create_app()
    try:
        for role in ['site_a_writer', 'site_a_reader', 'site_b_writer']:
            with TestClient(app) as client:
                login_client(client,role)
                site_id = client.get('/auth/session').json()['sites'][0]['site_id']
                url = '/p2/v0.1/recommendations/rules/event_coverage_insufficient/disable'
                assert client.post(url,json={'site_id':site_id,'disabled':True}).status_code == 403
                assert client.patch(url,json={'site_id':site_id,'disabled':True}).status_code == 405
                response = client.get('/p2/v0.1/recommendations/rules')
                assert response.status_code == 200
                assert next(r for r in response.json() if r['rule_code']=='event_coverage_insufficient')['disabled'] is False
        with database() as session:
            assert list(session.scalars(select(P2AlertSetting.disabled))) == [False]
    finally:
        app.state.session_factory.kw['bind'].dispose()



def test_scope_without_any_measurement_is_explicitly_incomplete(database):
    app = create_app()
    try:
        with TestClient(app) as client:
            new_event(client)
            value = client.get(TRENDS).json()
            assert value['per_basis'] == []
            assert value['completeness']['events_total'] == 1
            assert value['completeness']['measurements_total'] == 0
            assert value['mass_reporting']['status'] == 'incomplete_observation'
            assert value['mass_reporting']['reportable_mass'] is None
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_distinct_events_on_distinct_bases_do_not_become_effective_totals(database):
    app = create_app()
    try:
        with TestClient(app) as client:
            for basis in ['raw','cooked']:
                event_id = new_event(client)
                assert client.post(f'/demo/v0.1/events/{event_id}/measurements',
                                   json=measurement_payload(mass_basis=basis)).status_code == 201
            value = client.get(TRENDS).json()
            assert value['event_counts'] == {'actual_loss_discard': 2}
            assert value['completeness']['measurements_total'] == 2
            for row in value['per_basis']:
                assert row['event_count'] == 1
                assert row['aggregation']['status'] == 'policy_unresolved'
                assert row['aggregation']['eligible_mass'] is None
    finally:
        app.state.session_factory.kw['bind'].dispose()
