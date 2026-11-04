import { useState } from "react";
import { Link } from "react-router";
import { useDemoStore } from "@/data/demoStoreContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { FieldError, Label, Select, Textarea } from "@/components/ui/Form";
import { formatDateTime, formatMass } from "@/lib/utils";
import {
  MASS_BASIS_LABELS,
  OBSERVATION_STATUS_LABELS,
  VALIDATION_STATUS_LABELS,
  type ValidationStatus,
} from "@/domain/types";

const REVIEW_CHOICES: ValidationStatus[] = ["unvalidated", "needs_review", "flagged"];

export default function ReviewAuditPage() {
  const store = useDemoStore();
  const data = store.get();

  const flagged = data.measurements.filter((m) => m.validationStatus !== "unvalidated");
  const [decisions, setDecisions] = useState<Record<string, ValidationStatus>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSave(measurementId: string) {
    const choice = decisions[measurementId];
    if (!choice) {
      setErrors((e) => ({
        ...e,
        [measurementId]: "Pilih status review terlebih dahulu.",
      }));
      return;
    }
    const errorSnapshot = { ...errors };
    delete errorSnapshot[measurementId];
    setErrors(errorSnapshot);
    store.updateMeasurementReview(measurementId, {
      validationStatus: choice,
      reviewNote:
        notes[measurementId]?.trim() ||
        `Pratinjau demo: ditandai "${VALIDATION_STATUS_LABELS[choice]}" (fiktif, bukan keputusan resmi).`,
    });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Pratinjau Review &amp; Audit</h1>
        <p className="mt-1 text-sm text-slate-600">
          Menampilkan observasi, provenance, dan catatan review dari store demo.{" "}
          <strong>Ini bukan persetujuan akhir resmi</strong> — tidak ada otoritas reviewer,
          audit log, atau workflow validasi backend pada tahap demo ini.
        </p>
      </header>

      {flagged.length === 0 && (
        <Card>
          <CardContent className="text-sm text-slate-500">
            Belum ada measurement yang ditandai untuk review di data demo.
          </CardContent>
        </Card>
      )}

      {flagged.map((m) => {
        const event = data.events.find((e) => e.eventId === m.eventId);
        const tone: BadgeTone = m.validationStatus === "flagged" ? "danger" : "warn";
        return (
          <Card key={m.measurementId}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{m.measurementId}</span>
                <Badge tone={tone}>{VALIDATION_STATUS_LABELS[m.validationStatus]}</Badge>
                {event && (
                  <Link
                    to={`/events/${event.eventId}`}
                    className="text-sm font-normal text-sky-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                  >
                    Event {event.eventId}
                  </Link>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-xs uppercase text-slate-500">Status observasi</dt>
                  <dd>{OBSERVATION_STATUS_LABELS[m.observationStatus]}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Mass basis</dt>
                  <dd>{MASS_BASIS_LABELS[m.massBasis]}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Waktu ukur</dt>
                  <dd>{formatDateTime(m.observedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Net</dt>
                  <dd className="tabular-nums">{formatMass(m.net)}</dd>
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <dt className="text-xs uppercase text-slate-500">Provenance</dt>
                  <dd>{m.provenance}</dd>
                </div>
                {m.reviewNote && (
                  <div className="sm:col-span-2 lg:col-span-4">
                    <dt className="text-xs uppercase text-slate-500">Catatan review saat ini</dt>
                    <dd>{m.reviewNote}</dd>
                  </div>
                )}
              </dl>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`review-status-${m.measurementId}`}>
                    Ubah tandau (demo, bukan persetujuan resmi)
                  </Label>
                  <Select
                    id={`review-status-${m.measurementId}`}
                    value={decisions[m.measurementId] ?? ""}
                    aria-invalid={!!errors[m.measurementId]}
                    aria-describedby={
                      errors[m.measurementId] ? `err-review-${m.measurementId}` : undefined
                    }
                    onChange={(e) =>
                      setDecisions((d) => ({
                        ...d,
                        [m.measurementId]: e.target.value as ValidationStatus,
                      }))
                    }
                  >
                    <option value="">— Pilih status —</option>
                    {REVIEW_CHOICES.map((s) => (
                      <option key={s} value={s}>
                        {VALIDATION_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                  <FieldError id={`err-review-${m.measurementId}`}>
                    {errors[m.measurementId]}
                  </FieldError>
                </div>
                <div>
                  <Label htmlFor={`review-note-${m.measurementId}`}>Catatan (opsional)</Label>
                  <Textarea
                    id={`review-note-${m.measurementId}`}
                    value={notes[m.measurementId] ?? ""}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [m.measurementId]: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div>
                <Button onClick={() => handleSave(m.measurementId)}>
                  Simpan tandau demo
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
