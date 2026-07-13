// AppRoot: async initialization wrapper. Opens IndexedDbStore before first render,
// validates the curriculum bundle, shows a loading state, then renders App.
import { useEffect, useState } from "preact/hooks";
import { App } from "./App";
import { IndexedDbStore } from "./engine/store/indexedDbStore";
import { validateBundle, assertAllModulesCompletable } from "./engine/bundleValidator";
import { FIXTURE_BUNDLE } from "./mocks/curriculumFixture";
import type { Store } from "./contracts";

export function AppRoot() {
  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Validate the bundle at load time (hardening F)
    const validationErrors = validateBundle(FIXTURE_BUNDLE)
      .filter(e => !e.message.startsWith("all-prose lesson")); // INFO only
    if (validationErrors.length > 0) {
      console.error("Bundle validation errors:", validationErrors);
    }
    const completenessErrors = assertAllModulesCompletable(FIXTURE_BUNDLE);
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

  return <App store={store} />;
}
