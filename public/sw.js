// Service Worker (I5, F7): versioned caches, old-cache cleanup on activate.
// The precache manifest is load-bearing: ANY file add/delete/rename in a
// future delta updates it.
//
// NOTE (S4 fix): the real F7 hash-pin verification lives in PyodideEngine.boot()
// (pyodideEngine.ts), which verifies the wasm SHA-256 before trusting the runtime.
// The SW's job is cache management, not hash verification. The dead PYODIDE_PINS
// constant and its overstated comment are removed per Frederick's S4 finding.
const CACHE_VERSION = "stb-v1";
const CACHE_NAME = `snake-toolbox-${CACHE_VERSION}`;

self.addEventListener("install", (event) => {
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
