// NEXIONE - service worker
// Cache-first strategy pour l'app shell : ouverture instantanee + usage hors-ligne.
// Incrementer CACHE_NAME a chaque nouvelle version deployee pour invalider l'ancien cache.
const CACHE_NAME = "nexione-cache-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./admin.html",
  "./child.html",
  "./supervisor.html",
  "./manifest.json",
  "./config.js",
  "./css/style.css",
  "./js/sync.js",
  "./js/icons.js",
  "./js/store.js",
  "./js/utils.js",
  "./js/auth.js",
  "./js/bot.js",
  "./js/admin.js",
  "./js/child.js",
  "./js/supervisor.js",
  "./js/sw-register.js",
  "./assets/logo.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/maskable-192.png",
  "./assets/icons/maskable-512.png",
  "./content/banque_affinites_generale_50.csv",
  "./content/banque_affinites_6e_humanites_terminale_25.csv",
  "./assets/avatars/avatar_01.png",
  "./assets/avatars/avatar_02.png",
  "./assets/avatars/avatar_03.png",
  "./assets/avatars/avatar_04.png",
  "./assets/avatars/avatar_05.png",
  "./assets/avatars/avatar_06.png",
  "./assets/avatars/avatar_07.png",
  "./assets/avatars/avatar_08.png",
  "./assets/avatars/avatar_09.png",
  "./assets/avatars/avatar_10.png",
  "./assets/avatars/avatar_11.png",
  "./assets/avatars/avatar_12.png",
  "./assets/avatars/avatar_13.png",
  "./assets/avatars/avatar_14.png",
  "./assets/avatars/avatar_15.png",
  "./assets/avatars/avatar_16.png",
  "./assets/avatars/avatar_17.png",
  "./assets/avatars/avatar_18.png",
  "./assets/avatars/avatar_19.png",
  "./assets/avatars/avatar_20.png",
  "./assets/avatars/avatar_21.png",
  "./assets/avatars/avatar_22.png",
  "./assets/avatars/avatar_23.png",
  "./assets/avatars/avatar_24.png",
  "./assets/avatars/avatar_25.png",
  "./assets/avatars/avatar_26.png",
  "./assets/avatars/avatar_27.png",
  "./assets/avatars/avatar_28.png",
  "./assets/avatars/avatar_29.png",
  "./assets/avatars/avatar_30.png",
  "./assets/avatars/avatar_31.png",
  "./assets/avatars/avatar_32.png",
  "./assets/avatars/avatar_33.png",
  "./assets/avatars/avatar_34.png",
  "./assets/avatars/avatar_35.png",
  "./assets/avatars/avatar_36.png",
  "./assets/avatars/avatar_37.png",
  "./assets/avatars/avatar_38.png",
  "./assets/avatars/avatar_39.png",
  "./assets/avatars/avatar_40.png",
  "./assets/avatars/avatar_41.png",
  "./assets/avatars/avatar_42.png",
  "./assets/avatars/avatar_43.png",
  "./assets/avatars/avatar_44.png",
  "./assets/avatars/avatar_45.png",
  "./assets/avatars/avatar_46.png",
  "./assets/avatars/avatar_47.png",
  "./assets/avatars/avatar_48.png",
  "./assets/avatars/avatar_49.png",
  "./assets/avatars/avatar_50.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) => cache.add(url).catch((err) => console.warn("SW cache miss:", url, err)))
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
