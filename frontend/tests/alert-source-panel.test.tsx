import { act, cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AlertSourcePanel from "@/components/alerts/AlertSourcePanel";
import { readBackendEvent, readBackendMeasurements } from "@/backend/client";
import { readDelivery, type Delivery } from "@/backend/p1";
import { invalidateAuth, selectSite } from "@/backend/auth";
import { prepareSession, sessionA } from "./backend-auth-fixture";
import fixture from "./fixtures/backend-detail.json";
import type { BackendEvent, BackendMeasurement } from "@/backend/contract";
import type { AlertSource } from "@/components/alerts/useAlertSource";

vi.mock("@/backend/client", () => ({ readBackendEvent: vi.fn(), readBackendMeasurements: vi.fn() }));
vi.mock("@/backend/p1", () => ({ readDelivery: vi.fn() }));
const E = fixture.event.event_id;
const B = "33333333-3333-4333-8333-333333333334";
const SITE_B = "22222222-2222-4222-8222-222222222223";
const owner = { ...sessionA, sites: [sessionA.sites[0], { ...sessionA.sites[0], site_id: SITE_B }] };
const event = fixture.event as BackendEvent;
const measurement = fixture.measurement as BackendMeasurement;
const alert: AlertSource = { recommendation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  organization_id: event.organization_id, site_id: event.site_id, target_type: "waste_event", target_ref: E,
  rule_code: "event_coverage_insufficient", rule_version: "p2-rules-provisional-v0", recorded_at: "2026-11-01T00:00:00Z" };
const other = { ...alert, recommendation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", target_ref: B };
const delivery: Delivery = { delivery_id: E, organization_id: event.organization_id, site_id: event.site_id,
  from_site_id: event.site_id, to_site_id: SITE_B, run_id: null, dispatch_quantity: "0.800", received_quantity: "0.700",
  original_unit: "kg", mass_basis: "cooked", reconciliation_status: "needs_review",
  dispatched_at: "2026-11-01T08:00:00+08:00", received_at: "2026-11-01T08:05:00+08:00", recorded_at: "2026-11-01T00:01:00Z" };
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: Error) => void;
  const promise = new Promise<T>((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
const view = (a = alert) => <MemoryRouter><AlertSourcePanel alert={a} /></MemoryRouter>;
beforeEach(async () => { vi.resetAllMocks(); await prepareSession(owner);
  vi.mocked(readBackendEvent).mockResolvedValue(event); vi.mocked(readBackendMeasurements).mockResolvedValue([]);
  vi.mocked(readDelivery).mockResolvedValue(delivery); });
afterEach(() => { cleanup(); invalidateAuth(); });

it("shows two original observations of one event, keeping zero distinct from null", async () => {
  vi.mocked(readBackendMeasurements).mockResolvedValue([
    { ...measurement, gross: "0", tare: "0", net: "0", observation_status: "measured_zero", original_value_lexeme: "0.000" },
    { ...measurement, measurement_id: B, gross: null, tare: null, net: null, observation_status: "missing" },
  ]);
  render(view()); expect(await screen.findByText(/1 kejadian · 2 observasi/)).toBeVisible();
  expect(screen.getByText("measured_zero")).toBeVisible(); expect(screen.getByText("missing")).toBeVisible();
  expect(screen.getAllByText("0 kg")).toHaveLength(3); expect(screen.getAllByText("Belum dicatat (null)").length).toBeGreaterThanOrEqual(3);
  expect(screen.getByText("0.000")).toBeVisible(); expect(screen.getByText(/bukan snapshot database atomik/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Buka rincian kejadian" })).toHaveAttribute("href", `/backend-demo/events/${E}`);
  expect(vi.mocked(fetch).mock.calls.every(([,o]) => !o?.method || o.method === "GET")).toBe(true);
});
it("preserves long decimals, mixed bases, estimation, provenance and both timestamps without totals", async () => {
  vi.mocked(readBackendMeasurements).mockResolvedValue([measurement,
    { ...measurement, measurement_id: B, observation_status: "estimated", mass_basis: "raw", net: "2.4000", original_value_lexeme: "2.4000" }]);
  render(view()); const rows = await screen.findAllByRole("listitem");
  expect(within(rows[0]).getByText("Berat bersih tercatat (net)").nextElementSibling).toHaveTextContent(measurement.net+" kg");
  for (const text of ["estimated", "raw", "as_served", alert.recorded_at]) expect(screen.getByText(text)).toBeVisible();
  expect(screen.getAllByText(measurement.provenance)).toHaveLength(2);
  expect(screen.getAllByText(measurement.recorded_at)).toHaveLength(2);
  expect(screen.getByText(/tidak dapat dipastikan apa yang berbeda/)).toBeVisible();
  expect(screen.queryByText(/total massa|rata-rata|alert tidak berlaku/i)).not.toBeInTheDocument();
});
it("distinguishes no recorded measurement from measured zero", async () => {
  render(view()); expect(await screen.findByText(/Belum ada pengukuran tercatat; bukan pengukuran nol/)).toBeVisible();
  expect(screen.getByText(/1 kejadian · 0 observasi/)).toBeVisible(); expect(screen.queryByText("0 kg")).not.toBeInTheDocument();
});
it.each(["missing", "not_measured"] as const)("does not invent mass for %s", async observation_status => {
  vi.mocked(readBackendMeasurements).mockResolvedValue([{ ...measurement, observation_status, net: null, gross: null, tare: null }]);
  render(view()); expect(await screen.findByText(observation_status)).toBeVisible(); expect(screen.queryByText("0 kg")).not.toBeInTheDocument();
});
it("renders recorded delivery values and server reconciliation without a derived difference", async () => {
  render(view({ ...alert, target_type: "delivery" })); expect(await screen.findByText("0.800 kg")).toBeVisible();
  for (const text of ["0.700 kg", "cooked", "needs_review", delivery.recorded_at]) expect(screen.getByText(text)).toBeVisible();
  expect(screen.queryByText("0.1 kg")).not.toBeInTheDocument(); expect(readBackendEvent).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "Buka rincian pengiriman" })).toHaveAttribute("href", `/backend-distribution?delivery=${E}`);
});
it("preserves unknown receiving values in the source component without fabricating a zero", async () => {
  vi.mocked(readDelivery).mockResolvedValue({ ...delivery, received_quantity: null, received_at: null, reconciliation_status: "not_received" });
  render(view({ ...alert, target_type: "delivery" })); expect(await screen.findByText("not_received")).toBeVisible();
  expect(screen.getAllByText("Belum dicatat (null)")).toHaveLength(2); expect(screen.queryByText("0 kg")).not.toBeInTheDocument();
});
it.each(["meal_service", "disposition", "unrecognized"])("explicitly marks unsupported %s without GET", target_type => {
  render(view({ ...alert, target_type })); expect(screen.getByText(/Tampilan sumber belum tersedia/)).toBeVisible();
  expect(readBackendEvent).not.toHaveBeenCalled(); expect(readDelivery).not.toHaveBeenCalled();
});
it("rejects an invalid target UUID before any source request", () => {
  render(view({ ...alert, target_ref: "not-a-uuid" })); expect(screen.getByText(/Tampilan sumber belum tersedia/)).toBeVisible();
  expect(readBackendEvent).not.toHaveBeenCalled();
});
it.each([401,403,404,503])("does not reveal response details on HTTP %s", async status => {
  vi.mocked(readBackendEvent).mockRejectedValue(new Error(`${status}: private foreign title`));
  render(view()); expect(await screen.findByRole("alert")).toHaveTextContent("Sumber tidak dapat dibaca");
  expect(screen.queryByText(/private foreign title/)).not.toBeInTheDocument();
});
it("rejects foreign or mismatched event/measurement identities", async () => {
  vi.mocked(readBackendMeasurements).mockResolvedValue([{ ...measurement, event_id: B, provenance: "FOREIGN SECRET" }]);
  render(view()); expect(await screen.findByRole("alert")).toBeVisible(); expect(screen.queryByText("FOREIGN SECRET")).not.toBeInTheDocument();
});
it("rejects a delivery unrelated to the active site", async () => {
  vi.mocked(readDelivery).mockResolvedValue({ ...delivery, from_site_id: B, to_site_id: B });
  render(view({ ...alert, target_type: "delivery" })); expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.queryByText("0.800 kg")).not.toBeInTheDocument();
});
it("never requests a source for an alert from another site", () => {
  render(view({ ...alert, site_id: SITE_B })); expect(screen.getByRole("status")).toHaveTextContent("Konteks akses berubah");
  expect(screen.queryByText(alert.recorded_at)).not.toBeInTheDocument(); expect(readBackendEvent).not.toHaveBeenCalled();
});
it.each(["resolve", "reject"] as const)("keeps B after late A %s, including source timestamp and stale error", async outcome => {
  const a=deferred<BackendEvent>();vi.mocked(readBackendEvent).mockReturnValueOnce(a.promise).mockResolvedValueOnce({ ...event,event_id:B,event_type:"actual_loss_discard" });
  const ui=render(view()); ui.rerender(view(other)); expect(await screen.findByText(B)).toBeVisible();
  await act(async () => { if(outcome==="resolve") a.resolve(event); else a.reject(new Error("STALE ERROR")); });
  expect(screen.getByText(B)).toBeVisible();expect(screen.queryByText(E)).not.toBeInTheDocument();expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("rejects old A after alert A to B to A, even when abort is ignored", async () => {
  const first=deferred<BackendEvent>();const second=deferred<BackendEvent>();const third=deferred<BackendEvent>();
  vi.mocked(readBackendEvent).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
  const ui=render(view());ui.rerender(view(other));ui.rerender(view());
  await act(async()=>third.resolve({ ...event,recorded_at:"2026-11-10T00:00:00Z" }));await screen.findByText(E);
  await act(async()=>{first.resolve({ ...event,recorded_at:"2020-01-01T00:00:00Z" });second.reject(new Error("OLD B"));});
  expect(screen.getByText("2026-11-10T00:00:00Z")).toBeVisible(); expect(screen.queryByText("2020-01-01T00:00:00Z")).not.toBeInTheDocument();expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(readBackendEvent).toHaveBeenCalledTimes(3);
});
it("synchronously hides old private data across site A to B to A and discards late A", async () => {
  const old=deferred<BackendEvent>();vi.mocked(readBackendEvent).mockReturnValueOnce(old.promise).mockResolvedValueOnce(event);
  render(view());act(()=>selectSite(SITE_B));expect(screen.queryByText(alert.recorded_at)).not.toBeInTheDocument();
  act(()=>selectSite(event.site_id));await screen.findByText(E);
  await act(async()=>old.reject(new Error("OLD SITE A")));expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(readBackendEvent).toHaveBeenCalledTimes(2);
});
it("clears source and alert metadata on logout and does not reuse the old login request", async () => {
  const old=deferred<BackendEvent>();vi.mocked(readBackendEvent).mockReturnValueOnce(old.promise).mockResolvedValueOnce(event);
  render(view());act(()=>invalidateAuth());expect(screen.queryByText(alert.recorded_at)).not.toBeInTheDocument();
  await act(async()=>prepareSession(owner));await screen.findByText(E);
  await act(async()=>old.resolve({ ...event,site_id:SITE_B }));expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("aborts on unmount and ignores a late response", async () => {
  const old=deferred<BackendEvent>();vi.mocked(readBackendEvent).mockReturnValueOnce(old.promise);
  const ui=render(view());const signal=vi.mocked(readBackendEvent).mock.calls[0][1];ui.unmount();expect(signal.aborted).toBe(true);
  await act(async()=>old.resolve(event));expect(screen.queryByRole("region")).not.toBeInTheDocument();
});
it("reads sources as an authorized reader without any mutation", async () => {
  await prepareSession({ ...sessionA,sites:[{...sessionA.sites[0],permissions:["event.read","measurement.read","alert.read","delivery.read"]}] });
  render(view());expect(await screen.findByText(E)).toBeVisible();
  expect(vi.mocked(fetch).mock.calls.every(([,o])=>!o?.method||o.method==="GET")).toBe(true);
});
