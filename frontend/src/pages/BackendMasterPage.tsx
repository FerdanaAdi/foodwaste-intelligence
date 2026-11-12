import { useEffect, useState, useSyncExternalStore } from "react";
import { readBackendMaster } from "@/backend/client";
import { authSnapshot, subscribeAuth } from "@/backend/auth";
import { EmptyState, LoadingState, ServiceUnavailableState } from "@/components/states/DisplayStates";

/** Live master reference viewer (FR-002 read scope). Values come only from
 *  approved sources; write/mapping policy is OPEN (OD-ZC02, Gate B), so this
 *  page exposes no mutation and registries may legitimately be empty. */
export default function BackendMasterPage() {
  const auth = useSyncExternalStore(subscribeAuth, authSnapshot);
  const [namespaces, setNamespaces] = useState<import("@/backend/client").MasterNamespace[] | null>(null);
  const [rows, setRows] = useState<import("@/backend/client").MasterReference[] | null>(null);
  const [namespace, setNamespace] = useState<string>("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.site) return;
    const controller = new AbortController();
    setLoading(true); setError(null);
    void readBackendMaster(controller.signal)
      .then(data => { setNamespaces(data.namespaces); setRows(data.references); })
      .catch(err => { if (!controller.signal.aborted) { setError(err instanceof Error ? err.message : "Katalog master gagal dibaca."); setNamespaces(null); setRows(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [auth.site, auth.generation, namespace, includeInactive]);

  const visible = (rows ?? []).filter(row => (!namespace || row.namespace === namespace)
    && (includeInactive || row.status === "active"));
  return <div className="space-y-6">
    <header className="space-y-2">
      <h1 className="text-2xl font-bold">Master Data — LIVE BACKEND (sintetis)</h1>
      <p>Referensi terverifikasi versi dari PostgreSQL. Registry mulai kosong; nilai hanya ditambahkan dari sumber yang disetujui — halaman ini tidak menyediakan penulisan.</p>
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
              {["Namespace", "Kode", "Versi", "Status", "Label", "Diganti oleh", "Waktu perubahan"].map(h => <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>{visible.map(row => <tr key={`${row.namespace}/${row.code}/${row.version}`} className="border-t border-slate-200">
              <td className="px-3 py-2">{row.namespace}</td>
              <td className="px-3 py-2 font-mono">{row.code}</td>
              <td className="px-3 py-2">v{row.version}{row.supersedes_version ? ` (menggantikan v${row.supersedes_version})` : ""}</td>
              <td className="px-3 py-2">{row.status}</td>
              <td className="px-3 py-2">{row.label}</td>
              <td className="px-3 py-2">{row.changed_by}</td>
              <td className="px-3 py-2">{row.changed_at}</td>
            </tr>)}</tbody>
          </table>
        </div>}
    </>}
  </div>;
}
