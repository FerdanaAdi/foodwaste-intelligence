# FOODWASTE INTELLIGENCE (FWI)
# Product Requirements Document — PRD v0.1 (Controlled Working Baseline)

> **Kode:** FWI-PROD-001  
> **Status:** **WORKING BASELINE v0.1 — FINAL UNTUK ACUAN DESAIN INTERNAL; PROVISIONAL UNTUK ATURAN YANG BELUM DISAHKAN; TIDAK UNTUK OPERASIONAL**  
> **Tanggal:** 3 November 2026  
> **Repository target:** `docs/product/PRD-v0.1.md`  
> **Pemilik keputusan produk:** Pengelola proyek FWI; bukti persetujuan formal organisasi/ahli **belum tercatat**  
> **Bentuk produk yang dituju:** Web responsif; modul pencatatan/pengukuran dan pengendalian mutu data  
> **Lingkungan yang diizinkan sekarang:** Desain, pengembangan, review, dan pengujian dengan **data sintetis saja**  
> **Status kendali perubahan:** v0.1 menjadi acuan kebutuhan kerja untuk tugas berikutnya; perubahan ruang lingkup/aturan harus melalui review dan versi revisi, **bukan** interpretasi bebas AI.

**Tujuan dokumen.** Menjadi **satu acuan kebutuhan produk untuk pekerjaan implementasi yang disetujui**, dengan fitur, batasan, kriteria penerimaan, dependensi, dan keputusan terbuka yang dapat dilacak. Dokumen ini **bukan** SOP BGN/SPPG, spesifikasi API pemerintah, persetujuan pilot, desain database final, ataupun izin mengaktifkan KPI. **Finalisasi di sini berarti konsolidasi internal menjadi baseline kerja, bukan pengesahan oleh BGN, ahli, atau organisasi eksternal.**

---

## 0. BACA TERLEBIH DAHULU — Kontrak pemakaian PRD oleh AI/Developer

Bagian ini berlaku bagi Codex, Antigravity, Copilot, dan kontributor manusia.

1. **Jangan implementasikan seluruh PRD sekaligus.** Pekerjaan baru hanya dimulai setelah ada *task* spesifik ber-ID, cakupan file, kriteria penerimaan, dan branch tersendiri. PRD menjelaskan *apa/mengapa*; tugas implementasi menjelaskan *perubahan apa yang diizinkan saat ini*.
2. **Patuhi `AGENTS.md`, `docs/ai/CONTEXT.md`, dan kontrak domain** di repository. Jangan diam-diam menimpa keputusan, status metodologi, atau batas data sintetis.
3. **Bedakan tiga status:** `REQUIRED-P0` (kebutuhan produk MVP), `PROPOSED` (usulan desain; belum disetujui), dan `TBD/BLOCKED` (butuh keputusan/bukti). `REQUIRED-P0` **tidak** berarti fitur sudah dibangun atau boleh diterapkan ke data nyata.
4. **Setiap detail yang tidak bersumber atau tidak ditentukan:** catat sebagai `OPEN-...`, jelaskan dampaknya, lalu minta keputusan. **Jangan mengisi sendiri** nilai ambang, versi formula, peran universal, teknologi, klasifikasi resmi, target SLA, atau integrasi pemerintah.
5. **KPI `OP-08`, `FI-02`, `NI-03` selalu `HELD/DISABLED`.** Jangan tampilkan angka hasilnya, jangan buat jalur aktivasi diam-diam, dan jangan mengklaim KPI FWI resmi BGN.
6. **Tidak ada data produksi/SPPG/sekolah sebenarnya** maupun identitas individu siswa. Demo, fixture, tangkapan layar, ekspor, dan pengujian harus berlabel `SYNTHETIC/DEMO`.
7. **Satu event asal bukan satu pengukuran.** Event, Measurement, Validation, Evidence, Material Flow/Transfer, dan Disposition tidak boleh disamakan. Jangan menjumlahkan ulang pengukuran terhadap event yang sama.
8. **Tidak boleh menyatakan selesai hanya karena UI terlihat berfungsi.** Tunjukkan hasil tes yang relevan, bukti status Git, kesesuaian acceptance criteria, dan catat gap.
9. **Dilarang mengubah scope P0/P1/P2, menyetujui keputusan terbuka, atau mengganti istilah kanonik tanpa review.** Bila sumber bertentangan, ikuti prosedur rekonsiliasi pada §2 dan §15.
10. **Tidak ada commit, push, merge, instalasi dependency, atau deploy tanpa instruksi tugas yang mengizinkannya.** Jangan membaca seluruh repository tanpa kebutuhan; fokus file yang relevan untuk menghemat token.

### Konvensi rujukan dan perubahan terkendali

- **Normatif bagi task internal:** ID `FR-*`, `DR-*`, `NFR-*`, `AC-*`, serta prioritas P0/P1/P2 pada PRD ini adalah *kontrak kebutuhan produk* hingga direvisi melalui pull request. Status metodologi sumber dan hak akses tetap mengikuti gate masing-masing; baseline internal tidak mengesahkan data/operasi riil.
- **Jika konflik sumber terdeteksi:** jangan memilih definisi diam-diam. Catat `OPEN-*`, beri dampak (desain, database, API, UX, test), lalu tunggu keputusan yang dapat ditelusuri melalui *Architecture Decision Record* (ADR) atau revisi baseline sumber.
- **Satu-satunya mekanisme revisi kebutuhan:** perubahan PRD dengan alasan, bukti, dampak terhadap tes dan migration, reviewer, serta versi. Perubahan UI/DB tidak boleh terlebih dulu menetapkan definisi domain.
- **Rujukan file lokal:** FWI-01/02/03/04 adalah sumber studi proyek; berkas tersebut tidak otomatis tersedia bagi semua agen di repository. Agen hanya boleh menyatakan telah membacanya jika benar-benar dapat mengakses berkas, kutipan terverifikasi, atau dokumen rujukan yang disediakan.

### Status keputusan yang digunakan

| Label | Makna | Implikasi AI |
|---|---|---|
| `SOURCE-BASELINE` | Dinyatakan dalam dokumen FWI acuan yang disebut | Dapat dipakai pada level konseptual sesuai status/gate sumber |
| `REQUIRED-P0` | Persyaratan untuk menerima prototipe MVP1 | Harus diuji saat modulnya diimplementasikan, **belum otomatis terimplementasi** |
| `PROPOSED` | Usulan PRD/UX/arsitektur untuk direview | Jangan tetapkan sebagai aturan final tanpa keputusan |
| `OPEN` | Belum ada keputusan atau bukti yang cukup | Tunda keputusan terkait atau berikan fallback yang diberi label |
| `HELD` | Secara eksplisit ditahan | Tetap tidak aktif |
| `IMPLEMENTED-TESTED` | Sudah ada kode dan tes yang terverifikasi menurut laporan lokal | Jangan menganggap mencakup kebutuhan lain di luar tes |

