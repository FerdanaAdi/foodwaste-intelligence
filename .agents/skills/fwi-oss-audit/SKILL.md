---
name: fwi-open-source-reference-auditor
description: Audit repository open-source pihak ketiga untuk dijadikan referensi atau komponen FoodWaste Intelligence (FWI), dengan inventaris tools AI, keterlacakan sumber, pemeriksaan lisensi, kecocokan FWI-04, dan rencana adopsi aman.
---

# FWI — Open-Source Reference Auditor & AI Development Workflow

## Kapan digunakan
Gunakan skill ini ketika pengguna meminta: (1) mengingat atau mencari daftar repository GitHub referensi, (2) membandingkan repository open-source untuk aplikasi FWI, (3) memilih teknologi/stack, (4) mengadaptasi komponen atau pola desain dari proyek pihak ketiga, atau (5) mengatur pekerjaan Codex, Copilot, Antigravity, dan GLM.

## Identitas dan batas proyek
- Proyek: **FoodWaste Intelligence (FWI)** untuk pengukuran, pencatatan, analisis, dan dukungan keputusan terkait food loss/waste pada proses MBG/SPPG.
- FWI adalah **lapisan analitik tambahan**, bukan pengganti sistem pemerintah, bukan sistem akuntansi resmi, dan bukan aplikasi yang otomatis berhak menggunakan API SIPGN/AKSIS/LPDH/Stop Boros Pangan.
- Acuan internal berurutan: `FWI-01 Research Foundation v1.0 Consolidated`; `FWI-02 Critical Reconciliation and Architecture Baseline v1.0`; `FWI-03 Consolidated Methodology v1.3` beserta G0/G1–G2; `FWI-04 MVP Product Requirements & Solution Blueprint v0.1`.
- **FWI-04 merupakan baseline desain MVP, bukan spesifikasi produksi.** Jangan tetapkan stack sebagai keputusan final; baseline bersifat stack-agnostic sampai pertimbangan offline, biaya, keamanan, dan operasi diselesaikan.
- Status metodologi per dokumen saat ini: 24 kandidat KPI (3 lulus desain rumus, 18 bersyarat, 3 ditahan: OP-08, FI-02, NI-03); G0 desk validation selesai, persetujuan formal/ahli/bench/field/aktivasi belum ditutup. Periksa versi dokumen paling baru sebelum membuat klaim.

## Inventaris tools AI yang dikonfirmasi pengguna
- ChatGPT Plus + Codex.
- Google AI Pro / Gemini + Antigravity.
- GitHub Copilot **Student**.
- Z.ai ZCode Start Plan, GLM-5.3, GLM-5.3-Flash (akses dan kuota perlu diperiksa ulang; tangkapan layar 2 Nov 2026 bukan status real-time).
- Git dan GitHub untuk source code/rujukan; NotebookLM dan Gemini Deep Research pernah digunakan dalam rangkaian riset.

**Jangan** menganggap semua tools sudah terintegrasi, atau menganggap semua fitur paket pasti tersedia. Sebut peran tools sebagai *workflow usulan* jika belum diuji.

## Pembedaan mutlak: repository lama vs kandidat baru
Sebelum menampilkan repository, tentukan dan tandai salah satu:
1. **`USER_REFERENCED_VERIFIED`** — nama/URL persis berasal dari pesan pengguna, transkrip, atau arsip percakapan yang benar-benar berhasil dibaca.
2. **`SOURCE_MENTIONED_GENERIC`** — hanya ada kategori/nama generik (contoh 'Food Waste Management Dashboard open-source'); jangan mengarang URL atau menyamakannya dengan repo tertentu.
3. **`NEW_CANDIDATE_VERIFIED`** — repository nyata ditemukan dari pencarian GitHub saat ini; **bukan** klaim bahwa dulu disebut pengguna.
4. **`UNVERIFIED`** — informasi, URL, lisensi, versi, atau keberadaan belum bisa dibuktikan.

User menegaskan GitHub yang dimaksud adalah **repository orang lain untuk dipelajari/diadopsi**, bukan akun atau repository pribadi miliknya. Jangan mengalihkan fokus ke username GitHub pribadi tanpa kebutuhan jelas.

Jika user meminta 'cek semua chat di folder FWI', jelaskan batas akses transkrip: berkas Project/Library dan cuplikan konteks tidak sama dengan seluruh pesan lama; jangan pernah menyatakan sudah membaca semua chat tanpa akses langsung.

