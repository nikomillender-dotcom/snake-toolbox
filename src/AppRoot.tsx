// AppRoot: async initialization wrapper. Opens IndexedDbStore before first render,
// validates the curriculum bundle, shows a loading state, then renders App.
import { Component, type ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { App } from "./App";
import { IndexedDbStore } from "./engine/store/indexedDbStore";
import { validateBundle, assertAllModulesCompletable } from "./engine/bundleValidator";
import { REAL_CURRICULUM_BUNDLE } from "./curriculum/realCurriculumBundle";
import type { Store } from "./contracts";

// Manager fix round (item 4, boot diagnostics): "if AppRoot can render nothing when open() or
// first render throws, add the same honest failure surface there." IndexedDbStore.open() already
// had one (the `error` state below); App's FIRST RENDER did not: a synchronous throw inside App
// (its own body runs `useMemo(() => createWorkerClient(), [])`, and a worker spawn failure used to
// throw straight out of that) had no error boundary anywhere in the tree, so Preact failed to
// render the whole subtree and the page went silently blank, exactly Niko's reported "silent blank
// screen, self-healed on reload." Preact supports class-component error boundaries the same way
// React does (componentDidCatch); this is the ONE class component in the app, existing purely to
// catch that failure mode and show a calm, honest, reloadable surface instead of nothing.
interface AppErrorBoundaryState { error: Error | null }

export class AppErrorBoundary extends Component<{ children: ComponentChildren }, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: null };

  override componentDidCatch(error: unknown) {
    this.setState({ error: error instanceof Error ? error : new Error(String(error)) });
  }

  override render() {
    const { error } = this.state;
    if (error) {
      return (
        <div style={{ padding: "24px", color: "var(--ink)", fontFamily: "var(--font-ui)" }}>
          <h1>Snake ToolBox could not start</h1>
          <p>Something went wrong while starting up: {error.message || "an unknown error"}.</p>
          <p>Reloading usually fixes this.</p>
          <button type="button" class="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AppRoot() {
  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Validate the bundle at load time (hardening F)
    const validationErrors = validateBundle(REAL_CURRICULUM_BUNDLE)
      .filter(e => !e.message.startsWith("all-prose lesson")); // INFO only
    if (validationErrors.length > 0) {
      console.error("Bundle validation errors:", validationErrors);
    }
    const completenessErrors = assertAllModulesCompletable(REAL_CURRICULUM_BUNDLE);
    if (completenessErrors.length > 0) {
      console.error("Bundle completeness errors:", completenessErrors);
    }

    IndexedDbStore.open().then(setStore).catch((err) => {
      setError(`Storage initialization failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, []);

  if (error) {
    return (
      <div style={{ padding: "24px", color: "var(--text)", fontFamily: "var(--font-grotesk)" }}>
        <h1>Something went wrong</h1>
        <p>{error}</p>
        <p>Try clearing site data and reloading.</p>
      </div>
    );
  }

  if (!store) {
    return (
      <div style={{ padding: "24px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <p style={{ color: "var(--dim)", fontFamily: "var(--font-grotesk)" }}>Waking up...</p>
      </div>
    );
  }

  return (
    <AppErrorBoundary>
      <App store={store} />
    </AppErrorBoundary>
  );
}
