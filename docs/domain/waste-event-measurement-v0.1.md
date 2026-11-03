# Material/Waste Event & Measurement Contract v0.1

Status: **PROVISIONAL**. Ini kontrak konseptual untuk review domain, bukan schema database, API, aplikasi, KPI, atau otorisasi produksi. FWI-02 v1.0 tidak tersedia di repository; nama dan pemisahan atribut yang ditandai baseline mengikuti arahan review dan tetap perlu verifikasi terhadap sumber asli.

## 1. Tujuan dan batasan

Kontrak ini menetapkan pencatatan terpisah untuk satu kejadian material dan observasi pengukurannya, memakai data sintetis saja. Satu kejadian dapat berupa surplus berisiko (`at_risk_surplus`), kehilangan/pembuangan aktual (`actual_loss_discard`), atau kategori material relevan lain yang ditetapkan kemudian. Event tidak otomatis berarti limbah aktual. Transfer, rescue, dan disposition bukan event generation baru. OP-08, FI-02, dan NI-03 tetap **HELD**.

## 2. Material/Waste Event

`MaterialWasteEvent` merepresentasikan satu occurrence material pada konteks proses tertentu. Event memiliki satu `waste_event_id` yang stabil dan immutable. Kandidat atribut baseline konseptual yang diminta review/FWI-02 (**perlu verifikasi sumber FWI-02**):

- `waste_event_id`: ID kejadian stabil; ini adalah pemetaan kontrak ini untuk `event_id` pada FWI-02, bukan identitas kedua. Jika FWI-02 menggunakan nama `event_id`, implementasi harus menyimpan satu nilai/identity yang sama.
- `event_type`: misalnya at-risk surplus, actual loss/discard, atau kategori material lain; vocabulary final belum ditetapkan.
- `stage_code`: kode tahap operasional.
- `process_step`: langkah proses yang lebih spesifik.
- `operation_date`: tanggal operasi.
- `occurred_at`: waktu kejadian fisik, berbeda dari waktu pencatatan.
- `recorded_at`: waktu pencatatan.
- `captured_by`: aktor/perangkat pencatat.

`organization_id` dan `site_id` adalah required pada baseline konseptual yang diarahkan FWI-02 v1.0; sumber FWI-02 tidak tersedia lokal sehingga kewajiban ini tetap perlu diverifikasi. Kandidat konteks lain yang masih **PROVISIONAL**: `material_category`, `regulatory_scope_status`, `regulatory_sisa_category`, `food_safety_status`, `edible_fraction`, `avoidability_status`, dan `event_status`. Regulatory fields tidak menggantikan atribut food safety, edible fraction, atau avoidability.

## 3. Measurement

`MeasurementRecord` adalah observasi massa atau status observasi terhadap satu `waste_event_id` pada waktu/metode tertentu. Measurement tidak membuat event baru.

Kandidat field: `measurement_id`, `waste_event_id`, `measured_at`, `gross_value`, `tare_value`, `net_value`, `original_value`, `original_unit`, `canonical_mass_kg`, `mass_basis`, `measurement_method`, `provenance`, `precision`, `observation_status`, `recorded_at`, `captured_by`, serta `instrument_id` dan `sample_design` bila kondisional. `original_value` adalah angka yang dicatat dalam `original_unit` dan harus diberi label apakah merepresentasikan gross atau net; `canonical_mass_kg` adalah representasi kg dari nilai yang sama setelah konversi satuan terdokumentasi, tanpa menghapus nilai asli. `kg` adalah unit massa kanonik untuk pelaporan terstandar. Vocabulary final untuk observation status dan measurement method menunggu FWI-03; jangan menganggap daftar kode sebagai final.

`ValidationRecord` adalah konsep terpisah dari `MeasurementRecord`: ia menyimpan riwayat pemeriksaan, keputusan, pelaku, waktu, alasan, dan status validasi terhadap satu measurement (atau event), tanpa mengubah observasi asli. `validation_status` pada measurement hanya merupakan ringkasan/referensi ke riwayat tersebut; vocabulary final menunggu FWI-03.

Mass basis baseline yang diarahkan review: `raw`, `after_preparation`, `cooked`, `ready_to_eat`, `as_served`, dan `other_documented`. `plate_leftover` adalah stream/type material, bukan mass basis. Konversi antar-basis memerlukan bukti yield terdokumentasi; tidak ada faktor universal.

## 4. Relasi dan repeated measurement

