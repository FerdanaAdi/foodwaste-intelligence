/**
 * Filterable synthetic record list (FR-007 / UI-02 drill-down entry).
 * Event rows and their measurement records are listed separately:
 * event ≠ measurement; 0..n measurements per event; repeat measurements
 * are never presented as new events. No mass totals are rendered.
 */

import { Badge } from "@/components/ui/Badge";
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

interface DataQualityRecordListProps {
  records: EventRecord[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
}

export function DataQualityRecordList({ records, selectedEventId, onSelectEvent }: DataQualityRecordListProps) {
  return (
    <section aria-label="Daftar record mutu data (demo sintetis)">
      <ul className="space-y-3">
        {records.map(({ event, measurements }) => (
          <li key={event.eventId} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-expanded={selectedEventId === event.eventId}
                className="font-mono text-xs font-semibold text-sky-800 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                onClick={() => onSelectEvent(event.eventId)}
              >
                {event.eventId}
              </button>
              <Badge>{event.stage}</Badge>
              <Badge>{event.materialCategory}</Badge>
              <span className="text-xs text-slate-500">
                {measurements.length} pengukuran (0..n per event)
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-slate-500">Site</dt>
                <dd>{event.siteId}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Tanggal operasi</dt>
                <dd>{event.operationDate}</dd>
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

            {measurements.length > 0 && (
              <ul className="mt-3 space-y-2" aria-label={`Pengukuran untuk ${event.eventId}`}>
                {measurements.map((m) => (
                  <li key={m.measurementId} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs">{m.measurementId}</span>
                      <Badge tone={observationTone[m.observationStatus]}>
                        {OBSERVATION_STATUS_LABELS[m.observationStatus]}
                      </Badge>
                      {m.estimationStatus === "estimated" && <Badge tone="warn">Estimasi</Badge>}
                      <Badge tone={validationTone[m.validationStatus]}>
                        {VALIDATION_STATUS_LABELS[m.validationStatus]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Basis massa: {m.massBasis} · unit {m.unit} · net ditampilkan di detail (bukan dijumlahkan)
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
