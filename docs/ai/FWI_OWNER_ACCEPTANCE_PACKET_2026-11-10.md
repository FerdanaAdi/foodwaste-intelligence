# FWI — Owner Acceptance Packet & Git Packaging Proposal

Tanggal: **2026-11-10, Asia/Makassar**. Status **PROPOSED / READY FOR OWNER PACKAGING APPROVAL**.
Target `D:/Projects/fwi-integration-01`; branch `codex/fwi-integration-01`; HEAD `7462897e4b34674ac4db30764819a0e07e535a3b`.
Tidak ada staging, commit, push, PR, merge atau deployment yang diotorisasi/dijalankan pada tahap ini.

## 1. Scope dan batas acceptance

| Scope | Sudah berjalan / terbukti pada data sintetis | Batas / belum diterima penuh |
|---|---|---|
| P0 FR-001 | Backend session/CSRF, seeded writer/reader pada dua site, scoped read/write, concealed IDOR denial, audit | Gate B membership administration/RACI/full FR-001 belum selesai |
| P0 FR-002 | Persistent versioned master references dan scoped reads | Mapping DTO/hierarchy/vocabulary dan ownership masih OPEN; bukan pengesahan semua master categories |
| P0 FR-003/004 | Stable event UUID; 0..n measurement; Decimal/raw values; gross/tare/net; provenance; missing/zero/estimated terpisah | Field protocol, unit conversions, rounding/metrology dan vocabulary final belum disahkan |
| P0 FR-005/006 | Private evidence metadata, review/correction proposal history, original records dipertahankan | Physical file storage/ADR-005, applied correction/supersession/effective validation belum tersedia |
| P0 FR-007/008 | Persistent ledger/pagination, DQ descriptive counts, site-filtered CSV export dengan identitas dan provenance | DQ period/stage completeness, selected/reportable measurement policy, XLSX/export retention/audit contract belum penuh |
| P1 FR-101..106 candidate | Receipt/lot/movement, recipe/menu/batch/IO, distribution/service, lineage, gated disposition, descriptive trends | Provisional engineering contracts; bukan pengesahan inventory reconciliation, yield conversion, sampling expansion, food safety atau scientific reporting policy |
| P2 FR-201..204 candidate | Read-only KPI catalogue/value-free previews, cost-reference history, structural alerts/acknowledgement | Tidak ada authorized numeric KPI/valuation, global alert admin permission atau automatic rescue/action; OP-08/FI-02/NI-03 HELD |

Historical fixture-only pages tetap terpisah dari backend; tidak semua layar fixture berarti fitur persistent. FWI independen, bukan sistem resmi BGN. Tidak ada real SPPG/student data, official API integration atau public deployment.

## 2. Acceptance criteria dan bukti

PRD `docs/product/PRD-v0.1.md` tetap otoritatif; tabel ini melaporkan scope bukti, tidak mengubah PRD/ADR/metodologi.

| AC | Status bukti | Makna yang dapat diterima |
|---|---|---|
| AC-01 | PASS — synthetic scoped slice | Tiga persona/two-site, reader denial, foreign object/site concealment; bukan Gate B/full FR-001 |
| AC-02 | PARTIAL / OPEN explicit duplicate-ID contract | Stable UUID dan UNKNOWN no-replay terbukti; bukti khusus submit identical event ID belum dikonfirmasi pada packaging audit. Tidak ada exactly-once lintas client atau idempotency umum |
| AC-03..06 | PASS — tested inputs | Satu event/multiple measurements; arithmetic/rejection; long Decimal; missing != zero/estimated; tidak ada automatic remeasurement total |
| AC-07 | PASS guardrail | Mixed/incompatible ratio blocked; tidak mengesahkan ratio engine atau conversion factor |
| AC-08 | PARTIAL / type-separation guardrail PASS | at-risk tetap distinct dari actual discard; acceptance discarded-dashboard belum lengkap dan tidak ada discarded KPI yang dikarang |
| AC-09 | PARTIAL | Proposal/history/original unchanged terbukti; correction application/supersession belum diterima |
| AC-10 | PARTIAL | Metadata/provenance authorization terbukti; availability/download actual attachment belum tersedia |
| AC-11 | PARTIAL | CSV site scope/columns/Decimal diuji; XLSX belum ada |
| AC-12 | PASS guardrail / operational OPEN | No automatic rescue/safe claim; bukan food-safety validation lapangan |
| AC-13 | PASS | HELD catalogue/preview/UI tidak menghasilkan numeric result |
| AC-14 | OPEN / not satisfied | Separate persisted regulatory classification/edibility acceptance belum terbukti; jangan menganggap domain prohibition sama dengan persistence implementation |
| AC-15 | PASS — CSV tested subset | occurred_at, recorded_at, measurement timestamps dan operation_date dibedakan; site-local operational-day policy tetap OPEN |
| AC-16 | PARTIAL | Reproducible synthetic tests/evidence tersedia; FWI-03 desk matrix sebelumnya 0 full PASS / 8 PARTIAL / 22 N/A, bukan validasi semua metodologi |