## 1. Executive summary

**Visi.** FoodWaste Intelligence (FWI) merupakan lapisan **pencatatan, pengukuran, pengendalian mutu, analitik, dan dukungan keputusan** untuk material pangan berisiko terbuang, kehilangan pangan, dan pembuangan aktual dalam rantai MBG. FWI **independen dan bukan pengganti sistem resmi BGN, aplikasi transaksi, pelaporan wajib, persediaan, akuntansi, atau SOP SPPG**. (FWI-01 §1/3; FWI-02 §5–8; FWI-04 §1)

**Masalah yang hendak diuji.** Informasi kejadian dapat tersebar di beberapa titik proses, tidak selalu memiliki identitas stabil, menggunakan kondisi massa berbeda, dan menimbulkan risiko salah baca antara **nol, belum diukur, estimasi, dan data invalid**. Ini adalah **risiko desain dari riset dokumen**, bukan klaim terverifikasi bahwa semua SPPG mengalami kondisi tersebut.

**Hipotesis nilai MVP1 (belum diuji lapangan).** Jika pencatatan dibuat berbasis satu event ID dengan pengukuran terpisah, validasi, bukti, dan ekspor terlacak, pengguna lebih mudah menemukan ketidaklengkapan dan mengurangi risiko double counting. Hipotesis ini **belum diuji lapangan**.

**Outcome prototipe:** pengelola dapat melihat *apa yang tercatat, dari mana asalnya, bagaimana diukur, apa status mutunya, dan mengapa boleh/tidak boleh disimpulkan*, bukan sekadar angka dashboard.

**Kriteria keberhasilan terukur saat ini:** kelengkapan pengujian fungsional P0, keterlacakan per baris, tidak ada double counting, kesalahan data yang jelas, isolasi site, audit history, serta ekspor yang dapat direkonsiliasi. **Belum** ada target kuantitatif pengurangan waste, akurasi lapangan, ROI, SLA, maupun dampak gizi yang sah untuk diklaim.

## 2. Sumber, versi, dan aturan rekonsiliasi

| Prioritas sesuai bidang | Sumber kerja | Fungsi |
|---|---|---|
| Landasan, batas interpretasi | `FWI-01_Research_Foundation_v1_0_Consolidated.docx` — v1.0 | Enam tahap konseptual, aktor provisional, batas regulasi vs analitik |
| Model event, relasi dan data | `FWI-02_Critical_Reconciliation_and_Architecture_Baseline_v1_0.docx` — v1.0 | Event/measurement/flow/disposition, kamus data, dedup, MVP1–3 |
| Pengukuran, KPI dan kontrol | `FWI-03_Consolidated_Methodology_v1_3.docx` — v1.3 | Metode, 24 KPI, gate, regresi meja, batas penggunaan |
| Kebutuhan produk & solusi awal | `FWI-04_MVP_Product_Requirements_Solution_Blueprint_v0_1(1).docx` — v0.1 | Fitur P0/P1/P2, peran fungsional, alur, UI, NFR dan penerimaan |
| Kontrak domain repo | `docs/domain/waste-event-measurement-v0.1.md` — provisional | Istilah kontrak yang digunakan prototipe DEV-001/002/003 |
| Aturan agent dan status kerja | `AGENTS.md`, `docs/ai/CONTEXT.md`, `docs/ai/TOKEN_POLICY.md` | Guardrail pengembangan dan penggunaan model |

**Aturan sumber:** Prioritas bukan 'dokumen terbaru selalu menang' untuk semua hal. Gunakan FWI-01 untuk konteks, FWI-02 v1.0 untuk model kejadian, FWI-03 v1.3 untuk metodologi/KPI, FWI-04 v0.1 untuk kebutuhan produk. **Jika tidak sejalan, jangan memperbaiki secara diam-diam.** Catat konflik dan tetapkan pemilik keputusan; keputusan baru memerlukan revisi versi sumber atau *decision record* yang disetujui.

**Konflik sumber yang sudah diketahui — `OPEN-01`:** FWI-04 v0.1 masih merujuk FWI-02 v0.1 dan mencantumkan `plate_leftover` dalam contoh mass basis, sedangkan FWI-02 v1.0 menempatkan `plate_leftover` sebagai kategori stream/aliran dan contoh basis massa `raw`, `after_preparation`, `cooked`, `ready_to_eat`, `as_served`, `other_documented`. Untuk pekerjaan **provisional**, ikuti pembedaan FWI-02 v1.0/kontrak domain, **tetapi jangan membekukan enum skema final** sebelum rekonsiliasi sumber disahkan.

## 3. Sasaran produk, non-sasaran, indikator keberhasilan

### 3.1 Sasaran P0

- Mencatat **satu identitas kejadian sumber** yang stabil dalam konteks organisasi, lokasi, tahap dan waktu.
- Merekam **0..n pengukuran** terhadap event tersebut dengan nilai/satuan/basis/metode/status yang dapat dilacak.
- Menghindari hitung ganda akibat pengukuran ulang, transfer atau disposition.
- Memisahkan **observasi**, **validasi**, **koreksi**, **bukti**, dan **audit trail**.
- Memberikan laporan kualitas data dan ekspor yang dapat ditelusuri ke baris sumber.
- Memastikan akses pengguna dibatasi sesuai site/role dan prototipe hanya memakai data sintetis.

### 3.2 Non-sasaran P0 (out of scope)

- Pengganti SIPGN, AKSIS, LPDH, aplikasi BGN lain, atau pelaporan resmi.
- Fitur langsung ke API pemerintah, impor data resmi tanpa izin, dan klaim memiliki akses integrasi.
- Pemrosesan identitas anak/sekolah secara individual, kesehatan pribadi, atau data operasional nyata.
- Akuntansi otomatis, jurnal keuangan, angka kerugian akuntansi, pembuktian fraud, atau estimasi gizi klinis.
- Automasi rescue/redistribusi pangan tanpa verifikasi kewenangan dan keamanan pangan.
- Formula KPI yang belum memenuhi gate; AI vision sebagai pengganti penimbangan tervalidasi; penentuan threshold universal.
- Sistem inventori/batch/distribusi penuh, offline sync, dan aplikasi native mobile dalam P0.

### 3.3 Bukti keberhasilan prototipe

**Tidak ditetapkan target persentase/penurunan waste atau ROI tanpa baseline.** Keberhasilan MVP1 adalah **lolosnya skenario penerimaan P0** pada §12 dengan fixture sintetis dan demonstrasi keterlacakan data. Dampak nyata baru boleh diukur melalui studi dan izin terpisah.

