/* ============================================================
   utils/helpers.js — Utilidades generales de "Nuestro Hogar"
   ============================================================ */

/** Atajos de selección de DOM */
export const $  = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/** Genera un id único corto (suficiente para dos usuarios) */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Escapa HTML para prevenir inyección al renderizar texto del usuario */
export function escapeHtml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Saludo según la hora del día */
export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h >= 6 && h < 13)  return 'Buenos días';
  if (h >= 13 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Frases rotativas para la portada */
const PHRASES = [
  '¿Qué necesita la casa hoy?',
  'Un hogar organizado, una mente tranquila.',
  'Entre los dos, nada se olvida.',
  '¿Falta algo en casa?',
  'Pequeños detalles, gran hogar.',
  'Hoy es un buen día para ponerse al día.',
];
export function randomPhrase() {
  return PHRASES[Math.floor(Math.random() * PHRASES.length)];
}

/** Formatea fecha corta: "vie 11 jul" */
export function fmtDate(ts) {
  if (!ts) return '';
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleDateString('es-UY', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Formatea hora: "14:32" */
export function fmtTime(ts) {
  if (!ts) return '';
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
}

/** "hace 5 min", "hace 2 h", "ayer", o fecha corta */
export function timeAgo(ts) {
  if (!ts) return '';
  const d = ts instanceof Date ? ts : new Date(ts);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)   return 'recién';
  if (min < 60)  return `hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24)  return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'ayer';
  if (days < 7)  return `hace ${days} días`;
  return fmtDate(d);
}

/** Agrupa un array por la clave que devuelva fn */
export function groupBy(arr, fn) {
  return arr.reduce((acc, item) => {
    const k = fn(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {});
}

/** Debounce clásico para búsqueda instantánea */
export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Normaliza texto para búsqueda (minúsculas, sin tildes) */
export function normalize(str = '') {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Formatea monto en pesos uruguayos */
export function fmtMoney(n) {
  if (n == null || isNaN(n)) return '';
  return new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU', maximumFractionDigits: 0 }).format(n);
}

/**
 * Comprime una imagen (File) a un dataURL JPEG chico,
 * apto para guardarse dentro de un documento de Firestore (< 1 MB).
 */
export function compressImage(file, maxSize = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, maxSize / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      // Si quedó muy pesada, bajar la calidad una vez más
      if (dataUrl.length > 700_000) dataUrl = canvas.toDataURL('image/jpeg', 0.5);
      resolve(dataUrl);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}