## 3. Evidence yang diverifikasi ulang tanpa rerun suite penuh

- Hash seluruh 93 pending entries cocok dengan integration/final-acceptance evidence sebelum dokumentasi packaging ini dibuat. Hanya packet baru dan prepend handoff berubah pada tahap ini.
- Full combined PostgreSQL: **472 PASS + 6 subtests**, 0 FAIL/SKIP, 130 warnings. Frontend **333 PASS**, workers=2; typecheck/build PASS. Ini hasil sebelumnya, bukan eksekusi ulang 2026-11-10.
- Delta verification: **45 PASS** targeted backend/domain/security/migration (19 warnings). Fresh install + P0 upgrade **2 PASS**; preserves one event, two measurements, five historical audit records and ORM metadata.
- Windows installed Chrome HTTPS: **16 PASS**, 0 FAIL/SKIP/flaky, workers=1/retries=0. Run started **2026-11-09 17:46:52 WITA** (`2026-11-09T09:46:52.292Z`). Proxy HTTPS **4 PASS**.
- Browser exercised actual `https://127.0.0.1:5173` -> HTTPS Vite proxy -> FastAPI :8000 -> PostgreSQL 18.6 `fwi_test/fwi_demo_test`; three personas, same event/two measurements, reportable_mass=null, HELD previews, export/review, refresh/IDOR, W-20/W-21/J-07 no replay.
- Combined browser event UUID `caf2cd32-9cde-49b7-a055-cf115b9f0b24`; one event/two measurements. This fixture was cleaned and is not an Owner UAT dataset.
- **17 owned test schemas cleaned** (16 final cases + initial failed trial). Legacy OID 324554 preserved; temporary TLS private files removed; OS trust store unchanged; no Owner UAT credentials/resources used.
- Initial browser trial used malformed receipt test field (422 before expected 403); fixed test payload, fresh full run passed. Earlier migration-test table-name and integration text-encoding faults were corrected; original reproduction assertions retained. No automatic POST retry masked failures.
- Review PASS is Codex evidence-based re-verification **in the implementation chat**, not a separate external independent reviewer sign-off. Owner UAT/Figma acceptance are not claimed.

Local evidence (ignored, NOT commit allowlist):
- `frontend/browser-evidence/p1-p2-integration-verification.json`
- `frontend/browser-evidence/p1-p2-final-acceptance.json`
- `frontend/browser-evidence/results.json`
- `frontend/playwright-report/index.html`

These reports remain local test artifacts. A PR should carry this credential-free summary; do not force-add raw artifacts. Durable sanitized CI evidence is a future packaging decision, not already completed.

## 4. Git inventory and secrets boundary

Original pending set: **93 paths = 25 modified + 68 untracked**: 51 application/configuration, 33 tests/harness, 7 migrations, 2 documents. No evidence/temp/binary/credential files in that set. Packet creation adds one documentation path: **94 final proposed paths**, index empty.

