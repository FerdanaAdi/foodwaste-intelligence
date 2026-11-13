import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { authSnapshot, subscribeAuth, permits } from '@/backend/auth';
import { changeMembership, membershipLocked, readMemberships } from '@/backend/memberships';
import type { Member, MemberAction } from '@/backend/memberships';

export default function BackendMembershipPage() {
  const auth = useSyncExternalStore(subscribeAuth, authSnapshot);
  const [rows, setRows] = useState<Member[] | null>(null);
  const [target, setTarget] = useState('');
  const [role, setRole] = useState('reader');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const dispatching = useRef(false);
  const permitted = permits('membership.manage');
  const context = `${auth.generation}:${auth.site}`;
  const [loadedContext, setLoadedContext] = useState('');
  useEffect(() => {
    setRows(null); setTarget(''); setReason(''); setMessage(''); setLoadedContext('');
    if (!permitted) return;
    const controller = new AbortController(); let active = true;
    void readMemberships(controller.signal).then(value => {
      if (active) { setRows(value); setLoadedContext(context); }
    }).catch(() => { if (active) setMessage('Daftar akses belum dapat dibaca. Tidak ada data contoh pengganti.'); });
    return () => { active = false; controller.abort(); };
  }, [context, permitted, revision]);
  if (!permitted) return <p role="alert">Tidak ada izin administrasi lokasi ini. Hak penulis/pembaca tidak memberikan hak administrator.</p>;
  const member = loadedContext === context ? rows?.find(row => row.principal_id === target) : undefined;
  const locked = !!member && membershipLocked(member.principal_id);
  const self = !!member && member.principal_id === auth.session?.principal_id;
  async function submit(action: MemberAction) {
    if (!member || busy || dispatching.current || locked || self || !reason.trim()) return;
    const generation = auth.generation;
    dispatching.current = true; setBusy(true); setMessage('');
    try {
      const result = await changeMembership(member, action, action === 'grant' || action === 'change_role' ? role : null, reason);
      if (authSnapshot().generation !== generation || authSnapshot().site !== auth.site) return;
      setMessage(result === 'saved' ? 'Perubahan akses dan audit tersimpan bersama. Muat ulang daftar untuk melihat status terbaru.' :
        result === 'rejected' ? 'Perubahan ditolak. Muat ulang daftar dan periksa izin serta status terbaru.' :
        'Hasil penyimpanan belum diketahui (UNKNOWN). Jangan kirim ulang. Pemeriksaan daftar tidak membuka kunci.');
    } finally { dispatching.current = false; setBusy(false); }
  }
  return <section className="space-y-4">
    <h1 className="text-2xl font-bold">Administrasi Akses Lokasi — sintetis</h1>
    <p>Hanya roster sintetis lokasi berizin. Tidak membuat akun, mendelegasikan admin, atau mengubah akses sendiri.</p>
    <button disabled={busy} onClick={() => setRevision(x => x + 1)}>Muat ulang daftar (GET)</button>
    {message && <p role="status">{message}</p>}
    {rows === null && !message && <p role="status">Memuat daftar akses…</p>}
    {rows?.length === 0 && <p>Belum ada anggota atau roster yang tersedia.</p>}
    <fieldset disabled={busy || rows === null || loadedContext !== context} className="space-y-3">
      <label className="block">Anggota roster lokasi<select value={target} onChange={e => { setTarget(e.target.value); setMessage(''); }}>
        <option value="">Pilih anggota</option>{rows?.map(row => <option key={row.principal_id} value={row.principal_id}>{row.username}</option>)}
      </select></label>
      {member && <>
        <p>Peran: {member.role ?? 'Belum diberi akses'} · Status: {member.active === null ? 'Belum terdaftar' : member.active ? 'Aktif' : 'Dicabut'}</p>
        {self && <p role="alert">Anda tidak dapat mengubah akses sendiri.</p>}
        {locked && <p role="alert">Operasi sebelumnya belum terkonfirmasi. Pengiriman terkunci, termasuk setelah refresh atau masuk ulang pada tab ini. GET bukan bukti bahwa operasi gagal. Tidak ada retry otomatis.</p>}
        <label className="block">Peran operasional<select value={role} onChange={e => setRole(e.target.value)}><option value="reader">Pembaca</option><option value="writer">Penulis</option></select></label>
        <label className="block">Alasan perubahan<textarea value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} required /></label>
        <fieldset disabled={busy || self || locked || !reason.trim()} className="flex flex-wrap gap-2">
          {member.active === null && member.eligible && member.enabled && <button onClick={() => void submit('grant')}>Berikan akses</button>}
          {member.active === true && <><button disabled={role === member.role || !member.enabled || !member.eligible} onClick={() => void submit('change_role')}>Ubah peran</button><button onClick={() => void submit('revoke')}>Cabut akses</button></>}
          {member.active === false && member.eligible && member.enabled && <button onClick={() => void submit('reactivate')}>Aktifkan kembali</button>}
        </fieldset>
      </>}
    </fieldset>
    <p className="text-sm">Kunci UNKNOWN hanya pada principal, lokasi dan target ini di tab yang sama. Bukan jaminan exactly-once lintas tab/perangkat. Kelayakan dan izin diperiksa kembali oleh server.</p>
  </section>;
}
