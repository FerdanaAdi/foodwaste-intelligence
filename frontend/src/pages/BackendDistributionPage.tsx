import { useState } from "react";
import { createBackendDelivery, createBackendService, recordBackendReceiving,
  type Delivery, type Service } from "@/backend/p1";
import { BACKEND_MASS_BASES, isUUID } from "@/backend/contract";
import { authSnapshot, permits } from "@/backend/auth";

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

function ReconciliationBadge({ status }: { status: string }) {
  if (status === "needs_review")
    return <span className="rounded bg-amber-100 px-2 py-1 text-amber-900">needs_review — perlu review, bukan waste otomatis</span>;
  if (status === "match")
    return <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-900">match</span>;
  return <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">not_received</span>;
}

export default function BackendDistributionPage() {
  const [delivery, setDelivery] = useState({ to_site_id: "", dispatch_quantity: "", mass_basis: "as_served",
    dispatched_at: "" });
  const [deliveryFeedback, setDeliveryFeedback] = useState<Feedback>(null);
  const [lastDelivery, setLastDelivery] = useState<Delivery | null>(null);
  const [receiving, setReceiving] = useState({ delivery_id: "", received_quantity: "", received_at: "" });
  const [receivingFeedback, setReceivingFeedback] = useState<Feedback>(null);
  const [service, setService] = useState({ delivery_id: "", served_count: "", served_mass: "",
    mass_basis: "as_served", sampling_frame: "", sample_size: "", sampling_method: "" });
  const [serviceFeedback, setServiceFeedback] = useState<Feedback>(null);
  const [lastService, setLastService] = useState<Service | null>(null);
  const [busy, setBusy] = useState(false);
  const canWrite = permits("delivery.create") && permits("service.create");

  async function submitDelivery(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!isUUID(delivery.to_site_id) || !DECIMAL.test(delivery.dispatch_quantity) || !delivery.dispatched_at) {
      setDeliveryFeedback({ kind: "error", message: "UUID site tujuan, jumlah desimal, dan waktu wajib diisi." });
      return;
    }
    setBusy(true); setDeliveryFeedback(null);
    const result = await createBackendDelivery(delivery);
    setBusy(false);
    if (result.kind === "saved") {
      setLastDelivery(result.value);
      setDelivery({ to_site_id: "", dispatch_quantity: "", mass_basis: "as_served", dispatched_at: "" });
      setDeliveryFeedback({ kind: "success", message: "Delivery tersimpan. Dispatch ≠ received dicatat terpisah." });
    } else setDeliveryFeedback({ kind: result.kind === "rejected" ? "error" : "unknown", message: result.message });
  }

  async function submitReceiving(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!isUUID(receiving.delivery_id) || !DECIMAL.test(receiving.received_quantity) || !receiving.received_at) {
      setReceivingFeedback({ kind: "error", message: "UUID delivery, jumlah desimal, dan waktu wajib diisi." });
      return;
    }
    setBusy(true); setReceivingFeedback(null);
    const result = await recordBackendReceiving(receiving.delivery_id, {
      received_quantity: receiving.received_quantity, received_at: receiving.received_at });
    setBusy(false);
    if (result.kind === "saved") {
      setLastDelivery(result.value);
      setReceivingFeedback({ kind: "success", message:
        `Receiving dicatat oleh site penerima (${authSnapshot().site.slice(0, 8)}…). Status: ${result.value.reconciliation_status}.` });
    } else setReceivingFeedback({ kind: result.kind === "rejected" ? "error" : "unknown", message: result.message });
  }

  async function submitService(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (service.served_mass && !DECIMAL.test(service.served_mass)) {
      setServiceFeedback({ kind: "error", message: "Served mass harus desimal atau kosong." });
      return;
    }
    setBusy(true); setServiceFeedback(null);
    const result = await createBackendService(service);
    setBusy(false);
    if (result.kind === "saved") {
      setLastService(result.value);
      setServiceFeedback({ kind: "success", message: "Meal service tersimpan (agregat; tanpa identitas siswa)." });
    } else setServiceFeedback({ kind: result.kind === "rejected" ? "error" : "unknown", message: result.message });
  }

  return <div className="space-y-6">
    <header className="space-y-2">
      <h1 className="text-2xl font-bold">Distribusi &amp; layanan — kandidat FR-103</h1>
      <p>Dispatch, receiving, served dan sisa adalah konsep terpisah. Selisih dispatch vs received adalah status review, bukan event limbah otomatis; tidak ada identitas siswa; sampel tanpa frame tidak menghasilkan estimasi populasi.</p>
    </header>

    {canWrite && <section className={card}>
      <h2 className="text-lg font-semibold">Delivery (dicatat oleh site asal)</h2>
      <form onSubmit={submitDelivery} className="grid gap-3 sm:grid-cols-4" noValidate>
        <label className="block">UUID site tujuan<input className={field} value={delivery.to_site_id} onChange={e => setDelivery(v => ({ ...v, to_site_id: e.target.value }))} /></label>
        <label className="block">Dispatch (kg)<input className={field} inputMode="decimal" value={delivery.dispatch_quantity} onChange={e => setDelivery(v => ({ ...v, dispatch_quantity: e.target.value }))} /></label>
        <label className="block">Basis
          <select className={field} value={delivery.mass_basis} onChange={e => setDelivery(v => ({ ...v, mass_basis: e.target.value }))}>
            {BACKEND_MASS_BASES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label className="block">Dispatched at<input className={field} value={delivery.dispatched_at} onChange={e => setDelivery(v => ({ ...v, dispatched_at: e.target.value }))} placeholder="2026-11-05T06:00:00+08:00" /></label>
        <button type="submit" disabled={busy} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50 sm:col-span-4">Catat delivery</button>
      </form>
      <FeedbackLine feedback={deliveryFeedback} />
      {lastDelivery && <div className="rounded border border-slate-300 bg-slate-50 p-3 text-sm">
        <p>Delivery <span className="font-mono">{lastDelivery.delivery_id}</span> · dispatch {lastDelivery.dispatch_quantity} {lastDelivery.original_unit} ({lastDelivery.mass_basis})</p>
        <p><ReconciliationBadge status={lastDelivery.reconciliation_status} /></p>
      </div>}
    </section>}

    {canWrite && <section className={card}>
      <h2 className="text-lg font-semibold">Receiving (dicatat oleh site penerima)</h2>
      <p className="text-sm">Login harus memakai membership site tujuan; site asal tidak dapat mencatat receiving (server menolak).</p>
      <form onSubmit={submitReceiving} className="grid gap-3 sm:grid-cols-4" noValidate>
        <label className="block">UUID delivery<input className={field} value={receiving.delivery_id} onChange={e => setReceiving(v => ({ ...v, delivery_id: e.target.value }))} /></label>
        <label className="block">Received (kg)<input className={field} inputMode="decimal" value={receiving.received_quantity} onChange={e => setReceiving(v => ({ ...v, received_quantity: e.target.value }))} /></label>
        <label className="block">Received at<input className={field} value={receiving.received_at} onChange={e => setReceiving(v => ({ ...v, received_at: e.target.value }))} placeholder="2026-11-05T09:00:00+08:00" /></label>
        <button type="submit" disabled={busy} className="self-end rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">Catat receiving</button>
      </form>
      <FeedbackLine feedback={receivingFeedback} />
    </section>}

    {canWrite && <section className={card}>
      <h2 className="text-lg font-semibold">Meal service (agregat, anonim)</h2>
      <form onSubmit={submitService} className="grid gap-3 sm:grid-cols-7" noValidate>
        <label className="block">UUID delivery (opsional)<input className={field} value={service.delivery_id} onChange={e => setService(v => ({ ...v, delivery_id: e.target.value }))} /></label>
        <label className="block">Served count<input className={field} inputMode="numeric" value={service.served_count} onChange={e => setService(v => ({ ...v, served_count: e.target.value }))} /></label>
        <label className="block">Served mass (kg, opsional)<input className={field} inputMode="decimal" value={service.served_mass} onChange={e => setService(v => ({ ...v, served_mass: e.target.value }))} /></label>
        <label className="block">Basis massa
          <select className={field} value={service.mass_basis} onChange={e => setService(v => ({ ...v, mass_basis: e.target.value }))}>
            {BACKEND_MASS_BASES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label className="block">Sampling frame (opsional)<input className={field} value={service.sampling_frame} onChange={e => setService(v => ({ ...v, sampling_frame: e.target.value }))} /></label>
        <label className="block">Sample size (opsional)<input className={field} inputMode="numeric" value={service.sample_size} onChange={e => setService(v => ({ ...v, sample_size: e.target.value }))} /></label>
        <label className="block">Metode sampling (opsional)<input className={field} value={service.sampling_method} onChange={e => setService(v => ({ ...v, sampling_method: e.target.value }))} /></label>
        <button type="submit" disabled={busy} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50 sm:col-span-7">Catat meal service</button>
      </form>
      <FeedbackLine feedback={serviceFeedback} />
      {lastService && <div className="rounded border border-slate-300 bg-slate-50 p-3 text-sm">
        <p>Service <span className="font-mono">{lastService.service_id}</span> · served {lastService.served_count ?? "N/A"}
          {lastService.served_mass ? ` · ${lastService.served_mass} ${lastService.original_unit} (${lastService.mass_basis})` : ""}</p>
        <p>Sampling: <strong>{lastService.sampling_coverage_status}</strong></p>
        <p className="text-xs text-slate-600">{lastService.estimate_note}</p>
      </div>}
    </section>}
  </div>;
}
