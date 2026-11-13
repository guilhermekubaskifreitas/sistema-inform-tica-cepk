/* Service worker da Agenda dos Laboratorios CEPK
   - app shell em cache (network-first nas navegacoes, stale-while-revalidate nos assets)
   - a API (outra origem) NUNCA e cacheada                              */

const CACHE = "cepk-v2";

const SHELL = [
  "./",
  "./index.html",
  "./login.html",
  "./painel.html",
  "./reserva.html",
  "./visualizacao-reservas.html",
  "./laboratorios.html",
  "./theme.css",
  "./theme.js",
  "./api.js",
  "./turmas.js",
  "./pwa.js",
  "./favicon.svg",
  "./icon-32.png",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }

  // Somente o proprio site: a API (outra origem) fica sempre direto.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/sw.js")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
