/**
 * Component/behavior/accessibility tests for the FR-005 evidence package.
 * Pattern follows the DQ-01/MASTER-01A frontend test suites.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EvidencePanel } from "@/components/evidence/EvidencePanel";
import { EvidenceList } from "@/components/evidence/EvidenceList";
import { EvidenceDetail } from "@/components/evidence/EvidenceDetail";
import { evidenceFixtures } from "@/data/evidence/fixtures";

describe("EvidencePanel — composition", () => {
  it("renders metadata records with synthetic banner and target scope", () => {
    render(<EvidencePanel items={evidenceFixtures} targetKind="measurement" targetId="M-DEMO-0001" />);
    expect(screen.getByText("SYNTHETIC / DEMO — NOT OFFICIAL BGN SYSTEM")).toBeInTheDocument();
    const region = screen.getByRole("region", { name: /Bukti untuk measurement M-DEMO-0001/ });
    expect(within(region).getAllByText(/EVD-DEMO-\d{4}/).length).toBe(evidenceFixtures.length);
  });

  it("renders kind, verification and availability badges without approval claims", () => {
    render(<EvidencePanel items={evidenceFixtures} targetKind="measurement" targetId="M-DEMO-0001" />);
    // Kind distinction is explicit (fixtures: 4 attachments, 1 reference).
    expect(screen.getAllByText("Lampiran").length).toBe(4);
    expect(screen.getAllByText("Referensi (metadata saja)").length).toBe(1);
    // Verification vocabulary: no invented "approved/disetujui" status.
    expect(screen.getByText("Diverifikasi reviewer")).toBeInTheDocument();
    expect(screen.queryByText(/Disetujui|Approved/i)).not.toBeInTheDocument();
  });

  it("shows the absence-of-evidence disclaimer tied to the empty state", () => {
    render(<EvidencePanel items={[]} targetKind="event" targetId="EVT-DEMO-9999" />);
    const empty = screen.getByRole("status");
    expect(empty).toHaveTextContent("Belum ada metadata bukti");
    expect(empty).toHaveTextContent(/bukan berarti pengukuran nol/);
  });

  it("separates evidence from measurement and validation concepts in the footer", () => {
    render(<EvidencePanel items={evidenceFixtures} targetKind="event" targetId="EVT-DEMO-0001" />);
    expect(screen.getByText(/konsep terpisah dari pengukuran dan validasi/)).toBeInTheDocument();
  });
});

describe("EvidenceList — drilldown affordance", () => {
  it("exposes an expandable toggle per evidence record", () => {
    render(
      <EvidenceList items={evidenceFixtures} onSelect={() => undefined} selectedEvidenceId={null} />,
    );
    // The panel handles selection; direct list usage only asserts the toggle affordance.
    const button = screen.getByRole("button", { name: "EVD-DEMO-0001" });
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});

describe("EvidencePanel — drilldown", () => {
  /** The detail Card root (rounded-lg) that contains the whole detail view. */
  function detailCard() {
    const heading = screen.getByRole("heading", { name: /Detail bukti/ });
    return heading.closest("div.rounded-lg") as HTMLElement;
  }

  it("toggles the detail view with verbatim metadata and no fabricated values", async () => {
    const user = userEvent.setup();
    render(<EvidencePanel items={evidenceFixtures} targetKind="measurement" targetId="M-DEMO-0001" />);
    await user.click(screen.getByRole("button", { name: "EVD-DEMO-0001" }));
    const detail = detailCard();
    // Metadata preserved verbatim.
    expect(within(detail).getByText(/Kamera timbangan dapur demo \(fiktif\)/)).toBeInTheDocument();
    expect(within(detail).getByText(/Diambil oleh operator di site demo/)).toBeInTheDocument();
    expect(within(detail).getByText("demo-operator-a")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "EVD-DEMO-0001" }));
    expect(screen.queryByRole("heading", { name: /Detail bukti/ })).not.toBeInTheDocument();
  });

  it("renders the metadata-only notice for attachments and never exposes storage references as links", async () => {
    const user = userEvent.setup();
    render(<EvidencePanel items={evidenceFixtures} targetKind="measurement" targetId="M-DEMO-0001" />);
    await user.click(screen.getByRole("button", { name: "EVD-DEMO-0001" }));
    const detail = detailCard();
    // No link/download affordances anywhere in the detail.
    expect(within(detail).queryByRole("link")).not.toBeInTheDocument();
    expect(detail.querySelectorAll("a[href]").length).toBe(0);
    // The storage reference string is NOT rendered at all (opaque to the UI).
    expect(within(detail).queryByText(/demo-bucket/)).not.toBeInTheDocument();
    // Explicit metadata vs actual-file distinction.
    expect(within(detail).getByText(/Ini tampilan/)).toHaveTextContent(/metadata/);
    expect(within(detail).getByText(/tidak membuka, memuat, atau menampilkan isi/)).toBeInTheDocument();
  });

  it("marks metadata-only references distinctly without exposing storage refs", async () => {
    const user = userEvent.setup();
    render(<EvidencePanel items={evidenceFixtures} targetKind="event" targetId="EVT-DEMO-0002" />);
    await user.click(screen.getByRole("button", { name: "EVD-DEMO-0002" }));
    const detail = detailCard();
    // The structural notice (unique phrase) marks this as metadata-only.
    expect(within(detail).getByText(/keterangan sumber ditampilkan apa adanya/)).toBeInTheDocument();
    expect(within(detail).queryByText(/demo-bucket/)).not.toBeInTheDocument();
  });

  it("renders an attachment without inferring storage state from an omitted reference", async () => {
    const user = userEvent.setup();
    render(<EvidencePanel items={evidenceFixtures} targetKind="measurement" targetId="M-DEMO-0003" />);
    await user.click(screen.getByRole("button", { name: "EVD-DEMO-0005" }));
    expect(screen.queryByText(/Referensi penyimpanan belum tercatat/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Detail bukti EVD-DEMO-0005" })).toBeInTheDocument();
    expect(screen.queryByText(/demo-bucket/)).not.toBeInTheDocument();
  });

  it("disclaims that verification is not measurement validation or approval", async () => {
    const user = userEvent.setup();
    render(<EvidencePanel items={evidenceFixtures} targetKind="measurement" targetId="M-DEMO-0001" />);
    await user.click(screen.getByRole("button", { name: "EVD-DEMO-0001" }));
    const detail = detailCard();
    expect(
      within(detail).getByText(/bukan persetujuan formal dan bukan validasi terhadap nilai pengukuran/),
    ).toBeInTheDocument();
  });
});

