/* ============================================================
   api/precios-online.js — Precios en vivo de tiendas online
   ------------------------------------------------------------
   Dado un producto, consulta EN EL MOMENTO las tiendas online
   que exponen su catálogo (plataforma VTEX) y devuelve el
   precio de hoy en cada una. Es "mejor esfuerzo": la tienda que
   no responde simplemente no aparece; la app nunca se rompe.

   Sin API key (catálogo público). Sin dependencias npm.
   ============================================================ */

const CORS_ORIGIN = 'https://martin10app.github.io';

// Tiendas soportadas. Agregar una es sumar una línea acá.
const STORES = [
  { name: 'El Dorado', host: 'https://www.eldorado.com.uy',     mode: 'catalog' },
  { name: 'Ta-Ta',     host: 'https://www.tata.com.uy',         mode: 'is' },
  { name: 'Disco',     host: 'https://discouy.disco.com.uy',    mode: 'catalog' },
];

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const UA = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

async function withTimeout(promise, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await promise(ctrl.signal); }
  finally { clearTimeout(t); }
}

/** Saca el precio más barato disponible de una lista de productos VTEX */
function cheapestFromVtex(products) {
  let best = null;
  for (const p of products || []) {
    for (const it of p.items || []) {
      for (const s of it.sellers || []) {
        const off = s.commertialOffer || {};
        if (off.Price > 0 && (off.AvailableQuantity == null || off.AvailableQuantity > 0)) {
          if (!best || off.Price < best.price) {
            best = { price: off.Price, product: p.productName, brand: p.brand || '', link: p.link || p.linkText || '' };
          }
        }
      }
    }
  }
  return best;
}

async function queryStore(store, term) {
  const q = encodeURIComponent(term);
  const url = store.mode === 'is'
    ? `${store.host}/api/io/_v/api/intelligent-search/product_search/?query=${q}&count=6`
    : `${store.host}/api/catalog_system/pub/products/search/${q}?_from=0&_to=6`;
  try {
    const data = await withTimeout(
      (signal) => fetch(url, { headers: UA, signal }).then((r) => (r.ok ? r.json() : null)),
      6000
    );
    if (!data) return null;
    const products = Array.isArray(data) ? data : data.products;
    const best = cheapestFromVtex(products);
    if (!best) return null;
    return {
      store: store.name,
      price: Math.round(best.price),   // VTEX ya da el precio real (no centavos)
      product: best.product,
      link: best.link ? (best.link.startsWith('http') ? best.link : `${store.host}/${best.link}`) : store.host,
    };
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const term = (req.query?.q || req.body?.q || '').toString().trim();
  if (!term) return res.status(400).json({ error: 'Falta el producto (q)' });

  const results = (await Promise.all(STORES.map((s) => queryStore(s, term)))).filter(Boolean);
  results.sort((a, b) => a.price - b.price);

  return res.status(200).json({ term, results });
};
