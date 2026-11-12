/**
 * Display states for the data-quality dashboard package.
 * Local to this package so it stays independent of unmerged work;
 * consolidate with the reviewed UX-01 display-state components at
 * integration time if the owner prefers one shared module.
 */

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export function DqLoadingState({ label = "Memuat data mutu…" }: { label?: string }) {
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

export function DqEmptyState({
  title = "Tidak ada record yang cocok",
  description,
}: {
  title?: string;
  description?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600"
    >
      <p className="font-semibold text-slate-800">{title}</p>
      {description && <div className="mt-1 max-w-prose">{description}</div>}
    </div>
  );
}

export function DqDeniedState({ reason }: { reason?: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-900"
    >
      <p className="font-semibold">Akses ditolak</p>
      <div className="mt-1 max-w-prose">{reason ?? "Anda tidak memiliki izin melihat dashboard mutu data."}</div>
    </div>
  );
}

export function DqUnavailableState({
  detail,
  onRetry,
}: {
  detail?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-900",
      )}
    >
      <p className="font-semibold">Layanan data tidak tersedia</p>
      <div className="mt-1 max-w-prose">
        {detail ?? "Sumber data mutu tidak dapat dihubungi. Tidak ada angka yang ditampilkan untuk menghindari nilai palsu."}
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
