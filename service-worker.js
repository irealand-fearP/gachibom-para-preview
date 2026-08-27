const CACHE_VERSION = "gachibom-jeju-20260827-10";
const APP_SHELL = [
  "./index.html",
  "./install.html",
  "./privacy.html",
  "./para-games.html",
  "./para-games.css?v=20260827-7",
  "./para-games.js?v=20260827-5",
  "./data/jeju_para_games_2026.json",
  "./data/jeju_para_games_nearby_facilities.json",
  "./distribution.css?v=20260827-3",
  "./styles.css?v=20260827-7",
  "./help-chatbot.css?v=20260827-2",
  "./saved-trips.js?v=20260712-3",
  "./app.js?v=20260819-1",
  "./help-chatbot.js?v=20260726-1",
  "./pwa.js?v=20260827-2",
  "./manifest.webmanifest",
  "./assets/gachibom-app-icon-192.png",
  "./assets/gachibom-app-icon-512.png",
  "./assets/gachibom-apple-touch-icon-180.png",
  "./assets/gachibom-app-icon.svg",
  "./assets/gachibom-app-icon-maskable.svg",
  "./assets/gachibom-install-qr.png?v=20260827-2",
  "./assets/jeju-map-fallback.svg",
  "./vendor/leaflet/leaflet.css?v=1.9.4",
  "./vendor/leaflet/leaflet.js?v=1.9.4"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const refreshed = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
      return cached || refreshed;
    })
  );
});
