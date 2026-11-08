import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  AccessDeniedState,
  EmptyState,
  LoadingState,
  ServiceUnavailableState,
  UncertainResultState,
} from "@/components/states/DisplayStates";

describe("LoadingState", () => {
  it("exposes a polite status region with default label", () => {
    render(<LoadingState />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Memuat…");
  });

  it("supports a custom label and merges className", () => {
    render(<LoadingState label="Menyimpan data…" className="mt-4" />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Menyimpan data…");
    expect(status).toHaveClass("mt-4");
  });

  it("keeps the spinner decorative", () => {
    render(<LoadingState />);
    // The animated indicator must not add noise for screen readers.
    expect(screen.getByRole("status").firstChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("EmptyState", () => {
  it("renders default title as an announced status, not an alert", () => {
    render(<EmptyState />);
    expect(screen.getByRole("status")).toHaveTextContent("Belum ada data");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders custom title and description", () => {
    render(
      <EmptyState
        title="Belum ada pengukuran"
        description="Kejadian tetap tercatat, tanpa nilai massa. Ini bukan nol terukur."
      />,
    );
    expect(screen.getByText("Belum ada pengukuran")).toBeInTheDocument();
    expect(screen.getByText(/Ini bukan nol terukur/)).toBeInTheDocument();
  });
});

describe("AccessDeniedState", () => {
  it("announces an alert with the default reason", () => {
    render(<AccessDeniedState />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Akses ditolak");
    expect(alert).toHaveTextContent(/tidak memiliki izin/);
  });

  it("renders a custom reason without authorization internals", () => {
    render(<AccessDeniedState reason="Peran Anda tidak mencakup site ini." />);
    expect(screen.getByText("Peran Anda tidak mencakup site ini.")).toBeInTheDocument();
  });

  it("keeps the icon decorative", () => {
    render(<AccessDeniedState />);
    expect(screen.getByRole("alert").querySelector("[aria-hidden='true']")).not.toBeNull();
  });
});

describe("ServiceUnavailableState", () => {
  it("announces an alert with default detail", () => {
    render(<ServiceUnavailableState />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Layanan tidak tersedia");
  });

  it("renders a retry button only when onRetry is provided", async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ServiceUnavailableState />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(<ServiceUnavailableState onRetry={onRetry} />);
    const button = screen.getByRole("button", { name: "Coba lagi" });
    await userEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders a custom detail", () => {
    render(<ServiceUnavailableState detail="Backend demo tidak dapat dihubungi (HTTP 503)." />);
    expect(screen.getByText(/HTTP 503/)).toBeInTheDocument();
  });
});

describe("UncertainResultState", () => {
  it("announces an alert that the result is UNKNOWN, not success or failure", () => {
    render(<UncertainResultState />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Hasil tidak diketahui (UNKNOWN)");
    expect(alert).toHaveTextContent(/bukan sukses, bukan gagal terverifikasi/);
  });

  it("warns against automatic re-submission to prevent duplicates", () => {
    render(<UncertainResultState />);
    expect(screen.getByText(/Jangan mengulang pengiriman secara otomatis/)).toBeInTheDocument();
    expect(screen.getByText(/untuk mencegah duplikasi/)).toBeInTheDocument();
  });

  it("offers an explicit inspect-then-retry action", async () => {
    const onRetry = vi.fn();
    render(<UncertainResultState onRetry={onRetry} />);
    const button = screen.getByRole("button", { name: "Periksa lalu coba lagi" });
    await userEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("Narrow/mobile layout structure", () => {
  it("stacks state content vertically with mobile-first padding", () => {
    render(<ServiceUnavailableState />);
    const alert = screen.getByRole("alert");
    // Mobile-first: column stack and small padding; larger padding ≥sm.
    expect(alert).toHaveClass("flex-col");
    expect(alert).toHaveClass("px-4");
    expect(alert).toHaveClass("sm:px-6");
  });

  it("keeps action rows wrapping on narrow screens", () => {
    render(<ServiceUnavailableState onRetry={() => undefined} />);
    expect(screen.getByRole("alert").lastChild).toHaveClass("flex-wrap");
  });
});
