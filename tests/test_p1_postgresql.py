"""Real PostgreSQL 18 tests for the provisional P1 candidate (FR-101..106).

Reuses the isolated per-test schema fixture from test_demo_postgresql; no
SQLite substitute. Every P1 acceptance scenario asserts the demo-core event
counts are untouched by operations, movements, links, deliveries and
dispositions.
"""

from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from auth_support import TestClient, login_client
from p1_support import p1_post
from test_demo_postgresql import database  # noqa: F401  (shared isolated schema fixture)
from test_demo_validation import measurement_payload

from fwi.api.app import create_app
from fwi.infrastructure.database.demo_seed import ORGANIZATION_ID, SITE_ID
from fwi.infrastructure.database.models import WasteEvent
from fwi.infrastructure.database.models_p1 import P1Disposition, P1Receipt
from fwi.infrastructure.database.security_seed import SITE_B

ORG = str(ORGANIZATION_ID)
SITE_A = str(SITE_ID)
SITE_B_ID = str(SITE_B)
AT = '2026-11-05T07:30:00+08:00'


def receipt_payload(site_id=SITE_A, source_ref='RCV-SYN-101'):
    return dict(organization_id=ORG, site_id=site_id, source_ref=source_ref,
                received_at=AT, note='synthetic receiving')


def lot_payload(lot_ref='LOT-SYN-1'):
    return dict(lot_ref=lot_ref, item_code='ITEM-SYN-VEG', item_version='v1',
                quantity='100.00', original_unit='kg', mass_basis='raw')


def movement_payload(direction='out', quantity='80.00', kind='issue_to_batch'):
    return dict(movement_type=kind, direction=direction, quantity=quantity,
                target_ref='BATCH-SYN-1', occurred_at='2026-11-05T08:00:00+08:00')


def waste_event_count(factory):
    with factory() as session:
        return session.scalar(select(func.count()).select_from(WasteEvent))


