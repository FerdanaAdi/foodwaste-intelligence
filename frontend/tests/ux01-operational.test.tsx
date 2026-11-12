import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { TimestampInput, EventContext } from '@/components/operational/OperationalUI';
import App from '@/App';
import fixture from './fixtures/backend-detail.json';
import { prepareSession, installDomainFetch, sessionA } from './backend-auth-fixture';
import { invalidateAuth, selectSite } from '@/backend/auth';
import BackendReviewPage from '@/pages/BackendReviewPage';

beforeEach(async () => { sessionStorage.clear();await prepareSession(); });
afterEach(() => { vi.unstubAllGlobals();vi.restoreAllMocks();sessionStorage.clear(); });
it('requires explicit source offset and never derives it from date or browser timezone', () => {
 const change=vi.fn();render(<TimestampInput label="Tanggal dan waktu kejadian" value="" onChange={change}/>);
 fireEvent.change(screen.getByLabelText('Tanggal dan waktu kejadian: tanggal'),{target:{value:'2026-11-10'}});
 fireEvent.change(screen.getByLabelText('Tanggal dan waktu kejadian: jam'),{target:{value:'10:25'}});
 expect(change).toHaveBeenLastCalledWith('');
 expect(screen.getByLabelText('Tanggal dan waktu kejadian: offset')).toHaveValue('');
 fireEvent.change(screen.getByLabelText('Tanggal dan waktu kejadian: offset'),{target:{value:'+08:00'}});
 expect(change).toHaveBeenLastCalledWith('2026-11-10T10:25+08:00');
});
it('preserves fractional-second lexeme and offset while editing only source date', () => {
 const change=vi.fn();const original='2026-11-10T10:25:30.123456+07:00';
 render(<TimestampInput label="Tanggal dan waktu kejadian" value={original} onChange={change}/>);
 expect(screen.getByLabelText('Tanggal dan waktu kejadian ISO-8601 dengan offset')).toHaveValue(original);
 expect(change).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Tanggal dan waktu kejadian: tanggal'),{target:{value:'2026-11-11'}});
 expect(change).toHaveBeenLastCalledWith('2026-11-11T10:25:30.123456+07:00');
});
it('does not rewrite the source string when advanced input changes', () => {
 const change=vi.fn();render(<TimestampInput label="Tanggal dan waktu kejadian" value="" onChange={change}/>);
 fireEvent.change(screen.getByLabelText('Tanggal dan waktu kejadian ISO-8601 dengan offset'),{target:{value:'2026-11-10T10:25:30.123456Z'}});
 expect(change).toHaveBeenLastCalledWith('2026-11-10T10:25:30.123456Z');
});
it('clears date/time/offset with empty ISO and never resurrects old time or offset', () => {
 function Controlled() { const [value,setValue]=useState('2026-11-10T10:25:30.123456+07:00');return <TimestampInput label="Waktu sumber" value={value} onChange={setValue}/>; }
 render(<Controlled/>);
 fireEvent.change(screen.getByLabelText('Waktu sumber ISO-8601 dengan offset'),{target:{value:''}});
 for(const part of ['tanggal','jam','offset'])expect(screen.getByLabelText(`Waktu sumber: ${part}`)).toHaveValue('');
 fireEvent.change(screen.getByLabelText('Waktu sumber: tanggal'),{target:{value:'2026-11-11'}});
 expect(screen.getByLabelText('Waktu sumber ISO-8601 dengan offset')).toHaveValue('');
 expect(screen.getByLabelText('Waktu sumber: jam')).toHaveValue('');
 expect(screen.getByLabelText('Waktu sumber: offset')).toHaveValue('');
});
function contextRoute(target=fixture.measurement.measurement_id) {
 const fetcher=vi.fn(async(url: string, options?: RequestInit) => {
  let value:unknown = url.endsWith('/measurements') ? [fixture.measurement] : fixture.event;
  if(url.includes('/reviews?'))value={target_kind:'measurement',target_id:target,decisions:[],proposals:[]};
  if(options?.method==='POST')throw Error('No POST authorized in context-read test');
  return {ok:true,status:200,json:async()=>value} as Response;
 });
 installDomainFetch(fetcher);
 render(<MemoryRouter initialEntries={[`/backend-demo/review?event=${fixture.event.event_id}&target_kind=measurement&target=${target}`]}><App/></MemoryRouter>);
 return fetcher;
}
it('selects an authorized measurement from real read context without UUID typing or any POST',async()=>{
 const fetcher=contextRoute();
 expect(await screen.findByLabelText('Catatan yang ingin diperiksa')).toHaveValue(`measurement:${fixture.measurement.measurement_id}`);
 expect(screen.getByLabelText(/UUID target \(tulis\)/)).toHaveValue(fixture.measurement.measurement_id);
 await waitFor(()=>expect(fetcher.mock.calls.some(c=>String(c[0]).includes('/reviews?'))).toBe(true));
 expect(fetcher.mock.calls.every(c=>c[1]?.method==='GET')).toBe(true);
});
it('rejects a foreign URL target instead of manufacturing a selectable measurement',async()=>{
 const fetcher=contextRoute('ffffffff-ffff-4fff-8fff-ffffffffffff');
 expect(await screen.findByText(/Target bukan bagian dari konteks/)).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:/Simpan usulan/})).not.toBeInTheDocument();
 expect(fetcher.mock.calls.every(c=>c[1]?.method==='GET')).toBe(true);
});

