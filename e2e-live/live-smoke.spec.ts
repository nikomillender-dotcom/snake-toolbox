// Live smoke test: proves the REAL, DEPLOYED Snake ToolBox (not a local build) boots, is
// cross-origin isolated, and runs real Python end to end, plus an honest look at the GitHub-ship
// surface. This is the canary's live-smoke muscle (integration-overview.md I13), authored for real
// now that a live URL exists (DEPLOYED_URL, see playwright.live.config.ts). It runs ONLY via
// `npm run test:live` or the canary's live-smoke CI job; it is never part of `npm test` (vitest) or
// the local `npx playwright test` run (that suite lives in e2e/, unaffected).
//
// Every test gets its own fresh browser context (Playwright's default: no cookies, no
// localStorage, no IndexedDB carried over), so the FirstLoadPrimer consent gate always shows here,
// matching the "a fresh context always shows it" fact this suite is built on. Flow and selectors
// deliberately mirror e2e/smoke.spec.ts: proving the SAME real interaction pattern works against the
// deployed URL is more honest than inventing a parallel path that could quietly drift from what the
// local E2E suite actually verifies.
import { test, expect } from "@playwright/test";

test.describe("Snake ToolBox live canary: boot, isolation, a real run", () => {
  test("(a) app boots: the shell renders and no pageerror fires during boot", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/");

    // FirstLoadPrimer, the boot consent gate: assert it is actually there before dismissing it.
    await expect(page.getByText("Sounds good, let's go")).toBeVisible({ timeout: 15_000 });
    await page.getByText("Sounds good, let's go").click();

    // Boot self-check: the app shell (nav rail/bottom-tabs) renders past the consent gate. Two nav
    // copies exist (landscape rail + portrait bottom-tabs), .first() matches e2e/smoke.spec.ts.
    await expect(page.getByText("Sandbox").first()).toBeVisible({ timeout: 15_000 });

    // A short settle window: catches any error thrown in the moment right after the shell commits,
    // separate from the long Pyodide warm-up window, which test (c) below covers on its own.
    await page.waitForTimeout(1_000);
    expect(pageErrors, `pageerror(s) fired during boot: ${pageErrors.join(" | ")}`).toEqual([]);
  });

  test("(b) crossOriginIsolated is true under the live deployment's served headers", async ({ page }) => {
    await page.goto("/");
    const isolated = await page.evaluate(() => self.crossOriginIsolated);
    expect(isolated).toBe(true);
  });

  test("(c) a trivial run executes end to end against the real, live Pyodide runtime", async ({ page }) => {
    // Chains a generous warm-up wait and a generous run wait; give the whole test more room than
    // the config default so neither wait gets truncated by the test-level ceiling rather than its
    // own expect-level timeout.
    test.setTimeout(300_000);

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/");
    await page.getByText("Sounds good, let's go").click();

    // Generous timeout: a real ~13MB wasm download over the real network, possibly a cold
    // CDN/edge cache, not a local disk read like the local e2e suite gets.
    await expect(page.getByText(/Python runtime is warm/)).toBeVisible({ timeout: 150_000 });

    await page.getByText("Sandbox").first().click();
    await page.waitForTimeout(500);

    // Default Sandbox code: print("hello from a fresh Sandbox"). Real stdout from the real,
    // deployed Pyodide worker, proving CONTRACT 1's worker protocol round-trips live, not just
    // locally.
    await page.getByRole("button", { name: /run/i }).click();
    await expect(
      page.locator(".output-stream span").filter({ hasText: "hello from a fresh Sandbox" }).first(),
    ).toBeVisible({ timeout: 60_000 });

    expect(pageErrors, `pageerror(s) fired during a trivial run: ${pageErrors.join(" | ")}`).toEqual([]);
  });
});

