import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the Expo web build with the ENTIRE backend network surface
// mocked in-process (see e2e/fixtures/mockApi.ts). No backend, database, blob storage or AI
// provider is ever contacted, so a run is free and deterministic.
//
// Expo Router's web bundle is served by Metro on port 8081. The first compile is slow, so the
// web-server start-up timeout is generous and the suite runs single-worker to keep Metro stable.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'line' : [['list']],
  use: {
    baseURL: 'http://localhost:8081',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx expo start --web --port 8081',
    url: 'http://localhost:8081',
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
