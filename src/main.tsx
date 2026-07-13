import { render } from "preact";
import { AppRoot } from "./AppRoot";

declare const __BUILD_HASH__: string;

const root = document.getElementById("app");
if (!root) throw new Error("main.tsx: #app root element missing from index.html");
render(<AppRoot />, root);

// Register the SW with the build hash so each build gets its own cache namespace.
if ("serviceWorker" in navigator) {
  const swUrl = `/sw.js?v=${encodeURIComponent(__BUILD_HASH__)}`;
  navigator.serviceWorker.register(swUrl).then((reg) => {
    reg.addEventListener("updatefound", () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          showUpdatePrompt(newWorker);
        }
      });
    });
  }).catch((err) => {
    console.warn("Service worker registration failed:", err);
  });
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) { refreshing = true; location.reload(); }
  });
}

function showUpdatePrompt(worker: ServiceWorker) {
  const bar = document.createElement("div");
  bar.setAttribute("role", "status");
  bar.innerHTML = `<span>A new version is ready.</span> <button type="button" class="btn btn-small btn-primary">Update now</button>`;
  bar.style.cssText = "position:fixed;bottom:0;left:0;right:0;background:var(--panel);border-top:1px solid var(--line);padding:12px 16px;display:flex;align-items:center;gap:12px;z-index:9999;font-family:var(--font-grotesk);color:var(--text)";
  bar.querySelector("button")!.addEventListener("click", () => {
    worker.postMessage("skipWaiting");
    bar.remove();
  });
  document.body.appendChild(bar);
}

// Expose the build hash for the version stamp
(globalThis as Record<string, unknown>).__STB_BUILD_HASH__ = __BUILD_HASH__;