## 4. Pengguna, kebutuhan, dan otorisasi (fungsi, bukan jabatan baku)

| Fungsi P0 | Tugas | Batas akses minimum |
|---|---|---|
| Pencatat (operator) | Membuat event, mengisi pengukuran, lampirkan bukti, mengajukan review | Hanya organisasi/site yang diizinkan; tidak mengesahkan catatan sendiri secara otomatis |
| Reviewer data/QA | Memeriksa sumber, menandai anomali, meminta koreksi, mencatat hasil validasi | Hanya ruang lingkup yang diizinkan; tidak menghapus jejak observasi |
| Pengelola site | Melihat mutu data, antrean dan tindak lanjut lokasi | Hanya site/organisasi berizin |
| Administrator | Mengelola organisasi, lokasi, membership, role dan master data | Perubahan akses/config tercatat |
| Auditor/pembaca laporan | Melihat jejak data dan melakukan ekspor sesuai izin | Read-only bila tidak ada izin eksplisit lain |

Fungsi gudang, dapur, ahli gizi, distribusi, sekolah, penanganan sisa, dan keuangan akan dipetakan pada fase proses berikutnya. **Tidak ada asumsi satu jabatan nasional selalu menjadi operator atau reviewer**. Aturan segregasi tugas final dan RACI lokal = `OPEN-02`.

## 5. Ruang lingkup proses dan konteks MBG

Enam tahap FWI adalah **kerangka analitis konseptual**, bukan SOP tunggal wajib di semua lokasi (FWI-01):

1. Pengadaan/penerimaan bahan.
2. Penyimpanan.
3. Persiapan/pengolahan.
4. Pemorsian/distribusi.
5. Penerimaan di sekolah/konsumsi.
6. Penanganan sisa pangan.

**Lingkup pencatatan P0:** Event dapat dikaitkan pada tahap di atas. Namun pemodelan penuh lot, batch, *serving session*, arus transfer dan disposition = P1. P0 **tidak boleh mengarang** hubungan antar tahap yang belum direkam.

## 6. User journeys (yang harus dapat diuji)

### Journey J-01 — Pencatat membuat event dan pengukuran

1. Masuk → sistem memuat organisasi/site yang diizinkan.
2. Pilih site aktif, tahap, jenis event, konteks pangan, waktu kejadian, tanggal operasi, dan alasan bila tersedia.
3. Simpan **satu** event ID; sistem mencatat waktu input dan aktor.
4. Tambahkan measurement: waktu, metode, kondisi massa, unit, gross/tare/net bila ditimbang; label status observasi dan provenance.
5. Sistem menampilkan kesalahan field; angka invalid **tidak boleh diterima sebagai valid**.
6. Lampirkan bukti bila tersedia/diwajibkan menurut jenis kasus (aturan rinci = `OPEN-03`).
7. Ajukan review. Informasi yang tidak tersedia tetap ditandai—bukan diubah menjadi nol.

### Journey J-02 — Reviewer menilai dan meminta koreksi

1. Lihat antrean sesuai scope akses dan status data.
2. Buka detail event, seluruh pengukuran terkait, bukti, dan riwayat perubahan.
3. Lakukan keputusan validasi / minta koreksi dengan alasan (vocabulary status final masih `OPEN-04`).
4. Jika terdapat ukur ulang, kedua observasi tetap ada; memilih pengukuran rujukan untuk pelaporan **memerlukan kebijakan rekonsiliasi yang tercatat** (`OPEN-05`).
5. Semua aksi penting menambah riwayat, bukan menimpa bukti tanpa jejak.

### Journey J-03 — Pengelola/auditor menelusuri dan ekspor

1. Pilih site/periode/tahap/status dan lihat kualitas/kecukupan rekaman.
2. Telusuri setiap ringkasan ke event/measurement sumber dan status validasi.
3. Ekspor CSV/XLSX dengan filter, label synthetic, basis, satuan, status, dan metadata sumber.
4. Verifikasi angka/rekaman di ekspor konsisten dengan sumber dan hak akses.

## 7. Backlog produk — prioritas yang mengikat dan urutan implementasi

**Perhatikan:** `P0/P1/P2` adalah *prioritas kebutuhan*, **bukan bukti fitur sudah ada**. IDs stabil untuk tracking issue, PR dan test. Satu task implementasi boleh mengambil **subset kecil** dari satu FR.

### 7.1 P0 — Measurement Core (`REQUIRED-P0`)

| ID | Modul / persyaratan | Batas penerimaan minimum | Bukti utama |
|---|---|---|---|
| `FR-001` | Organization/site, akun, membership dan role permission | Akses lintas site tanpa izin ditolak; perubahan akses dicatat | FWI-02 model MVP1; FWI-04 §3 |
| `FR-002` | Master data minimal | Item pangan, kategori, unit, tahap, alasan/metode; kode stabil, definisi/versi dan pemilik perubahan terlacak | FWI-02 data dictionary; FWI-04 §3 |
| `FR-003` | Material/Waste Event Ledger | Satu event ID unik/stabil; event_type tidak otomatis berarti discarded; waktu kejadian/input/tanggal operasi berbeda | FWI-02 §5–7; FWI-04 §3–6 |
| `FR-004` | Measurement Capture | 0..n measurement/event; nilai asli + unit, canonical kg jika terkonversi valid, basis, metode, waktu, instrument/sample kondisional | FWI-02 dictionary; FWI-03; FWI-04 §3–6 |
| `FR-005` | Evidence & provenance | Lampiran/referensi bukti dengan kontrol akses dan sumber; metadata siapa/kapan/metode | FWI-02 Evidence; FWI-04 §5 |
| `FR-006` | Data quality, validation, correction & audit | Missing≠zero, reason/status, duplicate warning, riwayat review/koreksi dan aktor/timestamp | FWI-02 BR; FWI-04 §6 |
| `FR-007` | Dashboard mutu data P0 | Filter site/periode/tahap; banyaknya event/record/status dan missing/blocked; unit/basis/status tampak | FWI-04 §9; tanpa KPI otomatis |
| `FR-008` | Export CSV/XLSX | Baris sumber dan metadata lineage/status tersedia; filter + permission sama dengan UI | FWI-02 MVP1; FWI-04 §3,9 |

**Tidak boleh dipindahkan ke P0 tanpa change request:** pengukuran otomatis via kamera, inferensi keadaan aman pangan, optimasi porsi, costing penuh, batch/lot lengkap, disposition transaksional, integrasi resmi, KPI operasional.

