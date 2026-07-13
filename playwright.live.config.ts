import { defineConfig, devices } from "@playwright/test";

// Live-smoke Playwright config: runs against the REAL deployed URL (DEPLOYED_URL), never a local
// dev/preview server. This is the canary's live-smoke muscle (integration-overview.md I13).
//
// Kept deliberately separate from playwright.config.ts:
//   - testDir points at ./e2e-live, NOT ./e2e, so `npm test` (vitest) and `npx playwright test`
//     (the local config's default) never pick these specs up and keep their current meaning.
//   - No webServer block. The local config starts `vite preview`; this one has nothing to start,
//     it hits a URL that is already live.
//   - Run this config explicitly via `npm run test:live` (see package.json), which passes through
//     `--config=playwright.live.config.ts`.
//
// DEPLOYED_URL is read fresh from the environment at config-load time and this file refuses to
// guess a fallback (e.g. localhost): a live-smoke run against the wrong URL, or silently against
// nothing, is worse than a loud, immediate failure.
const DEPLOYED_URL = process.env.DEPLOYED_URL;

if (!DEPLOYED_URL) {
  throw new Error(
    "playwright.live.config.ts: DEPLOYED_URL is not set. This config runs the live-smoke suite " +
      "against a REAL deployed URL, it never falls back to localhost. Set it first, e.g.\n" +
      '  $env:DEPLOYED_URL="https://snake-toolbox.vercel.app"; npm run test:live   (PowerShell)\n' +
      "  DEPLOYED_URL=https://snake-toolbox.vercel.app npm run test:live           (bash)",
  );
}

export default defineConfig({
  testDir: "./e2e-live",
  timeout: 180_000,
  // Real network + a real cold serverless/edge path, not a local dev server. One retry absorbs an
  // ordinary transient network blip without masking a genuine outage: a real outage fails again on
  // the retry too, so this never hides a true regression, it just avoids a false alarm from one bad
  // request.
  retries: 1,
  use: {
    baseURL: DEPLOYED_URL,
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // No webServer: DEPLOYED_URL is already live.
});
