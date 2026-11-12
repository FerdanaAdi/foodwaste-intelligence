"""Synthetic FR-008 / AC-11 / AC-15 serialization tests; no database IO."""
import csv
from copy import deepcopy
from datetime import date, datetime, timezone
from decimal import Decimal, localcontext
import hashlib
import io
import json
from uuid import UUID

import pytest

from fwi.application.export_csv import (EVENT_COLUMNS, MEASUREMENT_COLUMNS,
                                        NULL_TOKEN, serialize_export)

ORG, SITE_A, SITE_B, EVENT, MEASUREMENT = (UUID(int=i) for i in (1, 2, 3, 10, 100))
NOW = datetime(2026, 11, 8, 12, tzinfo=timezone.utc)
LONG = '0.123456789012345678901234567890123456789000'


def event(**changes):
    return dict(event_id=EVENT, organization_id=ORG, site_id=SITE_A,
                event_type='at_risk_surplus', occurred_at='2026-11-07T23:50:01.123456+08:00',
                recorded_at='2026-11-08T00:10:02.654321+08:00', **changes)


def measurement(**changes):
    row = dict(measurement_id=MEASUREMENT, event_id=EVENT,
               measured_at='2026-11-08T00:01:01.000001+08:00',
               recorded_at='2026-11-08T00:11:02.000002+08:00',
               gross='2.400', tare='0.400', net='2.000', original_unit='kg',
               mass_basis='cooked', measurement_method='synthetic_scale',
               observation_status='observed', provenance='fixture sintetis')
    row.update(changes)
    return row


def export(events=None, measurements=(), sites=(SITE_A,)):
    return serialize_export([event()] if events is None else events, measurements,
                            allowed_site_ids=sites, generated_at=NOW)


def rows(payload):
    return list(csv.DictReader(io.StringIO(payload.decode('utf-8-sig'), newline='')))


def metadata(bundle):
    return json.loads(bundle.metadata_json)


def restore(bundle, filename, row):
    meta = metadata(bundle)
    identifier = row[meta['files'][filename]['columns'][0]]
    changed = {c['column'] for c in meta['escaped_cells'] if c['file'] == filename and c['record_id'] == identifier}
    return {k: v[1:] if k in changed else None if v == NULL_TOKEN else v for k, v in row.items()}


def test_empty_export_has_headers_and_metadata_not_a_fabricated_measurement():
    bundle = export(events=[])
    assert rows(bundle.events_csv) == rows(bundle.measurements_csv) == []
    assert list(csv.reader(io.StringIO(bundle.events_csv.decode('utf-8-sig'))))[0] == list(EVENT_COLUMNS)
    assert list(csv.reader(io.StringIO(bundle.measurements_csv.decode('utf-8-sig'))))[0] == list(MEASUREMENT_COLUMNS)
    assert metadata(bundle)['counts'] == {'events': 0, 'measurements': 0}


def test_event_without_measurement_stays_one_event_and_no_zero_mass_row():
    bundle = export()
    assert len(rows(bundle.events_csv)) == 1
    assert rows(bundle.measurements_csv) == []
    row = rows(bundle.events_csv)[0]
    assert row['operation_date'] == NULL_TOKEN
    # demo_0002 persists operation_date/stage_code and measurement lexemes (WP-01).
    assert metadata(bundle)['source_only_fields']['events.operation_date'] == {
        'provided': 0, 'baseline_persistence_support': True}
    assert metadata(bundle)['source_only_fields']['measurements.original_value_lexeme'] == {
        'provided': 0, 'baseline_persistence_support': True}


def test_repeated_measurements_keep_two_identities_without_multiplying_event_rows():
    second = measurement(measurement_id=UUID(int=101), observation_status='estimated',
                         measurement_method='synthetic_estimate')
    bundle = export(measurements=[measurement(), second])
    records = rows(bundle.measurements_csv)
    assert [r['event_id'] for r in records] == [str(EVENT), str(EVENT)]
    assert [r['measurement_id'] for r in records] == [str(MEASUREMENT), str(UUID(int=101))]
    assert [r['net'] for r in records] == ['2.000', '2.000']
    assert len(rows(bundle.events_csv)) == 1
    assert metadata(bundle)['counts'] == {'events': 1, 'measurements': 2}
    assert not any('total' in key for key in metadata(bundle))


