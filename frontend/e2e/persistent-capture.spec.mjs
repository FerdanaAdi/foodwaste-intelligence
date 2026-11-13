import { fillTimestamp, openSourceDetails } from './ux-helpers.mjs';
import { test as base, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';

const EVENT_PATH = '/demo/v0.1/events';
const LONG = '0.123456789012345678901234567890123456789';
const test = base.extend({
  backend: async ({}, use, testInfo) => {
    const ci = process.platform === 'linux' && process.env.GITHUB_ACTIONS === 'true';
    if (!ci && process.env.FWI_LOCAL_SYNTHETIC_DEMO !== '1') {
      throw new Error('Requires Linux CI or explicit local synthetic demo opt-in');
    }
    const passwords = Object.fromEntries(['site_a_writer','site_a_reader','site_b_writer'].map(name => [name, randomBytes(32).toString('hex')]));
    const credentials = Object.fromEntries(Object.entries(passwords).map(([name, value]) => ['FWI_BROWSER_' + name.toUpperCase(), value]));
    const child = spawn('python', ['-u', '../scripts/browser_e2e_harness.py', 'serve'], {
      stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, ...credentials },
    });
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
      if (identity.closed) {
        const failure = await next();
        throw new Error(`Backend startup failed: ${failure.harness_error || 'UnknownFailure'} ${JSON.stringify(failure.frames || [])}`);
      }
      expect(identity.ready).toBe(true);
      expect(identity.identity.role).toBe('fwi_test');
      expect(identity.identity.database).toBe('fwi_demo_test');
      expect(identity.identity.version).toContain('PostgreSQL 18.');
      expect(identity.schema).toMatch(/^fwi_demo_test_[0-9a-f]{32}$/);
      expect(identity.revision).toBe('auth_0007');
      const snapshot = () => send('snapshot');
      await testInfo.attach('isolated-postgresql-identity', { body: JSON.stringify(identity, null, 2), contentType: 'application/json' });
      const baseline = await snapshot();
      await use({ snapshot, identity, baseline, passwords, expireSessions: () => send('expire_sessions'), revokeSessions: () => send('revoke_sessions') });
    } finally {
      try {
        if (identity?.ready && !exitError) {
          try {
            await testInfo.attach('final-postgresql-evidence', { body: JSON.stringify(await send('snapshot'), null, 2), contentType: 'application/json' });
          } finally {
            const cleanup = await send('stop');
            expect(cleanup.closed).toBe(true);
            expect(cleanup.cleanup_verified).toBe(true);
            await testInfo.attach('guarded-cleanup', { body: JSON.stringify(cleanup, null, 2), contentType: 'application/json' });
          }
        }
      } finally {
        child.stdin.end();
        if (!exitError) {
          await new Promise(resolve => {
            const timer = setTimeout(() => { child.kill('SIGTERM'); resolve(); }, 20000);
            child.once('exit', () => { clearTimeout(timer); resolve(); });
          });
        }
        lines.close();
      }
    }
  },
});

async function login(page, backend, name='site_a_writer') {
  const network = [];
  const inspect = response => { const path = new URL(response.url()).pathname;
    if (path.startsWith('/auth/')) network.push({ path, status: response.status(),
      bound: !!response.headers()['x-fwi-auth-context'], principal: !!response.headers()['x-fwi-principal'] }); };
  page.on('response', inspect);
  await page.goto('/backend-demo');
  // Wait for initial Vite optimization/navigation and the first session check;
  // never refill/replay a submitted credential or domain POST.
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('alert')).toContainText('Silakan masuk dengan akun sintetis.');
  await page.getByLabel('Akun sintetis').fill(name);
  await expect(page.getByLabel('Akun sintetis')).toHaveValue(name);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  // Do not put the credential in a locator.fill call log on failure.
  await page.getByLabel('Password', { exact: true }).evaluate((input, secret) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, secret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, backend.passwords[name]);
  // Check only length; never put a password in assertion output. No submit/retry has occurred.
  await expect.poll(() => page.getByLabel('Password', { exact: true }).evaluate(input => input.value.length)).toBe(backend.passwords[name].length);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  try { await expect(page.getByLabel('Lokasi dapur yang dapat diakses')).toBeVisible(); }
  catch (error) { throw new Error(`Login failed; sanitized HTTP evidence: ${JSON.stringify(network)}; backend: ${JSON.stringify((await backend.snapshot()).auth_http)}`, { cause: error }); }
  finally { page.off('response', inspect); }
}
test.beforeEach(async ({ page, backend }) => { await login(page, backend); backend.baseline = await backend.snapshot(); });

