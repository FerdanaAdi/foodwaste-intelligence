import { useEffect, useState } from "react";
import {
  acknowledgeBackendRecommendation, createBackendCostReference, evaluateRecommendations,
  readAlertRules, readCostValuation, readRecommendations,
  type AlertRule, type EvaluateView, type ValuationBlocked, type Recommendation, type RecommendationFilters,
} from "@/backend/p1";
import { isUUID } from "@/backend/contract";
import { authSnapshot, permits } from "@/backend/auth";
import { Link } from "react-router";
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

export default function BackendInsightsPage() {
  const [cost, setCost] = useState({ scope_type: "batch", scope_ref: "", currency: "IDR", amount: "",
    unit_basis: "kg_raw", price_source: "", price_date: "", method_version: "managerial-est-v0" });
  const [costFeedback, setCostFeedback] = useState<Feedback>(null);
  const [savedCost, setSavedCost] = useState<{ cost_reference_id: string; amount: string | null;
    price_availability: string; note: string } | null>(null);
  const [valuation, setValuation] = useState<ValuationBlocked | null>(null);
  const [rules, setRules] = useState<AlertRule[] | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluateView | null>(null);
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [ack, setAck] = useState({ recommendation_id: "", state: "acknowledged", reason: "" });
  const [ackFeedback, setAckFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const canAck = permits("alert.ack");
  const site = authSnapshot().site;
  const [filters, setFilters] = useState<RecommendationFilters>({});
  const [applied, setApplied] = useState<RecommendationFilters>({});
  const [alerts, setAlerts] = useState<Recommendation[]>([]);
  const [readError, setReadError] = useState('');
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingAlerts(true);
    setAlerts([]);
    setReadError('');
    void readRecommendations(site, controller.signal, applied).then(rows => {
      if (!controller.signal.aborted) setAlerts(rows);
    }).catch(() => {
      if (!controller.signal.aborted) setReadError('Riwayat alert tidak dapat dibaca.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingAlerts(false);
    });
    return () => controller.abort();
  }, [site, applied, revision]);

  useEffect(() => {
    let active = true;
    readAlertRules().then(value => { if (active) setRules(value); })
      .catch(reason => { if (active) setRulesError(reason instanceof Error ? reason.message : "Aturan tidak dapat dibaca."); });
    return () => { active = false; };
  }, []);

  async function submitCost(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!isUUID(cost.scope_ref) || !cost.price_source.trim()) {
      setCostFeedback({ kind: "error", message: "UUID scope dan sumber harga wajib diisi." });
      return;
    }
    if (cost.amount && !DECIMAL.test(cost.amount)) {
      setCostFeedback({ kind: "error", message: "Harga harus desimal atau dikosongkan (tidak diketahui)." });
      return;
    }
    setBusy(true); setCostFeedback(null); setValuation(null);
    const result = await createBackendCostReference(cost);
    setBusy(false);
    if (result.kind === "saved") {
      setSavedCost(result.value);
      setCostFeedback({ kind: "success", message:
        `Referensi biaya tersimpan. Ketersediaan harga: ${result.value.price_availability}.` });
      readCostValuation(result.value.cost_reference_id).then(setValuation)
        .catch(() => setValuation(null));
    } else setCostFeedback({ kind: result.kind === "rejected" ? "error" : "unknown", message: result.message });
  }

  async function runEvaluation() {
    setEvaluationLoading(true); setEvaluation(null);
    const result = await evaluateRecommendations();
    if (result.kind === "saved") { setEvaluation(result.value); setRevision(value => value + 1); }
    else setAckFeedback({ kind: result.kind === "rejected" ? "error" : "unknown", message: result.message });
    setEvaluationLoading(false);
  }

  async function submitAck(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!isUUID(ack.recommendation_id) || !ack.reason.trim()) {
      setAckFeedback({ kind: "error", message: "UUID rekomendasi dan alasan wajib diisi." });
      return;
    }
    setBusy(true); setAckFeedback(null);
    const result = await acknowledgeBackendRecommendation(ack.recommendation_id,
      { state: ack.state as "acknowledged" | "dismissed", reason: ack.reason });
    setBusy(false);
    if (result.kind === "saved") {
      setAckFeedback({ kind: "success", message: `Rekomendasi ${result.value.state} dengan alasan tercatat. Tidak ada perubahan otomatis pada operasi.` });
      setRevision(value => value + 1);
    } else setAckFeedback({ kind: result.kind === "rejected" ? "error" : "unknown", message: result.message });
  }

  return <div className="space-y-6">
    <header className="space-y-2">
      <h1 className="text-2xl font-bold">Insight terkontrol — kandidat FR-203/FR-204</h1>
      <p>Referensi biaya manajerial (bukan akuntansi; harga hilang = N/A, bukan Rp0) dan rekomendasi struktural non-otonom: penjelasan + provenance, tanpa perubahan otomatis apa pun.</p>
    </header>

    <section className={card}>
      <h2 className="text-lg font-semibold">Cakupan catatan pengukuran</h2>
      <p>Ringkasan mutu membedakan jumlah kejadian, jumlah pengukuran, kejadian tanpa pengukuran, missing, dan nol terukur. Cakupan jadwal pengukuran belum dapat dihitung tanpa daftar kesempatan pengukuran yang disetujui.</p>
      <Link className="underline" to="/backend-demo/data-quality">Buka hitungan mutu data per periode kegiatan dapur</Link>
    </section>
    <section className={card}>
      <h2 className="text-lg font-semibold">Referensi biaya (FR-203)</h2>
      <form onSubmit={submitCost} className="grid gap-3 sm:grid-cols-8" noValidate>
        <label className="block">Scope
          <select className={field} value={cost.scope_type} onChange={e => setCost(v => ({ ...v, scope_type: e.target.value }))}>
            {["item", "lot", "batch"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="block">UUID scope<input className={field} value={cost.scope_ref} onChange={e => setCost(v => ({ ...v, scope_ref: e.target.value }))} /></label>
        <label className="block">Mata uang<input className={field} value={cost.currency} onChange={e => setCost(v => ({ ...v, currency: e.target.value.toUpperCase() }))} maxLength={3} /></label>
        <label className="block">Harga (kosong = tidak diketahui)<input className={field} inputMode="decimal" value={cost.amount} onChange={e => setCost(v => ({ ...v, amount: e.target.value }))} /></label>
        <label className="block">Unit basis<input className={field} value={cost.unit_basis} onChange={e => setCost(v => ({ ...v, unit_basis: e.target.value }))} /></label>
        <label className="block">Sumber harga<input className={field} value={cost.price_source} onChange={e => setCost(v => ({ ...v, price_source: e.target.value }))} /></label>
        <label className="block">Tanggal harga<input className={field} type="date" value={cost.price_date} onChange={e => setCost(v => ({ ...v, price_date: e.target.value }))} /></label>
        <label className="block">Metode/versi<input className={field} value={cost.method_version} onChange={e => setCost(v => ({ ...v, method_version: e.target.value }))} /></label>
        <button type="submit" disabled={busy} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50 sm:col-span-8">Simpan referensi</button>
      </form>
      <FeedbackLine feedback={costFeedback} />
      {savedCost && <div className="rounded border border-slate-300 bg-slate-50 p-3 text-sm space-y-1">
        <p>Referensi <span className="font-mono">{savedCost.cost_reference_id}</span> · harga: <strong>{savedCost.amount ?? "N/A (tidak diketahui — tidak pernah dianggap Rp0)"}</strong> · {savedCost.price_availability}</p>
        <p className="text-xs text-slate-600">{savedCost.note}</p>
        {valuation && <p role="note" className="rounded border border-amber-300 bg-amber-50 p-2">
          Valuasi: <strong>{valuation.status}</strong> — {valuation.reason}</p>}
      </div>}
    </section>

    <section className={card}>
      <h2 className="text-lg font-semibold">Rekomendasi struktural (FR-204)</h2>
      <p className="text-sm">Aturan deterministik tanpa threshold numerik: hanya kondisi struktural yang sudah terekam (selisih delivery, coverage, alokasi, frame sampling). Input kurang = status insufficient-data, bukan klaim.</p>
      <p className="text-sm text-slate-600">Konfigurasi aturan bersifat global dan <strong>read-only</strong> pada kandidat ini: belum ada kontrak izin administrasi global (Gate B OPEN), sehingga mutasi ditolak backend untuk semua pengguna site.</p>
      {rulesError && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm">{rulesError}</p>}
      {rules === null && !rulesError && <LoadingState label="Memuat aturan…" />}
      {rules && rules.length === 0 && <EmptyState title="Tidak ada aturan" />}
      {rules && rules.length > 0 && <ul className="space-y-2 text-sm">
        {rules.map(rule => <li key={rule.rule_code} className="rounded border border-slate-200 p-2">
          <span className="font-mono">{rule.rule_code}</span> — {rule.description}
          {rule.disabled && <span className="ml-2 rounded bg-slate-100 px-2 py-1 text-xs">dinonaktifkan (maintenance internal)</span>}
        </li>)}
      </ul>}
      {canAck && <button type="button" onClick={() => { void runEvaluation(); }} disabled={evaluationLoading || busy}
        className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">
        Evaluasi rekomendasi (POST, idempoten)
      </button>}
      {evaluationLoading && <LoadingState label="Mengevaluasi…" />}
      <form className="grid gap-3 sm:grid-cols-4" onSubmit={event => {
        event.preventDefault();
        setApplied({ ...filters });
      }}>
        <label>Dari tanggal pencatatan (UTC)<input className={field} type="date" value={filters.recorded_from ?? ''} onChange={event => setFilters({ ...filters, recorded_from: event.target.value })} /></label>
        <label>Sampai tanggal pencatatan (UTC)<input className={field} type="date" min={filters.recorded_from} value={filters.recorded_to ?? ''} onChange={event => setFilters({ ...filters, recorded_to: event.target.value })} /></label>
        <label>Status alert<select className={field} value={filters.state ?? ''} onChange={event => setFilters({ ...filters, state: event.target.value })}>
          <option value="">Semua status</option><option value="open">Terbuka</option><option value="acknowledged">Ditinjau</option><option value="dismissed">Ditutup</option>
        </select></label>
        <label>Versi aturan sumber<input className={field} maxLength={40} value={filters.rule_version ?? ''} onChange={event => setFilters({ ...filters, rule_version: event.target.value })} /></label>
        <button type="submit">Terapkan filter alert</button>
      </form>
      <p className="text-sm">Daftar menampilkan hingga 500 alert terbaru dari lokasi aktif. Periode ini memakai tanggal pencatatan alert dalam UTC.</p>
      {readError && <p role="alert">{readError}</p>}
      {loadingAlerts && <LoadingState label="Memuat riwayat alert…" />}
      {!loadingAlerts && !readError && alerts.length === 0 && <EmptyState title="Belum ada alert tersimpan untuk filter ini" />}
      <ul className="space-y-2 text-sm">
        {alerts.map(alert => <li key={alert.recommendation_id} className="rounded border border-slate-200 p-2">
          <span>{alert.detected_issue}</span> · <strong>{alert.state}</strong> · Cakupan bukti: {alert.coverage}
          <span className="block">{alert.recommended_action}</span>
          <span className="block text-xs">Sumber: {alert.target_type} {alert.target_ref} · {alert.rule_code} {alert.rule_version} · {alert.recorded_at}</span>
          {alert.ack_reason && <span className="block text-xs">Alasan: {alert.ack_reason}</span>}
          {canAck && alert.state === 'open' && <button type="button" onClick={() => setAck(value => ({ ...value, recommendation_id: alert.recommendation_id }))}>Pilih alert ini</button>}
        </li>)}
      </ul>
      {evaluation && <div className="space-y-2 text-sm">
        <p>{evaluation.note} · {evaluation.rule_version}</p>
        {evaluation.insufficient.map(item => <p key={`${item.rule_code}:${item.target_ref}`}>
          <strong>BLOCKED ({item.state})</strong> · {item.reason} · Sumber: {item.target_type} {item.target_ref} · {item.rule_code}
        </p>)}
      </div>}
      {canAck && <form onSubmit={submitAck} className="grid gap-3 sm:grid-cols-4" noValidate>
        <label className="block">UUID rekomendasi<input className={field} value={ack.recommendation_id} onChange={e => setAck(v => ({ ...v, recommendation_id: e.target.value }))} /></label>
        <label className="block">Tindakan
          <select className={field} value={ack.state} onChange={e => setAck(v => ({ ...v, state: e.target.value }))}>
            <option value="acknowledged">acknowledged</option><option value="dismissed">dismissed</option>
          </select>
        </label>
        <label className="block">Alasan (wajib, tercatat)<input className={field} value={ack.reason} onChange={e => setAck(v => ({ ...v, reason: e.target.value }))} /></label>
        <button type="submit" disabled={busy} className="self-end rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">Catat tindakan</button>
      </form>}
      <FeedbackLine feedback={ackFeedback} />
    </section>
  </div>;
}
