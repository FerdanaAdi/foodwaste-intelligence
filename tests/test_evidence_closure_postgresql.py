"""Portable Evidence regressions from Owner UAT closure; synthetic fixtures only.
Uses the existing guarded PostgreSQL fixture and its normal CI lifecycle.
No Owner IDs, private file paths, credentials or platform image generators.
"""
import hashlib
from base64 import b64decode
import pytest
from sqlalchemy import select,func
from auth_support import TestClient,login_client
from test_demo_postgresql import database
from test_p0_completion_postgresql import evidence,event
from private_evidence_fixture import secure_test_root
from fwi.infrastructure.database.demo_seed import ORGANIZATION_ID
from fwi.infrastructure.database.security_seed import SITE_B
from fwi.infrastructure.database.models import EvidenceFile,AuditEvent
from fwi.api.app import create_app

LIMIT=10*1024*1024
# Tiny 2x2 synthetic images generated specifically for the test fixture.
FORMATS={
 'synthetic.png':b64decode('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAPSURBVBhXY2BoaPjPgAwAHYQCAEOKrlAAAAAASUVORK5CYII='),
 'synthetic.jpg':b64decode('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8rbi4lu55J55HmmlYu8kjFmdickknkknvRRRVS3ZlR/hx9Ef/2Q=='),
}

def pdf_bytes(padding=0):
 objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>',b'<< /Length 0 >>\nstream\n\nendstream']
 body=bytearray(b'%PDF-1.4\n');offsets=[]
 for i,obj in enumerate(objects,1):offsets.append(len(body));body.extend(str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n')
 if padding:body.extend(b'%'+b'X'*padding+b'\n')
 start=len(body);body.extend(b'xref\n0 5\n0000000000 65535 f \n')
 for n in offsets:body.extend(f'{n:010d} 00000 n \n'.encode())
 body.extend(b'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n'+str(start).encode()+b'\n%%EOF\n');return bytes(body)


def exact_pdf(size):
 pad=max(0,size-len(pdf_bytes()))
 for _ in range(5):
  content=pdf_bytes(pad)
  if len(content)==size:return content
  pad+=size-len(content)
 raise AssertionError('PDF fixture size mismatch')


@pytest.mark.parametrize('media,name,suffix',[('application/pdf','synthetic.pdf','pdf'),('image/jpeg','synthetic.jpg','jpg'),('image/png','synthetic.png','png')])
def test_real_format_writer_and_authorized_reader_download_exact_bytes(database,tmp_path,monkeypatch,media,name,suffix):
 secure_test_root(tmp_path);monkeypatch.setenv('FWI_EVIDENCE_ROOT',str(tmp_path));app=create_app();data=pdf_bytes() if suffix=='pdf' else FORMATS[name]
 try:
  with TestClient(app) as c:
   identifier=evidence(c,event(c));url='/demo/v0.1/evidence/'+identifier+'/content';r=c.post(url,content=data,headers={'Content-Type':media});assert r.status_code==201
   assert r.json()['sha256']==hashlib.sha256(data).hexdigest();file_id=r.json()['file_id']
   login_client(c,'site_a_reader');read=c.get(url);assert read.status_code==200 and read.content==data
   assert read.headers['content-type']==media and read.headers['content-disposition']==f'attachment; filename="{file_id}.{suffix}"'
   assert read.headers['cache-control']=='no-store' and read.headers['x-content-type-options']=='nosniff'
   assert c.post(url,content=data,headers={'Content-Type':media}).status_code==403
   login_client(c,'site_b_writer');assert c.get(url).status_code==404
 finally:app.state.session_factory.kw['bind'].dispose()


@pytest.mark.parametrize('delta',[-1,0,1])
def test_exact_10mib_boundary(database,tmp_path,monkeypatch,delta):
 secure_test_root(tmp_path);monkeypatch.setenv('FWI_EVIDENCE_ROOT',str(tmp_path));app=create_app();data=exact_pdf(LIMIT+delta);assert len(data)==LIMIT+delta
 try:
  with TestClient(app) as c:
   identifier=evidence(c,event(c));url='/demo/v0.1/evidence/'+identifier+'/content';r=c.post(url,content=data,headers={'Content-Type':'application/pdf'})
   assert r.status_code==(413 if delta>0 else 201)
   with database() as s:
    assert s.scalar(select(func.count()).select_from(EvidenceFile))==(0 if delta>0 else 1)
    assert s.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.entity_type=='evidence_files'))==(0 if delta>0 else 1)
   if delta<=0:assert c.get(url).content==data
   else:assert list(tmp_path.iterdir())==[]
 finally:app.state.session_factory.kw['bind'].dispose()