def test_different_operation_event_measurement_and_recording_times_are_not_inferred():
    source = event(operation_date=date(2026, 11, 1))
    bundle = export(events=[source], measurements=[measurement()])
    e, m = rows(bundle.events_csv)[0], rows(bundle.measurements_csv)[0]
    assert e['operation_date'] == '2026-11-01'
    assert e['occurred_at'] == source['occurred_at']
    assert e['recorded_at'] == source['recorded_at']
    assert m['measured_at'] == measurement()['measured_at']
    assert m['recorded_at'] == measurement()['recorded_at']
    assert e['recorded_at'] != m['recorded_at']


def test_scope_rejects_any_foreign_event_instead_of_silently_filtering():
    foreign = {**event(), 'event_id': UUID(int=11), 'site_id': SITE_B}
    with pytest.raises(ValueError, match='outside caller site scope'):
        export(events=[event(), foreign])
    bundle = export(events=[foreign, event()], sites=(SITE_A, SITE_B),
                    measurements=[measurement(event_id=foreign['event_id'])])
    assert {r['site_id'] for r in rows(bundle.events_csv)} == {str(SITE_A), str(SITE_B)}
    assert rows(bundle.measurements_csv)[0]['site_id'] == str(SITE_B)
    assert metadata(bundle)['authorization_enforced'] is False


@pytest.mark.parametrize('scope', [(), ('invalid-site',), str(SITE_A)])
def test_scope_must_be_explicit_valid_and_nonempty(scope):
    with pytest.raises(ValueError):
        export(sites=scope)


@pytest.mark.parametrize('changes', [dict(event_id=UUID(int=999)), dict(site_id=SITE_B)])
def test_orphan_or_forged_measurement_site_rejected(changes):
    with pytest.raises(ValueError):
        export(measurements=[measurement(**changes)])


@pytest.mark.parametrize('kind', ['event', 'measurement'])
def test_duplicate_source_ids_rejected_not_silently_repeated_or_deduplicated(kind):
    with pytest.raises(ValueError, match='duplicate'):
        export(events=[event(), event()] if kind == 'event' else None,
               measurements=[measurement(), measurement()] if kind == 'measurement' else [])


@pytest.mark.parametrize('as_decimal', [False, True])
def test_long_decimal_and_trailing_zeros_survive_low_decimal_context(as_decimal):
    value = Decimal(LONG) if as_decimal else LONG
    with localcontext() as context:
        context.prec = 4
        bundle = export(measurements=[measurement(gross=value, tare='0', net=value)])
    assert rows(bundle.measurements_csv)[0]['gross'] == LONG
    assert rows(bundle.measurements_csv)[0]['net'] == LONG


@pytest.mark.parametrize('status', ['missing', 'not_measured'])
def test_missing_is_explicit_null_not_measured_zero(status):
    absent = measurement(gross=None, tare=None, net=None, observation_status=status)
    zero = measurement(measurement_id=UUID(int=101), gross='0.40', tare='0.40', net='0', observation_status='measured_zero')
    bundle = export(measurements=[absent, zero])
    missing, measured = rows(bundle.measurements_csv)
    assert [missing[k] for k in ('gross', 'tare', 'net')] == [NULL_TOKEN] * 3
    assert measured['net'] == '0' and measured['gross'] == measured['tare'] == '0.40'
    assert missing['observation_status'] == status
    assert measured['observation_status'] == 'measured_zero'
    assert missing['validation_status'] == measured['validation_status'] == NULL_TOKEN


def test_explicit_source_validation_status_is_preserved_without_selecting_measurement():
    bundle = export(measurements=[measurement(validation_status='source-provisional-status')])
    assert rows(bundle.measurements_csv)[0]['validation_status'] == 'source-provisional-status'
    assert metadata(bundle)['source_only_fields']['measurements.validation_status']['provided'] == 1


def test_mixed_mass_bases_remain_labelled_and_separate_without_conversion_or_total():
    bases = ('raw', 'after_preparation', 'cooked', 'ready_to_eat', 'as_served', 'other_documented')
    bundle = export(measurements=[measurement(measurement_id=UUID(int=100+i), mass_basis=b) for i, b in enumerate(bases)])
    records = rows(bundle.measurements_csv)
    assert [r['mass_basis'] for r in records] == list(bases)
    assert [r['net'] for r in records] == ['2.000'] * 6
    assert len(rows(bundle.events_csv)) == 1