const otherEvent = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const reviewPath = `/backend-demo/review?event=${fixture.event.event_id}&target_kind=measurement&target=${fixture.measurement.measurement_id}`;
function reviewContextHarness(options: { deny?: boolean; delayedOther?: Promise<Response> } = {}) {
 const fetcher=vi.fn(async(url: string, init?: RequestInit) => {
  if(options.deny)return {ok:false,status:404,json:async()=>({detail:'Not found'})} as Response;
  if(options.delayedOther && url.includes(otherEvent))return options.delayedOther;
  const value=init?.method==='POST' ? {review_decision_id:'66666666-6666-4666-8666-666666666661',recorded_at:'2026-11-09T00:00:00Z'} :
   url.includes('/reviews?') ? {decisions:[],proposals:[]} : url.endsWith('/measurements') ? [fixture.measurement] : fixture.event;
  return {ok:true,status:init?.method==='POST'?201:200,json:async()=>value} as Response;
 });
 installDomainFetch(fetcher);
 function View() { const navigate=useNavigate();return <><button onClick={()=>navigate(`/backend-demo/review?event=${otherEvent}`)}>Changer contexte test</button><BackendReviewPage/></>; }
 render(<MemoryRouter initialEntries={[reviewPath]}><View/></MemoryRouter>);
 return fetcher;
}
function fillReview() {
 fireEvent.change(screen.getByLabelText(/^Apa yang perlu diperiksa/),{target:{value:'Periksa catatan sintetis'}});
 fireEvent.change(screen.getByLabelText(/Sumber pemeriksaan/),{target:{value:'synthetic_reviewer'}});
 fireEvent.change(screen.getByLabelText(/^Asal keterangan/),{target:{value:'synthetic_fixture'}});
}
it('blocks a forged manual target B while verified context A remains displayed',async()=>{
 const fetcher=reviewContextHarness();await screen.findByLabelText('Catatan yang ingin diperiksa');
 expect(screen.getByLabelText(/UUID target \(tulis\)/)).toHaveAttribute('readonly');
 expect(screen.getAllByLabelText('Jenis target')[1]).toBeDisabled();
 // Bypass the read-only UI with a synthetic event to exercise the dispatch guard itself.
 fireEvent.change(screen.getByLabelText(/UUID target \(tulis\)/),{target:{value:otherEvent}});
 fillReview();fireEvent.click(screen.getByRole('button',{name:'Kirim Usulan Pemeriksaan'}));
 expect(await screen.findByText(/Target, sesi, atau lokasi tidak sesuai konteks/)).toBeInTheDocument();
 expect(fetcher.mock.calls.filter(c=>c[1]?.method==='POST')).toHaveLength(0);
});
it('sends exactly the verified measurement target and preserves proposal-only feedback',async()=>{
 const fetcher=reviewContextHarness();await screen.findByLabelText('Catatan yang ingin diperiksa');fillReview();
 fireEvent.click(screen.getByRole('button',{name:'Kirim Usulan Pemeriksaan'}));
 await screen.findByText(/Belum ada perubahan otomatis/);
 const posts=fetcher.mock.calls.filter(c=>c[1]?.method==='POST');expect(posts).toHaveLength(1);
 expect(JSON.parse(posts[0][1]!.body as string)).toEqual({target_kind:'measurement',target_id:fixture.measurement.measurement_id,reason:'Periksa catatan sintetis',source:'synthetic_reviewer',provenance:'synthetic_fixture'});
});
it('rejects a stale site verification at submit even before a parent remount',async()=>{
 const siteB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 await prepareSession({...sessionA,sites:[...sessionA.sites,{site_id:siteB,permissions:sessionA.sites[0].permissions}]});
 const fetcher=reviewContextHarness();await screen.findByLabelText('Catatan yang ingin diperiksa');fillReview();
 act(()=>selectSite(siteB));fireEvent.click(screen.getByRole('button',{name:'Kirim Usulan Pemeriksaan'}));
 expect(await screen.findByText(/Target, sesi, atau lokasi tidak sesuai konteks/)).toBeInTheDocument();
 expect(fetcher.mock.calls.filter(c=>c[1]?.method==='POST')).toHaveLength(0);
});
it('never reuses context A while context B is loading or after leaving its session',async()=>{
 let resolve!: (response:Response)=>void;const delayed=new Promise<Response>(r=>{resolve=r;});
 const fetcher=reviewContextHarness({delayedOther:delayed});await screen.findByLabelText('Catatan yang ingin diperiksa');fillReview();
 fireEvent.click(screen.getByRole('button',{name:'Changer contexte test'}));
 expect(screen.queryByRole('button',{name:'Kirim Usulan Pemeriksaan'})).not.toBeInTheDocument();
 act(()=>invalidateAuth());
 await act(async()=>resolve({ok:true,status:200,json:async()=>fixture.event} as Response));
 expect(screen.queryByLabelText('Catatan yang ingin diperiksa')).not.toBeInTheDocument();
 expect(fetcher.mock.calls.filter(c=>c[1]?.method==='POST')).toHaveLength(0);
});
it('conceals an unauthorized context and never offers a write form',async()=>{
 const fetcher=reviewContextHarness({deny:true});
 await screen.findByText(/Konteks tidak dapat dibaca/);
 expect(screen.queryByText('Kejadian telah dibaca dari catatan tersimpan')).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Kirim Usulan Pemeriksaan'})).not.toBeInTheDocument();
 expect(fetcher.mock.calls.filter(c=>c[1]?.method==='POST')).toHaveLength(0);
});

