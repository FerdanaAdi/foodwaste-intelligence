"""AC-14: source-backed independent axes; no legal verdict or food-safety inference."""
import csv,io
from datetime import datetime
from uuid import UUID,uuid4
import pytest
from sqlalchemy import select,func
from test_demo_postgresql import database,counts
from auth_support import TestClient,login_client
from fwi.api.app import create_app
from fwi.infrastructure.database.demo_seed import SITE_ID,ORGANIZATION_ID
from fwi.infrastructure.database.models import WasteEvent,AuditEvent
from test_demo_validation import measurement_payload


def payload(**kwargs):
    return dict(organization_id=str(ORGANIZATION_ID),site_id=str(SITE_ID),event_type='at_risk_surplus',
        occurred_at='2026-11-13T08:00:00+08:00',**kwargs)


@pytest.mark.parametrize('edibility',['edible','inedible','mixed','unknown'])
def test_classifications_persist_independently_and_export_source(database,edibility):
    app=create_app()
    try:
        with TestClient(app) as client:
            source='FWI-03 v1.3; synthetic fixture, not a legal/safety determination'
            response=client.post('/demo/v0.1/events',json=payload(regulatory_scope_status='pending_assessment',edibility_status=edibility,classification_source=source))
            assert response.status_code==201,response.text
            event=response.json();identifier=event['event_id']
            assert event['regulatory_scope_status']=='pending_assessment' and event['edibility_status']==edibility
            for status in ['missing','measured_zero']:
                values=measurement_payload()
                values.update(observation_status=status,gross=None if status=='missing' else '0.4',tare=None if status=='missing' else '0.4',net=None if status=='missing' else '0')
                assert client.post(f'/demo/v0.1/events/{identifier}/measurements',json=values).status_code==201
            before=counts(database)
            read=client.get('/demo/v0.1/events/'+identifier).json()
            assert datetime.fromisoformat(read['recorded_at'])==datetime.fromisoformat(event['recorded_at'])
            assert {k:v for k,v in read.items() if k!='recorded_at'}=={k:v for k,v in event.items() if k!='recorded_at'}
            export=client.get('/demo/v0.1/export',params={'site_id':str(SITE_ID),'dataset':'events'})
            assert export.status_code==200
            row=list(csv.DictReader(io.StringIO(export.content.decode('utf-8-sig'))))[0]
            assert (row['regulatory_scope_status'],row['edibility_status'],row['classification_source'])==('pending_assessment',edibility,source)
            assert counts(database)==before and before[0:2]==(1,2)
            login_client(client,'site_b_writer')
            assert client.get('/demo/v0.1/events/'+identifier).status_code==404
    finally:app.state.session_factory.kw['bind'].dispose()


def test_absent_axes_stay_null_and_unsupported_assessments_are_rejected(database):
    app=create_app()
    try:
        with TestClient(app) as client:
            response=client.post('/demo/v0.1/events',json=payload());assert response.status_code==201
            assert all(response.json()[k] is None for k in ['regulatory_scope_status','edibility_status','classification_source'])
            for extra in [dict(regulatory_scope_status='approved'),dict(edibility_status='safe'),dict(edibility_status='inedible')]:
                before=counts(database)
                assert client.post('/demo/v0.1/events',json=payload(**extra)).status_code==422
                assert counts(database)==before
    finally:app.state.session_factory.kw['bind'].dispose()


def test_classification_database_constraints_preserve_source_on_invalid_write(database):
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError
    app=create_app()
    try:
        with TestClient(app) as client:
            event=client.post('/demo/v0.1/events',json=payload(regulatory_scope_status='pending_assessment',edibility_status='inedible',classification_source='synthetic source')).json()
            for assignment in ["edibility_status='safe'","regulatory_scope_status='approved'","classification_source=NULL"]:
                with pytest.raises(IntegrityError):
                    with database() as session,session.begin():
                        session.execute(text('UPDATE waste_events SET '+assignment+' WHERE event_id=:id'),{'id':UUID(event['event_id'])})
            read=client.get('/demo/v0.1/events/'+event['event_id']).json()
            assert (read['regulatory_scope_status'],read['edibility_status'],read['classification_source'])==('pending_assessment','inedible','synthetic source')
    finally:app.state.session_factory.kw['bind'].dispose()
