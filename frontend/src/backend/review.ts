/** Review/proposal client (FR-006, proposal-only). Never retries a POST. */
import { isUUID, isAwareTimestamp } from "./contract";
import { assertCurrent, authSnapshot, permits, protectedJson } from './auth';
import { WRITE_TIMEOUT_MS } from './write';

export type ReviewTargetKind = 'event' | 'measurement';
export interface ReviewProposal {
  proposal_version?: number; approval_revision?: number; approval_status?: "unreviewed" | "approved_prototype"; applied?: false;
  correction_record_id: string; target_kind: ReviewTargetKind; target_id: string;
  original_values: Record<string, unknown>; proposed_values: Record<string, unknown>;
  actor_id: string; recorded_at: string; reason: string; source: string;
  provenance: string; review_decision_id: string | null; state: 'proposed';
  recorded_at_system: string;
}
export interface ReviewDecision {
  review_decision_id: string; target_kind: ReviewTargetKind; target_id: string;
  decision: 'request_correction'; actor_id: string; recorded_at: string;
  rationale: string; source: string; provenance: string; recorded_at_system: string;
}
export interface ReviewHistory {
  target_kind: ReviewTargetKind; target_id: string;
  decisions: ReviewDecision[]; proposals: ReviewProposal[];
}
export interface ReviewInput {
  target_kind: ReviewTargetKind; target_id: string; reason: string;
  source: string; provenance: string; proposed_values?: Record<string, string>;
}
export type ReviewResult<T> =
  | { kind: 'saved'; value: T }
  | { kind: 'rejected'; message: string }
  | { kind: 'unknown'; message: string };

export function reviewInputErrors(value: ReviewInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isUUID(value.target_id)) errors.target_id = 'UUID target (event/measurement) wajib valid.';
  if (!value.reason.trim()) errors.reason = 'Alasan koreksi wajib dinyatakan.';
  if (!value.source.trim()) errors.source = 'Sumber review wajib dinyatakan.';
  if (!value.provenance.trim()) errors.provenance = 'Provenance wajib dinyatakan.';
  if (value.proposed_values && !Object.keys(value.proposed_values).length)
    errors.proposed_values = 'Usulan kosong tidak dikirim; hapus usulan bila hanya mencatat review.';
  return errors;
}

// Conservative UNKNOWN protection (DEC-P0-ACCESS-05), same pattern as evidence:
// opaque per-tab marker written BEFORE the POST, cleared only on a definitive
// server outcome; survives refresh/logout in this tab; no cross-device claim
// and no invented server idempotency contract.
const REVIEW_PENDING_KEY = 'fwi-p0:review-post-pending';
export type PendingMarker = { state: 'pending' | 'unknown' };
export function readReviewPending(): PendingMarker | null {
  try {
    const raw = sessionStorage.getItem(REVIEW_PENDING_KEY);
    return raw ? { state: 'unknown' } : null;
  } catch { return { state: 'unknown' }; }
}
export function markReviewPending(): boolean {
  try { sessionStorage.setItem(REVIEW_PENDING_KEY, 'review'); return true; }
  catch { return false; }
}
export function clearReviewPending(): void {
  try { sessionStorage.removeItem(REVIEW_PENDING_KEY); } catch { /* keep lock */ }
}

export async function readBackendReviews(targetKind: ReviewTargetKind, targetId: string, signal: AbortSignal): Promise<ReviewHistory> {
  if (!isUUID(targetId)) throw new Error('Target ID harus UUID.');
  const context = authSnapshot();
  const { response, value } = await protectedJson(
    `/demo/v0.1/reviews?target_kind=${targetKind}&target_id=${targetId}`, { method: 'GET' }, signal);
  if (!response.ok) {
    if (response.status === 404) throw new Error('404: Target review tidak ditemukan atau bukan milik site berizin.');
    if (response.status === 503) throw new Error('503: Layanan backend tidak tersedia.');
    throw new Error(`Backend gagal merespons (HTTP ${response.status}).`);
  }
  if (typeof value !== "object" || value === null || !Array.isArray((value as ReviewHistory).decisions)
      || !Array.isArray((value as ReviewHistory).proposals)) throw new Error('Riwayat review tidak sesuai kontrak.');
  assertCurrent(context);
  return value as ReviewHistory;
}

/** One POST attempt. Unknown outcome stays UNKNOWN; no replay, no retry.
 *  Marker cleared ONLY on definitive 201 or explicit server rejection. */
export async function submitBackendReview(input: ReviewInput): Promise<ReviewResult<ReviewDecision>> {
  if (Object.keys(reviewInputErrors(input)).length) return { kind: 'rejected', message: 'Validasi review gagal.' };
  if (readReviewPending()) return { kind: 'rejected', message: 'Ada POST review yang belum terkonfirmasi; verifikasi dulu, jangan kirim ulang.' };
  if (!permits('event.create')) return { kind: 'rejected', message: 'Tidak ada izin menulis pada site aktif.' };
  if (!markReviewPending()) return { kind: 'rejected', message: 'Penanda operasi tidak dapat disimpan; POST tidak dikirim.' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS);
    try {
      const { response, value } = await protectedJson('/demo/v0.1/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      }, controller.signal);
      clearTimeout(timer);
      if (response.status === 404 || response.status === 422 || response.status === 403) {
        clearReviewPending(); // explicit refusal: nothing was stored
        return { kind: 'rejected', message: `Server menolak (HTTP ${response.status}). Usulan tidak tersimpan.` };
      }
      if (response.status !== 201)
        return { kind: 'unknown', message: `HTTP ${response.status}; hasil commit tidak dapat dipastikan. Jangan kirim ulang.` };
      const row = value as Record<string, unknown>;
      if (typeof row.review_decision_id !== "string" || !isUUID(row.review_decision_id)
          || !isAwareTimestamp(row.recorded_at))
        return { kind: 'unknown', message: 'Respons 201 tidak valid; commit belum dapat dipastikan.' };
      clearReviewPending();
      return { kind: 'saved', value: row as unknown as ReviewDecision };
    } finally { clearTimeout(timer); }
  } catch {
    return { kind: 'unknown', message: 'Respons POST tidak diterima (jaringan/timeout); mungkin sudah commit. Jangan kirim ulang.' };
  }
}