Read-only content scan across all original 93 UTF-8 files found **0** private-key blocks, provider-token patterns, credential-bearing URLs, literal password/secret assignments, or email indicators. Filename inventory contains no .env, pgpass, TLS key/certificate or real-data file. Existing browser fixture generates private random passwords at runtime; auth snapshots omit verifier/session/CSRF secrets. This is scoped indicator scanning, not a universal proof of data provenance or security.

Ignored/excluded: `.env*`, `pgpass.conf`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `FWI-GOV-001_Codex_Task.md`, other worktrees/user files, `node_modules`, `.venv`, caches/pyc, build/dist/coverage, browser-evidence, playwright-report, test-results, raw logs/traces/screenshots, root candidate patch/manifest artifacts and private temporary backups. Do not use `git add -A`, `git add .` or force-add ignored evidence.

## 5. Proposed logical commits and PR

No execution authority is inferred from this proposal. **Owner must approve the exact paths/hashes first.**

1. `feat(integration): assemble synthetic P0 P1 P2 application` — 91 non-documentation paths below, including all combined runtime/schema/security/test changes. They form one coherent unit: shared auth/models/router/merge migration cannot safely be split into independent P0/P1 commits without inventing untested intermediate states.
2. `docs(acceptance): record synthetic integration evidence and open gates` — exactly `docs/ai/HANDOFF.md`, `docs/backend/FWI-P1-CANDIDATE.md`, and this packet. Candidate document contains historical statements; current status/evidence are bounded here and in the latest handoff, not full feature acceptance.

Then, only with separate push/PR authority: one Draft PR to the Owner-approved base (verify origin/main before selecting base; not fetched/assumed current here). Suggested title: `feat(integration): assemble tested synthetic P0 P1 P2 candidate`. PR must state synthetic-only, review provenance, test dates/results, raw/reportable separation, OPEN decisions, warnings, no deployment and no automatic merge.

Pre-staging: recheck branch/HEAD/index; require exact 94-path set; recompute all 93 row hashes and the packet hash supplied separately in chat. Stop for drift. Stage explicit paths only, verify cached name/status set, cached whitespace/stat and credential indicators. No staging is performed now. If only documentation changed, reuse test results with dates and byte-identity disclosure; rerun targeted tests for any material code/schema/test-contract delta.

## 6. Migration and rollback approach

Existing P0 chain `demo_0001 -> auth_0002 -> demo_0002 -> demo_0003 -> demo_0004 -> demo_0005`; candidate branch `auth_0002 -> p1_0003`; metadata-only join `int_p1_0006` has parents `(demo_0005, p1_0003)` and is the single head. Earlier revisions were not rewritten; branches add disjoint tables and p1 extends the existing intent vocabulary. Fresh and P0-upgrade tests validate actual operations and metadata, not merely graph shape.

No migration/downgrade against Owner/legacy/development databases is authorized by packaging. Prefer additive forward-fix migration after approval when data exists. Future Git revert must assess app/schema compatibility; a code revert does not undo PostgreSQL. Never use reset/stash/clean or destructive database rollback. Before any future non-disposable migration, require target identity, ownership, backup/restore and explicit Owner approval. Current uncommitted work and existing worktrees must remain intact; pre-packaging handoff/hash backup location is recorded at the end, not a request to restore it.

## 7. Risks and decisions for Owner

