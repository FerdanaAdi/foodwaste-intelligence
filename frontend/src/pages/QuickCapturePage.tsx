import { useState } from "react";
import { Link } from "react-router";
import { useDemoStore } from "@/data/demoStoreContext";
import { nextDemoEventId, nextDemoMeasurementId } from "@/data/demoStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  FieldError,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui/Form";
import {
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  MASS_BASES,
  MASS_BASIS_LABELS,
  OBSERVATION_STATUS_LABELS,
  type EventType,
  type ObservationStatus,
} from "@/domain/types";
import {
  measurementFromInput,
  validateEventInput,
  validateMeasurementInput,
  type FieldErrors,
} from "@/domain/validation";

const STATUS_OPTIONS: ObservationStatus[] = [
  "observed",
  "measured_zero",
  "missing",
  "not_measured",
];

export default function QuickCapturePage() {
  const store = useDemoStore();

  const [siteId, setSiteId] = useState("");
  const [eventType, setEventType] = useState<EventType | "">("");
  const [stage, setStage] = useState("");
  const [operationDate, setOperationDate] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [materialCategory, setMaterialCategory] = useState("");

  const [createdEventId, setCreatedEventId] = useState<string | null>(null);

  const [massBasis, setMassBasis] = useState("");
  const [observationStatus, setObservationStatus] = useState<ObservationStatus>("observed");
  const [estimationStatus, setEstimationStatus] = useState<"weighed" | "estimated">("weighed");
  const [method, setMethod] = useState("");
  const [gross, setGross] = useState("");
  const [tare, setTare] = useState("");
  const [net, setNet] = useState("");
  const [provenance, setProvenance] = useState("");

  const [eventErrors, setEventErrors] = useState<FieldErrors>({});
  const [measurementErrors, setMeasurementErrors] = useState<FieldErrors>({});
  const [measurementCount, setMeasurementCount] = useState(0);

  const data = store.get();

  function handleCreateEvent() {
    const input = { siteId, eventType, operationDate, occurredAt, materialCategory, stage };
    const errors = validateEventInput(input);
    setEventErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const eventId = nextDemoEventId(data);
    const now = new Date().toISOString();
    store.addEvent({
      eventId,
      siteId,
      eventType: eventType as EventType,
      stage,
      operationDate,
      occurredAt,
      recordedAt: now,
      materialCategory,
      note: "Dibuat via Capture Cepat demo (sintetis).",
    });
    setCreatedEventId(eventId);
    setMeasurementCount(0);
  }

  function handleAddMeasurement() {
    if (!createdEventId) return;
    const input = { observationStatus, gross, tare, net, massBasis, method };
    const errors = validateMeasurementInput(input);
    setMeasurementErrors(errors);
    if (Object.keys(errors).length > 0) return;

    store.addMeasurement(
      measurementFromInput({
        measurementId: nextDemoMeasurementId(data),
        eventId: createdEventId,
        observedAt: new Date().toISOString(),
        originalText: observationStatus === "measured_zero" ? "0" : gross,
        massBasis: massBasis as never,
        observationStatus,
        estimationStatus,
        method,
        provenance:
          provenance || "Input manual demo (fiktif), tanpa sumber lapangan nyata",
        gross,
        tare,
        net,
      }),
    );
    setMeasurementCount((c) => c + 1);
    setGross("");
    setTare("");
    setNet("");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Capture Cepat</h1>
        <p className="mt-1 text-sm text-slate-600">
          Buat satu event demo lalu tambahkan beberapa pengukuran pada event yang sama.
          Menambah pengukuran <strong>tidak</strong> membuat event baru.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>1. Buat event (sintetis)</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateEvent();
            }}
          >
            <div>
              <Label htmlFor="cap-site">Site (fiktif)</Label>
              <Select
                id="cap-site"
                value={siteId}
                aria-invalid={!!eventErrors.siteId}
                aria-describedby={eventErrors.siteId ? "err-cap-site" : undefined}
                onChange={(e) => setSiteId(e.target.value)}
              >
                <option value="">— Pilih site —</option>
                {data.sites.map((s) => (
                  <option key={s.siteId} value={s.siteId}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <FieldError id="err-cap-site">{eventErrors.siteId}</FieldError>
            </div>
            <div>
              <Label htmlFor="cap-type">Stream/tipe kejadian</Label>
              <Select
                id="cap-type"
                value={eventType}
                aria-invalid={!!eventErrors.eventType}
                aria-describedby={eventErrors.eventType ? "err-cap-type" : undefined}
                onChange={(e) => setEventType(e.target.value as EventType | "")}
              >
                <option value="">— Pilih tipe —</option>
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EVENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
              <FieldError id="err-cap-type">{eventErrors.eventType}</FieldError>
            </div>
            <div>
              <Label htmlFor="cap-stage">Tahap operasional</Label>
              <Input
                id="cap-stage"
                value={stage}
                placeholder="mis. serving"
                aria-invalid={!!eventErrors.stage}
                aria-describedby={eventErrors.stage ? "err-cap-stage" : undefined}
                onChange={(e) => setStage(e.target.value)}
              />
              <FieldError id="err-cap-stage">{eventErrors.stage}</FieldError>
            </div>
            <div>
              <Label htmlFor="cap-category">Kategori material</Label>
              <Input
                id="cap-category"
                value={materialCategory}
                placeholder="mis. rice_mixed_meal"
                aria-invalid={!!eventErrors.materialCategory}
                aria-describedby={eventErrors.materialCategory ? "err-cap-cat" : undefined}
                onChange={(e) => setMaterialCategory(e.target.value)}
              />
              <FieldError id="err-cap-cat">{eventErrors.materialCategory}</FieldError>
            </div>
            <div>
              <Label htmlFor="cap-date">Tanggal operasi</Label>
              <Input
                id="cap-date"
                type="date"
                value={operationDate}
                aria-invalid={!!eventErrors.operationDate}
                aria-describedby={eventErrors.operationDate ? "err-cap-date" : undefined}
                onChange={(e) => setOperationDate(e.target.value)}
              />
              <FieldError id="err-cap-date">{eventErrors.operationDate}</FieldError>
            </div>
            <div>
              <Label htmlFor="cap-occurred">Waktu kejadian</Label>
              <Input
                id="cap-occurred"
                type="datetime-local"
                value={occurredAt}
                aria-invalid={!!eventErrors.occurredAt}
                aria-describedby={eventErrors.occurredAt ? "err-cap-occ" : undefined}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
              <FieldError id="err-cap-occ">{eventErrors.occurredAt}</FieldError>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Buat event</Button>
            </div>
          </form>

          {createdEventId && (
            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p>
                Event demo dibuat:{" "}
                <span className="font-mono font-semibold">{createdEventId}</span>{" "}
                <Badge tone="info">belum tersimpan permanen</Badge>
              </p>
              <p className="mt-1">
                Jumlah pengukuran pada event ini: <strong>{measurementCount}</strong>.{" "}
                <Link
                  to={`/events/${createdEventId}`}
                  className="font-semibold text-sky-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                >
                  Lihat detail event
                </Link>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card aria-disabled={!createdEventId}>
        <CardHeader>
          <CardTitle>2. Tambah pengukuran pada event yang sama</CardTitle>
        </CardHeader>
        <CardContent>
          {!createdEventId ? (
            <p className="text-sm text-slate-500">
              Buat event terlebih dahulu (langkah 1).
            </p>
          ) : (
            <form
              noValidate
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleAddMeasurement();
              }}
            >
              <div>
                <Label htmlFor="msr-basis">Mass basis (provisional)</Label>
                <Select
                  id="msr-basis"
                  value={massBasis}
                  aria-invalid={!!measurementErrors.massBasis}
                  aria-describedby={measurementErrors.massBasis ? "err-msr-basis" : undefined}
                  onChange={(e) => setMassBasis(e.target.value)}
                >
                  <option value="">— Pilih basis —</option>
                  {MASS_BASES.map((b) => (
                    <option key={b} value={b}>
                      {MASS_BASIS_LABELS[b]}
                    </option>
                  ))}
                </Select>
                <FieldError id="err-msr-basis">{measurementErrors.massBasis}</FieldError>
              </div>
              <div>
                <Label htmlFor="msr-status">Status observasi</Label>
                <Select
                  id="msr-status"
                  value={observationStatus}
                  onChange={(e) => setObservationStatus(e.target.value as ObservationStatus)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {OBSERVATION_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-slate-500">
                  Missing / tidak diukur ≠ nol terukur.
                </p>
              </div>
              <div>
                <Label htmlFor="msr-estimation">Status estimasi</Label>
                <Select
                  id="msr-estimation"
                  value={estimationStatus}
                  onChange={(e) =>
                    setEstimationStatus(e.target.value as "weighed" | "estimated")
                  }
                >
                  <option value="weighed">Ditimbang</option>
                  <option value="estimated">Estimasi</option>
                </Select>
                <p className="mt-1 text-xs text-slate-500">
                  Estimasi tidak disamakan dengan hasil timbangan.
                </p>
              </div>
              <div>
                <Label htmlFor="msr-method">Metode</Label>
                <Input
                  id="msr-method"
                  value={method}
                  placeholder="mis. digital_scale"
                  aria-invalid={!!measurementErrors.method}
                  aria-describedby={measurementErrors.method ? "err-msr-method" : undefined}
                  onChange={(e) => setMethod(e.target.value)}
                />
                <FieldError id="err-msr-method">{measurementErrors.method}</FieldError>
              </div>
              <div>
                <Label htmlFor="msr-gross">Gross (kg)</Label>
                <Input
                  id="msr-gross"
                  inputMode="decimal"
                  value={gross}
                  disabled={observationStatus !== "observed"}
                  aria-invalid={!!measurementErrors.massValues}
                  aria-describedby="msr-mass-help"
                  onChange={(e) => setGross(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="msr-tare">Tare (kg)</Label>
                <Input
                  id="msr-tare"
                  inputMode="decimal"
                  value={tare}
                  disabled={observationStatus !== "observed"}
                  aria-invalid={!!measurementErrors.massValues}
                  aria-describedby="msr-mass-help"
                  onChange={(e) => setTare(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="msr-net">Net (kg)</Label>
                <Input
                  id="msr-net"
                  inputMode="decimal"
                  value={net}
                  disabled={observationStatus === "missing" || observationStatus === "not_measured"}
                  aria-invalid={!!measurementErrors.net || !!measurementErrors.massValues}
                  aria-describedby={measurementErrors.net ? "err-msr-net" : "msr-mass-help"}
                  onChange={(e) => setNet(e.target.value)}
                />
                <FieldError id="err-msr-net">{measurementErrors.net}</FieldError>
              </div>
              <div className="sm:col-span-2">
                <p id="msr-mass-help" className="text-xs text-slate-500">
                  Untuk status terukur: net = gross − tare. Massa negatif dan gross &lt; tare
                  ditolak. Nilai asli yang diketik dipertahankan apa adanya.
                </p>
                <FieldError id="err-msr-mass-values">
                  {measurementErrors.massValues}
                </FieldError>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="msr-provenance">Provenance (opsional)</Label>
                <Textarea
                  id="msr-provenance"
                  value={provenance}
                  placeholder="mis. sumber alat, kondisi pengukuran (fiktif)"
                  onChange={(e) => setProvenance(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit">Tambah pengukuran</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