`MaterialWasteEvent 1 -> 0..n MeasurementRecord`. Pengukuran berulang tetap memakai `waste_event_id` yang sama, menyimpan waktu, metode, provenance, precision, status, dan identitas instrumen masing-masing. Pengukuran berulang tidak dijumlahkan dan tidak otomatis mengganti hasil sebelumnya. Pemilihan measurement yang valid untuk pelaporan memerlukan kebijakan rekonsiliasi yang disetujui; koreksi atau supersession tidak boleh diasumsikan hanya karena record lebih baru.

## 5. Validasi

### Dapat dipastikan

1. ID event stabil, unik, dan tidak dipakai ulang; remeasurement/transfer/rescue/disposition bukan event baru.
2. Setiap measurement mengacu ke tepat satu event yang ada.
3. `net = gross - tare` hanya bila pasangan valid dan unit konsisten; net negatif tidak diubah diam-diam menjadi nol.
4. Gross yang lebih kecil dari tare adalah kondisi invalid atau perlu review; tidak boleh menghasilkan net nol otomatis.
5. Basis massa wajib dilabeli; raw, cooked, dan as-served tidak boleh diperlakukan setara tanpa dasar.
6. Status observasi, metode pengukuran, dan validation history adalah konsep terpisah.
7. Regulatory scope/category dipisahkan dari food safety, edible fraction, dan avoidability.
8. Event, measurement, transfer, dan disposition tetap terpisah.

### Masih provisional / perlu keputusan

Format ID, vocabulary `event_type` dan status, timezone, unit selain kg, precision/rounding, aturan net tanpa gross/tare, validasi nilai, koreksi/void, duplicate detection, rekonsiliasi repeated measurement, serta kapan `instrument_id`/`sample_design` wajib.

## 6. Contoh data sintetis

```yaml
waste_event_id: EVT-SYN-0001
event_type: at_risk_surplus
stage_code: preparation
process_step: batch_completion
operation_date: "2026-11-03"
occurred_at: "2026-11-03T10:12:00+08:00"
recorded_at: "2026-11-03T10:15:00+08:00"
captured_by: synthetic_operator_01
organization_id: ORG-SYN-01
site_id: SITE-SYN-01
material_category: cooked_meal
regulatory_scope_status: unknown
regulatory_sisa_category: null
food_safety_status: not_assessed
edible_fraction: unclassified
avoidability_status: unknown
measurements:
  - measurement_id: M-SYN-0001
    measured_at: "2026-11-03T10:17:00+08:00"
    gross_value: 2.4
    tare_value: 0.4
    net_value: 2.0
    original_value: 2.0
    original_unit: kg
    canonical_mass_kg: 2.0
    mass_basis: cooked
    measurement_method: scale_reading
    provenance: synthetic_fixture
    precision: 0.01
    observation_status: observed
    instrument_id: SCALE-SYN-01
    sample_design: null
validation_records:
  - validation_record_id: VR-SYN-0001
    measurement_id: M-SYN-0001
    validation_status: pending
    recorded_at: "2026-11-03T10:18:00+08:00"
```

## 7. Lima kasus uji konseptual

1. **Remeasurement:** dua record pada satu ID event tetap satu event; tidak dijumlahkan dan tidak otomatis saling menggantikan.
2. **Missing vs zero:** status observasi yang berbeda tidak disamakan; vocabulary final menunggu FWI-03.
3. **Gross < tare:** pasangan gross 1 kg dan tare 1.2 kg invalid/perlu review; net tidak diubah menjadi nol.
4. **At-risk surplus:** event `at_risk_surplus` tidak otomatis dihitung sebagai `actual_loss_discard` tanpa bukti/konfirmasi status.
5. **Rescue dan keamanan:** rescue tidak boleh dilakukan atau dicatat sebagai aman tanpa konfirmasi food safety yang relevan; rescue juga bukan event baru.
6. **Mixed basis/agregasi:** massa fisik teramati dari basis berbeda hanya dapat diagregasi jika setiap komponen berlabel jelas dan tidak overlap; rasio memerlukan basis yang sepadan.

## 8. Open questions untuk FWI-01/02/03/04

- Apakah field baseline di atas, cardinality, ID semantics, stage/process vocabulary, dan audit lineage sesuai FWI-02 v1.0?
- Bagaimana FWI-03 mendefinisikan observation status, measurement method, validation status, precision, rounding, dan repeated-measurement reconciliation?
- Apa definisi FWI-01/02/03/04 untuk at-risk surplus, actual loss/discard, rescue, plate-leftover stream, regulatory scope, dan sisa category?
- Field wajib dan acceptance scope P0 apa yang ditetapkan FWI-04?
- Desk regression scenario ID mana yang berlaku, dan bagaimana KPI held tetap tidak aktif?
