import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router";
import { useAlertSource, type AlertSource } from "./useAlertSource";

const missing = "Belum dicatat (null)";
function Value({ value, unit }: { value: string | null | undefined; unit?: string }) {
  return <>{value == null ? missing : `${value}${unit ? ` ${unit}` : ""}`}</>;
}

function Time({ value }: { value: string | null | undefined }) {
  if (value == null) return <>{missing}</>;
  const zone = /(Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1];
  return <><time dateTime={value}>{value}</time> (zona waktu: {zone === "Z" ? "UTC (Z)" : zone ?? "tidak dinyatakan pada respons"})</>;
}

/** GET-only source explanation; it neither evaluates nor acknowledges an alert. */
export default function AlertSourcePanel({ alert, onClose }: { alert: AlertSource; onClose?: () => void }) {
  const source = useAlertSource(alert);
  const title = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => { title.current?.focus(); }, []);
  if ("contextInvalid" in source && source.contextInvalid) return <p role="status">Konteks akses berubah; data sumber sebelumnya tidak ditampilkan.</p>;
  return <section aria-label="Informasi sumber alert" className="min-w-0 space-y-3 rounded border p-3">
    <h3 ref={title} tabIndex={-1} className="font-semibold focus:outline focus:outline-2 focus:outline-teal-700">Catatan sumber saat ini</h3>
    {onClose && <button type="button" className="rounded border px-3 py-2" onClick={onClose}>Tutup panel sumber</button>}
    <p>Waktu evaluasi yang mencatat alert: <Time value={alert.recorded_at} />.</p>
    <p>Urutan waktu pencatatan bukan bukti bahwa kondisi sumber berubah atau bahwa alert tidak berlaku. Sistem tidak menyimpan salinan kondisi sumber saat alert dibuat.</p>
    {source.phase === "loading" && <p role="status">Memuat catatan sumber…</p>}
    {source.phase === "error" && <p role="alert">Sumber tidak dapat dibaca untuk konteks akses saat ini. Tidak ada tindakan dikirim ulang.</p>}
    {source.phase === "unavailable" && <p>Tampilan sumber belum tersedia untuk target atau konteks akses ini.</p>}
    {source.phase === "ready" && source.data?.kind === "event" && <>
      <Link className="underline" to={`/backend-demo/events/${source.data.event.event_id}`}>Buka rincian kejadian</Link>
      <p>1 kejadian · {source.data.measurements.length} observasi pengukuran. Tidak ada pengukuran efektif yang dipilih.</p>
      <dl className="[&>dd]:break-all"><dt>ID kejadian</dt><dd>{source.data.event.event_id}</dd>
        <dt>Waktu kejadian</dt><dd><Time value={source.data.event.occurred_at} /></dd>
        <dt>Waktu input kejadian</dt><dd><Time value={source.data.event.recorded_at} /></dd>
        <dt>Tanggal kegiatan dapur</dt><dd><Value value={source.data.event.operation_date} /></dd></dl>
      <p>Dua GET terpisah bukan snapshot database atomik. Observasi berikut tidak dijumlahkan menjadi waste generation.</p>
      {source.data.measurements.length === 0 && <p>Belum ada pengukuran tercatat; bukan pengukuran nol.</p>}
      <ul className="space-y-3">{source.data.measurements.map(row => <li key={row.measurement_id} className="rounded border p-2">
        <dl className="[&>dd]:break-all"><dt>ID pengukuran</dt><dd>{row.measurement_id}</dd>
          <dt>Status observasi asli</dt><dd>{row.observation_status}</dd>
          <dt>Berat kotor (gross)</dt><dd><Value value={row.gross} unit={row.original_unit} /></dd>
          <dt>Berat wadah (tare)</dt><dd><Value value={row.tare} unit={row.original_unit} /></dd>
          <dt>Berat bersih tercatat (net)</dt><dd><Value value={row.net} unit={row.original_unit} /></dd>
          <dt>Kondisi pangan saat diukur (mass basis)</dt><dd>{row.mass_basis}</dd>
          <dt>Metode asli</dt><dd>{row.measurement_method}</dd>
          <dt>Asal data (provenance)</dt><dd>{row.provenance}</dd>
          <dt>Nilai ketikan asli</dt><dd><Value value={row.original_value_lexeme} /></dd>
          <dt>Waktu pengukuran dilakukan</dt><dd><Time value={row.measured_at} /></dd>
          <dt>Waktu pengukuran dicatat</dt><dd><Time value={row.recorded_at} /></dd></dl>
      </li>)}</ul>
    </>}
    {source.phase === "ready" && source.data?.kind === "delivery" && <>
      <Link className="underline" to={`/backend-distribution?delivery=${source.data.delivery.delivery_id}`}>Buka rincian pengiriman</Link>
      <dl className="[&>dd]:break-all"><dt>ID pengiriman</dt><dd>{source.data.delivery.delivery_id}</dd>
        <dt>Jumlah dikirim</dt><dd><Value value={source.data.delivery.dispatch_quantity} unit={source.data.delivery.original_unit} /></dd>
        <dt>Jumlah diterima</dt><dd><Value value={source.data.delivery.received_quantity} unit={source.data.delivery.original_unit} /></dd>
        <dt>Kondisi pangan saat diukur (mass basis)</dt><dd>{source.data.delivery.mass_basis}</dd>
        <dt>Status rekonsiliasi dari server</dt><dd>{source.data.delivery.reconciliation_status}</dd>
        <dt>Waktu pengiriman</dt><dd><Time value={source.data.delivery.dispatched_at} /></dd>
        <dt>Waktu penerimaan</dt><dd><Time value={source.data.delivery.received_at} /></dd>
        <dt>Waktu input pengiriman</dt><dd><Time value={source.data.delivery.recorded_at} /></dd></dl>
      <p>Perbedaan belum diklasifikasi; bukan atribusi waste. Panel tidak menghitung selisih turunan.</p>
    </>}
  </section>;
}
