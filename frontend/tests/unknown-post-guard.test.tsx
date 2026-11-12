import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installDomainFetch, prepareSession } from './backend-auth-fixture';
import { MemoryRouter } from "react-router";
import App from "@/App";
import { readEvidencePending, markEvidencePending, clearEvidencePending,
         createBackendEvidence } from "@/backend/evidence";
import { readReviewPending, markReviewPending, clearReviewPending } from "@/backend/review";
import { invalidateAuth } from "@/backend/auth";

const EVENT_ID = "33333333-3333-4333-8333-333333333331";
const OTHER_EVENT = "33333333-3333-4333-8333-333333333332";
const EVIDENCE_RECORD = {
  evidence_id: "55555555-5555-4555-8555-555555555551", target_kind: "event", target_id: EVENT_ID,
  kind: "reference", source: "synthetic_note", title: "Catatan uji",
  recorded_by: "99999999-9999-4999-8999-999999999991", recorded_at: "2026-11-06T12:10:00+08:00",
  method: null, provenance: null, verification: "unverified", availability: "unknown",
  note: null, recorded_at_system: "2026-11-09T00:00:00+00:00",
};
const REVIEW_DECISION = {
  review_decision_id: "66666666-6666-4666-8666-666666666661", target_kind: "event",
  target_id: EVENT_ID, decision: "request_correction",
  actor_id: "99999999-9999-4999-8999-999999999991", recorded_at: "2026-11-09T00:00:00+00:00",
  rationale: "Apa yang perlu diperiksa uji", source: "synthetic_reviewer", provenance: "synthetic_fixture",
  recorded_at_system: "2026-11-09T00:00:00+00:00",
};
function response(value: unknown, status = 200) { return { status, ok: status >= 200 && status < 300, json: async () => value } as Response; }
const emptyHistory = { target_kind: "event", target_id: EVENT_ID, decisions: [], proposals: [] };
function mount(path: string) { installDomainFetch(fetch); return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>); }
beforeEach(async () => { sessionStorage.clear(); await prepareSession(); });
afterEach(() => { cleanup(); invalidateAuth(); vi.unstubAllGlobals(); sessionStorage.clear(); vi.restoreAllMocks(); });

type Kind = "evidence" | "review";
const SUBMIT = (kind: Kind) => kind === "evidence" ? /Simpan metadata bukti/ : /Kirim Usulan Pemeriksaan/;

async function fillAndSubmit(page: { user: ReturnType<typeof userEvent.setup> }, kind: Kind, eventId = EVENT_ID) {
  const user = page.user;
  // These cases test dispatch outcomes, not per-keystroke input. Paste complete
  // synthetic values through real input events to avoid hundreds of scheduled
  // user-event delays competing with other files in the full two-worker suite.
  async function fill(label: RegExp, value: string) {
    const input = screen.getByLabelText(label);
    await user.click(input);
    await user.clear(input);
    await user.paste(value);
  }
  await fill(/UUID target \(tulis\)/, eventId);
  if (kind === "evidence") {
    await fill(/Sumber bukti/, "synthetic_note");
    await fill(/^Judul/, "Catatan uji");
    await fill(/Waktu catat/, "2026-11-06T12:00:00+08:00");
  } else {
    await fill(/^Apa yang perlu diperiksa/, "Apa yang perlu diperiksa uji");
    await fill(/Sumber pemeriksaan/, "synthetic_reviewer");
    await fill(/^Asal keterangan/, "synthetic_fixture");
  }
  await user.click(screen.getByRole("button", { name: SUBMIT(kind) }));
}

