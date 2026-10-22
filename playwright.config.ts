import { defineConfig, devices } from '@playwright/test';

// E2E runs against the production build (vite preview) in a mobile Chrome profile.
// The relay (picstroom-proxy.pages.dev) allows http://localhost:<port> origins.
const PORT = 5847;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/picstroom/`,
    trace: 'retain-on-failure',
    colorScheme: 'dark',
    // Set PW_CHANNEL=chrome to use the system Chrome instead of Playwright's Chromium.
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {})
  },
  projects: [
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/picstroom/`,
    reuseExistingServer: true,
    timeout: 60_000
  }
});
