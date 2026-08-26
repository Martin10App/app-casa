'use strict';

/* Precios reales para la lista del supermercado.
   Combina catálogos públicos con el SIPC oficial alrededor de cada hogar. */

const CORS_ORIGIN = 'https://martin10app.github.io';
const { requireApiUser } = require('./_auth');
const { presentation, samePresentation } = require('./_presentation');

const LAS_PIEDRAS_BOUNDS = { v1: -56.28, v2: -34.78, v3: -56.16, v4: -34.68 };
const DEFAULT_LOCATION = { lat: -34.73, lon: -56.22 };
const OFFICIAL_RADIUS_KM = 20;
const SIPC_BASE = 'https://www.precios.uy/sipc2Web/recursos/sipc';
const CACHE_MS = 10 * 60 * 1000;
const ARTICLE_CACHE_MS = 6 * 60 * 60 * 1000;
const BARCODE_CACHE_MS = 24 * 60 * 60 * 1000;
const cache = new Map();
const barcodeCache = new Map();
let articleCache = { expires: 0, value: [] };

const UA = {
  'User-Agent': 'Mozilla/5.0 (compatible; NuestroHogar/1.0; price-comparison)',
  Accept: 'application/json',
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Household-ID');
}

function normalize(value = '') {
  return String(value).toLocaleLowerCase('es-UY').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

const IGNORED = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'x', 'kg', 'g', 'gr', 'l', 'lt', 'ml']);
function tokens(value) {
  return normalize(value).split(' ').filter((word) => word.length > 1 && !IGNORED.has(word) && !/^\d+$/.test(word));
}

