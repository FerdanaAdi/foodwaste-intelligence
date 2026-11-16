export type AlertRuleCode =
  | "delivery_reconciliation_review"
  | "event_coverage_insufficient"
  | "allocation_exceeds_reference"
  | "sampling_frame_missing";

export type AlertMessage = {
  label: string;
  explanation: string;
  insufficientData: string;
};

export const ALERT_MESSAGES: Record<AlertRuleCode, AlertMessage> = {
  delivery_reconciliation_review: {
    label: "Perbedaan pengiriman dan penerimaan",
    explanation: "Jumlah yang dikirim dan diterima berbeda dan perlu ditinjau oleh tim.",
    insufficientData: "Data pengiriman atau penerimaan belum cukup untuk menjelaskan perbedaan.",
  },
  event_coverage_insufficient: {
    label: "Cakupan pengukuran kejadian belum cukup",
    explanation: "Kejadian belum memiliki pengukuran yang dapat digunakan untuk analisis.",
    insufficientData: "Pengukuran yang dapat digunakan belum tersedia; jangan menarik kesimpulan dari data ini.",
  },
  allocation_exceeds_reference: {
    label: "Alokasi disposisi perlu ditinjau",
    explanation: "Alokasi disposisi perlu dibandingkan dengan observasi referensi yang disetujui.",
    insufficientData: "Referensi pengukuran yang dapat digunakan belum tersedia; tidak ada klaim yang dibuat.",
  },
  sampling_frame_missing: {
    label: "Kerangka sampel belum tersedia",
    explanation: "Sampel tercatat tanpa kerangka populasi, sehingga estimasi populasi tidak dapat dibuat.",
    insufficientData: "Kerangka populasi belum tersedia; hasil ini tidak dapat diekstrapolasi ke populasi.",
  },
};

export const ALERT_STATUS_LABELS = {
  open: "Terbuka",
  acknowledged: "Tinjauan tercatat",
  dismissed: "Ditutup oleh petugas",
  insufficient_data: "Data belum cukup",
} as const;

export const ALERT_TARGET_LABELS = {
  delivery: "Pengiriman",
  waste_event: "Kejadian limbah",
  disposition: "Disposisi",
  meal_service: "Layanan makan",
} as const;

export const ALERT_COVERAGE_LABELS = {
  complete: "Cakupan aturan lengkap",
  partial: "Cakupan aturan parsial",
} as const;

export const ALERT_DISCLAIMER =
  "Alert ini tidak membuktikan waste aktual, keamanan pangan, atau bahwa masalah telah selesai.";

export function alertMessageFor(ruleCode: string): AlertMessage | undefined {
  return ruleCode in ALERT_MESSAGES
    ? ALERT_MESSAGES[ruleCode as AlertRuleCode]
    : undefined;
}

export function alertStatusLabel(status: string): string {
  return ALERT_STATUS_LABELS[status as keyof typeof ALERT_STATUS_LABELS] ?? "Status alert tidak dikenal";
}

export function alertTargetLabel(targetType: string): string {
  return ALERT_TARGET_LABELS[targetType as keyof typeof ALERT_TARGET_LABELS] ?? "Target catatan";
}

export function alertCoverageLabel(coverage: string): string {
  return ALERT_COVERAGE_LABELS[coverage as keyof typeof ALERT_COVERAGE_LABELS] ?? "Cakupan aturan tidak diketahui";
}