// OSS-01B: presentation/accessibility only; source time and server contracts unchanged.
it('links each timestamp input to its help and error, preserving the source value', () => {
 const change=vi.fn();render(<TimestampInput label="Waktu sumber" value="2026-11-10T10:25:30.123456+08:00" onChange={change} error="Periksa waktu pada catatan sumber."/>);
 for (const label of ['Waktu sumber: tanggal','Waktu sumber: jam','Waktu sumber: offset','Waktu sumber ISO-8601 dengan offset']) {
  const input=screen.getByLabelText(label);
  expect(input).toHaveAttribute('aria-invalid','true');
  const ids=input.getAttribute('aria-describedby')!.split(' ');
  expect(ids).toHaveLength(2);expect(ids.every(id=>document.getElementById(id))).toBe(true);
  expect(input).toHaveAccessibleDescription(/Periksa waktu pada catatan sumber/);
 }
 expect(change).not.toHaveBeenCalled();
});
it('supports keyboard tab order for date, time, source zone and advanced details', async () => {
 const user=userEvent.setup();render(<TimestampInput label="Waktu sumber" value="" onChange={vi.fn()}/>);
 await user.tab();expect(screen.getByLabelText('Waktu sumber: tanggal')).toHaveFocus();
 await user.tab();expect(screen.getByLabelText('Waktu sumber: jam')).toHaveFocus();
 await user.tab();expect(screen.getByLabelText('Waktu sumber: offset')).toHaveFocus();
 await user.tab();expect(document.activeElement?.tagName).toBe('SUMMARY');
 // jsdom does not emulate the native Enter default action on summary; actual browser checks remain separate.
 await user.click(screen.getByText('Format ISO sumber / presisi lanjutan'));expect(screen.getByText('Format ISO sumber / presisi lanjutan').closest('details')).toHaveAttribute('open');
});
it('uses the correct kitchen-date label without deriving a date or hiding repeated measurements', () => {
 render(<MemoryRouter><EventContext event={{...fixture.event,event_type:'at_risk_surplus'}} count={2}/></MemoryRouter>);
 expect(screen.getByText('Tanggal kegiatan dapur')).toBeInTheDocument();
 expect(screen.queryByText(/dapuronal/)).not.toBeInTheDocument();
 expect(screen.getByText('Jumlah kejadian').querySelector('strong')).toHaveTextContent('1');
 expect(screen.getByText('Jumlah pengukuran').querySelector('strong')).toHaveTextContent('2');
});
