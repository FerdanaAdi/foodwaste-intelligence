import { useState } from "react";
import { Link } from "react-router";
import { useDemoStore } from "@/data/demoStoreContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Label, Select } from "@/components/ui/Form";
import {
  EVENT_TYPE_LABELS,
  OBSERVATION_STATUS_LABELS,
  type ObservationStatus,
} from "@/domain/types";

type StatusFilter = "all" | ObservationStatus | "unmeasured";

export default function EventLedgerPage() {
  const store = useDemoStore();
  const [siteId, setSiteId] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const data = store.get();
  const sites = data.sites;

  const visibleEvents = data.events.filter((e) => {
    if (siteId !== "all" && e.siteId !== siteId) return false;
    if (status === "all") return true;
    if (status === "unmeasured") return store.measurementsForEvent(e.eventId).length === 0;
    return store
      .measurementsForEvent(e.eventId)
      .some((m) => m.observationStatus === status);
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Ledger Event</h1>
        <p className="mt-1 text-sm text-slate-600">
          Satu baris = satu kejadian dengan event ID stabil. Detail membuka riwayat pengukuran
          terpisah; pengukuran ganda tidak menggandakan event.
        </p>
      </header>

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="filter-site">Filter site</Label>
            <Select
              id="filter-site"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
            >
              <option value="all">Semua site (fiktif)</option>
              {sites.map((s) => (
                <option key={s.siteId} value={s.siteId}>
                  {s.name} ({s.siteId})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="filter-status">Filter status observasi</Label>
            <Select
              id="filter-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
            >
              <option value="all">Semua status</option>
              <option value="unmeasured">Tanpa pengukuran</option>
              {(Object.keys(OBSERVATION_STATUS_LABELS) as ObservationStatus[]).map((s) => (
                <option key={s} value={s}>
                  {OBSERVATION_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {visibleEvents.length} event (data fiktif)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">
                Daftar event demo dengan tautan ke detail event
              </caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Event ID</th>
                  <th scope="col" className="px-4 py-3">Site</th>
                  <th scope="col" className="px-4 py-3">Stream/tipe</th>
                  <th scope="col" className="px-4 py-3">Tanggal operasi</th>
                  <th scope="col" className="px-4 py-3">Pengukuran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleEvents.map((e) => {
                  const ms = store.measurementsForEvent(e.eventId);
                  const tone: BadgeTone =
                    ms.length === 0
                      ? "warn"
                      : ms.some((m) => m.observationStatus === "missing")
                        ? "danger"
                        : "info";
                  return (
                    <tr key={e.eventId} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link
                          to={`/events/${e.eventId}`}
                          className="font-semibold text-sky-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                        >
                          {e.eventId}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {sites.find((s) => s.siteId === e.siteId)?.name ?? e.siteId}
                      </td>
                      <td className="px-4 py-3">{EVENT_TYPE_LABELS[e.eventType]}</td>
                      <td className="px-4 py-3">{e.operationDate}</td>
                      <td className="px-4 py-3">
                        <Badge tone={tone}>
                          {ms.length === 0
                            ? "Tanpa pengukuran"
                            : `${ms.length} pengukuran`}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
                {visibleEvents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      Tidak ada event yang cocok dengan filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
