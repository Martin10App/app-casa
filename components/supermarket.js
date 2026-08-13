import { $, escapeHtml, fmtMoney, normalize, uid } from '../utils/helpers.js';
import { CATEGORIES, ICONS } from '../utils/images.js';
import { inferShoppingCategory, groupShoppingItems, shoppingInsights, purchaseRecommendations } from '../utils/shopping.mjs';
import { toast } from './toast.js';

let deps;
let liveById = {};
let loading = false;
let loadError = false;
let requestedSignature = '';
let lastLiveRefresh = 0;
const expanded = new Set();
const LIVE_REFRESH_MS = 10 * 60 * 1000;
let storefrontOverlay;
let storefrontReturnFocus;
let storefrontRecommendations = [];
let storefrontComparisons = {};
let storefrontCategory = 'all';
let storefrontSearch = '';
let storefrontRequestId = 0;

function signature(items) {
  return items.map((item) => `${item.id}:${normalize(item.name)}`).sort().join('|');
}

function isLive(deal) { return deal?.source === 'online' || deal?.source === 'oficial'; }

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function sourceLabel(deal) {
  if (deal?.source === 'online') return 'Catálogo online';
  if (deal?.source === 'oficial') return 'Precio oficial reciente';
  return 'Tu último precio';
}

function freshness(deal) {
  if (deal?.observedAt) return `informado el ${escapeHtml(deal.observedAt)}`;
  if (deal?.checkedAt) {
    const time = new Date(deal.checkedAt).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
    return `consultado ${time}`;
  }
  return 'de tus boletas';
}

function dealLine(deal) {
  const unit = deal.comparisonPrice && deal.comparisonUnit
    ? ` · ${fmtMoney(deal.comparisonPrice)}/${escapeHtml(deal.comparisonUnit)}` : '';
  return `<b>${escapeHtml(deal.store)}</b> · ${fmtMoney(deal.price)}${unit}`;
}

function comparisonRows(item, result) {
  if (!expanded.has(item.id)) return '';
  const rows = result?.results || [];
  return `<div class="super-card__comparison" id="compare-${item.id}">
    <div class="super-card__compare-title">Precios encontrados en Las Piedras</div>
    ${rows.length ? rows.slice(0, 6).map((row, index) => `<div class="super-price-row ${index === 0 ? 'is-best' : ''}">
      <div><b>${escapeHtml(row.store)}</b><small>${escapeHtml(row.product || item.name)} · ${freshness(row)}</small></div>
      <div class="super-price-row__amount">${fmtMoney(row.price)}${row.offer ? '<small>Oferta</small>' : ''}</div>
      ${safeExternalUrl(row.link) ? `<a href="${escapeHtml(safeExternalUrl(row.link))}" target="_blank" rel="noopener noreferrer" aria-label="Ver fuente de ${escapeHtml(row.store)}">Ver</a>` : ''}
    </div>`).join('') : `<div class="super-card__no-price">No encontramos un precio comparable ahora. La app seguirá usando tus boletas.</div>`}
    <small class="super-card__notice">Compará siempre la marca y el tamaño. El stock y el precio online pueden variar por sucursal.</small>
  </div>`;
}

