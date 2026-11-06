import { test as base, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const EVENT_PATH = '/demo/v0.1/events';
const LONG = '0.123456789012345678901234567890123456789';
const test = base.extend({
  backend: async ({}, use, testInfo) => {
    if (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true') {
      throw new Error('This authorized browser gate runs only in Linux GitHub Actions');
    }
    const child = spawn('python', ['-u', '../scripts/browser_e2e_harness.py', 'serve'], { stdio: ['pipe', 'pipe', 'inherit'] });
    const queue = [], readers = [];
    let exitError;
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      const reader = readers.shift();
      if (reader) reader(message); else queue.push(message);
    });
    child.on('exit', code => {
      exitError = new Error(`Test harness exited (${code})`);
      while (readers.length) readers.shift()({ harness_error: 'EarlyExit' });
    });
    async function next() {
      if (queue.length) return queue.shift();
      if (exitError) throw exitError;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Harness response timeout')), 20000);
        readers.push(message => { clearTimeout(timer); resolve(message); });
      });
    }
    async function send(command) {
      child.stdin.write(JSON.stringify({ command }) + '\n');
      const value = await next();
      if (value.harness_error) throw new Error(`Harness failed: ${value.harness_error}`);
      return value;
    }
    let identity;
    try {
      identity = await next();
      expect(identity.ready).toBe(true);
      expect(identity.identity.role).toBe('fwi_test');
      expect(identity.identity.database).toBe('fwi_demo_test');
      expect(identity.identity.version).toContain('PostgreSQL 18.');
      expect(identity.schema).toMatch(/^fwi_demo_test_[0-9a-f]{32}$/);
      expect(identity.revision).toBe('demo_0001');
      const snapshot = () => send('snapshot');
      await testInfo.attach('isolated-postgresql-identity', { body: JSON.stringify(identity, null, 2), contentType: 'application/json' });
      await use({ snapshot, identity });
    } finally {
      try {
        if (identity?.ready && !exitError) {
          await testInfo.attach('final-postgresql-evidence', { body: JSON.stringify(await send('snapshot'), null, 2), contentType: 'application/json' });
          const cleanup = await send('stop');
          expect(cleanup.closed).toBe(true);
          expect(cleanup.cleanup_verified).toBe(true);
          await testInfo.attach('guarded-cleanup', { body: JSON.stringify(cleanup, null, 2), contentType: 'application/json' });
        }
      } finally {
        child.stdin.end();
        if (!exitError) {
          await new Promise(resolve => {
            const timer = setTimeout(() => { child.kill('SIGTERM'); resolve(); }, 3000);
            child.once('exit', () => { clearTimeout(timer); resolve(); });
          });
        }
        lines.close();
      }
    }
  },
});

async function createEvent(page) {
  await page.goto('/backend-demo/capture');
  await page.getByLabel('Jenis event backend provisional').selectOption('at_risk_surplus');
  await page.getByLabel('Waktu kejadian ISO-8601 dengan offset').fill('2026-11-06T12:00:00.123456+08:00');
  const response = page.waitForResponse(r => new URL(r.url()).pathname === EVENT_PATH && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Simpan event backend', exact: true }).click();
  expect((await response).status()).toBe(201);
  await expect(page.getByText(/Event disimpan:/)).toBeVisible();
  const eventId = new URL(page.url()).searchParams.get('event');
  expect(eventId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByText(/Event dikonfirmasi:/)).toBeVisible();
  return eventId;
}

async function fillMeasurement(page, { status = 'observed', gross = LONG, tare = '0', net = LONG } = {}) {
  // These wrapping labels include the select's option text in the browser DOM.
  // Match the stable label prefix rather than requiring an exact textContent.
  await page.getByLabel(/^Observation status/).selectOption(status);
  await page.getByLabel(/^Mass basis provisional/).selectOption('as_served');
  if (!['missing', 'not_measured'].includes(status)) {
    await page.getByLabel('gross (kg)', { exact: true }).fill(gross);
    await page.getByLabel('tare (kg)', { exact: true }).fill(tare);
    await page.getByLabel('net (kg)', { exact: true }).fill(net);
  }
  await page.getByLabel('Measurement method', { exact: true }).fill('synthetic_ci_scale');
  await page.getByLabel('Provenance sintetis', { exact: true }).fill('FWI-INT-005 Linux Chromium synthetic fixture');
  await page.getByLabel('Waktu pengukuran ISO-8601 dengan offset').fill('2026-11-06T12:02:00.654321+08:00');
}

async function submitMeasurement(page, eventId, status = 201) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === `${EVENT_PATH}/${eventId}/measurements` && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Simpan measurement ke event ini', exact: true }).click();
  expect((await response).status()).toBe(status);
  if (status === 201) await expect(page.getByText(/Measurement tersimpan:/)).toBeVisible();
}