### 7.2 P1 — Operational Intelligence (`PLANNED-NOT-AUTHORIZED`)

`FR-101` lot/penerimaan & stock movement; `FR-102` resep/menu/batch produksi; `FR-103` distribusi, delivery dan serving session; `FR-104` material-flow/transfer linkage; `FR-105` disposition, rescue/handover **dengan safety gate**; `FR-106` operational trends yang menampilkan cakupan, unit dan basis dengan benar. Tidak otomatis aktif pada rilis P0.

### 7.3 P2 — Financial & Decision Intelligence (`PLANNED-CONDITIONAL`)

`FR-201` katalog KPI terkontrol; `FR-202` preview KPI yang lolos gate metodologi; `FR-203` referensi biaya/estimasi manajerial dengan sumber dan alokasi; `FR-204` rekomendasi/alert berbasis kualitas bukti dan keselamatan. **Bukan** pembukuan atau klaim savings aktual. Ketiga KPI HELD tetap disabled meskipun komponen P2 dibangun.

## 8. Kontrak domain yang tidak boleh dilanggar

| ID | Invarian / aturan | Ketika data tidak memenuhi |
|---|---|---|
| `DR-01` | Satu `event_id` menurut FWI-02 = identitas kejadian yang dalam kontrak prototipe disebut `waste_event_id`; jangan membuat dua ID untuk satu occurrence | Tolak ID bentrok; simpan hubungan alias bila perlu tanpa duplikasi entitas |
| `DR-02` | Event dapat memiliki 0..n Measurement; timbang ulang tidak otomatis menambah waste generation | Simpan observasi terpisah; **jangan sum otomatis** |
| `DR-03` | Transfer, rescue, disposition adalah proses/record terkait; tidak membentuk generation baru tanpa kejadian sumber berbeda yang dibuktikan | Tunda hitung; minta lineage/bukti |
| `DR-04` | `occurred_at` ≠ `recorded_at` ≠ `operation_date` | Waktu tidak dapat digantikan diam-diam; syarat format/timezone = OPEN |
| `DR-05` | Jika prosedur penimbangan gross/tare tersedia dan valid, `net = gross - tare`; massa fisik negatif/non-finite tidak diterima | Tandai invalid/blocked, pertahankan input asal dan alasan |
| `DR-06` | Nilai asli, `original_unit`, `mass_basis`, `measurement_method`, instrument/sample bila relevan, provenance dan kualitas harus dapat ditelusuri | Jangan beri angka `canonical_mass_kg` hasil konversi fiktif |
| `DR-07` | Measurement untuk basis `raw`, `after_preparation`, `cooked`, `ready_to_eat`, `as_served`, `other_documented` bersifat terlabel; `plate_leftover` adalah stream/event type dalam FWI-02 v1.0 | Jangan lakukan konversi raw↔cooked tanpa bukti recipe/batch yield; konflik FWI-04 dicatat di OPEN-01 |
| `DR-08` | `measured_zero`, `missing`, `not_measured`, `estimated`, `blocked`, `not_applicable` merupakan **konsep keadaan yang tidak boleh disamakan**, tetapi **bukan satu enum final**: pisahkan `observation_status`, `measurement_method`, `validation_status` dan alasan blokir | Jangan impute kosong→nol; jangan menggabungkan semua label itu menjadi satu field |
| `DR-09` | Status klasifikasi regulasi, food safety, edible fraction, avoidability, dan kategori analitik adalah sumbu terpisah | Jangan turunkan satu status otomatis dari status lain |
| `DR-10` | `at_risk_surplus` tidak otomatis `actual_loss_discard` | Tampilkan jenis/status event; jangan hitung sebagai discarded tanpa status valid |
| `DR-11` | Rasio memerlukan numerator/denominator sepadan (tahap, waktu, populasi, item/batch/session, unit, mass basis) | `N/A/blocked` + alasan; bukan 0% |
| `DR-12` | Agregasi massa fisik lintas basis hanya dapat dipertimbangkan jika **tidak overlap** dan komposisi basis diberi label; bukan satu rasio efisiensi | Tampilkan per basis/default; jangan buat rasio campuran |
| `DR-13` | Riwayat validasi/koreksi dapat ditelusuri; *ValidationRecord* konseptual terpisah dari Measurement; penetapan measurement rujukan belum otomatis | Simpan status/riwayat tanpa menghapus observasi lama; keputusan = OPEN-05 |
| `DR-14` | Food rescue tidak boleh dipromosikan otomatis tanpa konfirmasi layak & aman serta kewenangan | Block saran/alur rescue; referensikan otoritas/SOP yang berlaku |
| `DR-15` | Jangan klaim residual sebagai waste/fraud atau menyatakan ambang lulus universal | Hanya status/penjelasan residual yang didukung metode |
| `DR-16` | Status KPI metodologis dan kesiapan data harus terpisah; HELD tetap OFF | Tolak kalkulasi/visualisasi angka HELD |

**Catatan implementasi kode yang sudah ada:** `src/fwi/domain/measurements.py` masih prototipe v0.1 yang membatasi unit ke `kg` dan memakai vocabulary provisional. **Itu adalah keterbatasan kode saat ini, bukan keputusan standar unit final**. Saat menambah support unit lain, perlu spesifikasi konversi, provenance dan tes tambahan terlebih dahulu.

## 9. Konsep informasi dan layar web (arah produk, bukan desain final)

| Layar P0 | Pengguna | Data/tindakan yang harus tersedia | Larangan misleading UI |
|---|---|---|---|
| `UI-01` Sign in & Site Context | Semua pengguna | Pilih organisasi/site aktif sesuai membership | Jangan tampilkan site yang tidak berizin |
| `UI-02` Data Quality Dashboard | Pengelola/reviewer | Jumlah event/measurement, status lengkap/kurang, antrean, filter, drill-down | Jangan tampilkan 'total food waste' dari seluruh event at-risk atau total basis campuran tanpa label |
| `UI-03` Event Ledger & Detail | Pencatat/reviewer/auditor | Filter stage/type/date/status; event detail, measurement, provenance | Remeasurement tidak menjadi event baru |
| `UI-04` Quick Capture | Pencatat | Event + measurement sesuai field kondisional; validasi inline; label demo | Missing tidak diberi default 0 kg |
| `UI-05` Validation & Audit | Reviewer/auditor | Data source, evidence, semua observasi, alasan review, log koreksi | Tanpa silent overwrite atau auto approve |
| `UI-06` Export | Pengguna berizin | Filter, pilihan format, preview dan metadata | Tidak boleh mengekspor di luar scope |
| `UI-07` Master & Access | Administrator | Site, permission, master dan status/versi | Jangan jadikan jabatan lapangan sebagai role nasional baku |

