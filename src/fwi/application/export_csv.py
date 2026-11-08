"""PROVISIONAL synthetic export serialization; no IO, query or authorization.

Two related CSVs avoid multiplying event rows by repeated measurements. Input
mappings are explicit snapshots (e.g. model_dump() or application.demo.snapshot).
"""
from collections.abc import Collection, Iterable, Mapping
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
import csv
import hashlib
import io
import json
import unicodedata
from uuid import UUID

from fwi.domain.demo_measurements import validate_demo_measurement

EVENT_COLUMNS = ('event_id', 'organization_id', 'site_id', 'event_type',
                 'operation_date', 'occurred_at', 'recorded_at', 'export_label')
MEASUREMENT_COLUMNS = ('measurement_id', 'event_id', 'site_id', 'measured_at',
                       'recorded_at', 'gross', 'tare', 'net', 'original_unit',
                       'mass_basis', 'measurement_method', 'observation_status',
                       'validation_status', 'provenance', 'export_label')
NULL_TOKEN = r'\N'


@dataclass(frozen=True)
class CsvExport:
    events_csv: bytes
    measurements_csv: bytes
    metadata_json: bytes


def _id(value: object) -> str:
    if not isinstance(value, (str, UUID)):
        raise ValueError('export requires explicit UUID identities and site scope')
    try:
        return str(UUID(str(value)))
    except ValueError:
        raise ValueError('export requires explicit UUID identities and site scope') from None


def _timestamp(value: object) -> str:
    if not isinstance(value, (datetime, str)):
        raise ValueError('export timestamps require explicit timezone offsets')
    try:
        parsed = datetime.fromisoformat(value) if isinstance(value, str) else value
        if parsed.utcoffset() is None:
            raise ValueError
    except ValueError:
        raise ValueError('export timestamps require explicit timezone offsets') from None
    return value if isinstance(value, str) else value.isoformat()


def _text(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError('export text fields must be explicit nonempty strings')
    # NUL and unpaired surrogates have no safe portable UTF-8 CSV representation.
    if '\0' in value or any(unicodedata.category(c) == 'Cs' for c in value):
        raise ValueError('export text contains unsupported characters')
    return value


def _date(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime) or not isinstance(value, (date, str)):
        raise ValueError('operation_date must be a source date, never a derived timestamp')
    try:
        return (date.fromisoformat(value) if isinstance(value, str) else value).isoformat()
    except ValueError:
        raise ValueError('operation_date must be a source date') from None


def _table(name, rows, columns, escaped):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream, quoting=csv.QUOTE_ALL, lineterminator='\r\n')
    writer.writerow(columns)
    for row in rows:
        cells = []
        for column in columns:
            value = row[column]
            if value is None:
                cells.append(NULL_TOKEN)
                continue
            value = str(value)
            # Normalize ONLY for detection, never the serialized source text.
            probe = unicodedata.normalize('NFKC', value)
            probe = ''.join(c for c in probe if unicodedata.category(c) != 'Cf').lstrip()
            dangerous = probe.startswith(('=', '+', '-', '@')) or any(unicodedata.category(c) in {'Cc', 'Cf'} for c in value)
            if dangerous or value == NULL_TOKEN:
                escaped.append({'file': name, 'record_id': row[columns[0]],
                                'column': column, 'prefix': "'"})
                value = "'" + value
            cells.append(value)
        writer.writerow(cells)
    return stream.getvalue().encode('utf-8-sig')


