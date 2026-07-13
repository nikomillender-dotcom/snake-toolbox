// E2E: a human lesson walk-through (Manager fix round, the regression net for the whole lesson-FLOW
// bug class: never-started landing, persistent Back/Next, honest last-step action). Every existing
// test in this repo either drives the engine directly or deep-links straight into ONE lesson step;
// none of them ever "walk a lesson like a human," which is exactly how these three bugs escaped to
// the live app. This test never deep-links: it opens m01 lesson 1 fresh from the map, the same way
// a real learner's first session does.
//
// Runs against `vite preview` (the local e2e/ project), same as smoke.spec.ts and
// sab-handshake.spec.ts. It deliberately never waits for "Python runtime is warm": the
// grading-interaction-spec's five comparison-kind graders (predictOutput included) run main-thread
// and grade instantly, before Pyodide even finishes downloading, so this proves that property too.
import { test, expect } from "@playwright/test";

test.describe("Snake ToolBox E2E: lesson-flow walk-through (never-started landing, step nav, honest finish)", () => {
  test("m01 lesson 1 opens on the teaching, Next walks the prose, a passed predictOutput finishes the lesson back to the module screen", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.getByText("Sounds good, let's go").click();

    // Navigate Learn -> the m01 module card -> its first lesson, never a deep link.
    await page.getByText("Learn").first().click();
    await page.getByText("Hello, Python").click(); // m01's real content title
    await page.getByText("Your First Line").click(); // m01-l1's real content title

    // Bug 1 regression: a never-started lesson opens at step 1 (the teaching), not at its only
    // exercise (which used to be reachable directly as "step 4 of 4" on a totally fresh session).
    await expect(page.getByText("step 1 of 4")).toBeVisible();
    await expect(page.getByText(/Welcome in\./)).toBeVisible();

    // Bug 2 regression: Next walks the non-graded prose/liveExample run; nothing here is graded, so
    // there is no Check to press yet.
    await page.getByRole("button", { name: "Next ->" }).click(); // s1 prose -> s2 liveExample
    await expect(page.getByText("step 2 of 4")).toBeVisible();
    await page.getByRole("button", { name: "Next ->" }).click(); // s2 liveExample -> s3 prose
    await expect(page.getByText("step 3 of 4")).toBeVisible();
    await page.getByRole("button", { name: "Next ->" }).click(); // s3 prose -> s4 predictOutput
    await expect(page.getByText("step 4 of 4")).toBeVisible();

    // s4 (m01-l1-s4) is a predictOutput step, and it is the lesson's LAST step: pass it honestly by
    // typing the real predicted output (code prints "Snake ToolBox is booting up"), never an empty
    // Check.
    const prediction = page.getByLabel("Your prediction");
    await expect(prediction).toBeVisible();
    await prediction.fill("Snake ToolBox is booting up");
    await page.getByRole("button", { name: /^Check$/i }).click();
    await expect(page.getByText(/Nice\. Step cleared\./)).toBeVisible();

    // Bug 3 regression: on the last step the action reads "Finish lesson," never a "Next ->" that
    // would silently do nothing. Both the pass card (CheckResult) and the persistent step nav can
    // legitimately show this once completedNodes catches up, hence .first().
    const finishBtn = page.getByRole("button", { name: "Finish lesson" }).first();
    await expect(finishBtn).toBeVisible();
    await expect(page.getByRole("button", { name: "Next ->" })).toHaveCount(0);
    await finishBtn.click();

    // Lands back on the module screen (the existing "Back to the map" destination), not stuck on a
    // dead last step.
    await expect(page.getByText("Back to the map")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hello, Python" })).toBeVisible();

    if (errors.length > 0) {
      console.log("Page errors captured:", errors);
    }
  });
});
