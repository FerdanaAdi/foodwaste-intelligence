import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { authSnapshot, permits, subscribeAuth } from "@/backend/auth";
import {
  createBackendDisposition, createBackendMovement, createBackendReceipt,
  readDispositions, readKpiCatalogue, readKpiPreview, readLot, readReceipts, readTrends,
  type Disposition, type KpiEntry, type KpiPreview, type LotDetail, type Receipt, type TrendsView,
} from "@/backend/p1";
import { BACKEND_MASS_BASES } from "@/backend/contract";
import { EmptyState, LoadingState, ServiceUnavailableState } from "@/components/states/DisplayStates";

const field = "w-full rounded border border-slate-300 bg-white p-2";
const card = "rounded border bg-white p-4 space-y-3";
const PROVISIONAL_MOVEMENT_TYPES = ["issue_to_batch", "return_from_batch", "transfer", "stock_correction"] as const;
const PROVISIONAL_OUTCOMES = ["compost", "disposal", "animal_feed", "processing", "redistribution_handover"] as const;
const SAFETY_STATUSES = ["not_assessed", "assessed_safe", "assessed_unsafe"] as const;
type Feedback = { kind: "error" | "success" | "unknown"; message: string } | null;
const DECIMAL = /^\d+(?:\.\d+)?$/;

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return <p role={feedback.kind === "success" ? "status" : "alert"}
    className={feedback.kind === "unknown" ? "rounded border border-amber-300 bg-amber-50 p-3"
      : feedback.kind === "success" ? "rounded border border-emerald-300 bg-emerald-50 p-3"
      : "rounded border border-red-300 bg-red-50 p-3"}>{feedback.message}</p>;
}

