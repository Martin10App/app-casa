'use strict';

/* Precios reales para la lista del supermercado.
   Combina catálogos públicos con el SIPC oficial, limitado a Las Piedras. */

const CORS_ORIGIN = 'https://martin10app.github.io';
const { requireApiUser } = require('./_auth');
const { presentation } = require('./_presentation');

const LAS_PIEDRAS_BOUNDS = { v1: -56.28, v2: -34.78, v3: -56.16, v4: -34.68 };
const SIPC_BASE = 'https://www.precios.uy/sipc2Web/recursos/sipc';
const CACHE_MS = 10 * 60 * 1000;
const ARTICLE_CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map();
let articleCache = { expires: 0, value: [] };

const UA = {
  'User-Agent': 'Mozilla/5.0 (compatible; NuestroHogar/1.0; price-comparison)',
  Accept: 'application/json',
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function normalize(value = '') {
  return String(value).toLocaleLowerCase('es-UY').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

const IGNORED = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'x', 'kg', 'g', 'gr', 'l', 'lt', 'ml']);
function tokens(value) {
  return normalize(value).split(' ').filter((word) => word.length > 1 && !IGNORED.has(word) && !/^\d+$/.test(word));
}

function relevance(name, term) {
  const haystack = normalize(name);
  const wanted = tokens(term);
  if (!wanted.length || !wanted.every((word) => haystack.includes(word))) return 0;
  let score = wanted.reduce((sum, word) => sum + (haystack.split(' ').includes(word) ? 4 : 2), 0);
  if (haystack.startsWith(normalize(term))) score += 5;
  const genericMilk = wanted.length === 1 && wanted[0] === 'leche';
  if (genericMilk && /dulce|chocolat|polvo|crema|helado/.test(haystack)) score -= 20;
  return score;
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
  const variables = {
    first: 18, after: '0', sort: 'score_desc', term,
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

async function queryElDorado(term) {
  const url = `https://www.eldorado.com.uy/api/catalog_system/pub/products/search/${encodeURIComponent(term)}?_from=0&_to=17`;
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

async function officialArticles() {
  if (articleCache.expires > Date.now()) return articleCache.value;
  const value = await fetchJson(`${SIPC_BASE}/obtenerArticulos`, {}, 8000);
  if (Array.isArray(value)) articleCache = { value, expires: Date.now() + ARTICLE_CACHE_MS };
  return articleCache.value;
}

function bestOfficialArticles(all, term, limit = 16) {
  return all.map((article) => ({ article, score: relevance(article.name, term) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.article.name.localeCompare(b.article.name, 'es'))
    .slice(0, limit).map((row) => row.article);
}

function officialStoreName(value = '') {
  return String(value).split(/-\s*Suc\.?/i)[0].trim().replace(/^Ta\s*-\s*Ta$/i, 'Ta-Ta');
}

async function queryOfficial(term) {
  const articles = bestOfficialArticles(await officialArticles(), term);
  if (!articles.length) return [];
  const body = {
    articulos: articles.map((article) => ({ id: String(article.id), name: article.name, cantidad: '1' })),
    ...LAS_PIEDRAS_BOUNDS,
  };
  const data = await fetchJson(`${SIPC_BASE}/compararCanasta`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/plain' }, body: JSON.stringify(body),
  }, 8500);
  return parseOfficialBasket(data, articles);
}

function metadataForColumn(column, establishments = []) {
  const columnTokens = tokens(column).filter((word) => word !== 'suc');
  return establishments.filter((store) => /Las Piedras/i.test(store.localidad || '')).map((store) => {
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

async function pricesForTerm(term) {
  const key = normalize(term);
  const saved = cache.get(key);
  if (saved?.expires > Date.now()) return saved.value;
  const [tata, elDorado, official] = await Promise.all([queryTata(term), queryElDorado(term), queryOfficial(term)]);
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

  const incoming = req.body?.terms || (req.query?.q || req.body?.q ? [req.query?.q || req.body?.q] : []);
  const terms = [...new Set((Array.isArray(incoming) ? incoming : [incoming])
    .map((value) => String(value || '').trim().slice(0, 80)).filter(Boolean))].slice(0, 6);
  if (!terms.length) return res.status(400).json({ error: 'Falta el producto (q o terms)' });

  const entries = await Promise.all(terms.map(async (term) => [term, await pricesForTerm(term)]));
  const queries = Object.fromEntries(entries.map(([term, results]) => [term, { results }]));
  if (terms.length === 1 && !Array.isArray(req.body?.terms)) return res.status(200).json({ term: terms[0], results: queries[terms[0]].results });
  return res.status(200).json({ queries, area: 'Las Piedras', checkedAt: new Date().toISOString() });
}

module.exports = handler;
module.exports._test = { normalize, relevance, bestOfficialArticles, officialStoreName, resultFromProduct, parseOfficialBasket, queryOfficial, pricesForTerm };