**Status layar dan tindakan pengguna:** Setiap layar harus mendefinisikan *empty*, *loading*, *validation error*, *permission denied*, *missing data*, *blocked/unreviewed*, dan *success* pada FWI-UX-001. Tombol yang belum didukung tidak boleh menyiratkan transaksi sudah disetujui atau data sudah valid.

**UX constraints:** responsif untuk desktop dan layar kecil, label formulir jelas, navigasi keyboard, kontras terbaca, penjelasan istilah, input ringkas. Rincian alur, wireframe, komponen desain dan navigasi final akan ditetapkan di **FWI-UX-001**, bukan di PRD ini.

**Sketsa navigasi P0, `PROPOSED` (bukan instruksi coding langsung):** `Dashboard Mutu Data / Event Ledger / Catat Kejadian / Review & Audit / Export / Master & Akses` — menu disesuaikan role.

## 10. Nonfunctional requirements (NFR)

| ID | Kebutuhan | Kriteria/bukti prototipe | Status |
|---|---|---|---|
| `NFR-01` | Akses minim dan pembatasan site/role | Tes akses positif dan negatif, termasuk direct-object access | REQUIRED-P0 |
| `NFR-02` | Privasi & minimisasi | Hanya fixture sintetis; tidak ada field nama/ID siswa secara default; logging tidak membocorkan rahasia | REQUIRED-P0 |
| `NFR-03` | Integritas & audit | Identitas stabil, foreign-key konseptual, riwayat perubahan, siapa/kapan/alasan; no silent overwrite | REQUIRED-P0 |
| `NFR-04` | Keamanan teknis | Secret tidak di repository, transport terlindungi pada deployment, izin file bukti, rencana backup/restore | Desain wajib; review produksi terpisah |
| `NFR-05` | Keterpakaian & aksesibilitas | Form responsif, error di field, label dan keyboard access; evaluasi pengguna = OPEN | REQUIRED prototype |
| `NFR-06` | Observability operasional | Error validasi dipisahkan dari error sistem; tidak log data sensitif | PROPOSED pada desain teknis |
| `NFR-07` | Kinerja / availability / retention | Angka target SLA, latensi, beban, RPO/RTO dan retensi **belum ditetapkan** | OPEN-06; jangan mengarang angka |
| `NFR-08` | Offline & sinkronisasi | Kebutuhan, keamanan, konflik revisi, dan biaya harus dievaluasi sebelum disetujui | OPEN-07 |
| `NFR-09` | Interoperabilitas | CSV/XLSX export dengan scope dan provenance; integrasi resmi hanya bila berizin | REQUIRED-P0 untuk ekspor; API di luar scope |
| `NFR-10` | Reproducibility | Unit test, fixture, dokumentasi command test, versi rule/definition dan output sintetis | REQUIRED-P0 |

## 11. Kebijakan KPI dan analitik

Menurut **FWI-03 v1.3**, katalog berisi **24 kandidat**: **3 lulus desain rumus** (`OP-03`, `OP-04`, `OP-10`); **18 conditional**; **3 HELD** (`OP-08`, `FI-02`, `NI-03`). **Tidak satu pun berarti KPI resmi BGN atau tervalidasi operasional.**

- **P0:** dashboard **mutu data dan rekaman**; tidak perlu KPI formula engine. Jika menampilkan massa, wajib tunjukkan cakupan event, status, unit, basis, dan kemungkinan overlap.
- **P2, preview terkontrol:** tiga design-pass hanya dengan prasyarat input + kontrol FWI-03 dipenuhi, formula/version/provenance tercatat, label *belum tervalidasi operasional*.
- **18 conditional:** hanya katalog atau simulasi internal yang memenuhi prasyarat; bukan angka KPI aktif.
- **3 HELD:** disabled di UI, API, backend, ekspor KPI, demo, dan test produksi; daftar boleh menyebut status HELD tanpa angka.
- **Skenario regresi:** FWI-03 v1.3 memuat 30 skenario desk regression; sebelum menyatakan cakupan prototype FWI-04 terpenuhi, **petakan dan evaluasi seluruh 30 skenario** (PASS/FAIL/NOT TESTED/NOT APPLICABLE dengan alasan dan bukti). Pada tiap milestone parsial cukup uji kasus yang relevan, tetapi jangan mengklaim acceptance penuh. **11 test lokal yang sudah lulus tidak menggantikannya.**

## 12. Acceptance criteria P0 — dapat dieksekusi sebagai tes

`Given / When / Then` di bawah memakai **fixture sintetis**. Setiap tes harus mencatat ID, hasil, dan lokasi implementasi; tidak semua sudah ditulis saat PRD ini dibuat.

| ID | Given / When / Then yang harus terbukti | Requirement |
|---|---|---|
| `AC-01` | **Given** pengguna hanya punya izin site A; **when** membuka data site B melalui UI/API/object ID; **then** akses ditolak tanpa membocorkan konten B | FR-001, NFR-01 |
| `AC-02` | **Given** event tersimpan; **when** event ID identik disubmit lagi; **then** duplikasi ID ditolak; request idempotency/semantik retry detail = OPEN | FR-003, DR-01 |
| `AC-03` | **Given** satu event dan dua observasi; **when** di-list; **then** jumlah event tetap 1, kedua measurement terpisah, tidak ada agregasi otomatis | FR-003/004, DR-02 |
| `AC-04` | **Given** gross 2,4 kg, tare 0,4 kg, net 2,0 kg; **when** divalidasi; **then** accepted secara aritmetika dan sumber tetap tersimpan | FR-004, DR-05 |
| `AC-05` | **Given** gross lebih kecil dari tare/negatif/NaN/Infinity; **when** divalidasi; **then** tidak dianggap pengukuran valid, alasan spesifik dicatat | FR-004/006, DR-05 |
| `AC-06` | **Given** 0 kg valid dan satu catatan missing; **when** diringkas; **then** status/angka tidak disamakan dan missing tidak menjadi 0 | FR-004/007, DR-08 |
| `AC-07` | **Given** dua kondisi massa tak sepadan; **when** modul yang mendukung rasio diminta menghitung; **then** hasil `blocked/N/A` dan ada alasan, tanpa denominator palsu | DR-07/11; **guardrail lintas fase, bukan fitur rasio wajib pada P0** |
| `AC-08` | **Given** event at-risk surplus; **when** dashboard discarded dibuka; **then** event tidak dimasukkan sebagai actual discard tanpa bukti/status relevan | FR-003/007, DR-10 |
| `AC-09` | **Given** reviewer meminta koreksi; **when** rekaman diperbaiki; **then** histori sebelumnya, reviewer, waktu dan alasan tetap terlacak | FR-006, DR-13 |
| `AC-10` | **Given** measurement dengan bukti; **when** pengguna berizin membuka detail; **then** provenance dan bukti tersedia; pengguna tak berizin tidak dapat membuka bukti | FR-005, NFR-01 |
| `AC-11` | **Given** filter data site A; **when** ekspor CSV/XLSX; **then** metadata event/measurement/unit/basis/status/provenance terjaga dan tidak memuat site B | FR-008, NFR-09 |
| `AC-12` | **Given** `food_safety_status=not_assessed`; **when** alur rescue diajukan; **then** tidak ada tindakan otomatis atau label 'aman' | DR-14; **P1 gate, tidak diwajibkan sebagai UI P0** |
| `AC-13` | **Given** permintaan hasil `OP-08`, `FI-02`, atau `NI-03`; **when** fitur KPI dipanggil; **then** disabled/held tanpa nilai numerik | DR-16; **guardrail lintas fase, bukan kewajiban membangun KPI engine P0** |
| `AC-14` | **Given** status regulasi `pending_assessment` dan edibility berbeda; **when** disimpan; **then** kedua klasifikasi tidak dipaksa setara | DR-09 |
| `AC-15` | **Given** event dan measurement dengan waktu kejadian serta input berbeda; **when** diekspor; **then** keduanya tetap dapat dibedakan bersama operation_date | FR-003/008, DR-04 |
| `AC-16` | **Given** fixture P0; **when** unit test dan uji alur produk dijalankan; **then** hasil dapat diulang, bukti disimpan, dan skenario FWI-03 yang relevan terpetakan/tidak diakui lulus jika belum diuji | NFR-10 |

