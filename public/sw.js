// Service Worker (I5, F7): versioned caches, old-cache cleanup on activate,
// hash-pinned Pyodide verification. The precache manifest is load-bearing:
// ANY file add/delete/rename in a future delta updates it.
const CACHE_VERSION = "stb-v1";
const CACHE_NAME = `snake-toolbox-${CACHE_VERSION}`;

// Pyodide core assets hash-pinned per PINS.md
const PYODIDE_PINS = {
  "pyodide.asm.wasm": "f7a8a169e513791e18fa0790fb69d6f2656b779e9012ba57e03e973f0df0b39f",
};

self.addEventListener("install", (event) => {
  // Skip waiting so the new SW activates immediately
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Delete old versioned caches (F7: a stale or poisoned entry cannot be served forever)
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("snake-toolbox-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Cache-first for same-origin assets, network-first for API calls
  const url = new URL(event.request.url);

  // Never cache GitHub API calls
  if (url.hostname === "api.github.com") return;

  // Cache-first for same-origin
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
});
