/** Shared harness-backed browser fixture (isolated synthetic PostgreSQL schema,
 *  temporary loopback TLS, per-run credentials). Mirrors persistent-capture.spec.mjs. */
import { test as base, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';

export const test = base.extend({
  backend: async ({}, use, testInfo) => {
    const ci = process.platform === 'linux' && process.env.GITHUB_ACTIONS === 'true';
    if (!ci && process.env.FWI_LOCAL_SYNTHETIC_DEMO !== '1') {
      throw new Error('Requires Linux CI or explicit local synthetic demo opt-in');
    }
    const passwords = Object.fromEntries(['site_a_writer', 'site_a_reader', 'site_b_writer'].map(name => [name, randomBytes(32).toString('hex')]));
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
      expect(identity.revision).toBe('int_p1_0006');
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

export async function login(page, backend, name = 'site_a_writer') {
  await page.goto('/backend-demo');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Akun sintetis').fill(name);
  await page.getByLabel('Password', { exact: true }).evaluate((input, secret) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, secret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, backend.passwords[name]);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page.getByLabel('Site berizin')).toBeVisible({ timeout: 15000 });
}

export const SITE_A = '22222222-2222-4222-8222-222222222222';
export const SITE_B = '22222222-2222-4222-8222-222222222223';
