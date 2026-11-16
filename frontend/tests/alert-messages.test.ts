import { describe, expect, it } from "vitest";
import {
  ALERT_COVERAGE_LABELS,
  ALERT_DISCLAIMER,
  ALERT_MESSAGES,
  ALERT_STATUS_LABELS,
  ALERT_TARGET_LABELS,
  alertCoverageLabel,
  alertMessageFor,
  alertStatusLabel,
  alertTargetLabel,
} from "@/components/alerts/alertMessages";

describe("alert UI message dictionary", () => {
  it("defines the four provisional rule messages", () => {
    expect(Object.keys(ALERT_MESSAGES)).toEqual([
      "delivery_reconciliation_review",
      "event_coverage_insufficient",
      "allocation_exceeds_reference",
      "sampling_frame_missing",
    ]);

    for (const message of Object.values(ALERT_MESSAGES)) {
      expect(message.label).toBeTruthy();
      expect(message.explanation).toBeTruthy();
      expect(message.insufficientData).toBeTruthy();
    }
  });

  it("maps statuses, targets, and rule-level coverage to Indonesian labels", () => {
    expect(ALERT_STATUS_LABELS).toEqual({
      open: "Terbuka",
      acknowledged: "Tinjauan tercatat",
      dismissed: "Ditutup oleh petugas",
      insufficient_data: "Data belum cukup",
    });
    expect(ALERT_TARGET_LABELS).toEqual({
      delivery: "Pengiriman",
      waste_event: "Kejadian limbah",
      disposition: "Disposisi",
      meal_service: "Layanan makan",
    });
    expect(ALERT_COVERAGE_LABELS).toEqual({
      complete: "Cakupan aturan lengkap",
      partial: "Cakupan aturan parsial",
    });
  });

  it("provides the disclaimer without claiming an operational or safety conclusion", () => {
    expect(ALERT_DISCLAIMER).toBe(
      "Alert ini tidak membuktikan waste aktual, keamanan pangan, atau bahwa masalah telah selesai.",
    );
  });

  it("returns no replacement for an unknown rule and static fallbacks for unknown labels", () => {
    expect(alertMessageFor("future_rule")).toBeUndefined();
    expect(alertStatusLabel("future_status")).toBe("Status alert tidak dikenal");
    expect(alertTargetLabel("future_target")).toBe("Target catatan");
    expect(alertCoverageLabel("future_coverage")).toBe("Cakupan aturan tidak diketahui");
  });
});
