"""HTTPS-only synthetic session/CSRF and private intent boundary."""
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy import select

from fwi.application import demo, security, membership_admin
from fwi.infrastructure.database.models import Membership, MembershipAdmin, WasteEvent, WriteIntent

router = APIRouter(prefix='/auth', tags=['synthetic authentication'])


def factory(request):
    value = request.app.state.session_factory
    if value is None:
        raise security.Denied(503)
    return value


def authenticated(request: Request):
    security.transport(request, write=request.method != 'GET')
    with security.protected(factory(request), request.cookies.get(security.SESSION_COOKIE),
            request.headers.get('x-csrf-token'), write=request.method != 'GET', activity=False) as access:
        bind_context(request, access)
        pass  # Final authorization is repeated under the domain transaction locks.


def bind_context(request, access):
    request.state.auth_context = (str(access.principal.principal_id), str(access.login_session.session_id))


def cookie(response, name, value):
    response.set_cookie(name, value, secure=True, httponly=True, samesite='strict', path='/')
    response.headers['Cache-Control'] = 'no-store'


class Credentials(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: str = Field(min_length=1, max_length=80, pattern=r'^[a-z0-9_-]+$')
    password: str = Field(min_length=1, max_length=1024)


class IntentInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    site_id: UUID
    kind: Literal['event', 'measurement', 'p1']
    event_id: UUID | None = None


@router.get('/preauth')
def preauth(request: Request, response: Response):
    security.transport(request)
    secret, csrf = security.bootstrap(factory(request))
    cookie(response, security.PREAUTH_COOKIE, secret)
    return {'csrf_token': csrf}


@router.post('/login')
def login(body: Credentials, request: Request, response: Response):
    security.transport(request, write=True)
    secret, csrf, identity = security.login(factory(request), body.username, body.password,
        request.cookies.get(security.PREAUTH_COOKIE), request.headers.get('x-csrf-token'),
        security.trusted_peer(request.scope))
    request.state.auth_context = identity
    cookie(response, security.SESSION_COOKIE, secret)
    response.delete_cookie(security.PREAUTH_COOKIE, path='/', secure=True, httponly=True, samesite='strict')
    return {'csrf_token': csrf}


@router.get('/session', dependencies=[Depends(authenticated)])
def context(request: Request, response: Response):
    secret = request.cookies.get(security.SESSION_COOKIE)
    with security.protected(factory(request), secret) as access:
        bind_context(request, access)
        members = access.session.scalars(select(Membership).where(
            Membership.principal_id == access.principal.principal_id, Membership.active.is_(True)))
        sites = {str(m.site_id): set(security.PERMISSIONS[m.role]) for m in members}
        for grant in access.session.scalars(select(MembershipAdmin).where(
                MembershipAdmin.principal_id == access.principal.principal_id)):
            sites.setdefault(str(grant.site_id), set()).add('membership.manage')
        result = {'principal_id': str(access.principal.principal_id),
                  'auth_context_id': str(access.login_session.session_id), 'csrf_token': security.csrf_for(secret),
                  'sites': [{'site_id': site, 'permissions': sorted(actions)} for site, actions in sorted(sites.items())]}
    response.headers['Cache-Control'] = 'no-store'
    return result


@router.post('/logout', dependencies=[Depends(authenticated)])
def logout(request: Request, response: Response):
    with security.protected(factory(request), request.cookies.get(security.SESSION_COOKIE),
            request.headers.get('x-csrf-token'), write=True) as access:
        bind_context(request, access)
        access.login_session.revoked = True
        security.security_audit(access.session, access.principal.principal_id, 'auth_sessions',
            access.login_session.session_id, 'revoked', 'authenticated logout')
    response.delete_cookie(security.SESSION_COOKIE, path='/', secure=True, httponly=True, samesite='strict')
    response.headers['Cache-Control'] = 'no-store'
    return {'logged_out': True}


@router.post('/intents', status_code=201, dependencies=[Depends(authenticated)])
def register_intent(body: IntentInput, request: Request, response: Response):
    with security.protected(factory(request), request.cookies.get(security.SESSION_COOKIE),
            request.headers.get('x-csrf-token'), write=True) as access:
        bind_context(request, access)
        security.permit(access, body.site_id, body.kind + '.create')
        if body.kind == 'measurement':
            event = access.session.get(WasteEvent, body.event_id) if body.event_id else None
            if not event or event.site_id != body.site_id:
                raise security.Denied(404)
        elif body.kind == 'p1' and body.event_id is not None:
            event = access.session.get(WasteEvent, body.event_id)
            if not event or event.site_id != body.site_id:
                raise security.Denied(404)
        elif body.event_id is not None:
            raise security.Denied(400)
        record = WriteIntent(principal_id=access.principal.principal_id, site_id=body.site_id,
            kind=body.kind, event_id=body.event_id, registered_at=security.now())
        access.session.add(record)
        access.session.flush()
        result = {'intent_id': str(record.intent_id), 'state': record.state}
    response.headers['Cache-Control'] = 'no-store'
    return result


@router.get('/intents', dependencies=[Depends(authenticated)])
def recover_intents(request: Request, response: Response):
    with security.protected(factory(request), request.cookies.get(security.SESSION_COOKIE)) as access:
        bind_context(request, access)
        allowed_sites = select(Membership.site_id).where(Membership.principal_id == access.principal.principal_id,
                                                       Membership.active.is_(True))
        records = access.session.scalars(select(WriteIntent).where(
            WriteIntent.principal_id == access.principal.principal_id,
            WriteIntent.site_id.in_(allowed_sites)).order_by(WriteIntent.registered_at))
        result = [{'intent_id': str(r.intent_id), 'site_id': str(r.site_id), 'kind': r.kind,
                   'event_id': str(r.event_id) if r.event_id else None,
                   'result_id': str(r.result_id) if r.result_id else None, 'state': r.state,
                   'registered_at': r.registered_at.isoformat()} for r in records]
    response.headers['Cache-Control'] = 'no-store'
    return result


class MembershipCommand(BaseModel):
    model_config = ConfigDict(extra='forbid')
    site_id: UUID
    principal_id: UUID
    action: Literal['grant', 'change_role', 'revoke', 'reactivate']
    role: Literal['reader', 'writer'] | None = None
    reason: str = Field(min_length=1, max_length=1000)
    expected_role: Literal['reader', 'writer'] | None
    expected_active: StrictBool | None


@router.get('/memberships', dependencies=[Depends(authenticated)])
def membership_list(site_id: UUID, request: Request, response: Response):
    if set(request.query_params) != {'site_id'} or len(request.query_params.getlist('site_id')) != 1:
        raise security.Denied(400)
    with security.protected(factory(request), request.cookies.get(security.SESSION_COOKIE)) as access:
        bind_context(request, access)
        result = membership_admin.list_memberships(access, site_id)
    response.headers['Cache-Control'] = 'no-store'
    return result


@router.post('/memberships', dependencies=[Depends(authenticated)])
def membership_change(body: MembershipCommand, request: Request, response: Response):
    if request.query_params:
        raise security.Denied(400)
    with security.protected(factory(request), request.cookies.get(security.SESSION_COOKIE),
            request.headers.get('x-csrf-token'), write=True, lock_principal_ids=(body.principal_id,)) as access:
        bind_context(request, access)
        result = membership_admin.change_membership(access, **body.model_dump())
    response.headers['Cache-Control'] = 'no-store'
    return result
