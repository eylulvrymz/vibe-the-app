const CACHE_NAME = "vibe-shell-v2";
const BASE_URL = self.registration.scope;
const SHELL = [BASE_URL, `${BASE_URL}manifest.webmanifest`];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((cached) => cached || caches.match(BASE_URL)))
  );
});
