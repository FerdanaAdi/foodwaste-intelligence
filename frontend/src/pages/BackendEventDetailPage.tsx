import { useEffect, useState, type ReactNode } from "react";
import { MassValue } from '@/components/measurement/MeasurementDisplay';
import { EmptyState, LoadingState, ServiceUnavailableState } from '@/components/states/DisplayStates';
import { Link, useNavigate, useParams } from "react-router";
import { isUUID, type BackendEvent, type BackendMeasurement } from "@/backend/contract";
import { readBackendEvent, readBackendMeasurements } from "@/backend/client";

type Result<T> = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; value: T };
const statuses = {
  observed: "Teramati", estimated: "Estimasi", missing: "Missing — nilai tidak tersedia",
  measured_zero: "Nol terukur", not_measured: "Tidak diukur",
};
function Fields({ values }: { values: Record<string, ReactNode> }) {
  return <dl className="grid gap-3 sm:grid-cols-2">{Object.entries(values).map(([label, value]) =>
    <div key={label}><dt className="text-sm text-slate-600">{label}</dt><dd className="break-all whitespace-pre-wrap">{value}</dd></div>)}</dl>;
}
function BackendDetail({ id }: { id: string }) {
  const [event, setEvent] = useState<Result<BackendEvent>>({ kind: "loading" });
  const [measurements, setMeasurements] = useState<Result<BackendMeasurement[]>>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setEvent({ kind: "loading" });
    setMeasurements({ kind: "loading" });
    const failure = (error: unknown) => ({ kind: "error" as const, message: error instanceof Error ? error.message : "Permintaan backend gagal." });
    void readBackendEvent(id, controller.signal).then(value => { if (active) setEvent({ kind: "ready", value }); }, error => { if (active) setEvent(failure(error)); });
    void readBackendMeasurements(id, controller.signal).then(value => { if (active) setMeasurements({ kind: "ready", value }); }, error => { if (active) setMeasurements(failure(error)); });
    return () => { active = false; controller.abort(); };
  }, [id, attempt]);
  return <div className="space-y-5" aria-live="polite">
    <button className="rounded border px-4 py-2" onClick={() => setAttempt(value => value + 1)}>Muat ulang / coba lagi</button>
    {event.kind === "loading" && <LoadingState label="Memuat event backend…" />}
    {event.kind === "error" && <ServiceUnavailableState detail={`Event gagal diambil: ${event.message} Riwayat tidak ditampilkan tanpa event yang terverifikasi.`} />}
    {event.kind === "ready" && <>
      <section className="rounded border bg-white p-4" aria-label="Detail event backend">
        <h2 className="mb-3 text-lg font-semibold">Detail event backend</h2>
        <Fields values={{ "Event UUID": event.value.event_id, "Organization UUID": event.value.organization_id, "Site UUID": event.value.site_id,
          "Jenis event backend (provisional)": event.value.event_type, "Waktu kejadian (offset asli respons)": event.value.occurred_at, "Waktu pencatatan event": event.value.recorded_at }} />
      </section>
      <section className="space-y-3" aria-label="Riwayat pengukuran backend">
        <h2 className="text-lg font-semibold">Seluruh riwayat pengukuran</h2>
        {measurements.kind === "loading" && <LoadingState label="Memuat riwayat pengukuran…" />}
        {measurements.kind === "error" && <ServiceUnavailableState detail={`Riwayat gagal diambil: ${measurements.message} Kelengkapan riwayat belum diketahui.`} />}
        {measurements.kind === "ready" && (measurements.value.length === 0
          ? <EmptyState title="Belum ada measurement untuk event ini. Ini bukan nol terukur." />
          : measurements.value.map(m => <article key={m.measurement_id} className="rounded border bg-white p-4">
            <h3 className="mb-3 break-all font-mono">{m.measurement_id}</h3>
            <Fields values={{ "Event UUID": m.event_id, "Status observasi": `${statuses[m.observation_status]} (${m.observation_status})`,
              ...Object.fromEntries((['Gross','Tare','Net'] as const).map(field => [field,
                <MassValue key={field} field={field} value={m[field.toLowerCase() as 'gross'|'tare'|'net']}
                  unit={m.original_unit} observationStatus={m.observation_status} absentLabel="Tidak tersedia (null)" />])),
              "Unit asli": m.original_unit, "Mass basis (provisional)": m.mass_basis, "Metode": m.measurement_method,
              "Provenance": m.provenance, "Waktu pengukuran": m.measured_at, "Waktu pencatatan measurement": m.recorded_at }} />
          </article>))}
      </section>
    </>}
  </div>;
}
export default function BackendEventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [input, setInput] = useState("");
  const navigate = useNavigate();
  return <div className="space-y-5">
    <h1 className="text-2xl font-bold">Detail event sintetis backend</h1>
    <p>Sumber: FastAPI / PostgreSQL — read-only. Terpisah dari DemoStore in-memory.</p>
    <p>Dua GET dibaca terpisah, bukan snapshot atomik. Pengukuran tidak dijumlahkan atau dipilih sebagai hasil kanonik.</p>
    <p>Vocabulary dan aturan measured-zero adalah kontrak backend demo provisional. API belum menyediakan status validasi, teks input asli, atau catatan review.</p>
    <Link className="inline-block rounded border px-4 py-2 text-sky-700" to={eventId && isUUID(eventId) ? `/backend-demo/capture?event=${eventId.toLowerCase()}` : "/backend-demo/capture"}>
      {eventId && isUUID(eventId) ? "Kembali: tambah pengukuran pada event ini" : "Buat event sintetis di backend"}
    </Link>
    <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); navigate(`/backend-demo/events/${encodeURIComponent(input.trim())}`); }}>
      <label className="flex grow flex-col gap-1">Event UUID backend<input className="rounded border p-2" required value={input} onChange={e => setInput(e.target.value)} /></label>
      <button className="rounded border px-4 py-2" type="submit">Buka event backend</button>
    </form>
    <Link className="text-sky-700 underline" to="/events">Buka ledger in-memory (sumber berbeda)</Link>
    {eventId ? (isUUID(eventId) ? <BackendDetail key={eventId} id={eventId.toLowerCase()} /> : <p role="alert">Event ID harus berupa UUID. Tidak ada permintaan API.</p>) : <p>Masukkan UUID event sintetis yang sudah tersedia di backend.</p>}
  </div>;
}