// Fetch exactly once through the real proxy/backend; prove commit/audit BEFORE
// replacing the acknowledgement delivered to Chromium. This does not mock persistence.
async function loseAcknowledgement(page, backend, operation) {
  const pattern = operation === 'event' ? '**/demo/v0.1/events' : '**/demo/v0.1/events/*/measurements';
  let browserPosts = 0;
  let resolveProof, rejectProof;
  const proof = new Promise((resolve, reject) => { resolveProof = resolve; rejectProof = reject; });
  await page.route(pattern, async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    browserPosts++;
    try {
      expect(browserPosts).toBe(1);
      const response = await route.fetch({ maxRetries: 0, maxRedirects: 0 });
      expect(response.status()).toBe(201);
      const saved = await response.json();
      const path = new URL(route.request().url()).pathname;
      await expect.poll(async () => (await backend.snapshot()).posts.filter(p => p.path === path).length).toBe(1);
      const committed = await backend.snapshot();
      const table = operation === 'event' ? 'waste_events' : 'measurements';
      const idKey = operation === 'event' ? 'event_id' : 'measurement_id';
      expect(committed.data[table].filter(record => record[idKey] === saved[idKey])).toHaveLength(1);
      expect(committed.data.audit_events.filter(record => record.entity_id === saved[idKey] && record.entity_type === table && record.action === 'created')).toHaveLength(1);
      expect(committed.posts.filter(p => p.path === path)).toEqual([{ path, status: 201 }]);
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'test-only lost acknowledgement after verified commit' }) });
      resolveProof({ saved, committed, path, browserPosts });
    } catch (error) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }).catch(() => {});
      rejectProof(error);
    }
  });
  return { proof, postCount: () => browserPosts };
}

test('W-20: committed event, lost acknowledgement, UNKNOWN and refresh never replay POST', async ({ page, backend }, testInfo) => {
  const loss = await loseAcknowledgement(page, backend, 'event');
  await page.goto('/backend-demo/capture');
  await page.getByLabel('Jenis event backend provisional').selectOption('at_risk_surplus');
  await page.getByLabel('Waktu kejadian ISO-8601 dengan offset').fill('2026-11-06T12:00:00+08:00');
  const [, proof] = await Promise.all([page.getByRole('button', { name: 'Simpan event backend', exact: true }).click(), loss.proof]);
  await expect(page.getByRole('heading', { name: /UNKNOWN/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simpan event backend', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('heading', { name: /UNKNOWN/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simpan event backend', exact: true })).toBeDisabled();
  await page.waitForTimeout(1000); // observation window only; never retries a POST
  const after = await backend.snapshot();
  expect(loss.postCount()).toBe(1);
  expect(after.posts).toHaveLength(1);
  expect(after.counts).toMatchObject({ waste_events: 1, measurements: 0, audit_events: 3 });
  expect(after.sha256).toBe(proof.committed.sha256);
  await testInfo.attach('W-20-verified-commit-no-replay', { body: JSON.stringify({ ...proof, after }, null, 2), contentType: 'application/json' });
});

