# FWI AI Context Optimization Kit v1.0

**Status:** rancangan konfigurasi lokal; belum diinstal ke IDE/repository dan belum diuji pada project nyata. **Tanggal:** 3 November 2026.

Paket untuk **FoodWaste Intelligence (FWI)**: penggunaan Codex, Google Antigravity, GitHub Copilot Student, dan GLM secara hemat konteks dalam **satu GitHub repository** dengan branch/worktree terpisah.

## Instalasi minimal (tanpa dependensi)
1. Backup konfigurasi yang sudah ada di repository FWI, bila ada.
2. Salin `AGENTS.md`, `.agents/`, `docs/ai/`, `.github/` dan `.gitignore` ke root repository **setelah membaca perbedaan dengan file yang sudah ada**. Jangan menimpa konfigurasi lokal secara membabi buta.
3. Buka root repository di Codex. Pastikan agent membaca `AGENTS.md`. Dalam Antigravity, periksa menu Rules/Skills dan pastikan `.agents/rules/` serta `.agents/skills/` benar-benar dikenali oleh versi yang kamu pakai. Bila tidak, rujuk file secara eksplisit; jangan anggap aturan termuat otomatis.
4. Konfigurasi `repomix.config.json` hanya bila akan menggunakan Repomix. Tidak wajib memasang Repomix untuk mulai coding.
5. Isi `docs/ai/HANDOFF.md` setiap selesai task (maksimum 15 baris) dan gunakan `docs/ai/TASK_TEMPLATE.md` untuk tugas baru.
6. Buat branch atau Git worktree **per task**, jangan menjalankan dua agent menulis di folder/branch sama secara bersamaan.
7. Gunakan `python scripts/verify_kit.py` untuk mengecek integritas berkas kit; ini **bukan** tes aplikasi FWI.

## Hemat konteks
- **Layer 1 (selalu):** `AGENTS.md` dan task issue spesifik.
- **Layer 2 (saat relevan):** satu skill sesuai jenis pekerjaan, `docs/ai/HANDOFF.md`, 1–3 file source terkait.
- **Layer 3 (hanya bila perlu):** dokumen sumber FWI-02/03/04 atau paket Repomix terseleksi.
- Jangan mengirim dokumen FWI-01 sampai FWI-04 penuh ke semua agent, jangan tempel output terminal panjang yang tidak relevan, jangan gunakan multi-agent paralel untuk pekerjaan kecil.

## Batas status proyek
- FWI sebagai **lapisan analitik/decision support**, bukan pengganti sistem resmi BGN.
- FWI-02 arsitektur konseptual v1.0; FWI-03 metodologi v1.3; FWI-04 blueprint MVP v0.1.
- Desain masih **stack-agnostic**, sehingga template ini **tidak memilih Next.js/Supabase/hosting**.
- G0 desk-validation selesai, G1–G5 belum boleh dianggap disetujui/selesai hanya karena dibuat prototipe.
- Prototipe **data sintetis**, tanpa API pemerintah yang belum diizinkan.

## Isi paket
- `AGENTS.md`: instruksi universal untuk Codex & agent lain.
- `.agents/rules/fwi-core.md`: aturan ringkas untuk Antigravity (periksa dukungan versi IDE).
- `.agents/skills/{fwi-domain,fwi-ui,fwi-review,fwi-oss-audit}/SKILL.md`: empat skill on demand.
- `docs/ai/AI_MODEL_ROUTING.md`: kebijakan routing (mengikuti matriks diskusi, bersifat usulan).
- `docs/ai/{CONTEXT,HANDOFF,TASK_TEMPLATE,PR_REVIEW_TEMPLATE,TOKEN_POLICY}.md`.
- `docs/ai/REPO_REFERENCE_REGISTER.md`: placeholder untuk audit repo lain, **bukan daftar yang dulu diberikan user**.
- `repomix.config.json`: batasan file untuk ekstraksi kode.
- `scripts/verify_kit.py`: cek struktur & prinsip dasar paket.
- `.github/pull_request_template.md`: checklist PR.

**Jangan jalankan** `npm install`, `npx repomix`, atau perintah shell terhadap repository yang belum diaudit tanpa persetujuan manusia. Jangan mengunggah berkas rahasia ke layanan pihak ketiga.
