import { MasterAdministrationPanel } from "@/components/operational/CompletionTools";
import { useEffect, useState, useSyncExternalStore } from "react";
import { readBackendMaster, readBackendMasterHistory } from "@/backend/client";
import { authSnapshot, subscribeAuth } from "@/backend/auth";
import { EmptyState, LoadingState, ServiceUnavailableState } from "@/components/states/DisplayStates";

/** Live versioned master viewer; only explicitly appointed namespace administrators
 * may append approved-source versions. Category/hierarchy mapping remains OPEN. */
export default function BackendMasterPage() {
  const auth = useSyncExternalStore(subscribeAuth, authSnapshot);
  const [namespaces, setNamespaces] = useState<import("@/backend/client").MasterNamespace[] | null>(null);
  const [rows, setRows] = useState<import("@/backend/client").MasterReference[] | null>(null);
  const [namespace, setNamespace] = useState<string>("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{namespace:string;code:string} | null>(null);
  const [history, setHistory] = useState<import('@/backend/client').MasterReference[] | null>(null);
  const [historyError,setHistoryError] = useState('');
  useEffect(() => {
    setHistory(null);setHistoryError('');
    if (!selected) return;
    let active=true; const controller=new AbortController();
    void readBackendMasterHistory(selected.namespace,selected.code,controller.signal).then(rows => {
      if(active)setHistory(rows);
    }).catch(() => {if(active)setHistoryError('Riwayat versi tidak dapat diverifikasi.');});
    return () => {active=false;controller.abort();};
  }, [selected,auth.generation,auth.site]);

  useEffect(() => {
    if (!auth.site) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true); setError(null); setRows(null);setSelected(null);
    void readBackendMaster(controller.signal,{namespace,includeInactive})
      .then(data => { if(active){setNamespaces(data.namespaces); setRows(data.references);} })
      .catch(err => { if (!controller.signal.aborted) { setError(err instanceof Error ? err.message : "Katalog master gagal dibaca."); setNamespaces(null); setRows(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => {active=false;controller.abort();};
  }, [auth.site, auth.generation, namespace, includeInactive]);

  const visible = (rows ?? []).filter(row => (!namespace || row.namespace === namespace)
    && (includeInactive || row.status === "active"));
  return <div className="space-y-6">
    <MasterAdministrationPanel />
    <header className="space-y-2">
      <h1 className="text-2xl font-bold">Master Data — LIVE BACKEND (sintetis)</h1>
      <p>Referensi terverifikasi versi dari PostgreSQL. Registry mulai kosong; nilai hanya ditambahkan dari sumber yang disetujui — penulisan hanya tersedia bagi administrator namespace yang ditunjuk Owner.</p>
      <p className="text-sm text-slate-600">Status vocabulary selalu provisional; pemetaan kategori/hierarki menunggu keputusan OD-ZC02 dan Gate B. Namespace <code>kpi</code> direservasi dan tidak tersedia.</p>
    </header>

    {loading && <LoadingState label="Memuat katalog master…" />}
    {!loading && error && <ServiceUnavailableState detail={error} />}
    {!loading && !error && namespaces && <>
      <section className="flex flex-wrap gap-2" aria-label="Filter namespace">
        <button type="button" onClick={() => setNamespace("")}
          className={`rounded border px-3 py-2 text-sm ${namespace === "" ? "bg-sky-700 text-white" : "bg-white"}`}>Semua namespace</button>
        {namespaces.map(item => <button key={item.namespace} type="button"
          onClick={() => setNamespace(item.namespace)}
          className={`rounded border px-3 py-2 text-sm ${namespace === item.namespace ? "bg-sky-700 text-white" : "bg-white"}`}>
          {item.namespace} ({item.code_count})</button>)}
      </section>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} />
        Tampilkan status inactive (versi terakhir saja)
      </label>
      {visible.length === 0 ? <EmptyState title="Registry kosong untuk filter ini"
        description="Bukan kegagalan backend: belum ada referensi yang diisi dari sumber disetujui. Riwayat versi tetap terjaga saat data mulai diisi." /> :
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Referensi master versi terakhir per kode</caption>
            <thead className="bg-slate-100"><tr>
              {["Namespace", "Kode", "Versi", "Status", "Label", "Diganti oleh", "Waktu perubahan", "Riwayat"].map(h => <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>{visible.map(row => <tr key={`${row.namespace}/${row.code}/${row.version}`} className="border-t border-slate-200">
              <td className="px-3 py-2">{row.namespace}</td>
              <td className="px-3 py-2 font-mono">{row.code}</td>
              <td className="px-3 py-2">v{row.version}{row.supersedes_version ? ` (menggantikan v${row.supersedes_version})` : ""}</td>
              <td className="px-3 py-2">{row.status}</td>
              <td className="px-3 py-2">{row.label}</td>
              <td className="px-3 py-2">{row.changed_by}</td>
              <td className="px-3 py-2">{row.changed_at}</td>
              <td className="px-3 py-2"><button onClick={() => setSelected({namespace:row.namespace,code:row.code})}>Lihat riwayat {row.namespace}/{row.code}</button></td>
            </tr>)}</tbody>
          </table>
        </div>}
    </>}
    {selected && <section aria-label="Riwayat versi master" className="rounded border p-3">
      <h2>Riwayat {selected.namespace}/{selected.code}</h2>
      {historyError && <p role="alert">{historyError}</p>}
      {!history && !historyError && <p role="status">Memuat riwayat versi…</p>}
      {history?.map(row => <article key={row.reference_id}><h3>Versi {row.version}: {row.label}</h3>
        <p>Status: {row.status}; diubah oleh {row.changed_by}; {row.changed_at}</p>
        <p>{row.definition ?? 'Definisi belum dicatat'}</p><p>{row.note ?? 'Catatan belum dicatat'}</p></article>)}
      <p>Versi lama tetap tersimpan. Halaman ini tidak memberi izin mengubah katalog.</p>
    </section>}
  </div>;
}