export function renderSupermarket() {
  if (!deps) return;
  const items = deps.getPending();
  const deals = Object.fromEntries(items.map((item) => {
    const live = liveById[item.id]?.best;
    return [item.id, live || deps.cheapestFor(item.name)];
  }));
  const insight = shoppingInsights(items, deals);
  const groups = groupShoppingItems(items);
  $('#super-sub').textContent = `${items.length} por comprar${insight.urgentCount ? ` · ${insight.urgentCount} urgente${insight.urgentCount === 1 ? '' : 's'}` : ''}`;

  const liveCount = Object.values(deals).filter(isLive).length;
  let statusTitle = 'Precios reales de Las Piedras';
  let statusText = liveCount ? `${liveCount} producto${liveCount === 1 ? '' : 's'} comparado${liveCount === 1 ? '' : 's'} ahora. Se actualiza solo cada 10 min.` : 'Buscamos precios al abrir y luego cada 10 min.';
  if (loading) { statusTitle = 'Buscando precios…'; statusText = 'Consultando supermercados y la fuente oficial.'; }
  if (loadError) { statusTitle = 'No pudimos actualizar'; statusText = 'Seguimos mostrando tus precios guardados. Podés reintentar.'; }

  $('#super-smart').innerHTML = `
    <div class="super-smart__stat"><span>Productos</span><strong>${items.length}</strong></div>
    <div class="super-smart__stat"><span>Mejor estimado</span><strong>${insight.pricedCount ? fmtMoney(insight.estimatedTotal) : '—'}</strong><small>${insight.pricedCount}/${items.length || 0} con precio</small></div>
    <div class="super-smart__tip">${ICONS.tag}<span><b>${escapeHtml(statusTitle)}</b><small>${escapeHtml(statusText)}</small></span>
      <button type="button" class="super-refresh" data-action="refresh-live" ${loading ? 'disabled' : ''} aria-label="Actualizar precios reales">${loading ? 'Buscando…' : 'Actualizar'}</button>
    </div>
    <button type="button" class="super-enter" data-action="enter-store">${ICONS.basket}<span><b>Entrar al súper</b><small>Productos elegidos según tus boletas</small></span><i>${ICONS.back}</i></button>
    ${insight.bestStore ? `<div class="super-smart__recommend">${ICONS.spark}<span><b>Conviene mirar ${escapeHtml(insight.bestStore.store)}</b><small>Tiene el mejor precio en ${insight.bestStore.count} producto${insight.bestStore.count === 1 ? '' : 's'} de tu lista.</small></span></div>` : ''}`;

  $('#super-list').innerHTML = groups.length
    ? groups.map((group) => `<section class="super-aisle">
        <header class="super-aisle__head"><span>${ICONS[group.icon] || ICONS.box}</span><h3>${group.label}</h3><b>${group.items.length}</b></header>
        <div class="super-aisle__items">${group.items.map((item, i) => {
          const by = deps.userOf(item.createdBy);
          const deal = deals[item.id];
          const result = liveById[item.id];
          return `<article class="super-card super-card--${item.priority}" data-id="${item.id}" style="--i:${i}">
            ${deps.tileHtml(item, 'super-card__tile')}
            <div class="super-card__body">
              <div class="super-card__name">${escapeHtml(item.name)}</div>
              ${item.detail ? `<div class="super-card__detail">${escapeHtml(item.detail)}</div>` : ''}
              ${deal ? `<button type="button" class="super-card__deal ${isLive(deal) ? 'is-live' : ''}" data-action="price-details" aria-expanded="${expanded.has(item.id)}" aria-controls="compare-${item.id}">${ICONS.tag}<span>${sourceLabel(deal)} · ${dealLine(deal)}</span><span class="super-card__chevron">${expanded.has(item.id) ? '−' : '+'}</span></button>` : `<div class="super-card__deal is-empty">${loading ? 'Buscando precio comparable…' : 'Todavía sin precio comparable'}</div>`}
              <div class="super-card__meta"><span class="super-card__qty">×${item.qty || 1}</span>${item.priority === 'alta' ? '<span class="super-card__urgent">Urgente</span>' : ''}<span>${deps.avatarHtml(item.createdBy)} ${escapeHtml(by.name)}</span></div>
              ${comparisonRows(item, result)}
            </div>
            <button class="super-edit" data-action="edit" aria-label="Editar ${escapeHtml(item.name)}">${ICONS.edit}</button>
            <button class="super-check" data-action="super-complete" aria-label="Compré ${escapeHtml(item.name)}">${ICONS.check}</button>
          </article>`;
        }).join('')}</div>
      </section>`).join('')
    : `<div class="super-complete">${ICONS.check}<h3>¡Changuito completo!</h3><p>No queda nada pendiente. Podés agregar algo arriba si te acordás de otra cosa.</p></div>`;

  const nextSignature = signature(items);
  if (items.length && nextSignature !== requestedSignature && !loading) {
    requestedSignature = nextSignature;
    queueMicrotask(() => refreshLivePrices(items));
  }
}