describe("EvidencePanel — access states", () => {
  it("renders a polite loading state without records", () => {
    render(
      <EvidencePanel items={evidenceFixtures} targetKind="event" targetId="EVT-DEMO-0001" accessState="loading" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Memuat data bukti…");
    expect(screen.queryByText(/EVD-DEMO-/)).not.toBeInTheDocument();
  });

  it("renders a server-driven denied alert without permission internals", () => {
    render(
      <EvidencePanel
        items={evidenceFixtures}
        targetKind="event"
        targetId="EVT-DEMO-0001"
        accessState="denied"
        deniedReason="Peran Anda tidak mencakup bukti site ini."
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Akses ke bukti ditolak");
    // The custom reason is shown, but no client-side permission logic is claimed.
    expect(alert).toHaveTextContent(/Otorisasi aktual ditegakkan di sisi server/);
    expect(screen.queryByText(/EVD-DEMO-/)).not.toBeInTheDocument();
  });

  it("renders an unavailable alert with retry and no fabricated metadata", async () => {
    const onRetry = vi.fn();
    render(
      <EvidencePanel
        items={evidenceFixtures}
        targetKind="event"
        targetId="EVT-DEMO-0001"
        accessState="unavailable"
        onRetry={onRetry}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Layanan bukti tidak tersedia");
    expect(alert).toHaveTextContent(/direkonstruksi secara lokal/);
    await userEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("EvidenceDetail — availability rendering", () => {
  it("renders all availability states without implying truth about the measurement", () => {
    render(<EvidenceDetail item={evidenceFixtures[3]} />);
    const detail = screen.getByRole("heading", { name: /Detail bukti/ }).closest("div.rounded-lg") as HTMLElement;
    expect(within(detail).getByText("Masa simpan berakhir")).toBeInTheDocument();
    expect(within(detail).queryByRole("link")).not.toBeInTheDocument();
  });
});

// CP9-F01/F02: public metadata omits storage references; kind is not availability.
describe("EvidenceDetail — public metadata privacy and availability", () => {
  it.each([
    { availability: "unknown", label: "Ketersediaan tidak diketahui" },
    { availability: "unavailable", label: "Berkas tidak tersedia" },
    { availability: "expired", label: "Masa simpan berakhir" },
    { availability: "available", label: "Berkas tersedia" },
  ] as const)("uses only explicit $availability availability, independently of storageRef", ({ availability, label }) => {
    const internalRef = "https://internal.invalid/synthetic-bucket/private-object-key?synthetic-token=not-a-secret";
    const item = { ...evidenceFixtures[0], availability, storageRef: internalRef };
    const { container, rerender } = render(<EvidenceDetail item={item} />);
    const withStorageRef = container.innerHTML;
    rerender(<EvidenceDetail item={{ ...item, storageRef: undefined }} />);
    // Neither omission nor presence of an opaque reference changes public output.
    expect(container.innerHTML).toBe(withStorageRef);
    expect(screen.getByText("Lampiran", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Referensi (metadata saja)", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText(label, { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(/ada berkas|belum tercatat|berkas pasti hilang/i)).not.toBeInTheDocument();
    if (availability !== "available") {
      expect(screen.queryByText("Berkas tersedia", { exact: true })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: `Detail bukti ${item.evidenceId}` })).toBeInTheDocument();
    expect(screen.getByText(item.title, { exact: true })).toBeInTheDocument();
    expect(screen.getByText(item.source, { exact: true })).toBeInTheDocument();
    expect(screen.getByText(item.provenance!, { exact: true })).toBeInTheDocument();
    expect(screen.getByText(item.method!, { exact: true })).toBeInTheDocument();
    expect(screen.getByText(item.createdBy, { exact: true })).toBeInTheDocument();
    expect(screen.getByText(`Pengukuran ${item.targetId}`, { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Diverifikasi reviewer", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(/^(approved|disetujui|pengukuran disetujui)$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/bukan persetujuan formal dan bukan validasi terhadap nilai pengukuran/)).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/internal\.invalid|private-object-key|synthetic-token|storageRef|storage_ref/);
    expect(container.querySelector("a[href], [download], img, iframe, video, audio, object, embed")).toBeNull();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /buka|unduh|download|preview/i })).not.toBeInTheDocument();
  });

  it("keeps reference and attachment kinds distinct with unknown availability in the list", () => {
    const items = evidenceFixtures.slice(0, 2).map((item) => ({ ...item, availability: "unknown" as const, storageRef: undefined }));
    render(<EvidenceList items={items} selectedEvidenceId={null} onSelect={() => undefined} />);
    expect(screen.getByText("Lampiran", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Referensi (metadata saja)", { exact: true })).toBeInTheDocument();
    expect(screen.getAllByText("Ketersediaan tidak diketahui")).toHaveLength(2);
    expect(screen.queryByText(/ada berkas|belum tercatat/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Berkas tersedia", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText(items[0].title)).toBeInTheDocument();
    expect(screen.getByText(items[1].title)).toBeInTheDocument();
  });
});
