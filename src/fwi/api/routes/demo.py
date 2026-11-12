"""Authenticated synthetic demo routes; no production exposure authorized."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from fwi.api.schemas_demo import (DataQualityOutput, EventInput, EventOutput, EvidenceInput,
                                  EvidenceOutput, LedgerOutput, MasterHistoryOutput,
                                  MasterNamespaceOutput, MasterReferenceOutput,
                                  MeasurementInput, MeasurementOutput, ReviewHistoryOutput,
                                  ReviewSubmitInput, ReviewSubmitOutput)
from fwi.application import demo
from fwi.application import evidence_store, export_service, master, review_store, security
from fwi.api.routes.auth import authenticated, bind_context

router = APIRouter(prefix='/demo/v0.1', tags=['synthetic demo'], dependencies=[Depends(authenticated)])


def invoke(request, operation, *args):
    factory = request.app.state.session_factory
    if factory is None:
        raise HTTPException(503, 'demo database not configured')
    try:
        with security.protected(factory, request.cookies.get(security.SESSION_COOKIE),
                request.headers.get('x-csrf-token'), write=request.method == 'POST') as access:
            bind_context(request, access)
            return operation(factory, *args, access=access, intent=request.headers.get('x-fwi-intent'))
    except demo.NotFound as exc:
        raise HTTPException(404, 'not found') from exc
    except evidence_store.EvidenceTargetUnresolvable as exc:
        # Foreign/absent targets stay indistinguishable (EVD-002; AC-10).
        raise HTTPException(404, 'evidence reference not found') from exc
    except review_store.ReviewTargetUnresolvable as exc:
        # Same concealment rule for review targets.
        raise HTTPException(404, 'review target not found') from exc
    except IntegrityError as exc:
        raise HTTPException(409, 'demo data conflicts with database constraints') from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except SQLAlchemyError as exc:
        # Do not leak SQL parameters, connection URLs, or credentials.
        raise HTTPException(503, 'demo database operation unavailable') from exc


@router.post('/events', response_model=EventOutput, status_code=201)
def create_event(body: EventInput, request: Request):
    return invoke(request, demo.create_event, body.model_dump())


LEDGER_QUERY_KEYS = frozenset({'site_id', 'event_type', 'stage_code', 'operation_date_from',
                               'operation_date_to', 'page', 'page_size'})


@router.get('/events', response_model=LedgerOutput)
def list_events(request: Request):
    # Unsupported filters are rejected, never silently ignored (PRD US-003-03).
    unknown = set(request.query_params) - LEDGER_QUERY_KEYS
    if unknown:
        raise HTTPException(422, f'unsupported ledger filter(s): {", ".join(sorted(unknown))}')
    raw_site = request.query_params.get('site_id', '')
    try:
        site_id = UUID(raw_site)
    except ValueError as exc:
        raise HTTPException(422, 'site_id must be a UUID') from exc
    return invoke(request, demo.list_events, site_id, dict(request.query_params))


@router.get('/events/{event_id}', response_model=EventOutput)
def read_event(event_id: UUID, request: Request):
    return invoke(request, demo.read_event, event_id)


@router.get('/data-quality', response_model=DataQualityOutput)
def read_data_quality(request: Request):
    unknown = set(request.query_params) - {'site_id'}
    if unknown:
        raise HTTPException(422, f'unsupported data-quality filter(s): {", ".join(sorted(unknown))}')
    try:
        site_id = UUID(request.query_params.get('site_id', ''))
    except ValueError as exc:
        raise HTTPException(422, 'site_id must be a UUID') from exc
    return invoke(request, demo.read_data_quality, site_id)


EVIDENCE_QUERY_KEYS = frozenset({'target_kind', 'target_id'})


@router.get('/evidence', response_model=list[EvidenceOutput])
def list_evidence(request: Request):
    unknown = set(request.query_params) - EVIDENCE_QUERY_KEYS
    if unknown:
        raise HTTPException(422, f'unsupported evidence filter(s): {", ".join(sorted(unknown))}')
    kind = request.query_params.get('target_kind', '')
    if kind not in ('event', 'measurement'):
        raise HTTPException(422, "target_kind must be 'event' or 'measurement'")
    try:
        target_id = UUID(request.query_params.get('target_id', ''))
    except ValueError as exc:
        raise HTTPException(422, 'target_id must be a UUID') from exc
    return invoke(request, evidence_store.list_evidence_metadata, kind, target_id)


@router.post('/evidence', response_model=EvidenceOutput, status_code=201)
def add_evidence(body: EvidenceInput, request: Request):
    """Metadata-only evidence creation.

    Protected by HTTPS transport, session and CSRF. The private write-intent
    mechanism currently covers event/measurement domain POSTs; evidence uses
    the same server-side authorization (writer permit on the parent site) and
    atomic audit, but not intents. The UI must treat an unknown POST outcome
    as UNKNOWN with no automatic replay.
    """
    factory = request.app.state.session_factory
    if factory is None:
        raise HTTPException(503, 'demo database not configured')
    try:
        with security.protected(factory, request.cookies.get(security.SESSION_COOKIE),
                request.headers.get('x-csrf-token'), write=True) as access:
            bind_context(request, access)
            return evidence_store.add_evidence_metadata(factory, body.model_dump(), access=access)
    except evidence_store.EvidenceTargetUnresolvable as exc:
        raise HTTPException(404, 'evidence reference not found') from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(503, 'demo database operation unavailable') from exc


MASTER_QUERY_KEYS = frozenset({'namespace', 'code', 'include_inactive'})


def _master_invoke(request, operation, *args):
    # Master rows are organization-level in this provisional schema; session
    # authentication is enforced by the router dependency. A dedicated master
    # capability arrives with Gate B / OD-ZC02 and is NOT invented here.
    factory = request.app.state.session_factory
    if factory is None:
        raise HTTPException(503, 'demo database not configured')
    try:
        with security.protected(factory, request.cookies.get(security.SESSION_COOKIE),
                request.headers.get('x-csrf-token'), write=False) as access:
            bind_context(request, access)
            return operation(factory, *args)
    except master.ReferenceNotFoundError as exc:
        raise HTTPException(404, 'reference not found') from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(503, 'demo database operation unavailable') from exc


@router.get('/master/namespaces', response_model=list[MasterNamespaceOutput])
def master_namespaces(request: Request):
    return _master_invoke(request, master.namespace_overview)


@router.get('/master/references', response_model=list[MasterReferenceOutput])
def master_references(request: Request):
    unknown = set(request.query_params) - MASTER_QUERY_KEYS
    if unknown:
        raise HTTPException(422, f'unsupported master filter(s): {", ".join(sorted(unknown))}')
    namespace = request.query_params.get('namespace')
    include_inactive = request.query_params.get('include_inactive') == 'true'
    if request.query_params.get('include_inactive') not in (None, 'true', 'false'):
        raise HTTPException(422, 'include_inactive must be true or false')
    if request.query_params.get('code') is not None:
        raise HTTPException(422, 'code filtering uses /master/references/history')
    return _master_invoke(request, master.list_references, namespace, include_inactive)


@router.get('/master/references/history', response_model=MasterHistoryOutput)
def master_reference_history(request: Request):
    unknown = set(request.query_params) - {'namespace', 'code'}
    if unknown:
        raise HTTPException(422, f'unsupported master filter(s): {", ".join(sorted(unknown))}')
    namespace = request.query_params.get('namespace')
    code = request.query_params.get('code')
    if not namespace or not code:
        raise HTTPException(422, 'namespace and code are required for reference history')
    history = _master_invoke(request, master.reference_history, namespace, code)
    return {'namespace': namespace, 'code': code, 'versions': history}


@router.post('/events/{event_id}/measurements', response_model=MeasurementOutput, status_code=201)
def add_measurement(event_id: UUID, body: MeasurementInput, request: Request):
    return invoke(request, demo.add_measurement, event_id, body.model_dump())


@router.get('/events/{event_id}/measurements', response_model=list[MeasurementOutput])
def read_measurements(event_id: UUID, request: Request):
    return invoke(request, demo.read_measurements, event_id)


REVIEW_QUERY_KEYS = frozenset({'target_kind', 'target_id'})


@router.post('/reviews', response_model=ReviewSubmitOutput, status_code=201)
def submit_review(body: ReviewSubmitInput, request: Request):
    """Proposal-only review submission (FR-006).

    No approval/effectuation exists (VAL-003, OD-004 OPEN): proposed values are
    stored as a snapshot; source records are never mutated here. Same POST
    semantics as evidence: CSRF + writer permit + atomic audit, UNKNOWN outcome
    must never be replayed automatically.
    """
    factory = request.app.state.session_factory
    if factory is None:
        raise HTTPException(503, 'demo database not configured')
    try:
        with security.protected(factory, request.cookies.get(security.SESSION_COOKIE),
                request.headers.get('x-csrf-token'), write=True) as access:
            bind_context(request, access)
            return review_store.submit_review(factory, body.model_dump(), access=access)
    except review_store.ReviewTargetUnresolvable as exc:
        raise HTTPException(404, 'review target not found') from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(503, 'demo database operation unavailable') from exc


@router.get('/reviews', response_model=ReviewHistoryOutput)
def read_reviews(request: Request):
    unknown = set(request.query_params) - REVIEW_QUERY_KEYS
    if unknown:
        raise HTTPException(422, f'unsupported review filter(s): {", ".join(sorted(unknown))}')
    kind = request.query_params.get('target_kind', '')
    if kind not in ('event', 'measurement'):
        raise HTTPException(422, "target_kind must be 'event' or 'measurement'")
    try:
        target_id = UUID(request.query_params.get('target_id', ''))
    except ValueError as exc:
        raise HTTPException(422, 'target_id must be a UUID') from exc
    return invoke(request, review_store.read_review_history, kind, target_id)


EXPORT_QUERY_KEYS = export_service.EXPORT_FILTER_KEYS | {'dataset'}


@router.get('/export')
def export_dataset(request: Request):
    """Authorized CSV/JSON export delivery (FR-008).

    Server re-checks session + site permit per request; rows are queried only
    for the permitted site, so forged cross-site filters cannot widen scope
    (ENG-AC-016). Session-bound, no-store delivery: no presigned URLs, no
    cached artifacts. XLSX is NOT provided (OD-006 OPEN)."""
    unknown = set(request.query_params) - EXPORT_QUERY_KEYS
    if unknown:
        raise HTTPException(422, f'unsupported export filter(s): {", ".join(sorted(unknown))}')
    try:
        site_id = UUID(request.query_params.get('site_id', ''))
    except ValueError as exc:
        raise HTTPException(422, 'site_id must be a UUID') from exc
    dataset = request.query_params.get('dataset', 'events')
    if dataset not in ('events', 'measurements', 'metadata'):
        raise HTTPException(422, "dataset must be 'events', 'measurements' or 'metadata'")
    query = {key: request.query_params.get(key) for key in EXPORT_QUERY_KEYS
             if request.query_params.get(key) is not None}
    query.pop('dataset', None)
    factory = request.app.state.session_factory
    if factory is None:
        raise HTTPException(503, 'demo database not configured')
    try:
        with security.protected(factory, request.cookies.get(security.SESSION_COOKIE),
                request.headers.get('x-csrf-token'), write=False) as access:
            bind_context(request, access)
            bundle, counts = export_service.build_authorized_export(factory, site_id, query, access=access)
    except export_service.ExportScopeDenied as exc:
        raise HTTPException(404, 'export scope not found') from exc
    except security.Denied as exc:
        raise HTTPException(exc.status, 'access denied') from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(503, 'demo database operation unavailable') from exc
    payloads = {'events': bundle.events_csv, 'measurements': bundle.measurements_csv}
    extension = 'json' if dataset == 'metadata' else 'csv'
    filename = f'fwi-{dataset}-site-{site_id}.{extension}'
    body = payloads[dataset] if dataset in payloads else bundle.metadata_json
    media = 'application/json' if dataset == 'metadata' else 'text/csv; charset=utf-8'
    return Response(content=body, media_type=media, headers={
        'Cache-Control': 'no-store',
        'Content-Disposition': f'attachment; filename="{filename}"',
        'X-FWI-Export-Scope-Site': str(site_id),
        'X-FWI-Export-Events': str(counts['events']),
        'X-FWI-Export-Measurements': str(counts['measurements']),
        'X-FWI-Export-Format': 'fwi-synthetic-export-v0.1',
    })
