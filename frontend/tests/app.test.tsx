import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import App from "@/App";

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
}
afterEach(() => vi.unstubAllGlobals());

async function fillEventForm(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText(/site/i), "SITE-DEMO-01");
  await user.selectOptions(screen.getByLabelText(/stream\/tipe/i), "plate_leftover_stream");
  await user.type(screen.getByLabelText(/tahap operasional/i), "serving");
  await user.type(screen.getByLabelText(/kategori material/i), "rice_mixed_meal");
  await user.type(screen.getByLabelText(/tanggal operasi/i), "2026-11-04");
  await user.type(screen.getByLabelText(/waktu kejadian/i), "2026-11-04T12:00");
}

async function fillMeasurementForm(
  user: ReturnType<typeof userEvent.setup>,
  values: { gross?: string; tare?: string; net?: string } = {},
) {
  await user.selectOptions(screen.getByLabelText(/mass basis/i), "cooked");
  await user.selectOptions(screen.getByLabelText(/status observasi/i), "observed");
  await user.selectOptions(screen.getByLabelText(/status estimasi/i), "weighed");
  await user.type(screen.getByLabelText(/^metode$/i), "digital_scale");
  await user.type(screen.getByLabelText(/^gross \(kg\)$/i), values.gross ?? "2.1");
  await user.type(screen.getByLabelText(/^tare \(kg\)$/i), values.tare ?? "0.25");
  await user.type(screen.getByLabelText(/^net \(kg\)$/i), values.net ?? "1.85");
}

describe("App shell", () => {
  it("offers persistent capture while identifying dashboard data as in-memory", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 401, ok: false, headers: new Headers(), json: async () => ({ detail: 'authentication required' }) })));
    const user = userEvent.setup();
    renderApp();
    expect(screen.getByText(/Kartu dan ledger di bawah tetap memakai DemoStore/)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Mulai demo persisten' }));
    expect(await screen.findByRole('heading', { name: 'Masuk backend sintetis' })).toBeInTheDocument();
  });
  it("shows the synthetic demo banner", () => {
    renderApp();
    // Banner appears in the top strip and on the dashboard card.
    expect(screen.getAllByText("SYNTHETIC / DEMO — NOT OFFICIAL BGN SYSTEM").length).toBeGreaterThan(0);
  });

  it("dashboard shows counters and held KPI note, links navigate", async () => {
    const user = userEvent.setup();
    renderApp();
    expect(screen.getByRole("heading", { name: "Dashboard Mutu Data" })).toBeInTheDocument();
    expect(screen.getAllByText(/HELD/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("link", { name: /Ledger Event/ }));
    expect(screen.getByRole("heading", { name: "Ledger Event" })).toBeInTheDocument();
  });
});

describe("Quick Capture — two measurements on one event", () => {
  it("adds two measurements without creating a second event", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("link", { name: /Capture Cepat/ }));

    await fillEventForm(user);
    await user.click(screen.getByRole("button", { name: "Buat event" }));

    expect(screen.getByText(/Event demo dibuat:/)).toBeInTheDocument();
    const status = screen.getByText(/Jumlah pengukuran pada event ini:/);
    expect(within(status).getByText("0")).toBeInTheDocument();

    // first measurement
    await fillMeasurementForm(user);
    await user.click(screen.getByRole("button", { name: /Tambah pengukuran/i }));
    expect(within(screen.getByText(/Jumlah pengukuran pada event ini:/)).getByText("1")).toBeInTheDocument();

    // second measurement on the SAME event
    await fillMeasurementForm(user, { gross: "1", tare: "0.5", net: "0.5" });
    await user.click(screen.getByRole("button", { name: /Tambah pengukuran/i }));

    expect(within(screen.getByText(/Jumlah pengukuran pada event ini:/)).getByText("2")).toBeInTheDocument();
    // still the same single event id referenced
    expect(screen.getAllByText(/EVT-DEMO-2026-0004/i).length).toBeGreaterThan(0);
  });

  it("rejects invalid mass: net != gross - tare", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("link", { name: /Capture Cepat/ }));
    await fillEventForm(user);
    await user.click(screen.getByRole("button", { name: "Buat event" }));

    await fillMeasurementForm(user, { net: "9" });
    await user.click(screen.getByRole("button", { name: /Tambah pengukuran/i }));

    expect(screen.getByText(/harus sama dengan gross − tare/i)).toBeInTheDocument();
    expect(within(screen.getByText(/Jumlah pengukuran pada event ini:/)).getByText("0")).toBeInTheDocument();
  });

  it("rejects negative mass", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("link", { name: /Capture Cepat/ }));
    await fillEventForm(user);
    await user.click(screen.getByRole("button", { name: "Buat event" }));

    await fillMeasurementForm(user, { gross: "-2", tare: "0.25", net: "-2.25" });
    await user.click(screen.getByRole("button", { name: /Tambah pengukuran/i }));

    expect(screen.getByText(/tidak boleh negatif/i)).toBeInTheDocument();
  });
});

describe("Event Detail", () => {
  it("opens demo event with separate measurement history", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("link", { name: /Ledger Event/ }));
    await user.click(screen.getByRole("link", { name: "EVT-DEMO-2026-0001" }));

    expect(screen.getByRole("heading", { name: "EVT-DEMO-2026-0001" })).toBeInTheDocument();
    expect(screen.getByText(/Riwayat pengukuran \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/MSR-DEMO-0001/)).toBeInTheDocument();
    expect(screen.getByText(/MSR-DEMO-0002/)).toBeInTheDocument();
  });

  it("shows the unmeasured event without pretending it is zero", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("link", { name: /Ledger Event/ }));
    await user.click(screen.getByRole("link", { name: "EVT-DEMO-2026-0003" }));

    expect(screen.getByText(/Belum ada pengukuran untuk event ini/)).toBeInTheDocument();
    expect(screen.getByText(/Ini bukan nol terukur/)).toBeInTheDocument();
  });
});

describe("Ledger filter", () => {
  it("filters by observation status=missing", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("link", { name: /Ledger Event/ }));
    await user.selectOptions(screen.getByLabelText(/filter status observasi/i), "missing");

    const list = screen.getByRole("table");
    expect(within(list).getAllByText(/EVT-DEMO-2026-0002/).length).toBeGreaterThan(0);
    expect(within(list).queryByText(/EVT-DEMO-2026-0001/)).not.toBeInTheDocument();
  });
});

describe("Export preview", () => {
  it("lists traceable rows and banner, no totals", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("link", { name: /Pratinjau Ekspor CSV/ }));

    expect(screen.getByRole("heading", { name: "Pratinjau Ekspor CSV" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Isi pratinjau CSV/i)).toHaveTextContent("EVT-DEMO-2026-0001");
    expect(screen.getByLabelText(/Isi pratinjau CSV/i)).toHaveTextContent("SYNTHETIC / DEMO EXPORT");
  });
});

describe("Review & audit preview", () => {
  it("requires a review choice before saving", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("link", { name: /Pratinjau Review & Audit/ }));

    const save = screen.getAllByRole("button", { name: /Simpan tandau demo/i })[0];
    await user.click(save);
    expect(screen.getAllByText(/Pilih status review terlebih dahulu/i)[0]).toBeInTheDocument();
  });
});
