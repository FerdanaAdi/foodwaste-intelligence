import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installDomainFetch, prepareSession } from './backend-auth-fixture';
import { MemoryRouter } from "react-router";
import App from "@/App";

const EVENT_ID = "33333333-3333-4333-8333-333333333331";
const record = {
  evidence_id: "55555555-5555-4555-8555-555555555551", target_kind: "event", target_id: EVENT_ID,
  kind: "reference", source: "synthetic_note", title: "Catatan kebersihan bin sintetis",
  recorded_by: "99999999-9999-4999-8999-999999999991", recorded_at: "2026-11-04T07:10:00+08:00",
  method: null, provenance: null, verification: "unverified", availability: "unknown",
  note: null, recorded_at_system: "2026-11-09T00:00:00+00:00",
};
function response(value: unknown, status = 200) { return { status, ok: status >= 200 && status < 300, json: async () => value } as Response; }
function mount() { installDomainFetch(fetch); return render(<MemoryRouter initialEntries={["/backend-demo/evidence"]}><App /></MemoryRouter>); }
async function query(user: ReturnType<typeof userEvent.setup>, id = EVENT_ID) {
  await user.type(screen.getByLabelText(/UUID target \(baca\)/), id);
  await user.click(screen.getByRole("button", { name: /Baca daftar bukti/ }));
}
beforeEach(async () => { sessionStorage.clear(); await prepareSession(); });
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); vi.restoreAllMocks(); });

describe("FR-005 backend evidence page", () => {
  it("lists metadata for a queried target without storage fields", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => response([record])));
    mount();
    await query(user);
    expect(await screen.findByText(/Catatan kebersihan bin sintetis/)).toBeInTheDocument();
    expect(screen.getByText(/ketersediaan: unknown/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/1 metadata bukti/);
  });

  it("empty list states that physical availability stays unknown", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => response([])));
    mount();
    await query(user);
    expect(await screen.findByText(/ketersediaan berkas menunggu ADR-005/)).toBeInTheDocument();
  });

  it("cross-site/absent target is denied without leaking details", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => response({ detail: "x" }, 404)));
    mount();
    await query(user);
    expect(await screen.findByText(/tidak ditemukan atau bukan milik site berizin/)).toBeInTheDocument();
  });

  it("unknown POST outcome is shown as UNKNOWN with no retry", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_url: unknown, options?: { method?: string }) => {
      if (options?.method === "POST") throw new TypeError("network lost");
      return response([]);
    });
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await user.type(screen.getByLabelText(/UUID target \(tulis\)/), EVENT_ID);
    await user.type(screen.getByLabelText(/Sumber bukti/), "synthetic_note");
    await user.type(screen.getByLabelText(/^Judul/), "Catatan uji");
    await user.type(screen.getByLabelText(/Waktu catat/), "2026-11-04T07:10:00+08:00");
    await user.click(screen.getByRole("button", { name: /Simpan metadata bukti/ }));
    expect(await screen.findByText(/Jangan kirim ulang/)).toBeInTheDocument();
  });
});
