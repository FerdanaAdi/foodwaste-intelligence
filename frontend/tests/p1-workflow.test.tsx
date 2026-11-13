import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {prepareSession,authResponse,sessionA} from './backend-auth-fixture';
import {createBackendLot,readReceiptLots} from '@/backend/p1';
const receipt='cccccccc-cccc-4ccc-8ccc-cccccccccccc',lot='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const owner={...sessionA,sites:[{...sessionA.sites[0],permissions:['receipt.create','receipt.read']}]};
const record={lot_id:lot,receipt_id:receipt,organization_id:'11111111-1111-4111-8111-111111111111',site_id:sessionA.sites[0].site_id,lot_ref:'LOT-SYN',item_code:'source-item',item_version:null,quantity:'2.0000000000000000001',original_unit:'kg',mass_basis:'raw',recorded_at:'2026-11-13T08:00:00+08:00'};
const input={lot_ref:'LOT-SYN',item_code:'source-item',item_version:'',quantity:record.quantity,mass_basis:'raw'};
beforeEach(async()=>{sessionStorage.clear();await prepareSession(owner);});
afterEach(()=>{sessionStorage.clear();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('uses receipt-lots endpoint and verifies parent/site instead of treating receipt as lot',async()=>{
 const mock=vi.fn(async()=>authResponse([record]));vi.stubGlobal('fetch',mock);
 expect((await readReceiptLots(receipt))[0].lot_id).toBe(lot);
 expect(mock.mock.calls).toHaveLength(1);expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(`/p1/v0.1/receipts/${receipt}/lots`);
 vi.stubGlobal('fetch',vi.fn(async()=>authResponse([{...record,receipt_id:lot}])));
 await expect(readReceiptLots(receipt)).rejects.toThrow();
});
it('dispatches a child POST once without fabricated site_id payload',async()=>{
 const mock=vi.fn(async(path:string,_options?:RequestInit)=>path==='/auth/intents'?authResponse({intent_id:crypto.randomUUID(),state:'registered'},201):authResponse(record,201));vi.stubGlobal('fetch',mock);
 const result=await createBackendLot(receipt,input);expect(result.kind).toBe('saved');
 expect(mock).toHaveBeenCalledTimes(2);const body=JSON.parse(mock.mock.calls[1][1]?.body as string);
 expect(body.site_id).toBeUndefined();expect(body.quantity).toBe(record.quantity);
});
it('UNKNOWN survives same-tab relogin/GET and cannot dispatch a second child POST',async()=>{
 let posts=0;const mock=vi.fn(async(path:string)=>{if(path==='/auth/intents')return authResponse({intent_id:crypto.randomUUID(),state:'registered'},201);posts++;return authResponse({},503);});vi.stubGlobal('fetch',mock);
 expect((await createBackendLot(receipt,input)).kind).toBe('unknown');expect(posts).toBe(1);
 await prepareSession(owner);const readMock=vi.fn(async()=>authResponse([record]));vi.stubGlobal('fetch',readMock);await readReceiptLots(receipt);
 expect((await createBackendLot(receipt,input)).kind).toBe('unknown');expect(posts).toBe(1);expect(readMock).toHaveBeenCalledTimes(1);
});
