"""Synthetic Owner-approved P0 extensions; strict existing HTTPS/session boundary."""
from typing import Literal
import asyncio
from uuid import UUID
from fastapi import APIRouter,Request,Response,Depends,HTTPException
from pydantic import BaseModel,ConfigDict,Field,StrictInt
from fwi.api.routes.auth import authenticated,bind_context,factory
from fwi.api.schemas_demo import Text,MasterReferenceOutput
from fwi.application import security,p0_completion as core
router=APIRouter(prefix='/demo/v0.1',dependencies=[Depends(authenticated)])


def context(request,write=False,activity=True):
    return security.protected(factory(request),request.cookies.get(security.SESSION_COOKIE),request.headers.get('x-csrf-token'),write=write,activity=activity)


@router.get('/administration')
def capabilities(request:Request):
    with context(request) as access:
        bind_context(request,access);return core.master_namespaces(access)


class MasterInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    namespace:Text
    code:Text
    expected_version:StrictInt=Field(ge=0)
    label:Text
    status:Literal['active','inactive']
    definition:Text|None=None
    reason:Text


@router.post('/master/references',response_model=MasterReferenceOutput,status_code=201)
def append_master(body:MasterInput,request:Request):
    with context(request,True) as access:
        bind_context(request,access);return core.append_master(access,body.model_dump())


@router.post('/evidence/{identifier}/content',status_code=201)
async def upload(identifier:UUID,request:Request):
    # Preauthorize briefly, never retain PostgreSQL locks across network input.
    with context(request,True,activity=False) as access:
        bind_context(request,access);core.evidence_target(access,identifier,True)
    kind=request.headers.get('content-type','').split(';')[0]
    if kind not in core.TYPES:raise HTTPException(415,'PDF/JPEG/PNG only')
    content=bytearray()
    try:
        async with asyncio.timeout(30):
            async for chunk in request.stream():
                if len(content)+len(chunk)>core.MAX_FILE_BYTES:raise HTTPException(413,'file too large')
                content.extend(chunk)
    except TimeoutError:
        raise HTTPException(408,'upload body timeout') from None
    with context(request,True) as access:
        bind_context(request,access)
        # Revalidate current session, CSRF and target-site grant after body receipt.
        result,_=core.store_file(access,identifier,bytes(content),kind,core.private_root())
        # On ambiguous COMMIT failure retain private bytes; never delete a possibly referenced file.

    return result


@router.get('/evidence/{identifier}/content')
def download(identifier:UUID,request:Request):
    with context(request) as access:
        bind_context(request,access);content,kind,file_id=core.read_file(access,identifier)
    suffix={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'}[kind]
    return Response(content,media_type=kind,headers={'Cache-Control':'no-store','Content-Disposition':f'attachment; filename="{file_id}.{suffix}"','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"})


class ApprovalInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    expected_version:StrictInt=Field(ge=1)
    expected_revision:StrictInt=Field(ge=0)
    reason:Text


@router.post('/reviews/{identifier}/approval',status_code=201)
def approve(identifier:UUID,body:ApprovalInput,request:Request):
    with context(request,True) as access:
        bind_context(request,access);return core.approve_proposal(access,identifier,body.expected_version,body.expected_revision,body.reason)
