/**
 * Display states for the evidence/provenance package (FR-005).
 * Read-only presentation; denied/unavailable are server-driven inputs —
 * this package makes no client-side permission claims.
 */

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

export function EvidenceLoadingState({ label = "Memuat data bukti…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-slate-600">
      <span
        aria-hidden="true"
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
      />
      <span>{label}</span>
    </div>
  );
}

export function EvidenceEmptyState({ description }: { description?: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600"
    >
      <p className="font-semibold text-slate-800">Belum ada metadata bukti</p>
      <div className="mt-1 max-w-prose">
        {description ??
          "Tidak ada metadata bukti untuk record ini. Ketiadaan bukti bukan berarti pengukuran nol, dan bukan alasan mengubah nilai."}
      </div>
    </div>
  );
}

export function EvidenceDeniedState({ reason }: { reason?: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-900"
    >
      <p className="font-semibold">Akses ke bukti ditolak</p>
      <div className="mt-1 max-w-prose">
        {reason ?? "Anda tidak memiliki izin melihat metadata bukti ini."}
      </div>
      <p className="mt-2 text-xs">Otorisasi aktual ditegakkan di sisi server (AC-10); UI ini tidak mengklaim izin.</p>
    </div>
  );
}

export function EvidenceUnavailableState({
  detail,
  onRetry,
}: {
  detail?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-900"
    >
      <p className="font-semibold">Layanan bukti tidak tersedia</p>
      <div className="mt-1 max-w-prose">
        {detail ?? "Sumber data bukti tidak dapat dihubungi. Tidak ada metadata yang direkonstruksi secara lokal."}
      </div>
      {onRetry && (
        <div className="mt-3">
          <Button variant="secondary" onClick={onRetry}>
            Coba lagi
          </Button>
        </div>
      )}
    </div>
  );
}