**Klasifikasi penerimaan:** AC-01–06, AC-08–11, dan AC-14–16 menjadi jalur pemeriksaan P0 ketika modul terkait dibangun. AC-07 merupakan guardrail *jika* rasio diproses (tidak mewajibkan engine rasio pada P0); AC-12 merupakan *future P1 safety guardrail*; AC-13 merupakan *global held-KPI gate* yang tetap berlaku tanpa mengharuskan pembuatan KPI engine. Seluruh acceptance **berstatus NOT IMPLEMENTED/NOT VERIFIED untuk web P0** sampai ada bukti uji baru. Tidak ada AC yang dianggap lulus hanya karena dicantumkan di PRD.

**Catatan tes saat ini:** Hasil FWI-DEV-002/003 yang dilaporkan pengguna adalah **11/11 unit test lulus di Windows**. Pengujian itu meliputi aritmetika, zero/missing, basis wajib, repeated measurement, missing event, nilai non-finite, dan pemisahan waktu. **Belum menguji P0 web, autentikasi, audit persistence, evidence storage, atau ekspor.**

## 13. Konsep arsitektur awal dan batas keputusan

**Dari FWI-04:** pendekatan **modular monolith** untuk MVP web responsif; pemisahan logis presentasi, layanan aplikasi, data transaksional, mutu/audit, analitik, interoperabilitas. **Status: rekomendasi desain, belum keputusan stack.**

- Frontend/UI menangani interaksi, **bukan** sumber formula, otoritas status data atau kontrol akses tunggal.
- Application/domain layer menegakkan validasi, izin, dedup, correction, dan provenance.
- Relational storage dan evidence storage adalah pola yang direkomendasikan; skema, vendor dan hosting belum dipilih.
- Export berjalan melalui validasi permission dan menjaga lineage; adapter API sistem eksternal hanya jika ada akses yang sah dan spesifikasi nyata.
- File Python `src/fwi/domain/` adalah **prototipe model/validasi**, bukan keputusan bahwa seluruh backend final wajib Python.

**FWI-ARCH-001 harus menghasilkan:** (a) diagram konteks, komponen, *trust boundaries* dan alir data; (b) ERD konseptual/relasional P0 + data dictionary dan migrasi; (c) ownership validasi di backend, model integritas, koreksi dan audit; (d) kontrol akses lintas tenant/site dan evidence storage; (e) draft kontrak API/DTO dan error states; (f) *option matrix* stack, DB, hosting, biaya, konektivitas/offline, keamanan serta ADR keputusan. **Jangan membuat tabel atau endpoint final sebelum artefak ini direview**.

**FWI-ARCH-001 harus memutuskan atau mendokumentasikan:** strategi identitas/auth, framework/backend/frontend, database, model audit/event correction, penyimpanan bukti, keamanan, biaya, lingkungan demo, deployment, offline feasibility, dan konvensi paket/tes. Keputusan yang belum ada **tidak boleh diisi oleh AI secara default**.

## 14. Status implementasi aktual & pengembangan bertahap

**Per 3 November 2026, berdasarkan percakapan/hasil terminal pengguna:**

| Pekerjaan | Hasil | Status |
|---|---|---|
| `FWI-DEV-001` | Kontrak konseptual `docs/domain/waste-event-measurement-v0.1.md` | Selesai sebagai dokumen **PROVISIONAL** |
| `FWI-DEV-002` | Prototipe model/validasi dan test Python | 11/11 tes domain lulus; bukan P0 selesai |
| `FWI-DEV-003` | Refactor ke `src/fwi/domain/{events,measurements,validation}.py` dan `tests/test_domain_validation.py` | PR merged ke `main`; lokal sinkron pada commit `7beec00` |
| MVP1 P0 | Login, master data, persistent DB, ledger web, evidence, review audit, ekspor, quality dashboard | **BELUM DIBANGUN** |
| FWI-PROD-001 | PRD ini | **FINALIZED AS WORKING BASELINE; bukan approval implementasi nyata/produksi** |

**Urutan kerja yang disarankan (tidak memulai tugas otomatis):**

1. `FWI-PROD-001`: **selesai sebagai working baseline v0.1 melalui finalisasi dokumen ini**; simpan melalui PR dokumentasi dan catat review produk formal apabila dilakukan (bukan release approval).
2. `FWI-ARCH-001`: konteks sistem, batas modul, data flow/ERD konseptual, opsi stack dan decision records.
3. `FWI-UX-001`: information architecture, urutan layar, user flow P0, state loading/empty/error/blocked dan wireframe.
4. `FWI-DEV-004+`: potong P0 menjadi tugas kecil: Foundation/access → event ledger/measurement persistence → evidence/quality/review/audit → export/dashboard mutu; setiap task satu branch/PR + tes.
5. P1/P2 hanya setelah dependensi dan gate relevan terpenuhi.

**Penyelarasan dengan FWI-04 epic:** A (foundation/access), B (event & measurement), D (data quality, audit, export) membentuk P0; C (workflow lengkap) masuk P1; E (KPI & analytics) terkontrol; F (hardening) lintas tahap sebelum release.

