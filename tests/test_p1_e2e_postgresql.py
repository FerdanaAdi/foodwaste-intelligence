"""WP-25 cross-feature end-to-end candidate suite (E2E-EXT-01 analog, synthetic only).

Two sites, two writers: receipt -> lot -> movements -> recipe/batch (yield) ->
delivery -> receiving (other site) -> meal service -> waste event -> two
measurements -> dispositions with the safety gate -> flow links -> lineage ->
trends -> KPI catalogue/preview -> recommendations. Asserts at each stage that
no operation, transfer, link or disposition ever adds a waste generation event.
"""

from decimal import Decimal

from sqlalchemy import func, select

from auth_support import TestClient, login_client
from p1_support import p1_post
from test_demo_postgresql import database  # noqa: F401  (shared isolated schema fixture)
from test_demo_validation import measurement_payload

from fwi.api.app import create_app
from fwi.infrastructure.database.demo_seed import ORGANIZATION_ID, SITE_ID
from fwi.infrastructure.database.models import WasteEvent
from fwi.infrastructure.database.p2_seed import seed_kpi_registry
from fwi.infrastructure.database.security_seed import SITE_B

ORG = str(ORGANIZATION_ID)
SITE_A = str(SITE_ID)
SITE_B_ID = str(SITE_B)
AT = '2026-11-05T07:30:00+08:00'


def waste_event_count(factory):
    with factory() as session:
        return session.scalar(select(func.count()).select_from(WasteEvent))


