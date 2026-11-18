import { defineConfig, devices } from '@playwright/test';

// E2E_EMAIL / E2E_PASSWORD live in .env.local (not committed). Missing file is fine.
try { process.loadEnvFile('.env.local'); } catch {}

// E2E checks for the consumer web app. Run: npm run test:e2e
// Starts the Vite dev server (port 5174) unless one is already running.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0, // a flaky test must be fixed or deleted, never retried until green
  workers: 1, // signed-in tests share one test account; onboarding.spec resets it
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5174',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
