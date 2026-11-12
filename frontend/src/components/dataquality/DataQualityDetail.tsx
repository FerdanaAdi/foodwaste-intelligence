/**
 * Data-quality drilldown for one event and its measurements.
 * Values are shown verbatim per record: original numeric strings,
 * unit, mass basis, method and provenance stay explicit; no sums, no
 * conversions, no cross-basis or cross-measurement aggregation.
 */

import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { OBSERVATION_STATUS_LABELS, VALIDATION_STATUS_LABELS } from "@/domain/types";
import type { EventRecord } from "@/data/dataquality/summary";
import { formatDateTime } from "@/lib/utils";

const observationTone: Record<keyof typeof OBSERVATION_STATUS_LABELS, "info" | "ok" | "warn" | "neutral"> = {
  observed: "info",
  measured_zero: "ok",
  missing: "warn",
  not_measured: "neutral",
};

const validationTone: Record<keyof typeof VALIDATION_STATUS_LABELS, "neutral" | "warn" | "danger"> = {
  unvalidated: "neutral",
  needs_review: "warn",
  flagged: "danger",
};

function absentText(status: keyof typeof OBSERVATION_STATUS_LABELS): string {
  if (status === "measured_zero") return "Tidak dicatat (measured zero)";
  if (status === "missing") return "Tidak ada (missing)";
  if (status === "not_measured") return "Tidak diukur";
  return "Tidak ada";
}

function MassText({ value, status, field }: { value: string | null; status: keyof typeof OBSERVATION_STATUS_LABELS; field: string }) {
  if (value !== null && value.trim() !== "") {
    return (
      <span aria-label={`${field}: ${value} kg`} className="font-mono tabular-nums">
        {value} <span className="text-xs text-slate-500">kg</span>
      </span>
    );
  }
  return (
    <span aria-label={`${field}: ${absentText(status)}`} className="text-slate-500">
      — {absentText(status)}
    </span>
  );
}

export function DataQualityDetail({ record }: { record: EventRecord }) {
  const { event, measurements } = record;
  return (
    <section aria-label={`Detail drilldown ${event.eventId}`} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            Event <span className="font-mono">{event.eventId}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-slate-500">Site</dt>
              <dd>{event.siteId}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Jenis stream</dt>
              <dd>{event.eventType}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Tahap</dt>
              <dd>{event.stage}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Kategori material</dt>
              <dd>{event.materialCategory}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Terjadi pada</dt>
              <dd>{formatDateTime(event.occurredAt)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Tercatat pada</dt>
              <dd>{formatDateTime(event.recordedAt)}</dd>
            </div>
          </dl>
          {event.note && <p className="mt-2 text-xs text-slate-500">{event.note}</p>}
        </CardContent>
      </Card>

      {measurements.length === 0 ? (
        <p role="status" className="text-sm text-slate-600">
          {record.recordedMeasurementCount === 0
            ? "Belum ada pengukuran (0..n per event). Kejadian tetap tercatat — bukan nol terukur."
            : "Tidak ada pengukuran yang cocok dengan filter."}
        </p>
      ) : (
        <ul className="space-y-3">
          {measurements.map((m) => (
            <li key={m.measurementId}>
              <Card>
                <CardHeader>
                  <CardTitle>
                    Pengukuran <span className="font-mono">{m.measurementId}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={observationTone[m.observationStatus]}>
                      {OBSERVATION_STATUS_LABELS[m.observationStatus]}
                    </Badge>
                    {m.estimationStatus === "estimated" && <Badge tone="warn">Estimasi — bukan hasil timbangan</Badge>}
                    <Badge tone={validationTone[m.validationStatus]}>
                      {VALIDATION_STATUS_LABELS[m.validationStatus]}
                    </Badge>
                    <span className="text-sm">
                      Mass basis: <strong>{m.massBasis}</strong>
                    </span>
                  </div>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <dt className="text-xs uppercase text-slate-500">Gross</dt>
                      <dd>
                        <MassText field="Gross" value={m.gross} status={m.observationStatus} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-slate-500">Tare</dt>
                      <dd>
                        <MassText field="Tare" value={m.tare} status={m.observationStatus} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-slate-500">Net</dt>
                      <dd>
                        <MassText field="Net" value={m.net} status={m.observationStatus} />
                      </dd>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3">
                      <dt className="text-xs uppercase text-slate-500">Teks asli tercatat</dt>
                      <dd className="font-mono text-xs">{m.originalText || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-slate-500">Metode</dt>
                      <dd>{m.method}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs uppercase text-slate-500">Provenance</dt>
                      <dd>{m.provenance}</dd>
                    </div>
                  </dl>
                  {m.reviewNote && <p className="text-xs text-amber-800">{m.reviewNote}</p>}
                  <p className="text-xs text-slate-500">
                    Nilai ditampilkan apa adanya per record ({m.unit}); pengukuran berulang pada event yang sama tidak
                    dijumlahkan dan tidak saling menggantikan.
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