def test_e2e_lineage_from_receipt_to_recommendations(database):
    seed_kpi_registry(database)
    app = create_app()
    try:
        with TestClient(app) as client:
            # FR-101: receiving and lot identity
            receipt = p1_post(client, '/p1/v0.1/receipts', dict(
                organization_id=ORG, site_id=SITE_A, source_ref='RCV-E2E-1', received_at=AT,
                note='e2e synthetic'), SITE_A)
            assert receipt.status_code == 201, receipt.text
            lot = p1_post(client, f"/p1/v0.1/receipts/{receipt.json()['receipt_id']}/lots", dict(
                lot_ref='LOT-E2E-1', item_code='ITEM-SYN-VEG', item_version='v1', quantity='100.00',
                original_unit='kg', mass_basis='raw'), SITE_A)
            assert lot.status_code == 201
            lot_id = lot.json()['lot_id']
            assert waste_event_count(database) == 0
            # FR-101: movements mutate provisional stock only
            assert p1_post(client, f'/p1/v0.1/lots/{lot_id}/movements', dict(
                movement_type='issue_to_batch', direction='out', quantity='80.00',
                target_ref='BATCH-E2E-1', occurred_at=AT), SITE_A).status_code == 201
            # FR-102: menu, recipe version, batch, io, yield
            menu = p1_post(client, '/p1/v0.1/menus', dict(
                organization_id=ORG, site_id=SITE_A, menu_code='MENU-E2E-1', name='E2E Menu'), SITE_A)
            recipe = p1_post(client, '/p1/v0.1/recipes', dict(
                organization_id=ORG, site_id=SITE_A, recipe_code='RECIPE-E2E-1', version_no=1,
                menu_id=menu.json()['menu_id'],
                lines=[dict(item_code='ITEM-SYN-VEG', quantity='80.00', original_unit='kg',
                            mass_basis='raw')]), SITE_A)
            assert recipe.status_code == 201
            batch = p1_post(client, '/p1/v0.1/batches', dict(
                organization_id=ORG, site_id=SITE_A, recipe_id=recipe.json()['recipe_id'],
                operation_date='2026-11-05', planned_output=None, original_unit='kg',
                mass_basis='raw'), SITE_A)
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
            yield_view = client.get(f'/p1/v0.1/batches/{batch_id}').json()['yield_view']
            assert yield_view['status'] == 'computed'
            assert Decimal(yield_view['value']) == Decimal('76.00') / Decimal('80.00')
            assert Decimal(yield_view['rework_total']) == Decimal('2.00')  # not in the numerator
            assert waste_event_count(database) == 0
            # FR-103: delivery to site B, receiving recorded by site B (95 != 100)
            delivery = p1_post(client, '/p1/v0.1/deliveries', dict(
                organization_id=ORG, site_id=SITE_A, run_id=None, from_site_id=SITE_A,
                to_site_id=SITE_B_ID, dispatch_quantity='100.00', original_unit='kg',
                mass_basis='as_served', dispatched_at='2026-11-05T06:00:00+08:00'), SITE_A)
            delivery_id = delivery.json()['delivery_id']
            receiver = TestClient(app)
            try:
                login_client(receiver, 'site_b_writer')
                assert p1_post(receiver, f'/p1/v0.1/deliveries/{delivery_id}/receiving', dict(
                    received_quantity='95.00', received_at='2026-11-05T09:00:00+08:00'),
                    SITE_B_ID).status_code == 201
                assert p1_post(receiver, '/p1/v0.1/services', dict(
                    organization_id=ORG, site_id=SITE_B_ID, delivery_id=delivery_id,
                    served_count=190, served_mass=None, mass_basis=None, leftover_event_id=None,
                    sampling_frame=None, sample_size=5, sampling_method='visual_tray',
                    coverage=None), SITE_B_ID).status_code == 201
            finally:
                receiver.close()
            assert waste_event_count(database) == 0  # the 5-unit difference is not an event
            # P0 core: one waste event with two repeated measurements (never summed)
            event = client.post('/demo/v0.1/events', json=dict(
                organization_id=ORG, site_id=SITE_A, event_type='actual_loss_discard',
                occurred_at='2026-11-05T07:00:00+08:00'))
            event_id = event.json()['event_id']
            assert client.post(f'/demo/v0.1/events/{event_id}/measurements',
                               json=measurement_payload()).status_code == 201
            assert client.post(f'/demo/v0.1/events/{event_id}/measurements',
                               json=measurement_payload(gross='3.4', net='3')).status_code == 201
            assert waste_event_count(database) == 1
            # FR-105: dispositions of the same single event, with the rescue gate
            assert p1_post(client, '/p1/v0.1/dispositions', dict(
                organization_id=ORG, site_id=SITE_A, event_id=event_id, outcome_type='compost',
                quantity='1.00', original_unit='kg', mass_basis='cooked', occurred_at=AT,
                food_safety_status='not_assessed', handover_ref=None), SITE_A,
                event_id=event_id).status_code == 201
            assert p1_post(client, '/p1/v0.1/dispositions', dict(
                organization_id=ORG, site_id=SITE_A, event_id=event_id,
                outcome_type='redistribution_handover', quantity='0.50', original_unit='kg',
                mass_basis='cooked', occurred_at=AT, food_safety_status='assessed_safe',
                handover_ref='SYN-HANDOVER-1'), SITE_A, event_id=event_id).status_code == 201
            assert p1_post(client, '/p1/v0.1/dispositions', dict(
                organization_id=ORG, site_id=SITE_A, event_id=event_id,
                outcome_type='animal_feed', quantity='0.50', original_unit='kg', mass_basis='cooked',
                occurred_at=AT, food_safety_status='not_assessed', handover_ref=None), SITE_A,
                event_id=event_id).status_code == 422  # gate stays closed
            assert waste_event_count(database) == 1
            # FR-104: two transfer links from the same event count one distinct event
            for _ in range(2):
                assert p1_post(client, '/p1/v0.1/links', dict(
                    source_type='waste_event', source_id=event_id, target_type='lot',
                    target_id=lot_id, relation_code='transfer_of', quantity='1.00',
                    original_unit='kg', mass_basis='raw', occurred_at=AT, note=None),
                    SITE_A).status_code == 201
            lineage = client.get(f'/p1/v0.1/lineage/lot/{lot_id}').json()
            assert lineage['distinct_source_event_count'] == 1
            # FR-106: descriptive trends, blocked mixed ratio
            trends = client.get('/p1/v0.1/trends?site_id=' + SITE_A +
                                '&date_from=2026-11-04&date_to=2026-11-06').json()
            assert trends['mixed_basis_ratio']['status'] == 'blocked'
            assert Decimal(trends['delivery_residuals'][0]['difference']) == Decimal('5')
            # P2 FR-201/202: catalogue + value-free previews
            catalogue = client.get('/p2/v0.1/kpi').json()
            held = {entry['kpi_code'] for entry in catalogue if entry['design_status'] == 'held'}
            assert held == {'OP-08', 'FI-02', 'NI-03'}
            for code in held:
                preview = client.get(f'/p2/v0.1/kpi/{code}/preview').json()
                assert preview['status'] == 'held_blocked' and 'value' not in preview
            # P2 FR-204: structural recommendations across the whole chain
            alerts = p1_post(client, '/p2/v0.1/recommendations/evaluate?site_id=' + SITE_A, {}, SITE_A).json()
            codes = {a['rule_code'] for a in alerts['alerts']}
            # the E2E event has usable measurements, so only the delivery gap alerts
            assert codes == {'delivery_reconciliation_review'}
            assert waste_event_count(database) == 1  # exactly one generation event end to end
    finally:
        app.state.session_factory.kw['bind'].dispose()
