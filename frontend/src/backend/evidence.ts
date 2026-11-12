/** Evidence metadata client (FR-005, metadata-only). Never retries a POST. */
import { isUUID, isAwareTimestamp } from "./contract";
import { assertCurrent, authSnapshot, permits, protectedJson } from './auth';
import { WRITE_TIMEOUT_MS } from './write';

export type EvidenceTargetKind = 'event' | 'measurement';
export interface EvidenceRecord {
  evidence_id: string; target_kind: EvidenceTargetKind; target_id: string;
  kind: 'reference' | 'attachment'; source: string; title: string;
  recorded_by: string; recorded_at: string; method: string | null;
  provenance: string | null; verification: string; availability: string;
  note: string | null; recorded_at_system: string;
}
export type EvidenceInput = {
  target_kind: EvidenceTargetKind; target_id: string; kind: 'reference' | 'attachment';
  source: string; title: string; recorded_at: string;
  method?: string; provenance?: string;
  verification?: 'unverified' | 'needs_review' | 'verified';
  availability?: 'available' | 'unavailable' | 'expired' | 'unknown';
  note?: string;
};
export type EvidenceResult<T> =
  | { kind: 'saved'; value: T }
  | { kind: 'rejected'; message: string }
  | { kind: 'unknown'; message: string };

// The wire contract mirrors EvidenceOutput: storage_ref cannot appear here.
// Conservative UNKNOWN protection (DEC-P0-ACCESS-05): an opaque per-tab marker
// is written BEFORE the POST and only cleared on a definitive server outcome.
// It survives refresh and logout in the same tab; it never claims cross-device
// exactly-once, and no server idempotency contract is invented here.
const EVIDENCE_PENDING_KEY = 'fwi-p0:evidence-post-pending';
export type PendingMarker = { state: 'pending' | 'unknown' };
export function readEvidencePending(): PendingMarker | null {
  try {
    const raw = sessionStorage.getItem(EVIDENCE_PENDING_KEY);
    return raw ? { state: 'unknown' } : null;
  } catch { return { state: 'unknown' }; } // storage unavailable: stay conservative
}
export function markEvidencePending(): boolean {
  try { sessionStorage.setItem(EVIDENCE_PENDING_KEY, 'evidence'); return true; }
  catch { return false; } // caller must refuse to POST without a marker
}
export function clearEvidencePending(): void {
  try { sessionStorage.removeItem(EVIDENCE_PENDING_KEY); } catch { /* keep lock */ }
}

function parseEvidence(value: unknown, expectedTarget: string): EvidenceRecord {
  if (typeof value !== "object" || value === null) throw new Error("Metadata bukti tidak sesuai kontrak.");
  const row = value as Record<string, unknown>;
  if (typeof row.evidence_id !== "string" || !isUUID(row.evidence_id) ||
      (row.target_kind !== "event" && row.target_kind !== "measurement") ||
      typeof row.target_id !== "string" || !isUUID(row.target_id) || row.target_id !== expectedTarget ||
      (row.kind !== "reference" && row.kind !== "attachment") ||
      typeof row.source !== "string" || typeof row.title !== "string" ||
      typeof row.recorded_by !== "string" || !isAwareTimestamp(row.recorded_at) ||
      typeof row.verification !== "string" || typeof row.availability !== "string" ||
      typeof row.recorded_at_system !== "string") throw new Error("Metadata bukti tidak sesuai kontrak.");
  if ("storage_ref" in row) throw new Error("Respons bukti membawa field internal yang dilarang.");
  return row as unknown as EvidenceRecord;
}

export async function listBackendEvidence(targetKind: EvidenceTargetKind, targetId: string, signal: AbortSignal): Promise<EvidenceRecord[]> {
  if (!isUUID(targetId)) throw new Error('Target ID harus UUID.');
  const context = authSnapshot();
  const { response, value } = await protectedJson(
    `/demo/v0.1/evidence?target_kind=${targetKind}&target_id=${targetId}`, { method: 'GET' }, signal);
  if (!response.ok) {
    if (response.status === 404) throw new Error('404: Target/evidence tidak ditemukan atau bukan milik site berizin.');
    if (response.status === 503) throw new Error('503: Layanan backend tidak tersedia.');
    throw new Error(`Backend gagal merespons (HTTP ${response.status}).`);
  }
  if (!Array.isArray(value)) throw new Error('Daftar bukti tidak sesuai kontrak.');
  const records = value.map(item => parseEvidence(item, targetId));
  assertCurrent(context);
  return records;
}

export function evidenceInputErrors(value: EvidenceInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isUUID(value.target_id)) errors.target_id = 'UUID target (event/measurement) wajib valid.';
  if (!value.source.trim()) errors.source = 'Sumber bukti wajib dinyatakan.';
  if (!value.title.trim()) errors.title = 'Judul bukti wajib diisi; tidak dibuat-buat.';
  if (!isAwareTimestamp(value.recorded_at)) errors.recorded_at = 'Waktu catat harus ISO dengan offset zona waktu.';
  return errors;
}

/** One POST attempt. Unknown outcome stays UNKNOWN; no replay, no retry.
 *  The marker is cleared ONLY on a definitive 201 or an explicit server
 *  rejection (403/404/422); ambiguous results keep the operation locked. */
export async function createBackendEvidence(input: EvidenceInput): Promise<EvidenceResult<EvidenceRecord>> {
  if (Object.keys(evidenceInputErrors(input)).length) return { kind: 'rejected', message: 'Validasi evidence gagal.' };
  if (readEvidencePending()) return { kind: 'rejected', message: 'Ada POST evidence yang belum terkonfirmasi; verifikasi dulu, jangan kirim ulang.' };
  if (!permits('event.create')) return { kind: 'rejected', message: 'Tidak ada izin menulis pada site aktif.' };
  if (!markEvidencePending()) return { kind: 'rejected', message: 'Penanda operasi tidak dapat disimpan; POST tidak dikirim.' };
  const body = { ...input };
  for (const key of ['method', 'provenance', 'note'] as const) {
    const text = body[key];
    if (text !== undefined && !text.trim()) delete body[key];
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS);
    try {
      const { response, value } = await protectedJson('/demo/v0.1/evidence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }, controller.signal);
      clearTimeout(timer);
      if (response.status === 404 || response.status === 422 || response.status === 403) {
        clearEvidencePending(); // explicit refusal: no record was created
        return { kind: 'rejected', message: `Server menolak (HTTP ${response.status}). Periksa target, izin, atau input.` };
      }
      if (response.status !== 201)
        return { kind: 'unknown', message: `HTTP ${response.status}; hasil commit tidak dapat dipastikan. Jangan kirim ulang.` };
      try {
        const saved = { kind: 'saved', value: parseEvidence(value, input.target_id) } as EvidenceResult<EvidenceRecord>;
        clearEvidencePending();
        return saved;
      } catch { return { kind: 'unknown', message: 'Respons 201 tidak valid; commit belum dapat dipastikan.' }; }
    } finally { clearTimeout(timer); }
  } catch {
    return { kind: 'unknown', message: 'Respons POST tidak diterima (jaringan/timeout); mungkin sudah commit. Jangan kirim ulang.' };
  }
}
