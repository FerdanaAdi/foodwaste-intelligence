import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { listBackendEvents, type LedgerFilters } from "@/backend/client";
import { authSnapshot, permits, subscribeAuth } from "@/backend/auth";
import { AccessDeniedState, EmptyState, LoadingState, ServiceUnavailableState } from "@/components/states/DisplayStates";

const field = "w-full rounded border border-slate-300 bg-white p-2";
const EMPTY_FILTERS: LedgerFilters = { event_type: "", stage_code: "", operation_date_from: "", operation_date_to: "", page: 1 };
const PAGE_SIZE = 20;

/** Authorised live event ledger (FR-003). Site scope is enforced by the backend;
 *  unsupported filters are rejected by the server, never silently ignored. */
export default function BackendLedgerPage() {
  const auth = useSyncExternalStore(subscribeAuth, authSnapshot);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [total, setTotal] = useState<number | null>(null);
  const [rows, setRows] = useState<import("@/backend/contract").BackendEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const canRead = permits('event.read');

  useEffect(() => {
    if (!canRead || !auth.site) return;
    const controller = new AbortController();
    setLoading(true); setError(null);
    void listBackendEvents({ ...applied, page: applied.page ?? 1 }, controller.signal)
      .then(page => { setRows(page.events); setTotal(page.total); })
      .catch(error => {
        if (controller.signal.aborted) return;
        setRows(null); setTotal(null);
        setError(error instanceof Error ? error.message : "Pembacaan ledger gagal.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [auth.site, auth.generation, applied, canRead]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    for (const key of ["operation_date_from", "operation_date_to"] as const) {
      if (filters[key] && !/^\d{4}-\d{2}-\d{2}$/.test(filters[key]!)) {
        setFormError(`${key} harus berformat YYYY-MM-DD.`); return;
      }
    }
    setApplied({ ...filters, page: 1 });
  }

  if (!canRead && auth.phase === "ready") return <AccessDeniedState reason="Peran pada site aktif tidak memiliki izin membaca ledger (event.read)." />;
  return <div className="space-y-6">
    <header className="space-y-2">
      <h1 className="text-2xl font-bold">Ledger Event — LIVE BACKEND (sintetis)</h1>
      <p>Daftar kejadian dari FastAPI/PostgreSQL pada site berizin aktif. Satu event dengan banyak pengukuran tetap tampil satu baris; jumlah pengukuran tidak dijumlahkan sebagai kejadian.</p>
      <p className="text-sm text-slate-600">Filter didukung server: jenis event, stage code, rentang tanggal operasi. Tanggal operasi disuplai operator, tidak dihitung dari waktu kejadian.</p>
    </header>

    <form onSubmit={submit} className="rounded border bg-white p-4 space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">Jenis event
          <select className={field} value={filters.event_type ?? ""} onChange={e => setFilters(f => ({ ...f, event_type: e.target.value }))}>
            <option value="">— Semua —</option>
            <option value="at_risk_surplus">at_risk_surplus</option>
            <option value="actual_loss_discard">actual_loss_discard</option>
          </select>
        </label>
        <label className="block">Stage code<input className={field} value={filters.stage_code ?? ""} onChange={e => setFilters(f => ({ ...f, stage_code: e.target.value }))} placeholder="mis. preparation" /></label>
        <label className="block">Tanggal operasi dari<input className={field} value={filters.operation_date_from ?? ""} onChange={e => setFilters(f => ({ ...f, operation_date_from: e.target.value }))} placeholder="YYYY-MM-DD" aria-invalid={!!formError} /></label>
        <label className="block">Tanggal operasi sampai<input className={field} value={filters.operation_date_to ?? ""} onChange={e => setFilters(f => ({ ...f, operation_date_to: e.target.value }))} placeholder="YYYY-MM-DD" /></label>
      </div>
      {formError && <p role="alert" className="text-red-700">{formError}</p>}
      <button type="submit" disabled={!canRead} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">Terapkan filter</button>
    </form>

    {loading && <LoadingState label="Memuat ledger dari backend…" />}
    {!loading && error && <ServiceUnavailableState detail={error} />}
    {!loading && !error && rows !== null && rows.length === 0 && <EmptyState title="Tidak ada event pada scope/filter ini"
      description="Ledger kosong bukan berarti pengukuran nol; belum ada kejadian yang tercatat untuk site berizin dengan filter terpasang." />}
    {!loading && !error && rows !== null && rows.length > 0 && <section className="space-y-2">
      <p role="status" className="text-sm">Menampilkan {rows.length} dari {total} event (halaman {applied.page ?? 1}, {PAGE_SIZE}/halaman). Sumber: PostgreSQL berizin.</p>
      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Ledger event backend, urutan waktu kejadian menurun dengan penstabil ID</caption>
          <thead className="bg-slate-100">
            <tr>{["Event ID", "Jenis", "Stage", "Tanggal operasi", "Waktu kejadian", "Tercatat"].map(h => <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(row => <tr key={row.event_id} className="border-t border-slate-200">
              <td className="px-3 py-2"><Link className="text-sky-700 underline break-all" to={`/backend-demo/events/${row.event_id}`}>{row.event_id}</Link></td>
              <td className="px-3 py-2">{row.event_type}</td>
              <td className="px-3 py-2">{row.stage_code ?? <span className="text-slate-500">—</span>}</td>
              <td className="px-3 py-2">{row.operation_date ?? <span className="text-slate-500">tidak disuplai</span>}</td>
              <td className="px-3 py-2">{row.occurred_at}</td>
              <td className="px-3 py-2">{row.recorded_at}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button type="button" className="rounded border px-3 py-2 disabled:opacity-50" disabled={(applied.page ?? 1) <= 1}
          onClick={() => setApplied(a => ({ ...a, page: (a.page ?? 1) - 1 }))}>Halaman sebelumnya</button>
        <button type="button" className="rounded border px-3 py-2 disabled:opacity-50"
          disabled={rows.length < PAGE_SIZE || (applied.page ?? 1) * PAGE_SIZE >= (total ?? 0)}
          onClick={() => setApplied(a => ({ ...a, page: (a.page ?? 1) + 1 }))}>Halaman berikutnya</button>
      </div>
    </section>}
  </div>;
}
