import { fillTimestamp, openSourceDetails } from './ux-helpers.mjs';
/** FWI MVP-P0 authorized browser journeys (Tasks: ledger, DQ, master, evidence,
 *  review, export) over real Vite->FastAPI->PostgreSQL with temporary loopback TLS.
 *  No DemoStore fallback, no automatic POST replay; evidence from DB snapshots. */
import { expect } from '@playwright/test';
import { test, login, SITE_A, SITE_B } from './backend-fixture.mjs';

const ORIGIN = 'https://127.0.0.1:5173';

// Test-only instant comparison: same calendar/clock/offset and 1..6 fractional
// digits as the API contract; a single space also supports the harness's DB
// datetime snapshot rendering. No API input or timezone policy is changed.
function timestampMicros(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || match[0] !== value) throw new Error('Invalid aware timestamp');
  const [, y, mo, d, h, mi, se, fraction = '', offset] = match;
  const [year, month, day, hour, minute, second] = [y, mo, d, h, mi, se].map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const [offsetHour, offsetMinute] = offset === 'Z' ? [0, 0] : offset.slice(1).split(':').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1] ||
      hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59)
    throw new Error('Invalid aware timestamp');
  // Date parses only already-validated whole seconds; BigInt retains microseconds.
  const milliseconds = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${se}${offset}`);
  if (!Number.isFinite(milliseconds)) throw new Error('Invalid aware timestamp');
  return BigInt(milliseconds) * 1000n + BigInt(fraction.padEnd(6, '0'));
}

test.beforeEach(async ({ page, backend }) => { await login(page, backend); });

async function createEvent(page, { stage = 'preparation', operationDate = '2026-11-06' } = {}) {
  await page.goto('/backend-demo/capture');
  await page.getByLabel('Jenis kejadian').selectOption('at_risk_surplus');
  if (stage) await page.getByLabel(/Tahap kegiatan \(opsional\)/).fill(stage);
  await page.getByLabel(/Tanggal kegiatan dapur \(opsional/).fill(operationDate);
  await fillTimestamp(page, 'Tanggal dan waktu kejadian', '2026-11-06T12:00:00+08:00');
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/demo/v0.1/events' && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Simpan kejadian', exact: true }).click();
  const created = await response;
  if (created.status() !== 201) console.log('EVENT POST BODY', await created.text());
  expect(created.status()).toBe(201);
  await expect(page.getByText(/Kejadian berhasil dicatat./)).toBeVisible();
  const eventId = new URL(page.url()).searchParams.get('event');
  expect(eventId).toMatch(/^[0-9a-f-]{36}$/);
  return eventId;
}

async function fillMeasurement(page, { gross, tare, net, lexeme } = {}) {
  await page.getByLabel(/^Kondisi hasil pengukuran/).selectOption('observed');
  await page.getByLabel(/^Kondisi pangan saat diukur/).selectOption('cooked');
  await page.getByLabel('Berat total termasuk wadah (kg)', { exact: true }).fill(gross);
  await page.getByLabel('Berat wadah (kg)', { exact: true }).fill(tare);
  await page.getByLabel('Berat pangan tanpa wadah (kg)', { exact: true }).fill(net);
  await openSourceDetails(page);
  await page.getByLabel(/Nilai asal diketik apa adanya/).fill(lexeme ?? net);
  await page.getByLabel('Bagaimana berat diperoleh?', { exact: true }).fill('synthetic_ci_scale');
  await page.getByLabel('Dari mana data ini berasal?', { exact: true }).fill('FWI MVP-P0 browser journey');
  await fillTimestamp(page, 'Tanggal dan waktu pengukuran', '2026-11-06T12:02:00+08:00');
}

async function submitMeasurement(page, eventId) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === `/demo/v0.1/events/${eventId}/measurements` && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Simpan pengukuran', exact: true }).click();
  expect((await response).status()).toBe(201);
  await expect(page.getByText(/Pengukuran tersimpan./)).toBeVisible();
}

test('J-01..J-03: ledger, repeat measurement, DQ, master, evidence, review stay consistent', async ({ page, backend }, testInfo) => {
  // 3. Create Waste Event (with stage + operation_date), 4-6. Ledger + filter + detail.
  const eventId = await createEvent(page);
  await page.goto('/backend-demo/ledger');
  await expect(page.getByText(/Riwayat Kejadian Sisa Pangan/)).toBeVisible();
  await expect(page.getByRole('status')).toContainText('1 dari 1 kejadian');
  await page.getByLabel(/Tanggal kegiatan dapur dari/).fill('2026-11-06');
  await page.getByRole('button', { name: 'Terapkan filter' }).click();
  await expect(page.getByRole('status')).toContainText('1 dari 1 kejadian'); // operation_date filter matches
  await page.getByLabel(/Tanggal kegiatan dapur dari/).fill('2027-01-01');
  await page.getByRole('button', { name: 'Terapkan filter' }).click();
  await expect(page.getByText(/Belum ada kejadian yang cocok dengan pilihan ini/)).toBeVisible();
  await page.getByLabel(/Tanggal kegiatan dapur dari/).fill('2026-11-06');
  await page.getByRole('button', { name: 'Terapkan filter' }).click();
  await page.getByRole('link', { name: 'Lihat rincian', exact: true }).filter({ hasText: 'Lihat rincian' }).click();
  await expect(page).toHaveURL(new RegExp(`/backend-demo/events/${eventId}$`));

  // 7-8. First and repeated measurement on the SAME event.
  await page.goto(`/backend-demo/capture?event=${eventId}`);
  await fillMeasurement(page, { gross: '2.40', tare: '0.40', net: '2.00', lexeme: '2.40' });
  await submitMeasurement(page, eventId);
  await fillMeasurement(page, { gross: '2.30', tare: '0.40', net: '1.90', lexeme: '1,90 as operator typed' });
  await submitMeasurement(page, eventId);

  // 9-10. Event stays one; decimals + lexemes preserved in PostgreSQL.
  await page.goto('/backend-demo/ledger');
  await expect(page.getByRole('status')).toContainText('1 dari 1 kejadian'); // no join multiplication
  const mid = await backend.snapshot();
  expect(mid.counts).toMatchObject({ waste_events: 1, measurements: 2 });
  expect(mid.data.measurements.map(m => m.net).sort()).toEqual(['1.90', '2.00']);
  expect(mid.data.measurements.map(m => m.original_value_lexeme).sort()).toEqual(['1,90 as operator typed', '2.40'].sort());
  expect(mid.data.waste_events[0].operation_date).toBe('2026-11-06'); // separate from occurred_at
  expect(mid.data.waste_events[0].occurred_at).not.toContain('2026-11-06T00:00');

  // 11-13. Live DQ: distinct statuses, counts reconcile with the database.
  await page.goto(`/backend-demo/capture?event=${eventId}`);
  await fillMeasurement(page, { gross: '0.4', tare: '0.4', net: '0' });
  await page.getByLabel(/^Kondisi hasil pengukuran/).selectOption('measured_zero');
  await page.getByLabel('Berat pangan tanpa wadah (kg)', { exact: true }).fill('0.00');
  await submitMeasurement(page, eventId);
  const otherEvent = await createEvent(page, { stage: 'serving', operationDate: '2026-11-07' });
  await page.goto('/backend-demo/data-quality');
  await expect(page.getByText(/Mutu Data — LIVE BACKEND/)).toBeVisible();
  const panels = page.getByLabel('Ringkasan hitungan');
  await expect(panels).toContainText('2'); // two events total
  await expect(panels).toContainText('3'); // three measurements
  await expect(page.getByLabel('Rincian status observasi')).toContainText('measured_zero');
  await expect(page.getByLabel('Rincian status observasi')).toContainText('observed');
  await expect(page.getByText(/belum diukur ≠ nol terukur/)).toBeVisible();
  const dq = await backend.snapshot();
  expect(dq.counts.waste_events).toBe(2);
  expect(dq.counts.measurements).toBe(3);

  // 14. Master data: provisional namespaces, honest empty registry, no kpi namespace.
  await page.goto('/backend-demo/master');
  await expect(page.getByText(/Master Data — LIVE BACKEND/)).toBeVisible();
  await expect(page.getByRole('button', { name: /stage \(0\)/ })).toBeVisible();
  await expect(page.getByText(/Registry kosong untuk filter ini/)).toBeVisible();
  expect(await page.getByRole('button', { name: /^kpi/ }).count()).toBe(0);

  // 15. Evidence metadata create + read on the permitted event.
  await page.goto('/backend-demo/evidence');
  await page.getByLabel(/UUID target \(tulis\)/).fill(eventId);
  await page.getByLabel(/Sumber bukti/).fill('synthetic_note');
  await page.getByLabel(/^Judul/).fill('Catatan bin sintetis dari browser');
  await page.getByLabel(/Waktu catat/).fill('2026-11-06T12:10:00+08:00');
  const evidenceResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/demo/v0.1/evidence' && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Simpan metadata bukti' }).click();
  expect((await evidenceResponse).status()).toBe(201);
  await expect(page.getByText(/Metadata bukti tersimpan:/)).toBeVisible();
  await expect(page.getByText(/Catatan bin sintetis dari browser/)).toBeVisible();
  const withEvidence = await backend.snapshot();
  expect(withEvidence.data.evidence_references).toHaveLength(1);
  expect(withEvidence.data.evidence_references[0].target_id).toBe(eventId);
  // DB row keeps an internal column; it must stay unbound (null) in this
  // metadata-only slice. API non-exposure is proven by the PG test suite.
  expect(withEvidence.data.evidence_references[0].storage_ref).toBeNull();

  // 16-17. Correction proposal on the event; original record unchanged.
  await page.goto(`/backend-demo/review?event=${eventId}`);
  await page.getByLabel(/^Catatan yang ingin diperiksa/).selectOption('event:'+eventId);
  await page.getByLabel(/^Apa yang perlu diperiksa/).fill('Tanggal dan waktu kejadian tercatat terlalu dini dari browser journey');
  await page.getByLabel('Sumber pemeriksaan', { exact: true }).fill('synthetic_reviewer');
  await page.getByLabel('Asal keterangan', { exact: true }).fill('FWI MVP-P0 browser journey');
  await page.getByLabel(/Usulan waktu kejadian baru/).fill('2026-11-06T12:30:00+08:00');
  const reviewResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/demo/v0.1/reviews' && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Kirim Usulan Pemeriksaan' }).click();
  expect((await reviewResponse).status()).toBe(201);
  await expect(page.getByText(/Belum ada perubahan otomatis/)).toBeVisible();
  const proposed = await backend.snapshot();
  expect(proposed.data.correction_proposals).toHaveLength(1);
  expect(proposed.data.correction_proposals[0].state).toBe('proposed');
  // Timestamp preservation: compare instants, not a connection's display offset.
  const beforeReviewEvent = withEvidence.data.waste_events.find(e => e.event_id === eventId);
  expect(beforeReviewEvent).toBeDefined();
  const originalInstant = timestampMicros(beforeReviewEvent.occurred_at);
  expect(originalInstant).toBe(timestampMicros('2026-11-06T12:00:00+08:00'));
  const proposal = proposed.data.correction_proposals[0];
  expect(proposal.target_id).toBe(eventId);
  expect(timestampMicros(proposal.original_values.occurred_at)).toBe(originalInstant);
  const proposedInstant = timestampMicros(proposal.proposed_values.occurred_at);
  expect(proposedInstant).toBe(timestampMicros('2026-11-06T12:30:00+08:00'));
  expect(proposedInstant - originalInstant).toBe(30n * 60n * 1_000_000n);
  const persistedEvent = proposed.data.waste_events.find(e => e.event_id === eventId);
  expect(persistedEvent).toEqual(beforeReviewEvent); // Entire original row remains unchanged.
  expect(timestampMicros(persistedEvent.occurred_at)).toBe(originalInstant);
  expect(proposed.counts).toMatchObject({ waste_events: withEvidence.counts.waste_events,
    measurements: withEvidence.counts.measurements, evidence_references: withEvidence.counts.evidence_references });
  // End timestamp preservation.
  expect(proposed.data.review_decisions).toHaveLength(1);
  expect(proposed.data.audit_events.filter(a => a.entity_type === 'review_decisions')).toHaveLength(1);

  // 21. Refresh persistence across the whole journey.
  await page.goto('/backend-demo/ledger');
  await page.reload();
  await expect(page.getByRole('status')).toContainText('2 dari 2 kejadian');
  const refreshed = await backend.snapshot();
  expect(refreshed.counts).toMatchObject({ waste_events: 2, measurements: 3, evidence_references: 1 });
  expect(refreshed.data.waste_events.find(e => e.event_id === eventId)).toEqual(beforeReviewEvent);
  expect(refreshed.data.correction_proposals[0].original_values).toEqual(proposal.original_values);
  await testInfo.attach('journey-evidence', { body: JSON.stringify({ eventId, otherEvent }), contentType: 'application/json' });
});

test('J-04: authorized export delivers exact CSV, scope headers; foreign site concealed', async ({ page, backend }, testInfo) => {
  const eventId = await createEvent(page);
  await page.goto(`/backend-demo/capture?event=${eventId}`);
  await fillMeasurement(page, { gross: '2.40', tare: '0.40', net: '2.00' });
  await submitMeasurement(page, eventId);

  await page.goto('/backend-demo/export');
  await expect(page.getByText(/Ekspor CSV — LIVE BACKEND/)).toBeVisible();
  await expect(page.getByText(/XLSX belum tersedia/)).toBeVisible();
  await page.getByRole('button', { name: 'Ambil ekspor dari server' }).click();
  await expect(page.getByText(/fwi-synthetic-export-v0.1/)).toBeVisible();
  await expect(page.getByText(/1 event/)).toBeVisible();

  // 18-19. CSV content: exact decimal, synthetic label, site scope; no site B rows.
  const events = await page.request.get(`/demo/v0.1/export?site_id=${SITE_A}&dataset=events`, { headers: { origin: ORIGIN } });
  expect(events.status()).toBe(200);
  expect(events.headers()['content-type']).toContain('text/csv');
  expect(events.headers()['content-disposition']).toContain('attachment');
  const csv = await events.text();
  expect(csv).toContain(eventId);
  expect(csv).toContain('SYNTHETIC/DEMO');
  expect(csv).toContain('2026-11-06'); // operation_date preserved as source value
  const measurements = await page.request.get(`/demo/v0.1/export?site_id=${SITE_A}&dataset=measurements`, { headers: { origin: ORIGIN } });
  const csvMeasurements = await measurements.text();
  expect(csvMeasurements).toContain('2.00');
  expect(csvMeasurements).not.toContain('2.0,'); // no float truncation of the exact value
  expect((await page.request.get(`/demo/v0.1/export?site_id=${SITE_B}&dataset=events`, { headers: { origin: ORIGIN } })).status()).toBe(404);

  // 20. Unauthorized export: another principal probing site A is concealed.
  await Promise.all([page.waitForResponse(r => new URL(r.url()).pathname === '/auth/logout' && r.request().method() === 'POST' && r.status() === 200), page.getByRole('button', { name: 'Keluar', exact: true }).click()]);
  await login(page, backend, 'site_b_writer');
  expect((await page.request.get(`/demo/v0.1/export?site_id=${SITE_A}&dataset=events`, { headers: { origin: ORIGIN } })).status()).toBe(404);
  const own = await page.request.get(`/demo/v0.1/export?site_id=${SITE_B}&dataset=events`, { headers: { origin: ORIGIN } });
  expect(own.status()).toBe(200);
  expect(await own.text()).not.toContain(eventId); // no leakage of site A rows
  await testInfo.attach('export-csv-events', { body: csv, contentType: 'text/csv' });
});

test('J-05: failed API shows error state and recovers; responsive 390px layout stays usable', async ({ page, backend }) => {
  const eventId = await createEvent(page);
  // 23. Backend failure: DQ page shows an explicit error, never a fixture fallback.
  await page.route('**/demo/v0.1/data-quality*', async route => {
    if (route.request().method() === 'GET') await route.abort('connectionreset');
    else await route.continue();
  });
  await page.goto('/backend-demo/data-quality');
  await expect(page.getByText(/Layanan tidak tersedia/)).toBeVisible();
  await expect(page.getByLabel('Ringkasan hitungan')).toHaveCount(0);
  await page.unroute('**/demo/v0.1/data-quality*');
  await page.reload();
  await expect(page.getByLabel('Ringkasan hitungan')).toBeVisible(); // recovery via real backend
  await expect(page.getByText(/Mutu Data — LIVE BACKEND/)).toBeVisible();

  // 24. Mobile 390px: main actions visible, no horizontal page overflow.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/backend-demo/ledger');
  await expect(page.getByRole('button', { name: 'Terapkan filter' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto(`/backend-demo/capture?event=${eventId}`);
  await expect(page.getByRole('button', { name: 'Simpan pengukuran', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/backend-demo/ledger');
  await expect(page.getByRole('status')).toContainText('1 dari 1 kejadian');
});

test('J-07: ambiguous evidence POST stays LOCKED; GET success never unlocks', async ({ page, backend }) => {
  const eventId = await createEvent(page);
  // Force an ambiguous outcome AFTER the server processed the request.
  let posted = 0;
  await page.route('**/demo/v0.1/evidence', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    posted += 1;
    const response = await route.fetch({ maxRetries: 0 });
    expect(response.status()).toBe(201); // committed server-side
    await route.abort('connectionreset'); // acknowledgement lost
  });
  await page.goto('/backend-demo/evidence');
  await page.getByLabel(/UUID target \(tulis\)/).fill(eventId);
  await page.getByLabel(/Sumber bukti/).fill('synthetic_note');
  await page.getByLabel(/^Judul/).fill('Catatan UNKNOWN guard');
  await page.getByLabel(/Waktu catat/).fill('2026-11-06T12:10:00+08:00');
  await page.getByRole('button', { name: 'Simpan metadata bukti' }).click();
  await expect(page.getByText(/belum terkonfirmasi \(UNKNOWN\)/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simpan metadata bukti' })).toBeDisabled();
  expect(posted).toBe(1); // exactly one POST attempt, no retry
  // Server-side truth: the record IS there (client must not guess).
  const after = await backend.snapshot();
  expect(after.data.evidence_references).toHaveLength(1);
  // Refresh keeps the lock (marker survives reload in the tab).
  await page.unroute('**/demo/v0.1/evidence');
  await page.reload();
  await expect(page.getByText(/belum terkonfirmasi \(UNKNOWN\)/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simpan metadata bukti' })).toBeDisabled();
  // A successful GET (even of the very record that was committed) NEVER unlocks:
  // no manual acknowledgement control exists at all.
  await page.getByLabel(/UUID target \(baca\)/).fill(eventId);
  await page.getByRole('button', { name: 'Baca daftar bukti (GET)' }).click();
  await expect(page.getByText(/Catatan UNKNOWN guard/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Hapus penanda/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Simpan metadata bukti' })).toBeDisabled();
  // No second POST was sent at any point; the committed record is untouched.
  expect(posted).toBe(1);
  expect((await backend.snapshot()).data.evidence_references).toHaveLength(1);
});

test('J-06: expired session closes every new private surface at once', async ({ page, backend }) => {
  const eventId = await createEvent(page);
  await backend.expireSessions();
  await page.goto('/backend-demo/ledger');
  await expect(page.getByRole('heading', { name: 'Masuk ke FWI' })).toBeVisible();
  await page.goto('/backend-demo/data-quality');
  await expect(page.getByRole('heading', { name: 'Masuk ke FWI' })).toBeVisible();
  expect((await page.request.get('/demo/v0.1/events?site_id=' + SITE_A, { headers: { origin: ORIGIN } })).status()).toBe(401);
  expect((await backend.snapshot()).counts.waste_events).toBe(1); // data persists server-side
});


test('INT-P1/P2: reportability, real three-role sessions, site denial and global alert denial', async ({ page, backend }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const eventId = await createEvent(page);
  const decimal = '0.12345678901234567890123456789';
  await fillMeasurement(page, { gross: decimal, tare: '0', net: decimal });
  await submitMeasurement(page, eventId);
  const trends = `/p1/v0.1/trends?site_id=${SITE_A}&date_from=2026-11-04&date_to=2026-11-06`;
  let response = await page.request.get(trends, { headers: { origin: ORIGIN } });
  expect(response.status()).toBe(200);
  const single = await response.json();
  expect(single.mass_reporting.reportable_mass).toBeNull();
  expect(single.mass_reporting.status).toBe('policy_unresolved');
  expect(single.per_basis[0].aggregation.eligible_mass).toBeNull();
  expect(single.per_basis[0].aggregation.raw_observed_mass).toBe(decimal);
  await fillMeasurement(page, { gross: '0.4', tare: '0.4', net: '0', lexeme: '0' });
  await page.getByLabel(/^Kondisi pangan saat diukur/).selectOption('raw');
  await page.getByLabel(/^Kondisi hasil pengukuran/).selectOption('measured_zero');
  await submitMeasurement(page, eventId);
  const committed = await backend.snapshot();
  expect(committed.counts.waste_events).toBe(1);
  expect(committed.counts.measurements).toBe(2);
  expect(new Set(committed.data.measurements.map(m => m.event_id))).toEqual(new Set([eventId]));
  await page.goto('/backend-operations');
  const loaded = page.waitForResponse(r => r.url().includes('/p1/v0.1/trends?'));
  await page.getByRole('button', { name: 'Muat tren (GET)', exact: true }).click();
  const multiple = await (await loaded).json();
  expect(multiple.completeness.events_total).toBe(1);
  expect(multiple.completeness.measurements_total).toBe(2);
  expect(multiple.mass_reporting).toMatchObject({ status: 'unresolved_selection', reportable_mass: null });
  expect(multiple.per_basis.every(b => b.aggregation.eligible_mass === null)).toBe(true);
  await expect(page.getByRole('status').filter({ hasText: 'Massa pelaporan belum tersedia' })).toContainText('unresolved_selection');
  for (const code of ['OP-08','FI-02','NI-03']) {
    await expect(page.getByRole('row').filter({ hasText: code })).toContainText('HELD');
    const preview = await page.request.get(`/p2/v0.1/kpi/${code}/preview`, { headers: { origin: ORIGIN } });
    expect(preview.status()).toBe(200);
    const value = await preview.json();
    expect(value.design_status).toBe('held');
    expect(value).not.toHaveProperty('value');
    expect(value).not.toHaveProperty('result');
  }
  const beforeReads = await backend.snapshot();
  await page.reload();
  await page.getByRole('button', { name: 'Muat tren (GET)', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Massa pelaporan belum tersedia' })).toContainText('unresolved_selection');
  await page.goto('/backend-insights');
  await expect(page.getByText('event_coverage_insufficient', { exact: false }).first()).toBeVisible();
  expect((await backend.snapshot()).sha256).toBe(beforeReads.sha256);
  for (const role of ['site_a_writer', 'site_a_reader', 'site_b_writer']) {
    if (role !== 'site_a_writer') {
      await Promise.all([page.waitForResponse(r => new URL(r.url()).pathname === '/auth/logout' && r.request().method() === 'POST' && r.status() === 200), page.getByRole('button', { name: 'Keluar', exact: true }).click()]);
      await expect(page.getByRole('heading', { name: 'Masuk ke FWI' })).toBeVisible();
      await login(page, backend, role);
    }
    const sessionResponse = await page.request.get('/auth/session', { headers: { origin: ORIGIN } });
    expect(sessionResponse.status()).toBe(200);
    const session = await sessionResponse.json();
    expect(session.sites[0].permissions).toContain('alert.read');
    if (role !== 'site_a_reader') expect(session.sites[0].permissions).toContain('alert.ack');
    const beforeDenied = await backend.snapshot();
    const denied = await page.request.post('/p2/v0.1/recommendations/rules/event_coverage_insufficient/disable', {
      headers: { origin: ORIGIN, 'x-csrf-token': session.csrf_token }, data: { site_id: session.sites[0].site_id, disabled: true }, maxRetries: 0 });
    expect(denied.status()).toBe(403);
    const foreign = role === 'site_b_writer' ? SITE_A : SITE_B;
    expect((await page.request.get(`/p1/v0.1/trends?site_id=${foreign}&date_from=2026-11-04&date_to=2026-11-06`, { headers: { origin: ORIGIN } })).status()).toBe(404);
    if (role === 'site_a_reader') {
      const rejected = await page.request.post('/p1/v0.1/receipts', { headers: { origin: ORIGIN, 'x-csrf-token': session.csrf_token }, data: { organization_id: '11111111-1111-4111-8111-111111111111', site_id: SITE_A, source_ref: 'reader-must-not-write', received_at: '2026-11-06T12:00:00+08:00', note: null }, maxRetries: 0 });
      expect(rejected.status()).toBe(403);
    }
    expect((await backend.snapshot()).sha256).toBe(beforeDenied.sha256);
  }
  expect(errors).toEqual([]);
  await testInfo.attach('combined-reportability-evidence', { body: JSON.stringify({ eventId, single, multiple, console_page_errors: errors }), contentType: 'application/json' });
});


test('UX-01: normal operator flow has no UUID typing; desktop/mobile preserve real records', async ({ page, backend }, testInfo) => {
  const screenshots = async (name) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    await page.screenshot({ path: `browser-evidence/ux01-${name}.png`, fullPage: true });
    await testInfo.attach(name, { path: `browser-evidence/ux01-${name}.png`, contentType: 'image/png' });
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/backend-demo/capture');
  await expect(page.getByRole('heading', { name: 'Catat Kejadian Sisa Pangan', exact: true })).toBeVisible();
  await screenshots('desktop-event');
  const eventId = await createEvent(page);
  await fillMeasurement(page, { gross: '2.400000000000000001', tare: '0.400000000000000001', net: '2.00' });
  await screenshots('desktop-measurement');
  await submitMeasurement(page, eventId);
  await fillMeasurement(page, { gross: '0.400', tare: '0.400', net: '0.000' });
  await page.getByLabel(/^Kondisi hasil pengukuran/).selectOption('measured_zero');
  await submitMeasurement(page, eventId);
  await page.getByRole('link', { name: 'Lihat rincian kejadian →', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/backend-demo/events/${eventId}$`));
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByLabel('Ringkasan pengukuran backend')).toContainText('Jumlah pengukuran2');
  await expect(page.getByText(/Berat untuk laporan belum dapat ditentukan/)).toBeVisible();
  const saved = await backend.snapshot();
  expect(saved.counts).toMatchObject({ waste_events: 1, measurements: 2 });
  expect(saved.data.measurements.every(m => m.event_id === eventId)).toBe(true);
  expect(saved.data.measurements.find(m => m.observation_status === 'observed').gross).toBe('2.400000000000000001');
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(2);
  expect((await backend.snapshot()).sha256).toBe(saved.sha256); // reads only
  await screenshots('desktop-detail');
  await page.getByRole('link', { name: 'Ajukan pemeriksaan', exact: true }).first().click();
  await expect(page.getByLabel(/^Catatan yang ingin diperiksa/)).toHaveValue('event:' + eventId);
  await page.getByLabel(/^Apa yang perlu diperiksa/).fill('Verifikasi waktu sumber sintetis UX');
  await page.getByLabel('Sumber pemeriksaan', { exact: true }).fill('synthetic_operator');
  await page.getByLabel('Asal keterangan', { exact: true }).fill('UX-01 actual browser');
  await page.getByLabel(/Usulan waktu kejadian baru/).fill('2026-11-06T12:30:00+08:00');
  const reviewResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/demo/v0.1/reviews' && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Kirim Usulan Pemeriksaan', exact: true }).click();
  expect((await reviewResponse).status()).toBe(201);
  await expect(page.getByRole('heading', { name: 'Catatan asli · tidak berubah' })).toBeVisible();
  await screenshots('desktop-review');
  const proposed = await backend.snapshot();
  expect(proposed.data.waste_events[0]).toEqual(saved.data.waste_events[0]);
  expect(timestampMicros(proposed.data.waste_events[0].occurred_at)).toBe(timestampMicros('2026-11-06T12:00:00+08:00'));
  expect(proposed.data.correction_proposals[0].state).toBe('proposed');
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshots('mobile-review');
  await page.goto(`/backend-demo/events/${eventId}`);
  await expect(page.getByRole('article')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await screenshots('mobile-detail');
  await page.getByRole('link', { name: 'Tambah Pengukuran pada Kejadian Ini' }).click();
  await expect(page.getByRole('button', { name: 'Simpan pengukuran', exact: true })).toBeVisible();
  await screenshots('mobile-measurement');
  await page.goto('/backend-demo/ledger');
  await expect(page.getByRole('link', { name: 'Lihat rincian', exact: true })).toHaveCount(1);
  await screenshots('mobile-ledger');
  expect((await backend.snapshot()).sha256).toBe(proposed.sha256);
});


