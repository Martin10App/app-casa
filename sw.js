/* ============================================================
   sw.js — Service Worker de "Nuestro Hogar"
   ------------------------------------------------------------
   ▸ Cachea el esqueleto de la app para abrir al instante
     y funcionar sin conexión.
   ▸ Las peticiones a Firestore NUNCA se cachean acá
     (Firestore ya tiene su propia caché offline).
   ============================================================ */

const CACHE = 'nuestro-hogar-v14';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './firebase.js',
  './manifest.json',
  './components/modal.js',
  './components/toast.js',
  './components/prices.js',
  './components/inventory.js',
  './components/voice.js',
  './components/boleta.js',
  './utils/helpers.js',
  './utils/images.js',
  './utils/notify.js',
  './utils/supers.js',
  './assets/supermercados.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

/* Instalar: precachear el esqueleto */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

/* Activar: limpiar cachés viejas */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Estrategias de red */
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Firestore y APIs de Google: siempre red (tienen su propia caché)
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('firestore') || url.hostname.includes('gstatic.com/firebasejs')) return;

  // Imágenes externas (Unsplash, fuentes): cache-first con relleno
  if (url.origin !== location.origin) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      }).catch(() => hit))
    );
    return;
  }

  // App shell: red primero (para recibir actualizaciones), caché de respaldo
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
  );
});

/* Clic en una notificación: enfocar o abrir la app */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow('./');
    })
  );
});
