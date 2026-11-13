import {render,screen,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {prepareSession,installDomainFetch,authResponse,sessionA} from './backend-auth-fixture';
import {EvidenceFilePanel,ProposalApprovalPanel,MasterAdministrationPanel} from '@/components/operational/CompletionTools';
const id='33333333-3333-4333-8333-333333333333';
beforeEach(async()=>{sessionStorage.clear();await prepareSession();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();sessionStorage.clear();});
it('ordinary writer has no implicit master or reviewer authority',async()=>{
 installDomainFetch(async()=>authResponse({master_namespaces:[],review_sites:[]}));
 render(<><MasterAdministrationPanel/><ProposalApprovalPanel identifier={id} actor="other" revision={0} status="unreviewed"/></>);
 await screen.findByText(/Persetujuan memerlukan reviewer/);
 expect(screen.queryByRole('button',{name:'Simpan versi baru'})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Setujui usulan (belum diterapkan)'})).not.toBeInTheDocument();
});
it('explicit site reviewer still cannot approve own proposal',async()=>{
 installDomainFetch(async()=>authResponse({master_namespaces:[],review_sites:[sessionA.sites[0].site_id]}));
 render(<ProposalApprovalPanel identifier={id} actor={sessionA.principal_id} revision={0} status="unreviewed"/>);
 expect(await screen.findByRole('button',{name:'Setujui usulan (belum diterapkan)'})).toBeDisabled();
 await userEvent.type(screen.getByLabelText('Alasan persetujuan usulan'),'synthetic review');
 expect(screen.getByRole('button',{name:'Setujui usulan (belum diterapkan)'})).toBeDisabled();
});
it('ambiguous upload remains locked across remount; a second click sends no second POST',async()=>{
 let posts=0;installDomainFetch(async(_path,options)=>{if(options?.method==='POST'){posts++;throw new TypeError('lost acknowledgement');}return authResponse({});});
 const view=render(<EvidenceFilePanel identifier={id}/>);const user=userEvent.setup();
 await user.click(screen.getByText('Berkas bukti privat'));
 await user.upload(screen.getByLabelText('Berkas sintetis'),new File(['%PDF-1.7 synthetic'],'fixture.pdf',{type:'application/pdf'}));
 await user.click(screen.getByRole('button',{name:'Unggah berkas sintetis'}));await screen.findByText(/UNKNOWN: hasil belum pasti/);expect(posts).toBe(1);
 view.unmount();render(<EvidenceFilePanel identifier={id}/>);await user.click(screen.getByText('Berkas bukti privat'));
 await user.upload(screen.getByLabelText('Berkas sintetis'),new File(['%PDF-1.7 synthetic'],'fixture.pdf',{type:'application/pdf'}));await user.click(screen.getByRole('button',{name:'Unggah berkas sintetis'}));
 await screen.findByText(/UNKNOWN: operasi sebelumnya/);expect(posts).toBe(1);
});
it('malformed 201 is UNKNOWN while definitive file acknowledgement permits normal completion',async()=>{
 let valid=false;installDomainFetch(async(path)=>authResponse(valid?{evidence_id:path.split('/')[4],file_id:'44444444-4444-4444-8444-444444444444',sha256:'a'.repeat(64)}:{},201));
 const user=userEvent.setup();const view=render(<EvidenceFilePanel identifier={id}/>);await user.click(screen.getByText('Berkas bukti privat'));await user.upload(screen.getByLabelText('Berkas sintetis'),new File(['%PDF-1.7'],'fixture.pdf',{type:'application/pdf'}));await user.click(screen.getByRole('button',{name:'Unggah berkas sintetis'}));await screen.findByText(/UNKNOWN: acknowledgement/);
 expect(sessionStorage.length).toBeGreaterThan(0);view.unmount();valid=true;
 render(<EvidenceFilePanel identifier="55555555-5555-4555-8555-555555555555"/>);await user.click(screen.getByText('Berkas bukti privat'));
 // An unrelated target is not blocked; a definitive bound acknowledgement completes normally.
 await user.upload(screen.getByLabelText('Berkas sintetis'),new File(['%PDF-1.7'],'fixture.pdf',{type:'application/pdf'}));await user.click(screen.getByRole('button',{name:'Unggah berkas sintetis'}));await screen.findByText(/Tersimpan. Muat ulang data/);
});
