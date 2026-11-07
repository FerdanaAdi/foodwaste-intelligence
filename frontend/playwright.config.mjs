import { defineConfig, devices } from '@playwright/test';

const local = process.env.FWI_LOCAL_SYNTHETIC_DEMO === '1';
const port = local ? 15173 : 5173;

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
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'],
    ...(process.env.FWI_LOCAL_SYNTHETIC_DEMO === '1' ? { channel: 'chrome' } : {}),
  } }],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://127.0.0.1:${port}/backend-demo/capture`,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
