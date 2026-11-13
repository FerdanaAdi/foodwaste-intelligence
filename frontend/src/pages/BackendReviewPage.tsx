import { ProposalApprovalPanel } from "@/components/operational/CompletionTools";
import { useState, useEffect, useRef } from "react";
import { readBackendReviews, submitBackendReview, reviewInputErrors,
         readReviewPending,
         type ReviewHistory, type ReviewInput, type ReviewTargetKind } from "@/backend/review";
import { assertCurrent, authSnapshot, permits } from "@/backend/auth";
import { EmptyState, LoadingState, ServiceUnavailableState } from "@/components/states/DisplayStates";

import { Link, useSearchParams } from 'react-router';
import { isUUID, type BackendEvent, type BackendMeasurement } from '@/backend/contract';
import { readBackendEvent, readBackendMeasurements } from '@/backend/client';
import { PageHeading, EventContext, TechnicalDetails } from '@/components/operational/OperationalUI';

const field = "w-full rounded border border-slate-300 bg-white p-2";
const reviewFieldLabels: Record<string, string> = { occurred_at: 'Waktu kejadian', recorded_at: 'Waktu dicatat sistem', event_type: 'Jenis kejadian', stage_code: 'Tahap kegiatan', process_step: 'Aktivitas saat kejadian', operation_date: 'Tanggal kegiatan dapur', gross: 'Berat total termasuk wadah', tare: 'Berat wadah', net: 'Berat pangan tanpa wadah', mass_basis: 'Kondisi pangan saat diukur', observation_status: 'Kondisi hasil pengukuran', measurement_method: 'Cara memperoleh berat', provenance: 'Asal dan cara memperoleh data', measured_at: 'Waktu pengukuran' };
const INITIAL: ReviewInput = { target_kind: "event", target_id: "", reason: "", source: "", provenance: "" };