async function refreshLivePrices(items = deps.getPending(), force = false) {
  if (loading || !items.length) return;
  if (force) requestedSignature = signature(items);
  loading = true; loadError = false; renderSupermarket();
  try {
    const result = await deps.compareShoppingPrices(items.map((item) => item.name));
    liveById = Object.fromEntries(items.map((item) => [item.id, result[item.name] || { results: [], best: null }]));
    lastLiveRefresh = Date.now();
  } catch (error) {
    console.warn('[precios supermercado]', error);
    loadError = true;
  } finally {
    loading = false;
    renderSupermarket();
  }
}

function refreshLivePricesIfStale() {
  if (document.visibilityState === 'visible' && Date.now() - lastLiveRefresh >= LIVE_REFRESH_MS) {
    refreshLivePrices(deps.getPending());
  }
}

function shortDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
}

function personalizedTop(recommendation, live = []) {
  const byStore = new Map();
  if (recommendation.lastPrice) byStore.set(normalize(recommendation.lastPrice.store), recommendation.lastPrice);
  for (const row of live) byStore.set(normalize(row.store), row);
  if (recommendation.macroPrice) byStore.set('macromercado', recommendation.macroPrice);
  return [...byStore.values()]
    .sort((a, b) => (Number(a.comparisonPrice) || Number(a.price)) - (Number(b.comparisonPrice) || Number(b.price)))
    .slice(0, 3);
}

function storefrontCard(recommendation, comparison) {
  const top = personalizedTop(recommendation, comparison?.results || []);
  const visualItem = { name: recommendation.name, category: recommendation.category || inferShoppingCategory(recommendation.name) };
  const historyLabel = recommendation.times > 0
    ? `Lo compraron ${recommendation.times} ${recommendation.times === 1 ? 'vez' : 'veces'}`
    : 'Visto en tus boletas';
  return `<article class="storefront-card">
    ${deps.tileHtml(visualItem, 'storefront-card__visual')}
    <div class="storefront-card__head"><div><h3>${escapeHtml(recommendation.name)}</h3><small>${historyLabel}</small></div><button type="button" class="storefront-add" data-storefront-add="${escapeHtml(recommendation.name)}" aria-label="Agregar ${escapeHtml(recommendation.name)} a la lista">${ICONS.plus}<span>Agregar</span></button></div>
    <div class="storefront-ranking" aria-label="Top de precios de ${escapeHtml(recommendation.name)}">
      ${top.length ? top.map((row, index) => `<div class="storefront-price ${index === 0 ? 'is-best' : ''}">
        <span class="storefront-price__rank">${index + 1}</span>
        <div><b>${escapeHtml(row.store)}</b><small>${row.card === 'Macropass' ? `Tu precio Macropass · boleta del ${shortDate(row.date)}` : row.source === 'online' ? 'Precio online consultado ahora' : row.source === 'oficial' ? `Precio oficial${row.observedAt ? ` · ${escapeHtml(row.observedAt)}` : ''}` : `Tu boleta${row.date ? ` · ${shortDate(row.date)}` : ''}`}</small></div>
        <strong>${fmtMoney(row.price)}</strong>
      </div>`).join('') : '<p class="storefront-no-price">Todavía no encontramos precios para comparar.</p>'}
    </div>
  </article>`;
}

function storefrontCategoryLabel(category) {
  return CATEGORIES[category]?.label || 'Otros';
}

function storefrontCategoryIcon(category) {
  return ICONS[CATEGORIES[category]?.icon] || ICONS.box;
}

function renderStorefrontResults() {
  const host = $('#storefront-results');
  if (!host) return;
  const visible = storefrontRecommendations.filter((item) => {
    const inCategory = storefrontCategory === 'all' || item.category === storefrontCategory;
    return inCategory && normalize(item.name).includes(storefrontSearch);
  });
  const grouped = new Map();
  for (const item of visible) {
    const category = item.category || 'compras';
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(item);
  }
  $('#storefront-count').textContent = `${visible.length} producto${visible.length === 1 ? '' : 's'}`;
  host.innerHTML = visible.length ? [...grouped].map(([category, items]) => `<section class="storefront-section">
    <header>${storefrontCategoryIcon(category)}<h3>${escapeHtml(storefrontCategoryLabel(category))}</h3><span>${items.length}</span></header>
    <div class="storefront-grid">${items.map((item) => storefrontCard(item, storefrontComparisons[item.name])).join('')}</div>
  </section>`).join('') : '<div class="storefront-empty storefront-empty--search"><h3>No encontramos ese producto</h3><p>Probá con otro nombre o elegí “Todos”.</p></div>';
}