async function createEvent(page) {
  await page.goto('/backend-demo/capture');
  await page.getByLabel('Jenis kejadian').selectOption('at_risk_surplus');
  await fillTimestamp(page, 'Tanggal dan waktu kejadian', '2026-11-06T12:00:00.123456+08:00');
  const response = page.waitForResponse(r => new URL(r.url()).pathname === EVENT_PATH && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Simpan kejadian', exact: true }).click();
  expect((await response).status()).toBe(201);
  await expect(page.getByText(/Kejadian berhasil dicatat./)).toBeVisible();
  const eventId = new URL(page.url()).searchParams.get('event');
  expect(eventId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByText(/Kejadian telah dibaca/)).toBeVisible();
  return eventId;
}

async function fillMeasurement(page, { status = 'observed', gross = LONG, tare = '0', net = LONG } = {}) {
  // These wrapping labels include the select's option text in the browser DOM.
  // Match the stable label prefix rather than requiring an exact textContent.
  await page.getByLabel(/^Kondisi hasil pengukuran/).selectOption(status);
  await page.getByLabel(/^Kondisi pangan saat diukur/).selectOption('as_served');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  if (!['missing', 'not_measured'].includes(status)) {
    await page.getByLabel('Berat total termasuk wadah (kg)', { exact: true }).fill(gross);
    await expect(page.getByLabel('Berat total termasuk wadah (kg)', { exact: true })).toHaveValue(gross);
    await page.getByLabel('Berat wadah (kg)', { exact: true }).fill(tare);
    await page.getByLabel('Berat pangan tanpa wadah (kg)', { exact: true }).fill(net);
  }
  await page.getByLabel('Bagaimana berat diperoleh?', { exact: true }).fill('synthetic_ci_scale');
  await page.getByLabel('Dari mana data ini berasal?', { exact: true }).fill('FWI-INT-005 Linux Chromium synthetic fixture');
  await fillTimestamp(page, 'Tanggal dan waktu pengukuran', '2026-11-06T12:02:00.654321+08:00');
}

async function submitMeasurement(page, eventId, status = 201) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === `${EVENT_PATH}/${eventId}/measurements` && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Simpan pengukuran', exact: true }).click();
  expect((await response).status()).toBe(status);
  if (status === 201) await expect(page.getByText(/Pengukuran tersimpan./)).toBeVisible();
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
      await route.fulfill({ status: 503, headers: {
        'content-type': 'application/json', 'cache-control': 'no-store',
        'x-fwi-principal': response.headers()['x-fwi-principal'],
        'x-fwi-auth-context': response.headers()['x-fwi-auth-context'],
      }, body: JSON.stringify({ detail: 'test-only lost acknowledgement after verified commit' }) });
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
  await page.getByLabel('Jenis kejadian').selectOption('at_risk_surplus');
  await fillTimestamp(page, 'Tanggal dan waktu kejadian', '2026-11-06T12:00:00+08:00');
  const [, proof] = await Promise.all([page.getByRole('button', { name: 'Simpan kejadian', exact: true }).click(), loss.proof]);
  await expect(page.getByRole('heading', { name: /UNKNOWN/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simpan kejadian', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Buka hasil terkonfirmasi (GET)' })).toBeVisible();
  await expect(page.getByText(/Hasil commit terkonfirmasi oleh server/)).toBeVisible();
  await page.waitForTimeout(1000); // observation window only; never retries a POST
  const after = await backend.snapshot();
  expect(loss.postCount()).toBe(1);
  expect(after.posts).toHaveLength(1);
  expect(after.counts).toMatchObject({ waste_events: 1, measurements: 0, audit_events: backend.baseline.counts.audit_events + 1 });
  expect(after.sha256).toBe(proof.committed.sha256);
  await testInfo.attach('W-20-verified-commit-no-replay', { body: JSON.stringify({ ...proof, after }, null, 2), contentType: 'application/json' });
});