- Accept bounded local synthetic candidate, **not** full MVP, production, field methodology or real-data authorization. Owner manual UAT and Figma/UI acceptance remain pending.
- OD-P1-01 inventory reconciliation/ownership; **OD-P1-02 effective measurement selection/allocation remains OPEN**; OD-P1-03 disposition taxonomy/safety authority; OD-P1-04 yield basis; OD-P1-05 sampling; OD-P1-06 operation_date/timezone.
- OD-P2-01 source-gated KPI readiness/formulas; OD-P2-02 cost ownership/allocation; OD-P2-03 provisional alert catalogue. Global alert administration remains denied, including access=None. No automatic rescue or global permissions.
- PRD OPEN source/vocabulary/RACI/evidence/review decisions, Gate B, ADR-005 physical evidence, Master DTO hierarchy/version mapping, retention/backup/performance/offline and government integration remain unresolved where applicable. Accepted ADR technology decisions are not reopened by historical PRD OPEN wording.
- FWI-02/03 originals were unavailable for prior candidate methodology verification; repo consistency does not validate all FWI-03/FWI-04. Internal legacy `eligible_mass` helper alias is raw-only; HTTP eligible/reportable mass remains null.
- Windows asyncio connection-reset/shutdown diagnostics, 130 backend warnings, React act/jsdom diagnostics and >500kB bundle warning remain technical debt; passing assertions do not claim these fixed.
- Browser coverage is bounded scenarios, not exhaustive P1/P2 workflows, penetration test, load test or exactly-once guarantee. Local sessionStorage UNKNOWN locks do not guarantee cross-tab/device exactly-once.
- Raw evidence is ignored/ephemeral. Owner should approve sanitized evidence retention/CI strategy and whether separate external delta review is required before PR acceptance. No external sign-off is represented by Codex self re-verification.
- Approve exact commit boundaries/94-file allowlist separately; current task does not authorize commit, push, PR or deployment. Branch baseline may diverge from latest main and must be verified then without overwriting local work.

## 8. Exact original 93-path allowlist / final hashes

Paths are repository-relative to `D:/Projects/fwi-integration-01`. `M` means modified, `A` means proposed add (currently untracked). C1 is runtime/tests/migrations; C2 is documentation. Hashes pin raw bytes after the documentation-only preparation; HANDOFF is the only original path changed in this task.