## 15. Decision & risk register (tidak boleh diputuskan otomatis oleh AI)

| ID | Topik | Status | Keputusan yang dibutuhkan / pemilik review |
|---|---|---|---|
| `OPEN-01` | FWI-02 v1.0 vs FWI-04 v0.1: mass basis, `plate_leftover`, aturan taxonomy | OPEN | Rekonsiliasi domain/metodologi sumber; jangan freeze enum |
| `OPEN-02` | Role, segregation of duties, RACI, kewenangan SOP setiap lokasi | OPEN | Konfirmasi berwenang sebelum pilot; role tetap configurable |
| `OPEN-03` | Bukti wajib per jenis event, protokol penimbangan, alat/tare/sampling | OPEN | Spesifikasi FWI-03 dan review proses/metrologi; jangan buat threshold |
| `OPEN-04` | Vocabulary final untuk observation/validation/review & correction policy | OPEN | Standarisasi FWI-03 dan domain; sementara label PROVISIONAL |
| `OPEN-05` | Remeasurement: selected measurement, supersession, void, exception & idempotency | OPEN | Decision record serta skenario tes sebelum KPI/agregasi |
| `OPEN-06` | Target performa, SLA, ketersediaan, backup/RPO/RTO, retensi | OPEN | Kebutuhan/biaya/risiko pada FWI-ARCH-001 |
| `OPEN-07` | Offline-first, sinkronisasi, konflik input, keamanan perangkat | OPEN | Uji kebutuhan konektivitas dan risiko; belum implementasi |
| `OPEN-08` | Framework, DB, hosting, authentication provider, cost cap | OPEN | Bandingkan opsi di FWI-ARCH-001; jangan pilih hanya karena populer |
| `OPEN-09` | Hak akses data dan API resmi BGN/sistem pemerintah | BLOCKED | Dokumen/otorisasi resmi; no fabricated endpoints |
| `OPEN-10` | Food safety dan mekanisme rescue/disposition | BLOCKED | SOP/aturan dan pengambil keputusan berwenang, sebelum fungsi lapangan |
| `OPEN-11` | Finance cost ownership/yield dan nilai ekonomi | DEFERRED-P2 | Source cost, objektif keputusan dan metode terverifikasi |
| `OPEN-12` | Gate G1–G5 / persetujuan resmi lapangan | OPEN/BLOCKED | Catatan persetujuan terpisah; tidak dipenuhi oleh PRD atau tes lokal |

**Status gate (berdasarkan FWI-04 v0.1, bukan klaim kemajuan terbaru):** G0 desk-validation pada level dokumen; G1 persetujuan formal belum tercatat; G2 expert review, G3 bench testing, G4 field validation, G5 KPI activation belum selesai/diizinkan. Pengembangan sintetis boleh berlanjut, **operasional nyata tidak otomatis diizinkan**.

## 16. Release boundary dan Definition of Done

### DoD sebuah task developer

- Scope/task ID jelas, requirement dan file tujuan disebut; tidak ada perubahan di luar izin.
- Kode/UX mematuhi kontrak domain, data sintetis, status KPI dan akses.
- Tes relevan dapat dijalankan di Windows; perintah dan hasil dilaporkan.
- Tidak ada secret, data nyata, autogenerated KPI atau konektor resmi fiktif.
- `git diff`, `git status` dan dampak kompatibilitas dijelaskan.
- Catatan keputusan `OPEN` diperbarui; tidak diam-diam dianggap selesai.

### DoD PRD v0.1 sebagai controlled working baseline

- [x] Ruang lingkup, FR/DR/AC, P0/P1/P2, dan non-goals dirumuskan dan ditelusurkan ke sumber kerja.
- [x] Ketidakselarasan `OPEN-01`, gate metodologis, dan kebutuhan yang belum diputuskan ditandai; tidak dibekukan sebagai aturan final.
- [x] Kontrak penggunaan AI, aturan perubahan, serta kebutuhan keluaran FWI-ARCH-001/FWI-UX-001 dinyatakan.
- [ ] File terpasang di `docs/product/PRD-v0.1.md` pada repository GitHub melalui PR dokumentasi; **harus diverifikasi di repository, belum boleh diklaim dari file unduhan saja**.
- [ ] Review/persetujuan formal pemilik produk/domain tercatat bila diwajibkan oleh tata kelola proyek; statusnya masih **belum terbukti**.
- [x] Dokumen tidak menyatakan release, pilot, SOP, maupun operational validation.

**Batas persetujuan:** kebutuhan kerja untuk desain dan prototype sintetis dianggap terkonsolidasi; ini **bukan otorisasi untuk penggunaan nyata**.

### DoD MVP1 prototype (bukan produksi)

- FR-001..FR-008 yang disetujui berfungsi dengan fixture sintetis, memenuhi acceptance yang berlaku di §12.
- Permission, validasi, audit lineage, data state dan ekspor mempunyai bukti tes.
- Seluruh 30 skenario desk regression FWI-03 memiliki pemetaan dan status jujur (`PASS`, `FAIL`, `NOT TESTED`, atau `NOT APPLICABLE` dengan justifikasi). Untuk menyatakan acceptance prototype FWI-04 penuh, semua skenario yang diwajibkan harus dijalankan/lulus sesuai gate; 11 tes unit domain tidak cukup.
- Data tampak jelas berlabel `SYNTHETIC/DEMO`, dan tidak ada KPI HELD yang terhitung.
- Security/UX/architecture review prototipe selesai; isu residual terdokumentasi.

### Gate di luar ruang lingkup PRD

Sebelum live pilot, deployment nyata, atau aktivasi KPI: persetujuan, data rights, penilaian keamanan/privasi, uji alat dan metode, review ahli dan lapangan, serta gate G1–G5 sesuai proses harus dibuktikan oleh pihak berwenang. **Dokumen dan kode prototipe tidak menggantikan proses tersebut.**

## 17. Traceability, implementation mapping, dan instruksi bagi agen

**Disiplin perubahan:** setiap issue/PR berikutnya harus menunjuk minimal satu `FR-*` (atau NFR/DR untuk perubahan teknis), tes `AC-*` yang relevan, file yang diubah, dan keputusan `OPEN-*` yang membatasi. Tidak boleh memasang UI/DB yang menunjukkan persetujuan atau hasil analitik tidak sah.

### 17.1 Traceability ringkas untuk reviewer & AI

