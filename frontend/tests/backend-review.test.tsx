import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installDomainFetch, prepareSession } from './backend-auth-fixture';
import { MemoryRouter } from "react-router";
import App from "@/App";

const EVENT_ID = "33333333-3333-4333-8333-333333333331";
const decision = {
  review_decision_id: "66666666-6666-4666-8666-666666666661", target_kind: "event",
  target_id: EVENT_ID, decision: "request_correction",
  actor_id: "99999999-9999-4999-8999-999999999991", recorded_at: "2026-11-09T00:00:00+00:00",
  rationale: "Salah ketik desimal", source: "synthetic_reviewer", provenance: "synthetic_fixture",
  recorded_at_system: "2026-11-09T00:00:00+00:00",
};
const proposal = {
  correction_record_id: "77777777-7777-4777-8777-777777777771", target_kind: "event",
  target_id: EVENT_ID, original_values: { occurred_at: "2026-11-04T07:00:00+08:00" },
  proposed_values: { occurred_at: "2026-11-04T07:30:00+08:00" },
  actor_id: "99999999-9999-4999-8999-999999999991", recorded_at: "2026-11-09T00:00:00+00:00",
  reason: "Salah ketik desimal", source: "synthetic_reviewer", provenance: "synthetic_fixture",
  review_decision_id: decision.review_decision_id, state: "proposed",
  recorded_at_system: "2026-11-09T00:00:00+00:00",
};
function response(value: unknown, status = 200) { return { status, ok: status >= 200 && status < 300, json: async () => value } as Response; }
function mount() { installDomainFetch(fetch); return render(<MemoryRouter initialEntries={["/backend-demo/review"]}><App /></MemoryRouter>); }
beforeEach(async () => { sessionStorage.clear(); await prepareSession(); });
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); vi.restoreAllMocks(); });

describe("FR-006 backend review page (proposal-only)", () => {
  it("shows append-only history with original and proposed snapshots", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => response({ target_kind: "event", target_id: EVENT_ID,
      decisions: [decision], proposals: [proposal] })));
    mount();
    await user.type(screen.getByLabelText(/UUID target \(baca\)/), EVENT_ID);
    await user.click(screen.getByRole("button", { name: /Baca riwayat review/ }));
    expect(await screen.findByText(/request_correction/)).toBeInTheDocument();
    expect(screen.getByText(/state: proposed \(PROVISIONAL\)/)).toBeInTheDocument();
    expect(screen.getByText(/Asal:/)).toHaveTextContent("07:00:00");
    expect(screen.getByText(/Usulan:/)).toHaveTextContent("07:30:00");
  });

  it("empty history is not interpreted as validated", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => response({ target_kind: "event", target_id: EVENT_ID,
      decisions: [], proposals: [] })));
    mount();
    await user.type(screen.getByLabelText(/UUID target \(baca\)/), EVENT_ID);
    await user.click(screen.getByRole("button", { name: /Baca riwayat review/ }));
    expect(await screen.findByText(/bukan status 'validated'/)).toBeInTheDocument();
  });

  it("saves a proposal and labels it as not-yet-effective", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_url: unknown, options?: { method?: string; body?: string }) => {
      if (options?.method === "POST") return response({ ...decision, correction_proposal: proposal }, 201);
      return response({ target_kind: "event", target_id: EVENT_ID, decisions: [], proposals: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await user.selectOptions(screen.getAllByLabelText(/Jenis target/)[1]!, "measurement");
    await user.type(screen.getByLabelText(/UUID target \(tulis\)/), EVENT_ID);
    await user.type(screen.getByLabelText(/^Alasan/), "Salah ketik desimal");
    await user.type(screen.getByLabelText(/Sumber review/), "synthetic_reviewer");
    await user.type(screen.getByLabelText(/Provenance/), "synthetic_fixture");
    await user.type(screen.getByLabelText(/Usulan net baru/), "1.90");
    await user.click(screen.getByRole("button", { name: /Simpan usulan/ }));
    expect(await screen.findByText(/PROPOSAL — belum efektif/)).toBeInTheDocument();
    const body = JSON.parse(fetchMock.mock.calls.find(c => c[1]?.method === "POST")![1]!.body!);
    expect(body.proposed_values).toEqual({ net: "1.90" });
  });

  it("cross-site target stays concealed with no data disclosure", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => response({ detail: "x" }, 404)));
    mount();
    await user.type(screen.getByLabelText(/UUID target \(baca\)/), EVENT_ID);
    await user.click(screen.getByRole("button", { name: /Baca riwayat review/ }));
    expect(await screen.findByText(/tidak ditemukan atau bukan milik site berizin/)).toBeInTheDocument();
  });
});
