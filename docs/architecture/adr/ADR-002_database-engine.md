# ADR-002 — Relational Database Engine

> **Project:** FoodWaste Intelligence (FWI)  
> **Status:** ACCEPTED FOR MVP WORKING BASELINE  
> **Decision ID:** ADR-002  
> **Scope:** P0/MVP prototype and production-oriented development baseline  
> **Date:** 2026-11-03  
> **Related:** FWI-PROD-001, FWI-ARCH-001, FWI-DEV-001–003

## 1. Context

FWI membutuhkan penyimpanan relasional yang menjaga integritas antara organization, site, material/waste event, measurement, validation, evidence metadata, role/scope, dan audit trail.

Kebutuhan utama:

- foreign key dan referential integrity;
- transaction support;
- unique constraints;
- numeric/decimal precision untuk gross/tare/net;
- timestamps dan timezone;
- migrations;
- indexing dan query audit;
- multiuser access;
- backup/restore;
- ekosistem Python yang matang;
- kemampuan berkembang dari prototipe menuju MVP web tanpa mengganti database utama.

FWI tidak boleh mengandalkan penyimpanan yang membuat event, measurement, validation, transfer, atau disposition bercampur atau sulit direkonsiliasi.

## 2. Decision

**PostgreSQL dipilih sebagai relational database engine utama FWI untuk MVP P0 dan pengembangan production-oriented.**

Baseline pengembangan menggunakan **PostgreSQL 18.x** pada minor release yang masih didukung dan mutakhir.

**SQLite tidak menjadi database kanonik FWI.** SQLite hanya boleh digunakan untuk eksperimen lokal yang sangat terbatas bila task secara eksplisit mengizinkannya dan perbedaan semantik dengan PostgreSQL dipahami.

## 3. Why PostgreSQL

### 3.1 Data integrity

FWI memiliki relasi kuat:

- Organization → Site
- Event → Measurement
- Event/Measurement → Validation
- Event/Measurement → Evidence
- User/Role → Scope
- Semua objek penting → Audit lineage

PostgreSQL cocok untuk enforcement melalui foreign key, unique constraint, check constraint, transaction, dan schema migration.

### 3.2 Measurement precision

Nilai massa harus menggunakan tipe numeric/decimal yang presisi dan tidak bergantung pada floating-point biner untuk nilai kanonik.

### 3.3 Multiuser MVP

FWI dirancang sebagai web system multiuser. Database client/server lebih sesuai daripada database file lokal ketika jumlah writer dan proses bertambah.

### 3.4 Auditability

Query historis, lineage, record validation, koreksi, dan export reconciliation membutuhkan relational querying yang kuat.

### 3.5 Growth path

Keputusan ini mengurangi risiko migrasi database besar ketika prototipe berkembang menjadi MVP web.

## 4. SQLite Position

SQLite diperbolehkan hanya untuk:

- eksperimen lokal singkat;
- test fixture tertentu;
- utility yang tidak menjadi canonical persistence.

SQLite tidak boleh:

- menjadi database produksi FWI tanpa ADR baru;
- menjadi referensi perilaku concurrency;
- menjadi dasar final constraint/migration bila berbeda dengan PostgreSQL;
- dipakai sebagai alasan mengabaikan transactional or referential requirements.

## 5. Logical Database Boundaries

P0 database minimal harus mendukung kelompok data:

### Identity & Access
- organizations
- sites
- users
- roles
- user_role_scopes

### Master Data
- material_categories
- stage_references
- controlled vocabularies yang sudah disetujui

### Domain
- material_waste_events
- measurement_records
- validation_records
- evidence_records

### Governance
- audit_logs
- optional export_jobs

P1/P2 tables tidak dibuat hanya karena sudah disebut di roadmap. Mereka ditambahkan melalui task/ADR ketika scope aktif.

## 6. Data Type Principles

### IDs
Canonical primary keys tidak boleh berubah setelah record dibuat.

ID implementation format belum dikunci oleh ADR ini. UUID/ULID/other strategy membutuhkan keputusan schema-level tersendiri bila berdampak lintas sistem.

### Mass
Gunakan PostgreSQL `NUMERIC`/`DECIMAL` untuk nilai massa kanonik dan nilai measurement yang memerlukan presisi.

Jangan menggunakan `REAL`/`DOUBLE PRECISION` untuk canonical gross/tare/net tanpa keputusan eksplisit.

### Time
- simpan event/measurement timestamps dengan timezone-aware semantics;
- simpan `operation_date` terpisah bila domain membutuhkannya;
- jangan menganggap timezone server sebagai timezone lokasi.

### Status / Vocabulary
Jangan menggunakan PostgreSQL ENUM untuk vocabulary domain yang masih PROVISIONAL kecuali ada keputusan khusus. Reference table atau constrained text lebih mudah berevolusi selama baseline masih berubah.

## 7. Transaction Boundaries

Contoh operasi yang harus atomic bila masuk satu use case:

- create event + required audit entry;
- create measurement + audit entry;
- validation decision + validation history + audit entry;
- correction/supersession transaction setelah policy final tersedia.