// (d) THE MOCK-SHIP DRY-RUN, AND THE HONEST WALL.
//
// canary.yml's original placeholder promised: "a MOCK ship DRY-RUNS through the GitHubSync path
// (build tree/commit objects in memory, assert their shape) WITHOUT publishing; no PAT is used or
// needed." That literal assertion is not reachable from the live DOM. Traced through the real
// source, not assumed:
//
//   - ShipCelebration is the only UI that ever calls GitHubSync.ship() (App.tsx's handleShip). It
//     only mounts once `shipOffer` is set, and that happens in exactly one place: handleBossVictory
//     (App.tsx), fired only after a boss battle is WON.
//   - The Boss button itself (LearnScreen.tsx) stays `disabled` until every lesson in that module
//     is complete (`mod.lessons.every(isLessonComplete)`).
//   - Modules unlock strictly in order (LearnScreen.tsx's map view: `priorDone`/`isLocked`), and
//     `shipOffer` is only ever set for a boss victory where `mod.producesArtifact` is true. Per
//     bundle-manifest.json's phase-1 module order (m01..m10), the FIRST artifact-producing module
//     is m10, the tenth. Reaching its boss requires m01 through m09 fully complete first.
//   - No test hook is exposed on `window` to shortcut any of this (checked: none exists), and
//     adding one to ship a debug backdoor into the LIVE app would be out of scope and its own kind
//     of dishonesty. So the ship() call site sits behind a genuine, multi-module, content-coupled
//     curriculum playthrough, not a trivial action, not stable input for a fast weekly canary, and
//     something that would re-break on every future curriculum content edit for reasons that have
//     nothing to do with the deployment actually being tested here.
//   - The literal in-memory "build tree/commit objects, assert their shape" assertion the
//     placeholder wanted is ALREADY proven, honestly, with no PAT, by Hubert's own
//     githubSyncClient.test.ts (a fake-fetch pattern, see src/engine/fixtures/fakeGitHubApi.ts),
//     which runs on every canary invocation inside the engine-verify job, against the exact same
//     commit this live-smoke job checks out. Re-importing that same source module into this
//     Playwright process and calling it a second time would never touch DEPLOYED_URL at all, so it
//     would not belong in a "live" smoke suite; it would just be the same unit test run twice under
//     two harnesses.
//
// What IS honest and DOM-reachable, from a completely fresh, unauthenticated session, with zero PAT
// and zero publish, is what the two tests below actually assert:
//   (d1) the consent gate itself: the disconnected state is shown honestly (never a fake
//        "connected" banner), the token field never arrives pre-filled, and Connect stays disabled
//        until a token is actually typed, with zero network calls made to prove any of it.
//   (d2) an honest failure path that DOES touch a real GitHub API endpoint (GET /user), using an
//        obviously fake string, never a real credential. This is the closest DOM-reachable proxy
//        for "no PAT is used or needed," and it happens to cover the exact regression class
//        canary.yml's own header comment names ("a GitHub API shift"), since it exercises the real
//        token-validation contract against the real, live api.github.com, live, this week.
test.describe("Snake ToolBox live canary: (d) GitHub dry-run, honestly scoped", () => {
  test("(d1) consent gate: disconnected state is shown honestly, Connect never pre-fills or auto-fires", async ({ page }) => {
    await page.goto("/");
    await page.getByText("Sounds good, let's go").click();

    await page.getByText("Progress").first().click();
    await page.getByRole("tab", { name: "Backup & settings" }).click();

    // Disconnected, honestly: the nudge offers "Connect GitHub," never a fake "connected" state.
    const connectBtn = page.getByRole("button", { name: "Connect GitHub" });
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();

    const dialog = page.getByRole("dialog", { name: /connect your github/i });
    await expect(dialog).toBeVisible();

    // No PAT arrives pre-filled; a fresh session has never had a token.
    const tokenInput = page.locator("#gh-token");
    await expect(tokenInput).toHaveValue("");

    // Consent gate: Connect stays disabled until a token is actually typed (never auto-fires).
    const submitBtn = page.getByRole("button", { name: "Connect", exact: true });
    await expect(submitBtn).toBeDisabled();

    // Close without providing anything; the app stays honestly disconnected.
    await page.getByRole("button", { name: "Close" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Connect GitHub" })).toBeVisible();
  });

  test("(d2) an obviously-fake, non-PAT token hits the real GitHub API and gets the honest invalidToken failure, no publish", async ({ page }) => {
    await page.goto("/");
    await page.getByText("Sounds good, let's go").click();

    await page.getByText("Progress").first().click();
    await page.getByRole("tab", { name: "Backup & settings" }).click();
    await page.getByRole("button", { name: "Connect GitHub" }).click();

    // Never a real credential: an obviously-fake string, clearly labeled as the live canary's own
    // probe, never anything resembling a real fine-grained PAT.
    await page.locator("#gh-token").fill("not-a-real-token-stb-live-canary-probe");
    await page.getByRole("button", { name: "Connect", exact: true }).click();

    // Real network call, real GitHub API, honest failure: GET /user with a bogus bearer token 401s,
    // the app reports it plainly, never claims a fake success, and never reaches the repo-create
    // step (ensureRepoExists is only called once token validation succeeds).
    await expect(page.getByRole("alert").filter({ hasText: "did not check out" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^connected\. your repo is at/i)).not.toBeVisible();
  });
});
