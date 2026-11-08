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

const field = "w-full rounded border border-slate-300 bg-white p-2";
const initialMeasurement: MeasurementInput = {
  observation_status: "" as MeasurementInput["observation_status"], gross: "", tare: "", net: "", original_unit: "kg", mass_basis: "" as MeasurementInput["mass_basis"],
  measurement_method: "", provenance: "", measured_at: "",
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
  const [eventInput, setEventInput] = useState<EventInput>({ organization_id: SYNTHETIC_ORG_ID, site_id: authSnapshot().site, event_type: "" as EventInput["event_type"], occurred_at: "" });
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
        setFeedback({ kind: "success", message: `Event disimpan: ${result.value.event_id}. Measurement ditambahkan ke event yang sama.` });
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
        setFeedback({ kind: "success", message: `Measurement tersimpan: ${result.value.measurement_id}. Event ID tidak berubah.` });
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
      if (!window.confirm("Angka massa yang telah diisi akan dikosongkan menjadi null, bukan diubah menjadi nol. Lanjutkan?")) return;
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

  return <div className="space-y-6">
    <header className="space-y-2">
      <h1 className="text-2xl font-bold">Capture backend persisten — sintetis</h1>
      <p>FastAPI/PostgreSQL lokal, kontrak Demo v0.1 provisional. Terpisah sepenuhnya dari QuickCapture dan DemoStore in-memory.</p>
      <p className="text-sm text-amber-800">Bukan sistem resmi BGN. Belum ada autentikasi produksi, idempotency atau penyimpanan input verbatim. Dua POST adalah dua transaksi terpisah.</p>
      <p className="text-sm">Alur demo: 1. Buat event → 2. Tambah pengukuran → 3. Buka detail dan muat ulang. Simpan URL detail untuk membaca UUID yang sama.</p>
      <Link className="text-sky-700 underline" to={eventId ? `/backend-demo/events/${eventId}` : "/backend-demo"}>Buka detail backend (read-only)</Link>
    </header>

    {locked && !busy && <section className="rounded border-2 border-amber-600 bg-amber-50 p-4 space-y-3">
      <h2 className="font-semibold">Hasil penyimpanan belum dapat dipastikan (UNKNOWN)</h2>
      <UncertainResultState detail={`POST ${journal?.operation ?? 'privat'} mungkin telah commit. Tidak ada retry otomatis atau tombol kirim ulang. Jangan membuat record baru sebelum investigasi.`} />
      {journal?.eventId && <Link className="text-sky-700 underline" to={`/backend-demo/events/${journal.eventId}`}>Periksa riwayat event {journal.eventId} (GET)</Link>}
      <p>Gunakan pemulihan intent privat di atas. Intent registered tanpa hasil tetap UNCONFIRMED; tidak ada tombol replay atau buka kunci tanpa bukti server.</p>
    </section>}
    {feedback && <p role={feedback.kind === "success" ? "status" : "alert"} className="rounded border bg-white p-3">{feedback.message}</p>}
    {busy && <p role="status">Sedang menyimpan ke backend… Tunggu hasilnya; jangan kirim ulang atau tutup halaman.</p>}
    {readFeedback && <p role="alert" className="rounded border p-3">{readFeedback}</p>}

    <form onSubmit={attachKnownEvent} className="rounded border bg-white p-4 space-y-2">
      <label className="block">Pulihkan event dari UUID yang sudah diketahui<input className={field} value={knownInput} onChange={e => setKnownInput(e.target.value)} placeholder="UUID event backend" /></label>
      <button type="submit" disabled={busy} className="rounded border px-4 py-2">Baca event dari backend (GET saja)</button>
    </form>

    {!eventId && !routeId && permits('event.create') && <form onSubmit={e => { void submitEvent(e); }} className="rounded border bg-white p-4 space-y-4" noValidate>
      <h2 className="text-lg font-semibold">1. Buat event sintetis</h2>
      <p className="text-sm">Fixture backend hanya tersedia bila sudah disiapkan pada database uji yang diotorisasi. Pilihan ini bukan identitas site DemoStore.</p>
      <label className="block">Organisasi/site fixture sintetis
        <select className={field} value={eventInput.site_id} disabled><option value={eventInput.site_id}>{SYNTHETIC_ORG_ID} / {eventInput.site_id}</option></select>
      </label>
      <label className="block">Jenis event backend provisional
        <select className={field} value={eventInput.event_type} onChange={e => setEventInput(v => ({ ...v, event_type: e.target.value as EventInput["event_type"] }))}>
          <option value="">— Pilih jenis event —</option><option value="at_risk_surplus">at_risk_surplus — surplus berisiko</option><option value="actual_loss_discard">actual_loss_discard — kehilangan/discard</option>
        </select>
      </label>
      <label className="block">Waktu kejadian ISO-8601 dengan offset
        <input className={field} value={eventInput.occurred_at} onChange={e => setEventInput(v => ({ ...v, occurred_at: e.target.value }))} placeholder="2026-11-06T12:00:00+08:00" aria-invalid={!!fieldErrors.occurred_at} />
        {fieldErrors.event_type && <span className="text-red-700">{fieldErrors.event_type}</span>}{fieldErrors.occurred_at && <span className="text-red-700">{fieldErrors.occurred_at}</span>}
      </label>
      <button type="submit" className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50" disabled={busy || locked}>Simpan event backend</button>
    </form>}

    {routeId && !eventId && !readFeedback && <p role="status">Memeriksa UUID event yang diketahui dari PostgreSQL…</p>}
    {routeId && readFeedback && <button type="button" className="rounded border px-4 py-2" disabled={busy} onClick={() => setAttempt(n => n + 1)}>Coba baca ulang (GET saja)</button>}
    {eventId && <section className="rounded border bg-white p-4 space-y-2">
      <h2 className="text-lg font-semibold">Event backend saat ini</h2>
      <p className="break-all font-mono">{eventId}</p>
      <Link className="text-sky-700 underline" to={`/backend-demo/events/${eventId}`}>Detail dan riwayat read-only</Link>
      {confirmedEvent && <p>Event dikonfirmasi: {confirmedEvent.event_type} · {confirmedEvent.occurred_at}</p>}
      {history && <p role="status">Riwayat backend berhasil dibaca: {history.length} measurement (tanpa agregasi atau pilihan kanonik).</p>}
    </section>}

    {eventId && permits('measurement.create') && <form onSubmit={e => { void submitMeasurement(e); }} noValidate className="rounded border bg-white p-4 space-y-4">
      <h2 className="text-lg font-semibold">2. Tambah measurement pada event yang sama</h2>
      <p className="text-sm">Status: observed = teramati, estimated = estimasi, measured_zero = nol terukur, missing = nilai tidak tersedia, not_measured = tidak diukur. Missing/tidak diukur menyimpan null, bukan 0 kg.</p>
      <label className="block">Observation status
        <select className={field} value={measurement.observation_status} onChange={e => changeStatus(e.target.value as MeasurementInput["observation_status"])}>
          <option value="">— Pilih status —</option>{BACKEND_STATUSES.map(v => <option value={v} key={v}>{v}</option>)}
        </select>
      </label>
      <label className="block">Mass basis provisional
        <select className={field} value={measurement.mass_basis} onChange={e => setMeasurement(m => ({ ...m, mass_basis: e.target.value as MeasurementInput["mass_basis"] }))}>
          <option value="">— Pilih basis —</option>{BACKEND_MASS_BASES.map(v => <option value={v} key={v}>{v}</option>)}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">{(["gross", "tare", "net"] as const).map(name => <label className="block" key={name}>{name} (kg)
        <input className={field} inputMode="decimal" value={measurement[name] ?? ""} disabled={measurement.observation_status === "missing" || measurement.observation_status === "not_measured"} onChange={e => setMeasurement(m => ({ ...m, [name]: e.target.value }))} aria-invalid={!!fieldErrors[name]} />
        {fieldErrors[name] && <span className="text-red-700">{fieldErrors[name]}</span>}
      </label>)}</div>
      <p className="text-sm">Gross, tare, net diisi manual; backend memvalidasi pengurangan dengan Decimal. Tidak ada default tare atau pembulatan.</p>
      <label className="block">Measurement method<input className={field} value={measurement.measurement_method} onChange={e => setMeasurement(m => ({ ...m, measurement_method: e.target.value }))} />{fieldErrors.measurement_method && <span className="text-red-700">{fieldErrors.measurement_method}</span>}</label>
      <label className="block">Provenance sintetis<input className={field} value={measurement.provenance} onChange={e => setMeasurement(m => ({ ...m, provenance: e.target.value }))} />{fieldErrors.provenance && <span className="text-red-700">{fieldErrors.provenance}</span>}</label>
      <label className="block">Waktu pengukuran ISO-8601 dengan offset<input className={field} value={measurement.measured_at} placeholder="2026-11-06T12:02:00+08:00" onChange={e => setMeasurement(m => ({ ...m, measured_at: e.target.value }))} />{fieldErrors.measured_at && <span className="text-red-700">{fieldErrors.measured_at}</span>}</label>
      {fieldErrors.observation_status && <p className="text-red-700">{fieldErrors.observation_status}</p>}{fieldErrors.mass_basis && <p className="text-red-700">{fieldErrors.mass_basis}</p>}
      <button type="submit" disabled={busy || locked} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">Simpan measurement ke event ini</button>
    </form>}
  </div>;
}
