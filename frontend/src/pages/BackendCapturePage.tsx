import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { BACKEND_MASS_BASES, BACKEND_STATUSES, isUUID, type BackendEvent, type BackendMeasurement } from "@/backend/contract";
import { readBackendEvent, readBackendMeasurements } from "@/backend/client";
import {
  SYNTHETIC_ORG_ID, clearCaptureJournal, createBackendEvent, createBackendMeasurement,
  eventErrors, measurementErrors, readCaptureJournal, saveCaptureJournal,
  type CaptureJournal, type EventInput, type MeasurementInput,
} from "@/backend/write";
import { authSnapshot, permits, subscribeAuth } from '@/backend/auth';
import { UncertainResultState } from '@/components/states/DisplayStates';

import { PageHeading, EventContext, PolicyNotice, TimestampInput, observationLabels, basisLabels } from '@/components/operational/OperationalUI';

const field = "w-full rounded border border-slate-300 bg-white p-2";
const initialMeasurement: MeasurementInput = {
  observation_status: "" as MeasurementInput["observation_status"], gross: "", tare: "", net: "", original_unit: "kg", mass_basis: "" as MeasurementInput["mass_basis"],
  measurement_method: "", provenance: "", measured_at: "", original_value_lexeme: "", instrument_ref: "", sample_context: "",
};
type Feedback = { kind: "error" | "success" | "unknown"; message: string } | null;