def test_duplicate_receipt_and_lot_identity_are_rejected(database):  # P1-AC-01
    app = create_app()
    try:
        with TestClient(app) as client:
            first = p1_post(client, '/p1/v0.1/receipts', receipt_payload(), SITE_A)
            assert first.status_code == 201, first.text
            receipt_id = first.json()['receipt_id']
            duplicate = p1_post(client, '/p1/v0.1/receipts', receipt_payload(), SITE_A)
            assert duplicate.status_code == 409
            lot = p1_post(client, f'/p1/v0.1/receipts/{receipt_id}/lots', lot_payload(), SITE_A)
            assert lot.status_code == 201, lot.text
            duplicate_lot = p1_post(client, f'/p1/v0.1/receipts/{receipt_id}/lots', lot_payload(), SITE_A)
            assert duplicate_lot.status_code == 409
            with database() as session:
                assert session.scalar(select(func.count()).select_from(P1Receipt)) == 1
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_intent_replay_is_rejected(database):
    app = create_app()
    try:
        with TestClient(app) as client:
            from p1_support import register_p1_intent
            intent_id = register_p1_intent(client, SITE_A)
            first = client.post('/p1/v0.1/receipts', json=receipt_payload(),
                                headers={'X-FWI-Intent': intent_id})
            assert first.status_code == 201
            replay = client.post('/p1/v0.1/receipts', json=receipt_payload(source_ref='RCV-SYN-102'),
                                 headers={'X-FWI-Intent': intent_id})
            assert replay.status_code == 409
            with database() as session:
                assert session.scalar(select(func.count()).select_from(P1Receipt)) == 1
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_movements_never_create_events_and_cross_site_is_denied(database):  # P1-AC-02
    app = create_app()
    try:
        with TestClient(app) as client:
            receipt = p1_post(client, '/p1/v0.1/receipts', receipt_payload(), SITE_A)
            lot = p1_post(client, f"/p1/v0.1/receipts/{receipt.json()['receipt_id']}/lots",
                          lot_payload(), SITE_A)
            lot_id = lot.json()['lot_id']
            before = waste_event_count(database)
            assert p1_post(client, f'/p1/v0.1/lots/{lot_id}/movements',
                           movement_payload(), SITE_A).status_code == 201
            assert p1_post(client, f'/p1/v0.1/lots/{lot_id}/movements',
                           movement_payload(quantity='5.00', kind='stock_correction'),
                           SITE_A).status_code == 201
            assert waste_event_count(database) == before
            stock = client.get(f'/p1/v0.1/lots/{lot_id}').json()
            assert Decimal(stock['observed_stock']) == Decimal('15.00')  # 100 − 80 − 5
            assert 'EXT-OD-05' in stock['stock_note']
        other = TestClient(app)
        try:
            login_client(other, 'site_b_writer')
            denied = p1_post(other, f'/p1/v0.1/lots/{lot_id}/movements', movement_payload(), SITE_B_ID)
            assert denied.status_code == 404  # concealed: other-site objects do not leak
            assert waste_event_count(database) == before
        finally:
            other.close()
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_recipe_versions_batches_and_yield_gate(database):  # P1-AC-03/04
    app = create_app()
    try:
        with TestClient(app) as client:
            receipt = p1_post(client, '/p1/v0.1/receipts', receipt_payload(), SITE_A)
            lot_id = p1_post(client, f"/p1/v0.1/receipts/{receipt.json()['receipt_id']}/lots",
                             lot_payload(), SITE_A).json()['lot_id']
            menu = p1_post(client, '/p1/v0.1/menus',
                           dict(organization_id=ORG, site_id=SITE_A, menu_code='MENU-SYN-1',
                                name='Synthetic Menu'), SITE_A)
            assert menu.status_code == 201
            recipe = p1_post(client, '/p1/v0.1/recipes', dict(
                organization_id=ORG, site_id=SITE_A, recipe_code='RECIPE-SYN-1', version_no=1,
                menu_id=menu.json()['menu_id'],
                lines=[dict(item_code='ITEM-SYN-VEG', quantity='80.00', original_unit='kg',
                            mass_basis='raw')]), SITE_A)
            assert recipe.status_code == 201, recipe.text
            recipe_id = recipe.json()['recipe_id']
            # A second version never rewrites the first: both rows remain readable.
            assert p1_post(client, '/p1/v0.1/recipes', dict(
                organization_id=ORG, site_id=SITE_A, recipe_code='RECIPE-SYN-1', version_no=2,
                menu_id=None, lines=[dict(item_code='ITEM-SYN-VEG', quantity='85.00',
                                          original_unit='kg', mass_basis='raw')]), SITE_A).status_code == 201
            old = client.get(f'/p1/v0.1/recipes/{recipe_id}').json()
            assert old['version_no'] == 1 and old['lines'][0]['quantity'] == '80.00'
            batch = p1_post(client, '/p1/v0.1/batches', dict(
                organization_id=ORG, site_id=SITE_A, recipe_id=recipe_id,
                operation_date='2026-11-05', planned_output='78.00', original_unit='kg',
                mass_basis='raw'), SITE_A)
            assert batch.status_code == 201, batch.text
            batch_id = batch.json()['batch_id']
            assert p1_post(client, f'/p1/v0.1/batches/{batch_id}/io', dict(
                io_kind='input', quantity='80.00', original_unit='kg', mass_basis='raw',
                source_lot_id=lot_id, occurred_at=AT), SITE_A).status_code == 201
            assert p1_post(client, f'/p1/v0.1/batches/{batch_id}/io', dict(
                io_kind='output_primary', quantity='76.00', original_unit='kg', mass_basis='raw',
                occurred_at=AT), SITE_A).status_code == 201
            assert p1_post(client, f'/p1/v0.1/batches/{batch_id}/io', dict(
                io_kind='output_rework', quantity='2.00', original_unit='kg', mass_basis='raw',
                occurred_at=AT), SITE_A).status_code == 201
            view = client.get(f'/p1/v0.1/batches/{batch_id}').json()
            assert view['yield_view']['status'] == 'computed'
            assert Decimal(view['yield_view']['value']) == Decimal('76.00') / Decimal('80.00')
            assert Decimal(view['yield_view']['rework_total']) == Decimal('2.00')
            # Mixed-basis batch blocks its yield instead of inventing a factor.
            batch2 = p1_post(client, '/p1/v0.1/batches', dict(
                organization_id=ORG, site_id=SITE_A, recipe_id=recipe_id,
                operation_date='2026-11-05', planned_output=None, original_unit='kg',
                mass_basis='raw'), SITE_A)
            batch2_id = batch2.json()['batch_id']
            assert p1_post(client, f'/p1/v0.1/batches/{batch2_id}/io', dict(
                io_kind='input', quantity='10.00', original_unit='kg', mass_basis='raw',
                occurred_at=AT), SITE_A).status_code == 201
            assert p1_post(client, f'/p1/v0.1/batches/{batch2_id}/io', dict(
                io_kind='output_primary', quantity='9.00', original_unit='kg', mass_basis='cooked',
                occurred_at=AT), SITE_A).status_code == 201
            blocked = client.get(f'/p1/v0.1/batches/{batch2_id}').json()['yield_view']
            assert blocked['status'] == 'blocked' and blocked['value'] is None
            assert 'DR-11' in blocked['reason']
            assert waste_event_count(database) == 0
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_delivery_mismatch_is_review_not_waste_and_receiving_is_scoped(database):  # P1-AC-05
    app = create_app()
    try:
        with TestClient(app) as client:
            delivery = p1_post(client, '/p1/v0.1/deliveries', dict(
                organization_id=ORG, site_id=SITE_A, run_id=None, from_site_id=SITE_A,
                to_site_id=SITE_B_ID, dispatch_quantity='100.00', original_unit='kg',
                mass_basis='as_served', dispatched_at='2026-11-05T06:00:00+08:00'), SITE_A)
            assert delivery.status_code == 201, delivery.text
            delivery_id = delivery.json()['delivery_id']
            assert delivery.json()['reconciliation_status'] == 'not_received'
            before = waste_event_count(database)
            # Origin writer has no receiving rights on the destination site.
            denied = p1_post(client, f'/p1/v0.1/deliveries/{delivery_id}/receiving',
                             dict(received_quantity='95.00', received_at='2026-11-05T09:00:00+08:00'),
                             SITE_A)
            assert denied.status_code == 404
            assert waste_event_count(database) == before
        receiver = TestClient(app)
        try:
            login_client(receiver, 'site_b_writer')
            received = p1_post(receiver, f'/p1/v0.1/deliveries/{delivery_id}/receiving',
                               dict(received_quantity='95.00', received_at='2026-11-05T09:00:00+08:00'),
                               SITE_B_ID)
            assert received.status_code == 201, received.text
            assert received.json()['reconciliation_status'] == 'needs_review'
            assert receiver.get(f'/p1/v0.1/deliveries/{delivery_id}').status_code == 200
            again = p1_post(receiver, f'/p1/v0.1/deliveries/{delivery_id}/receiving',
                            dict(received_quantity='95.00', received_at='2026-11-05T10:00:00+08:00'),
                            SITE_B_ID)
            assert again.status_code == 422  # corrections need an approved policy
            assert waste_event_count(database) == before  # 5 kg difference is not an auto event
        finally:
            receiver.close()
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_service_sampling_without_frame_has_no_population_estimate(database):  # P1-AC-06
    app = create_app()
    try:
        with TestClient(app) as client:
            unframed = p1_post(client, '/p1/v0.1/services', dict(
                organization_id=ORG, site_id=SITE_A, delivery_id=None, served_count=190,
                served_mass='12.50', original_unit='kg', mass_basis='as_served',
                leftover_event_id=None, sampling_frame=None, sample_size=5,
                sampling_method='visual_tray', coverage='0.30'), SITE_A)
            assert unframed.status_code == 201, unframed.text
            body = unframed.json()
            assert body['sampling_coverage_status'] == 'unframed_sample'
            assert 'population_estimate' not in body
            assert 'EXT-OD-07' in body['estimate_note']
            framed = p1_post(client, '/p1/v0.1/services', dict(
                organization_id=ORG, site_id=SITE_A, served_count=190, served_mass=None,
                mass_basis=None, leftover_event_id=None, sampling_frame='classes_a_c_roster',
                sample_size=5, sampling_method='visual_tray', coverage=None), SITE_A)
            assert framed.json()['sampling_coverage_status'] == 'framed'
            missing_basis = p1_post(client, '/p1/v0.1/services', dict(
                organization_id=ORG, site_id=SITE_A, served_mass='1.00', mass_basis=None), SITE_A)
            assert missing_basis.status_code == 422
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_lineage_counts_distinct_events_and_blocks_bad_links(database):  # P1-AC-07/08
    app = create_app()
    try:
        with TestClient(app) as client:
            event = client.post('/demo/v0.1/events', json=dict(
                organization_id=ORG, site_id=SITE_A, event_type='at_risk_surplus',
                occurred_at='2026-11-05T07:00:00+08:00'))
            assert event.status_code == 201
            event_id = event.json()['event_id']
            receipt = p1_post(client, '/p1/v0.1/receipts', receipt_payload(), SITE_A)
            lot_id = p1_post(client, f"/p1/v0.1/receipts/{receipt.json()['receipt_id']}/lots",
                             lot_payload(), SITE_A).json()['lot_id']
            link_payload = dict(source_type='waste_event', source_id=event_id,
                                target_type='lot', target_id=lot_id,
                                relation_code='transfer_of', quantity='2.00',
                                original_unit='kg', mass_basis='raw', occurred_at=AT, note=None)
            assert p1_post(client, '/p1/v0.1/links', link_payload, SITE_A).status_code == 201
            assert p1_post(client, '/p1/v0.1/links', link_payload, SITE_A).status_code == 201
            lineage = client.get(f'/p1/v0.1/lineage/lot/{lot_id}').json()
            assert len(lineage['links']) == 2
            assert lineage['distinct_source_event_count'] == 1  # two transfers, one event
            self_link = dict(link_payload, source_type='lot', source_id=lot_id,
                             target_type='lot', target_id=lot_id)
            assert p1_post(client, '/p1/v0.1/links', self_link, SITE_A).status_code == 422
            cycle = dict(link_payload, source_type='lot', source_id=lot_id,
                         target_type='waste_event', target_id=event_id, relation_code='derived_from')
            assert p1_post(client, '/p1/v0.1/links', cycle, SITE_A).status_code == 422
            assert waste_event_count(database) == 1  # links never create events
        other = TestClient(app)
        try:
            login_client(other, 'site_b_writer')
            foreign = p1_post(other, '/p1/v0.1/links', link_payload, SITE_B_ID)
            assert foreign.status_code == 403  # source site is not the writer's site
        finally:
            other.close()
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_dispositions_never_duplicate_events_and_rescue_gate(database):  # P1-AC-09/10
    app = create_app()
    try:
        with TestClient(app) as client:
            event = client.post('/demo/v0.1/events', json=dict(
                organization_id=ORG, site_id=SITE_A, event_type='actual_loss_discard',
                occurred_at='2026-11-05T07:00:00+08:00'))
            event_id = event.json()['event_id']
            measurement = client.post(f'/demo/v0.1/events/{event_id}/measurements',
                                      json=measurement_payload())
            assert measurement.status_code == 201  # net 2.0 kg cooked reference
            def disposition_payload(outcome, safety, quantity, basis='cooked'):
                return dict(organization_id=ORG, site_id=SITE_A, event_id=event_id,
                            outcome_type=outcome, quantity=quantity, original_unit='kg',
                            mass_basis=basis, occurred_at=AT, food_safety_status=safety,
                            handover_ref=None)
            first = p1_post(client, '/p1/v0.1/dispositions',
                            disposition_payload('compost', 'not_assessed', '1.00'),
                            SITE_A, event_id=event_id)
            assert first.status_code == 201, first.text
            assert first.json()['allocation_status'] == 'reference_unresolved'
            second = p1_post(client, '/p1/v0.1/dispositions',
                             disposition_payload('processing', 'not_assessed', '1.50'),
                             SITE_A, event_id=event_id)
            assert second.status_code == 201
            assert second.json()['allocation_status'] == 'reference_unresolved'  # no approved selection
            blocked = p1_post(client, '/p1/v0.1/dispositions',
                              disposition_payload('redistribution_handover', 'not_assessed', '0.50'),
                              SITE_A, event_id=event_id)
            assert blocked.status_code == 422 and 'safety gate' in blocked.json()['detail']
            unsafe = p1_post(client, '/p1/v0.1/dispositions',
                             disposition_payload('animal_feed', 'assessed_unsafe', '0.50'),
                             SITE_A, event_id=event_id)
            assert unsafe.status_code == 422
            safe = p1_post(client, '/p1/v0.1/dispositions',
                           disposition_payload('redistribution_handover', 'assessed_safe', '0.50'),
                           SITE_A, event_id=event_id)
            assert safe.status_code == 201
            records = client.get(f'/p1/v0.1/events/{event_id}/dispositions').json()
            assert len(records) == 3  # three recorded fates...
            assert waste_event_count(database) == 1  # ...of the same single event
            with database() as session:
                assert session.scalar(select(func.count()).select_from(P1Disposition)) == 3
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_trends_are_descriptive_with_blocked_mixed_ratio(database):  # P1-AC-11/12
    app = create_app()
    try:
        with TestClient(app) as client:
            event = client.post('/demo/v0.1/events', json=dict(
                organization_id=ORG, site_id=SITE_A, event_type='actual_loss_discard',
                occurred_at='2026-11-05T07:00:00+08:00'))
            event_id = event.json()['event_id']
            assert client.post(f'/demo/v0.1/events/{event_id}/measurements',
                               json=measurement_payload()).status_code == 201
            delivery = p1_post(client, '/p1/v0.1/deliveries', dict(
                organization_id=ORG, site_id=SITE_A, run_id=None, from_site_id=SITE_A,
                to_site_id=SITE_B_ID, dispatch_quantity='100.00', original_unit='kg',
                mass_basis='as_served', dispatched_at='2026-11-05T06:00:00+08:00'), SITE_A)
            delivery_id = delivery.json()['delivery_id']
            receiver = TestClient(app)
            try:
                login_client(receiver, 'site_b_writer')
                assert p1_post(receiver, f'/p1/v0.1/deliveries/{delivery_id}/receiving',
                               dict(received_quantity='95.00',
                                    received_at='2026-11-05T09:00:00+08:00'),
                               SITE_B_ID).status_code == 201
            finally:
                receiver.close()
            view = client.get('/p1/v0.1/trends?site_id=' + SITE_A +
                              '&date_from=2026-11-04&date_to=2026-11-06').json()
            assert view['mixed_basis_ratio']['status'] == 'blocked'
            cooked = next(basis for basis in view['per_basis'] if basis['mass_basis'] == 'cooked')
            assert cooked['event_count'] == 1 and cooked['measurement_count'] == 1
            assert cooked['aggregation']['status'] == 'policy_unresolved'
            assert cooked['aggregation']['eligible_mass'] is None
            assert Decimal(cooked['aggregation']['raw_observed_mass']) == Decimal('2.0')
            assert view['event_counts'] == {'actual_loss_discard': 1}
            assert view['completeness']['events_with_measurement'] == 1
            residual = view['delivery_residuals'][0]
            assert Decimal(residual['difference']) == Decimal('5')
            assert residual['reconciliation_status'] == 'needs_review'
            assert 'waste_total' not in view and 'total_waste' not in view
            assert view['calculation_version'].startswith('p1-trends-provisional')
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_reader_can_read_but_not_write_p1(database):
    app = create_app()
    try:
        with TestClient(app) as client:
            reader = TestClient(app)
            try:
                login_client(reader, 'site_a_reader')
                assert reader.get('/p1/v0.1/receipts?site_id=' + SITE_A).status_code == 200
                # A reader cannot even register a 'p1' write intent; a direct POST
                # without one is refused by the permission check (403), not replayed.
                denied = reader.post('/p1/v0.1/receipts', json=receipt_payload(
                    source_ref='RCV-READER-' + uuid4().hex[:8]))
                assert denied.status_code == 403
            finally:
                reader.close()
    finally:
        app.state.session_factory.kw['bind'].dispose()