function ReceivingSection() {
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [receiptForm, setReceiptForm] = useState({ source_ref: "", received_at: "", note: "" });
  const [receiptFeedback, setReceiptFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [lot, setLot] = useState<LotDetail | null>(null);
  const [lotLoading, setLotLoading] = useState(false);
  const [movementForm, setMovementForm] = useState({ movement_type: "", direction: "", quantity: "", target_ref: "", occurred_at: "" });
  const [movementFeedback, setMovementFeedback] = useState<Feedback>(null);
  const canWrite = permits("receipt.create") && permits("movement.create");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true); setError(null);
    readReceipts(authSnapshot().site, controller.signal)
      .then(value => { if (active) { setReceipts(value); setLoading(false); } })
      .catch(reason => { if (active) { setError(reason instanceof Error ? reason.message : "Pembacaan gagal."); setLoading(false); } });
    return () => { active = false; controller.abort(); };
  }, [attempt]);

  const openLot = useCallback((lotId: string) => {
    setLotLoading(true); setLot(null); setMovementFeedback(null);
    readLot(lotId).then(value => setLot(value))
      .catch(reason => setMovementFeedback({ kind: "error", message: reason instanceof Error ? reason.message : "Lot tidak dapat dibaca." }))
      .finally(() => setLotLoading(false));
  }, []);

  async function submitReceipt(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!receiptForm.source_ref.trim() || !receiptForm.received_at) {
      setReceiptFeedback({ kind: "error", message: "Referensi penerimaan dan waktu wajib diisi." });
      return;
    }
    setBusy(true); setReceiptFeedback(null);
    const result = await createBackendReceipt(receiptForm);
    setBusy(false);
    if (result.kind === "saved") {
      setReceiptForm({ source_ref: "", received_at: "", note: "" });
      setReceiptFeedback({ kind: "success", message: `Penerimaan tersimpan: ${result.value.source_ref}. Satu penerimaan tidak menghasilkan event limbah.` });
      setAttempt(n => n + 1);
    } else setReceiptFeedback({ kind: result.kind === "rejected" ? "error" : "unknown", message: result.message });
  }

  async function submitMovement(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !lot) return;
    if (!movementForm.movement_type || !movementForm.direction || !DECIMAL.test(movementForm.quantity) || !movementForm.occurred_at) {
      setMovementFeedback({ kind: "error", message: "Jenis, arah, jumlah desimal, dan waktu wajib diisi." });
      return;
    }
    setBusy(true); setMovementFeedback(null);
    const result = await createBackendMovement(lot.lot_id, movementForm as never);
    setBusy(false);
    if (result.kind === "saved") {
      setMovementForm({ movement_type: "", direction: "", quantity: "", target_ref: "", occurred_at: "" });
      setMovementFeedback({ kind: "success", message: `Mutasi tersimpan. Mutasi bukan event limbah baru.` });
      openLot(lot.lot_id);
    } else setMovementFeedback({ kind: result.kind === "rejected" ? "error" : "unknown", message: result.message });
  }

  return <section className={card}>
    <h2 className="text-lg font-semibold">Penerimaan &amp; lot (FR-101 kandidat)</h2>
    <p className="text-sm">Satu penerimaan menghasilkan lot beridentitas; mutasi stok bukan timbulan limbah. Identitas duplikat ditolak server (HTTP 409).</p>
    {!canWrite && <p className="text-sm text-slate-600">Anda tidak memiliki izin tulis P1 pada site aktif; formulir disembunyikan.</p>}
    {canWrite && <form onSubmit={submitReceipt} className="grid gap-3 sm:grid-cols-4" noValidate>
      <label className="block sm:col-span-1">Ref. penerimaan<input className={field} value={receiptForm.source_ref} onChange={e => setReceiptForm(v => ({ ...v, source_ref: e.target.value }))} placeholder="RCV-SYN-101" /></label>
      <label className="block sm:col-span-1">Diterima pada (ISO+offset)<input className={field} value={receiptForm.received_at} onChange={e => setReceiptForm(v => ({ ...v, received_at: e.target.value }))} placeholder="2026-11-05T07:30:00+08:00" /></label>
      <label className="block sm:col-span-1">Catatan<input className={field} value={receiptForm.note} onChange={e => setReceiptForm(v => ({ ...v, note: e.target.value }))} /></label>
      <button type="submit" disabled={busy} className="self-end rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">Catat penerimaan</button>
    </form>}
    <FeedbackLine feedback={receiptFeedback} />
    {loading && <LoadingState label="Memuat penerimaan…" />}
    {!loading && error && <ServiceUnavailableState detail={error} onRetry={() => setAttempt(n => n + 1)} />}
    {!loading && !error && receipts?.length === 0 && <EmptyState title="Belum ada penerimaan" description="Belum ada catatan penerimaan untuk site aktif; status kosong bukan nol terukur." />}
    {!loading && !error && receipts && receipts.length > 0 && <ul className="space-y-2">
      {receipts.map(receipt => <li key={receipt.receipt_id} className="rounded border border-slate-200 p-2 text-sm">
        <span className="font-mono">{receipt.source_ref}</span> · {receipt.received_at}
        <LotPicker receiptId={receipt.receipt_id} lot={lot} onOpen={openLot} loading={lotLoading} />
      </li>)}
    </ul>}
    {lot && <div className="rounded border border-slate-300 bg-slate-50 p-3 text-sm space-y-2">
      <p>Lot <span className="font-mono">{lot.lot_ref}</span> · {lot.item_code} · {lot.quantity} {lot.original_unit} ({lot.mass_basis})</p>
      <p>Stok teramati provisional: <strong>{lot.observed_stock} {lot.original_unit}</strong> — {lot.stock_note}</p>
      <ul className="list-disc pl-5">{lot.movements.map(movement => <li key={movement.movement_id}>
        {movement.occurred_at} · {movement.movement_type} · {movement.direction === "in" ? "masuk" : "keluar"} {movement.quantity} {movement.target_ref ? `→ ${movement.target_ref}` : ""}
      </li>)}</ul>
      {canWrite && <form onSubmit={submitMovement} className="grid gap-2 sm:grid-cols-5" noValidate>
        <select className={field} value={movementForm.movement_type} onChange={e => setMovementForm(v => ({ ...v, movement_type: e.target.value }))} aria-label="Jenis mutasi">
          <option value="">— Jenis mutasi —</option>{PROVISIONAL_MOVEMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={field} value={movementForm.direction} onChange={e => setMovementForm(v => ({ ...v, direction: e.target.value as "in" | "out" }))} aria-label="Arah">
          <option value="">— Arah —</option><option value="in">in (masuk)</option><option value="out">out (keluar)</option>
        </select>
        <input className={field} inputMode="decimal" placeholder="Jumlah (kg)" value={movementForm.quantity} onChange={e => setMovementForm(v => ({ ...v, quantity: e.target.value }))} aria-label="Jumlah kg" />
        <input className={field} placeholder="Ref tujuan" value={movementForm.target_ref} onChange={e => setMovementForm(v => ({ ...v, target_ref: e.target.value }))} aria-label="Referensi tujuan" />
        <input className={field} placeholder="2026-11-05T08:00:00+08:00" value={movementForm.occurred_at} onChange={e => setMovementForm(v => ({ ...v, occurred_at: e.target.value }))} aria-label="Waktu mutasi" />
        <button type="submit" disabled={busy} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50 sm:col-span-5">Catat mutasi lot</button>
      </form>}
      <FeedbackLine feedback={movementFeedback} />
    </div>}
  </section>;
}