function sanitizeLocation(value) {
  const lat = Number(value?.lat); const lon = Number(value?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function boundsForLocation(value, radiusKm = OFFICIAL_RADIUS_KM) {
  const location = sanitizeLocation(value);
  if (!location) return { ...LAS_PIEDRAS_BOUNDS };
  const latDelta = radiusKm / 111.32;
  const lonDelta = radiusKm / (111.32 * Math.max(0.2, Math.cos(location.lat * Math.PI / 180)));
  return {
    v1: +(location.lon - lonDelta).toFixed(5), v2: +(location.lat - latDelta).toFixed(5),
    v3: +(location.lon + lonDelta).toFixed(5), v4: +(location.lat + latDelta).toFixed(5),
  };
}

function requestInfo(value) {
  if (typeof value === 'string') return { key: value, name: value, sizeLabel: '' };
  const name = String(value?.name || '').trim().slice(0, 80);
  return { key: String(value?.key || name).trim().slice(0, 100), name, sizeLabel: String(value?.sizeLabel || '').trim().slice(0, 30) };
}

function requestText(value) {
  const request = requestInfo(value);
  return `${request.name} ${request.sizeLabel}`.trim();
}

function areaCacheKey(term, location) {
  const request = requestInfo(term);
  const loc = sanitizeLocation(location) || DEFAULT_LOCATION;
  return `${normalize(requestText(request))}|${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
}

function relevance(name, term) {
  const haystack = normalize(name);
  const wanted = tokens(requestInfo(term).name);
  const available = haystack.split(' ');
  const wordMatches = (word) => available.some((candidate) => candidate === word
    || candidate === `${word}s` || word === `${candidate}s`
    || candidate === `${word}es` || word === `${candidate}es`);
  if (!wanted.length || !wanted.every(wordMatches)) return 0;
  if (samePresentation(requestText(term), name) === false) return 0;
  const genericMilk = wanted.length === 1 && wanted[0] === 'leche';
  if (genericMilk && /dulce|chocolat|polvo|crema|helado|condens|lechera|vegetal|almendra|soja|coco/.test(haystack)) return -1;
  let score = wanted.reduce((sum, word) => sum + (available.includes(word) ? 4 : 2), 0);
  if (haystack.startsWith(normalize(requestInfo(term).name))) score += 5;
  if (samePresentation(requestText(term), name) === true) score += 30;
  return score;
}

function cleanBarcode(value = '') {
  return String(value).replace(/\D/g, '');
}

function validBarcode(value = '') {
  const code = cleanBarcode(value);
  if (![8, 12, 13, 14].includes(code.length)) return false;
  // UPC-E usa una expansión propia: se acepta su formato numérico de 8 dígitos
  // y los demás GTIN se validan con el dígito de control estándar.
  if (code.length === 8) return true;
  const digits = [...code].map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

function sameBarcode(left, right) {
  const a = cleanBarcode(left).replace(/^0+/, '');
  const b = cleanBarcode(right).replace(/^0+/, '');
  return Boolean(a && b && a === b);
}

async function fetchJson(url, options = {}, timeoutMs = 6500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, headers: { ...UA, ...(options.headers || {}) }, signal: ctrl.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function resultFromProduct(store, product, price, link, { listPrice = null, source = 'online' } = {}) {
  if (!(Number(price) > 0) || !product) return null;
  const pack = presentation(product, Number(price));
  return {
    store, price: Number(price), product, link, source,
    offer: Number(listPrice) > Number(price), listPrice: Number(listPrice) > Number(price) ? Number(listPrice) : null,
    comparisonPrice: pack.comparisonPrice,
    comparisonUnit: pack.comparisonUnit,
    sizeLabel: pack.sizeLabel,
    checkedAt: new Date().toISOString(),
  };
}

async function queryTata(term) {
  const searchName = requestInfo(term).name;
  const variables = {
    first: 18, after: '0', sort: 'score_desc', term: searchName,
    selectedFacets: [
      { key: 'channel', value: JSON.stringify({ salesChannel: '4', regionId: '' }) },
      { key: 'locale', value: 'es-uy' },
    ],
  };
  const url = `https://www.tata.com.uy/api/graphql?operationName=ProductsQuery&variables=${encodeURIComponent(JSON.stringify(variables))}`;
  const data = await fetchJson(url);
  const nodes = data?.data?.search?.products?.edges?.map((edge) => edge.node) || [];
  const candidates = nodes.map((node) => {
    const offer = node.offers?.offers?.find((row) => row.price > 0 && (!row.availability || row.availability.includes('InStock')));
    return { node, offer, score: relevance(node.name, term) };
  }).filter((row) => row.offer && row.score > 0);
  candidates.sort((a, b) => b.score - a.score || a.offer.price - b.offer.price);
  const bestScore = candidates[0]?.score;
  const best = candidates.filter((row) => row.score === bestScore).sort((a, b) => {
    const pa = presentation(a.node.name, a.offer.price).comparisonPrice || a.offer.price;
    const pb = presentation(b.node.name, b.offer.price).comparisonPrice || b.offer.price;
    return pa - pb;
  })[0];
  if (!best) return null;
  return resultFromProduct('Ta-Ta', best.node.name, best.offer.price, `https://www.tata.com.uy/${best.node.slug}/p`, {
    listPrice: best.offer.listPrice,
  });
}

function tataExactProduct(node, barcode) {
  const offer = node?.offers?.offers?.find((row) => row.price > 0 && (!row.availability || row.availability.includes('InStock')));
  const gtins = [node?.gtin, ...(node?.offers?.offers || []).map((row) => row?.itemOffered?.gtin)];
  if (!offer || !gtins.some((gtin) => sameBarcode(gtin, barcode))) return null;
  const result = resultFromProduct('Ta-Ta', node.name, offer.price, `https://www.tata.com.uy/${node.slug}/p`, { listPrice: offer.listPrice });
  return result ? { result, brand: node.brand?.name || node.brand?.brandName || '', image: node.image?.[0]?.url || '' } : null;
}

async function queryTataBarcode(barcode) {
  const variables = {
    first: 18, after: '0', sort: 'score_desc', term: barcode,
    selectedFacets: [
      { key: 'channel', value: JSON.stringify({ salesChannel: '4', regionId: '' }) },
      { key: 'locale', value: 'es-uy' },
    ],
  };
  const url = `https://www.tata.com.uy/api/graphql?operationName=ProductsQuery&variables=${encodeURIComponent(JSON.stringify(variables))}`;
  const data = await fetchJson(url);
  const nodes = data?.data?.search?.products?.edges?.map((edge) => edge.node) || [];
  return nodes.map((node) => tataExactProduct(node, barcode)).find(Boolean) || null;
}

async function queryElDorado(term) {
  const searchName = requestInfo(term).name;
  const url = `https://www.eldorado.com.uy/api/catalog_system/pub/products/search/${encodeURIComponent(searchName)}?_from=0&_to=17`;
  const products = await fetchJson(url);
  const candidates = [];
  for (const product of Array.isArray(products) ? products : []) {
    const score = relevance(product.productName, term);
    if (score <= 0) continue;
    for (const item of product.items || []) {
      for (const seller of item.sellers || []) {
        const offer = seller.commertialOffer || {};
        if (offer.Price > 0 && (offer.AvailableQuantity == null || offer.AvailableQuantity > 0)) {
          candidates.push({ product, offer, score });
        }
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.offer.Price - b.offer.Price);
  const bestScore = candidates[0]?.score;
  const best = candidates.filter((row) => row.score === bestScore).sort((a, b) => {
    const pa = presentation(a.product.productName, a.offer.Price).comparisonPrice || a.offer.Price;
    const pb = presentation(b.product.productName, b.offer.Price).comparisonPrice || b.offer.Price;
    return pa - pb;
  })[0];
  if (!best) return null;
  const slug = best.product.link || best.product.linkText || '';
  const link = slug.startsWith('http') ? slug : `https://www.eldorado.com.uy/${slug.replace(/^\//, '')}`;
  return resultFromProduct('El Dorado', best.product.productName, best.offer.Price, link, {
    listPrice: best.offer.ListPrice,
  });
}

function elDoradoExactProduct(product, barcode) {
  for (const item of product?.items || []) {
    if (!sameBarcode(item.ean, barcode)) continue;
    for (const seller of item.sellers || []) {
      const offer = seller.commertialOffer || {};
      if (!(offer.Price > 0) || (offer.AvailableQuantity != null && offer.AvailableQuantity <= 0)) continue;
      const slug = product.link || product.linkText || '';
      const link = slug.startsWith('http') ? slug : `https://www.eldorado.com.uy/${slug.replace(/^\//, '')}`;
      const result = resultFromProduct('El Dorado', product.productName, offer.Price, link, { listPrice: offer.ListPrice });
      return result ? { result, brand: product.brand || '', image: item.images?.[0]?.imageUrl || '' } : null;
    }
  }
  return null;
}

async function queryElDoradoBarcode(barcode) {
  const url = `https://www.eldorado.com.uy/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${encodeURIComponent(barcode)}`;
  const products = await fetchJson(url);
  return (Array.isArray(products) ? products : []).map((product) => elDoradoExactProduct(product, barcode)).find(Boolean) || null;
}

const GENERIC_TERMS = [
  'yogur', 'leche', 'queso', 'manteca', 'arroz', 'harina', 'aceite', 'fideos', 'pasta', 'galletas',
  'café', 'cafe', 'yerba', 'azúcar', 'azucar', 'sal', 'agua', 'refresco', 'jugo', 'cerveza', 'vino',
  'detergente', 'suavizante', 'jabón', 'jabon', 'shampoo', 'papel higiénico', 'papel higienico',
  'pollo', 'carne', 'atún', 'atun', 'mayonesa', 'ketchup', 'mermelada', 'chocolate', 'cereal', 'avena',
];

function genericProductTerm(name = '', categoryTags = []) {
  const text = normalize(`${name} ${(categoryTags || []).join(' ')}`);
  const padded = ` ${text} `;
  const match = GENERIC_TERMS.find((term) => padded.includes(` ${normalize(term)} `));
  if (match) return normalize(match).replace('cafe', 'café').replace('azucar', 'azúcar').replace('jabon', 'jabón').replace('atun', 'atún');
  return tokens(name).slice(0, 2).join(' ');
}

async function queryOpenFoodFacts(barcode) {
  const fields = 'code,product_name_es,product_name,brands,quantity,image_front_small_url,categories_tags';
  const data = await fetchJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`, {}, 6500);
  if (data?.status !== 1 || !data.product) return null;
  const product = data.product;
  const name = String(product.product_name_es || product.product_name || '').trim();
  if (!name) return null;
  return {
    name,
    brand: String(product.brands || '').split(',')[0].trim(),
    quantity: String(product.quantity || '').trim(),
    image: /^https:\/\//i.test(product.image_front_small_url || '') ? product.image_front_small_url : '',
    categoryTags: Array.isArray(product.categories_tags) ? product.categories_tags : [],
  };
}

async function productForBarcode(rawBarcode) {
  const barcode = cleanBarcode(rawBarcode);
  if (!validBarcode(barcode)) return { error: 'El código no es un EAN o UPC válido.' };
  const saved = barcodeCache.get(barcode);
  if (saved?.expires > Date.now()) return saved.value;

  const [tata, elDorado, openFoodFacts] = await Promise.all([
    queryTataBarcode(barcode), queryElDoradoBarcode(barcode), queryOpenFoodFacts(barcode),
  ]);
  const exactResults = [tata?.result, elDorado?.result].filter(Boolean)
    .map((row) => ({ ...row, match: 'exact' })).sort((a, b) => a.price - b.price);
  const source = tata || elDorado;
  const product = source ? {
    name: source.result.product, brand: source.brand, quantity: source.result.sizeLabel || '', image: source.image,
  } : openFoodFacts;
  const value = {
    barcode,
    product: product ? { ...product, searchTerm: genericProductTerm(product.name, product.categoryTags) } : null,
    exactResults,
  };
  barcodeCache.set(barcode, { value, expires: Date.now() + BARCODE_CACHE_MS });
  return value;
}

async function officialArticles() {
  if (articleCache.expires > Date.now()) return articleCache.value;
  const value = await fetchJson(`${SIPC_BASE}/obtenerArticulos`, {}, 8000);
  if (Array.isArray(value)) articleCache = { value, expires: Date.now() + ARTICLE_CACHE_MS };
  return articleCache.value;
}

function bestOfficialArticles(all, term, limit = 16) {
  return all.map((article) => ({ article, score: relevance(`${article.name} ${article.unidad || ''}`, term) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.article.name.localeCompare(b.article.name, 'es'))
    .slice(0, limit).map((row) => row.article);
}

function officialStoreName(value = '') {
  return String(value).split(/-\s*Suc\.?/i)[0].trim().replace(/^Ta\s*-\s*Ta$/i, 'Ta-Ta');
}

async function queryOfficial(term, location) {
  const articles = bestOfficialArticles(await officialArticles(), term);
  if (!articles.length) return [];
  const body = {
    articulos: articles.map((article) => ({ id: String(article.id), name: article.name, cantidad: '1' })),
    ...boundsForLocation(location),
  };
  const data = await fetchJson(`${SIPC_BASE}/compararCanasta`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/plain' }, body: JSON.stringify(body),
  }, 8500);
  return parseOfficialBasket(data, articles);
}

function metadataForColumn(column, establishments = []) {
  const columnTokens = tokens(column).filter((word) => word !== 'suc');
  return establishments.map((store) => {
    const storeTokens = new Set(tokens(store.name).filter((word) => word !== 'suc'));
    const score = columnTokens.filter((word) => storeTokens.has(word)).length;
    return { store, score };
  }).sort((a, b) => b.score - a.score)[0]?.store || null;
}

function parseOfficialBasket(data, articles) {
  const articleById = new Map(articles.map((article) => [String(article.id), article]));
  const byStore = new Map();
  for (const row of data?.datos || []) {
    const article = articleById.get(String(row.id));
    if (!article) continue; // saltea la fila TOTAL
    for (const [column, rawValue] of Object.entries(row)) {
      if (/css$|^artículo$|^diferencia$|^id$/i.test(column)) continue;
      // SIPC marca con (*) los precios estimados: no se presentan como precios reales.
      const match = /^\$\s*([0-9.,]+)\s*-\s*(\d{2}\/\d{2}\/\d{2})/.exec(String(rawValue || ''));
      if (!match) continue;
      const meta = metadataForColumn(column, data.establecimientos || []);
      if (!meta) continue;
      const price = Number(match[1].replace(',', '.'));
      const storeName = officialStoreName(meta.name || column.split('|')[0]);
      const result = resultFromProduct(storeName, `${article.name} · ${String(article.unidad || '').trim()}`, price,
        meta.web || 'https://www.precios.uy/preciosgub/#/', { source: 'oficial' });
      if (!result) continue;
      result.observedAt = match[2];
      result.address = meta.direccion || '';
      const key = normalize(result.store);
      const previous = byStore.get(key);
      const rank = result.comparisonPrice || result.price;
      if (!previous || rank < (previous.comparisonPrice || previous.price)) byStore.set(key, result);
    }
  }
  return [...byStore.values()];
}

async function pricesForTerm(term, location) {
  const key = areaCacheKey(term, location);
  const saved = cache.get(key);
  if (saved?.expires > Date.now()) return saved.value;
  // Sin una presentación objetivo no existe una comparación segura: elegir el
  // precio por litro/kilo mezclaría, por ejemplo, 500 ml con 1 litro.
  const target = presentation(requestText(term));
  if (!target.packageQuantity || !target.comparisonUnit) {
    cache.set(key, { value: [], expires: Date.now() + CACHE_MS });
    return [];
  }
  const [tata, elDorado, official] = await Promise.all([queryTata(term), queryElDorado(term), queryOfficial(term, location)]);
  const byStore = new Map();
  for (const result of [...(official || []), tata, elDorado].filter(Boolean)) {
    const storeKey = normalize(result.store);
    const previous = byStore.get(storeKey);
    // El catálogo online gana cuando hay dos datos de la misma cadena: es el precio visible ahora.
    if (!previous || result.source === 'online' || (result.comparisonPrice || result.price) < (previous.comparisonPrice || previous.price)) {
      byStore.set(storeKey, result);
    }
  }
  const value = [...byStore.values()].sort((a, b) => (a.comparisonPrice || a.price) - (b.comparisonPrice || b.price));
  cache.set(key, { value, expires: Date.now() + CACHE_MS });
  return value;
}

async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!(await requireApiUser(req, res))) return;

  const location = sanitizeLocation(req.body?.location || req.query);
  const area = String(req.body?.area || req.query?.area || (location ? 'tu zona' : 'Las Piedras')).trim().slice(0, 40);

  if (req.body?.barcode != null) {
    const lookup = await productForBarcode(req.body.barcode);
    if (lookup.error) return res.status(400).json({ error: lookup.error });
    return res.status(200).json({ ...lookup, area, checkedAt: new Date().toISOString() });
  }

  const incoming = req.body?.terms || (req.query?.q || req.body?.q ? [req.query?.q || req.body?.q] : []);
  const requests = (Array.isArray(incoming) ? incoming : [incoming]).map(requestInfo).filter((item) => item.name);
  const terms = [...new Map(requests.map((item) => [item.key || item.name, item])).values()].slice(0, 6);
  if (!terms.length) return res.status(400).json({ error: 'Falta el producto (q o terms)' });

  const entries = await Promise.all(terms.map(async (term) => [term.key || term.name, await pricesForTerm(term, location)]));
  const queries = Object.fromEntries(entries.map(([term, results]) => [term, { results }]));
  if (terms.length === 1 && !Array.isArray(req.body?.terms)) {
    const key = terms[0].key || terms[0].name;
    return res.status(200).json({ term: key, results: queries[key].results, area });
  }
  return res.status(200).json({ queries, area, checkedAt: new Date().toISOString() });
}

module.exports = handler;
module.exports._test = {
  normalize, relevance, bestOfficialArticles, officialStoreName, resultFromProduct, parseOfficialBasket,
  queryOfficial, pricesForTerm, cleanBarcode, validBarcode, sameBarcode, genericProductTerm,
  tataExactProduct, elDoradoExactProduct, queryOpenFoodFacts, productForBarcode,
  sanitizeLocation, boundsForLocation, areaCacheKey, requestInfo,
};
