# FWI-DEMO-001 — Demo sintetis lokal

Hanya untuk presentasi sintetis lokal, bukan P0 lengkap atau sistem resmi BGN.
API belum diautentikasi; jangan bind ke jaringan publik. OP-08/FI-02/NI-03 HELD.
Dashboard/ledger biasa tetap DemoStore in-memory, bukan laporan PostgreSQL.

## Menjalankan dengan aman

Prasyarat: dependency proyek sudah tersedia, Python 3.14, PostgreSQL 18 dan
akun `fwi_test` pada `fwi_demo_test`; password tersedia privat melalui pgpass.
Mode lokal menggunakan Chrome yang sudah terpasang, tanpa instalasi browser.
Jangan memakai `fwi_demo_dev`. Port 15173 dan 18000 harus kosong; jangan hentikan
service pengguna untuk mengambil port. Mode CI tetap memakai 5173/8000.

Dari root repository pada PowerShell pertama:

```powershell
$env:FWI_LOCAL_SYNTHETIC_DEMO = '1'
$env:FWI_TEST_DATABASE_URL = 'postgresql+psycopg://fwi_test@127.0.0.1:5432/fwi_demo_test'
$env:FWI_BROWSER_RUN_TOKEN = [guid]::NewGuid().ToString('N')
.venv/Scripts/python.exe -u scripts/browser_e2e_harness.py serve
```

Tunggu JSON `ready: true`. Harness memverifikasi role/database/PostgreSQL 18,
membuat schema UUID terisolasi, menjalankan migration `demo_0001`, lalu memanggil
seed aplikasi secara eksplisit (organisasi/site, tanpa event otomatis). Readiness
memuat schema/OID/owner/revision; tidak memuat password. Jangan lanjut bila gagal.
URL backend memakai search_path schema itu, bukan public/development.

Pada PowerShell kedua dari root yang sama:

```powershell
$env:FWI_LOCAL_SYNTHETIC_DEMO = '1'
npm --prefix frontend run dev -- --port 15173
```

Buka `http://127.0.0.1:15173`, pilih **Mulai demo persisten**. Backend hanya pada
`127.0.0.1:18000`. Jangan mengubah target proxy, membagikan port, atau menaruh
credential di URL. Simpan URL detail event untuk refresh pada sesi demo yang sama.

Selesai: hentikan Vite dengan Ctrl+C. Pada stdin harness pertama kirim satu baris
`{"command":"stop"}`. Tunggu `closed: true` dan `cleanup_verified: true`; hanya
schema eksekusi itu dihapus dengan guard UUID/OID/owner/role/database/version.
Data hilang setelah cleanup secara sengaja; refresh selama sesi tidak menghapusnya.
Jika harness terputus, gunakan environment/token run yang sama dan mode `cleanup`
setelah memastikan backend milik run sudah berhenti. Jangan drop schema manual.
Bulk cleanup mengabaikan manifest run lain; guard per-schema tetap berlaku.

## Tiga skenario presentasi

Semua skenario: gunakan jenis event provisional yang dipilih sadar, waktu
`2026-11-07T12:00:00+08:00`, basis `as_served`, metode `synthetic_demo_scale`,
provenance `Fixture sintetis FWI-DEMO-001`, dan waktu ukur dengan offset eksplisit.
Surplus berisiko tidak otomatis berarti discarded. Nilai kg berupa teks desimal.

1. **Teramati dan ukur ulang:** buat event `at_risk_surplus`; observed gross `2.4`,
   tare `0.4`, net `2.0`. Tambah observasi kedua gross `2.3`, tare `0.4`, net `1.9`
   pada event yang sama. Buka detail, refresh, lalu kembali ke capture. Harus satu
   UUID event, dua ID measurement; tidak dijumlahkan/dipilih sebagai kanonik.
2. **Missing versus nol:** pada event yang sama tambahkan missing (massa null),
   lalu measured_zero gross `0.4`, tare `0.4`, net `0`. Detail harus menampilkan
   `Tidak tersedia (null)` berbeda dari `0 kg`; metode/provenance tetap wajib.
3. **Ditolak dan pulih:** observed gross `0.4`, tare `0.1`, net `9` ditolak 422.
   Event tetap ada; perbaiki net menjadi `0.3` lalu kirim secara eksplisit. Untuk
   Decimal panjang gunakan `0.12345678901234567890123456789`, tare `0`, net sama.
   Jika respons ambigu/UNKNOWN, berhenti: jangan kirim ulang atau buka kunci tanpa
   pemeriksaan independen. Simulasi lost acknowledgement hanya dilakukan tes W-20/21.

## Mengulang verifikasi

Dalam environment Python yang sama, set `FWI_REQUIRE_POSTGRES=1` dan jalankan
`.venv/Scripts/python.exe -B -m pytest -q`; fixtures mengisolasi/cleanup schema.
Frontend: `npm --prefix frontend run typecheck`, `test`, `test:proxy`, `build`.
Untuk proxy test gunakan shell tanpa `FWI_LOCAL_SYNTHETIC_DEMO` (kontrak default CI).
Untuk browser, hentikan demo manual lebih dahulu dan gunakan environment pertama:

```powershell
$env:PATH = (Resolve-Path .venv/Scripts).Path + ';' + $env:PATH
npm --prefix frontend run test:e2e:ci
```

Playwright lokal memilih Chrome terpasang; satu worker, nol retries. Setiap
skenario punya schema sendiri; W-20/21 membuktikan commit/audit sebelum menghilangkan
acknowledgement browser. Report: `frontend/playwright-report/index.html`; bukti DB
dan cleanup di `frontend/test-results`/`frontend/browser-evidence` (di-ignore Git).
File evidence Windows memiliki retry I/O terbatas; POST tidak pernah diretry.

## Bukti task dan batasnya

Hasil implementer saja — Windows lokal / PostgreSQL 18.6: W-20–W-25 6/6 PASS setelah perbaikan transient
PermissionError saat atomic evidence-file replacement. Startup awal gagal pada
beberapa skenario; itu bukan kegagalan massa atau kehilangan data, dan tidak
disamarkan sebagai PASS. W-23 juga memeriksa navigasi/refresh pada viewport 390px.
Tidak ada field validation/metodologi baru, auth, tabel/migration/dependency baru,
atau deployment.

Regresi yang dijalankan implementer: pytest 80 PASS + 6 subtes PASS (0 FAIL/SKIP), Vitest 103 PASS,
proxy 1 PASS; typecheck, build dan `python -I scripts/verify_kit.py` PASS.
Pemeriksaan read-only atas 21 manifest browser task ini menemukan nol schema tersisa.
Peringatan deprecation httpx/TestClient dan Alembic masih ada, tanpa perubahan dependency.

Review: **APPROVED BY INDEPENDENT REVIEWER**. Provenance: pesan Owner
FWI-DEMO-001 Final PR Packaging dalam percakapan ini, 2026-11-07, melaporkan
APPROVE tanpa blocker critical/high. Identitas reviewer, tautan laporan/artifact,
hash diff yang direview, serta perintah/hasil tes yang dijalankan ulang secara
independen tidak disertakan. Karena itu, angka PostgreSQL/Chrome dan regresi di
atas tetap bukti implementer; tidak diklaim sebagai rerun reviewer. Status review
ini tidak mengotorisasi commit, push, PR, deployment atau penerimaan produksi/P0.
