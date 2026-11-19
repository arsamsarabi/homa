import { defineConfig, devices } from '@playwright/test';

// Runs against a running Homa (the compose stack in CI). BASE_URL picks which one;
// PLAYWRIGHT_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
  projects: [
    // A new instance's first visitor becomes its admin, so that journey runs before everything else.
    { name: 'setup', testMatch: /\.setup\.ts$/, use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium', dependencies: ['setup'], use: { ...devices['Desktop Chrome'] } },
  ],
});