## Cara audit repository (jalankan berurutan)
1. **Kunci kebutuhan fitur** dari FWI-04: P0 organisasi/role, master data, waste event, measurement, quality+audit, export; P1 linkage/disposition/dashboard; P2 analytics lanjutan.
2. **Cari bukti**: URL repo resmi, README, LICENSE, package manifest, dokumentasi penggunaan, contoh UI, struktur source, commit dan release, issue/PR, status maintenance, fitur yang relevan.
3. **Periksa lisensi**: file LICENSE yang berlaku, lisensi dependencies, atribusi, kewajiban NOTICE, copyleft/network copyleft, trademark, dan kemungkinan lisensi komersial ganda. Bila tidak jelas, status **jangan salin kode** hingga dikaji. Proyek publik di GitHub tidak otomatis boleh dicopy.
4. **Audit kecocokan teknis**: stack, database, auth, mobile responsiveness, offline, deployment, test, security, data model, i18n, resource/maintenance burden. Bedakan *mengambil inspirasi UI*, *mengadopsi library*, *mengintegrasikan layanan*, dan *fork/reuse source*.
5. **Audit domain FWI**: jangan menggandakan waste event bila dilakukan remeasurement, transfer, disposition, rescue; simpan raw/cooked/served mass basis terpisah; bedakan measured zero, missing, estimated, blocked, N/A; net = gross − tare; perlakukan safety/edible/avoidability sebagai atribut berbeda; jangan mengaktifkan 3 KPI held.
6. **Lakukan proof-of-concept terisolasi** dengan **data sintetis**, tanpa identitas siswa, tanpa data sensitif SPPG, tanpa integrasi API resmi yang belum diizinkan. Simpan bukti uji dan jejak adopsi.
7. **Review independen** oleh AI/anggota lain; jalankan tes otomatis (termasuk 30 skenario meja FWI-03 jika terkait KPI/ledger); dokumentasikan caveat dan keputusan adopsi.

## Kerangka penilaian (bukan penilaian repo yang sudah diberikan)
Bobot rekomendasi awal: kecocokan kebutuhan FWI 30%, lisensi/legal reuse 20%, kualitas/keamanan 20%, pemeliharaan 15%, kemudahan adaptasi 15%. Skor 0–5 per dimensi. Bila bukti tidak lengkap, tulis `N/A — belum terverifikasi`, **jangan beri skor semu**. Jangan jadikan skor agregat pengganti legal/security gate.

Kategori keluaran: `ADOPSI_KOMPONEN`, `PELAJARI_POLA`, `PAKAI_TERPISAH`, `TUNDA`, atau `TOLAK`.

## Kandidat baru dari penelusuran sebelumnya (bukan daftar lama pengguna)
Untuk diverifikasi ulang jika diminta, lihat `references/repo-register.md`:
- grocy/grocy — inventory pangan;
- getodk/collect, getodk/central — mobile data collection dan backend;
- marmelab/react-admin — UI admin;
- shadcn-ui/ui — komponen UI;
- apache/superset — dashboard/BI;
- mealie-recipes/mealie — resep/menu;
- frappe/erpnext — proses ERP/stok.

**Jangan** berasumsi seluruhnya cocok, mempunyai lisensi yang sama, kompatibel dalam satu app, atau memang pernah disebut user. Verifikasi ulang README/Licence dan aktivitas repo sebelum merekomendasikan adopsi kode.

## Alur pembagian kerja antartools (usulan)
- **ChatGPT / Codex:** uraikan requirement FWI ke task kecil; desain dan implementasi modul; tulis tes.
- **GitHub Copilot Student:** bantu inline coding, navigasi, test, dan refactor pada repo kerja.
- **Gemini / Antigravity:** eksperimen prototipe atau alternatif implementasi yang independen.
- **GLM-5.3:** reviewer kode/arsitektur independen; **GLM-5.3-Flash:** tugas ringan atau batch checks.
- **Manusia pemilik proyek:** menerima/menolak arsitektur, lisensi, data nyata, dan keputusan rilis. Hasil AI tidak otomatis menjadi keputusan.

Satu feature branch / PR untuk satu perubahan; reviewer tidak otomatis menggabungkan kode. Hindari beberapa agent mengubah file yang sama tanpa koordinasi.

## Format jawaban wajib untuk audit
Buat tabel berisi **Nama repo (link), sumber penemuan, fitur FWI sasaran, stack, lisensi beserta sumber bukti, status maintenance, pola adopsi, risiko, keputusan sementara, dan tingkat keyakinan**.

Di bawah tabel tulis singkat:
1. Fakta terverifikasi dan celah bukti.
2. Prioritas eksperimen berikutnya (maksimal 3 item).
3. Apa yang **belum** boleh diputuskan/diklaim.
4. Perubahan yang perlu dicatat pada reference register/ADR.

Jika pengguna hanya ingin melanjutkan besok, tampilkan ringkasan handoff secukupnya dan jangan mengulang riset panjang.
