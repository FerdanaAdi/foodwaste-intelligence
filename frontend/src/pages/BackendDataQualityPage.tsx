import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { readBackendDataQuality, type DataQualityLive } from "@/backend/client";
import { authSnapshot, permits, subscribeAuth } from "@/backend/auth";
import { AccessDeniedState, EmptyState, LoadingState, ServiceUnavailableState } from "@/components/states/DisplayStates";

/** Live site-scoped data-quality dashboard (FR-007). Count-only: event != measurement,
 *  measured_zero != missing, estimated reported separately; no mass totals, no KPI output. */
export default function BackendDataQualityPage() {
  const auth = useSyncExternalStore(subscribeAuth, authSnapshot);
  const [data, setData] = useState<DataQualityLive | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const canRead = permits('event.read');

  useEffect(() => {
    if (!canRead || !auth.site) return;
    const controller = new AbortController();
    setLoading(true); setError(null);
    void readBackendDataQuality(controller.signal)
      .then(setData)
      .catch(err => { if (!controller.signal.aborted) { setData(null); setError(err instanceof Error ? err.message : "Ringkasan mutu data gagal dibaca."); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [auth.site, auth.generation, canRead]);

  if (!canRead && auth.phase === "ready") return <AccessDeniedState reason="Peran pada site aktif tidak memiliki izin membaca ringkasan mutu data." />;
  const summary = data?.summary;
  return <div className="space-y-6">
    <header className="space-y-2">
      <h1 className="text-2xl font-bold">Mutu Data — LIVE BACKEND (sintetis)</h1>
      <p>Ringkasan hitungan dari PostgreSQL pada site berizin aktif. Ini bukan KPI limbah; tidak ada agregasi massa dan OP-08/FI-02/NI-03 tetap HELD.</p>
      <p className="text-sm text-slate-600">Denominator: jumlah event dalam scope site. Event tanpa pengukuran dilaporkan terpisah, bukan dihitung sebagai nol pangan.</p>
    </header>

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
        {data!.records.length === 0 ? <EmptyState title="Tidak ada event pada site ini" /> : <ul className="mt-2 space-y-2">
          {data!.records.map(record => <li key={record.event_id} className="rounded bg-slate-50 px-3 py-2 text-sm">
            <Link className="text-sky-700 underline break-all" to={`/backend-demo/events/${record.event_id}`}>{record.event_id}</Link>
            <span className="ml-2 text-slate-600">{record.event_type} · {record.measurement_ids.length} pengukuran · {record.observation_statuses.join(", ") || "belum ada pengukuran"}</span>
          </li>)}
        </ul>}
      </section>
    </div>}
  </div>;
}
