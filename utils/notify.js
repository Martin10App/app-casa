/* ============================================================
   utils/notify.js — Notificaciones del sistema (Web Notifications)
   ------------------------------------------------------------
   Cuando el otro usuario agrega algo, mostramos:
   ▸ un toast dentro de la app (siempre), y
   ▸ una notificación del sistema si hay permiso y la app
     está en segundo plano.
   Nota: las notificaciones push con la app cerrada requieren
   Firebase Cloud Messaging (ver README, paso opcional).
   ============================================================ */

/** Pide permiso de notificaciones sin molestar (solo la primera vez) */
export async function requestNotifPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------
   Seguimiento de recordatorios ya avisados HOY (por dispositivo).
   Así cada recordatorio avisa una sola vez por día mientras
   siga pendiente, sin repetirse cada vez que se abre la app.
   ------------------------------------------------------------ */
const REMIND_KEY = 'nh_reminded';

function remindedToday() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const saved = JSON.parse(localStorage.getItem(REMIND_KEY) || 'null');
    if (saved && saved.day === today) return saved;
  } catch { /* estado corrupto: se reinicia abajo */ }
  return { day: today, ids: [] };
}

export function wasRemindedToday(id) {
  return remindedToday().ids.includes(id);
}

export function markReminded(id) {
  const state = remindedToday();
  if (!state.ids.includes(id)) state.ids.push(id);
  localStorage.setItem(REMIND_KEY, JSON.stringify(state));
}

/** Muestra una notificación del sistema (si hay permiso) */
export function systemNotify(title, body, tag = 'nuestro-hogar') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  // Si la app está visible, alcanza con el toast interno
  if (document.visibilityState === 'visible') return;
  try {
    // Vía service worker si está disponible (funciona mejor en Android)
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.ready.then((reg) =>
        reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' })
      );
    } else {
      new Notification(title, { body, tag, icon: 'icons/icon-192.png' });
    }
  } catch (err) {
    console.warn('[Notificaciones]', err);
  }
}
