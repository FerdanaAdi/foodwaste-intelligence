# FWI Frontend — Synthetic Demo (NOT an official BGN system)

Frontend foundation FWI-UI-001: React 19 + TypeScript + Vite + Tailwind CSS +
React Router + Vitest/RTL. Keputusan stack terekam di
`docs/architecture/adr/ADR-003_frontend-framework.md` (owner-approved; adopsi
repository menunggu review/merge PR).

## Menjalankan lokal

```bash
cd frontend
npm install        # sekali; butuh Node >= 20 (diverifikasi di Node 24)
npm run dev        # dev server: http://localhost:5173
```

Build & verifikasi:

```bash
npm run typecheck  # tsc --noEmit (strict)
npm test           # Vitest + React Testing Library
npm run build      # tsc + vite build -> dist/
npm run preview    # serve hasil build produksi
```

## Batas data (penting)

- Mode DemoStore menggunakan **fixture sintetis fiktif** di `src/data/demoStore.ts`
  (2 site, 3 event, 1 event dengan 2 pengukuran, 1 event tanpa pengukuran).
- Mode DemoStore bersifat **in-memory** dan **reset saat reload**.
- `/backend-demo` membaca API lokal; `/backend-demo/capture` menulis data sintetis
  melalui dua POST yang dibatasi proxy. Mode ini terpisah dari DemoStore dan
  memerlukan backend/database uji yang sudah diverifikasi. Lihat
  [kontrak capture](../docs/frontend/backend-capture-v0.1.md) untuk UNKNOWN/refresh,
  batas pengujian dan gate browser. Autentikasi/evidence storage belum tersedia.
- Aplikasi menampilkan banner `SYNTHETIC / DEMO — NOT OFFICIAL BGN SYSTEM`.
- KPI `OP-08`, `FI-02`, `NI-03` HELD — tidak dihitung/ditampilkan.
- Tidak ada agregasi lintas mass basis; `missing` ≠ `measured_zero`;
  `estimated` ≠ `weighed`; nilai massa asli dipertahankan apa adanya.

## Struktur singkat

- `src/domain/` — tipe & aturan validasi demo (mirror semantik `src/fwi/domain`).
- `src/data/` — adapter demo in-memory + pembangkit CSV (tanpa total).
- `src/pages/` — Dashboard, Ledger, Detail Event, Capture Cepat, Review,
  Pratinjau Ekspor.
- `src/components/ui/` — komponen gaya shadcn/ui (source-copy, selektif).
- `tests/` — Vitest + RTL; setup jsdom di `tests/setup.ts`.

## Tautan keputusan

- ADR-003 (frontend): `../docs/architecture/adr/ADR-003_frontend-framework.md`
- ADR-001/002 (backend/database): tidak diubah oleh task ini.
