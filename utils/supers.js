/* ============================================================
   utils/supers.js — Supermercados cercanos
   ------------------------------------------------------------
   Cruza TUS precios (de tus boletas) con la ubicación real de
   los ~849 supermercados de Uruguay (datos abiertos del SIPC)
   para decirte, cuando algo está más barato en tal lado, a
   cuántos km lo tenés.
   ============================================================ */

let _supers = null;      // cache en memoria
let _loading = null;

/** Carga el catálogo de supermercados (una vez) */
export async function loadSupers() {
  if (_supers) return _supers;
  if (_loading) return _loading;
  _loading = fetch('assets/supermercados.json')
    .then((r) => r.json())
    .then((list) => { _supers = list; return list; })
    .catch((err) => { console.warn('[supers] no se pudo cargar:', err); _supers = []; return _supers; });
  return _loading;
}

/** Distancia en km entre dos coordenadas (fórmula de Haversine) */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Texto compacto para comparar nombres (sin espacios, acentos ni símbolos) */
function compact(s = '') {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

/**
 * Dado el nombre de un comercio (como lo tenés en tus precios) y tu ubicación,
 * devuelve la sucursal más cercana de esa cadena: { branch, km } o null.
 */
export function nearestBranch(storeName, lat, lon, supers) {
  if (!supers?.length || lat == null || lon == null) return null;
  const key = compact(storeName);
  if (key.length < 3) return null;

  let best = null;
  for (const s of supers) {
    const cad = compact(s.c);
    const nom = compact(s.n);
    // Coincide si el nombre que escribiste está contenido en la cadena/sucursal (o al revés)
    const match =
      (cad && (cad.includes(key) || key.includes(cad))) ||
      (nom && nom.includes(key));
    if (!match) continue;
    const km = distanceKm(lat, lon, s.lat, s.lon);
    if (!best || km < best.km) best = { branch: s, km };
  }
  return best;
}

/** Pide la ubicación del usuario (una vez). Devuelve {lat, lon} o lanza error. */
export function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('sin-geo')); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  });
}

/** Formatea una distancia amigable */
export function fmtKm(km) {
  if (km == null) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