def serialize_export(events: Iterable[Mapping[str, object]],
                     measurements: Iterable[Mapping[str, object]], *,
                     allowed_site_ids: Collection[str | UUID],
                     generated_at: datetime | str) -> CsvExport:
    """Serialize all supplied observations, or reject the entire input.

    Site scope is a caller-provided constraint, NOT authentication/authorization.
    No filtering, summation, latest-selection, mass conversion or inferred dates.
    Extra fields fail closed rather than silently disappearing from an export.
    """
    if isinstance(allowed_site_ids, (str, bytes)):
        raise ValueError('explicit nonempty site collection required')
    scope = frozenset(_id(site) for site in allowed_site_ids)
    if not scope:
        raise ValueError('explicit nonempty site collection required')
    generated = _timestamp(generated_at)
    by_event = {}
    for source in events:
        if set(source) - (set(EVENT_COLUMNS) - {'export_label'}):
            raise ValueError('unsupported event export fields')
        row = {column: source.get(column) for column in EVENT_COLUMNS}
        for key in ('event_id', 'organization_id', 'site_id'):
            row[key] = _id(row[key])
        if row['site_id'] not in scope:
            raise ValueError('export input outside caller site scope')
        if row['event_id'] in by_event:
            raise ValueError('duplicate event identity in export input')
        row['event_type'] = _text(row['event_type'])  # Pass through, no taxonomy mapping.
        row['operation_date'] = _date(row['operation_date'])
        row['occurred_at'] = _timestamp(row['occurred_at'])
        row['recorded_at'] = _timestamp(row['recorded_at'])
        row['export_label'] = 'SYNTHETIC/DEMO'
        by_event[row['event_id']] = row
    by_measurement = {}
    for source in measurements:
        if set(source) - (set(MEASUREMENT_COLUMNS) - {'export_label'}):
            raise ValueError('unsupported measurement export fields')
        row = {column: source.get(column) for column in MEASUREMENT_COLUMNS}
        row['measurement_id'] = _id(row['measurement_id'])
        row['event_id'] = _id(row['event_id'])
        parent = by_event.get(row['event_id'])
        if parent is None:
            raise ValueError('measurement requires an included in-scope event')
        # Baseline measurements inherit their scope via their event FK. If an
        # upstream source supplies a site explicitly, verify it rather than trust it.
        if 'site_id' in source and _id(source['site_id']) != parent['site_id']:
            raise ValueError('measurement site disagrees with its event or caller scope')
        row['site_id'] = parent['site_id']
        if row['measurement_id'] in by_measurement:
            raise ValueError('duplicate measurement identity in export input')
        for key in ('gross', 'tare', 'net'):
            if row[key] is not None and not isinstance(row[key], (str, Decimal)):
                raise ValueError('mass requires original decimal text or Decimal; floats are forbidden')
        for key in ('original_unit', 'mass_basis', 'measurement_method', 'observation_status', 'provenance'):
            row[key] = _text(row[key])
        if row['validation_status'] is not None:
            row['validation_status'] = _text(row['validation_status'])  # No inferred/default status.
        validate_demo_measurement(row)
        for key in ('measured_at', 'recorded_at'):
            row[key] = _timestamp(row[key])
        row['export_label'] = 'SYNTHETIC/DEMO'
        by_measurement[row['measurement_id']] = row
    event_rows = [by_event[key] for key in sorted(by_event)]
    measurement_rows = [by_measurement[key] for key in sorted(by_measurement)]
    escaped = []
    event_csv = _table('events.csv', event_rows, EVENT_COLUMNS, escaped)
    measurement_csv = _table('measurements.csv', measurement_rows, MEASUREMENT_COLUMNS, escaped)
    metadata = {
        'format': 'fwi-synthetic-export-v0.1', 'status': 'PROVISIONAL',
        'synthetic_only': True, 'generated_at': generated,
        'scope_site_ids': sorted(scope), 'authorization_enforced': False,
        'ordering': 'event_id / measurement_id ascending; not reporting priority',
        'counts': {'events': len(event_rows), 'measurements': len(measurement_rows)},
        'row_semantics': 'one row per identity in each file; never sum repeated measurements as generation',
        'csv': {'encoding': 'UTF-8 with BOM', 'delimiter': ',', 'quote_all': True,
                'line_ending': 'CRLF', 'null_token': NULL_TOKEN},
        'source_only_fields': {
            'events.operation_date': {'provided': sum(r['operation_date'] is not None for r in event_rows),
                                      'baseline_persistence_support': False},
            'measurements.validation_status': {'provided': sum(r['validation_status'] is not None for r in measurement_rows),
                                               'baseline_persistence_support': False}},
        'decimal_fidelity': 'input str unchanged; Decimal uses str; database cannot recover original input lexemes',
        'measurement_selection': 'all supplied; no canonical/latest selection or aggregation',
        'spreadsheet_safety': 'apostrophe-prefix dangerous cells; import as text; no universal save/reopen guarantee',
        'escaped_cells': escaped,
        'restore_source_text': 'at escaped_cells coordinates remove one prefix to recover literal text; ONLY unescaped null_token means None',
        'held_kpis': ['OP-08', 'FI-02', 'NI-03'],
        'files': {name: {'columns': list(columns), 'sha256': hashlib.sha256(payload).hexdigest()}
                  for name, columns, payload in (
                      ('events.csv', EVENT_COLUMNS, event_csv),
                      ('measurements.csv', MEASUREMENT_COLUMNS, measurement_csv))},
    }
    return CsvExport(event_csv, measurement_csv,
                     (json.dumps(metadata, sort_keys=True, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
