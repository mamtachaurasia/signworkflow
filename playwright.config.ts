import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10_000,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run start',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      PORT: '3100',
      ADMIN_BOOTSTRAP_TOKEN: process.env.ADMIN_BOOTSTRAP_TOKEN || 'test-bootstrap-token',
      E2E_LOCAL_ENABLED: '1',
      ALLOW_INSECURE_LOCALHOST_FOR_TESTS: '1',
    },
  },
  projects: [
    { name: 'Chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'WebKit', use: { ...devices['Desktop Safari'] } },
  ],
});
