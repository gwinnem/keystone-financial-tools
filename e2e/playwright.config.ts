import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const TOUCH = /touch\.spec\.ts/;

// The tests run against the playground (apps/playground). This config builds it and serves the build: one bundle loads far faster
// than the dev server's many modules when several browsers open the page at once.
export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', testIgnore: TOUCH, use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testIgnore: TOUCH, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testIgnore: TOUCH, use: { ...devices['Desktop Safari'] } },
    // One mobile profile with a touch screen, in landscape so the whole 800 px chart fits.
    { name: 'mobile-chromium', testMatch: TOUCH, use: { ...devices['Pixel 7'], viewport: { width: 915, height: 412 } } },
  ],
  webServer: {
    command: 'pnpm --filter keystone-financial-tools-playground build && pnpm --filter keystone-financial-tools-playground preview',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
