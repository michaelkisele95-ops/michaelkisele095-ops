/**
 * NEXI LAB — service-worker.js
 * Cache l'app shell (HTML/CSS/JS/icônes) pour un lancement instantané et
 * un fonctionnement minimal hors-ligne. Les données de jeu (NX, donjons...)
 * passent TOUJOURS par le réseau (/api/proxy) : jamais mises en cache ici,
 * pour éviter des scores ou classements obsolètes.
 */
const CACHE_NAME = "nexilab-shell-v1";
const SHELL_FILES = [
  "/", "/index.html", "/eleve.html", "/admin.html",
  "/css/style.css",
  "/js/config.js", "/js/logic-core.js", "/js/auth.js", "/js/api.js",
  "/js/nexibot.js", "/js/eleve.js", "/js/admin.js",
  "/icons/logo-nexilab.svg", "/icons/icon-192.svg", "/icons/icon-512.svg",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL_FILES)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Jamais de cache pour les appels API : toujours des données fraîches.
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res && res.ok) caches.open(CACHE_NAME).then((c) => c.put(event.request, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
