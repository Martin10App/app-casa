/* ============================================================
   firebase-messaging-sw.js — Service Worker de notificaciones
   ------------------------------------------------------------
   Recibe los avisos de Firebase Cloud Messaging cuando la app
   está en segundo plano o CERRADA, y muestra la notificación.
   Debe vivir en la raíz del sitio y llamarse exactamente así.
   ============================================================ */

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            'AIzaSyAVvQ4_JoouZ-3jDEFOaVzwVSgz1dxRpxk',
  authDomain:        'app-casa-261f3.firebaseapp.com',
  projectId:         'app-casa-261f3',
  storageBucket:     'app-casa-261f3.firebasestorage.app',
  messagingSenderId: '159310526936',
  appId:             '1:159310526936:web:27100ffce1bab07579daad',
});

const messaging = firebase.messaging();

// Aviso recibido con la app en segundo plano / cerrada
messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || payload.data || {};
  self.registration.showNotification(n.title || 'Nuestro Hogar', {
    body: n.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'nuestro-hogar',
    data: { url: './' },
  });
});

// Tocar la notificación → abrir/enfocar la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return self.clients.openWindow('./');
    })
  );
});
