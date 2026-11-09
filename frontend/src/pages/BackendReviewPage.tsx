import { useState } from "react";
import { readBackendReviews, submitBackendReview, reviewInputErrors,
         readReviewPending,
         type ReviewHistory, type ReviewInput, type ReviewTargetKind } from "@/backend/review";
import { permits } from "@/backend/auth";
import { EmptyState, LoadingState, ServiceUnavailableState } from "@/components/states/DisplayStates";

const field = "w-full rounded border border-slate-300 bg-white p-2";
const INITIAL: ReviewInput = { target_kind: "event", target_id: "", reason: "", source: "", provenance: "" };

/** Live review & correction-proposal page (FR-006). PROPOSAL-ONLY: approval and
 *  effective correction are BLOCKED on the approved-policy decision (OD-004).
 *  This page can never apply, approve, or overwrite an original observation. */
export default function BackendReviewPage() {
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
    setError(null); setLoading(true);
    try { setHistory(await readBackendReviews(kind, id, new AbortController().signal)); }
    catch (err) { setHistory(null); setError(err instanceof Error ? err.message : "Pembacaan riwayat gagal."); }
    finally { setLoading(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || pending) return;
    const payload: ReviewInput = { ...input };
    if (input.target_kind === "measurement" && proposedNet.trim()) payload.proposed_values = { net: proposedNet.trim() };
    if (input.target_kind === "event" && proposedOccurredAt.trim()) payload.proposed_values = { occurred_at: proposedOccurredAt.trim() };
    const errors = reviewInputErrors(payload); setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setBusy(true); setFeedback(null);
    try {
      const result = await submitBackendReview(payload);
      if (result.kind === "saved") {
        setFeedback({ tone: "ok", message: `Usulan tersimpan (PROPOSAL — belum efektif): ${result.value.review_decision_id}. Record asal tidak berubah.` });
        setInput({ ...INITIAL }); setProposedNet(""); setProposedOccurredAt("");
        setQueryKind(payload.target_kind); setQueryId(payload.target_id);
        void runQuery(payload.target_kind, payload.target_id);
      } else if (result.kind === "rejected") setFeedback({ tone: "error", message: result.message });
      else setFeedback({ tone: "unknown", message: result.message });
    } finally { setBusy(false); setPending(readReviewPending() !== null); }
  }

  return <div className="space-y-6">
    <header className="space-y-2">
      <h1 className="text-2xl font-bold">Review &amp; Usulan Koreksi — LIVE BACKEND (sintetis)</h1>
      <p>Decision dan usulan koreksi tersimpan append-only di PostgreSQL. Status saat ini: <strong>PROPOSAL — belum dapat diterapkan</strong>; tidak ada tombol approve karena kebijakan approval/effective correction masih OPEN (OD-004).</p>
      <p className="text-sm text-slate-600">Nilai asal selalu dipertahankan pada setiap usulan; tidak ada overwrite diam-diam. Observation status, validation status, dan review status adalah konsep terpisah.</p>
    </header>

    <form className="rounded border bg-white p-4 space-y-3" onSubmit={e => { e.preventDefault(); if (queryId.trim()) void runQuery(queryKind, queryId.trim()); }}>
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
    </form>

    {loading && <LoadingState label="Memuat riwayat review…" />}
    {!loading && error && <ServiceUnavailableState detail={error} />}
    {!loading && !error && history && history.decisions.length === 0 && history.proposals.length === 0 &&
      <EmptyState title="Belum ada review pada target ini" description="Riwayat kosong bukan status 'validated'; validasi tidak diinferensikan dari ketiadaan record." />}
    {!loading && !error && history && (history.decisions.length > 0 || history.proposals.length > 0) && <section className="space-y-3">
      <h2 className="font-semibold">Riwayat append-only</h2>
      <ul className="space-y-2">
        {history.decisions.map(row => <li key={row.review_decision_id} className="rounded border bg-white p-3 text-sm">
          <p className="font-semibold">{row.decision} · oleh {row.actor_id}</p>
          <p className="text-slate-600">{row.recorded_at} · sumber: {row.source} · alasan: {row.rationale}</p>
        </li>)}
        {history.proposals.map(row => <li key={row.correction_record_id} className="rounded border bg-white p-3 text-sm">
          <p className="font-semibold">Usulan {row.correction_record_id} — state: {row.state} (PROVISIONAL)</p>
          <p className="break-all">Asal: <code>{JSON.stringify(row.original_values)}</code></p>
          <p className="break-all">Usulan: <code>{JSON.stringify(row.proposed_values)}</code></p>
        </li>)}
      </ul>
    </section>}

    {permits('event.create') && <form onSubmit={submit} noValidate className="rounded border bg-white p-4 space-y-3">
      <h2 className="text-lg font-semibold">Catat review / usulkan koreksi</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">Jenis target
          <select className={field} value={input.target_kind} onChange={e => setInput(v => ({ ...v, target_kind: e.target.value as ReviewTargetKind }))}>
            <option value="event">event</option><option value="measurement">measurement</option>
          </select>
        </label>
        <label className="block">UUID target (tulis){fieldErrors.target_id && <span className="text-red-700"> — {fieldErrors.target_id}</span>}
          <input className={field} value={input.target_id} onChange={e => setInput(v => ({ ...v, target_id: e.target.value }))} aria-invalid={!!fieldErrors.target_id} />
        </label>
        <label className="block sm:col-span-2">Alasan{fieldErrors.reason && <span className="text-red-700"> — {fieldErrors.reason}</span>}
          <input className={field} value={input.reason} onChange={e => setInput(v => ({ ...v, reason: e.target.value }))} aria-invalid={!!fieldErrors.reason} />
        </label>
        <label className="block">Sumber review
          <input className={field} value={input.source} onChange={e => setInput(v => ({ ...v, source: e.target.value }))} placeholder="mis. synthetic_reviewer" />
        </label>
        <label className="block">Provenance
          <input className={field} value={input.provenance} onChange={e => setInput(v => ({ ...v, provenance: e.target.value }))} placeholder="mis. synthetic_fixture" />
        </label>
        <label className="block sm:col-span-2">{input.target_kind === "measurement" ? "Usulan net baru (kg, opsional; kosongkan bila hanya review)"
          : "Usulan waktu kejadian baru (opsional; ISO dengan offset; kosongkan bila hanya review)"}
          {input.target_kind === "measurement"
            ? <input className={field} inputMode="decimal" value={proposedNet} onChange={e => setProposedNet(e.target.value)} placeholder="mis. 1.90" />
            : <input className={field} value={proposedOccurredAt} onChange={e => setProposedOccurredAt(e.target.value)} placeholder="2026-11-06T12:30:00+08:00" />}
        </label>
      </div>
      <p className="text-sm text-slate-600">Usulan divalidasi backend terhadap konteks lengkap (gross/tare/net); field identitas/scope/status tidak dapat diusulkan. Tidak ada efek ke record asal.</p>
      <button type="submit" disabled={busy || pending} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">Simpan usulan (proposal)</button>
    </form>}
    {pending && <section role="alert" className="rounded border-2 border-amber-600 bg-amber-50 p-4 space-y-2">
      <h2 className="font-semibold">POST review belum terkonfirmasi (UNKNOWN)</h2>
      <p className="text-sm">Usulan mungkin sudah tersimpan di server. Tidak ada retry otomatis, dan mengirim ulang dapat membuat duplikat. Pencarian GET (termasuk hasil kosong atau target lain) TIDAK dapat membuktikan hasil POST asal, sehingga tidak ada mekanisme buka-kunci manual di halaman ini: penanda tetap terkunci pada sesi tab ini.</p>
      <p className="text-xs text-slate-600">Anda tetap dapat membaca riwayat melalui panel GET. Operasi lain yang berbeda jenis (mis. evidence) tidak terpengaruh. Jangan klaim tersimpan atau gagal tanpa bukti server yang definitif.</p>
    </section>}
    {feedback && <p role={feedback.tone === "ok" ? "status" : "alert"} className="rounded border bg-white p-3">{feedback.message}</p>}
  </div>;
}
