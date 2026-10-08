const CACHE_NAME = 'huerto-carlos-v13';
// Se cachean las rutas EXACTAS que pide index.html (con su ?v=) y tambien las limpias:
// si no coinciden, al ir sin red el service worker no encuentra nada y la app no arranca.
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './styles.css?v=8',
  './styles.css?v=9',
  './security.js',
  './security.js?v=7',
  './datos_huertos.js',
  './datos_huertos.js?v=7',
  './campo.js',
  './campo.js?v=7',
  './app.js',
  './app.js?v=7',
  './app.js?v=8',
  './app.js?v=9',
  './app.js?v=10',
  './app.js?v=11',
  './sincro-sheets.js?v=2',
  './excel-parser.js?v=2',
  './security.js?v=8',
  './campo.js?v=8',
  './excel-parser.js',
  './excel-parser.js?v=1',
  './sincro-sheets.js',
  './sincro-sheets.js?v=1',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './assets/fonts/archivo-latin.woff2',
  './assets/fonts/instrument-serif-latin.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Solo procesar peticiones GET dentro del mismo origen para prevenir fugas y envenenamiento de caché
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== location.origin) {
    // Si la petición va a otro origen, dejar que el navegador la gestione bajo directivas CSP
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Devolver recurso cacheado y actualizar cache en segundo plano
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
