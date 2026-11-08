import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { MassValue, MeasurementValues } from "@/components/measurement/MeasurementDisplay";
import type { Measurement } from "@/domain/types";

let sequence = 0;

function measurement(changes: Partial<Measurement> = {}): Measurement {
  sequence += 1;
  return {
    measurementId: `M-SYN-UX-${String(sequence).padStart(3, "0")}`,
    eventId: "EVT-SYN-UX-001",
    observedAt: "2026-11-07T10:00:00+07:00",
    originalText: "2.40 kg",
    unit: "kg",
    massBasis: "cooked",
    observationStatus: "observed",
    estimationStatus: "weighed",
    method: "digital_scale",
    provenance: "synthetic",
    gross: "2.40",
    tare: "0.40",
    net: "2.00",
    validationStatus: "unvalidated",
    ...changes,
  };
}

describe("MassValue", () => {
  it("renders the original numeric string verbatim, with unit", () => {
    render(
      <MassValue field="Net" value="2.345678" observationStatus="observed" />,
    );
    expect(screen.getByLabelText("Net: 2.345678 kg")).toBeInTheDocument();
    expect(screen.getByText("2.345678")).toBeInTheDocument();
    expect(screen.queryByText("2.35")).not.toBeInTheDocument();
    expect(screen.queryByText("2.3457")).not.toBeInTheDocument();
  });

  it("does not reformat trailing zeros away", () => {
    render(<MassValue field="Gross" value="0.10" observationStatus="observed" />);
    expect(screen.getByLabelText("Gross: 0.10 kg")).toBeInTheDocument();
    expect(screen.queryByText("0.1")).not.toBeInTheDocument();
  });

  it("never renders a missing value as zero", () => {
    render(<MassValue field="Gross" value={null} observationStatus="missing" />);
    expect(screen.getByLabelText("Gross: Tidak ada (missing)")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText("0.00")).not.toBeInTheDocument();
  });

  it("uses status-specific text for not-measured values", () => {
    render(<MassValue field="Tare" value={null} observationStatus="not_measured" />);
    expect(screen.getByLabelText("Tare: Tidak diukur")).toBeInTheDocument();
  });

  it("marks absent gross/tare in measured_zero as not recorded, not zero", () => {
    render(<MassValue field="Gross" value={null} observationStatus="measured_zero" />);
    expect(screen.getByLabelText("Gross: Tidak dicatat (measured zero)")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

describe("MeasurementValues — observed", () => {
  it("shows gross/tare/net verbatim with accessible names", () => {
    render(<MeasurementValues measurement={measurement()} />);
    expect(screen.getByLabelText("Gross: 2.40 kg")).toBeInTheDocument();
    expect(screen.getByLabelText("Tare: 0.40 kg")).toBeInTheDocument();
    expect(screen.getByLabelText("Net: 2.00 kg")).toBeInTheDocument();
    expect(screen.getByText("2.40")).toBeInTheDocument();
    expect(screen.getByText("0.40")).toBeInTheDocument();
    expect(screen.getByText("2.00")).toBeInTheDocument();
  });

  it("shows the mass basis explicitly and the observation badge", () => {
    render(<MeasurementValues measurement={measurement()} />);
    expect(screen.getByText(/Mass basis:/)).toHaveTextContent("Setelah dimasak");
    expect(screen.getByText("Terukur")).toBeInTheDocument();
  });

  it("preserves the original recorded text", () => {
    render(<MeasurementValues measurement={measurement({ originalText: "2,40 kilogram (catatan lapangan)" })} />);
    expect(screen.getByText("2,40 kilogram (catatan lapangan)")).toBeInTheDocument();
  });

  it("does not show the estimate badge for weighed values", () => {
    render(<MeasurementValues measurement={measurement()} />);
    expect(screen.queryByText(/Estimasi/)).not.toBeInTheDocument();
  });
});

describe("MeasurementValues — measured zero vs missing", () => {
  it("renders measured zero with net 0 and absent gross/tare marked as not recorded", () => {
    render(
      <MeasurementValues
        measurement={measurement({
          observationStatus: "measured_zero",
          originalText: "net 0",
          gross: null,
          tare: null,
          net: "0",
        })}
      />,
    );
    expect(screen.getByText("Terukur nol")).toBeInTheDocument();
    expect(screen.getByLabelText("Net: 0 kg")).toBeInTheDocument();
    expect(screen.getByLabelText("Gross: Tidak dicatat (measured zero)")).toBeInTheDocument();
    expect(screen.getByLabelText("Tare: Tidak dicatat (measured zero)")).toBeInTheDocument();
    // Measured zero must be findable, and never confused with missing.
    expect(screen.queryByText(/missing/)).not.toBeInTheDocument();
  });

  it("renders missing without any mass number and a distinct badge", () => {
    render(
      <MeasurementValues
        measurement={measurement({
          observationStatus: "missing",
          originalText: "",
          gross: null,
          tare: null,
          net: null,
        })}
      />,
    );
    expect(screen.getByText("Hilang (missing)")).toBeInTheDocument();
    expect(screen.queryByLabelText(/: \d/)).not.toBeInTheDocument();
    // No digit-only mass values rendered anywhere.
    expect(screen.queryByText(/^[\d.]+$/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Tidak ada \(missing\)/)).toHaveLength(3);
  });

  it("renders estimated measurements with a distinct badge", () => {
    render(
      <MeasurementValues
        measurement={measurement({
          estimationStatus: "estimated",
          gross: "2.4",
          tare: "0.4",
          net: "2",
        })}
      />,
    );
    expect(screen.getByText("Estimasi — bukan hasil timbangan")).toBeInTheDocument();
    expect(screen.getByLabelText("Net: 2 kg")).toBeInTheDocument();
  });

  it("renders flagged validation status distinctly", () => {
    render(<MeasurementValues measurement={measurement({ validationStatus: "flagged" })} />);
    expect(screen.getByText("Ditandai reviewer")).toBeInTheDocument();
  });
});

describe("MeasurementValues — anti-aggregation and layout structure", () => {
  it("states that no conversion or cross-measurement summation is applied", () => {
    render(<MeasurementValues measurement={measurement()} />);
    expect(screen.getByText(/tanpa konversi antar basis massa/)).toBeInTheDocument();
    expect(screen.getByText(/tanpa penjumlahan antar pengukuran/)).toBeInTheDocument();
  });

  it("uses mobile-first responsive columns matching existing conventions", () => {
    render(<MeasurementValues measurement={measurement()} />);
    const grid = screen.getByText("Gross").closest("dl");
    expect(grid).not.toBeNull();
    expect(grid).toHaveClass("grid-cols-1");
    expect(grid).toHaveClass("sm:grid-cols-2");
    expect(grid).toHaveClass("lg:grid-cols-3");
  });

  it("keeps field groups in a semantic definition list", () => {
    render(<MeasurementValues measurement={measurement()} />);
    const grossTerm = screen.getByText("Gross");
    const list = grossTerm.closest("dl");
    expect(list).not.toBeNull();
    const group = grossTerm.closest("div") as HTMLElement;
    expect(within(group).getByLabelText("Gross: 2.40 kg")).toBeInTheDocument();
  });
});