function ReviewValues({ values }: { values: Record<string, unknown> }) {
  const entries = Object.entries(values);
  const render = ([key, value]: [string, unknown]) => <div key={key}><dt>{reviewFieldLabels[key] || key}</dt><dd>{value === null ? "Tidak tersedia (null)" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>;
  return <><dl>{entries.filter(([key]) => !key.endsWith('_id')).map(render)}</dl>
    {entries.some(([key]) => key.endsWith('_id')) && <TechnicalDetails><dl>{entries.filter(([key]) => key.endsWith('_id')).map(render)}</dl></TechnicalDetails>}</>;
}

/** Live review & correction-proposal page (FR-006). PROPOSAL-ONLY: approval and
 *  effective correction are BLOCKED on the approved-policy decision (OD-004).
 *  This page can never apply, approve, or overwrite an original observation. */
function ContextReviewPage() {
  const [params] = useSearchParams();
  const contextId = params.get("event") || "";
  const [contextEvent, setContextEvent] = useState<BackendEvent | null>(null);
  const [contextMeasurements, setContextMeasurements] = useState<BackendMeasurement[]>([]);
  const [contextError, setContextError] = useState("");
  const verifiedContext = useRef<ReturnType<typeof authSnapshot> | null>(null);
  const readSeq = useRef(0);
  const readController = useRef<AbortController | null>(null);
  const [queryKind, setQueryKind] = useState<ReviewTargetKind>("event");
  const [queryId, setQueryId] = useState("");
  const [history, setHistory] = useState<ReviewHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState<ReviewInput>(INITIAL);
  const [proposedNet, setProposedNet] = useState("");
  const [proposedOccurredAt, setProposedOccurredAt] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error" | "unknown"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // DEC-P0-ACCESS-05 (tightened per Codex blocker fix): an UNKNOWN review POST
  // keeps the marker LOCKED. A successful GET can never authorize clearing it;
  // only a definitive original POST outcome transitions the client state.
  const [pending, setPending] = useState(() => readReviewPending() !== null);

  async function runQuery(kind: ReviewTargetKind, id: string) {
    const seq = ++readSeq.current;
    readController.current?.abort();
    const controller = new AbortController();readController.current = controller;
    setError(null); setLoading(true);setHistory(null);
    try { const result = await readBackendReviews(kind, id, controller.signal);if (seq === readSeq.current) setHistory(result); }
    catch (err) { if (seq === readSeq.current && !controller.signal.aborted) {setHistory(null); setError(err instanceof Error ? err.message : "Pembacaan riwayat gagal.");} }
    finally { if (seq === readSeq.current) setLoading(false); }
  }

  useEffect(() => () => { readSeq.current++;readController.current?.abort(); }, []);
  useEffect(() => {
    verifiedContext.current = null;
    setContextEvent(null);setContextMeasurements([]);setContextError('');
    if (!contextId) return;
    if (!isUUID(contextId)) { setContextError('Konteks kejadian tidak valid. Tidak ada POST dikirim.');return; }
    const controller = new AbortController();let active = true;
    const authority = authSnapshot();
    void Promise.all([readBackendEvent(contextId,controller.signal),readBackendMeasurements(contextId,controller.signal)]).then(([event, measurements]) => {
      if (!active) return;
      try { assertCurrent(authority); } catch { setContextError('Sesi atau lokasi berubah. Buka kembali kejadian dari riwayat.');return; }
      if (event.event_id !== contextId || event.site_id !== authority.site || !permits('event.read') ||
          measurements.some(m => m.event_id !== contextId)) {
        setContextError('Konteks tidak sesuai kejadian dan lokasi berizin. Tidak ada POST dikirim.');return;
      }
      const kind: ReviewTargetKind = params.get('target_kind') === 'measurement' ? 'measurement' : 'event';
      const target = params.get('target') || event.event_id;
      if (kind === 'event' ? target !== event.event_id : !measurements.some(m => m.measurement_id === target)) { setContextError('Target bukan bagian dari konteks kejadian yang terverifikasi.');return; }
      verifiedContext.current = authority;
      setContextEvent(event);setContextMeasurements(measurements);setInput({ ...INITIAL,target_kind:kind,target_id:target });setQueryKind(kind);setQueryId(target);
      void runQuery(kind,target);
    }, () => {if(active)setContextError('Konteks tidak dapat dibaca dari backend berizin. Tidak ada fallback atau POST.');});
    return () => {active=false;verifiedContext.current=null;controller.abort();readSeq.current++;readController.current?.abort();};
  }, [contextId, params]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || pending) return;
    if (contextId) {
      let valid = false;
      try {
        if (verifiedContext.current) {
          assertCurrent(verifiedContext.current);
          valid = !!contextEvent && contextEvent.event_id === contextId &&
            contextEvent.site_id === authSnapshot().site && permits('event.create') &&
            (input.target_kind === 'event' ? input.target_id === contextEvent.event_id :
              input.target_kind === 'measurement' && contextMeasurements.some(m =>
                m.measurement_id === input.target_id && m.event_id === contextId));
        }
      } catch { /* A stale verification must never authorize dispatch. */ }
      if (!valid) {
        setFeedback({ tone: 'error', message: 'Target, sesi, atau lokasi tidak sesuai konteks kejadian terverifikasi. Tidak ada usulan dikirim; pilih kembali dari riwayat.' });
        return;
      }
    }
    const payload: ReviewInput = { ...input };
    if (input.target_kind === "measurement" && proposedNet.trim()) payload.proposed_values = { net: proposedNet.trim() };
    if (input.target_kind === "event" && proposedOccurredAt.trim()) payload.proposed_values = { occurred_at: proposedOccurredAt.trim() };
    const errors = reviewInputErrors(payload); setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setBusy(true); setFeedback(null);
    try {
      const result = await submitBackendReview(payload);
      if (result.kind === "saved") {
        setFeedback({ tone: "ok", message: `Usulan pemeriksaan tercatat. Belum ada perubahan otomatis pada catatan asli. Nomor: ${result.value.review_decision_id}. Catatan asli tidak berubah.` });
        setInput({ ...INITIAL, ...(contextId ? { target_kind: payload.target_kind, target_id: payload.target_id } : {}) }); setProposedNet(""); setProposedOccurredAt("");
        setQueryKind(payload.target_kind); setQueryId(payload.target_id);
        void runQuery(payload.target_kind, payload.target_id);
      } else if (result.kind === "rejected") setFeedback({ tone: "error", message: result.message });
      else setFeedback({ tone: "unknown", message: result.message });
    } finally { setBusy(false); setPending(readReviewPending() !== null); }
  }

  return <div className="ux-page space-y-6">
    <PageHeading title="Periksa Catatan Sisa Pangan">Jika ada data yang perlu dilengkapi atau diperbaiki, kirim usulan pemeriksaan. Catatan asli tidak berubah otomatis.</PageHeading>
    {!contextId && <Link className="ux-action" to="/backend-demo/ledger">Pilih kejadian dari riwayat →</Link>}
    {contextId && !contextEvent && !contextError && <LoadingState label="Memuat konteks pemeriksaan…" />}
    {contextError && <p role="alert">{contextError}</p>}
    {contextEvent && <><EventContext event={contextEvent} count={contextMeasurements.length} /><label className="block">Catatan yang ingin diperiksa<select className={field} value={`${input.target_kind}:${input.target_id}`} onChange={e => {
      const [kind,id] = e.target.value.split(':');setInput(v => ({ ...v,target_kind:kind as ReviewTargetKind,target_id:id }));setQueryKind(kind as ReviewTargetKind);setQueryId(id);setProposedNet('');setProposedOccurredAt('');void runQuery(kind as ReviewTargetKind,id);
    }}><option value={`event:${contextEvent.event_id}`}>Kejadian terpilih</option>{contextMeasurements.map((m,i) => <option key={m.measurement_id} value={`measurement:${m.measurement_id}`}>Pengukuran {i+1} · {m.observation_status}</option>)}</select></label></>}


    <details className="ux-technical"><summary>Pencarian ID target manual (lanjutan)</summary><form className="rounded border bg-white p-4 space-y-3" onSubmit={e => { e.preventDefault(); if (queryId.trim()) void runQuery(queryKind, queryId.trim()); }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">Jenis target
          <select className={field} value={queryKind} onChange={e => setQueryKind(e.target.value as ReviewTargetKind)}>
            <option value="event">event</option><option value="measurement">measurement</option>
          </select>
        </label>
        <label className="block sm:col-span-2">UUID target (baca)
          <input className={field} value={queryId} onChange={e => setQueryId(e.target.value)} placeholder="UUID event/measurement backend" />
        </label>
      </div>
      <button type="submit" className="rounded border px-4 py-2">Baca riwayat review (GET)</button>
    </form></details>

    {loading && <LoadingState label="Memuat riwayat review…" />}
    {!loading && error && <ServiceUnavailableState detail={error} />}
    {!loading && !error && history && history.decisions.length === 0 && history.proposals.length === 0 &&
      <EmptyState title="Belum ada usulan pemeriksaan" description="Ini tidak berarti datanya sudah disetujui." />}
    {!loading && !error && history && (history.decisions.length > 0 || history.proposals.length > 0) && <section className="space-y-3">
      <h2 className="font-semibold">Riwayat pemeriksaan</h2>
      <ul className="space-y-2">
        {history.decisions.map(row => <li key={row.review_decision_id} className="rounded border bg-white p-3 text-sm">
          <p className="font-semibold">{row.decision === "request_correction" ? "Usulan Pemeriksaan" : "Catatan Pemeriksaan"}</p>
          <TechnicalDetails><p>Kode pemeriksaan: {row.decision}</p><p>Actor: {row.actor_id}</p><p>ID review: {row.review_decision_id}</p></TechnicalDetails>
          <p className="text-slate-600">{row.recorded_at} · sumber: {row.source} · alasan: {row.rationale}</p>
        </li>)}
        {history.proposals.map(row => <li key={row.correction_record_id} className="rounded border bg-white p-3 text-sm">
          <p className="font-semibold">Usulan tersimpan — {row.state === "proposed" ? "Belum diterapkan pada catatan asli" : "Lihat status sumber pada Detail Teknis"}</p>
          <ProposalApprovalPanel identifier={row.correction_record_id} actor={row.actor_id} revision={row.approval_revision ?? 0} status={row.approval_status ?? "unreviewed"} />
          <TechnicalDetails><p>ID usulan: {row.correction_record_id}</p><p>Kode status usulan: {row.state} (PROVISIONAL)</p></TechnicalDetails><div className="ux-comparison"><div><h3>Catatan asli · tidak berubah</h3><ReviewValues values={row.original_values} /></div><div><h3>Usulan perbaikan · belum diterapkan</h3><ReviewValues values={row.proposed_values} /></div></div>
        </li>)}
      </ul>
    </section>}

    {permits('event.create') && (!contextId || !!contextEvent) && <form onSubmit={submit} noValidate className="rounded border bg-white p-4 space-y-3">
      <h2 className="text-lg font-semibold">Ajukan pemeriksaan atau usulan perbaikan</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <details className="ux-technical sm:col-span-2"><summary>Identitas target (lanjutan)</summary><label className="block">Jenis target
          <select className={field} disabled={!!contextId} value={input.target_kind} onChange={e => setInput(v => ({ ...v, target_kind: e.target.value as ReviewTargetKind }))}>
            <option value="event">event</option><option value="measurement">measurement</option>
          </select>
        </label>
        <label className="block">UUID target (tulis){fieldErrors.target_id && <span className="text-red-700"> — {fieldErrors.target_id}</span>}
          <input className={field} readOnly={!!contextId} value={input.target_id} onChange={e => setInput(v => ({ ...v, target_id: e.target.value }))} aria-invalid={!!fieldErrors.target_id} />
        </label>
        </details><label className="block sm:col-span-2">Apa yang perlu diperiksa?{fieldErrors.reason && <span id="review-reason-error" role="alert" className="text-red-700"> — {fieldErrors.reason}</span>}
          <input className={field} value={input.reason} onChange={e => setInput(v => ({ ...v, reason: e.target.value }))} aria-describedby={fieldErrors.reason ? "review-reason-error" : undefined} aria-invalid={!!fieldErrors.reason} />
        </label>
        <label className="block">Sumber pemeriksaan
          <input className={field} aria-describedby="review-source-help" value={input.source} onChange={e => setInput(v => ({ ...v, source: e.target.value }))} placeholder="mis. synthetic_reviewer" />
        </label>
        <label className="block">Asal keterangan
          <input className={field} aria-describedby="review-source-help" value={input.provenance} onChange={e => setInput(v => ({ ...v, provenance: e.target.value }))} placeholder="mis. synthetic_fixture" />
        </label>
        <label className="block sm:col-span-2">{input.target_kind === "measurement" ? "Usulan berat pangan tanpa wadah (kg, opsional; kosongkan bila hanya pemeriksaan)"
          : "Usulan waktu kejadian baru (opsional; ikuti format waktu sumber)"}
          {input.target_kind === "measurement"
            ? <input className={field} inputMode="decimal" value={proposedNet} onChange={e => setProposedNet(e.target.value)} placeholder="mis. 1.90" />
            : <input className={field} value={proposedOccurredAt} onChange={e => setProposedOccurredAt(e.target.value)} placeholder="2026-11-06T12:30:00+08:00" />}
        </label>
      </div>
      <p id="review-source-help" className="text-sm text-slate-600">Sistem memeriksa kesesuaian usulan dengan catatan asli. Usulan belum mengubah catatan asli.</p>
      <button type="submit" disabled={busy || pending} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">Kirim Usulan Pemeriksaan</button>
    </form>}
    {pending && <section role="alert" className="rounded border-2 border-amber-600 bg-amber-50 p-4 space-y-2">
      <h2 className="font-semibold">Penyimpanan usulan belum terkonfirmasi (UNKNOWN)</h2>
      <p className="text-sm">Belum bisa dipastikan apakah usulan berhasil tersimpan. Jangan kirim ulang agar tidak tercatat dua kali. Melihat riwayat saja tidak membuktikan bahwa pengiriman gagal. Pengiriman tetap terkunci; minta bantuan petugas yang berwenang.</p>
      <p className="text-xs text-slate-600">Anda tetap dapat membaca riwayat melalui panel GET. Operasi lain yang berbeda jenis (mis. evidence) tidak terpengaruh. Jangan klaim tersimpan atau gagal tanpa bukti server yang definitif.</p>
    </section>}
    {feedback && <p role={feedback.tone === "ok" ? "status" : "alert"} className="rounded border bg-white p-3">{feedback.message}</p>}
  </div>;
}


export default function BackendReviewPage() {
  const [params] = useSearchParams();
  // A different URL target starts a fresh private draft/read view, never a replay.
  return <ContextReviewPage key={params.toString()} />;
}
