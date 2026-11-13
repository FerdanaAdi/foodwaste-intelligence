import {useEffect,useState,useSyncExternalStore} from 'react';
import {authSnapshot,subscribeAuth,protectedJson,protectedBinary,permits,assertCurrent} from '@/backend/auth';
import {isUUID} from '@/backend/contract';
function useAuthority(){
 const auth=useSyncExternalStore(subscribeAuth,authSnapshot);const [value,setValue]=useState<{master_namespaces:string[];review_sites:string[]}|null>(null);
 useEffect(()=>{let active=true;setValue(null);const controller=new AbortController();
 void protectedJson('/demo/v0.1/administration',{},controller.signal).then(({response,value:v})=>{const r=v as {master_namespaces:string[];review_sites:string[]};
 if(active&&response.ok&&Array.isArray(r.master_namespaces)&&r.master_namespaces.every(s=>typeof s==='string')&&Array.isArray(r.review_sites)&&r.review_sites.every(isUUID))setValue(r);
 }).catch(()=>{});return()=>{active=false;controller.abort();};},[auth.generation,auth.site]);return value;
}
async function once(path:string,body:BodyInit,contentType:string){
 const auth=authSnapshot();if(auth.phase!=='ready'||!auth.session||!auth.site)return 'Sesi tidak aktif; POST tidak dikirim.';const target=path==='/demo/v0.1/master/references'&&typeof body==='string'?JSON.stringify([JSON.parse(body).namespace,JSON.parse(body).code]):path;const key=`fwi-p0-pending:${auth.session!.principal_id}:${auth.site}:${target}`;
 try{if(sessionStorage.getItem(key))return 'UNKNOWN: operasi sebelumnya belum terkonfirmasi; jangan kirim ulang.';sessionStorage.setItem(key,'pending');}catch{return 'Pengaman tidak tersedia; tidak ada POST dikirim.';}
 try{const {response,value}=await protectedJson(path,{method:'POST',headers:{'Content-Type':contentType},body});
 if(response.status===201){const v=value as Record<string,unknown>;const valid=v&&((path==='/demo/v0.1/master/references'&&typeof v.reference_id==='string'&&isUUID(v.reference_id)&&Number.isInteger(v.version))||(path.endsWith('/content')&&v.evidence_id===path.split('/')[4]&&typeof v.file_id==='string'&&isUUID(v.file_id)&&typeof v.sha256==='string'&&/^[a-f0-9]{64}$/.test(v.sha256))||(path.endsWith('/approval')&&typeof v.approval_id==='string'&&isUUID(v.approval_id)&&v.status==='approved_prototype'&&v.applied===false));if(!valid)return 'UNKNOWN: acknowledgement tidak sesuai kontrak; jangan kirim ulang.';sessionStorage.removeItem(key);return 'Tersimpan. Muat ulang data dengan GET untuk melihat hasil.';}
 if([400,404,409,413,415,422].includes(response.status)){sessionStorage.removeItem(key);return `Ditolak (${response.status}); tidak ada retry otomatis.`;}
 }catch{/* Ambiguous transport/session transition retains the marker. */}
 return 'UNKNOWN: hasil belum pasti. GET tidak membuka kunci; jangan kirim ulang.';
}
export function MasterAdministrationPanel(){
 const authority=useAuthority();const [form,setForm]=useState({namespace:'',code:'',expected_version:'0',label:'',status:'active',definition:'',reason:''});const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 if(!authority?.master_namespaces.length)return null;
 return <section className="rounded border p-3"><h2>Administrasi katalog yang ditunjuk Owner</h2><form onSubmit={e=>{e.preventDefault();if(busy)return;setBusy(true);void once('/demo/v0.1/master/references',JSON.stringify({...form,definition:form.definition||null,expected_version:Number(form.expected_version)}),'application/json').then(setMessage).finally(()=>setBusy(false));}}>
 <fieldset disabled={busy} className="grid gap-2 sm:grid-cols-2"><label>Namespace disetujui<select value={form.namespace} onChange={e=>setForm(v=>({...v,namespace:e.target.value}))} required><option value="">Pilih namespace</option>{authority.master_namespaces.map(n=><option key={n}>{n}</option>)}</select></label>
 {(['code','expected_version','label','definition','reason'] as const).map(k=><label key={k}>{({code:'Kode katalog',expected_version:'Versi saat ini (0 untuk baru)',label:'Nama/label',definition:'Definisi',reason:'Alasan versi baru'})[k]}<input type={k==='expected_version'?'number':'text'} min={0} value={form[k]} required={k!=='definition'} onChange={e=>setForm(v=>({...v,[k]:e.target.value}))}/></label>)}
 <label>Status versi<select value={form.status} onChange={e=>setForm(v=>({...v,status:e.target.value}))}><option value="active">Aktif</option><option value="inactive">Tidak aktif</option></select></label><button>Simpan versi baru</button></fieldset></form>
 {message&&<p role="status">{message}</p>}<p>409 berarti versi berubah; baca ulang riwayat. Versi lama tidak dihapus.</p></section>;
}
export function EvidenceFilePanel({identifier}:{identifier:string}){
 const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 return <details><summary>Berkas bukti privat</summary><p>PDF/JPEG/PNG maksimal 10 MB; tidak ada tautan publik atau penghapusan otomatis. Ketersediaan metadata bukan bukti berkas tersimpan.</p>
 {permits('event.create')&&<><label>Berkas sintetis<input type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={e=>setFile(e.target.files?.[0]??null)}/></label><button disabled={busy||!file} onClick={()=>{
 if(!file||file.size>10485760){setMessage('Berkas melebihi 10 MB.');return;}setBusy(true);void once(`/demo/v0.1/evidence/${identifier}/content`,file,file.type).then(setMessage).finally(()=>setBusy(false));}}>Unggah berkas sintetis</button></>}
 <button disabled={busy} onClick={()=>{setBusy(true);void protectedBinary(`/demo/v0.1/evidence/${identifier}/content`,new AbortController().signal).then(({response,bytes,context})=>{
 assertCurrent(context);
 if(response.status!==200){setMessage('Berkas belum tersedia atau tidak dapat dibaca.');return;}
 const type=response.headers.get('Content-Type')?.split(';')[0]??'';if(!['application/pdf','image/jpeg','image/png'].includes(type))throw new Error('invalid type');
 const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type}));const a=document.createElement('a');a.href=url;a.download='bukti-sintetis.'+({'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'} as Record<string,string>)[type];a.click();setTimeout(()=>URL.revokeObjectURL(url),0);
 }).catch(()=>setMessage('Berkas tidak dapat diverifikasi.')).finally(()=>setBusy(false));}}>Unduh berkas berizin</button>{message&&<p role="status">{message}</p>}</details>;
}
export function ProposalApprovalPanel({identifier,actor,revision,status}:{identifier:string;actor:string;revision:number;status:string}){
 const authority=useAuthority();const auth=authSnapshot();const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 if(!authority?.review_sites.includes(auth.site))return <p>Persetujuan memerlukan reviewer yang ditunjuk untuk lokasi ini.</p>;
 return <section><p>Status approval: {status}; penerapan koreksi numerik tetap unavailable.</p><label>Alasan persetujuan usulan<input value={reason} onChange={e=>setReason(e.target.value)} /></label>
 <button disabled={busy||!reason.trim()||actor===auth.session?.principal_id||revision!==0} onClick={()=>{setBusy(true);void once(`/demo/v0.1/reviews/${identifier}/approval`,JSON.stringify({expected_version:1,expected_revision:revision,reason}),'application/json').then(setMessage).finally(()=>setBusy(false));}}>Setujui usulan (belum diterapkan)</button>{actor===auth.session?.principal_id&&<p>Anda tidak dapat menyetujui usulan sendiri.</p>}{message&&<p role="status">{message}</p>}</section>;
}
