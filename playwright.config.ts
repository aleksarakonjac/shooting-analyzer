import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:3100' },
  webServer: {
    command: 'npx next dev -p 3100',
    url: 'http://localhost:3100/login',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
