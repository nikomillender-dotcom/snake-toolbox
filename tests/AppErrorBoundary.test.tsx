import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { AppErrorBoundary } from "../src/AppRoot";

// Manager fix round (item 4, boot diagnostics): "if AppRoot can render nothing when open() or
// first render throws, add the same honest failure surface there." IndexedDbStore.open() already
// had one (AppRoot's own `error` state); App's FIRST RENDER did not, and App.tsx's own body runs
// `useMemo(() => createWorkerClient(), [])`, which used to throw synchronously on a worker spawn
// failure with no error boundary anywhere in the tree, exactly Niko's reported "silent blank
// screen, self-healed on reload" (Preact simply fails to render the subtree, nothing is shown).
//
// This tests AppErrorBoundary in isolation (a deliberately-throwing child), rather than rendering
// the full `<AppRoot />` composition: AppRoot's OTHER branch (IndexedDbStore.open()) needs a real
// or fake-indexeddb global this suite does not polyfill, an unrelated pre-existing constraint that
// has nothing to do with the render-throw path this test is actually proving.
function Bomb(): never {
  throw new Error("worker spawn failed: boom");
}

describe("AppErrorBoundary (Manager fix round, item 4)", () => {
  it("catches a render-time throw from its child and shows a calm, honest, reloadable surface instead of a blank page", () => {
    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>
    );
    expect(screen.getByText("Snake ToolBox could not start")).toBeInTheDocument();
    expect(screen.getByText(/worker spawn failed: boom/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("renders children normally when nothing throws (the common case, unaffected)", () => {
    render(
      <AppErrorBoundary>
        <div>all good</div>
      </AppErrorBoundary>
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
    expect(screen.queryByText("Snake ToolBox could not start")).not.toBeInTheDocument();
  });
});
