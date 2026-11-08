import { useEffect, useRef, useState } from "react";
import {
  EVENT_EXPORT_COLUMNS, EXPORT_DATE_BASES, MEASUREMENT_EXPORT_COLUMNS,
  createSyntheticExportAdapter, exportRequestErrors, parseExportMetadata,
  type ConfirmedExport, type ExportAdapter, type ExportDateBasis, type ExportRequest,
  type SyntheticExportScenario,
} from "@/backend/export";
import { SYNTHETIC_SITE_ID } from "@/backend/write";

const field = "w-full rounded border border-slate-300 bg-white p-2";
const EXPORT_DOWNLOAD_FILES = ["events.csv", "measurements.csv", "metadata.json"] as const;

type RequestState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "denied"; message: string }
  | { phase: "unavailable"; message: string }
  | { phase: "fail-closed"; message: string }
  | { phase: "confirmed"; confirmed: ConfirmedExport };

function downloadFile(name: string, bytes: Uint8Array): void {
  const type = name.endsWith(".json") ? "application/json" : "text/csv;charset=utf-8";
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function MetadataPanel({ confirmed }: { confirmed: ConfirmedExport }) {
  const meta = confirmed.metadata;
  return <section aria-label="Metadata dan lineage ekspor" className="rounded border bg-white p-4 space-y-3">
    <h3 className="text-lg font-semibold">Metadata dan lineage ekspor</h3>
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      <div><dt className="font-semibold">Format</dt><dd>{meta.format}</dd></div>
      <div><dt className="font-semibold">Status</dt><dd>{meta.status}</dd></div>
      <div><dt className="font-semibold">generated_at (dari server)</dt><dd className="break-all font-mono">{meta.generated_at}</dd></div>
      <div><dt className="font-semibold">Cakupan site (scope_site_ids)</dt><dd className="break-all font-mono">{meta.scope_site_ids.join(", ")}</dd></div>
      <div><dt className="font-semibold">Jumlah baris</dt><dd>{meta.counts.events} event, {meta.counts.measurements} measurement (tanpa agregasi)</dd></div>
      <div><dt className="font-semibold">Urutan</dt><dd>{meta.ordering}</dd></div>
      <div className="sm:col-span-2"><dt className="font-semibold">Semantik baris</dt><dd>{meta.row_semantics}</dd></div>
      <div><dt className="font-semibold">Encoding CSV</dt><dd>{meta.csv.encoding}, delimiter &quot;{meta.csv.delimiter}&quot;, line ending {meta.csv.line_ending}, quote_all {String(meta.csv.quote_all)}</dd></div>
      <div><dt className="font-semibold">Token null</dt><dd className="font-mono">{meta.csv.null_token} — bukan kosong dan bukan nol</dd></div>
      <div className="sm:col-span-2"><dt className="font-semibold">Fidelitas desimal</dt><dd>{meta.decimal_fidelity}</dd></div>
      <div className="sm:col-span-2"><dt className="font-semibold">Pemilihan measurement</dt><dd>{meta.measurement_selection}</dd></div>
      <div className="sm:col-span-2"><dt className="font-semibold">Keamanan spreadsheet</dt><dd>{meta.spreadsheet_safety}</dd></div>
      <div className="sm:col-span-2"><dt className="font-semibold">Pemulihan teks sumber</dt><dd>{meta.restore_source_text}</dd></div>
      <div><dt className="font-semibold">KPI ditahan</dt><dd>{meta.held_kpis.join(", ")} (tetap HELD)</dd></div>
      <div><dt className="font-semibold">authorization_enforced</dt><dd>{String(meta.authorization_enforced)} — keputusan otorisasi bukan milik UI ini</dd></div>
    </dl>
    <div>
      <h4 className="font-semibold">Field sumber-saja (missing fields dieksplisitkan)</h4>
      <ul className="list-disc pl-6 text-sm">
        {Object.entries(meta.source_only_fields).map(([name, info]) => (
          <li key={name}>
            <span className="font-mono">{name}</span>: {info.provided} disediakan dalam ekspor ini;
            dukungan persistensi baseline: <strong>{info.baseline_persistence_support ? "true" : "false (tidak didukung)"}</strong>.
            {info.provided === 0 && " Nilai field ini tidak tersedia pada persistensi baseline dan dibiarkan null — tidak pernah diturunkan dari timestamp."}
          </li>
        ))}
      </ul>
    </div>
    <div>
      <h4 className="font-semibold">Sel yang di-escape (escaped_cells: {meta.escaped_cells.length})</h4>
      {meta.escaped_cells.length === 0
        ? <p className="text-sm">Tidak ada sel berbahaya pada ekspor ini.</p>
        : <table className="w-full text-sm"><thead><tr><th scope="col">file</th><th scope="col">record_id</th><th scope="col">column</th><th scope="col">prefix</th></tr></thead>
            <tbody>{meta.escaped_cells.map((cell, index) => <tr key={index}><td>{cell.file}</td><td className="break-all font-mono">{cell.record_id}</td><td>{cell.column}</td><td className="font-mono">{cell.prefix}</td></tr>)}</tbody></table>}
    </div>
    <div>
      <h4 className="font-semibold">Berkas dan sha256</h4>
      <ul className="list-disc pl-6 text-sm">
        <li><span className="font-mono">events.csv</span> — {EVENT_EXPORT_COLUMNS.length} kolom, sha256 <span className="break-all font-mono">{meta.files["events.csv"].sha256}</span></li>
        <li><span className="font-mono">measurements.csv</span> — {MEASUREMENT_EXPORT_COLUMNS.length} kolom, sha256 <span className="break-all font-mono">{meta.files["measurements.csv"].sha256}</span></li>
      </ul>
      <p className="text-sm">Simpan metadata.json bersama kedua CSV: token <span className="font-mono">\N</span> dan daftar escaped_cells hanya dapat dipulihkan dari metadata. Semua berkas berlabel SYNTHETIC/DEMO.</p>
    </div>
  </section>;
}

export default function BackendExportPage({ adapter }: { adapter?: ExportAdapter }) {
  const [scenario, setScenario] = useState<SyntheticExportScenario>("unavailable");
  const [useFixtureSite, setUseFixtureSite] = useState(true);
  const [extraSites, setExtraSites] = useState("");
  const [dateBasis, setDateBasis] = useState<ExportDateBasis | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<RequestState>({ phase: "idle" });
  const lastRequest = useRef<ExportRequest | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);

  function currentRequest(): ExportRequest {
    const extra = extraSites.split(/[\s,;]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
    return {
      site_ids: [...(useFixtureSite ? [SYNTHETIC_SITE_ID] : []), ...extra],
      date_from: dateFrom === "" ? null : dateFrom,
      date_to: dateTo === "" ? null : dateTo,
      date_basis: (dateBasis || "") as unknown as ExportDateBasis,
    };
  }

  async function runExport(request: ExportRequest) {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    lastRequest.current = request;
    setState({ phase: "loading" });
    const chosen = adapter ?? createSyntheticExportAdapter(scenario);
    try {
      const outcome = await chosen.requestExport(request, controller.signal);
      if (controller.signal.aborted) return;
      if (outcome.kind === "confirmed") {
        try {
          const metadata = parseExportMetadata(outcome.export.metadata);
          setState({ phase: "confirmed", confirmed: { metadata, files: outcome.export.files } });
        } catch (error) {
          setState({ phase: "fail-closed", message: error instanceof Error ? error.message : "Metadata ekspor tidak memenuhi kontrak." });
        }
      } else if (outcome.kind === "denied") {
        setState({ phase: "denied", message: outcome.message });
      } else {
        setState({ phase: "unavailable", message: outcome.message });
      }
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      setState({ phase: "unavailable", message: error instanceof Error ? error.message : "Permintaan ekspor gagal." });
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state.phase === "loading") return;
    const request = currentRequest();
    const errors = exportRequestErrors(request);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    void runExport(request);
  }

  const confirmed = state.phase === "confirmed" ? state.confirmed : null;
  const isEmptyExport = confirmed !== null && confirmed.metadata.counts.events === 0 && confirmed.metadata.counts.measurements === 0;
  const scope = lastRequest.current;

  return <div className="space-y-6">
    <header className="space-y-2">
      <h1 className="text-2xl font-bold">Ekspor CSV backend (kandidat integrasi)</h1>
      <p>Kontrak frontend untuk serializer FWI-EXPORT-01A (<span className="font-mono">fwi-synthetic-export-v0.1</span>, review independen masih PENDING). Ini hanya kandidat integrasi.</p>
      <p className="text-sm text-amber-800">Bukan sistem resmi BGN. Belum ada route ekspor backend yang disetujui, belum ada autentikasi produksi, dan tidak ada integrasi live yang diklaim. Keputusan otorisasi ekspor selalu berada di server; UI tidak pernah mengunduh sebelum server mengonfirmasi ketersediaan ekspor yang sah.</p>
      <p className="text-sm">Unduhan selalu dimulai oleh pengguna setelah konfirmasi — tidak ada unduhan otomatis. Field <span className="font-mono">operation_date</span> dan <span className="font-mono">validation_status</span> adalah field sumber-saja: tidak didukung persistensi baseline dan tidak pernah diturunkan. Tidak ada dukungan XLSX yang diklaim.</p>
    </header>

    <form onSubmit={submit} noValidate className="rounded border bg-white p-4 space-y-4" aria-label="Permintaan ekspor">
      <h2 className="text-lg font-semibold">Cakupan permintaan eksplisit</h2>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Site</legend>
        <label className="block">
          <input type="checkbox" checked={useFixtureSite} onChange={e => setUseFixtureSite(e.target.checked)} />
          {" "}Site fixture sintetis <span className="font-mono">{SYNTHETIC_SITE_ID}</span>
        </label>
        <label className="block">Site UUID tambahan (satu per baris, dipisah koma/spasi juga boleh)
          <textarea className={field} rows={2} value={extraSites} onChange={e => setExtraSites(e.target.value)} aria-invalid={!!fieldErrors.site_ids} />
        </label>
        {fieldErrors.site_ids && <p className="text-red-700" role="alert">{fieldErrors.site_ids}</p>}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Rentang tanggal (filter semantics masih OPEN)</legend>
        <label className="block">Basis tanggal filter
          <select className={field} value={dateBasis} onChange={e => setDateBasis(e.target.value as ExportDateBasis | "")} aria-invalid={!!fieldErrors.date_basis}>
            <option value="">— Pilih basis —</option>
            {EXPORT_DATE_BASES.map(basis => <option value={basis} key={basis}>{basis === "occurred_at" ? "occurred_at — waktu kejadian event" : "measured_at — waktu pengukuran"}</option>)}
          </select>
        </label>
        {fieldErrors.date_basis && <p className="text-red-700" role="alert">{fieldErrors.date_basis}</p>}
        <p className="text-sm">Basis filter hanya boleh timestamp yang benar-benar tersimpan. <span className="font-mono">operation_date</span> sumber-saja tidak dapat menjadi basis filter.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">Tanggal awal (inklusif, opsional)
            <input type="date" className={field} value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-invalid={!!fieldErrors.date_from} />
            {fieldErrors.date_from && <span className="text-red-700">{fieldErrors.date_from}</span>}
          </label>
          <label className="block">Tanggal akhir (inklusif, opsional)
            <input type="date" className={field} value={dateTo} onChange={e => setDateTo(e.target.value)} aria-invalid={!!fieldErrors.date_to} />
            {fieldErrors.date_to && <span className="text-red-700">{fieldErrors.date_to}</span>}
          </label>
        </div>
      </fieldset>
      <div className="rounded bg-slate-100 p-3 text-sm">
        <p className="font-semibold">Ringkasan cakupan yang akan diminta</p>
        <p>Site: {currentRequest().site_ids.length === 0 ? <em>belum ada</em> : <span className="break-all font-mono">{currentRequest().site_ids.join(", ")}</span>}</p>
        <p>Rentang tanggal: {dateFrom || "(tanpa batas awal)"} s.d. {dateTo || "(tanpa batas akhir)"} pada basis {dateBasis || "(belum dipilih)"}.</p>
        <p>Lingkup data: seluruh event dan seluruh measurement yang tersedia dalam cakupan — tanpa pemilihan pengukuran kanonik, tanpa agregasi, tanpa konversi massa.</p>
      </div>
      {adapter === undefined && <label className="block text-sm">Skenario adaptor sintetis (simulasi lokal — bukan backend, bukan otorisasi)
        <select className={field} value={scenario} onChange={e => setScenario(e.target.value as SyntheticExportScenario)}>
          <option value="unavailable">unavailable — belum ada route ekspor (realistis untuk baseline ini)</option>
          <option value="denied">denied — server menolak cakupan</option>
          <option value="empty">empty — ekspor sah dengan 0 baris</option>
          <option value="confirmed">confirmed — ekspor tersedia (fixture)</option>
        </select>
      </label>}
      <button type="submit" disabled={state.phase === "loading"} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">
        Minta konfirmasi ekspor
      </button>
    </form>

    {state.phase === "loading" && <p role="status" className="rounded border bg-white p-3">Meminta keputusan ekspor dari server… Tidak ada unduhan sampai server mengonfirmasi.</p>}

    {state.phase === "denied" && <section role="alert" className="rounded border-2 border-red-700 bg-red-50 p-4 space-y-2">
      <h2 className="font-semibold">Permintaan ekspor ditolak</h2>
      <p>{state.message}</p>
      <p className="text-sm">Tidak ada berkas untuk diunduh. Sesuaikan cakupan site atau rentang tanggal, lalu minta ulang. Tidak ada fallback otorisasi di sisi klien.</p>
    </section>}

    {(state.phase === "unavailable" || state.phase === "fail-closed") && <section role="alert" className="rounded border-2 border-amber-600 bg-amber-50 p-4 space-y-2">
      <h2 className="font-semibold">{state.phase === "fail-closed" ? "Ekspor ditolak fail-closed" : "Layanan ekspor tidak tersedia"}</h2>
      <p>{state.message}</p>
      <p className="text-sm">Tidak ada berkas yang diunduh dan tidak ada percobaan ulang otomatis.</p>
      <button type="button" className="rounded border px-3 py-2" disabled={!scope}
        onClick={() => scope && void runExport(scope)}>Coba minta ulang (dimulai pengguna)</button>
    </section>}

    {confirmed && <div className="space-y-4">
      {isEmptyExport
        ? <section role="status" className="rounded border-2 border-sky-700 bg-sky-50 p-4">
            <h2 className="font-semibold">Ekspor kosong dikonfirmasi server</h2>
            <p>Server mengonfirmasi ketersediaan ekspor yang sah dengan 0 event dan 0 measurement untuk cakupan ini. Berkas header-only adalah ekspor yang sah — bukan kegagalan dan bukan data hilang.</p>
          </section>
        : <section role="status" className="rounded border-2 border-emerald-700 bg-emerald-50 p-4">
            <h2 className="font-semibold">Ekspor tersedia (dikonfirmasi server)</h2>
            <p>Server mengonfirmasi ketersediaan ekspor yang sah untuk cakupan ini. Unduhan di bawah dimulai hanya atas tindakan Anda.</p>
          </section>}
      <div className="rounded border bg-white p-4 space-y-2">
        <h3 className="text-lg font-semibold">Unduhan (dimulai pengguna)</h3>
        <div className="flex flex-wrap gap-2">
          {EXPORT_DOWNLOAD_FILES.map(name => {
            const bytes = name === "events.csv" ? confirmed.files.events_csv : name === "measurements.csv" ? confirmed.files.measurements_csv : confirmed.files.metadata_json;
            return <button type="button" key={name} className="rounded bg-sky-700 px-4 py-2 text-white"
              onClick={() => downloadFile(name, bytes)}>Unduh {name}</button>;
          })}
        </div>
      </div>
      <MetadataPanel confirmed={confirmed} />
    </div>}
  </div>;
}
