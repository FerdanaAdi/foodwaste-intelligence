"""Actual protected PostgreSQL API tests; owned UUID fixture and private temp files only."""
from uuid import UUID
from pathlib import Path
import hashlib
import pytest
from sqlalchemy import select,func
from test_demo_postgresql import database,counts
from auth_support import TestClient,login_client
from fwi.api.app import create_app
from fwi.application import master
from fwi.infrastructure.database.demo_seed import SITE_ID,ORGANIZATION_ID
from fwi.infrastructure.database.models import Principal,AuditEvent,EvidenceFile,MasterReference,ProposalApproval
from fwi.infrastructure.database.completion_seed import seed_authorities


from private_evidence_fixture import secure_test_root


def people(factory):
 with factory() as s:return {p.username:p.principal_id for p in s.scalars(select(Principal))}


def event(client):
 r=client.post('/demo/v0.1/events',json=dict(organization_id=str(ORGANIZATION_ID),site_id=str(SITE_ID),event_type='at_risk_surplus',occurred_at='2026-11-13T08:00:00+08:00'));assert r.status_code==201;return r.json()['event_id']


def evidence(client,event_id):
 r=client.post('/demo/v0.1/evidence',json=dict(target_kind='event',target_id=event_id,kind='attachment',source='synthetic',title='synthetic PDF',recorded_at='2026-11-13T08:00:00+08:00'));assert r.status_code==201;return r.json()['evidence_id']


def test_master_explicit_namespace_authority_append_only_conflicts_audit(database):
 app=create_app()
 try:
  with TestClient(app) as client:
   body=dict(namespace='stage',code='synthetic_source',expected_version=0,label='v1',status='active',reason='Owner approved synthetic test')
   assert client.post('/demo/v0.1/master/references',json=body).status_code==403
   ids=people(database);seed_authorities(database,masters=[(ids['site_a_reader'],'stage','Owner approved synthetic vocabulary fixture')])
   login_client(client,'site_a_reader')
   first=client.post('/demo/v0.1/master/references',json=body);assert first.status_code==201,first.text
   assert client.post('/demo/v0.1/master/references',json=body).status_code==409
   second=client.post('/demo/v0.1/master/references',json={**body,'expected_version':1,'label':'v2','status':'inactive'});assert second.status_code==201
   rows=client.get('/demo/v0.1/master/references/history',params={'namespace':'stage','code':body['code']}).json()['versions']
   assert [r['version'] for r in rows]==[1,2] and rows[0]['label']=='v1'
   assert all(r['changed_by']==str(ids['site_a_reader']) for r in rows)
   assert client.post('/demo/v0.1/master/references',json={**body,'namespace':'unit'}).status_code==403
   with database() as s:
    audit=s.scalars(select(AuditEvent).where(AuditEvent.entity_type=='master_references')).all()
    assert len(audit)==2 and all(a.actor_principal_id==ids['site_a_reader'] for a in audit)
 finally:app.state.session_factory.kw['bind'].dispose()


def test_private_file_upload_read_scope_integrity_and_no_overwrite(database,tmp_path,monkeypatch):
 monkeypatch.setenv('FWI_EVIDENCE_ROOT',str(tmp_path));secure_test_root(tmp_path)
 app=create_app();content=b'%PDF-1.7\nsynthetic FWI test only'
 try:
  with TestClient(app) as client:
   identifier=evidence(client,event(client));url='/demo/v0.1/evidence/'+identifier+'/content'
   result=client.post(url,content=content,headers={'Content-Type':'application/pdf'});assert result.status_code==201,result.text
   assert result.json()['sha256']==hashlib.sha256(content).hexdigest() and 'storage_ref' not in result.text
   assert len(list(tmp_path.iterdir()))==1
   assert client.post(url,content=content,headers={'Content-Type':'application/pdf'}).status_code==409
   login_client(client,'site_a_reader');read=client.get(url);assert read.status_code==200 and read.content==content
   assert read.headers['x-content-type-options']=='nosniff' and 'attachment' in read.headers['content-disposition']
   assert client.post(url,content=content,headers={'Content-Type':'application/pdf'}).status_code==403
   login_client(client,'site_b_writer');assert client.get(url).status_code==404
   assert client.post(url,content=content,headers={'Content-Type':'application/pdf'}).status_code==404
   assert len(list(tmp_path.iterdir()))==1
 finally:app.state.session_factory.kw['bind'].dispose()


