import { useEffect, useState, type ReactNode } from "react";
import { MassValue } from '@/components/measurement/MeasurementDisplay';
import { EmptyState, LoadingState, ServiceUnavailableState } from '@/components/states/DisplayStates';
import { Link, useNavigate, useParams } from "react-router";
import { isUUID, type BackendEvent, type BackendMeasurement } from "@/backend/contract";
import { readBackendEvent, readBackendMeasurements } from "@/backend/client";

import { PageHeading, EventContext, PolicyNotice, TechnicalDetails, ReviewLink, observationLabels, basisLabels } from '@/components/operational/OperationalUI';

type Result<T> = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; value: T };
const statuses = {
  observed: "Teramati", estimated: "Estimasi", missing: "Missing — nilai tidak tersedia",
  measured_zero: "Nol terukur", not_measured: "Tidak diukur",
};
function Fields({ values }: { values: Record<string, ReactNode> }) {
  return <dl className="grid gap-3 sm:grid-cols-2">{Object.entries(values).map(([label, value]) =>
    <div key={label}><dt className="text-sm text-slate-600">{label}</dt><dd className="break-all whitespace-pre-wrap">{value}</dd></div>)}</dl>;
}
function MeasurementSummary({ records }: { records: BackendMeasurement[] }) {
  return <section className="space-y-3 rounded border bg-white p-4" aria-label="Ringkasan pengukuran backend">
    <h2 className="text-lg font-semibold">Ringkasan pengukuran kejadian ini</h2>
    <Fields values={{
      "Jumlah pengukuran": records.length,
      ...Object.fromEntries((Object.keys(statuses) as BackendMeasurement["observation_status"][]).map(status =>
        [`Jumlah: ${observationLabels[status]}`, records.filter(m => m.observation_status === status).length])),
    }} />
    <p className="text-sm">Jumlah ini hanya menghitung pengukuran yang tercatat. Ini bukan penilaian kelengkapan atau persetujuan data.</p>
  </section>;
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
    <button className="rounded border px-4 py-2" onClick={() => {
      setEvent({ kind: "loading" });
      setMeasurements({ kind: "loading" });
      setAttempt(value => value + 1);
    }}>Muat ulang / coba lagi</button>
    {event.kind === "loading" && <LoadingState label="Memuat catatan kejadian…" />}
    {event.kind === "error" && <ServiceUnavailableState detail={`Event gagal diambil: ${event.message} Riwayat tidak ditampilkan tanpa event yang terverifikasi.`} />}
    {event.kind === "ready" && <>
      <EventContext event={event.value} count={measurements.kind === "ready" ? measurements.value.length : undefined} />
      <ReviewLink eventId={event.value.event_id} />
      <Link className="ux-action" to={`/backend-operations?event=${event.value.event_id}`}>Buka disposisi kejadian ini</Link>
      <section aria-label="Klasifikasi pangan" className="rounded border p-3">
        <h2>Klasifikasi terpisah</h2>
        <p>Lingkup regulatori: {event.value.regulatory_scope_status === 'pending_assessment' ? 'Menunggu penilaian' : 'Belum dicatat'}</p>
        <p>Bagian pangan: {({edible:'Dapat dimakan',inedible:'Tidak dapat dimakan',mixed:'Campuran',unknown:'Belum diketahui'} as Record<string,string>)[event.value.edibility_status ?? ''] ?? 'Belum dicatat'}</p>
        <p>Sumber: {event.value.classification_source ?? 'Belum dicatat'}</p>
        <p>Bagian pangan tidak menetapkan status regulatori atau keamanan pangan.</p>
      </section>
      <section className="ux-panel" aria-label="Rincian catatan kejadian">
        <h2 className="mb-3 text-lg font-semibold">Rincian catatan kejadian</h2>
        <TechnicalDetails><Fields values={{ "Event UUID": event.value.event_id, "Organization UUID": event.value.organization_id, "Site UUID": event.value.site_id,
          "Jenis kejadian backend (provisional)": event.value.event_type, "Tanggal dan waktu kejadian (offset asli respons)": event.value.occurred_at, "Waktu pencatatan event": event.value.recorded_at }} /></TechnicalDetails>
      </section>
      {measurements.kind === "ready" && <MeasurementSummary records={measurements.value} />}
      <section className="space-y-3" aria-label="Riwayat pengukuran backend">
        <h2 className="text-lg font-semibold">Semua hasil pengukuran</h2>
        {measurements.kind === "loading" && <LoadingState label="Memuat riwayat pengukuran…" />}
        {measurements.kind === "error" && <ServiceUnavailableState detail={`Riwayat gagal diambil: ${measurements.message} Kelengkapan riwayat belum diketahui.`} />}
        {measurements.kind === "ready" && (measurements.value.length === 0
          ? <EmptyState title="Kejadian ini belum memiliki pengukuran. Berat belum dicatat, bukan 0 kg." />
          : measurements.value.map(m => <article key={m.measurement_id} className="ux-record">
            <h3>{observationLabels[m.observation_status]} · hasil terpisah</h3><ReviewLink eventId={event.value.event_id} measurementId={m.measurement_id} /><TechnicalDetails><p>ID pengukuran: <code>{m.measurement_id}</code></p><p>ID kejadian: {m.event_id}</p><p>Kode kondisi pangan: <code>{m.mass_basis}</code></p></TechnicalDetails>
            <Fields values={{ "Kondisi hasil pengukuran": observationLabels[m.observation_status],
              ...Object.fromEntries((['Gross','Tare','Net'] as const).map(field => [{Gross: 'Berat total termasuk wadah', Tare: 'Berat wadah', Net: 'Berat pangan tanpa wadah'}[field],
                <MassValue key={field} field={field} value={m[field.toLowerCase() as 'gross'|'tare'|'net']}
                  unit={m.original_unit} observationStatus={m.observation_status} absentLabel="Berat belum tersedia" />])),
              "Unit asli": m.original_unit, "Kondisi Pangan Saat Diukur": basisLabels[m.mass_basis], "Metode": m.measurement_method,
              "Asal dan Cara Memperoleh Data": m.provenance, "Tanggal dan waktu pengukuran": m.measured_at, "Waktu dicatat sistem": m.recorded_at }} />
          </article>))}
      </section>
    </>}
  </div>;
}
export default function BackendEventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [input, setInput] = useState("");
  const navigate = useNavigate();
  return <div className="ux-page space-y-5">
    <PageHeading title="Rincian Kejadian Sisa Pangan">Satu kejadian dapat memiliki beberapa pengukuran. Setiap hasil disimpan terpisah dan tidak langsung dijumlahkan.</PageHeading>
    <p>Sumber: catatan tersimpan. Halaman ini hanya untuk melihat data.</p>
    <p>Rincian kejadian dan pengukurannya dimuat terpisah; keduanya mungkin tidak menunjukkan keadaan pada saat yang persis sama.</p>
    <TechnicalDetails><p>Dua GET dibaca terpisah, bukan snapshot atomik. Status validasi efektif tidak tersedia pada API.</p></TechnicalDetails>
    <Link className="inline-block rounded border px-4 py-2 text-sky-700" to={eventId && isUUID(eventId) ? `/backend-demo/capture?event=${eventId.toLowerCase()}` : "/backend-demo/capture"}>
      {eventId && isUUID(eventId) ? "Tambah Pengukuran pada Kejadian Ini" : "Buat event sintetis di backend"}
    </Link>
    <details className="ux-technical"><summary>Buka ID kejadian secara manual (lanjutan)</summary><form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); navigate(`/backend-demo/events/${encodeURIComponent(input.trim())}`); }}>
      <label className="flex grow flex-col gap-1">Event UUID backend<input className="rounded border p-2" required value={input} onChange={e => setInput(e.target.value)} /></label>
      <button className="rounded border px-4 py-2" type="submit">Buka event backend</button>
    </form></details>
    <Link className="text-sky-700 underline" to="/events">Buka ledger in-memory (sumber berbeda)</Link>
    <Link className="ux-action" to="/backend-demo/ledger">Ke riwayat kejadian</Link>
    <PolicyNotice />
    {eventId ? (isUUID(eventId) ? <BackendDetail key={eventId} id={eventId.toLowerCase()} /> : <p role="alert">Event ID harus berupa UUID. Tidak ada permintaan API.</p>) : <p>Masukkan UUID event sintetis yang sudah tersedia di backend.</p>}
  </div>;
}