@pytest.mark.parametrize('media',['application/pdf','image/jpeg'])
def test_invalid_format_signature_rejected_without_file_audit(database,tmp_path,monkeypatch,media):
 secure_test_root(tmp_path);monkeypatch.setenv('FWI_EVIDENCE_ROOT',str(tmp_path));app=create_app()
 try:
  with TestClient(app) as c:
   identifier=evidence(c,event(c));assert c.post('/demo/v0.1/evidence/'+identifier+'/content',content=b'not an accepted file',headers={'Content-Type':media}).status_code==400
   with database() as s:assert s.scalar(select(func.count()).select_from(EvidenceFile))==0
   assert list(tmp_path.iterdir())==[]
 finally:app.state.session_factory.kw['bind'].dispose()


def test_site_b_file_concealed_from_site_a_writer_and_reader(database,tmp_path,monkeypatch):
 secure_test_root(tmp_path);monkeypatch.setenv('FWI_EVIDENCE_ROOT',str(tmp_path));app=create_app();data=FORMATS['synthetic.png']
 try:
  with TestClient(app) as c:
   login_client(c,'site_b_writer');r=c.post('/demo/v0.1/events',json={'organization_id':str(ORGANIZATION_ID),'site_id':str(SITE_B),'event_type':'actual_loss_discard','occurred_at':'2026-11-15T08:00:00+08:00'});assert r.status_code==201
   identifier=evidence(c,r.json()['event_id']);url='/demo/v0.1/evidence/'+identifier+'/content';assert c.post(url,content=data,headers={'Content-Type':'image/png'}).status_code==201
   assert c.get(url).content==data
   for actor in ('site_a_writer','site_a_reader'):
    login_client(c,actor);assert c.get(url).status_code==404
    assert c.get('/demo/v0.1/evidence/99999999-9999-4999-8999-999999999999/content').status_code==404
 finally:app.state.session_factory.kw['bind'].dispose()


def test_unauthenticated_and_invalid_csrf_cannot_upload(database,tmp_path,monkeypatch):
 from fastapi.testclient import TestClient as RawClient
 secure_test_root(tmp_path);monkeypatch.setenv('FWI_EVIDENCE_ROOT',str(tmp_path));app=create_app();data=pdf_bytes()
 try:
  with TestClient(app) as c:
   identifier=evidence(c,event(c));url='/demo/v0.1/evidence/'+identifier+'/content'
   assert c.post(url,content=data,headers={'Content-Type':'application/pdf','X-CSRF-Token':'invalid'}).status_code==403
   assert not list(tmp_path.iterdir());c.cookies.clear();assert c.get(url).status_code==401
   assert RawClient.post(c,url,content=data,headers={'Content-Type':'application/pdf'}).status_code==401
 finally:app.state.session_factory.kw['bind'].dispose()


def test_lost_acknowledgement_can_follow_commit_but_get_never_replays(database,tmp_path,monkeypatch):
 from starlette.middleware.base import BaseHTTPMiddleware
 from starlette.responses import JSONResponse
 secure_test_root(tmp_path);monkeypatch.setenv('FWI_EVIDENCE_ROOT',str(tmp_path));app=create_app();posts=[];data=pdf_bytes()
 class LostAck(BaseHTTPMiddleware):
  async def dispatch(self,request,call_next):
   response=await call_next(request)
   if request.method=='POST' and request.url.path.endswith('/content'):
    posts.append(response.status_code)
    if response.status_code==201:return JSONResponse({'detail':'synthetic lost acknowledgement'},status_code=503)
   return response
 app.add_middleware(LostAck)
 try:
  with TestClient(app) as c:
   identifier=evidence(c,event(c));url='/demo/v0.1/evidence/'+identifier+'/content';assert c.post(url,content=data,headers={'Content-Type':'application/pdf'}).status_code==503
   assert c.get(url).content==data;login_client(c,'site_a_reader');assert c.get(url).content==data;assert posts==[201]
   with database() as s:
    assert s.scalar(select(func.count()).select_from(EvidenceFile))==1
    assert s.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.entity_type=='evidence_files',AuditEvent.action=='stored'))==1
 finally:app.state.session_factory.kw['bind'].dispose()