test('M3-01: kitchen-date/stage DQ filters preserve counts, null dates, identity and site scope', async ({ page, backend }, testInfo) => {
  const first = await createEvent(page, { operationDate: '2026-11-04' });
  const middle = await createEvent(page, { operationDate: '2026-11-05' });
  await fillMeasurement(page, { gross: '0.40', tare: '0.40', net: '0' });
  await page.getByLabel(/^Kondisi hasil pengukuran/).selectOption('measured_zero');
  await submitMeasurement(page, middle);
  await fillMeasurement(page, { gross: '2.40', tare: '0.40', net: '2.00' });
  page.once('dialog', dialog => dialog.accept());
  await page.getByLabel(/^Kondisi hasil pengukuran/).selectOption('missing');
  await submitMeasurement(page, middle);
  const last = await createEvent(page, { stage: 'serving', operationDate: '2026-11-06' });
  const undated = await createEvent(page, { operationDate: '' });
  const before = await backend.snapshot();
  expect(before.counts).toMatchObject({ waste_events: 4, measurements: 2 });
  expect(before.data.waste_events.find(e => e.event_id === undated).operation_date).toBeNull();
  await page.goto('/backend-demo/data-quality');
  await expect(page.getByLabel('Ringkasan hitungan')).toBeVisible();
  await expect(page.getByLabel('Drill-down sumber')).toContainText('4 event');
  await page.getByLabel('Tanggal kegiatan dapur dari').fill('2026-11-05');
  await page.getByLabel('Tanggal kegiatan dapur sampai').fill('2026-11-05');
  await page.getByLabel('Kode tahap kegiatan').fill('preparation');
  const read = page.waitForResponse(r => new URL(r.url()).pathname === '/demo/v0.1/data-quality');
  await page.getByRole('button', { name: 'Terapkan filter' }).click();
  const filtered = await read;
  expect(filtered.status()).toBe(200);
  const data = await filtered.json();
  expect(data.summary).toMatchObject({ event_count: 1, measurement_count: 2,
    observation_counts: { measured_zero: 1, missing: 1, estimated: 0 } });
  expect(data.records.map(r => r.event_id)).toEqual([middle]);
  await expect(page.getByLabel('Filter aktif')).toContainText('2026-11-05');
  await expect(page.getByLabel('Drill-down sumber')).toContainText('1 event');
  await expect(page.getByRole('link', { name: middle, exact: true })).toHaveAttribute('href', `/backend-demo/events/${middle}`);
  await expect(page.getByRole('link', { name: undated, exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'browser-evidence/m3-dq-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'browser-evidence/m3-dq-mobile.png', fullPage: true });
  await page.getByLabel('Tanggal kegiatan dapur dari').fill('2026-11-06');
  await page.getByLabel('Tanggal kegiatan dapur sampai').fill('2026-11-04');
  await page.getByRole('button', { name: 'Terapkan filter' }).click();
  await expect(page.getByRole('alert')).toContainText('Tanggal mulai tidak boleh setelah tanggal sampai');
  await page.getByRole('button', { name: 'Reset filter' }).click();
  await expect(page.getByLabel('Drill-down sumber')).toContainText('4 event');
  await expect(page.getByRole('link', { name: undated, exact: true })).toBeVisible();
  expect((await backend.snapshot()).sha256).toBe(before.sha256);
  const params = new URLSearchParams({ site_id: SITE_A, operation_date_from: '2026-11-05', operation_date_to: '2026-11-05', stage_code: 'preparation' });
  const api = (query = params) => page.request.get(`/demo/v0.1/data-quality?${query}`, { headers: { origin: ORIGIN } });
  const invalid = new URLSearchParams(params); invalid.set('operation_date_from', '2026-02-30');
  expect((await api(invalid)).status()).toBe(422);
  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Masuk ke FWI' })).toBeVisible();
  await login(page, backend, 'site_a_reader');
  const allowed = await api(); expect(allowed.status()).toBe(200);
  expect((await allowed.json()).records.map(r => r.event_id)).toEqual([middle]);
  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Masuk ke FWI' })).toBeVisible();
  await login(page, backend, 'site_b_writer');
  expect((await api()).status()).toBe(404);
  const own = new URLSearchParams(params); own.set('site_id', SITE_B);
  expect((await (await api(own)).json()).summary.event_count).toBe(0);
  await testInfo.attach('m3-filter-evidence', { body: JSON.stringify({ first, middle, last, undated,
    filtered: data, original_rows_unchanged: true }), contentType: 'application/json' });
});
