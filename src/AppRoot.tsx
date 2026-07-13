// AppRoot: async initialization wrapper. Opens IndexedDbStore before first render,
// shows a loading state while the Store initializes, then renders App with the real
// Store. This is the pattern the FirstLoadPrimer already uses for the Pyodide boot:
// a calm "getting ready" state before the real app appears.
import { useEffect, useState } from "preact/hooks";
import { App } from "./App";
import { IndexedDbStore } from "./engine/store/indexedDbStore";
import type { Store } from "./contracts";

export function AppRoot() {
  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