function renderStorefrontShell() {
  const body = $('#storefront-body');
  const categoryCounts = new Map();
  for (const item of storefrontRecommendations) categoryCounts.set(item.category, (categoryCounts.get(item.category) || 0) + 1);
  body.innerHTML = `<div class="storefront-intro"><b>Todo lo que suelen comprar, ordenado por tipo</b><small>Recuperamos productos de las compras y la libreta de precios. Macropass muestra la fecha de la boleta.</small></div>
    <label class="storefront-search"><span class="sr-only">Buscar en tu súper</span>${ICONS.search}<input id="storefront-search" type="search" inputmode="search" autocomplete="off" placeholder="Buscar producto…"></label>
    <div class="storefront-filters" id="storefront-filters" aria-label="Filtrar productos por categoría">
      <button type="button" class="is-active" data-storefront-category="all">Todos <span>${storefrontRecommendations.length}</span></button>
      ${[...categoryCounts].map(([category, count]) => `<button type="button" data-storefront-category="${escapeHtml(category)}">${escapeHtml(storefrontCategoryLabel(category))} <span>${count}</span></button>`).join('')}
    </div>
    <div class="storefront-status"><b id="storefront-count"></b><small id="storefront-live-status" role="status">Mostrando tus precios guardados mientras buscamos los actuales…</small></div>
    <div id="storefront-results"></div>`;
  $('#storefront-search').addEventListener('input', (event) => {
    storefrontSearch = normalize(event.target.value);
    renderStorefrontResults();
  });
  $('#storefront-filters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-storefront-category]');
    if (!button) return;
    storefrontCategory = button.dataset.storefrontCategory;
    $('#storefront-filters').querySelectorAll('button').forEach((item) => item.classList.toggle('is-active', item === button));
    renderStorefrontResults();
  });
  renderStorefrontResults();
}

function buildStorefrontOverlay() {
  storefrontOverlay = document.createElement('div');
  storefrontOverlay.className = 'modal-overlay';
  storefrontOverlay.id = 'storefront-overlay';
  storefrontOverlay.innerHTML = `<section class="modal storefront-modal" role="dialog" aria-modal="true" aria-labelledby="storefront-title">
    <div class="modal__handle"></div>
    <header class="modal__header"><div><h2 class="modal__title" id="storefront-title">Tu súper</h2><small class="storefront-subtitle">Elegido según lo que compran Martín y Lucía</small></div><button type="button" class="icon-btn" id="storefront-close" aria-label="Cerrar">${ICONS.close}</button></header>
    <div class="modal__body storefront-body" id="storefront-body"></div>
  </section>`;
  document.body.appendChild(storefrontOverlay);
  $('#storefront-close').addEventListener('click', closeStorefront);
  storefrontOverlay.addEventListener('click', (event) => { if (event.target === storefrontOverlay) closeStorefront(); });
  $('#storefront-body').addEventListener('click', addStorefrontProduct);
}

async function openStorefront(event) {
  if (!storefrontOverlay) buildStorefrontOverlay();
  storefrontReturnFocus = event?.currentTarget || null;
  storefrontRecommendations = purchaseRecommendations(deps.getPurchases(), deps.getPrices(), 36);
  storefrontComparisons = {};
  storefrontCategory = 'all';
  storefrontSearch = '';
  const requestId = ++storefrontRequestId;
  const body = $('#storefront-body');
  storefrontOverlay.hidden = false;
  requestAnimationFrame(() => storefrontOverlay.classList.add('is-open'));
  document.body.classList.add('no-scroll');
  if (!storefrontRecommendations.length) {
    body.innerHTML = '<div class="storefront-empty"><h3>Todavía estamos aprendiendo</h3><p>Cuando cargues productos desde tus boletas, aparecerán acá para volver a comprarlos y comparar precios.</p></div>';
    return;
  }
  renderStorefrontShell();
  try {
    const comparisons = await deps.compareShoppingPrices(storefrontRecommendations.map((item) => item.name));
    if (requestId !== storefrontRequestId) return;
    storefrontComparisons = comparisons;
    $('#storefront-live-status').textContent = 'Precios actuales consultados. Top 3 listo.';
    renderStorefrontResults();
  } catch (error) {
    if (requestId !== storefrontRequestId) return;
    console.warn('[tu súper]', error);
    $('#storefront-live-status').textContent = 'No pudimos consultar precios actuales; mostramos los guardados en tus boletas.';
  }
}

