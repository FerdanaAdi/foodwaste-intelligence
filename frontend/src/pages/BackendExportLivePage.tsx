import { useState } from "react";
import { downloadExport, fetchAuthorizedExport, EXPORT_DATASETS,
         type ExportDataset, type ExportDelivery, type ExportFilters } from "@/backend/export-live";
import { permits } from "@/backend/auth";
import { AccessDeniedState, ServiceUnavailableState } from "@/components/states/DisplayStates";

const field = "w-full rounded border border-slate-300 bg-white p-2";

/** Live authorized CSV/JSON export (FR-008). Server-side scope on every request;
 *  XLSX is NOT available (OD-006 OPEN) and this page says so explicitly. */
export default function BackendExportLivePage() {
  const [dataset, setDataset] = useState<ExportDataset>("events");
  const [filters, setFilters] = useState<ExportFilters>({});
  const [delivery, setDelivery] = useState<ExportDelivery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!permits('event.read')) return <AccessDeniedState reason="Peran pada site aktif tidak memiliki izin membaca untuk ekspor." />;

  async function run() {
    setBusy(true); setError(null); setDelivery(null);
    try { setDelivery(await fetchAuthorizedExport(dataset, filters, new AbortController().signal)); }
    catch (err) { setDelivery(null); setError(err instanceof Error ? err.message : "Ekspor gagal."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-6">
    <header className="space-y-2">
      <h1 className="text-2xl font-bold">Ekspor {dataset === "metadata" ? "JSON" : "CSV"} — LIVE BACKEND (sintetis)</h1>
      <p>Server memeriksa ulang sesi dan izin site untuk setiap permintaan; filter tidak dapat memperluas scope. Delivery terikat sesi (no-store), tanpa URL presigned atau berkas cache.</p>
      <p className="text-sm text-amber-800">XLSX belum tersedia: format/kebijakan menunggu keputusan Owner (OD-006). Baris measurement tidak dijumlahkan menjadi generation.</p>
    </header>

    <section className="rounded border bg-white p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">Dataset
          <select className={field} disabled={busy} value={dataset} onChange={e => { setDataset(e.target.value as ExportDataset); setDelivery(null); }}>
            {EXPORT_DATASETS.map(v => <option key={v} value={v}>{v === "metadata" ? "Metadata (JSON)" : v === "events" ? "Kejadian (CSV)" : "Pengukuran (CSV)"}</option>)}
          </select>
        </label>
        <label className="block">Jenis event
          <select className={field} value={filters.event_type ?? ""} onChange={e => setFilters(f => ({ ...f, event_type: e.target.value }))}>
            <option value="">— Semua —</option>
            <option value="at_risk_surplus">at_risk_surplus</option>
            <option value="actual_loss_discard">actual_loss_discard</option>
          </select>
        </label>
        <label className="block">Tanggal operasi dari<input className={field} value={filters.operation_date_from ?? ""} onChange={e => setFilters(f => ({ ...f, operation_date_from: e.target.value }))} placeholder="YYYY-MM-DD" /></label>
        <label className="block">Tanggal operasi sampai<input className={field} value={filters.operation_date_to ?? ""} onChange={e => setFilters(f => ({ ...f, operation_date_to: e.target.value }))} placeholder="YYYY-MM-DD" /></label>
      </div>
      <button type="button" onClick={() => void run()} disabled={busy} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">
        {busy ? "Menyiapkan ekspor…" : "Ambil ekspor dari server"}
      </button>
    </section>

    {error && <ServiceUnavailableState detail={error} />}
    {delivery && <section className="rounded border bg-white p-4 space-y-2" aria-label="Hasil ekspor">
      <p role="status" className="text-sm">Format {delivery.format} · scope site {delivery.scopeSite} · {delivery.events} event · {delivery.measurements} measurement.</p>
      <button type="button" className="rounded border px-4 py-2" onClick={() => downloadExport(delivery)}>
        Unduh {delivery.filename}
      </button>
    </section>}
  </div>;
}
