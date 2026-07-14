import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  retries: 0,
  // Manager fix round, item 6: this suite boots a REAL Pyodide runtime (a heavy WASM download +
  // init) in most of its tests, several against the SAME shared vite-preview webServer. Running
  // them under Playwright's default auto-parallelism (multiple real Pyodide instances booting
  // concurrently, competing for CPU/memory/network against one server) caused genuine, repeatable
  // stuck-not-slow failures under this round's full-suite gate: check-input-deadlock.spec.ts's
  // Check button sat fully disabled for the entire 180s window at 5 workers (not a timing margin,
  // the same "0 -> 100% failure, stone disabled for the full window" signature the SF6 lesson in
  // sab-handshake.spec.ts already names as the tell for a genuine stuck state under contention,
  // not a slow one), and portrait-viewport.spec.ts's WebKit instance failed even at 2 workers
  // (plausibly the least CPU-headroom-tolerant of the browsers here). Every test in this suite
  // passed cleanly, individually and together, running fully serial; the whole suite still
  // finishes in well under 30 seconds that way, so trading parallelism for determinism here costs
  // nothing that matters for a local gate.
  workers: 1,
  use: {
    baseURL: "http://localhost:4173",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // portrait-viewport.spec.ts needs a real WebKit + iPad Pro 11 profile (Manager fix round,
      // item 1: the Manager's own repro was exactly this device/browser combination, and the fix
      // itself is a `matchMedia` real-viewport check that a Desktop Chrome viewport would never
      // exercise meaningfully). Runs under its own project below instead.
      testIgnore: /portrait-viewport\.spec\.ts/,
    },
    {
      name: "webkit-ipad-portrait",
      use: { ...devices["iPad Pro 11"], baseURL: "http://localhost:4173" },
      testMatch: /portrait-viewport\.spec\.ts/,
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
