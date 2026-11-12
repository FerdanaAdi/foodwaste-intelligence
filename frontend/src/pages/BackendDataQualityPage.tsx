import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { readBackendDataQuality, validateDataQualityFilters, type DataQualityLive, type DataQualityFilters } from "@/backend/client";
import { authSnapshot, permits, subscribeAuth } from "@/backend/auth";
import { AccessDeniedState, EmptyState, LoadingState, ServiceUnavailableState } from "@/components/states/DisplayStates";

/** Live site-scoped data-quality dashboard (FR-007). Count-only: event != measurement,
 *  measured_zero != missing, estimated reported separately; no mass totals, no KPI output. */
const EMPTY_FILTERS: DataQualityFilters = { operation_date_from: "", operation_date_to: "", stage_code: "" };

export default function BackendDataQualityPage() {
  const auth = useSyncExternalStore(subscribeAuth, authSnapshot);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [view, setView] = useState<{ key: string; data: DataQualityLive | null; error: string | null; loading: boolean }>(
    { key: '', data: null, error: null, loading: true });
  const canRead = permits('event.read');
  const requestKey = JSON.stringify([auth.generation, auth.site, applied]);
  // A new filter/site/session never renders the previous request's private result.
  const loading = view.key !== requestKey || view.loading;
  const data = view.key === requestKey ? view.data : null;
  const error = view.key === requestKey ? view.error : null;

  useEffect(() => {
    if (!canRead || !auth.site) return;
    const controller = new AbortController();
    let current = true;
    setView({ key: requestKey, data: null, error: null, loading: true });
    void readBackendDataQuality(controller.signal, applied)
      .then(data => { if (current) setView({ key: requestKey, data, error: null, loading: false }); })
      .catch(err => { if (current && !controller.signal.aborted)
        setView({ key: requestKey, data: null, error: err instanceof Error ? err.message : 'Ringkasan mutu data gagal dibaca.', loading: false }); });
    return () => { current = false; controller.abort(); };
  }, [requestKey, canRead]);

  if (!canRead && auth.phase === "ready") return <AccessDeniedState reason="Peran pada site aktif tidak memiliki izin membaca ringkasan mutu data." />;
  const summary = data?.summary;
  return <div className="space-y-6">
    <header className="space-y-2">
      <h1 className="text-2xl font-bold">Mutu Data — LIVE BACKEND (sintetis)</h1>
      <p>Ringkasan hitungan dari PostgreSQL pada site berizin aktif. Ini bukan KPI limbah; tidak ada agregasi massa dan OP-08/FI-02/NI-03 tetap HELD.</p>
      <p className="text-sm text-slate-600">Denominator: jumlah event dalam scope site dan filter aktif. Event tanpa pengukuran dilaporkan terpisah, bukan dihitung sebagai nol pangan.</p>
    </header>

    <form className="rounded border bg-white p-4 space-y-3" aria-label="Filter mutu data" onSubmit={event => {
      event.preventDefault();
      try { validateDataQualityFilters(filters); setFilterError(null); setApplied({ ...filters }); }
      catch (err) { setFilterError(err instanceof Error ? err.message : 'Filter tidak valid.'); }
    }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>Tanggal kegiatan dapur dari<input type="date" className="block w-full rounded border p-2"
          value={filters.operation_date_from ?? ''} onChange={e => setFilters(f => ({ ...f, operation_date_from: e.target.value }))} /></label>
        <label>Tanggal kegiatan dapur sampai<input type="date" className="block w-full rounded border p-2"
          value={filters.operation_date_to ?? ''} onChange={e => setFilters(f => ({ ...f, operation_date_to: e.target.value }))} /></label>
        <label>Kode tahap kegiatan<input className="block w-full rounded border p-2" aria-describedby="dq-stage-help"
          value={filters.stage_code ?? ''} onChange={e => setFilters(f => ({ ...f, stage_code: e.target.value }))} /></label>
      </div>
      <p id="dq-stage-help" className="text-sm">Gunakan kode tahap pada catatan yang ada; kosongkan untuk semua tahap. Tidak ada daftar tahap baku baru.</p>
      <p className="text-sm">Tanggal kegiatan dapur berasal dari catatan, bukan dihitung dari waktu kejadian. Saat tanggal difilter, catatan tanpa tanggal kegiatan dapur tidak disertakan.</p>
      <div className="flex gap-2">
        <button type="submit" className="rounded border px-4 py-2">Terapkan filter</button>
        <button type="button" className="rounded border px-4 py-2" onClick={() => {
          setFilters(EMPTY_FILTERS); setApplied({ ...EMPTY_FILTERS }); setFilterError(null);
        }}>Reset filter</button>
      </div>
      {filterError && <p role="alert">{filterError}</p>}
    </form>
    <p aria-label="Filter aktif" className="text-sm">Filter aktif: tanggal kegiatan dapur {applied.operation_date_from || 'tanpa batas awal'} sampai {applied.operation_date_to || 'tanpa batas akhir'}; tahap {applied.stage_code || 'semua'}.</p>

    {loading && <LoadingState label="Memuat ringkasan mutu data…" />}
    {!loading && error && <ServiceUnavailableState detail={error} />}
    {!loading && !error && summary && <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Ringkasan hitungan">
        <div className="rounded border bg-white p-4"><p className="text-sm text-slate-600">Jumlah event</p><p className="text-2xl font-bold">{summary.event_count}</p></div>
        <div className="rounded border bg-white p-4"><p className="text-sm text-slate-600">Jumlah record pengukuran</p><p className="text-2xl font-bold">{summary.measurement_count}</p></div>
        <div className="rounded border bg-white p-4"><p className="text-sm text-slate-600">Event tanpa pengukuran</p><p className="text-2xl font-bold">{summary.unmeasured_event_count}</p><p className="text-xs text-slate-500">belum diukur ≠ nol terukur</p></div>
        <div className="rounded border bg-white p-4"><p className="text-sm text-slate-600">Status estimasi</p><p className="text-2xl font-bold">{summary.estimated_count}</p><p className="text-xs text-slate-500">bukan hasil timbang</p></div>
      </section>
      <section className="rounded border bg-white p-4" aria-label="Rincian status observasi">
        <h2 className="font-semibold">Status observasi</h2>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(summary.observation_counts).map(([status, count]) => <li key={status} className="flex justify-between rounded bg-slate-50 px-3 py-2 text-sm">
            <span>{status}</span><span className="font-semibold">{count}</span></li>)}
        </ul>
        <p className="mt-2 text-xs text-slate-500">missing/not_measured ≠ measured_zero; nol terukur hanya dari pengukuran sah dengan nilai 0.</p>
      </section>
      <section className="rounded border bg-white p-4" aria-label="Status validasi">
        <h2 className="font-semibold">Status validasi</h2>
        {Object.values(summary.validation_counts).every(v => v === 0)
          ? <p className="mt-2 text-sm text-slate-600">Belum dinilai — belum ada record status validasi tersimpan. Bukan berarti lolos validasi.</p>
          : <ul className="mt-2 grid gap-2 sm:grid-cols-3">{Object.entries(summary.validation_counts).map(([status, count]) =>
              <li key={status} className="flex justify-between rounded bg-slate-50 px-3 py-2 text-sm"><span>{status}</span><span className="font-semibold">{count}</span></li>)}</ul>}
      </section>
      <section className="rounded border bg-white p-4" aria-label="Drill-down sumber">
        <h2 className="font-semibold">Drill-down sumber ({data!.records.length} event)</h2>
        {data!.records.length === 0 ? <EmptyState title="Tidak ada kejadian pada lokasi dan filter aktif" /> : <ul className="mt-2 space-y-2">
          {data!.records.map(record => <li key={record.event_id} className="rounded bg-slate-50 px-3 py-2 text-sm">
            <Link className="text-sky-700 underline break-all" to={`/backend-demo/events/${record.event_id}`}>{record.event_id}</Link>
            <span className="ml-2 text-slate-600">{record.event_type} · {record.measurement_ids.length} pengukuran · {record.observation_statuses.join(", ") || "belum ada pengukuran"}</span>
          </li>)}
        </ul>}
      </section>
    </div>}
  </div>;
}
