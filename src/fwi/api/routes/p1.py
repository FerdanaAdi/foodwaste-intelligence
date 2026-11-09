"""Authenticated provisional P1 candidate routes; route shapes are PROPOSED.

Authorization follows the synthetic demo pattern: session/CSRF at the transport
layer, permissions re-checked under the domain transaction locks, single-use
write intents ('p1' kind) for every POST. No route here creates a waste
generation event.
"""
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from fwi.api import schemas_p1 as schemas
from fwi.application import p1, security
from fwi.api.routes.auth import authenticated, bind_context

router = APIRouter(prefix='/p1/v0.1', tags=['p1 candidate'], dependencies=[Depends(authenticated)])


def invoke(request, operation, *args):
    factory = request.app.state.session_factory
    if factory is None:
        raise HTTPException(503, 'p1 database not configured')
    try:
        with security.protected(factory, request.cookies.get(security.SESSION_COOKIE),
                request.headers.get('x-csrf-token'), write=request.method == 'POST') as access:
            bind_context(request, access)
            return operation(factory, *args, access=access, intent=request.headers.get('x-fwi-intent'))
    except p1.NotFound as exc:
        raise HTTPException(404, 'not found') from exc
    except IntegrityError as exc:
        raise HTTPException(409, 'p1 data conflicts with database constraints') from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except SQLAlchemyError as exc:
        # Do not leak SQL parameters, connection URLs, or credentials.
        raise HTTPException(503, 'p1 database operation unavailable') from exc


# ---------------------------------------------------------------- FR-101

@router.post('/receipts', response_model=schemas.ReceiptOutput, status_code=201)
def create_receipt(body: schemas.ReceiptInput, request: Request):
    return invoke(request, p1.create_receipt, body.model_dump())


@router.get('/receipts', response_model=list[schemas.ReceiptOutput])
def read_receipts(site_id: UUID, request: Request):
    return invoke(request, p1.read_receipts, site_id)


@router.get('/receipts/{receipt_id}', response_model=schemas.ReceiptOutput)
def read_receipt(receipt_id: UUID, request: Request):
    return invoke(request, p1.read_receipt, receipt_id)


@router.post('/receipts/{receipt_id}/lots', response_model=schemas.LotOutput, status_code=201)
def create_lot(receipt_id: UUID, body: schemas.LotInput, request: Request):
    return invoke(request, p1.create_lot, receipt_id, body.model_dump())


@router.get('/receipts/{receipt_id}/lots', response_model=list[schemas.LotOutput])
def read_receipt_lots(receipt_id: UUID, request: Request):
    return invoke(request, p1.read_receipt_lots, receipt_id)


@router.get('/lots/{lot_id}', response_model=schemas.LotDetailOutput)
def read_lot(lot_id: UUID, request: Request):
    return invoke(request, p1.read_lot, lot_id)


@router.post('/lots/{lot_id}/movements', response_model=schemas.MovementOutput, status_code=201)
def add_movement(lot_id: UUID, body: schemas.MovementInput, request: Request):
    return invoke(request, p1.add_movement, lot_id, body.model_dump())


# ---------------------------------------------------------------- FR-102

@router.post('/menus', response_model=schemas.MenuOutput, status_code=201)
def create_menu(body: schemas.MenuInput, request: Request):
    return invoke(request, p1.create_menu, body.model_dump())


@router.post('/recipes', response_model=schemas.RecipeOutput, status_code=201)
def create_recipe(body: schemas.RecipeInput, request: Request):
    return invoke(request, p1.create_recipe, body.model_dump())


@router.get('/recipes/{recipe_id}', response_model=schemas.RecipeOutput)
def read_recipe(recipe_id: UUID, request: Request):
    return invoke(request, p1.read_recipe, recipe_id)


@router.post('/batches', response_model=schemas.BatchOutput, status_code=201)
def create_batch(body: schemas.BatchInput, request: Request):
    return invoke(request, p1.create_batch, body.model_dump())


@router.post('/batches/{batch_id}/io', response_model=schemas.BatchIOOutput, status_code=201)
def add_batch_io(batch_id: UUID, body: schemas.BatchIOInput, request: Request):
    return invoke(request, p1.add_batch_io, batch_id, body.model_dump())


@router.get('/batches/{batch_id}', response_model=schemas.BatchDetailOutput)
def read_batch(batch_id: UUID, request: Request):
    return invoke(request, p1.read_batch, batch_id)


# ---------------------------------------------------------------- FR-103

@router.post('/runs', response_model=schemas.RunOutput, status_code=201)
def create_run(body: schemas.RunInput, request: Request):
    return invoke(request, p1.create_run, body.model_dump())


@router.post('/deliveries', response_model=schemas.DeliveryOutput, status_code=201)
def create_delivery(body: schemas.DeliveryInput, request: Request):
    return invoke(request, p1.create_delivery, body.model_dump())


@router.post('/deliveries/{delivery_id}/receiving', response_model=schemas.DeliveryOutput, status_code=201)
def record_receiving(delivery_id: UUID, body: schemas.ReceivingInput, request: Request):
    return invoke(request, p1.record_receiving, delivery_id, body.model_dump())


@router.get('/deliveries/{delivery_id}', response_model=schemas.DeliveryOutput)
def read_delivery(delivery_id: UUID, request: Request):
    return invoke(request, p1.read_delivery, delivery_id)


@router.post('/services', response_model=schemas.ServiceOutput, status_code=201)
def create_service(body: schemas.ServiceInput, request: Request):
    return invoke(request, p1.create_service, body.model_dump())


@router.get('/services/{service_id}', response_model=schemas.ServiceOutput)
def read_service(service_id: UUID, request: Request):
    return invoke(request, p1.read_service, service_id)


# ---------------------------------------------------------------- FR-104

@router.post('/links', response_model=schemas.LinkOutput, status_code=201)
def create_link(body: schemas.LinkInput, request: Request):
    return invoke(request, p1.create_link, body.model_dump())


@router.get('/lineage/{object_type}/{object_id}', response_model=schemas.LineageView)
def read_lineage(object_type: str, object_id: UUID, request: Request):
    return invoke(request, p1.read_lineage, object_type, object_id)


# ---------------------------------------------------------------- FR-105

@router.post('/dispositions', response_model=schemas.DispositionOutput, status_code=201)
def create_disposition(body: schemas.DispositionInput, request: Request):
    return invoke(request, p1.create_disposition, body.model_dump())


@router.get('/events/{event_id}/dispositions', response_model=list[schemas.DispositionOutput])
def read_dispositions(event_id: UUID, request: Request):
    return invoke(request, p1.read_dispositions, event_id)


# ---------------------------------------------------------------- FR-106

@router.get('/trends', response_model=schemas.TrendsView)
def trends(site_id: UUID, date_from: date, date_to: date, request: Request):
    return invoke(request, p1.trends, site_id, date_from, date_to)
