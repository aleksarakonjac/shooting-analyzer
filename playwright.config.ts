import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  // Saves upload files to the hosted test project and the dev server compiles routes on first hit,
  // so a save can take longer than the 5 s default.
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://localhost:3100' },
  webServer: {
    command: 'npx next dev -p 3100',
    url: 'http://localhost:3100/login',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
