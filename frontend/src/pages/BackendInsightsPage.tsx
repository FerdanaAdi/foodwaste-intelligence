import { ALERT_MESSAGES, ALERT_STATUS_LABELS, ALERT_TARGET_LABELS, ALERT_COVERAGE_LABELS,
  ALERT_DISCLAIMER, alertMessageFor } from "@/components/alerts/alertMessages";
import AlertSourcePanel from "@/components/alerts/AlertSourcePanel";
import { alertContextKey } from "@/components/alerts/useAlertSource";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  acknowledgeBackendRecommendation, createBackendCostReference, evaluateRecommendations,
  readAlertRules, readCostValuation, readRecommendations,
  type AlertRule, type EvaluateView, type ValuationBlocked, type Recommendation, type RecommendationFilters,
} from "@/backend/p1";
import { isUUID } from "@/backend/contract";
import { authSnapshot, permits, subscribeAuth } from "@/backend/auth";
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

function SourceTarget({ targetType, targetRef }: { targetType: string; targetRef: string }) {
  if (targetType === "waste_event" && isUUID(targetRef)) {
    return <Link className="underline" to={`/backend-demo/events/${targetRef}`}>{targetRef}</Link>;
  }
  if (targetType === "delivery" && isUUID(targetRef)) {
    return <Link className="underline" to={`/backend-distribution?delivery=${targetRef}`}>{targetRef}</Link>;
  }
  return <>{targetRef} · Tampilan sumber belum tersedia.</>;
}

// Copilot dictionary is integrated unchanged. Guard inherited property names at this boundary.
type RuleExplanation = { label: string; explanation: string; insufficientData: string };
type Props = { explainRule?: (ruleCode: string) => RuleExplanation | undefined };
function labelFor(labels: Readonly<Record<string, string>>, code: string) {
  return Object.hasOwn(labels, code) ? labels[code] : "Tidak dikenal (lihat kode asli)";
}
function explainKnownRule(code: string) {
  return Object.hasOwn(ALERT_MESSAGES, code) ? alertMessageFor(code) : undefined;
}
export default function BackendInsightsPage({ explainRule = explainKnownRule }: Props = {}) {
  const context = useSyncExternalStore(subscribeAuth, authSnapshot);
  if (context.phase !== "ready" || !context.session) return <p role="status">Sesi belum terverifikasi; data privat tidak ditampilkan.</p>;
  return <InsightsContext key={alertContextKey(context)} context={context} explainRule={explainRule} />;
}

