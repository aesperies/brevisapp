// BREVIS Service Worker
// Versión: actualiza este número cada vez que cambies algo importante
const CACHE_VERSION = 'brevis-v1';

// Archivos que se guardan para usar sin internet
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.html',
  '/guide.html',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/logo-v2-3-light.svg',
  '/logo-v2-3.svg',
  '/logo-white.svg',
];

// ─── INSTALACIÓN: guarda los archivos estáticos ───────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      // Activa el nuevo service worker de inmediato
      return self.skipWaiting();
    })
  );
});

// ─── ACTIVACIÓN: limpia cachés antiguas ───────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_VERSION)
          .map(name => caches.delete(name))
      );
    }).then(() => {
      // Toma control de todas las pestañas abiertas
      return self.clients.claim();
    })
  );
});

// ─── ESTRATEGIA DE CACHÉ ──────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // No interceptar peticiones de la API ni de otros dominios
  if (url.pathname.startsWith('/api/') || url.origin !== location.origin) {
    return;
  }

  // Para peticiones de navegación (páginas HTML):
  // Intenta la red primero, si falla usa la caché
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('/app.html'))
    );
    return;
  }

  // Para recursos estáticos (CSS, JS, imágenes, fuentes):
  // Caché primero, luego red como respaldo
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Guardar en caché si es una respuesta válida
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_VERSION).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});

// ─── NOTIFICACIONES PUSH (preparado para el futuro) ──────────
self.addEventListener('push', event => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'Tienes nuevos newsletters en BREVIS',
    icon: '/icon-192.png',
    badge: '/icon-96.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/app.html' },
    actions: [
      { action: 'open', title: 'Abrir BREVIS' },
      { action: 'close', title: 'Cerrar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'BREVIS', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'close') return;

  const url = event.notification.data?.url || '/app.html';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
