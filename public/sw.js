// Service worker Drivest : rend l'application installable et garde l'interface
// disponible quand le réseau est lent ou coupé. Les données (Supabase, autre
// origine) ne sont jamais mises en cache : soldes et retraits restent à jour.
const CACHE = 'drivest-v2';
// Au-delà de ce délai, une page s'ouvre depuis la dernière version enregistrée
const NAVIGATION_TIMEOUT_MS = 5000;
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Pages : réseau d'abord (5 s maximum), sinon la dernière version enregistrée
  if (request.mode === 'navigate') {
    const network = fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put('/', copy));
      }
      return response;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, NAVIGATION_TIMEOUT_MS));
    event.respondWith(
      Promise.race([network, timeout.then(() => caches.match('/'))])
        .then((response) => response || network)
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Fichiers versionnés (/assets/…-hash.js) : cache d'abord, ils ne changent jamais
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/logos/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
