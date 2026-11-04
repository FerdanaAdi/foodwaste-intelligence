"""Demo-only routes; no authentication or production exposure authorized."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from fwi.api.schemas_demo import EventInput, EventOutput, MeasurementInput, MeasurementOutput
from fwi.application import demo

router = APIRouter(prefix='/demo/v0.1', tags=['synthetic demo'])


def invoke(request, operation, *args):
    factory = request.app.state.session_factory
    if factory is None:
        raise HTTPException(503, 'demo database not configured')
    try:
        return operation(factory, *args)
    except demo.NotFound as exc:
        raise HTTPException(404, str(exc)) from exc
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


@router.get('/events/{event_id}', response_model=EventOutput)
def read_event(event_id: UUID, request: Request):
    return invoke(request, demo.read_event, event_id)


@router.post('/events/{event_id}/measurements', response_model=MeasurementOutput, status_code=201)
def add_measurement(event_id: UUID, body: MeasurementInput, request: Request):
    return invoke(request, demo.add_measurement, event_id, body.model_dump())


@router.get('/events/{event_id}/measurements', response_model=list[MeasurementOutput])
def read_measurements(event_id: UUID, request: Request):
    return invoke(request, demo.read_measurements, event_id)
