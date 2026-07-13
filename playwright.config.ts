import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:4173",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Start vite preview before the test. The production build already exists
  // from `npm run build`, and `vite preview` serves it with the same
  // COOP/COEP headers configured in vite.config.ts.
  webServer: {
    command: "npx vite preview --port 4173",
    port: 4173,
    reuseExistingServer: false,
    timeout: 10_000,
  },
});
