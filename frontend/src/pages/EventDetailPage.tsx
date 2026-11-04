import { Link, useParams } from "react-router";
import { useDemoStore } from "@/data/demoStoreContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { formatDateTime, formatMass } from "@/lib/utils";
import {
  EVENT_TYPE_LABELS,
  MASS_BASIS_LABELS,
  OBSERVATION_STATUS_LABELS,
  VALIDATION_STATUS_LABELS,
} from "@/domain/types";

function observationTone(status: string): BadgeTone {
  switch (status) {
    case "measured_zero":
      return "ok";
    case "missing":
    case "not_measured":
      return "danger";
    default:
      return "info";
  }
}

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const store = useDemoStore();
  const data = store.get();
  const event = data.events.find((e) => e.eventId === eventId);

  if (!event) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Event tidak ditemukan</h1>
        <p className="text-sm text-slate-600">
          {eventId ?? "ID kosong"} bukan event demo yang valid.{" "}
          <Link to="/events" className="text-sky-700 underline">
            Kembali ke ledger
          </Link>
        </p>
      </div>
    );
  }

  const measurements = store.measurementsForEvent(event.eventId);
  const site = data.sites.find((s) => s.siteId === event.siteId);

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link to="/events" className="text-sky-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">
          ← Ledger Event
        </Link>
      </nav>

      <header>
        <h1 className="font-mono text-xl font-bold sm:text-2xl">{event.eventId}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Identitas kejadian tunggal; semua pengukuran berikut menunjuk event yang sama.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Detail event (fiktif)</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase text-slate-500">Site</dt>
              <dd className="text-sm">{site ? `${site.name} (${site.siteId})` : event.siteId}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-slate-500">Stream/tipe</dt>
              <dd className="text-sm">{EVENT_TYPE_LABELS[event.eventType]}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-slate-500">Tahap</dt>
              <dd className="text-sm">{event.stage}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-slate-500">Kategori material</dt>
              <dd className="text-sm">{event.materialCategory}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-slate-500">Waktu kejadian</dt>
              <dd className="text-sm">{formatDateTime(event.occurredAt)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-slate-500">Waktu pencatatan</dt>
              <dd className="text-sm">{formatDateTime(event.recordedAt)}</dd>
            </div>
            {event.note && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase text-slate-500">Catatan</dt>
                <dd className="text-sm">{event.note}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat pengukuran ({measurements.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {measurements.length === 0 && (
            <p className="text-sm text-slate-500">
              Belum ada pengukuran untuk event ini — kejadian tetap tercatat, tanpa nilai massa.
              Ini bukan nol terukur.
            </p>
          )}
          {measurements.map((m) => (
            <div key={m.measurementId} className="rounded-md border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold">{m.measurementId}</span>
                <Badge tone={observationTone(m.observationStatus)}>
                  {OBSERVATION_STATUS_LABELS[m.observationStatus]}
                </Badge>
                {m.estimationStatus === "estimated" && (
                  <Badge tone="warn">Estimasi — bukan hasil timbangan</Badge>
                )}
                <Badge>{VALIDATION_STATUS_LABELS[m.validationStatus]}</Badge>
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase text-slate-500">Waktu ukur</dt>
                  <dd>{formatDateTime(m.observedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Mass basis</dt>
                  <dd>{MASS_BASIS_LABELS[m.massBasis]}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Metode</dt>
                  <dd>{m.method}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Gross</dt>
                  <dd className="tabular-nums">{formatMass(m.gross)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Tare</dt>
                  <dd className="tabular-nums">{formatMass(m.tare)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Net</dt>
                  <dd className="font-semibold tabular-nums">{formatMass(m.net)}</dd>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="text-xs uppercase text-slate-500">Teks asli tercatat</dt>
                  <dd>{m.originalText || "—"}</dd>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="text-xs uppercase text-slate-500">Provenance</dt>
                  <dd>{m.provenance}</dd>
                </div>
                {m.reviewNote && (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <dt className="text-xs uppercase text-slate-500">Catatan review</dt>
                    <dd>{m.reviewNote}</dd>
                  </div>
                )}
              </dl>
            </div>
          ))}
          <p className="text-xs text-slate-500">
            Pengukuran berulang pada event yang sama tidak dijumlahkan dan tidak saling menggantikan.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
