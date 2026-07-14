// E2E: the check()-input()-deadlock fix (Manager fix round, item 6) and the try-it-live real
// execution fix (item 5), against the real Pyodide worker, real browser, real COOP/COEP headers.
//
// Item 6's root cause lived entirely in the worker/engine (pyodideEngine.ts's check() never wired
// currentHooks, so a stdin callback's onInputRequest() call silently no-opped, and the worker
// blocked forever in an untimed Atomics.wait with no possible recovery). That is real-Pyodide,
// real-SAB behavior a mocked-worker component test cannot exercise at all (see
// pyodideEngine.realpyodide.test.ts's own header comment on this suite's boundary, and its
// sibling comment on why a single-process unit test cannot simulate two independently-blocking
// threads either); this file is the one place that can actually prove the fix end to end.
//
// Reaching a graded (hiddenTest-route) step for real requires completing m01-l1 through l3 first
// (m01-l4-s5 is the EARLIEST fixBug/writeStub step in the whole curriculum; lessons unlock strictly
// in order). Rather than clicking through three lessons' worth of real interactions (slow, and not
// what this file is actually testing), this seeds the IndexedDB progress store directly before the
// app boots, the same store/collection/key shape IndexedDbStore.ts and App.tsx's PROGRESS_KEY use,
// so the app boots having already recorded those six real steps as complete and m01-l4 unlocked.
import { test, expect, type Page } from "@playwright/test";

const V1_COLLECTIONS = ["projects", "files", "progress", "settings", "shipQueue", "curriculumCache"];
const V2_COLLECTIONS = ["reviews", "githubMeta"];

// The six REAL emitting steps across m01-l1 to l3 (verified against the real bundle JSON directly,
// per the grading-interaction-round lesson: never guess ids/kinds from prose or fixture naming).
const PRIOR_COMPLETED_NODES = [
  { nodeId: "m01-l1-s4", kind: "predictOutput", moduleId: "m01", strand: "core" },
  { nodeId: "m01-l2-s3", kind: "parsons", moduleId: "m01", strand: "core" },
  { nodeId: "m01-l2-s4", kind: "fillBlank", moduleId: "m01", strand: "core" },
  { nodeId: "m01-l3-s2", kind: "predictOutput", moduleId: "m01", strand: "core" },
  { nodeId: "m01-l3-s3", kind: "predictOutput", moduleId: "m01", strand: "core" },
  { nodeId: "m01-l3-s4", kind: "mcq", moduleId: "m01", strand: "core" },
];

async function seedProgressAndBoot(page: Page): Promise<void> {
  await page.addInitScript(
    ({ v1, v2, nodes }) => {
      const req = indexedDB.open("snake-toolbox", 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of [...v1, ...v2]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const completedNodes = nodes.map((n) => ({ ...n, timestamp: Date.now() }));
        const tx = db.transaction("progress", "readwrite");
        tx.objectStore("progress").put(completedNodes, "completedNodes");
        tx.oncomplete = () => db.close();
      };
    },
    { v1: V1_COLLECTIONS, v2: V2_COLLECTIONS, nodes: PRIOR_COMPLETED_NODES },
  );

  await page.goto("/");
  await page.getByText("Sounds good, let's go").click();
  await expect(page.getByText(/Python runtime is warm/)).toBeVisible({ timeout: 120_000 });
}

// Same CM6-safe editor-content technique sab-handshake.spec.ts already uses (direct keyboard
// typing into CodeMirror 6 hangs under Playwright automation).
async function setEditorContent(page: Page, code: string): Promise<void> {
  await page.waitForSelector(".cm-editor, textarea.editor-textarea", { timeout: 5000 });
  const set = await page.evaluate((newCode) => {
    const cmEditor = document.querySelector(".cm-editor") as HTMLElement | null;
    if (cmEditor) {
      const cmContent = cmEditor.querySelector(".cm-content");
      if (cmContent) {
        const sel = window.getSelection();
        if (sel) {
          sel.selectAllChildren(cmContent);
          document.execCommand("delete");
          document.execCommand("insertText", false, newCode);
          return "cm6";
        }
      }
    }
    const ta = document.querySelector("textarea.editor-textarea") as HTMLTextAreaElement | null;
    if (ta) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(ta, newCode);
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        return "textarea";
      }
    }
    return "none";
  }, code);
  if (set === "none") throw new Error("Could not set editor content");
}