function closeStorefront() {
  storefrontRequestId += 1;
  storefrontOverlay?.classList.remove('is-open');
  document.body.classList.remove('no-scroll');
  setTimeout(() => {
    if (storefrontOverlay) storefrontOverlay.hidden = true;
    storefrontReturnFocus?.focus();
  }, 250);
}

async function addStorefrontProduct(event) {
  const button = event.target.closest('[data-storefront-add]');
  if (!button) return;
  const name = button.dataset.storefrontAdd;
  button.disabled = true;
  try {
    const duplicate = deps.getPending().find((item) => normalize(item.name) === normalize(name));
    if (duplicate) await deps.updateItem(duplicate.id, { qty: Math.min(99, (duplicate.qty || 1) + 1) });
    else await deps.addItem({ id: uid(), name, detail: '', category: inferShoppingCategory(name), priority: 'media', qty: 1, amount: null, dueDate: null, photo: null, status: 'pendiente', completedBy: null, completedAt: null, createdBy: deps.getMe() });
    button.innerHTML = `${ICONS.check}<span>Agregado</span>`;
    toast(`<b>${escapeHtml(name)}</b> agregado a la lista`, { type: 'success' });
  } catch (error) {
    console.error('[tu súper agregar]', error);
    button.disabled = false;
    toast('No se pudo agregar. Probá de nuevo.', { emoji: '⚠️' });
  }
}

async function quickAdd(event) {
  event.preventDefault();
  const input = $('#super-quick-input');
  const button = $('#super-quick-add');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  button.disabled = true;
  button.textContent = 'Agregando…';
  try {
    const duplicate = deps.getPending().find((item) => normalize(item.name) === normalize(name));
    if (duplicate) {
      const nextQty = Math.min(99, (duplicate.qty || 1) + 1);
      await deps.updateItem(duplicate.id, { qty: nextQty });
      toast(`<b>${escapeHtml(duplicate.name)}</b> ahora son ${nextQty}`, { emoji: '＋', type: 'success' });
    } else {
      const category = inferShoppingCategory(name);
      await deps.addItem({ id: uid(), name, detail: '', category, priority: 'media', qty: 1, amount: null, dueDate: null, photo: null, status: 'pendiente', completedBy: null, completedAt: null, createdBy: deps.getMe() });
      deps.notifyOther(name, category);
      toast(`<b>${escapeHtml(name)}</b> agregado a ${CATEGORIES[category]?.label || 'Compras'}`, { emoji: '✓', type: 'success' });
    }
    input.value = '';
    input.focus();
  } catch (error) {
    console.error('[súper rápido]', error);
    toast('No se pudo agregar. Probá de nuevo.', { emoji: '⚠️' });
  } finally {
    button.disabled = false;
    button.textContent = 'Agregar';
  }
}

export function initSupermarket(dependencies) {
  deps = dependencies;
  $('#super-quick-form').addEventListener('submit', quickAdd);
  $('#super-smart').addEventListener('click', (event) => {
    if (event.target.closest('[data-action="refresh-live"]')) refreshLivePrices(deps.getPending(), true);
    const enter = event.target.closest('[data-action="enter-store"]');
    if (enter) openStorefront({ currentTarget: enter });
  });
  $('#super-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="price-details"]');
    if (!button) return;
    event.stopPropagation();
    const id = button.closest('[data-id]')?.dataset.id;
    if (!id) return;
    if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
    renderSupermarket();
  });
  setInterval(refreshLivePricesIfStale, LIVE_REFRESH_MS);
  document.addEventListener('visibilitychange', refreshLivePricesIfStale);
}