function LotPicker({ receiptId, lot, onOpen, loading }: {
  receiptId: string; lot: LotDetail | null; onOpen: (lotId: string) => void; loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open && (!lot || lot.receipt_id !== receiptId)) onOpen(receiptId); }, [open, receiptId, lot, onOpen]);
  return <span className="ml-2">
    <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setOpen(value => !value)}>
      {open ? "Tutup lot" : "Buka lot & stok (GET)"}
    </button>
    {loading && open && <LoadingState label="Memuat lot…" />}
  </span>;
}

function DispositionSection() {
  const [form, setForm] = useState({ eventId: "", outcome_type: "", quantity: "", mass_basis: "", occurred_at: "", food_safety_status: "", handover_ref: "" });
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [records, setRecords] = useState<Disposition[] | null>(null);
  const [busy, setBusy] = useState(false);
  const canWrite = permits("disposition.create");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!form.eventId || !form.outcome_type || !DECIMAL.test(form.quantity) || !form.mass_basis || !form.occurred_at || !form.food_safety_status) {
      setFeedback({ kind: "error", message: "Semua field kecuali ref serah terima wajib diisi; jumlah harus desimal." });
      return;
    }
    setBusy(true); setFeedback(null);
    const result = await createBackendDisposition(form.eventId, form);
    setBusy(false);
    if (result.kind === "saved") {
      setFeedback({ kind: "success", message: `Disposition tersimpan (${result.value.allocation_status}). Disposisi bukan event limbah baru.` });
      setRecords(null);
    } else setFeedback({ kind: result.kind === "rejected" ? "error" : "unknown", message: result.message });
  }

  async function loadDispositions(event: React.FormEvent) {
    event.preventDefault();
    if (!form.eventId) { setFeedback({ kind: "error", message: "Isi UUID event terlebih dahulu." }); return; }
    setRecords(null);
    readDispositions(form.eventId).then(setRecords)
      .catch(reason => setFeedback({ kind: "error", message: reason instanceof Error ? reason.message : "Disposisi tidak dapat dibaca." }));
  }

  const rescueBlockedNotice = form.food_safety_status !== "assessed_safe"
    && (form.outcome_type === "animal_feed" || form.outcome_type === "redistribution_handover");

  return <section className={card}>
    <h2 className="text-lg font-semibold">Disposisi &amp; safety gate (FR-105 kandidat)</h2>
    <p className="text-sm">Disposisi mencatat akhir material dari event yang sama — bukan event baru. Rescue/redistribusi memerlukan food safety <code>assessed_safe</code>; tidak ada endpoint eksekusi rescue.</p>
    {!canWrite && <p className="text-sm text-slate-600">Anda tidak memiliki izin pencatatan disposisi; formulir disembunyikan.</p>}
    {canWrite && <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3" noValidate>
      <label className="block">UUID event sumber<input className={field} value={form.eventId} onChange={e => setForm(v => ({ ...v, eventId: e.target.value }))} placeholder="UUID event" /></label>
      <label className="block">Outcome provisional
        <select className={field} value={form.outcome_type} onChange={e => setForm(v => ({ ...v, outcome_type: e.target.value }))}>
          <option value="">— Pilih outcome —</option>{PROVISIONAL_OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      <label className="block">Status food safety
        <select className={field} value={form.food_safety_status} onChange={e => setForm(v => ({ ...v, food_safety_status: e.target.value }))}>
          <option value="">— Pilih status —</option>{SAFETY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="block">Jumlah (kg)<input className={field} inputMode="decimal" value={form.quantity} onChange={e => setForm(v => ({ ...v, quantity: e.target.value }))} /></label>
      <label className="block">Mass basis
        <select className={field} value={form.mass_basis} onChange={e => setForm(v => ({ ...v, mass_basis: e.target.value }))}>
          <option value="">— Pilih basis —</option>{BACKEND_MASS_BASES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </label>
      <label className="block">Waktu (ISO+offset)<input className={field} value={form.occurred_at} onChange={e => setForm(v => ({ ...v, occurred_at: e.target.value }))} placeholder="2026-11-05T10:00:00+08:00" /></label>
      <label className="block">Ref serah terima (opsional)<input className={field} value={form.handover_ref} onChange={e => setForm(v => ({ ...v, handover_ref: e.target.value }))} /></label>
      <button type="submit" disabled={busy} className="self-end rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">Catat disposisi</button>
    </form>}
    {rescueBlockedNotice && <p role="note" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
      Safety gate: outcome rescue-like dengan status <code>{form.food_safety_status || "kosong"}</code> akan ditolak server (HTTP 422). Status tidak berubah otomatis menjadi aman.</p>}
    <FeedbackLine feedback={feedback} />
    <form onSubmit={loadDispositions} className="flex flex-wrap items-end gap-2">
      <label className="block">Baca disposisi event<input className={field} value={form.eventId} onChange={e => setForm(v => ({ ...v, eventId: e.target.value }))} placeholder="UUID event" /></label>
      <button type="submit" className="rounded border px-4 py-2">Baca (GET)</button>
    </form>
    {records?.length === 0 && <EmptyState title="Belum ada disposisi" description="Event ini belum memiliki catatan outcome." />}
    {records && records.length > 0 && <ul className="list-disc pl-5 text-sm">
      {records.map(record => <li key={record.disposition_id}>
        {record.outcome_type} · {record.quantity} {record.original_unit} ({record.mass_basis}) · safety {record.food_safety_status} · alokasi <strong>{record.allocation_status}</strong>
      </li>)}
    </ul>}
  </section>;
}

function KpiCatalogueSection() {
  const [entries, setEntries] = useState<KpiEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<KpiPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    readKpiCatalogue(controller.signal)
      .then(value => { if (active) { setEntries(value); setLoading(false); } })
      .catch(reason => { if (active) { setError(reason instanceof Error ? reason.message : "Katalog tidak dapat dibaca."); setLoading(false); } });
    return () => { active = false; controller.abort(); };
  }, []);

  async function requestPreview(code: string) {
    setPreviewBusy(true); setPreview(null);
    try { setPreview(await readKpiPreview(code)); }
    catch (reason) { setPreview(null); setError(reason instanceof Error ? reason.message : "Preview tidak dapat dibaca."); }
    finally { setPreviewBusy(false); }
  }

  return <section className={card}>
    <h2 className="text-lg font-semibold">Katalog KPI terkontrol (FR-201 kandidat)</h2>
    <p className="text-sm">Status desain FWI-03; lulus desain rumus ≠ tervalidasi operasional. KPI HELD tidak memiliki nilai numerik di UI, API, maupun ekspor.</p>
    {loading && <LoadingState label="Memuat katalog…" />}
    {!loading && error && <ServiceUnavailableState detail={error} onRetry={() => window.location.reload()} />}
    {!loading && !error && entries?.length === 0 && <EmptyState title="Katalog kosong" description="Registry belum di-seed pada database uji; tidak ada KPI dianggap siap." />}
    {!loading && !error && entries && entries.length > 0 && <table className="w-full text-sm">
      <caption className="sr-only">Katalog KPI: kode, status desain, dan prasyarat</caption>
      <thead><tr><th scope="col" className="text-left">Kode</th><th scope="col" className="text-left">Status desain</th><th scope="col" className="text-left">Sumber</th><th scope="col" className="text-left">Aksi</th></tr></thead>
      <tbody>{entries.map(entry => <tr key={entry.kpi_code} className="border-t border-slate-200">
        <td className="py-2 font-mono">{entry.kpi_code}</td>
        <td className="py-2">{entry.design_status === "held"
          ? <span className="rounded bg-red-100 px-2 py-1 font-semibold text-red-900">HELD — dihitung dinonaktifkan</span>
          : entry.design_status === "design_pass" ? <span className="rounded bg-sky-100 px-2 py-1 text-sky-900">lulus desain rumus; belum tervalidasi operasional</span>
          : <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">conditional</span>}</td>
        <td className="py-2 text-xs">{entry.source_doc_revision}</td>
        <td className="py-2"><button type="button" disabled={previewBusy} className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          onClick={() => { void requestPreview(entry.kpi_code); }}>Minta status preview</button></td>
      </tr>)}</tbody>
    </table>}
    {previewBusy && <LoadingState label="Meminta status preview…" />}
    {preview && <div role="status" className="rounded border border-slate-300 bg-slate-50 p-3 text-sm">
      <p><span className="font-mono">{preview.kpi_code}</span> · status: <strong>{preview.status}</strong></p>
      <p>{preview.reason}</p>
      <p className="text-xs text-slate-600">{preview.note}</p>
    </div>}
  </section>;
}

function TrendsSection() {
  const [dateFrom, setDateFrom] = useState("2026-11-04");
  const [dateTo, setDateTo] = useState("2026-11-06");
  const [view, setView] = useState<TrendsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      setError("Gunakan format tanggal YYYY-MM-DD."); return;
    }
    setLoading(true); setError(null); setView(null);
    readTrends(authSnapshot().site, dateFrom, dateTo).then(setView)
      .catch(reason => setError(reason instanceof Error ? reason.message : "Tren tidak dapat dibaca."))
      .finally(() => setLoading(false));
  }

  return <section className={card}>
    <h2 className="text-lg font-semibold">Tren operasional deskriptif (FR-106 kandidat)</h2>
    <p className="text-sm">Per basis dan status, tanpa rasio campuran; residual delivery adalah selisih deskriptif untuk direview, bukan waste otomatis.</p>
    <form onSubmit={load} className="flex flex-wrap items-end gap-2" noValidate>
      <label className="block">Dari<input className={field} value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="2026-11-04" /></label>
      <label className="block">Sampai<input className={field} value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="2026-11-06" /></label>
      <button type="submit" disabled={loading} className="rounded border px-4 py-2 disabled:opacity-50">Muat tren (GET)</button>
    </form>
    {loading && <LoadingState label="Memuat tren…" />}
    {error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm">{error}</p>}
    {view && <div className="space-y-2 text-sm">
      <p className="text-xs text-slate-600">{view.note} · versi perhitungan: {view.calculation_version}</p>
      <p>Event: {Object.entries(view.event_counts).map(([type, count]) => `${type}: ${count}`).join(" · ") || "tidak ada"} · dengan measurement: {view.completeness.events_with_measurement ?? 0}/{view.completeness.events_total ?? 0}</p>
      <p role="status">Massa pelaporan belum tersedia: {view.mass_reporting.status} — {view.mass_reporting.reason}</p>
      {view.per_basis.length === 0 ? <EmptyState title="Belum ada pengukuran pada periode ini" /> : <table className="w-full">
        <caption className="sr-only">Event dan measurement per basis; massa hanya bila agregasi tersedia</caption>
        <thead><tr><th scope="col" className="text-left">Basis</th><th scope="col" className="text-right">Event</th><th scope="col" className="text-right">Measurement</th><th scope="col" className="text-left">Agregasi massa</th></tr></thead>
        <tbody>{view.per_basis.map(stat => <tr key={stat.mass_basis} className="border-t border-slate-200 align-top">
          <td className="py-1">{stat.mass_basis}</td>
          <td className="text-right">{stat.event_count}</td>
          <td className="text-right">{stat.measurement_count}</td>
          <td className="pl-3"><strong>{stat.aggregation.status}</strong> — massa pelaporan belum tersedia
            <span className="block text-xs text-slate-600">{stat.aggregation.reason}</span>
          </td>
        </tr>)}</tbody>
      </table>}
      <p role="note" className="rounded border border-amber-300 bg-amber-50 p-2">
        Rasio campuran raw/cooked: <strong>{view.mixed_basis_ratio.status}</strong> — {view.mixed_basis_ratio.reason}</p>
      {view.delivery_residuals.map(residual => <p key={residual.delivery_id} className="text-xs">
        Delivery {residual.delivery_id.slice(0, 8)}… dispatch {residual.dispatch_quantity} vs received {residual.received_quantity ?? "belum diterima"} → selisih {residual.difference ?? "N/A"} ({residual.reconciliation_status})
      </p>)}
    </div>}
  </section>;
}

export default function BackendOperationsPage() {
  const auth = useSyncExternalStore(subscribeAuth, authSnapshot);
  if (auth.phase !== "ready" || !auth.site) {
    return <section role="status" className={card}>
      <h1 className="text-xl font-bold">Operasi P1 kandidat</h1>
      <p>Sesi/site backend belum siap. Halaman ini tidak memakai fixture sebagai ganti backend.</p>
    </section>;
  }
  return <div className="space-y-6">
    <header className="space-y-2">
      <h1 className="text-2xl font-bold">Operasi P1 — kandidat terisolasi</h1>
      <p>Kandidat P1 PRD extension (PROPOSED): penerimaan/lot/mutasi, disposisi dengan safety gate, katalog KPI, tren deskriptif. Semua tulisan memakai intent sekali pakai dan tidak pernah retry otomatis.</p>
      <p className="text-sm text-amber-800">Data sintetis saja. Bukan sistem resmi BGN; tidak ada KPI HELD yang dihitung; tidak ada keputusan otomatis keamanan pangan.</p>
    </header>
    <ReceivingSection />
    <DispositionSection />
    <KpiCatalogueSection />
    <TrendsSection />
  </div>;
}
