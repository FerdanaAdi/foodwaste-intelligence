# ADR-003 — Frontend Framework dan UI Toolkit

> **Project:** FoodWaste Intelligence (FWI)  
> **Status:** OWNER-APPROVED FOR IMPLEMENTATION — adopsi repository menunggu review/merge PR  
> **Decision ID:** ADR-003  
> **Scope:** Frontend web MVP P0 (prototipe sintetis)  
> **Date:** 2026-11-04  
> **Related:** FWI-PROD-001, FWI-ARCH-001 v0.2, ADR-001, ADR-002

## 1. Context

FWI membutuhkan frontend web yang responsif dan dapat diakses untuk MVP P0:
capture event/pengukuran sintetis, ledger event, pratinjau review/audit, dan pratinjau ekspor.
Keputusan backend (ADR-001: FastAPI/Python 3.14/SQLAlchemy sync/Alembic; ADR-002: PostgreSQL 18.x)
sudah diterima, tetapi API belum tersedia; frontend harus dapat berjalan lokal dengan data
demo sintetis tanpa mengklaim integrasi backend.

## 2. Decision

Project owner menyetujui frontend baseline berikut untuk implementasi:

- **React 19 + TypeScript** (strict) sebagai library UI;
- **Vite** sebagai build tool dan dev server lokal;
- **Tailwind CSS** untuk styling responsif;
- **shadcn/ui secara selektif**: pola komponen source-copy (Button, Card, Input, Label,
  Badge, Table) dengan `class-variance-authority` + `clsx` + `tailwind-merge`;
  tidak mengadopsi seluruh katalog komponen maupun dependensi Radix yang belum diperlukan;
- **React Router** untuk navigasi antar halaman;
- **Vitest + React Testing Library** untuk pengujian.

Status ini adalah **persetujuan owner untuk implementasi**; adopsi formal di repository
mengikuti review/merge PR frontend yang merekam ADR ini.

## 3. Why React + TypeScript + Vite

- Ekosistem terbesar untuk form berat dan tabel data; cocok dengan kebutuhan capture/review.
- TypeScript menjamin kontrak tipe data demo selaras domain (mass basis, observation status).
- Vite memberi dev server cepat dan build produksi sederhana tanpa konfigurasi berat.
- Kombinasi ini umum dikenal AI coding agents, mengurangi variasi arsitektur.

## 4. Alternatives — NOT SELECTED

- **Vue 3** — mampu, tetapi tidak memberi keunggulan spesifik FWI; ekosistem tim/owner lebih kecil.
- **Svelte/SvelteKit** — bundle kecil, tetapi ekosistem komponen data-grid/form lebih tipis untuk kebutuhan audit trail UI.
- **Angular** — terlalu berat untuk MVP P0; menambah ceremony struktur.
- **Server-rendered murni (htmx/Django-template)** — menyalahi arah API-first ADR-001 (FastAPI + OpenAPI).

Pemilihan ini bukan pernyataan ketidakmampuan alternatif; pergantian memerlukan ADR baru.

## 5. Trade-offs

- React + Tailwind menambah langkah build frontend (node_modules, lockfile) yang harus
  dikelola terpisah dari backend Python.
- shadcn/ui selektif berarti komponen dirawat sebagai source di repo (bukan dependency semata),
  konsisten dengan filosofi shadcn; update manual disengaja.
- Demo berjalan penuh di browser tanpa backend; ketika API FastAPI tersedia, adapter data
  demo diganti adapter API tanpa mengubah komponen halaman.

## 6. Tetap OPEN (tidak diputuskan ADR ini)

- Strategi/provider autentikasi (ADR-004);
- Penyimpanan evidence/object storage (ADR-005);
- Strategi offline/sinkronisasi (ADR-008);
- Kontrak API publik final dan vocabulary kanonik (source-gated);
- Deployment/hosting frontend.

## 7. Guardrails untuk AI agent

- Data demo **sintetis saja**; tidak ada identitas siswa/data nyata SPPG.
- Satu kejadian = satu `event_id` stabil; pengukuran berulang tidak membuat event baru.
- `missing` ≠ `measured_zero`; `estimated` tidak disamakan dengan `weighed`.
- Basis massa provisional repo (`raw`, `after_preparation`, `cooked`, `ready_to_eat`,
  `as_served`, `other_documented`); `plate_leftover` adalah stream, bukan mass basis.
- Tidak ada agregasi massa lintas basis; tidak ada total massa yang tidak terdukung.
- KPI `OP-08`, `FI-02`, `NI-03` tetap HELD; tidak dihitung maupun ditampilkan.
- UI menampilkan label `SYNTHETIC / DEMO — NOT OFFICIAL BGN SYSTEM`.

## 8. Acceptance criteria implementasi frontend

- [ ] UI berjalan lokal (`npm run dev`) dengan label sintetis/demo yang jelas.
- [ ] Dashboard mutu data, ledger event, detail event, quick capture, pratinjau review,
      dan pratinjau ekspor tersedia dan saling tertaut.
- [ ] Satu event dapat memiliki ≥2 pengukuran tanpa membuat event kedua.
- [ ] Kondisi missing, measured zero, estimated, dan mass invalid direpresentasikan benar.
- [ ] Ekspor CSV demo traceable tanpa total yang tidak terdukung.
- [ ] Typecheck (`tsc`), build produksi, dan Vitest/RTL lulus.

## 9. Follow-up

1. Integrasi adapter API FastAPI ketika backend bootstrap tersedia (task terpisah).
2. ADR-004 autentikasi; ADR-005 evidence storage.
3. Ekspansi komponen shadcn/ui hanya saat fitur P0/P1 membutuhkan.

## 10. Decision Summary

**Frontend:** React 19 + TypeScript + Vite  
**Styling:** Tailwind CSS  
**Komponen:** shadcn/ui selektif (source-copy)  
**Routing:** React Router  
**Testing:** Vitest + React Testing Library  
**Status:** OWNER-APPROVED FOR IMPLEMENTATION — PENDING PR REVIEW/MERGE  
**Tetap OPEN:** autentikasi, evidence storage, offline/sync, API contract final, deployment.
