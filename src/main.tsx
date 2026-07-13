import { render } from "preact";
import { App } from "./App";

const root = document.getElementById("app");
if (!root) throw new Error("main.tsx: #app root element missing from index.html");
render(<App />, root);

// S4: register the service worker for offline support + PWA installability (F8)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((err) => {
    // SW registration failure is not fatal: the app works without it, just without
    // offline caching and the iOS storage-eviction exemption.
    console.warn("Service worker registration failed:", err);
  });
}
