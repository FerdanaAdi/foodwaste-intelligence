"""Authenticated provisional P2 candidate routes (catalogue, blocked preview, cost references).

Every response is value-free by construction; HELD codes are disabled on every
path. Route shapes are PROPOSED.
"""
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from fwi.api import schemas_p2 as schemas
from fwi.application import p2, security
from fwi.api.routes.auth import authenticated, bind_context

router = APIRouter(prefix='/p2/v0.1', tags=['p2 candidate'], dependencies=[Depends(authenticated)])


def invoke(request, operation, *args, **kwargs):
    factory = request.app.state.session_factory
    if factory is None:
        raise HTTPException(503, 'p2 database not configured')
    try:
        with security.protected(factory, request.cookies.get(security.SESSION_COOKIE),
                request.headers.get('x-csrf-token'), write=request.method == 'POST') as access:
            bind_context(request, access)
            return operation(factory, *args, access=access,
                             intent=request.headers.get('x-fwi-intent'), **kwargs)
    except p2.NotFound as exc:
        raise HTTPException(404, 'not found') from exc
    except IntegrityError as exc:
        raise HTTPException(409, 'p2 data conflicts with database constraints') from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(503, 'p2 database operation unavailable') from exc


@router.get('/kpi', response_model=list[schemas.KpiEntryOutput])
def read_kpi_catalogue(request: Request):
    return invoke(request, p2.read_kpi_catalogue)


@router.get('/kpi/{code}/preview', response_model=schemas.KpiPreviewOutput)
def kpi_preview(code: str, request: Request, numerator_basis: str | None = None,
                denominator_basis: str | None = None):
    return invoke(request, p2.kpi_preview, code, numerator_basis=numerator_basis,
                  denominator_basis=denominator_basis)


@router.post('/cost-references', response_model=schemas.CostReferenceOutput, status_code=201)
def create_cost_reference(body: schemas.CostReferenceInput, request: Request):
    return invoke(request, p2.create_cost_reference, body.model_dump())


@router.get('/cost-references/{cost_reference_id}', response_model=schemas.CostReferenceOutput)
def read_cost_reference(cost_reference_id: UUID, request: Request):
    return invoke(request, p2.read_cost_reference, cost_reference_id)


@router.get('/cost-references/{cost_reference_id}/valuation', response_model=schemas.ValuationBlockedOutput)
def cost_valuation(cost_reference_id: UUID, request: Request):
    return invoke(request, p2.cost_valuation, cost_reference_id)


@router.get('/recommendations', response_model=list[schemas.RecommendationOutput])
def read_recommendations(site_id: UUID, request: Request):
    return invoke(request, p2.read_recommendations, site_id)


@router.post('/recommendations/evaluate', response_model=schemas.EvaluateView)
def evaluate_recommendations(site_id: UUID, request: Request):
    return invoke(request, p2.evaluate_recommendations, site_id)


@router.post('/recommendations/{recommendation_id}/acknowledge', response_model=schemas.RecommendationOutput)
def acknowledge_recommendation(recommendation_id: UUID, body: schemas.RecommendationAckInput, request: Request):
    return invoke(request, p2.acknowledge_recommendation, recommendation_id, body.model_dump())


@router.get('/recommendations/rules', response_model=list[schemas.RuleView])
def read_alert_rules(request: Request):
    return invoke(request, p2.read_alert_rules)


@router.post('/recommendations/rules/{rule_code}/disable', response_model=schemas.RuleView)
def set_rule_disabled(rule_code: str, body: schemas.RuleDisableInput, request: Request):
    return invoke(request, p2.set_rule_disabled, dict(rule_code=rule_code, **body.model_dump()))