export default function BackendCapturePage() {
  const auth = useSyncExternalStore(subscribeAuth, authSnapshot);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const routeId = params.get("event") || "";
  const [eventId, setEventId] = useState<string | null>(null);
  const [confirmedEvent, setConfirmedEvent] = useState<BackendEvent | null>(null);
  const [history, setHistory] = useState<BackendMeasurement[] | null>(null);
  const [eventInput, setEventInput] = useState<EventInput>({ organization_id: SYNTHETIC_ORG_ID, site_id: authSnapshot().site, event_type: "" as EventInput["event_type"], occurred_at: "", stage_code: "", process_step: "", operation_date: "" });
  const [measurement, setMeasurement] = useState<MeasurementInput>(initialMeasurement);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [readFeedback, setReadFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [journal, setJournal] = useState<CaptureJournal | null>(() => readCaptureJournal());
  const [knownInput, setKnownInput] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const locked = journal !== null || !!auth.intents?.some(i => i.state === 'registered');

  // This only warns; journal + no-automatic-retry is the actual integrity control.
  useEffect(() => {
    if (!busy) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [busy]);

  useEffect(() => {
    setConfirmedEvent(null); setHistory(null); setEventId(null); setReadFeedback(null);
    if (!routeId) return;
    if (!isUUID(routeId)) { setReadFeedback("UUID pada URL tidak valid."); return; }
    let active = true;
    const controller = new AbortController();
    setReadFeedback(null); setConfirmedEvent(null); setHistory(null); setEventId(null);
    // Read-only recovery from a known UUID; never send POST on page mount or refresh.
    void readBackendEvent(routeId.toLowerCase(), controller.signal).then(value => {
      if (active) { setConfirmedEvent(value); setEventId(value.event_id); }
    }, () => { if (active) setReadFeedback("Event belum bisa dibaca dari PostgreSQL; keberadaan data belum dapat dipastikan."); });
    void readBackendMeasurements(routeId.toLowerCase(), controller.signal).then(value => {
      if (active) setHistory(value);
    }, () => { if (active) setReadFeedback("Riwayat belum bisa dibaca. Event tidak dianggap hilang."); });
    return () => { active = false; controller.abort(); };
  }, [routeId, attempt]);

  function updateJournal(value: CaptureJournal | null) {
    if (value) saveCaptureJournal(value); else clearCaptureJournal();
    setJournal(value);
  }

  function beginJournal(value: CaptureJournal): boolean {
    try { updateJournal(value); return true; }
    catch {
      setJournal({ ...value, state: "unknown" });
      setFeedback({ kind: "error", message: "Journal sesi tidak tersedia. Tidak ada POST dikirim; input dikunci." });
      return false;
    }
  }

  function finishJournal() {
    try { updateJournal(null); }
    catch { setReadFeedback("Hasil POST sudah diketahui, tetapi journal sesi gagal dibersihkan. Input tetap dikunci sampai pemeriksaan."); }
  }

  function unknownJournal(value: CaptureJournal) {
    setJournal(value);
    try { saveCaptureJournal(value); }
    catch { /* Existing pending entry still blocks a refresh; local lock remains. */ }
  }

  async function submitEvent(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || locked || eventId) return;
    const errors = eventErrors(eventInput); setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    inFlight.current = true; setBusy(true); setFeedback(null);
    try {
      if (!beginJournal({ operation: "event", eventId: null, state: "pending" })) return;
      const result = await createBackendEvent(eventInput);
      if (result.kind === "saved") {
        // Write the recovered ID to the URL before clearing the pending journal.
        navigate(`/backend-demo/capture?event=${encodeURIComponent(result.value.event_id)}`, { replace: true });
        setEventId(result.value.event_id); setConfirmedEvent(result.value);
        finishJournal();
        setFeedback({ kind: "success", message: `Kejadian berhasil dicatat. Anda dapat menambahkan pengukuran sekarang.` });
      } else if (result.kind === "rejected") {
        finishJournal(); setFeedback({ kind: "error", message: result.message });
      } else {
        unknownJournal({ operation: "event", eventId: null, state: "unknown" });
        setFeedback({ kind: "unknown", message: result.message });
      }
    } finally { inFlight.current = false; setBusy(false); }
  }

  async function submitMeasurement(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || locked || !eventId || routeId.toLowerCase() !== eventId) return;
    const errors = measurementErrors(measurement); setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    inFlight.current = true; setBusy(true); setFeedback(null);
    try {
      if (!beginJournal({ operation: "measurement", eventId, state: "pending" })) return;
      const result = await createBackendMeasurement(eventId, measurement);
      if (result.kind === "saved") {
        finishJournal();
        setFeedback({ kind: "success", message: `Pengukuran tersimpan. Lihat Riwayat sekarang memuat pengukuran ini.` });
        // On successful POST, clear the draft and read history without POST retry.
        setMeasurement({ ...initialMeasurement });
        setAttempt(n => n + 1);
      } else if (result.kind === "rejected") {
        finishJournal(); setFeedback({ kind: "error", message: `${result.message} Event ${eventId} tetap tersimpan; perbaiki measurement di bawah.` });
      } else {
        unknownJournal({ operation: "measurement", eventId, state: "unknown" });
        setFeedback({ kind: "unknown", message: `${result.message} Event ${eventId} tetap menjadi konteks. Periksa riwayat sebelum operasi lain.` });
      }
    } finally { inFlight.current = false; setBusy(false); }
  }

  function changeStatus(value: MeasurementInput["observation_status"]) {
    const wasAbsent = measurement.observation_status === "missing" || measurement.observation_status === "not_measured";
    const nowAbsent = value === "missing" || value === "not_measured";
    if (nowAbsent && !wasAbsent && [measurement.gross, measurement.tare, measurement.net].some(v => v !== null && v.trim())) {
      if (!window.confirm("Angka berat yang sudah diisi akan dikosongkan, bukan diubah menjadi nol. Lanjutkan?")) return;
    }
    setMeasurement(m => ({ ...m, observation_status: value,
      gross: nowAbsent ? null : m.gross === null ? "" : m.gross,
      tare: nowAbsent ? null : m.tare === null ? "" : m.tare,
      net: nowAbsent ? null : m.net === null ? "" : m.net,
    }));
  }

  function attachKnownEvent(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!isUUID(knownInput)) { setReadFeedback("Masukkan UUID backend yang valid."); return; }
    // A human supplies a reconciled ID; GET only. Unknown journal remains locked until separately acknowledged.
    navigate(`/backend-demo/capture?event=${encodeURIComponent(knownInput.toLowerCase())}`, { replace: true });
  }

  return <div className="ux-page space-y-6">
    <PageHeading title={routeId ? 'Catat Pengukuran Sisa Pangan' : 'Catat Kejadian Sisa Pangan'}>{routeId ? 'Pengukuran ini ditambahkan pada kejadian yang sama, bukan membuat kejadian baru.' : 'Catat kejadian terlebih dahulu. Beratnya boleh ditambahkan setelah pengukuran.'} Data latihan tersimpan terpisah dari contoh sementara.</PageHeading>
    <div className="ux-steps"><strong>1 · Kejadian</strong><span>→</span><strong>2 · Pengukuran</strong><span>→</span><Link to={eventId ? `/backend-demo/events/${eventId}` : '/backend-demo/ledger'}>3 · Riwayat &amp; pemeriksaan</Link></div>

    {locked && !busy && <section className="rounded border-2 border-amber-600 bg-amber-50 p-4 space-y-3">
      <h2 className="font-semibold">Hasil penyimpanan belum dapat dipastikan (UNKNOWN)</h2>
      <UncertainResultState detail={`Belum bisa dipastikan apakah catatan berhasil tersimpan. Jangan kirim ulang agar tidak tercatat dua kali. Minta bantuan petugas yang berwenang.`} />
      {journal?.eventId && <Link className="text-sky-700 underline" to={`/backend-demo/events/${journal.eventId}`}>Periksa riwayat event {journal.eventId} (GET)</Link>}
      <p>Hasil tetap terkunci sampai ada konfirmasi penyimpanan yang sah. Melihat riwayat saja tidak membuktikan bahwa pengiriman gagal.</p>
    </section>}
    {feedback && <p role={feedback.kind === "success" ? "status" : "alert"} className="rounded border bg-white p-3">{feedback.message}</p>}
    {busy && <p role="status">Sedang menyimpan catatan… Tunggu hasilnya; jangan kirim ulang atau tutup halaman.</p>}
    {readFeedback && <p role="alert" className="rounded border p-3">{readFeedback}</p>}

    <details className="ux-technical"><summary>Pemulihan lanjutan: ID kejadian yang sudah diketahui</summary><form onSubmit={attachKnownEvent} className="rounded border bg-white p-4 space-y-2">
      <label className="block">Pulihkan event dari UUID yang sudah diketahui<input className={field} value={knownInput} onChange={e => setKnownInput(e.target.value)} placeholder="UUID event backend" /></label>
      <button type="submit" disabled={busy} className="rounded border px-4 py-2">Baca event dari backend (GET saja)</button>
    </form></details>

    {!eventId && !routeId && permits('event.create') && <form onSubmit={e => { void submitEvent(e); }} className="rounded border bg-white p-4 space-y-4" noValidate>
      <h2 className="text-lg font-semibold">Informasi kejadian</h2>
      <p className="text-sm">Lokasi mengikuti sesi yang berizin. Pengukuran ditambahkan setelah kejadian dikonfirmasi server. Tidak ada data contoh yang otomatis disimpan.</p>
      <label className="block">Lokasi dapur
        <select className={field} value={eventInput.site_id} disabled><option value={eventInput.site_id}>Lokasi dapur aktif</option></select>
      </label>
      <label className="block">Jenis kejadian
        <select aria-describedby={fieldErrors.event_type ? "capture-event-type-error" : undefined} aria-invalid={!!fieldErrors.event_type} className={field} value={eventInput.event_type} onChange={e => setEventInput(v => ({ ...v, event_type: e.target.value as EventInput["event_type"] }))}>
          <option value="">— Pilih jenis kejadian —</option><option value="at_risk_surplus">Surplus pangan berisiko</option><option value="actual_loss_discard">Pangan hilang atau dibuang</option>
        </select>
      </label>
      <TimestampInput label="Tanggal dan waktu kejadian" value={eventInput.occurred_at} onChange={occurred_at => setEventInput(v => ({ ...v, occurred_at }))} error={fieldErrors.occurred_at} />
      {fieldErrors.event_type && <p id="capture-event-type-error" role="alert" className="text-red-700">{fieldErrors.event_type}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">Tahap kegiatan (opsional)<input className={field} value={eventInput.stage_code ?? ""} onChange={e => setEventInput(v => ({ ...v, stage_code: e.target.value }))} placeholder="mis. preparation" aria-describedby={fieldErrors.stage_code ? "capture-stage_code-error" : undefined} aria-invalid={!!fieldErrors.stage_code} />{fieldErrors.stage_code && <span id="capture-stage_code-error" role="alert" className="text-red-700">{fieldErrors.stage_code}</span>}</label>
        <label className="block">Aktivitas saat kejadian (opsional)<input className={field} value={eventInput.process_step ?? ""} onChange={e => setEventInput(v => ({ ...v, process_step: e.target.value }))} placeholder="mis. batch_completion" /></label>
        <label className="block">Tanggal kegiatan dapur (opsional; isi sesuai catatan)
          <input className={field} value={eventInput.operation_date ?? ""} onChange={e => setEventInput(v => ({ ...v, operation_date: e.target.value }))} type="date" aria-describedby={fieldErrors.operation_date ? "capture-operation_date-error" : undefined} aria-invalid={!!fieldErrors.operation_date} />
          {fieldErrors.operation_date && <span id="capture-operation_date-error" role="alert" className="text-red-700">{fieldErrors.operation_date}</span>}
        </label>
      </div>
      <button type="submit" className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50" disabled={busy || locked}>Simpan kejadian</button>
    </form>}

    {routeId && !eventId && !readFeedback && <p role="status">Memeriksa UUID event yang diketahui dari PostgreSQL…</p>}
    {routeId && readFeedback && <button type="button" className="rounded border px-4 py-2" disabled={busy} onClick={() => setAttempt(n => n + 1)}>Coba baca ulang (GET saja)</button>}
    {confirmedEvent && <EventContext event={confirmedEvent} count={history?.length} />}
    {history && <p role="status">Riwayat telah dimuat: {history.length} pengukuran. Setiap hasil tetap terpisah.</p>}

    {eventId && permits('measurement.create') && <form onSubmit={e => { void submitMeasurement(e); }} noValidate className="rounded border bg-white p-4 space-y-4">
      <h2 className="text-lg font-semibold">Pengukuran pada kejadian yang sama</h2>
      <p className="text-sm">Pilih kondisi hasil pengukuran. Perkiraan berbeda dari hasil ukur; data belum tersedia dan belum diukur bukan hasil 0 kg.</p>
      <label className="block">Kondisi hasil pengukuran
        <select className={field} aria-describedby={fieldErrors.observation_status ? "capture-observation_status-error" : undefined} aria-invalid={!!fieldErrors.observation_status} value={measurement.observation_status} onChange={e => changeStatus(e.target.value as MeasurementInput["observation_status"])}>
          <option value="">— Pilih status —</option>{BACKEND_STATUSES.map(v => <option value={v} key={v}>{observationLabels[v]}</option>)}
        </select>
      </label>
      <label className="block">Kondisi pangan saat diukur
        <select className={field} aria-describedby={fieldErrors.mass_basis ? "capture-mass_basis-error" : undefined} aria-invalid={!!fieldErrors.mass_basis} value={measurement.mass_basis} onChange={e => setMeasurement(m => ({ ...m, mass_basis: e.target.value as MeasurementInput["mass_basis"] }))}>
          <option value="">— Pilih kondisi pangan —</option>{BACKEND_MASS_BASES.map(v => <option value={v} key={v}>{basisLabels[v]}</option>)}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">{(["gross", "tare", "net"] as const).map(name => <label className="block" key={name}>{{gross: "Berat total termasuk wadah", tare: "Berat wadah", net: "Berat pangan tanpa wadah"}[name]} (kg)
        <input className={field} inputMode="decimal" value={measurement[name] ?? ""} disabled={measurement.observation_status === "missing" || measurement.observation_status === "not_measured"} onChange={e => setMeasurement(m => ({ ...m, [name]: e.target.value }))} aria-describedby={`capture-mass-help${fieldErrors[name] ? ` capture-${name}-error` : ""}`} aria-invalid={!!fieldErrors[name]} />
        {fieldErrors[name] && <span id={`capture-${name}-error`} role="alert" className="text-red-700">{fieldErrors[name]}</span>}
      </label>)}</div>
      <p id="capture-mass-help" className="text-sm">Isi ketiga berat sesuai catatan. Berat total harus sama dengan berat wadah ditambah berat pangan. Berat wadah tidak otomatis nol.</p>
      <label className="block">Bagaimana berat diperoleh?<input className={field} aria-describedby={fieldErrors.measurement_method ? "capture-measurement_method-error" : undefined} aria-invalid={!!fieldErrors.measurement_method} value={measurement.measurement_method} onChange={e => setMeasurement(m => ({ ...m, measurement_method: e.target.value }))} />{fieldErrors.measurement_method && <span id="capture-measurement_method-error" role="alert" className="text-red-700">{fieldErrors.measurement_method}</span>}</label>
      <label className="block">Dari mana data ini berasal?<input className={field} aria-describedby={fieldErrors.provenance ? "capture-provenance-error" : undefined} aria-invalid={!!fieldErrors.provenance} value={measurement.provenance} onChange={e => setMeasurement(m => ({ ...m, provenance: e.target.value }))} />{fieldErrors.provenance && <span id="capture-provenance-error" role="alert" className="text-red-700">{fieldErrors.provenance}</span>}</label>
      <TimestampInput label="Tanggal dan waktu pengukuran" value={measurement.measured_at} onChange={measured_at => setMeasurement(m => ({ ...m, measured_at }))} error={fieldErrors.measured_at} />
      <details className="ux-technical"><summary>Instrumen, sampel &amp; nilai sumber tambahan</summary>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">Nilai asal diketik apa adanya (opsional)<input className={field} inputMode="decimal" value={measurement.original_value_lexeme ?? ""} onChange={e => setMeasurement(m => ({ ...m, original_value_lexeme: e.target.value }))} placeholder="mis. 2.40" /></label>
        <label className="block">Referensi alat (opsional)<input className={field} value={measurement.instrument_ref ?? ""} onChange={e => setMeasurement(m => ({ ...m, instrument_ref: e.target.value }))} placeholder="mis. SCALE-SYN-01" /></label>
        <label className="block">Konteks sampel (opsional)<input className={field} value={measurement.sample_context ?? ""} onChange={e => setMeasurement(m => ({ ...m, sample_context: e.target.value }))} placeholder="mis. full_bin" /></label>
      </div>
      </details><p className="text-sm">Angka sumber tetap disimpan seperti yang dicatat. Bagian kosong tidak diubah menjadi nol.</p>
      {fieldErrors.observation_status && <p id="capture-observation_status-error" role="alert" className="text-red-700">{fieldErrors.observation_status}</p>}{fieldErrors.mass_basis && <p id="capture-mass_basis-error" role="alert" className="text-red-700">{fieldErrors.mass_basis}</p>}
      <button type="submit" disabled={busy || locked} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">Simpan pengukuran</button>
    </form>}
    <PolicyNotice />
  </div>;
}
