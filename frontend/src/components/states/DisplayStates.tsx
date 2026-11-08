/**
 * Reusable display-state components (FWI-UX-01).
 *
 * Loading / empty / access denied / service unavailable / uncertain result.
 * Presentation only: no backend calls, no domain logic, no KPI semantics.
 * Styled to match the existing design conventions (Badge tones, Card,
 * Tailwind slate palette, Indonesian UI labels).
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

type StateTone = "neutral" | "info" | "warn" | "danger" | "ok";

const toneStyles: Record<StateTone, string> = {
  neutral: "border-slate-200 bg-white text-slate-700",
  info: "border-sky-200 bg-sky-50 text-sky-900",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-900",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

interface StateShellProps {
  role?: "status" | "alert";
  tone: StateTone;
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}

function StateShell({ role, tone, icon, title, description, actions, className, children }: StateShellProps) {
  return (
    <div
      role={role}
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border px-4 py-6 text-center sm:px-6",
        toneStyles[tone],
        className,
      )}
    >
      <span aria-hidden="true" className="text-2xl leading-none">
        {icon}
      </span>
      <p className="text-sm font-semibold">{title}</p>
      {description && <div className="max-w-prose text-sm">{description}</div>}
      {children}
      {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

/** Inline loading indicator; announced politely to assistive technology. */
export function LoadingState({ label = "Memuat…", className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex items-center gap-2 text-sm text-slate-600", className)}>
      <span
        aria-hidden="true"
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
      />
      <span>{label}</span>
    </div>
  );
}

/** Empty data placeholder; explicitly not an error and not a measured zero. */
export function EmptyState({
  title = "Belum ada data",
  description,
  className,
}: {
  title?: string;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <StateShell
      role="status"
      tone="neutral"
      icon="📭"
      title={title}
      description={description}
      className={className}
    />
  );
}

/** Access denied; announces the fact without disclosing authorization details. */
export function AccessDeniedState({
  reason,
  className,
}: {
  reason?: ReactNode;
  className?: string;
}) {
  return (
    <StateShell
      role="alert"
      tone="danger"
      icon="⛔"
      title="Akses ditolak"
      description={reason ?? "Anda tidak memiliki izin untuk melihat bagian ini."}
      className={className}
    />
  );
}

/** Backend/service unavailable; supports one explicit retry action. */
export function ServiceUnavailableState({
  detail,
  onRetry,
  className,
}: {
  detail?: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <StateShell
      role="alert"
      tone="warn"
      icon="🔌"
      title="Layanan tidak tersedia"
      description={detail ?? "Koneksi ke layanan backend gagal atau terputus. Data lokal tidak diubah."}
      actions={
        onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            Coba lagi
          </Button>
        ) : undefined
      }
      className={className}
    />
  );
}

/**
 * Submission result UNKNOWN (e.g. request timed out without a definitive
 * response). The UI must not guess success or failure; the operator decides
 * what to do next. Retrying is offered explicitly, never automatic.
 */
export function UncertainResultState({
  detail,
  onRetry,
  className,
}: {
  detail?: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <StateShell
      role="alert"
      tone="warn"
      icon="❓"
      title="Hasil tidak diketahui (UNKNOWN)"
      description={
        <>
          {detail ?? "Status penyimpanan tidak dapat dipastikan (bukan sukses, bukan gagal terverifikasi)."}
          <span className="mt-1 block">
            Jangan mengulang pengiriman secara otomatis. Periksa data terlebih dahulu untuk mencegah duplikasi.
          </span>
        </>
      }
      actions={
        onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            Periksa lalu coba lagi
          </Button>
        ) : undefined
      }
      className={className}
    />
  );
}
