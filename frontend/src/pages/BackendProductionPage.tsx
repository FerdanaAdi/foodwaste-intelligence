import { useLayoutEffect, useRef, useState } from "react";
import {
  createBackendBatch, createBackendBatchIO, createBackendLink, createBackendMenu, createBackendRecipe,
  readBatch, readLineage, type BatchDetail, type LineageView,
} from "@/backend/p1";
import { useSearchParams } from "react-router";
import { BACKEND_MASS_BASES, isUUID } from "@/backend/contract";
import { permits } from "@/backend/auth";
import { EmptyState, LoadingState } from "@/components/states/DisplayStates";

const field = "w-full rounded border border-slate-300 bg-white p-2";
const card = "rounded border bg-white p-4 space-y-3";
type Feedback = { kind: "error" | "success" | "unknown"; message: string } | null;
const DECIMAL = /^\d+(?:\.\d+)?$/;

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return <p role={feedback.kind === "success" ? "status" : "alert"}
    className={feedback.kind === "unknown" ? "rounded border border-amber-300 bg-amber-50 p-3"
      : feedback.kind === "success" ? "rounded border border-emerald-300 bg-emerald-50 p-3"
      : "rounded border border-red-300 bg-red-50 p-3"}>{feedback.message}</p>;
}

export default function BackendProductionPage() {
  const [params, setSearchParams] = useSearchParams();
  const [openId, setOpenId] = useState(params.get("batch") ?? "");
  const openedParamRef = useRef<string | null>(null);
  const batchRequestRef = useRef(0);
  const batchTargetRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const batchParam = params.get("batch");
  const batchParamRef = useRef(batchParam);
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      batchRequestRef.current += 1;
      batchTargetRef.current = null;
      openedParamRef.current = null;
    };
  }, []);
  const [menu, setMenu] = useState({ menu_code: "", name: "" });
  const [menuFeedback, setMenuFeedback] = useState<Feedback>(null);
  const [recipe, setRecipe] = useState({ recipe_code: "", version_no: "1", menu_id: "",
    item_code: "", quantity: "", mass_basis: "" });
  const [recipeFeedback, setRecipeFeedback] = useState<Feedback>(null);
  const [batch, setBatch] = useState({ recipe_id: "", operation_date: "2026-11-05", planned_output: "", mass_basis: "raw" });
  const [batchFeedback, setBatchFeedback] = useState<Feedback>(null);
  const [activeBatch, setActiveBatch] = useState<BatchDetail | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [io, setIo] = useState({ io_kind: "", quantity: "", mass_basis: "raw", source_lot_id: params.get("lot") ?? "", occurred_at: "" });
  const [ioFeedback, setIoFeedback] = useState<Feedback>(null);
  const [link, setLink] = useState({ source_type: "waste_event", source_id: "", target_type: "batch",
    target_id: "", relation_code: "input_to", quantity: "", mass_basis: "raw", occurred_at: "" });
  const [linkFeedback, setLinkFeedback] = useState<Feedback>(null);
  const [lineage, setLineage] = useState<LineageView | null>(null);
  const [lineageLoading, setLineageLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const canWrite = permits("menu.create") && permits("batch.create") && permits("link.create");

  async function submitMenu(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !menu.menu_code.trim() || !menu.name.trim()) {
      setMenuFeedback({ kind: "error", message: "Kode dan nama menu wajib diisi." });
      return;
    }
    setBusy(true); setMenuFeedback(null);
    const result = await createBackendMenu(menu);
    setBusy(false);
    setMenuFeedback(result.kind === "saved"
      ? { kind: "success", message: `Menu tersimpan: ${result.value.menu_code}.` }
      : { kind: result.kind === "rejected" ? "error" : "unknown", message: result.message });
    if (result.kind === "saved") {setRecipe(v=>({...v,menu_id:result.value.menu_id}));setMenu({ menu_code: "", name: "" });}
  }

  async function submitRecipe(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!recipe.recipe_code.trim() || !recipe.item_code.trim() || !DECIMAL.test(recipe.quantity)) {
      setRecipeFeedback({ kind: "error", message: "Kode resep, item, dan jumlah desimal wajib diisi." });
      return;
    }
    setBusy(true); setRecipeFeedback(null);
    const result = await createBackendRecipe({
      recipe_code: recipe.recipe_code, version_no: recipe.version_no || "1", menu_id: recipe.menu_id,
      lines: [{ item_code: recipe.item_code, quantity: recipe.quantity, mass_basis: recipe.mass_basis }],
    });
    setBusy(false);
    if(result.kind === "saved")setBatch(v=>({...v,recipe_id:result.value.recipe_id}));
    setRecipeFeedback(result.kind === "saved"
      ? { kind: "success", message: `Resep v${result.value.version_no} tersimpan (${result.value.lines.length} baris). Versi lama tidak pernah diubah; perubahan resep = versi baru.` }
      : { kind: result.kind === "rejected" ? "error" : "unknown", message: result.message });
  }

  async function openBatch(batchId: string) {
    const request = ++batchRequestRef.current;
    const routeAtDispatch = batchParamRef.current;
    batchTargetRef.current = batchId;
    const current = () => mountedRef.current && request === batchRequestRef.current &&
      batchTargetRef.current === batchId &&
      (batchParamRef.current === routeAtDispatch || batchParamRef.current === batchId);
    setBatchLoading(true); setActiveBatch(null); setBatchFeedback(null); setIoFeedback(null);
    return readBatch(batchId).then(value => {
      if (!current()) return;
      if (value.batch_id !== batchId) throw new Error("Respons batch tidak sesuai target; pencatatan IO ditutup.");
      setActiveBatch(value); setOpenId(batchId);
      if (openedParamRef.current !== batchId) {
        openedParamRef.current = batchId;
        setSearchParams(previous => { const next = new URLSearchParams(previous); next.set("batch", batchId); return next; }, { replace: true });
      }
    })
      .catch(reason => { if (current()) setBatchFeedback({ kind: "error", message: reason instanceof Error ? reason.message : "Batch tidak dapat dibaca." }); })
      .finally(() => { if (current()) setBatchLoading(false); });
  }

  function submitOpenBatch(event: React.FormEvent) {
    event.preventDefault();
    if (batchLoading) return;
    if (!isUUID(openId.trim())) {
      setBatchFeedback({ kind: "error", message: "UUID batch tidak valid." });
      return;
    }
    setBatchFeedback(null);
    void openBatch(openId.trim());
  }

  useLayoutEffect(() => {
    batchParamRef.current = batchParam;
    setOpenId(batchParam ?? "");
    if (!batchParam || !isUUID(batchParam)) {
      batchRequestRef.current += 1; batchTargetRef.current = null; openedParamRef.current = null;
      setActiveBatch(null); setBatchLoading(false); setBatchFeedback(null); setIoFeedback(null);
      return;
    }
    if (openedParamRef.current === batchParam) return;
    openedParamRef.current = batchParam;
    void openBatch(batchParam);
  }, [batchParam]);

  async function submitBatch(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !batch.recipe_id) {
      setBatchFeedback({ kind: "error", message: "UUID resep wajib diisi." });
      return;
    }
    const request = batchRequestRef.current;
    const routeAtDispatch = batchParamRef.current;
    setBusy(true); setBatchFeedback(null);
    const result = await createBackendBatch(batch);
    if (!mountedRef.current) return;
    setBusy(false);
    if (request !== batchRequestRef.current || batchParamRef.current !== routeAtDispatch) return;
    if (result.kind === "saved") {
      setBatchFeedback({ kind: "success", message: "Batch tersimpan. Catat input/output di bawah; yield hanya dihitung pada pasangan basis yang sepadan." });
      openBatch(result.value.batch_id);
    } else setBatchFeedback({ kind: result.kind === "rejected" ? "error" : "unknown", message: result.message });
  }

  async function submitIO(event: React.FormEvent) {
    event.preventDefault();
    if (busy || batchLoading || !activeBatch || batchTargetRef.current !== activeBatch.batch_id ||
        batchParamRef.current !== activeBatch.batch_id) return;
    if (!io.io_kind || !DECIMAL.test(io.quantity) || !io.occurred_at) {
      setIoFeedback({ kind: "error", message: "Jenis io, jumlah desimal, dan waktu wajib diisi." });
      return;
    }
    if (io.source_lot_id && !isUUID(io.source_lot_id)) {
      setIoFeedback({ kind: "error", message: "UUID lot sumber tidak valid; isi UUID lot atau kosongkan." });
      return;
    }
    const target = activeBatch.batch_id;
    const request = batchRequestRef.current;
    const routeAtDispatch = batchParamRef.current;
    setBusy(true); setIoFeedback(null);
    const result = await createBackendBatchIO(target, io);
    if (!mountedRef.current) return;
    setBusy(false);
    if (request !== batchRequestRef.current || batchTargetRef.current !== target ||
        batchParamRef.current !== routeAtDispatch) return;
    if (result.kind === "saved") {
      setIo({ io_kind: "", quantity: "", mass_basis: "raw", source_lot_id: "", occurred_at: "" });
      setIoFeedback({ kind: "success", message: "IO tersimpan. Rework tidak masuk numerator yield." });
      void openBatch(target);
    } else setIoFeedback({ kind: result.kind === "rejected" ? "error" : "unknown", message: result.message });
  }

  async function submitLink(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!link.source_id || !link.target_id || !link.occurred_at) {
      setLinkFeedback({ kind: "error", message: "UUID sumber, target, dan waktu wajib diisi." });
      return;
    }
    setBusy(true); setLinkFeedback(null);
    const result = await createBackendLink(link);
    setBusy(false);
    if (result.kind === "saved") {
      setLinkFeedback({ kind: "success", message: "Link tersimpan. Link bukan event limbah baru." });
      if (link.source_id === link.target_id) return;
      readLineage(link.target_type, link.target_id).then(setLineage)
        .catch(() => setLineage(null));
    } else setLinkFeedback({ kind: result.kind === "rejected" ? "error" : "unknown", message: result.message });
  }

  function openLineage(objectType: string, objectId: string) {
    if (!objectId) { setLinkFeedback({ kind: "error", message: "UUID objek wajib diisi." }); return; }
    setLineageLoading(true); setLineage(null);
    readLineage(objectType, objectId).then(setLineage)
      .catch(reason => setLinkFeedback({ kind: "error", message: reason instanceof Error ? reason.message : "Lineage tidak dapat dibaca." }))
      .finally(() => setLineageLoading(false));
  }

  const visibleBatch = activeBatch && batchTargetRef.current === activeBatch.batch_id &&
    batchParam === activeBatch.batch_id ? activeBatch : null;

  return <div className="space-y-6">
    <header className="space-y-2">
      <h1 className="text-2xl font-bold">Produksi &amp; lineage — kandidat FR-102/FR-104</h1>
      <p>Resep berversi (immutable), batch dengan input/output berbasis massa, yield hanya pada pasangan sepadan, dan flow link yang tidak menciptakan event limbah baru.</p>
    </header>

    {canWrite && <section className={card}>
      <h2 className="text-lg font-semibold">Menu &amp; resep</h2>
      <form onSubmit={submitMenu} className="grid gap-3 sm:grid-cols-3" noValidate>
        <label className="block">Kode menu<input className={field} value={menu.menu_code} onChange={e => setMenu(v => ({ ...v, menu_code: e.target.value }))} placeholder="MENU-SYN-1" /></label>
        <label className="block">Nama<input className={field} value={menu.name} onChange={e => setMenu(v => ({ ...v, name: e.target.value }))} /></label>
        <button type="submit" disabled={busy} className="self-end rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">Simpan menu</button>
      </form>
      <FeedbackLine feedback={menuFeedback} />
      <form onSubmit={submitRecipe} className="grid gap-3 sm:grid-cols-6" noValidate>
        <label className="block">Kode resep<input className={field} value={recipe.recipe_code} onChange={e => setRecipe(v => ({ ...v, recipe_code: e.target.value }))} /></label>
        <label className="block">Versi<input className={field} value={recipe.version_no} onChange={e => setRecipe(v => ({ ...v, version_no: e.target.value }))} inputMode="numeric" /></label>
        <label className="block">Menu ID (opsional)<input className={field} value={recipe.menu_id} onChange={e => setRecipe(v => ({ ...v, menu_id: e.target.value }))} /></label>
        <label className="block">Item baris<input className={field} value={recipe.item_code} onChange={e => setRecipe(v => ({ ...v, item_code: e.target.value }))} /></label>
        <label className="block">Jumlah (kg)<input className={field} inputMode="decimal" value={recipe.quantity} onChange={e => setRecipe(v => ({ ...v, quantity: e.target.value }))} /></label>
        <label className="block">Basis baris
          <select className={field} value={recipe.mass_basis} onChange={e => setRecipe(v => ({ ...v, mass_basis: e.target.value }))}>
            {BACKEND_MASS_BASES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50 sm:col-span-6">Simpan resep (versi baru)</button>
      </form>
      <FeedbackLine feedback={recipeFeedback} />
    </section>}

    <section className={card}>
      <h2 className="text-lg font-semibold">Batch produksi</h2>
      <form onSubmit={submitOpenBatch} className="grid gap-2 sm:grid-cols-4" noValidate>
        <label className="block">UUID batch tersimpan<input className={field} value={openId} onChange={e => setOpenId(e.target.value)} placeholder="Tempel UUID batch" /></label>
        <button type="submit" disabled={batchLoading} className="self-end rounded border px-4 py-2 disabled:opacity-50">Buka batch tersimpan</button>
      </form>
      {canWrite && <form onSubmit={submitBatch} className="grid gap-3 sm:grid-cols-4" noValidate>
        <label className="block">UUID resep<input className={field} value={batch.recipe_id} onChange={e => setBatch(v => ({ ...v, recipe_id: e.target.value }))} /></label>
        <label className="block">Tanggal operasi<input className={field} type="date" value={batch.operation_date} onChange={e => setBatch(v => ({ ...v, operation_date: e.target.value }))} /></label>
        <label className="block">Planned output (kg, opsional)<input className={field} inputMode="decimal" value={batch.planned_output} onChange={e => setBatch(v => ({ ...v, planned_output: e.target.value }))} /></label>
        <label className="block">Basis output
          <select className={field} value={batch.mass_basis} onChange={e => setBatch(v => ({ ...v, mass_basis: e.target.value }))}>
            {BACKEND_MASS_BASES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50 sm:col-span-4">Buat batch</button>
      </form>}
      <FeedbackLine feedback={batchFeedback} />
      {visibleBatch && <div className="rounded border border-slate-300 bg-slate-50 p-3 text-sm space-y-2">
        <p>Batch <span className="font-mono">{visibleBatch.batch_id}</span> · resep {visibleBatch.recipe_code} v{visibleBatch.recipe_version_no} · {visibleBatch.operation_date}</p>
        <ul className="list-disc pl-5">{visibleBatch.io.map(entry => <li key={entry.io_id}>
          {entry.io_kind} · {entry.quantity} {entry.original_unit} ({entry.mass_basis}){entry.source_lot_id ? ` · lot ${entry.source_lot_id.slice(0, 8)}…` : ""}
        </li>)}</ul>
        <p>Yield: <strong>{visibleBatch.yield_view.status}</strong>
          {visibleBatch.yield_view.value ? ` = ${visibleBatch.yield_view.value} (input ${visibleBatch.yield_view.input_total} → output ${visibleBatch.yield_view.primary_output_total}; rework ${visibleBatch.yield_view.rework_total ?? "N/A"} tidak dihitung dua kali)` : ` — ${visibleBatch.yield_view.reason}`}</p>
        {canWrite && <form onSubmit={submitIO} className="grid gap-2 sm:grid-cols-6" noValidate>
          <select className={field} value={io.io_kind} onChange={e => setIo(v => ({ ...v, io_kind: e.target.value }))} aria-label="Jenis io">
            <option value="">— io —</option><option value="input">input</option><option value="output_primary">output_primary</option><option value="output_rework">output_rework</option>
          </select>
          <input className={field} inputMode="decimal" placeholder="Jumlah (kg)" value={io.quantity} onChange={e => setIo(v => ({ ...v, quantity: e.target.value }))} aria-label="Jumlah kg" />
          <select className={field} value={io.mass_basis} onChange={e => setIo(v => ({ ...v, mass_basis: e.target.value }))} aria-label="Basis io">
            {BACKEND_MASS_BASES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <input className={field} placeholder="UUID lot sumber (opsional)" value={io.source_lot_id} onChange={e => setIo(v => ({ ...v, source_lot_id: e.target.value }))} aria-label="Lot sumber" />
          <input className={field} placeholder="2026-11-05T08:00:00+08:00" value={io.occurred_at} onChange={e => setIo(v => ({ ...v, occurred_at: e.target.value }))} aria-label="Waktu io" />
          <button type="submit" disabled={busy} className="rounded bg-sky-700 px-3 py-2 text-white disabled:opacity-50">Catat IO</button>
        </form>}
        <FeedbackLine feedback={ioFeedback} />
      </div>}
      {batchLoading && <LoadingState label="Memuat batch…" />}
    </section>

    <section className={card}>
      <h2 className="text-lg font-semibold">Material lineage (FR-104)</h2>
      <p className="text-sm">Link menghubungkan objek ber-tipe; tidak boleh menunjuk diri sendiri atau membentuk siklus, dan tidak menaikkan jumlah event.</p>
      {canWrite && <form onSubmit={submitLink} className="grid gap-2 sm:grid-cols-8" noValidate>
        <select className={field} value={link.source_type} onChange={e => setLink(v => ({ ...v, source_type: e.target.value }))} aria-label="Tipe sumber">
          {["waste_event", "lot", "batch", "delivery", "meal_service"].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className={field} placeholder="UUID sumber" value={link.source_id} onChange={e => setLink(v => ({ ...v, source_id: e.target.value }))} aria-label="UUID sumber" />
        <select className={field} value={link.relation_code} onChange={e => setLink(v => ({ ...v, relation_code: e.target.value }))} aria-label="Relasi">
          {["derived_from", "input_to", "transfer_of", "disposition_of", "rework_of", "leftover_of"].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={field} value={link.target_type} onChange={e => setLink(v => ({ ...v, target_type: e.target.value }))} aria-label="Tipe target">
          {["waste_event", "lot", "batch", "delivery", "meal_service"].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className={field} placeholder="UUID target" value={link.target_id} onChange={e => setLink(v => ({ ...v, target_id: e.target.value }))} aria-label="UUID target" />
        <input className={field} inputMode="decimal" placeholder="Jumlah (opsional)" value={link.quantity} onChange={e => setLink(v => ({ ...v, quantity: e.target.value }))} aria-label="Jumlah link" />
        <input className={field} placeholder="Waktu ISO" value={link.occurred_at} onChange={e => setLink(v => ({ ...v, occurred_at: e.target.value }))} aria-label="Waktu link" />
        <button type="submit" disabled={busy} className="rounded bg-sky-700 px-3 py-2 text-white disabled:opacity-50">Buat link</button>
      </form>}
      <FeedbackLine feedback={linkFeedback} />
      <form onSubmit={e => { e.preventDefault(); openLineage(link.target_type, link.target_id); }}
        className="flex flex-wrap items-end gap-2">
        <button type="submit" className="rounded border px-4 py-2">Baca lineage target (GET)</button>
      </form>
      {lineageLoading && <LoadingState label="Memuat lineage…" />}
      {lineage && <div className="rounded border border-slate-300 bg-slate-50 p-3 text-sm space-y-1">
        <p>{lineage.note}</p>
        <p>Distinct source events: <strong>{lineage.distinct_source_event_count}</strong> — dua transfer dari event yang sama tetap satu event.</p>
        {lineage.links.length === 0 ? <EmptyState title="Belum ada link" /> : <ul className="list-disc pl-5">
          {lineage.links.map(item => <li key={item.link_id}>
            {item.source_type} → {item.relation_code} → {item.target_type}{item.quantity ? ` · ${item.quantity} ${item.original_unit} (${item.mass_basis})` : ""}
          </li>)}
        </ul>}
      </div>}
    </section>
  </div>;
}
