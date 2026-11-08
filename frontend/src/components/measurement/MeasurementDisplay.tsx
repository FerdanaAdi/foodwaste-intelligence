/**
 * Safe measurement presentation (FWI-UX-01).
 *
 * Domain invariants preserved (FWI-02/03, ADR-003 §7):
 * - the original numeric string is rendered verbatim — no parsing,
 *   rounding, or reformatting that could alter recorded precision;
 * - unit and mass basis are always explicit; no conversions, no
 *   cross-basis aggregation, no derived totals;
 * - measured zero is visibly distinct from missing / not measured —
 *   a missing value is NEVER rendered as "0";
 * - estimated is visibly distinct from weighed;
 * - no KPI computation (OP-08/FI-02/NI-03 remain HELD and unused).
 */

import type { Measurement } from "@/domain/types";
import { MASS_BASIS_LABELS, OBSERVATION_STATUS_LABELS, VALIDATION_STATUS_LABELS } from "@/domain/types";
import { cn } from "@/lib/utils";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

const observationTone: Record<Measurement["observationStatus"], BadgeTone> = {
  observed: "info",
  measured_zero: "ok",
  missing: "warn",
  not_measured: "neutral",
};

const validationTone: Record<Measurement["validationStatus"], BadgeTone> = {
  unvalidated: "neutral",
  needs_review: "warn",
  flagged: "danger",
};

interface MassValueProps {
  /** Original recorded mass string; rendered verbatim when present. */
  value: string | null;
  unit?: Measurement["unit"];
  observationStatus: Measurement["observationStatus"] | 'estimated';
  absentLabel?: string;
  /** Accessible name prefix, e.g. "Gross" / "Tare" / "Net". */
  field: string;
  emphasized?: boolean;
  className?: string;
}

/** Text used when a value is absent — status-specific, never "0". */
function absentValueText(observationStatus: MassValueProps['observationStatus']): string {
  if (observationStatus === "measured_zero") return "Tidak dicatat (measured zero)";
  if (observationStatus === "missing") return "Tidak ada (missing)";
  if (observationStatus === "not_measured") return "Tidak diukur";
  return "Tidak ada";
}

export function MassValue({ value, unit = "kg", observationStatus, field, emphasized, className, absentLabel }: MassValueProps) {
  const hasValue = value !== null && value.trim() !== "";
  const absent = absentLabel ?? absentValueText(observationStatus);
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-baseline gap-1 tabular-nums",
        emphasized && "font-semibold",
        className,
      )}
    >
      {hasValue ? (
        <>
          {/* Original string verbatim; unit appended, value never reformatted. */}
          <span aria-label={`${field}: ${value} ${unit}`} className="font-mono">
            {value}
          </span>
          <span aria-hidden="true" className="text-xs text-slate-500">
            {unit}
          </span>
        </>
      ) : (
        // Missing is not zero: show the status explicitly instead of a number.
        <span aria-label={`${field}: ${absent}`} className="text-slate-500">
          — {absent}
        </span>
      )}
    </span>
  );
}

interface MeasurementValuesProps {
  measurement: Measurement;
  className?: string;
}

/**
 * Full gross/tare/net presentation for one measurement record.
 * Responsive: single column on narrow screens, 2 columns ≥sm, 3 ≥lg —
 * same breakpoints as the existing event detail grid.
 */
export function MeasurementValues({ measurement, className }: MeasurementValuesProps) {
  const m = measurement;
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={observationTone[m.observationStatus]}>
          {OBSERVATION_STATUS_LABELS[m.observationStatus]}
        </Badge>
        {m.estimationStatus === "estimated" && <Badge tone="warn">Estimasi — bukan hasil timbangan</Badge>}
        <Badge tone={validationTone[m.validationStatus]}>{VALIDATION_STATUS_LABELS[m.validationStatus]}</Badge>
        <span className="text-sm">
          Mass basis: <strong>{MASS_BASIS_LABELS[m.massBasis]}</strong>
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-xs uppercase text-slate-500">Gross</dt>
          <dd>
            <MassValue field="Gross" value={m.gross} unit={m.unit} observationStatus={m.observationStatus} />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-500">Tare</dt>
          <dd>
            <MassValue field="Tare" value={m.tare} unit={m.unit} observationStatus={m.observationStatus} />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-500">Net</dt>
          <dd>
            <MassValue field="Net" value={m.net} unit={m.unit} observationStatus={m.observationStatus} emphasized />
          </dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="text-xs uppercase text-slate-500">Teks asli tercatat</dt>
          <dd className="font-mono text-xs">{m.originalText || "—"}</dd>
        </div>
      </dl>
      <p className="text-xs text-slate-500">
        Nilai ditampilkan apa adanya (unit {m.unit}); tanpa konversi antar basis massa dan tanpa penjumlahan antar
        pengukuran.
      </p>
    </div>
  );
}
