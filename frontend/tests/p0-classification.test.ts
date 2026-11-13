import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {prepareSession,installDomainFetch,authResponse} from './backend-auth-fixture';
import {parseEvent} from '@/backend/contract';
import {createBackendEvent,eventErrors,SYNTHETIC_ORG_ID,SYNTHETIC_SITE_ID} from '@/backend/write';
const identifier='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const input={organization_id:SYNTHETIC_ORG_ID,site_id:SYNTHETIC_SITE_ID,event_type:'at_risk_surplus' as const,occurred_at:'2026-11-13T08:00:00+08:00'};
beforeEach(async()=>{sessionStorage.clear();await prepareSession();});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();sessionStorage.clear();});
it('preserves independent axes and provenance in the original single POST',async()=>{
 const value={...input,regulatory_scope_status:'pending_assessment' as const,edibility_status:'inedible' as const,classification_source:'FWI-03 v1.3 synthetic'};
 const fetch=vi.fn(async(_url:string,options?:RequestInit)=>authResponse({...JSON.parse(options!.body as string),event_id:identifier,recorded_at:'2026-11-13T08:01:00+08:00'},201));
 installDomainFetch(fetch);expect((await createBackendEvent(value)).kind).toBe('saved');expect(fetch).toHaveBeenCalledTimes(1);
 expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject(value);
});
it('requires source and rejects unknown legal verdict/safety inference',()=>{
 expect(eventErrors({...input,edibility_status:'inedible'}).classification_source).toBeTruthy();
 const event={...input,event_id:identifier,recorded_at:'2026-11-13T08:01:00+08:00',regulatory_scope_status:'approved',edibility_status:'edible',classification_source:'synthetic'};
 expect(()=>parseEvent(event,identifier)).toThrow();
 expect(()=>parseEvent({...event,regulatory_scope_status:null,edibility_status:'safe'},identifier)).toThrow();
 expect(parseEvent({...event,regulatory_scope_status:'pending_assessment',edibility_status:'inedible'},identifier).edibility_status).toBe('inedible');
});