@pytest.mark.parametrize('dangerous', ['=1+1', '+1', '-1', '@SUM(1)', '\ttext', '\rtext', '\ntext',
    '  =1', '\u200b=1', '\x01=1', '\uff1d1+1', '\uff0b1', '\uff0d1', '\uff20SUM(1)'])
def test_dangerous_text_is_quoted_prefixed_and_recoverable(dangerous):
    bundle = export(measurements=[measurement(provenance=dangerous)])
    row = rows(bundle.measurements_csv)[0]
    assert row['provenance'] == "'" + dangerous
    assert restore(bundle, 'measurements.csv', row)['provenance'] == dangerous
    assert bundle.measurements_csv.startswith(b'\xef\xbb\xbf"measurement_id"')


def test_quoting_unicode_delimiters_newlines_and_literal_null_marker_round_trip():
    text = 'Nasi \U0001f35a, "sintetis";\r\n=not a new cell'
    bundle = export(measurements=[measurement(provenance=text, measurement_method=NULL_TOKEN),
        measurement(measurement_id=UUID(int=101), provenance="'already text")])
    records = rows(bundle.measurements_csv)
    assert len(records) == 2
    restored = restore(bundle, 'measurements.csv', records[0])
    assert restored['provenance'] == text and restored['measurement_method'] == NULL_TOKEN
    assert records[1]['provenance'] == "'already text"
    assert b'""sintetis""' in bundle.measurements_csv


@pytest.mark.parametrize('value', [0.1, True, 'NaN', 'Infinity', '-1', Decimal('-Infinity')])
def test_invalid_mass_not_silently_converted_or_zeroed(value):
    with pytest.raises(ValueError):
        export(measurements=[measurement(gross=value)])


@pytest.mark.parametrize('changes', [dict(gross='0.1'), dict(net='3'), dict(original_unit='g'),
    dict(mass_basis='plate_leftover'), dict(observation_status='missing'), dict(observation_status='measured_zero')])
def test_existing_demo_mass_contract_still_enforced(changes):
    with pytest.raises(ValueError):
        export(measurements=[measurement(**changes)])


@pytest.mark.parametrize('field', ['occurred_at', 'recorded_at'])
def test_naive_event_timestamp_rejected(field):
    source = {**event(), field: '2026-11-08T00:01:00'}
    with pytest.raises(ValueError, match='timezone'):
        export(events=[source])


@pytest.mark.parametrize('field', ['measured_at', 'recorded_at'])
def test_naive_measurement_timestamp_rejected(field):
    with pytest.raises(ValueError, match='timezone'):
        export(measurements=[measurement(**{field: datetime(2026, 11, 8)})])


@pytest.mark.parametrize('changes', [dict(precision='invented'), dict(provenance='\0'), dict(provenance='\ud800')])
def test_unknown_or_unencodable_fields_rejected(changes):
    with pytest.raises(ValueError):
        export(measurements=[measurement(**changes)])


def test_deterministic_bundle_preserves_inputs_and_hashes():
    original = [measurement(measurement_id=UUID(int=101)), measurement()]
    saved = deepcopy(original)
    a = export(measurements=iter(original)); b = export(measurements=reversed(original))
    assert a == b and original == saved
    for name, payload in [('events.csv', a.events_csv), ('measurements.csv', a.measurements_csv)]:
        assert metadata(a)['files'][name]['sha256'] == hashlib.sha256(payload).hexdigest()
    assert metadata(a)['held_kpis'] == ['OP-08', 'FI-02', 'NI-03']


def test_existing_api_output_snapshots_are_supported_without_a_database_or_new_api():
    from fwi.api.schemas_demo import EventOutput, MeasurementOutput
    e = EventOutput(**event()).model_dump()
    m = MeasurementOutput(**measurement()).model_dump()
    bundle = export(events=[e], measurements=[m])
    assert rows(bundle.events_csv)[0]['event_id'] == str(EVENT)
    assert rows(bundle.measurements_csv)[0]['net'] == '2.000'
    assert rows(bundle.events_csv)[0]['operation_date'] == NULL_TOKEN


def test_both_csvs_carry_explicit_synthetic_export_labels():
    bundle = export(measurements=[measurement()])
    assert rows(bundle.events_csv)[0]['export_label'] == 'SYNTHETIC/DEMO'
    assert rows(bundle.measurements_csv)[0]['export_label'] == 'SYNTHETIC/DEMO'
    assert metadata(bundle)['synthetic_only'] is True