Kegagalan salah satu bagian tidak boleh meninggalkan state setengah jadi.

## 8. Referential Integrity

Minimum:

- event wajib mengacu ke organization dan site yang valid;
- measurement wajib mengacu ke event yang valid;
- validation wajib mengacu ke target record yang valid menurut model yang disepakati;
- role scope wajib mengacu ke user/role dan scope yang valid;
- orphan records tidak boleh diterima sebagai kondisi normal.

## 9. Delete Policy

Hard delete terhadap record domain/audit **tidak menjadi default**.

Kebijakan final untuk:
- void;
- supersede;
- correction;
- retention;
- purge

tetap mengikuti ADR/policy berikutnya.

Audit log tidak boleh dihapus oleh workflow aplikasi biasa.

## 10. Migration Policy

Semua perubahan schema harus:

1. menggunakan migration yang versioned;
2. dapat direview di Git;
3. memiliki forward path yang jelas;
4. tidak dilakukan manual langsung pada production database;
5. disertai test untuk constraint penting;
6. tidak membuat schema P1/P2 sebelum scope disetujui.

Migration framework akan dipilih bersama backend framework pada ADR-001 atau ADR implementasi terkait.

## 11. Development Environments

Baseline yang direkomendasikan:

- local development: PostgreSQL lokal/container/managed dev instance;
- test: PostgreSQL-compatible test environment untuk integration test;
- unit/domain tests tetap dapat berjalan tanpa database;
- staging/production: belum dipilih pada ADR ini.

Tidak ada provider cloud yang dipilih oleh ADR-002.

## 12. Security Requirements

Database credentials:

- tidak disimpan di Git;
- melalui environment/secret management;
- menggunakan least privilege;
- akun aplikasi tidak harus menjadi database owner/superuser;
- backup harus dilindungi setara dengan database utama.

## 13. Consequences

### Positive

- satu database kanonik sejak awal;
- relational integrity lebih kuat;
- cocok untuk multiuser;
- mengurangi migrasi SQLite → PostgreSQL di fase berikut;
- mendukung audit dan reporting dengan baik.

### Cost / Trade-offs

- setup lokal sedikit lebih berat daripada SQLite;
- membutuhkan server/process database;
- integration tests membutuhkan environment database;
- migration dan operational discipline perlu dibangun sejak awal.

Trade-off tersebut diterima karena kebutuhan FWI lebih dekat ke multiuser audited system daripada single-file desktop utility.

## 14. Rejected / Deferred Alternatives

### SQLite as primary database — REJECTED for canonical MVP persistence

Alasan:
- lebih cocok untuk local/device storage dan low writer concurrency;
- FWI ditujukan sebagai web system multiuser;
- berisiko menciptakan perbedaan behavior ketika nanti berpindah ke client/server database.

### MySQL/MariaDB — NOT SELECTED

Bukan karena tidak mampu. Tidak ada requirement FWI yang membuatnya wajib, sedangkan PostgreSQL memenuhi baseline dan cocok dengan arah Python/data workload. Pergantian memerlukan ADR baru.

### NoSQL/document database — REJECTED as primary P0 store

Relasi, referential integrity, audit lineage, dan reconciliation merupakan kebutuhan inti FWI.

## 15. Guardrails for AI Agents

AI agent tidak boleh:

- mengganti PostgreSQL dengan database lain tanpa ADR baru;
- menggunakan SQLite sebagai canonical persistence;
- mengubah numeric mass ke floating point tanpa keputusan;
- menambah table P1/P2 tanpa task;
- membuat destructive migration tanpa review;
- membuat credentials/database URL di source control;
- menganggap provider hosting/database managed service sudah dipilih.

## 16. Acceptance Criteria

ADR-002 dianggap diterapkan ketika:

- [ ] project setup menyediakan PostgreSQL development path;
- [ ] migration framework tersedia;
- [ ] schema P0 mengikuti FWI-ARCH-001;
- [ ] FK/unique/check constraints penting diuji;
- [ ] gross/tare/net menggunakan precise numeric representation;
- [ ] database secrets tidak masuk Git;
- [ ] integration test dapat membuat dan memvalidasi event + measurement;
- [ ] audit-related transaction behavior diuji;
- [ ] SQLite tidak menjadi canonical runtime database.

## 17. Follow-up Decisions

- ADR-001 — Backend framework/runtime
- ADR-003 — Frontend framework
- ADR-004 — Authentication strategy/provider
- ADR-005 — Evidence/object storage
- Schema Design v0.1 — physical tables, keys, indexes, constraints
- Correction/Supersession policy
- Backup/restore and deployment policy

## 18. Decision Summary

**Decision:** PostgreSQL 18.x menjadi relational database engine utama FWI MVP.  
**SQLite:** hanya eksperimen lokal terbatas, bukan canonical persistence.  
**Cloud/provider:** belum dipilih.  
**Physical schema:** belum dikunci dalam ADR ini.  
**Production authorization:** belum diberikan.