@pytest.mark.parametrize('kind,content,status',[('text/html',b'<script>x</script>',415),('image/png',b'not a png',400),('application/pdf',b'%PDF-'+b'a'*(10*1024*1024),413)])
def test_file_rejections_leave_no_blob_or_new_file(database,tmp_path,monkeypatch,kind,content,status):
 monkeypatch.setenv('FWI_EVIDENCE_ROOT',str(tmp_path));secure_test_root(tmp_path);app=create_app()
 try:
  with TestClient(app) as client:
   identifier=evidence(client,event(client));before=counts(database)
   result=client.post('/demo/v0.1/evidence/'+identifier+'/content',content=content,headers={'Content-Type':kind})
   assert result.status_code==status,result.text
   assert list(tmp_path.iterdir())==[] and counts(database)==before
 finally:app.state.session_factory.kw['bind'].dispose()


def test_explicit_reviewer_no_self_approval_conflict_original_unchanged(database):
 app=create_app()
 try:
  with TestClient(app) as client:
   identifier=event(client);original=client.get('/demo/v0.1/events/'+identifier).json()
   response=client.post('/demo/v0.1/reviews',json=dict(target_kind='event',target_id=identifier,reason='synthetic request',source='synthetic',provenance='synthetic',proposed_values={'occurred_at':'2026-11-13T09:00:00+08:00'}));assert response.status_code==201,response.text
   proposal=response.json()['correction_proposal']['correction_record_id'];url='/demo/v0.1/reviews/'+proposal+'/approval';body=dict(expected_version=1,expected_revision=0,reason='synthetic independent review')
   assert client.post(url,json=body).status_code==403
   ids=people(database);seed_authorities(database,reviewers=[(ids['site_a_writer'],SITE_ID),(ids['site_a_reader'],SITE_ID)])
   assert client.post(url,json=body).status_code==403
   login_client(client,'site_b_writer');assert client.post(url,json=body).status_code==404
   login_client(client,'site_a_reader');assert client.post(url,json={**body,'expected_version':2}).status_code==409
   result=client.post(url,json=body);assert result.status_code==201 and result.json()['applied'] is False
   assert client.post(url,json=body).status_code==409
   assert client.get('/demo/v0.1/events/'+identifier).json()==original
   history=client.get('/demo/v0.1/reviews',params={'target_kind':'event','target_id':identifier}).json()
   assert history['proposals'][0]['state']=='proposed' and history['proposals'][0]['approval_status']=='approved_prototype'
   with database() as s:assert s.scalar(select(func.count()).select_from(ProposalApproval))==1
 finally:app.state.session_factory.kw['bind'].dispose()


@pytest.mark.parametrize('revocation',['membership','session'])
def test_paused_upload_holds_no_auth_locks_and_final_authorization_denies_revocation(database,tmp_path,monkeypatch,revocation):
 from concurrent.futures import ThreadPoolExecutor
 from threading import Event
 from fwi.application import security
 from fwi.infrastructure.database.models import AuthSession
 monkeypatch.setenv('FWI_EVIDENCE_ROOT',str(tmp_path));secure_test_root(tmp_path);app=create_app();waiting,release=Event(),Event()
 try:
  with TestClient(app) as client:
   identifier=evidence(client,event(client));ids=people(database);before=counts(database)
   with database() as s:session_id=s.scalar(select(AuthSession.session_id).where(AuthSession.secret_hash==security.digest(client.cookies.get(security.SESSION_COOKIE))))
   def body():
    waiting.set();assert release.wait(8);yield b'%PDF-1.7 synthetic delayed body'
   with ThreadPoolExecutor(2) as pool:
    uploading=pool.submit(client.post,'/demo/v0.1/evidence/'+identifier+'/content',content=body(),headers={'Content-Type':'application/pdf'})
    try:
     assert waiting.wait(4)
     revoke=pool.submit(security.revoke_membership,database,ids['site_a_writer'],SITE_ID) if revocation=='membership' else pool.submit(security.revoke_session,database,ids['site_a_writer'],session_id)
     revoke.result(timeout=3) # Would block under the old transaction-around-body implementation.
    finally:release.set()
    assert uploading.result(timeout=8).status_code==(404 if revocation=='membership' else 401)
   assert list(tmp_path.iterdir())==[]
   with database() as s:assert s.scalar(select(func.count()).select_from(EvidenceFile))==0
 finally:release.set();app.state.session_factory.kw['bind'].dispose()