test('W-21: committed measurement, lost acknowledgement, same-event UNKNOWN survives refresh', async ({ page, backend }, testInfo) => {
  const eventId = await createEvent(page);
  const loss = await loseAcknowledgement(page, backend, 'measurement');
  await fillMeasurement(page);
  const [, proof] = await Promise.all([page.getByRole('button', { name: 'Simpan measurement ke event ini', exact: true }).click(), loss.proof]);
  await expect(page.getByRole('heading', { name: /UNKNOWN/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Simpan measurement ke event ini', exact: true })).toBeDisabled();
  await page.waitForTimeout(1000);
  const after = await backend.snapshot();
  expect(loss.postCount()).toBe(1);
  expect(after.posts).toHaveLength(2);
  expect(after.counts).toMatchObject({ waste_events: 1, measurements: 1, audit_events: 4 });
  expect(after.data.measurements[0].event_id).toBe(eventId);
  expect(after.sha256).toBe(proof.committed.sha256);
  await testInfo.attach('W-21-verified-commit-no-replay', { body: JSON.stringify({ ...proof, after }, null, 2), contentType: 'application/json' });
});

test('W-22: reject inconsistent mass, correct it on the same event without duplicate audit', async ({ page, backend }) => {
  const eventId = await createEvent(page);
  await fillMeasurement(page, { gross: '0.4', tare: '0.1', net: '9' });
  await submitMeasurement(page, eventId, 422);
  await expect(page.getByText(/Server menolak operasi \(HTTP 422\)/)).toBeVisible();
  expect((await backend.snapshot()).counts).toMatchObject({ waste_events: 1, measurements: 0, audit_events: 3 });
  await page.getByLabel('net (kg)', { exact: true }).fill('0.3');
  await submitMeasurement(page, eventId);
  const after = await backend.snapshot();
  expect(after.counts).toMatchObject({ waste_events: 1, measurements: 1, audit_events: 4 });
  expect(after.data.measurements[0].event_id).toBe(eventId);
  expect(after.posts.map(p => p.status)).toEqual([201, 422, 201]);
});

test('W-23: read-after-write and direct refresh preserve UUID and never submit again', async ({ page, backend }) => {
  const eventId = await createEvent(page);
  await fillMeasurement(page);
  await submitMeasurement(page, eventId);
  const before = await backend.snapshot();
  await page.reload();
  await expect(page.getByText(/Event dikonfirmasi:/)).toBeVisible();
  await expect(page.getByText(/Riwayat backend berhasil dibaca: 1 measurement/)).toBeVisible();
  expect(new URL(page.url()).searchParams.get('event')).toBe(eventId);
  await page.getByRole('link', { name: 'Detail dan riwayat read-only', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByText(`${LONG} kg`, { exact: true })).toHaveCount(2);
  const after = await backend.snapshot();
  expect(after.sha256).toBe(before.sha256);
  expect(after.posts).toEqual(before.posts);
});

test('W-24: Decimal, null/zero and all five statuses remain traceable on one event', async ({ page, backend }) => {
  const eventId = await createEvent(page);
  for (const status of ['observed', 'estimated', 'missing', 'measured_zero', 'not_measured']) {
    await fillMeasurement(page, { status, ...(status === 'measured_zero' ? { gross: '0.4', tare: '0.4', net: '0' } : {}) });
    await submitMeasurement(page, eventId);
    // Server-confirmed history ensures the last draft reset before entering the next observation.
    await expect(page.getByRole('button', { name: 'Simpan measurement ke event ini', exact: true })).toBeEnabled();
  }
  const before = await backend.snapshot();
  expect(before.counts).toMatchObject({ waste_events: 1, measurements: 5, audit_events: 8 });
  const byStatus = Object.fromEntries(before.data.measurements.map(m => [m.observation_status, m]));
  expect(byStatus.observed.net).toBe(LONG);
  expect(byStatus.estimated.net).toBe(LONG);
  expect(byStatus.missing.net).toBeNull();
  expect(byStatus.not_measured.net).toBeNull();
  expect(byStatus.measured_zero.net).toBe('0');
  expect(new Set(before.data.measurements.map(m => m.measurement_id)).size).toBe(5);
  expect(before.data.measurements.every(m => m.event_id === eventId && m.mass_basis === 'as_served' && m.measurement_method === 'synthetic_ci_scale')).toBe(true);
  await page.getByRole('link', { name: 'Detail dan riwayat read-only', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(5);
  await expect(page.getByText('Tidak tersedia (null)', { exact: true })).toHaveCount(6);
  await expect(page.getByText('Estimasi (estimated)', { exact: true })).toBeVisible();
  await expect(page.getByText('Nol terukur (measured_zero)', { exact: true })).toBeVisible();
  await expect(page.getByText(/Dua GET dibaca terpisah, bukan snapshot atomik/)).toBeVisible();
  await page.getByRole('link', { name: 'Buka ledger in-memory (sumber berbeda)' }).click();
  await expect(page.getByRole('heading', { name: '3 event (data fiktif)' })).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText(eventId);
  expect((await backend.snapshot()).sha256).toBe(before.sha256);
});

test('W-25: browser HTTP boundary denies foreign origin, invalid content and unapproved methods', async ({ page, backend }) => {
  await page.goto('/backend-demo/capture');
  // Explicit HTTP probes with the browser's request context; no actual approved POST is replayed.
  const path = EVENT_PATH + '/33333333-3333-4333-8333-333333333333';
  for (const method of ['PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    expect((await page.request.fetch(path, { method, maxRetries: 0 })).status()).toBe(405);
  }
  expect((await page.request.post(EVENT_PATH, { headers: { 'content-type': 'application/json', origin: 'http://foreign.invalid' }, data: '{}', maxRetries: 0 })).status()).toBe(403);
  expect((await page.request.post(EVENT_PATH, { headers: { 'content-type': 'text/plain' }, data: '{}', maxRetries: 0 })).status()).toBe(415);
  expect((await page.request.post(path, { data: {}, maxRetries: 0 })).status()).toBe(404);
  const after = await backend.snapshot();
  expect(after.posts).toHaveLength(0);
  expect(after.counts).toMatchObject({ waste_events: 0, measurements: 0, audit_events: 2 });
});
