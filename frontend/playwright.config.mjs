import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const local = process.env.FWI_LOCAL_SYNTHETIC_DEMO === '1';
const port = 5173;
// Owner-authorized temporary self-signed loopback profile, test context only.
// Vite -> backend still verifies the supplied CA; production settings are unchanged.
const temporaryTLS = local && process.env.FWI_TEST_TEMPORARY_TLS === '1';
if (![process.env.FWI_TLS_CERTFILE, process.env.FWI_TLS_KEYFILE, process.env.FWI_BACKEND_CA_FILE].every(p => p && existsSync(p))) {
  throw new Error('BLOCKED: existing Owner-authorized HTTPS certificate/key/CA required; no creation or trust bypass');
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'browser-evidence/results.json' }]],
  use: {
    baseURL: `https://127.0.0.1:${port}`,
    ignoreHTTPSErrors: temporaryTLS,
    // Authenticated traces can contain Cookie/CSRF/credential values. Do not
    // record until an approved sanitizer exists; screenshots/DB evidence remain.
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'],
    ...(process.env.FWI_LOCAL_SYNTHETIC_DEMO === '1' ? { channel: 'chrome' } : {}),
  } }],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `https://127.0.0.1:${port}/backend-demo/capture`,
    reuseExistingServer: false,
    ignoreHTTPSErrors: temporaryTLS,
    timeout: 30000,
  },
});