test.describe("Learn: graded Check with input()-calling code never hangs, honest coaching failure (Manager fix round, item 6)", () => {
  test("a real fixBug step's Check completes in bounded time with the coaching message when the submitted code calls input(), and the app stays fully usable afterward", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await seedProgressAndBoot(page);

    // App.tsx's own Resume (R4) effect has an empty dependency array, so it only ever reads
    // `completedNodes` from the very FIRST render (still the initial empty array; the store
    // hydration that later populates it is a separate, async effect that this one never re-runs
    // for), so it never actually redirects on a fresh load like this. That is a real, pre-existing
    // characteristic, unrelated to this round's six items and out of scope to fix here; navigate
    // manually instead, exactly the path a real learner (or lesson-flow.spec.ts) takes. By the
    // time these two clicks happen, the hydration effect has long since resolved, so the
    // progression gate correctly reads m01-l4 as unlocked.
    await page.getByText("Learn").first().click();
    await page.getByText("Hello, Python").click(); // m01 module card (real title)
    await page.getByText("input: Your Program Talks Back").click(); // m01-l4 (real title), unlocked by the seed
    await expect(page.getByText("step 1 of 5")).toBeVisible({ timeout: 15_000 });

    // Walk s1 (prose) -> s2 (prose) -> s3 (liveExample), all non-graded (route "none"), Next is
    // always offered.
    await page.getByRole("button", { name: "Next ->" }).click();
    await page.getByRole("button", { name: "Next ->" }).click();
    await expect(page.getByText("step 3 of 5")).toBeVisible();
    await page.getByRole("button", { name: "Next ->" }).click();

    // s4 is a REAL predictOutput step (code calls input(), expected "55"); it gates Next behind a
    // genuine pass, unlike s1 to s3, so answer it honestly rather than trying to skip it.
    await expect(page.getByText("step 4 of 5")).toBeVisible();
    await page.getByLabel("Your prediction").fill("55");
    await page.getByRole("button", { name: /^check$/i }).click();
    await expect(page.getByText(/Nice\. Step cleared\./)).toBeVisible({ timeout: 5000 });
    // Both CheckResult's pass-card Next AND the persistent StepNav's Next are visible once a step
    // is complete (the same pattern lesson-flow.spec.ts uses); either works, .first() picks one.
    await page.getByRole("button", { name: "Next ->" }).first().click(); // s4 -> s5 (fixBug, last step)

    await expect(page.getByText("step 5 of 5")).toBeVisible();
    const editor = page.getByLabel("Graded lesson code editor");
    await expect(editor).toBeVisible({ timeout: 10_000 });

    // Replace the submission with code that calls input() instead of solving the real exercise:
    // the deadlock this round fixed happened regardless of whether the answer was otherwise
    // correct, since check() reached the SAME stdin callback either way.
    await setEditorContent(page, 'def total(typed):\n    n = input("stall the grader: ")\n    return int(n)\n');

    const start = Date.now();
    await page.getByRole("button", { name: /^check$/i }).click();

    // The honest coaching message, not a raw EOFError traceback and not an indefinite spinner.
    await expect(page.getByText(/can't answer input\(\) prompts/)).toBeVisible({ timeout: 15_000 });
    const elapsedMs = Date.now() - start;
    expect(elapsedMs).toBeLessThan(15_000); // this used to hang FOREVER; bounded time is the proof

    // The app stays fully usable: Check is clickable again (never left disabled/stuck), and a
    // genuinely correct fix, submitted right after, passes normally.
    const checkBtn = page.getByRole("button", { name: /^check$/i });
    await expect(checkBtn).toBeEnabled();
    // The step's REAL model solution (total() adds 10 to the typed value): total("5") == 15,
    // total("0") == 10, isinstance(total("7"), int).
    await setEditorContent(page, 'def total(typed):\n    return int(typed) + 10\n');
    await checkBtn.click();
    await expect(page.getByText(/Nice\. Step cleared\./)).toBeVisible({ timeout: 15_000 });

    if (errors.length > 0) {
      console.log("Page errors captured:", errors);
    }
  });
});

test.describe("Learn: liveExample \"try it\" runs real Python (Manager fix round, item 5)", () => {
  test("clicking Run on a liveExample's try-it box executes the REAL code and shows real output, not the old 'hey' stub", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.getByText("Sounds good, let's go").click();
    await expect(page.getByText(/Python runtime is warm/)).toBeVisible({ timeout: 120_000 });

    await page.getByText("Learn").first().click();
    await page.getByText("Hello, Python").click();
    await page.getByText("Your First Line").click(); // m01-l1, always unlocked

    // m01-l1-s2 is the liveExample (code: print("Hello, world.")).
    await page.getByRole("button", { name: "Next ->" }).click(); // s1 prose -> s2 liveExample
    await expect(page.getByText(/Hit Run\. Watch the console show your words\./)).toBeVisible();

    // Scoped to the try-it card specifically: a liveExample step ALSO renders the work pane's own
    // (separate, empty-starterCode) graded editor with its own Run button (route "none" shows the
    // editor bezel unconditionally, a pre-existing characteristic, not something this round
    // changes), so an unscoped "Run" query is ambiguous between the two real buttons.
    const runBtn = page.locator(".pane.teacher .card").getByRole("button", { name: "Run", exact: true });
    await expect(runBtn).toBeVisible();
    await runBtn.click();

    // Real stdout, never the literal stub string "hey". Scoped to the try-it card's OWN recap
    // line (a .mono div directly under the card, distinct from the code's own <pre>, the work
    // pane's OutputStream span, and the visually-hidden live region, all of which also legitimately
    // contain the same text once the run completes).
    await expect(page.locator(".pane.teacher .card div.mono")).toHaveText("Hello, world.", { timeout: 15_000 });
    await expect(page.getByText(/^hey$/)).toHaveCount(0);

    if (errors.length > 0) {
      console.log("Page errors captured:", errors);
    }
  });
});