test('W-21: committed measurement, lost acknowledgement, same-event UNKNOWN survives refresh', async ({ page, backend }, testInfo) => {
  const eventId = await createEvent(page);
  const loss = await loseAcknowledgement(page, backend, 'measurement');
  await fillMeasurement(page);
  const [, proof] = await Promise.all([page.getByRole('button', { name: 'Simpan pengukuran', exact: true }).click(), loss.proof]);
  await expect(page.getByRole('heading', { name: /UNKNOWN/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Buka hasil terkonfirmasi (GET)' })).toHaveCount(2);
  await page.waitForTimeout(1000);
  const after = await backend.snapshot();
  expect(loss.postCount()).toBe(1);
  expect(after.posts).toHaveLength(2);
  expect(after.counts).toMatchObject({ waste_events: 1, measurements: 1, audit_events: backend.baseline.counts.audit_events + 2 });
  expect(after.data.measurements[0].event_id).toBe(eventId);
  expect(after.sha256).toBe(proof.committed.sha256);
  await testInfo.attach('W-21-verified-commit-no-replay', { body: JSON.stringify({ ...proof, after }, null, 2), contentType: 'application/json' });
});

test('W-22: reject inconsistent mass, correct it on the same event without duplicate audit', async ({ page, backend }) => {
  const eventId = await createEvent(page);
  await fillMeasurement(page, { gross: '0.4', tare: '0.1', net: '9' });
  await submitMeasurement(page, eventId, 422);
  await expect(page.getByText(/Server menolak operasi \(HTTP 422\)/)).toBeVisible();
  expect((await backend.snapshot()).counts).toMatchObject({ waste_events: 1, measurements: 0, audit_events: backend.baseline.counts.audit_events + 1 });
  await page.getByLabel('Berat pangan tanpa wadah (kg)', { exact: true }).fill('0.3');
  await submitMeasurement(page, eventId);
  const after = await backend.snapshot();
  expect(after.counts).toMatchObject({ waste_events: 1, measurements: 1, audit_events: backend.baseline.counts.audit_events + 2 });
  expect(after.data.measurements[0].event_id).toBe(eventId);
  expect(after.posts.map(p => p.status)).toEqual([201, 422, 201]);
});

test('W-23: read-after-write and direct refresh preserve UUID and never submit again', async ({ page, backend }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const eventId = await createEvent(page);
  await fillMeasurement(page);
  await submitMeasurement(page, eventId);
  const before = await backend.snapshot();
  await page.reload();
  await expect(page.getByText(/Kejadian telah dibaca/)).toBeVisible();
  await expect(page.getByText(/Riwayat telah dimuat: 1 pengukuran/)).toBeVisible();
  expect(new URL(page.url()).searchParams.get('event')).toBe(eventId);
  await page.getByRole('link', { name: 'Lihat rincian kejadian →', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByLabel(`Net: ${LONG} kg`, { exact: true })).toHaveCount(1);
  await expect(page.getByLabel(`Gross: ${LONG} kg`, { exact: true })).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('link', { name: 'Tambah Pengukuran pada Kejadian Ini' }).click();
  await expect(page.getByText(/Kejadian telah dibaca/)).toBeVisible();
  expect(new URL(page.url()).searchParams.get('event')).toBe(eventId);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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
    await expect(page.getByRole('button', { name: 'Simpan pengukuran', exact: true })).toBeEnabled();
  }
  const before = await backend.snapshot();
  expect(before.counts).toMatchObject({ waste_events: 1, measurements: 5, audit_events: backend.baseline.counts.audit_events + 6 });
  const byStatus = Object.fromEntries(before.data.measurements.map(m => [m.observation_status, m]));
  expect(byStatus.observed.net).toBe(LONG);
  expect(byStatus.estimated.net).toBe(LONG);
  expect(byStatus.missing.net).toBeNull();
  expect(byStatus.not_measured.net).toBeNull();
  expect(byStatus.measured_zero.net).toBe('0');
  expect(new Set(before.data.measurements.map(m => m.measurement_id)).size).toBe(5);
  expect(before.data.measurements.every(m => m.event_id === eventId && m.mass_basis === 'as_served' && m.measurement_method === 'synthetic_ci_scale')).toBe(true);
  await page.getByRole('link', { name: 'Lihat rincian kejadian →', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(5);
  await expect(page.getByLabel(/: Berat belum tersedia/)).toHaveCount(6);
  await expect(page.getByText('Perkiraan berat', { exact: true })).toBeVisible();
  await expect(page.getByText('Diukur, hasil 0 kg', { exact: true })).toBeVisible();
  await expect(page.getByText(/keduanya mungkin tidak menunjukkan keadaan pada saat yang persis sama/)).toBeVisible();
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
  expect((await page.request.post(EVENT_PATH, { headers: { origin: 'https://127.0.0.1:5173', 'content-type': 'text/plain' }, data: '{}', maxRetries: 0 })).status()).toBe(415);
  expect((await page.request.post(path, { data: {}, maxRetries: 0 })).status()).toBe(404);
  const after = await backend.snapshot();
  expect(after.posts).toHaveLength(0);
  expect(after.counts).toMatchObject({ waste_events: 0, measurements: 0, audit_events: backend.baseline.counts.audit_events });
});

test('SEC-C: CSRF denial, cross-actor privacy, IDOR and expired session fail closed', async ({ page, backend }) => {
  const eventId = await createEvent(page);
  const before = await backend.snapshot();
  expect((await page.request.post('/auth/intents', { headers: { origin: 'https://127.0.0.1:5173',
    'x-csrf-token': 'incorrect' }, data: { site_id: '22222222-2222-4222-8222-222222222222', kind: 'event' }, maxRetries: 0 })).status()).toBe(403);
  expect((await backend.snapshot()).sha256).toBe(before.sha256);
  await Promise.all([page.waitForResponse(r => new URL(r.url()).pathname === '/auth/logout' && r.request().method() === 'POST' && r.status() === 200), page.getByRole('button', { name: 'Keluar', exact: true }).click()]);
  await expect(page.getByRole('heading', { name: 'Masuk ke FWI' })).toBeVisible();
  await login(page, backend, 'site_b_writer');
  await expect(page.getByRole('main')).not.toContainText(eventId);
  await page.goto(`/backend-demo/events/${eventId}`);
  await expect(page.getByRole('alert')).toContainText('404');
  await expect(page.getByRole('article')).toHaveCount(0);
  await backend.expireSessions();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Masuk ke FWI' })).toBeVisible();
  expect((await backend.snapshot()).counts.waste_events).toBe(1);
});

test('SEC-D1: Secure cookies, revoked session and unavailable CSRF never authorize a write', async ({ page, backend, context }) => {
  const cookies = await context.cookies();
  const session = cookies.find(c => c.name === '__Host-fwi-session');
  expect(session && { secure: session.secure, httpOnly: session.httpOnly, sameSite: session.sameSite, path: session.path })
    .toEqual({ secure: true, httpOnly: true, sameSite: 'Strict', path: '/' });
  const before = await backend.snapshot();
  expect((await page.request.post('/auth/intents', { headers: { origin: 'https://127.0.0.1:5173' },
    data: { site_id: '22222222-2222-4222-8222-222222222222', kind: 'event' }, maxRetries: 0 })).status()).toBe(403);
  await backend.revokeSessions();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Masuk ke FWI' })).toBeVisible();
  expect((await page.request.get('/auth/intents', { headers: { origin: 'https://127.0.0.1:5173' } })).status()).toBe(401);
  const after = await backend.snapshot();
  expect(after.posts).toHaveLength(0);
  expect(after.counts.waste_events).toBe(before.counts.waste_events);
  expect(after.intents).toHaveLength(0);
});

test('SEC-D2: registered but undispatched intent remains private UNCONFIRMED across refresh and actor change', async ({ page, backend }) => {
  const registration = await page.evaluate(async () => {
    const session = await (await fetch('/auth/session')).json();
    const response = await fetch('/auth/intents', { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf_token },
      body: JSON.stringify({ site_id: session.sites[0].site_id, kind: 'event', event_id: null }) });
    return { status: response.status, id: (await response.json()).intent_id };
  });
  expect(registration.status).toBe(201);
  await page.goto('/backend-demo/capture');
  await expect(page.getByText(/UNCONFIRMED:/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simpan kejadian', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByText(/UNCONFIRMED:/)).toBeVisible();
  expect((await backend.snapshot()).intents).toEqual([expect.objectContaining({ intent_id: registration.id, state: 'registered', result_id: null })]);
  await Promise.all([page.waitForResponse(r => new URL(r.url()).pathname === '/auth/logout' && r.request().method() === 'POST' && r.status() === 200), page.getByRole('button', { name: 'Keluar', exact: true }).click()]);
  await login(page, backend, 'site_b_writer');
  await expect(page.getByText(/UNCONFIRMED:/)).toHaveCount(0);
  expect(await (await page.request.get('/auth/intents', { headers: { origin: 'https://127.0.0.1:5173' } })).json()).toEqual([]);
  const after = await backend.snapshot();
  expect(after.intents).toEqual([expect.objectContaining({ intent_id: registration.id, state: 'registered', result_id: null })]);
  expect(after.posts).toHaveLength(0);
});

test('SEC-D3: same-principal new session, cross-tab actor switch and delayed private GET stay isolated', async ({ page, backend, context }) => {
  const eventId = await createEvent(page);
  await fillMeasurement(page); await submitMeasurement(page, eventId);
  await page.goto(`/backend-demo/events/${eventId}`);
  await expect(page.getByRole('article')).toHaveCount(1);
  const reference = () => page.evaluate(async () => {
    const value = await (await fetch('/auth/session')).json();
    return { principal: value.principal_id, session: value.auth_context_id };
  });
  const first = await reference();
  let release, captured;
  const delayed = new Promise(resolve => { captured = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  await page.route(`**${EVENT_PATH}/${eventId}/measurements`, async route => {
    const response = await route.fetch({ maxRetries: 0 });
    captured(); await hold;
    await route.fulfill({ response }).catch(() => {}); // aborted old request must stay invisible
  }, { times: 1 });
  await page.getByRole('button', { name: 'Muat ulang / coba lagi' }).click();
  await delayed;
  const other = await context.newPage();
  try {
    await other.goto('/backend-demo');
    await expect(other.getByLabel('Lokasi dapur yang dapat diakses')).toBeVisible();
    await other.getByRole('button', { name: 'Keluar', exact: true }).click();
    await login(other, backend); // same principal, a distinct backend login session
    const second = await other.evaluate(async () => {
      const value = await (await fetch('/auth/session')).json();
      return { principal: value.principal_id, session: value.auth_context_id };
    });
    expect(second.principal).toBe(first.principal); expect(second.session).not.toBe(first.session);
    await other.getByRole('button', { name: 'Keluar', exact: true }).click();
    await login(other, backend, 'site_b_writer');
    release();
    await page.bringToFront();
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(page.getByText('FWI-INT-005 Linux Chromium synthetic fixture', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText('404');
    const missing = await page.request.get(`${EVENT_PATH}/33333333-3333-4333-8333-333333333333`, { headers: { origin: 'https://127.0.0.1:5173' } });
    const foreign = await page.request.get(`${EVENT_PATH}/${eventId}`, { headers: { origin: 'https://127.0.0.1:5173' } });
    expect(missing.status()).toBe(404); expect(foreign.status()).toBe(404); expect(await missing.json()).toEqual(await foreign.json());
    expect(await (await page.request.get('/auth/intents', { headers: { origin: 'https://127.0.0.1:5173' } })).json()).toEqual([]);
    const after = await backend.snapshot();
    expect(after.posts).toHaveLength(2); expect(after.counts).toMatchObject({ waste_events: 1, measurements: 1 });
    expect(after.operations.filter(o => o.path === '/auth/intents' || o.path.startsWith(EVENT_PATH)).map(o => o.path))
      .toEqual(['/auth/intents', EVENT_PATH, '/auth/intents', `${EVENT_PATH}/${eventId}/measurements`]);
  } finally { release(); await other.close(); }
});
