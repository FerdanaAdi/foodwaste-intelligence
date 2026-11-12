import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { BackendEvent } from '@/backend/contract';
export const eventLabels = { at_risk_surplus: 'Surplus pangan berisiko', actual_loss_discard: 'Pangan hilang atau dibuang' };
export const observationLabels = { observed: 'Hasil pengukuran tercatat', estimated: 'Perkiraan berat', measured_zero: 'Diukur, hasil 0 kg', missing: 'Berat belum tersedia', not_measured: 'Belum diukur' };
export const basisLabels = { raw: 'Mentah', after_preparation: 'Setelah persiapan', cooked: 'Matang', ready_to_eat: 'Siap dimakan', as_served: 'Saat disajikan', other_documented: 'Lainnya, terdokumentasi' };
export function PageHeading({ title, children }: { title: string; children: ReactNode }) {
  return <header className="ux-heading"><span className="ux-eyebrow">PANGAN · KONTEKS · KETERLACAKAN</span><h1>{title}</h1><p>{children}</p></header>;
}
export function PolicyNotice() { return <aside className="ux-policy"><strong>Berat untuk laporan belum ditentukan</strong><p>Hasil pengukuran tetap dapat dilihat satu per satu. Berat untuk laporan belum dapat ditentukan, bukan 0 kg.</p></aside>; }
export function TechnicalDetails({ children }: { children: ReactNode }) { return <details className="ux-technical"><summary>Detail teknis &amp; identitas</summary>{children}</details>; }
export function EventContext({ event, count }: { event: BackendEvent; count?: number }) {
 return <aside className="ux-context"><span className="ux-eyebrow">KONTEKS KEJADIAN</span><h2>{eventLabels[event.event_type]}</h2><p className="ux-help">Kejadian telah dibaca dari catatan tersimpan</p><dl><div><dt>Tahap / aktivitas</dt><dd>{event.stage_code || 'Belum dicatat'} / {event.process_step || 'Belum dicatat'}</dd></div><div><dt>Tanggal dan waktu kejadian · offset respons</dt><dd>{event.occurred_at}</dd></div><div><dt>Tanggal kegiatan dapur</dt><dd>{event.operation_date || 'Belum dicatat'}</dd></div></dl>{count !== undefined && <div className="ux-counts"><span><strong>1</strong>Jumlah kejadian</span><span><strong>{count}</strong>Jumlah pengukuran</span></div>}<TechnicalDetails><p className="break-all">ID kejadian: {event.event_id}</p><p className="break-all">Lokasi: {event.site_id}</p></TechnicalDetails><Link to={`/backend-demo/events/${event.event_id}`}>Lihat rincian kejadian →</Link></aside>;
}
export function ReviewLink({ eventId, measurementId }: { eventId: string; measurementId?: string }) {
 return <Link className="ux-action" to={`/backend-demo/review?event=${encodeURIComponent(eventId)}&target_kind=${measurementId ? 'measurement' : 'event'}&target=${encodeURIComponent(measurementId || eventId)}`}>Ajukan pemeriksaan</Link>;
}
/** Presentation only. Never derives offset or operation_date from browser/site timezone. */
export function TimestampInput({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }) {
 const descriptionId = useId();
 const describedBy = `${descriptionId}-help${error ? ` ${descriptionId}-error` : ''}`;
 const parse = (v: string) => { const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:\d{2})$/.exec(v);return m ? { date: m[1], time: m[2], offset: m[3] } : { date: '', time: '', offset: '' }; };
 const [parts, setParts] = useState(() => parse(value));const last = useRef(value);
 useEffect(() => { if (value !== last.current) { setParts(parse(value));last.current = value; } }, [value]);
 function update(key: keyof typeof parts, next: string) { const p = { ...parts, [key]: next };setParts(p);const result = p.date && p.time && p.offset ? `${p.date}T${p.time}${p.offset}` : '';last.current = result;onChange(result); }
 return <fieldset className="ux-time"><legend>{label}</legend><div className="ux-time-grid"><label>Tanggal<input aria-describedby={describedBy} aria-invalid={!!error} type="date" aria-label={`${label}: tanggal`} value={parts.date} onChange={e => update('date',e.target.value)} /></label><label>Jam sumber<input aria-describedby={describedBy} aria-invalid={!!error} type="time" step="any" aria-label={`${label}: jam`} value={parts.time} onChange={e => update('time',e.target.value)} /></label><label>Zona waktu dari catatan sumber<input aria-describedby={describedBy} aria-invalid={!!error} aria-label={`${label}: offset`} value={parts.offset} placeholder="±HH:MM atau Z" onChange={e => update('offset',e.target.value)} /></label></div><p id={`${descriptionId}-help`} className="ux-help">Isi selisih zona waktu sesuai catatan sumber, misalnya +08:00. Tanggal kegiatan dapur diisi terpisah.</p><details><summary>Format ISO sumber / presisi lanjutan</summary><label>{label} ISO-8601 dengan offset<input aria-describedby={describedBy} aria-invalid={!!error} value={value} onChange={e => {const raw=e.target.value;last.current=raw;onChange(raw);setParts(parse(raw));}} /></label></details>{error && <p id={`${descriptionId}-error`} role="alert" className="text-red-700">{error}</p>}</fieldset>;
}
