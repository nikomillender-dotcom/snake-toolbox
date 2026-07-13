import { render } from "preact";
import { AppRoot } from "./AppRoot";

const root = document.getElementById("app");
if (!root) throw new Error("main.tsx: #app root element missing from index.html");
render(<AppRoot />, root);

// S4: register the service worker for offline support + PWA installability (F8)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((err) => {
    console.warn("Service worker registration failed:", err);
  });
}