function InsightsContext({ context, explainRule }: Props & { context: ReturnType<typeof authSnapshot> }) {
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
  const [filterFeedback, setFilterFeedback] = useState<Feedback>(null);
  const [alerts, setAlerts] = useState<Recommendation[]>([]);
  const [readError, setReadError] = useState('');
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [revision, setRevision] = useState(0);
  const mounted = useRef(true);
  const selection = useRef(0);
  const evalFlight = useRef(false);
  const ackFlight = useRef(false);
  const reasonInput = useRef<HTMLInputElement>(null);
  const [sourceSelection, setSourceSelection] = useState<{ alert: Recommendation; sequence: number } | null>(null);
  const [unknownAck, setUnknownAck] = useState<string | null>(null);
  const evaluatePath = `/p2/v0.1/recommendations/evaluate?site_id=${encodeURIComponent(context.site)}`;
  const ackPath = `/p2/v0.1/recommendations/${encodeURIComponent(ack.recommendation_id)}/acknowledge`;
  function pending(path: string) {
    try { return !!sessionStorage.getItem(`fwi-p1-pending:${context.session!.principal_id}:${context.site}:${path}`); }
    catch { return true; }
  }
  const [evaluationLocked, setEvaluationLocked] = useState(() => pending(evaluatePath));
  const ackLocked = unknownAck === ack.recommendation_id || pending(ackPath);
  const current = () => mounted.current && alertContextKey(authSnapshot()) === alertContextKey(context);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; selection.current += 1; }; }, []);

  function chooseAlert(alert: Recommendation, showSource: boolean) {
    if (!current() || alert.site_id !== context.site) {
      setAckFeedback({ kind: "error", message: "Konteks lokasi berubah; pilih kembali alert pada lokasi aktif." });
      return;
    }
    if (busy || evaluationLoading) {
      setAckFeedback({ kind: "error", message: "Tunggu hasil permintaan berjalan; tidak ada POST baru dikirim." });
      return;
    }
    const sequence = ++selection.current;
    setAck({ recommendation_id: alert.recommendation_id, state: "acknowledged", reason: "" });
    setAckFeedback(null);
    if (showSource) setSourceSelection({ alert, sequence });
    else { setSourceSelection(null); reasonInput.current?.focus(); }
  }


  useEffect(() => {
    const controller = new AbortController();
    setLoadingAlerts(true);
    setAlerts([]);
    setReadError('');
    void readRecommendations(site, controller.signal, applied).then(rows => {
      if (current() && !controller.signal.aborted) setAlerts(rows);
    }).catch(() => {
      if (current() && !controller.signal.aborted) setReadError('Riwayat alert tidak dapat dibaca.');
    }).finally(() => {
      if (current() && !controller.signal.aborted) setLoadingAlerts(false);
    });
    return () => controller.abort();
  }, [site, applied, revision]);

  useEffect(() => {
    let active = true;
    readAlertRules().then(value => { if (active && current()) setRules(value); })
      .catch(reason => { if (active && current()) setRulesError(reason instanceof Error ? reason.message : "Aturan tidak dapat dibaca."); });
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
    if (!current() || !canAck || evalFlight.current || evaluationLoading || busy || evaluationLocked || pending(evaluatePath)) {
      setAckFeedback({ kind: "error", message: "Evaluasi tidak dikirim: izin, konteks, atau pengaman operasi belum mengizinkan." });
      return;
    }
    evalFlight.current = true;
    setEvaluationLoading(true); setEvaluation(null);
    try {
      const result = await evaluateRecommendations();
      if (!current()) return;
      if (result.kind === "saved") { setEvaluation(result.value); setRevision(value => value + 1); }
      else {
        if (result.kind === "unknown") setEvaluationLocked(true);
        setAckFeedback({ kind: result.kind === "rejected" ? "error" : "unknown", message: result.message });
      }
    } catch {
      if (current()) { setEvaluationLocked(true); setAckFeedback({ kind: "unknown", message: "Hasil evaluasi UNKNOWN; jangan kirim ulang." }); }
    } finally { evalFlight.current = false; if (current()) setEvaluationLoading(false); }
  }

  async function submitAck(event: React.FormEvent) {
    event.preventDefault();
    if (!current() || !canAck || busy || ackFlight.current || evaluationLoading || ackLocked) {
      setAckFeedback({ kind: ackLocked ? "unknown" : "error", message: "Tindakan tidak dikirim: periksa izin/konteks atau hasil operasi yang belum terkonfirmasi. Jangan kirim ulang UNKNOWN." });
      return;
    }
    if (!isUUID(ack.recommendation_id) || !ack.reason.trim() || ack.reason.length > 300) {
      setAckFeedback({ kind: "error", message: "UUID rekomendasi dan alasan wajib diisi; alasan maksimal 300 karakter." });
      return;
    }
    const target = ack.recommendation_id;
    const request = selection.current;
    ackFlight.current = true;
    setBusy(true); setAckFeedback(null);
    try {
      const result = await acknowledgeBackendRecommendation(target,
        { state: ack.state as "acknowledged" | "dismissed", reason: ack.reason });
      if (!current() || request !== selection.current) return;
      if (result.kind === "saved") {
        setAckFeedback({ kind: "success", message: `Rekomendasi ${result.value.state} dengan alasan tercatat untuk alert ${target}. Ini bukan bukti masalah selesai; catatan sumber tidak diubah.` });
        setRevision(value => value + 1);
      } else {
        if (result.kind === "unknown") setUnknownAck(target);
        setAckFeedback({ kind: result.kind === "rejected" ? "error" : "unknown", message: result.message });
      }
    } catch {
      if (current() && request === selection.current) { setUnknownAck(target); setAckFeedback({ kind: "unknown", message: "Hasil tindakan UNKNOWN; jangan kirim ulang." }); }
    } finally { ackFlight.current = false; if (current()) setBusy(false); }
  }

  function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    if (filters.recorded_from && filters.recorded_to && filters.recorded_from > filters.recorded_to) {
      setFilterFeedback({ kind: "error", message: "Rentang tanggal tidak valid: 'Dari tanggal pencatatan' melewati 'Sampai tanggal pencatatan'; filter tidak dikirim." });
      return;
    }
    setFilterFeedback(null);
    selection.current += 1;
    setSourceSelection(null);
    setAck({ recommendation_id: "", state: "acknowledged", reason: "" });
    setApplied({ ...filters });
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
      {canAck && <button type="button" onClick={() => { void runEvaluation(); }} disabled={evaluationLoading || busy || evaluationLocked}
        className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">
        Evaluasi rekomendasi (POST, idempoten)
      </button>}
      <p>Evaluasi adalah tindakan POST yang dapat menambah alert baru. Membuka sumber hanya membaca (GET).</p>
      {evaluationLocked && <p role="alert">Hasil evaluasi UNKNOWN atau pengaman penyimpanan tidak tersedia. Operasi tetap terkunci; GET tidak membuka kunci dan tidak ada retry otomatis.</p>}
      {evaluationLoading && <LoadingState label="Mengevaluasi…" />}
      <form className="grid gap-3 sm:grid-cols-4" noValidate onSubmit={applyFilters}>
        <label>Dari tanggal pencatatan (UTC)<input className={field} type="date" value={filters.recorded_from ?? ''} onChange={event => setFilters({ ...filters, recorded_from: event.target.value })} /></label>
        <label>Sampai tanggal pencatatan (UTC)<input className={field} type="date" min={filters.recorded_from} value={filters.recorded_to ?? ''} onChange={event => setFilters({ ...filters, recorded_to: event.target.value })} /></label>
        <label>Status alert<select className={field} value={filters.state ?? ''} onChange={event => setFilters({ ...filters, state: event.target.value })}>
          <option value="">Semua status</option><option value="open">Terbuka</option><option value="acknowledged">Tinjauan tercatat</option><option value="dismissed">Ditutup oleh petugas</option>
        </select></label>
        <label>Versi aturan sumber<input className={field} maxLength={40} value={filters.rule_version ?? ''} onChange={event => setFilters({ ...filters, rule_version: event.target.value })} /></label>
        <button type="submit">Terapkan filter alert</button>
      </form>
      <FeedbackLine feedback={filterFeedback} />
      <p className="text-sm">Daftar menampilkan hingga 500 alert terbaru dari lokasi aktif. Periode ini memakai tanggal pencatatan alert dalam UTC.</p>
      {readError && <p role="alert">{readError}</p>}
      {loadingAlerts && <LoadingState label="Memuat riwayat alert…" />}
      {!loadingAlerts && !readError && alerts.length === 0 && <EmptyState title="Belum ada alert tersimpan untuk filter ini" />}
      <ul className="space-y-2 text-sm">
        {alerts.map(alert => <li key={alert.recommendation_id} className="rounded border border-slate-200 p-2">
          <p>{explainRule?.(alert.rule_code)?.label ?? "Penjelasan aturan belum tersedia"}</p>
          <p>Penjelasan jenis aturan, bukan konfirmasi kondisi sumber saat ini:</p>
          <p>{explainRule?.(alert.rule_code)?.explanation ?? "Baca teks backend tersimpan berikut; panel hanya menampilkan catatan sumber saat ini."}</p>
          <p>{ALERT_DISCLAIMER}</p>
          <details open><summary>Teks backend tersimpan (verbatim)</summary>
            <p className="whitespace-pre-wrap">{alert.detected_issue}</p>
            <p className="whitespace-pre-wrap">{alert.recommended_action}</p>
          </details>
          <p>Status tersimpan: <strong>{labelFor(ALERT_STATUS_LABELS, alert.state)}</strong> ({alert.state}) · Label bukti per aturan: {labelFor(ALERT_COVERAGE_LABELS, alert.coverage)} ({alert.coverage})</p>
          <p>Coverage ditetapkan per aturan; bukan persentase atau hasil ukur kelengkapan data.</p>
          <span className="block text-xs">Sumber: {labelFor(ALERT_TARGET_LABELS, alert.target_type)} ({alert.target_type}) <SourceTarget targetType={alert.target_type} targetRef={alert.target_ref} /> · {alert.rule_code} {alert.rule_version} · {alert.recorded_at}</span>
          {alert.ack_reason && <span className="block text-xs">Alasan: {alert.ack_reason}</span>}
          <button type="button" onClick={() => chooseAlert(alert, true)}>Lihat sumber</button>
          {canAck && alert.state === 'open' && <button type="button" onClick={() => chooseAlert(alert, false)}>Pilih alert ini</button>}
        </li>)}
      </ul>
      {sourceSelection && <AlertSourcePanel key={`${alertContextKey(context)}:${sourceSelection.sequence}`} alert={sourceSelection.alert} />}
      {evaluation && <div className="space-y-2 text-sm">
        <p>{evaluation.note} · {evaluation.rule_version}</p>
        {evaluation.insufficient.map(item => <p key={`${item.rule_code}:${item.target_ref}`}>
          <strong>Tidak ada kesimpulan ({item.state})</strong> · {explainRule?.(item.rule_code)?.insufficientData ?? "Data belum cukup untuk menyimpulkan."}
          <span className="block whitespace-pre-wrap">Alasan backend (verbatim): {item.reason}</span>
          <span className="block">Hasil ini tidak disimpan dan hilang setelah halaman dimuat ulang. Tidak ada tindakan keputusan untuk hasil ini.</span>
          Sumber: {item.target_type} {item.target_ref} · {item.rule_code}
        </p>)}
      </div>}
      {canAck && <form onSubmit={submitAck} className="grid gap-3 sm:grid-cols-4" noValidate>
        <label className="block">UUID rekomendasi<input className={field} value={ack.recommendation_id} onChange={e => { selection.current += 1; setSourceSelection(null); setAck(v => ({ ...v, recommendation_id: e.target.value })); }} /></label>
        <label className="block">Tindakan
          <select className={field} value={ack.state} onChange={e => setAck(v => ({ ...v, state: e.target.value }))}>
            <option value="acknowledged">Tinjauan tercatat</option><option value="dismissed">Ditutup oleh petugas</option>
          </select>
        </label>
        <label className="block">Alasan (wajib, tercatat)<input ref={reasonInput} maxLength={300} aria-describedby="ack-explanation" className={field} value={ack.reason} onChange={e => setAck(v => ({ ...v, reason: e.target.value }))} /></label>
        <button type="submit" disabled={busy || evaluationLoading || ackLocked} className="self-end rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">Catat tindakan</button>
      </form>}
      <p id="ack-explanation">Tinjauan tercatat atau ditutup oleh petugas bukan bukti masalah selesai dan tidak mengubah catatan sumber.</p>
      {ackLocked && ack.recommendation_id && <p role="alert">Tindakan pada alert ini UNKNOWN; tetap terkunci tanpa pengiriman ulang otomatis.</p>}
      <FeedbackLine feedback={ackFeedback} />
    </section>
  </div>;
}