describe("DEC-P0-ACCESS-05 (tightened): UNKNOWN marker stays locked; GET can never unlock", () => {
  it.each([["evidence"], ["review"]] as const)("A/B/G %s: GET success (empty or different target) never unlocks", async (kind) => {
    const user = userEvent.setup();
    const postBodies: unknown[] = [];
    const fetchMock = vi.fn(async (_url: unknown, options?: { method?: string }) => {
      if (options?.method === "POST") { postBodies.push(options); throw new TypeError("network lost"); }
      return response(kind === "evidence" ? [] : emptyHistory); // empty/unrelated GET success
    });
    vi.stubGlobal("fetch", fetchMock);
    mount(kind === "evidence" ? "/backend-demo/evidence" : "/backend-demo/review");
    await fillAndSubmit({ user }, kind);
    await screen.findAllByText(/belum terkonfirmasi \(UNKNOWN\)/);
    // No manual unlock control exists at all.
    expect(screen.queryByRole("button", { name: /Hapus penanda/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: SUBMIT(kind) })).toBeDisabled();
    // A successful GET afterwards changes nothing (also proves empty GET cannot unlock).
    await user.type(screen.getByLabelText(/UUID target \(baca\)/), OTHER_EVENT);
    await user.click(screen.getByRole("button", { name: kind === "evidence" ? /Baca daftar bukti/ : /Baca riwayat review/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: SUBMIT(kind) })).toBeDisabled());
    expect(readEvidencePending() !== null || readReviewPending() !== null).toBe(true);
    expect(postBodies).toHaveLength(1);
  });

  it.each([["evidence"], ["review"]] as const)("C %s: GET completed before the ambiguous POST does not unlock", async (kind) => {
    const user = userEvent.setup();
    let failPost = false;
    const fetchMock = vi.fn(async (_url: unknown, options?: { method?: string }) => {
      if (options?.method === "POST") {
        if (failPost) throw new TypeError("network lost");
        return response(kind === "evidence" ? EVIDENCE_RECORD : REVIEW_DECISION, 201);
      }
      return response(kind === "evidence" ? [] : emptyHistory);
    });
    vi.stubGlobal("fetch", fetchMock);
    mount(kind === "evidence" ? "/backend-demo/evidence" : "/backend-demo/review");
    // Successful GET first (pre-POST read).
    await user.type(screen.getByLabelText(/UUID target \(baca\)/), EVENT_ID);
    await user.click(screen.getByRole("button", { name: kind === "evidence" ? /Baca daftar bukti/ : /Baca riwayat review/ }));
    await fillAndSubmit({ user }, kind);
    if (kind === "evidence") await screen.findAllByText(/Metadata bukti tersimpan/);
    else await screen.findByText(/Belum ada perubahan otomatis/);
    // Now an ambiguous POST: locked, and the earlier GET gives no unlock.
    failPost = true;
    await fillAndSubmit({ user }, kind);
    await screen.findAllByText(/belum terkonfirmasi \(UNKNOWN\)/);
    expect(screen.getByRole("button", { name: SUBMIT(kind) })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Hapus penanda/ })).not.toBeInTheDocument();
  });

  it.each([["evidence"], ["review"]] as const)("D/E %s: refresh and logout/login in the same tab keep the lock", async (kind) => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_url: unknown, options?: { method?: string }) => {
      if (options?.method === "POST") throw new TypeError("network lost");
      return response(kind === "evidence" ? [] : emptyHistory);
    });
    vi.stubGlobal("fetch", fetchMock);
    const path = kind === "evidence" ? "/backend-demo/evidence" : "/backend-demo/review";
    let view = mount(path);
    await fillAndSubmit({ user }, kind);
    await screen.findAllByText(/belum terkonfirmasi \(UNKNOWN\)/);
    // Refresh (remount): lock restored from the marker.
    view.unmount();
    view = mount(path);
    await screen.findAllByText(/belum terkonfirmasi \(UNKNOWN\)/);
    expect(screen.getByRole("button", { name: SUBMIT(kind) })).toBeDisabled();
    // Logout/login in the same tab: documented sessionStorage scope persists.
    invalidateAuth('Uji logout dalam tab yang sama.');
    view.unmount();
    await prepareSession();
    mount(path);
    await screen.findAllByText(/belum terkonfirmasi \(UNKNOWN\)/);
    expect(screen.getByRole("button", { name: SUBMIT(kind) })).toBeDisabled();
  });

  it.each([["evidence"], ["review"]] as const)("F %s: second submit attempt sends no second POST", async (kind) => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_url: unknown, options?: { method?: string }) => {
      if (options?.method === "POST") throw new TypeError("network lost");
      return response(kind === "evidence" ? [] : emptyHistory);
    });
    vi.stubGlobal("fetch", fetchMock);
    mount(kind === "evidence" ? "/backend-demo/evidence" : "/backend-demo/review");
    await fillAndSubmit({ user }, kind);
    await screen.findAllByText(/belum terkonfirmasi \(UNKNOWN\)/);
    expect(screen.getByRole("button", { name: SUBMIT(kind) })).toBeDisabled();
    // Even a direct client call while pending is refused without a POST.
    const direct = kind === "evidence"
      ? await createBackendEvidence({ target_kind: "event", target_id: OTHER_EVENT, kind: "reference",
          source: "s", title: "t", recorded_at: "2026-11-06T12:00:00+08:00" })
      : { kind: "rejected" as const, message: "n/a" };
    if (kind === "evidence") expect(direct).toMatchObject({ kind: "rejected" });
    expect(fetchMock.mock.calls.filter(c => (c[1] as { method?: string })?.method === "POST")).toHaveLength(1);
  });

  it.each([["evidence"], ["review"]] as const)("H %s: definitive 201 posts transition normally without a lock", async (kind) => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_url: unknown, options?: { method?: string }) => {
      if (options?.method === "POST") return response(kind === "evidence" ? EVIDENCE_RECORD : REVIEW_DECISION, 201);
      return response(kind === "evidence" ? [EVIDENCE_RECORD] : { ...emptyHistory, decisions: [REVIEW_DECISION] });
    });
    vi.stubGlobal("fetch", fetchMock);
    mount(kind === "evidence" ? "/backend-demo/evidence" : "/backend-demo/review");
    await fillAndSubmit({ user }, kind);
    if (kind === "evidence") {
      await screen.findAllByText(/Metadata bukti tersimpan/);
      expect(readEvidencePending()).toBeNull();
    } else {
      await screen.findAllByText(/Belum ada perubahan otomatis/);
      expect(readReviewPending()).toBeNull();
    }
    expect(screen.queryByText(/belum terkonfirmasi \(UNKNOWN\)/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: SUBMIT(kind) })).toBeEnabled();
  });

  it("I: an evidence UNKNOWN does not block an authorized review submission", async () => {
    const user = userEvent.setup();
    markEvidencePending(); // unrelated operation locked
    expect(readEvidencePending()).not.toBeNull();
    const fetchMock = vi.fn(async (_url: unknown, options?: { method?: string }) => {
      if (options?.method === "POST") return response(REVIEW_DECISION, 201);
      return response(emptyHistory);
    });
    vi.stubGlobal("fetch", fetchMock);
    mount("/backend-demo/review");
    await fillAndSubmit({ user }, "review");
    await screen.findByText(/Belum ada perubahan otomatis/);
    expect(readReviewPending()).toBeNull(); // review completed normally
    expect(readEvidencePending()).not.toBeNull(); // evidence lock untouched
  });

  it("cleanup helpers reset markers between cases (test infrastructure)", () => {
    markEvidencePending(); markReviewPending();
    clearEvidencePending(); clearReviewPending();
    expect(readEvidencePending()).toBeNull();
    expect(readReviewPending()).toBeNull();
  });
});
