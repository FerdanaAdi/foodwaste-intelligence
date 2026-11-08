import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, Outlet, useNavigate } from 'react-router';
import { authSnapshot, subscribeAuth, checkSession, invalidateAuth, listenForAuthChanges,
  login, logout, readIntents, selectSite } from '@/backend/auth';
import { CAPTURE_JOURNAL_KEY } from '@/backend/write';
import { isUUID } from '@/backend/contract';

export default function BackendAuthBoundary() {
  const auth = useSyncExternalStore(subscribeAuth, authSnapshot);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const privateRoot = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => { setUsername(''); setPassword(''); }, [auth.generation]);
  function refresh() {
    const generation = authSnapshot().generation;
    void readIntents().catch(() => {
      if (authSnapshot().generation === generation) setRecoveryError('Intent tidak dapat diverifikasi.');
    });
  }
  const [legacyBlocked] = useState(() => {
    try { const value = sessionStorage.getItem(CAPTURE_JOURNAL_KEY); return !!value && !isUUID(value); }
    catch { return true; }
  });
  useEffect(() => {
    if (legacyBlocked) return;
    const close = listenForAuthChanges();
    if (!legacyBlocked && authSnapshot().phase !== 'ready') void checkSession();
    const hide = () => {
      if (privateRoot.current) privateRoot.current.hidden = true;
      invalidateAuth('Data privat ditutup sampai sesi diverifikasi kembali.', 'checking');
    };
    const focus = () => { hide(); void checkSession(); };
    const visibility = () => { if (document.hidden) hide(); else focus(); };
    window.addEventListener('blur', hide);
    window.addEventListener('focus', focus);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', focus);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      close(); window.removeEventListener('blur', hide); window.removeEventListener('focus', focus);
      window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', focus);
      document.removeEventListener('visibilitychange', visibility);
      invalidateAuth();
    };
  }, []);
  useEffect(() => {
    setRecoveryError('');
    if (legacyBlocked) return;
    if (auth.phase === 'ready') {
      let active = true;
      void readIntents().catch(() => { if (active) setRecoveryError('Pemulihan intent belum terverifikasi. Capture ditutup; coba GET kembali.'); });
      return () => { active = false; };
    }
  }, [auth.generation, auth.phase]);
  if (legacyBlocked) return <p role="alert">Journal lama belum terikat actor. Akses ditutup untuk rekonsiliasi terotorisasi; detail tidak ditampilkan dan bukti tidak dihapus.</p>;
  if (auth.phase !== 'ready') return <section className="space-y-4" aria-label="Autentikasi backend sintetis">
    <h1 className="text-2xl font-bold">Masuk backend sintetis</h1>
    <p>Cookie sesi HttpOnly; hanya HTTPS lokal yang disetujui. Data DemoStore tetap terpisah.</p>
    {auth.message && <p role="alert">{auth.message}</p>}
    {auth.phase === 'checking' ? <p role="status">Memverifikasi sesi…</p> : <form className="space-y-3" onSubmit={e => {
      e.preventDefault(); const credential = password, account = username; setPassword(''); setUsername('');
      void login(account, credential).then(() => navigate('/backend-demo', { replace: true })).catch(() => {});
    }}>
      <label className="block">Akun sintetis<input className="block w-full rounded border p-2" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required /></label>
      <label className="block">Password<input className="block w-full rounded border p-2" type="password" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      <button className="rounded border px-4 py-2" type="submit">Masuk</button>
    </form>}
    <button className="rounded border px-4 py-2" onClick={() => { invalidateAuth('', 'checking'); void checkSession(); }}>Periksa sesi (GET saja)</button>
  </section>;
  return <div ref={privateRoot} className="space-y-5">
    <section className="rounded border bg-white p-3 space-y-2" aria-label="Sesi backend aktif">
      <p className="break-all">Principal sintetis: {auth.session!.principal_id}</p>
      <label className="block">Site berizin<select className="block w-full rounded border p-2" value={auth.site} onChange={e => selectSite(e.target.value)}>
        {auth.session!.sites.map(s => <option key={s.site_id} value={s.site_id}>{s.site_id}</option>)}
      </select></label>
      <button className="rounded border px-4 py-2" onClick={() => { setUsername(''); setPassword(''); navigate('/backend-demo', { replace: true }); void logout(); }}>Keluar</button>
      <p className="text-sm">Draft hanya di memory dan ditutup saat sesi/site berubah atau halaman kehilangan fokus.</p>
    </section>
    {recoveryError && <p role="alert">{recoveryError}</p>}
    {auth.intents === null ? <p role="status">Memeriksa intent privat sebelum membuka data…</p> : <>
      <section className="rounded border p-3 space-y-2" aria-label="Pemulihan intent privat">
        <h2 className="font-semibold">Intent privat untuk site aktif</h2>
        {auth.intents.map(intent => <div key={intent.intent_id}>
          {intent.state === 'registered' ? <p role="alert">UNCONFIRMED: hasil operasi belum terkonfirmasi. Jangan kirim ulang.</p>
            : <p>Hasil commit terkonfirmasi oleh server. {intent.event_id && <Link className="underline" to={`/backend-demo/events/${intent.event_id}`}>Buka hasil terkonfirmasi (GET)</Link>}</p>}
        </div>)}
        <button className="rounded border px-3 py-2" onClick={refresh}>Periksa intent (GET saja)</button>
      </section>
      <div key={`${auth.session!.auth_context_id}:${auth.generation}:${auth.site}`}><Outlet /></div>
    </>}
    {auth.intents === null && <button onClick={refresh}>Coba pemulihan GET</button>}
  </div>;
}