| Commit | Status | Category | Exact path | Raw SHA-256 |
|---|---|---|---|---|
| C2 | M | Dokumentasi | `docs/ai/HANDOFF.md` | `954bdd1c4b926409e54c49250060f6337d19e5daaf59436665f549cd99aa7889` |
| C2 | A | Dokumentasi | `docs/backend/FWI-P1-CANDIDATE.md` | `e6f445f57970db58a59af9a46d0e09ce36e5ea251ad0d0d681c065d6983cb053` |
| C1 | A | Tes / harness | `frontend/e2e/backend-fixture.mjs` | `bd1e21e67980a640dddab1fb58e53e382dd320a5eb2abae66c00b547d3232bd7` |
| C1 | A | Tes / harness | `frontend/e2e/mvp-p0-journeys.spec.mjs` | `bdedc5962191641da0ee4e942e8fa1dbbcb5bc5b482814fe33dae4f186847e67` |
| C1 | M | Tes / harness | `frontend/e2e/persistent-capture.spec.mjs` | `b5c9d23b97bbb3c4e555815bdf76df0c092050dbceeec208bab18e152ac79e4f` |
| C1 | M | Aplikasi / konfigurasi | `frontend/src/App.tsx` | `bcda1553a7413b2044217900861f51dfc9b7eecfc06bb607b438209e2f63b610` |
| C1 | M | Aplikasi / konfigurasi | `frontend/src/backend/auth.ts` | `4341298a20e2e2afca26e0ec7e8d928b8939efabf1e39241956f95e85dce520f` |
| C1 | M | Aplikasi / konfigurasi | `frontend/src/backend/client.ts` | `77a8e7ab4bdb0a22d867112f29b0846355e322ab8abb886c3af9eb0b45a580ac` |
| C1 | M | Aplikasi / konfigurasi | `frontend/src/backend/contract.ts` | `a36e4e1290b5ccb810c26d87d06740240a06d483e46fd2bb7499c3235d675f2c` |
| C1 | A | Aplikasi / konfigurasi | `frontend/src/backend/evidence.ts` | `4ee7037ea27bb54d4e5cec756d6f8701dc7c86fe44921c25f7a66ec095e547a1` |
| C1 | A | Aplikasi / konfigurasi | `frontend/src/backend/export-live.ts` | `0d35b9e4fcd19e9383115fc865c52d4e767ab912e8b8d299d1650b646db63d6d` |
| C1 | A | Aplikasi / konfigurasi | `frontend/src/backend/p1.ts` | `61ab948c8fd942c2079e8726fa4f227d261025b1166629f39ccd043dfba8ebff` |
| C1 | A | Aplikasi / konfigurasi | `frontend/src/backend/review.ts` | `784bc82d199a0cd06b51f679b7a4d87908e37b4752a9cfeb04473671a5b59274` |
| C1 | M | Aplikasi / konfigurasi | `frontend/src/backend/write.ts` | `27b9c0f572d611dbc963b64e88096e18fb226935405ebe30993de7e739d6c334` |
| C1 | M | Aplikasi / konfigurasi | `frontend/src/components/layout/AppLayout.tsx` | `2be20d4b9918b6d91d51a86903fd1decb18790c082e7e226b0d64a6bd7f469ee` |
| C1 | M | Aplikasi / konfigurasi | `frontend/src/pages/BackendCapturePage.tsx` | `3244f4dd4f194a4c40fe924da9150e188fc2bdc383f97a311bf8c95ebb9fc558` |
| C1 | A | Aplikasi / konfigurasi | `frontend/src/pages/BackendDataQualityPage.tsx` | `820aa21a3c886bf7b5d32dd40efed88cfc752c372629c10747ac02b390853e68` |
| C1 | A | Aplikasi / konfigurasi | `frontend/src/pages/BackendDistributionPage.tsx` | `37531b9bb1d7d24866cbd2d11f044647fb948ec8d474bb564c47805f0ea4d52e` |
| C1 | M | Aplikasi / konfigurasi | `frontend/src/pages/BackendEventDetailPage.tsx` | `feb14e97c4d80abfa31c59e859002193afa63141590d934a8ad7e7cbef1e39f4` |
| C1 | A | Aplikasi / konfigurasi | `frontend/src/pages/BackendEvidencePage.tsx` | `42ffb6954689f9c4c0ec681d20ce64d1cc44593e71e05061e43c888889834a23` |
| C1 | A | Aplikasi / konfigurasi | `frontend/src/pages/BackendExportLivePage.tsx` | `debd4a5e5e9b1fe35276733c959ceba07e4f1a202e71cd29a272d1cf6e58fbd8` |
| C1 | A | Aplikasi / konfigurasi | `frontend/src/pages/BackendInsightsPage.tsx` | `06c84c2d2c59a7b65e1ab3eb31ed75492460f90bcaa3b5da7801aa36b506b087` |
| C1 | A | Aplikasi / konfigurasi | `frontend/src/pages/BackendLedgerPage.tsx` | `4cf3f152dfdc13c7bbbbbd29ffb79392163e99be12e549626c85761b06a29443` |
| C1 | A | Aplikasi / konfigurasi | `frontend/src/pages/BackendMasterPage.tsx` | `75d149ec714142e2c5a8cb804702cbbcfda535e1bbf5c6f319e978c49242ceda` |
| C1 | A | Aplikasi / konfigurasi | `frontend/src/pages/BackendOperationsPage.tsx` | `f02adb05ff61fdff8e9efd15e9a0c8cb58d6741ef177f7d4bd27a556430d286f` |
| C1 | A | Aplikasi / konfigurasi | `frontend/src/pages/BackendProductionPage.tsx` | `e822f2c0f1725999b2e9c323af6a870efb4151693106df1d8388fda691e8581c` |
| C1 | A | Aplikasi / konfigurasi | `frontend/src/pages/BackendReviewPage.tsx` | `77af7d4c6753b003e27939c7d86428e90f1a4791e218e3d273deb90af0ed3543` |
| C1 | M | Tes / harness | `frontend/tests/backend-auth.test.tsx` | `a8cd0843798941593f0624ba617f946a49d09e531c5f9ccae29bfaf8ad1cc312` |
| C1 | M | Tes / harness | `frontend/tests/backend-detail.test.tsx` | `32f63e50b4d89a7ee55d886cecfdbefef49a4278c22c4b21bf1da8a3c61516d2` |
| C1 | A | Tes / harness | `frontend/tests/backend-dq-live.test.tsx` | `74eb7d6cb0e42ebe20480b8dee382364455e74b728ea64593b81de9d13d5cdd2` |
| C1 | A | Tes / harness | `frontend/tests/backend-evidence.test.tsx` | `9dbe30202018917ed55ae35de1a884c3618b80438f5232ba86a88aa743a15887` |
| C1 | A | Tes / harness | `frontend/tests/backend-export-live.test.tsx` | `a4ee761ac72632b5b111cfdb14a59be0cb48e9058120f7b4688a7e60729d3906` |
| C1 | A | Tes / harness | `frontend/tests/backend-ledger.test.tsx` | `3c5062247b20e6c4e5d57d3a2e677e9548923832f9af0bf1a0b8e6a5b7ea2e42` |
| C1 | A | Tes / harness | `frontend/tests/backend-master.test.tsx` | `8f1f97f8eef5573aa698339e6f807318b990473f4e25c89c45e9c29eac040108` |
| C1 | A | Tes / harness | `frontend/tests/backend-operations.test.tsx` | `44bc87cc048771ce8123e255d0bc582e130891403a968b86e5be479c366cc00d` |
| C1 | A | Tes / harness | `frontend/tests/backend-p1-extended.test.tsx` | `5c4d9f040d39bef6c146a2bfb9cbfd3148c16796a0ec1251d0c0a31ed78995ce` |
| C1 | M | Tes / harness | `frontend/tests/backend-proxy.test.mjs` | `26206569c489417e2844f5ae1435ad5895d982ac8c980e943e759eff1534f7e7` |
| C1 | A | Tes / harness | `frontend/tests/backend-review.test.tsx` | `fe7a03b132923384ffbcc16ced94a603a537d6d74120afa066cce3fd35414286` |
| C1 | A | Tes / harness | `frontend/tests/unknown-post-guard.test.tsx` | `b56bcc3214759cd32934469b3b85caece09e7f8bc36b7b0702dd91ff762b2dec` |
| C1 | M | Aplikasi / konfigurasi | `frontend/vite.config.ts` | `344b9be70de175a32111d4d18200996fd475f8ee5fad2be8f2f251e94206e4ca` |
| C1 | M | Migrasi | `migrations/env.py` | `23ae40f596a715cd58ca7a90960a31db30171a428ed891940d34c3e982b63bbd` |
| C1 | A | Migrasi | `migrations/versions/demo_0002.py` | `6391c53d4fc4d51fad0e60b4ba75344d11e969f85d6055ecbf728cdad9cce5a0` |
| C1 | A | Migrasi | `migrations/versions/demo_0003.py` | `e18bc3ce2cc01f2842a7721151ce32a8d69b61a1292ae3e1d104f60289674fab` |
| C1 | A | Migrasi | `migrations/versions/demo_0004.py` | `3ae2b00cad1a728d42243ab7f89f3583f0250d41518dba543677337d39031f64` |
| C1 | A | Migrasi | `migrations/versions/demo_0005.py` | `d1c0a531827d5f39779d99f76d595750bb0cf0be5bee4b821b88677722197aca` |
| C1 | A | Migrasi | `migrations/versions/int_p1_0006.py` | `bcd07fe0851f0cef94cf108dc3379ace26016a07c335295d66fc5c6ab6739237` |
| C1 | A | Migrasi | `migrations/versions/p1_0003.py` | `38d9b1407a17970f8d67d674f9bf56bffaa1a14878bd4853e9badc355cbb3424` |
| C1 | M | Tes / harness | `scripts/browser_e2e_harness.py` | `9c76084d2b191db326947a62670633294533f6e4c1cfdb568f6c5cefed2bb8c3` |
| C1 | M | Aplikasi / konfigurasi | `src/fwi/api/app.py` | `96f980945f4dd280b0aa43d8ac7295fc55db1df486c8b78ba20a2ac8fd953a19` |
| C1 | M | Aplikasi / konfigurasi | `src/fwi/api/routes/auth.py` | `f4a6d4991a835e1dbd75e0b6630a26305f290b9effe338946d1f6f01d573fce8` |
| C1 | M | Aplikasi / konfigurasi | `src/fwi/api/routes/demo.py` | `b3c89f2a20eaec02cdc245353ad81730559871bac1a5a75ac400f0b29b75f36c` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/api/routes/p1.py` | `96074efe27fe269f8cdff9c8e6e5167ed16e1616212d11eb59dbc05775254e86` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/api/routes/p2.py` | `ed9d6123be508f91701a0d5b4cc6a584115df4dfa19ea2729767a64b1b72e755` |
| C1 | M | Aplikasi / konfigurasi | `src/fwi/api/schemas_demo.py` | `f6792afda1676d0261e55f552d35927317d7408f229c02197b8b38c757e098c6` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/api/schemas_p1.py` | `c64bc73c371737b827cb28adde7d82f098d095ea6ffd9eae3c39101dedc7b322` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/api/schemas_p2.py` | `5360a56ac6fcef509ccc46452d48ccede2ed4cb26b29c89d4705a689d0911c09` |
| C1 | M | Aplikasi / konfigurasi | `src/fwi/application/demo.py` | `2049ca6fdc433d5a1cc1814953df70dc8ca3e88dfcef23097d869e0a84777eea` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/application/evidence_store.py` | `2de1dc93e7a97a1fac12ed29c3cbde16c36b784088d7e905f122f42f220bb02b` |
| C1 | M | Aplikasi / konfigurasi | `src/fwi/application/export_csv.py` | `0a1bb2f48dc96cdaca9701149b2d57201afb0277428e7976c8aa221c9329f3cd` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/application/export_service.py` | `b5222092a5856bc4b91534e4fdcdc0af722562daf41dd5e27ae8c9aad22989ab` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/application/master.py` | `a5c04c851eba4a7ca8b2d38e8858003fff9f03b4979456aa602648a7c04f1554` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/application/p1.py` | `75fb98412b5ad76d7b91d2b1517fb2c6dfaed22a0ee3f220673571fdd0977510` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/application/p2.py` | `b5f0d7b4b56d962a5eec36a2fa91f1c600f81447a26e27bd3d50fe316ba0c7ad` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/application/review_store.py` | `3a252c812346278633242efbe008a8e7bc4cfe011804db96bf01c60c5d525751` |
| C1 | M | Aplikasi / konfigurasi | `src/fwi/application/security.py` | `60121548aa12815e50a484ab750f50bfa20bd09a9359fd68f412fa8c8f90cda2` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/domain/aggregation.py` | `107974fbf57c729a52a2c6ae7605c58da16b07e10b8ef3c8510ad6ddf12a9301` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/domain/disposition.py` | `b86c35103e7348c647a317b44ff07faf925a864c262aa89047bbada5572def16` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/domain/distribution.py` | `14ab03dee73d7c66a8754dbc69911879dafafd8b8a6f158b2081394b37bb7566` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/domain/kpi_catalogue.py` | `09f5ffb5775fecb118514344fd78fd3746e27ca05b381170e1a94b6e69e7126f` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/domain/lineage.py` | `1575ec55a1e52d8266774379d6e1ed9089b5818cf1dd3e9caaedf0c6d1829aaa` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/domain/operations.py` | `5977a615918ab963c87e98da7f9c2276871593592191cc171a2dc4805a5eee50` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/domain/production.py` | `595cf24c9fcef225b12bcb6dcfed050866e2b8073801a59e863f25dbf7637185` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/domain/recommendations.py` | `361a1bc163fa7438acb4d30f00e0b19d21fa8bce96e85484450a2f1ff0136bf6` |
| C1 | M | Aplikasi / konfigurasi | `src/fwi/infrastructure/database/models.py` | `e417a0544e45e7a959ab31b591db6239c6221695f6727874ec699b7aef1eee3e` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/infrastructure/database/models_p1.py` | `4f0e5c86e3776c96780421ceb8573b4c84a23230e9eaff16b70d46ddc6c7b2e3` |
| C1 | A | Aplikasi / konfigurasi | `src/fwi/infrastructure/database/p2_seed.py` | `eb264b3a3d3c0e87b07652edc5c608335f4b421daa887290b251d1ca417028a5` |
| C1 | A | Tes / harness | `tests/p1_support.py` | `87e3ac721b31e95d3c3dc6219da9b26df3235959b18c7c80f7ad4c6e40be2384` |
| C1 | A | Tes / harness | `tests/test_dq_live_postgresql.py` | `542a3ce2b647cc48c434be90c90f88b168f9da1056076174f6f0ebfa31d640df` |
| C1 | A | Tes / harness | `tests/test_evidence_postgresql.py` | `4a6858b867f028d4815a095c0f5cdc3caaaccbc3291301a4054393df9026f42b` |
| C1 | M | Tes / harness | `tests/test_export_csv.py` | `d3aa4f8a5ca3f37e4aef9410cc80b543b513f4a826913c1bc9a913b79ecf190f` |
| C1 | A | Tes / harness | `tests/test_export_postgresql.py` | `0b0fab5c14e2cfdce528fa9d023efad6afa8e96a85950ab2b2c9ae3ea9efbc88` |
| C1 | A | Tes / harness | `tests/test_fwi03_desk_matrix.py` | `7dd201254790b4f419b7970d57b5616779713085b1ed6d239d123b121634d1c3` |
| C1 | A | Tes / harness | `tests/test_integrated_migrations_postgresql.py` | `1d73ff8f212ff10ff8419521f3438bf14c22cc0a6e63aeb42ae07fc963ddc92e` |
| C1 | A | Tes / harness | `tests/test_ledger_postgresql.py` | `4b19a0398556f23de4dd7f9062266eba83f04bd536a05ac0bd01dfca63485673` |
| C1 | A | Tes / harness | `tests/test_master_postgresql.py` | `65cb7cc734365546627fe396ad93d7592d98680ae2477ea380e721db31eafe20` |
| C1 | A | Tes / harness | `tests/test_new_surface_security_postgresql.py` | `fc8ce935825d4cbd009ba6804a98bf7616a5dbd0d81b4e0234cd01f33a564bdc` |
| C1 | A | Tes / harness | `tests/test_p1_domain.py` | `54c6614400d4628f09577342e9a0b1ccdb961fb24bcf3a7d4cf88cfe32fa386b` |
| C1 | A | Tes / harness | `tests/test_p1_e2e_postgresql.py` | `f0d90fae907b13a06ffa2e3b701cb7e73bbdf53c4745c83373475a640bb0cd2f` |
| C1 | A | Tes / harness | `tests/test_p1_postgresql.py` | `fac6524b62d01059c67e56e2e86be58a2753e8660225a95f83b85762dff59104` |
| C1 | A | Tes / harness | `tests/test_p1_remediation_postgresql.py` | `4a5b604b97a58d45c48e7db4eec9b9135d01a9ce3a955fa83147c869d49f4ddd` |
| C1 | A | Tes / harness | `tests/test_p2_postgresql.py` | `aa056f427de597c2f0a9400c661b3da61d26911314c5e45417d040f01bf5c14f` |
| C1 | A | Tes / harness | `tests/test_p2_recommendations.py` | `524198476c3c60bc8d68af7fba59ba1914720ca5fb6f8136fc03f2c996ecbae4` |
| C1 | A | Tes / harness | `tests/test_review_postgresql.py` | `366859e5f133d3126f1bcbc3fd626718224d49224444b599ad73be733aa5c3e6` |

### Additional C2 path (94th file)

`docs/ai/FWI_OWNER_ACCEPTANCE_PACKET_2026-11-10.md` — proposed add. Its SHA-256 is supplied separately in chat after rendering this text; no self-referencing hash is embedded.

## 9. Preparation validation

- Source/application/test/migration byte identity versus acceptance: PASS; no runtime implementation changes.
- Original pending-file scan: 93/93 processed; zero listed credential indicators.
- Full test suites NOT RERUN; evidence reused with provenance and dates.
- Existing ignored evidence confirmed excluded; staging index empty.
- Whitespace and packet inventory validation run after generation; exact final packet hash reported in chat.
- READY FOR OWNER PACKAGING APPROVAL; not approval of implementation gaps, scientific policy, full MVP or production.

Private local pre-packaging handoff/hash backup: `C:/Users/Ferdana/AppData/Local/Temp/fwi-owner-packaging-kk5_omgk`. No secrets stored in this backup.
