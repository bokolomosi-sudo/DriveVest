// Service worker Drivest : rend l'application installable et garde l'interface
// disponible quand le réseau est lent ou coupé. Les données (Supabase, autre
// origine) ne sont jamais mises en cache : soldes et retraits restent à jour.
const CACHE = 'drivest-v3';
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
  // Téléchargement de l'application et fichier de liaison Android : toujours depuis le réseau
  if (url.pathname.startsWith('/downloads/') || url.pathname.startsWith('/.well-known/')) return;

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

// Notifications push (envoyées par la fonction Edge « send-push »)
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Drivest', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag,
      data: { link: data.link || '/compte/notifications' },
    }),
  );
});

// Appui sur la notification : ouvre (ou ramène) l'application sur la bonne page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.link || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => c.url.startsWith(self.location.origin));
      if (client) return client.navigate(target).then((c) => (c || client).focus());
      return self.clients.openWindow(target);
    }),
  );
});