| Kebutuhan | Sumber utama | Verifikasi yang diharapkan |
|---|---|---|
| FR-001/002 | FWI-02 entitas MVP1; FWI-04 §2–3 | AC-01; master data/permission tests baru |
| FR-003 | FWI-02 §5–7; kontrak DEV-001 | AC-02,03,08,15; sebagian 11 tes domain |
| FR-004 | FWI-02 §7, dictionary; FWI-03 pengukuran | AC-04,05,06,07; sebagian 11 tes domain |
| FR-005/006 | FWI-02 Evidence/Validation/Audit; FWI-04 §5–6 | AC-09,10; implementasi P0 belum ada |
| FR-007/008 | FWI-04 §3,9 | AC-06,08,11; implementasi P0 belum ada |
| DR-09/10/14 | FWI-01 klasifikasi & food safety; FWI-02 BR-12/13 | AC-08,12,14; uji sintetik/safety gate |
| DR-11/12/16 | FWI-02 BR; FWI-03 v1.3 KPI; FWI-04 §7 | AC-07,13,16; **jangan aktifkan KPI HELD** |
| NFR | FWI-04 §10 | Unit/integration/security/UX tests per tahap |

### 17.2 Definition of Ready (DoR) untuk FWI-ARCH-001 dan FWI-UX-001

| Paket pekerjaan | Input minimal | Output yang akan direview | Penanda selesai |
|---|---|---|---|
| FWI-ARCH-001 | PRD v0.1; FWI-02 v1.0; FWI-03 v1.3; kontrak domain + kode prototipe | Context/component/data-flow diagrams; P0 ERD; data dictionary; draft API contract; opsi stack/DB; ADR + risiko | Tautan `FR/DR/OPEN` terlihat; tidak ada keputusan teknis final tanpa alasan dan review |
| FWI-UX-001 | PRD v0.1, keputusan akses dan arsitektur relevan | Sitemap, journey, wireframe P0, form state, permission/error/empty/loading states | Setiap layar mengacu `UI-*` + `FR-*` + `AC-*` dan tidak menyamakan missing dengan zero |
| FWI-DEV-004+ | PRD + desain teknis yang direview + task scoped | Satu perubahan kecil, unit/integration tests, diff, status Git dan dokumen keputusan | Tes jelas, tidak ada scope creep/dependency tidak disetujui, lulus review PR |

### 17.3 Tabel risiko kebingungan AI (larangan keputusan implisit)

| AI melihat istilah ini | Makna yang benar di PRD | Yang tidak boleh dilakukan |
|---|---|---|
| `P0` | Prioritas requirement MVP, bukan status implementasi | Menyatakan sudah selesai atau membangun semua sekaligus |
| `PROVISIONAL` | Dapat diprototipekan dengan asumsi eksplisit | Menetapkan enum/fakta/regulasi permanen |
| `VALIDATED` / `11 tests passed` | Tes lokal tertentu telah dijalankan | Mengklaim seluruh AC/30 scenario/validasi lapangan telah lolos |
| `At-risk surplus` | Material berpotensi menjadi loss/waste | Menambahnya otomatis ke actual discard |
| `Measurement` | Observasi atas event, bisa berulang | Menganggap setiap remeasurement sebagai event/kuantitas baru |
| `HELD KPI` | Ditahan dan tidak menghasilkan angka | Menyediakan endpoint/angka hasil meskipun layar disembunyikan |
| `modular monolith` | Rekomendasi bentuk arsitektur FWI-04 | Memilih framework/vendor DB tanpa ADR |

## 18. Lampiran — Template instruksi implementasi AI (gunakan di setiap task, bukan untuk memulai sekarang)

```text
TASK ID: FWI-DEV-XXX
SOURCE: docs/product/PRD-v0.1.md, requirement FR-XXX/DR-XXX/AC-XXX
STATUS: PROVISIONAL / SYNTHETIC-ONLY
BRANCH: <nama-branch-task>
GOAL: <satu hasil kecil yang dapat diuji>
IN SCOPE: <daftar konkret>
OUT OF SCOPE: <daftar konkret>
ALLOWED FILES: <path yang boleh dibaca/diubah>
PRECONDITIONS/OPEN DECISIONS: <id OPEN-.. + fallback jika diizinkan>
ACCEPTANCE: <AC terkait + test command dan hasil yang harus terlihat>
FORBIDDEN: real SPPG data; government API assumptions; held KPI activation;
           unapproved stack/dependencies; silent overwrite; scope creep.
DELIVER: files changed, rationale, tests pass/fail, remaining blockers, git status.
NO COMMIT/PUSH unless explicitly authorized.
```

**Aturan penutup:** Bila AI mengusulkan fitur baru yang tidak dapat ditautkan ke ID FR/DR/AC, usulan itu masuk *backlog proposal* dan **tidak langsung dikodekan**. Jika PRD dan source baseline berbeda, tulis `BLOCKED BY OPEN-...` dan eskalasi keputusan alih-alih mengarang ketentuan.

---

## 19. Kendali versi, persetujuan dan serah-terima

| Item | Catatan |
|---|---|
| Versi | `v0.1` — controlled working baseline |
| Tanggal konsolidasi | 3 November 2026 |
| Perubahan dari draf sebelumnya | Penegasan status baseline internal; kendali perubahan; AC/P1 boundary; matriks persyaratan arsitektur/UX; 30 skenario regresi; aturan keputusan AI |
| Disusun atas dasar | FWI-01 v1.0, FWI-02 v1.0, FWI-03 v1.3, FWI-04 v0.1, serta FWI-DEV-001/002/003 dan diskusi proyek |
| Bukti persetujuan produk formal | **Belum tercatat** — tindak lanjut bila ada tata kelola penandatanganan |
| Bukti penempatan repository | **Belum ada pada saat file ini dibuat** — target `docs/product/PRD-v0.1.md` |
| Izin pemakaian | Acuan **desain dan prototype sintetis**; **bukan** spesifikasi produksi atau otorisasi pilot |
| Pemicu revisi `v0.2` | Rekonsiliasi OPEN-01, perubahan prioritas, keputusan FWI-ARCH/UX, review ahli/gate, temuan tes, atau perubahan baseline riset |

**Aturan handoff untuk AI:** baca ringkasan §0–3, backlog §7, invarian §8, acceptance §12, decision register §15, dan DoR §17 **sesuai tugas**. Untuk coding pilih hanya file dan FR terkait; jangan meminta AI memuat seluruh dokumen sumber 1–4 sekaligus kecuali ada konflik/bukti yang perlu ditinjau.

**Penutup:** PRD v0.1 **sudah difinalisasi sebagai baseline kerja internal untuk desain dan pengembangan sintetis**. Keputusan formal organisasi, taxonomy dan metodologi tertentu, ERD/stack/API, serta validasi lapangan tetap **OPEN / BLOCKED / PROVISIONAL** sesuai isi dokumen; status tersebut **tidak hilang** karena finalisasi PRD.
