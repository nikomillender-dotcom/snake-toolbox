// Service Worker (I5, F7, hardening round A): versioned caches derived from the
// build hash, network-first for the app shell so deploys always land, cache-first
// for Pyodide assets (large, immutable per pinned version).
//
// The cache version is injected at registration time via a URL parameter from
// main.tsx (which reads __BUILD_HASH__ from Vite define). This avoids needing
// Vite to process the SW file itself.

// Parse the build hash from the SW URL's query param, fallback to "unknown"
const params = new URL(self.location.href).searchParams;
const BUILD_HASH = params.get("v") || "unknown";
const CACHE_NAME = `stb-${BUILD_HASH}`;

self.addEventListener("install", (event) => {
  // Do NOT skipWaiting: let the "new version ready" prompt control the transition.
  // The new SW waits until the user taps "update" (via a postMessage from the page).
});

self.addEventListener("activate", (event) => {
  // Delete old versioned caches (F7: a stale or poisoned entry cannot be served forever)
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("stb-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Listen for "skipWaiting" message from the page (the "update now" tap)
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache GitHub API calls
  if (url.hostname === "api.github.com") return;
  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // Pyodide assets are large and immutable per pinned version: cache-first
  if (url.pathname.startsWith("/pyodide/")) {
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
    return;
  }

  // App shell (HTML, JS, CSS): network-first so a deploy always lands.
  // Falls back to cache when offline.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((c) => c || new Response("Offline", { status: 503 })))
  );
});