def test_private_root_rejects_shared_directory_and_accepts_owned_root(tmp_path,monkeypatch):
 import os
 from fwi.application import p0_completion,security
 secure_test_root(tmp_path);monkeypatch.setenv('FWI_EVIDENCE_ROOT',str(tmp_path))
 assert p0_completion.private_root()==tmp_path.resolve()
 if os.name=='nt':
  monkeypatch.setenv('FWI_EVIDENCE_ROOT',str(Path(os.environ['PUBLIC'])))
  with pytest.raises(security.Denied) as error:p0_completion.private_root()
  assert error.value.status==503


@pytest.mark.parametrize('operation',['master','file','approval'])
def test_new_write_and_audit_roll_back_together(database,tmp_path,monkeypatch,operation):
 from fwi.application import security
 secure_test_root(tmp_path);monkeypatch.setenv('FWI_EVIDENCE_ROOT',str(tmp_path))
 app=create_app()
 try:
  with TestClient(app) as client:
   ids=people(database)
   if operation=='master':
    seed_authorities(database,masters=[(ids['site_a_writer'],'stage','approved synthetic test')])
    url='/demo/v0.1/master/references';options=dict(json=dict(namespace='stage',code='atomic_test',expected_version=0,label='Synthetic',status='active',reason='atomic rollback'))
   elif operation=='file':
    identifier=evidence(client,event(client));url='/demo/v0.1/evidence/'+identifier+'/content';options=dict(content=b'%PDF-1.7 atomic synthetic',headers={'Content-Type':'application/pdf'})
   else:
    identifier=event(client)
    proposal=client.post('/demo/v0.1/reviews',json=dict(target_kind='event',target_id=identifier,reason='synthetic',source='synthetic',provenance='synthetic',proposed_values={'occurred_at':'2026-11-13T09:00:00+08:00'})).json()['correction_proposal']['correction_record_id']
    seed_authorities(database,reviewers=[(ids['site_a_reader'],SITE_ID)]);login_client(client,'site_a_reader')
    url='/demo/v0.1/reviews/'+proposal+'/approval';options=dict(json=dict(expected_version=1,expected_revision=0,reason='atomic rollback'))
   with database() as session:
    before={table.name:session.scalar(select(func.count()).select_from(table)) for table in [MasterReference.__table__,EvidenceFile.__table__,ProposalApproval.__table__,AuditEvent.__table__]}
   def fail(*args,**kwargs):raise RuntimeError('injected audit failure')
   monkeypatch.setattr(security,'security_audit',fail)
   with pytest.raises(RuntimeError,match='injected audit failure'):client.post(url,**options)
   with database() as session:
    after={table.name:session.scalar(select(func.count()).select_from(table)) for table in [MasterReference.__table__,EvidenceFile.__table__,ProposalApproval.__table__,AuditEvent.__table__]}
   assert before==after and list(tmp_path.iterdir())==[]
 finally:app.state.session_factory.kw['bind'].dispose()


def test_concurrent_approvals_have_one_revision_and_one_atomic_audit(database):
 from concurrent.futures import ThreadPoolExecutor
 from threading import Barrier
 app=create_app()
 try:
  with TestClient(app) as writer:
   identifier=event(writer)
   response=writer.post('/demo/v0.1/reviews',json=dict(target_kind='event',target_id=identifier,reason='synthetic',source='synthetic',provenance='synthetic',proposed_values={'occurred_at':'2026-11-13T09:00:00+08:00'}));assert response.status_code==201
   proposal=response.json()['correction_proposal']['correction_record_id']
   seed_authorities(database,reviewers=[(people(database)['site_a_reader'],SITE_ID)])
  barrier=Barrier(2)
  def approve():
   with TestClient(app) as reviewer:
    login_client(reviewer,'site_a_reader');barrier.wait(timeout=8)
    return reviewer.post('/demo/v0.1/reviews/'+proposal+'/approval',json=dict(expected_version=1,expected_revision=0,reason='concurrent synthetic review')).status_code
  with ThreadPoolExecutor(2) as pool:results=list(pool.map(lambda _:approve(),range(2)))
  assert sorted(results)==[201,409]
  with database() as s:
   assert s.scalar(select(func.count()).select_from(ProposalApproval))==1
   assert s.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.entity_type=='proposal_approvals'))==1
 finally:app.state.session_factory.kw['bind'].dispose()
