const CACHE_NAME = "vibe-shell-v3";
const BASE_URL = self.registration.scope;
const SHELL = [BASE_URL, `${BASE_URL}manifest.webmanifest`];

self.addEventListener("install", (event) => {
  // Activate this new worker immediately instead of waiting for old tabs to close.
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }
  // Never intercept API calls — they must always hit the network so we never
  // serve a cached HTML shell in place of a JSON response.
  if (event.request.url.includes("/api/")) {
    return;
  }
  // Network-first for everything else; fall back to cache only when offline.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((cached) => cached || caches.match(BASE_URL)))
  );
});
