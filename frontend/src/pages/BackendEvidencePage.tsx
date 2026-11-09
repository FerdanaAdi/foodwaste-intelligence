import { useEffect, useState, useSyncExternalStore } from "react";
import { listBackendEvidence, createBackendEvidence, evidenceInputErrors,
         readEvidencePending,
         type EvidenceInput, type EvidenceRecord, type EvidenceTargetKind } from "@/backend/evidence";
import { authSnapshot, permits, subscribeAuth } from "@/backend/auth";
import { EmptyState, LoadingState, ServiceUnavailableState } from "@/components/states/DisplayStates";

const field = "w-full rounded border border-slate-300 bg-white p-2";
const INITIAL: EvidenceInput = { target_kind: "event", target_id: "", kind: "reference",
  source: "", title: "", recorded_at: "", availability: "unknown", verification: "unverified" };

/** Live evidence METADATA page (FR-005). Metadata-only: no upload, no download,
 *  no storage identifiers; verification never approves a measurement (ADR-005 OPEN). */
export default function BackendEvidencePage() {
  const auth = useSyncExternalStore(subscribeAuth, authSnapshot);
  const [queryKind, setQueryKind] = useState<EvidenceTargetKind>("event");
  const [queryId, setQueryId] = useState("");
  const [records, setRecords] = useState<EvidenceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState<EvidenceInput>(INITIAL);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error" | "unknown"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // DEC-P0-ACCESS-05 (tightened per Codex blocker fix): once an evidence POST
  // outcome is UNKNOWN, the marker stays LOCKED. A successful GET can never
  // authorize clearing it — empty results, unrelated targets or pre-POST reads
  // prove nothing about the original POST. Only a definitive original POST
  // outcome (parsed 201 / explicit 4xx refusal) transitions the client state.
  const [pending, setPending] = useState(() => readEvidencePending() !== null);

  async function runQuery(kind: EvidenceTargetKind, id: string) {
    setError(null); setLoading(true);
    try { setRecords(await listBackendEvidence(kind, id, new AbortController().signal)); }
    catch (err) { setRecords(null); setError(err instanceof Error ? err.message : "Pembacaan bukti gagal."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    // Re-run only on the initial mount and auth-generation changes; explicit
    // queries are user-driven (GET only, never a POST replay).
    if (queryId.trim()) void runQuery(queryKind, queryId.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.generation]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || pending) return;
    const errors = evidenceInputErrors(input); setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setBusy(true); setFeedback(null);
    try {
      const result = await createBackendEvidence(input);
      if (result.kind === "saved") {
        setFeedback({ tone: "ok", message: `Metadata bukti tersimpan: ${result.value.evidence_id}. Verifikasi bukti bukan persetujuan pengukuran.` });
        setInput({ ...INITIAL });
        setQueryKind(result.value.target_kind); setQueryId(result.value.target_id);
        void runQuery(result.value.target_kind, result.value.target_id);
      } else if (result.kind === "rejected") setFeedback({ tone: "error", message: result.message });
      else setFeedback({ tone: "unknown", message: result.message });
    } finally { setBusy(false); setPending(readEvidencePending() !== null); }
  }

  return <div className="space-y-6">
    <header className="space-y-2">
      <h1 className="text-2xl font-bold">Bukti &amp; Provenance — LIVE BACKEND (sintetis)</h1>
      <p>Metadata bukti tersimpan di PostgreSQL, tertaut ke event/measurement yang berada di site berizin. Slice ini metadata-only: tidak ada unggah berkas, unduhan, atau storage identifier (ADR-005 masih OPEN).</p>
      <p className="text-sm text-slate-600">Status ketersediaan <code>unknown</code> tetap unknown — tidak dianggap tersedia. Bukti terverifikasi bukan pengukuran yang disetujui.</p>
    </header>

    <form className="rounded border bg-white p-4 space-y-3" onSubmit={e => { e.preventDefault(); if (queryId.trim()) void runQuery(queryKind, queryId.trim()); }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">Jenis target
          <select className={field} value={queryKind} onChange={e => setQueryKind(e.target.value as EvidenceTargetKind)}>
            <option value="event">event</option><option value="measurement">measurement</option>
          </select>
        </label>
        <label className="block sm:col-span-2">UUID target (baca)
          <input className={field} value={queryId} onChange={e => setQueryId(e.target.value)} placeholder="UUID event/measurement backend" />
        </label>
      </div>
      <button type="submit" className="rounded border px-4 py-2">Baca daftar bukti (GET)</button>
    </form>

    {loading && <LoadingState label="Memuat metadata bukti…" />}
    {!loading && error && <ServiceUnavailableState detail={error} />}
    {!loading && !error && records !== null && records.length === 0 && <EmptyState title="Belum ada metadata bukti pada target ini"
      description="Daftar kosong bukan bukti bahwa tidak ada berkas fisik; ketersediaan berkas menunggu ADR-005." />}
    {!loading && !error && records !== null && records.length > 0 && <section className="space-y-2">
      <p role="status" className="text-sm">{records.length} metadata bukti (sumber: PostgreSQL berizin).</p>
      <ul className="space-y-2">
        {records.map(row => <li key={row.evidence_id} className="rounded border bg-white p-3 text-sm">
          <p className="font-semibold">{row.title}</p>
          <p>{row.kind} · sumber: {row.source} · ketersediaan: {row.availability} · verifikasi: {row.verification}</p>
          <p className="text-slate-600">Dicatat oleh {row.recorded_by} pada {row.recorded_at}{row.note ? ` · ${row.note}` : ""}</p>
        </li>)}
      </ul>
    </section>}

    {permits('event.create') && <form onSubmit={submit} noValidate className="rounded border bg-white p-4 space-y-3">
      <h2 className="text-lg font-semibold">Tambah metadata bukti</h2>
      <p className="text-sm">Field opsional kosong tidak dikirim. Tidak ada kolom berkas: unggah menunggu keputusan ADR-005.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">Jenis target
          <select className={field} value={input.target_kind} onChange={e => setInput(v => ({ ...v, target_kind: e.target.value as EvidenceTargetKind }))}>
            <option value="event">event</option><option value="measurement">measurement</option>
          </select>
        </label>
        <label className="block">UUID target (tulis){fieldErrors.target_id && <span className="text-red-700"> — {fieldErrors.target_id}</span>}
          <input className={field} value={input.target_id} onChange={e => setInput(v => ({ ...v, target_id: e.target.value }))} aria-invalid={!!fieldErrors.target_id} />
        </label>
        <label className="block">Jenis bukti
          <select className={field} value={input.kind} onChange={e => setInput(v => ({ ...v, kind: e.target.value as EvidenceInput["kind"] }))}>
            <option value="reference">reference</option><option value="attachment">attachment</option>
          </select>
        </label>
        <label className="block">Sumber bukti{fieldErrors.source && <span className="text-red-700"> — {fieldErrors.source}</span>}
          <input className={field} value={input.source} onChange={e => setInput(v => ({ ...v, source: e.target.value }))} placeholder="mis. synthetic_note" aria-invalid={!!fieldErrors.source} />
        </label>
        <label className="block sm:col-span-2">Judul{fieldErrors.title && <span className="text-red-700"> — {fieldErrors.title}</span>}
          <input className={field} value={input.title} onChange={e => setInput(v => ({ ...v, title: e.target.value }))} aria-invalid={!!fieldErrors.title} />
        </label>
        <label className="block">Waktu catat (ISO dengan offset){fieldErrors.recorded_at && <span className="text-red-700"> — {fieldErrors.recorded_at}</span>}
          <input className={field} value={input.recorded_at} onChange={e => setInput(v => ({ ...v, recorded_at: e.target.value }))} placeholder="2026-11-06T12:00:00+08:00" aria-invalid={!!fieldErrors.recorded_at} />
        </label>
        <label className="block">Ketersediaan
          <select className={field} value={input.availability} onChange={e => setInput(v => ({ ...v, availability: e.target.value as EvidenceInput["availability"] }))}>
            <option value="unknown">unknown</option><option value="available">available</option>
            <option value="unavailable">unavailable</option><option value="expired">expired</option>
          </select>
        </label>
        <label className="block">Catatan (opsional)
          <input className={field} value={input.note ?? ""} onChange={e => setInput(v => ({ ...v, note: e.target.value }))} />
        </label>
      </div>
      <button type="submit" disabled={busy || pending} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">Simpan metadata bukti</button>
    </form>}
    {pending && <section role="alert" className="rounded border-2 border-amber-600 bg-amber-50 p-4 space-y-2">
      <h2 className="font-semibold">POST evidence belum terkonfirmasi (UNKNOWN)</h2>
      <p className="text-sm">Hasil POST mungkin sudah tersimpan di server. Tidak ada retry otomatis, dan mengirim ulang dapat membuat duplikat. Pencarian GET (termasuk hasil kosong atau target lain) TIDAK dapat membuktikan hasil POST asal, sehingga tidak ada mekanisme buka-kunci manual di halaman ini: penanda tetap terkunci pada sesi tab ini.</p>
      <p className="text-xs text-slate-600">Anda tetap dapat membaca data melalui panel GET. Operasi lain yang berbeda jenis (mis. review) tidak terpengaruh. Jangan klaim tersimpan atau gagal tanpa bukti server yang definitif.</p>
    </section>}
    {feedback && <p role={feedback.tone === "ok" ? "status" : "alert"} className="rounded border bg-white p-3">{feedback.message}</p>}
  </div>;
}
