/**
 * Synthetic evidence fixtures for FR-005 UI (FWI-EVID-01A).
 *
 * All records are fictional [SYNTHETIC] data — no real SPPG documents,
 * no student data, no government system integration. Storage references
 * are opaque demo strings; they do NOT point at any real file or URL.
 *
 * Coverage: attachment + metadata-only reference; verified / unverified /
 * needs_review; available / unavailable / expired / unknown availability;
 * one record with no storageRef; evidence for events and measurements.
 */

import type { EvidenceMetadata } from "./types";

export const evidenceFixtures: readonly EvidenceMetadata[] = [
  {
    evidenceId: "EVD-DEMO-0001",
    targetKind: "measurement",
    targetId: "M-DEMO-0001",
    kind: "attachment",
    source: "Kamera timbangan dapur demo (fiktif)",
    title: "Foto tampilan timbangan saat penimbangan",
    createdBy: "demo-operator-a",
    createdAt: "2026-11-02T12:41:00+07:00",
    method: "Foto langsung setelah penimbangan",
    provenance: "Diambil oleh operator di site demo; belum ada proses lain.",
    verification: "verified",
    verifiedBy: "demo-reviewer-1",
    verifiedAt: "2026-11-03T09:00:00+07:00",
    availability: "available",
    storageRef: "demo-bucket://evid/2026/11/EVD-DEMO-0001 (opaque, fiktif)",
    note: "Metadata demo; berkas tidak benar-benar ada.",
  },
  {
    evidenceId: "EVD-DEMO-0002",
    targetKind: "event",
    targetId: "EVT-DEMO-0001",
    kind: "reference",
    source: "Buku catatan lapangan (fiktif)",
    title: "Catatan manual kejadian sisa piring",
    createdBy: "demo-operator-b",
    createdAt: "2026-11-02T13:05:00+07:00",
    method: "Pencatatan manual saat kejadian",
    provenance: "Halaman 12 buku demo; tidak ada berkas digital.",
    verification: "unverified",
    availability: "unknown",
    note: "Referensi metadata saja — tidak ada berkas tersimpan.",
  },
  {
    evidenceId: "EVD-DEMO-0003",
    targetKind: "measurement",
    targetId: "M-DEMO-0002",
    kind: "attachment",
    source: "Ekspor laporan harian demo (fiktif)",
    title: "Laporan harian terlampir",
    createdBy: "demo-operator-a",
    createdAt: "2026-11-03T08:20:00+07:00",
    verification: "needs_review",
    availability: "unavailable",
    storageRef: "demo-bucket://evid/2026/11/EVD-DEMO-0003 (opaque, fiktif)",
    note: "Berkas dilaporkan tidak dapat diakses oleh storage demo.",
  },
  {
    evidenceId: "EVD-DEMO-0004",
    targetKind: "event",
    targetId: "EVT-DEMO-0002",
    kind: "attachment",
    source: "Arsip spreadsheet demo (fiktif)",
    title: "Rekap mingguan (retensi berakhir)",
    createdBy: "demo-editor",
    createdAt: "2026-09-15T10:00:00+07:00",
    verification: "unverified",
    availability: "expired",
    storageRef: "demo-bucket://evid/2026/09/EVD-DEMO-0004 (opaque, fiktif)",
    note: "Kebijakan retensi final menunggu ADR/keputusan berikutnya.",
  },
  {
    evidenceId: "EVD-DEMO-0005",
    targetKind: "measurement",
    targetId: "M-DEMO-0003",
    kind: "attachment",
    source: "Timbangan digital demo (fiktif)",
    title: "Cuplikan log timbangan",
    createdBy: "demo-operator-c",
    createdAt: "2026-11-04T12:10:00+07:00",
    method: "Ekspor log perangkat",
    provenance: "Log mentah dikirim oleh operator; belum direview.",
    verification: "unverified",
    availability: "available",
    // No storageRef: metadata exists, storage reference not yet recorded.
  },
] as const satisfies readonly EvidenceMetadata[];
