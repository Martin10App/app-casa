import { $, escapeHtml, fmtMoney, normalize, uid } from '../utils/helpers.js';
import { CATEGORIES, ICONS } from '../utils/images.js';
import { inferShoppingCategory, groupShoppingItems, shoppingInsights } from '../utils/shopping.mjs';
import { toast } from './toast.js';

let deps;
let liveById = {};
let loading = false;
let loadError = false;
let requestedSignature = '';
const expanded = new Set();

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
  let statusText = liveCount ? `${liveCount} producto${liveCount === 1 ? '' : 's'} comparado${liveCount === 1 ? '' : 's'} ahora.` : 'Tocá actualizar para buscar ofertas actuales.';
  if (loading) { statusTitle = 'Buscando precios…'; statusText = 'Consultando supermercados y la fuente oficial.'; }
  if (loadError) { statusTitle = 'No pudimos actualizar'; statusText = 'Seguimos mostrando tus precios guardados. Podés reintentar.'; }

  $('#super-smart').innerHTML = `
    <div class="super-smart__stat"><span>Productos</span><strong>${items.length}</strong></div>
    <div class="super-smart__stat"><span>Mejor estimado</span><strong>${insight.pricedCount ? fmtMoney(insight.estimatedTotal) : '—'}</strong><small>${insight.pricedCount}/${items.length || 0} con precio</small></div>
    <div class="super-smart__tip">${ICONS.tag}<span><b>${escapeHtml(statusTitle)}</b><small>${escapeHtml(statusText)}</small></span>
      <button type="button" class="super-refresh" data-action="refresh-live" ${loading ? 'disabled' : ''} aria-label="Actualizar precios reales">${loading ? 'Buscando…' : 'Actualizar'}</button>
    </div>
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
  } catch (error) {
    console.warn('[precios supermercado]', error);
    loadError = true;
  } finally {
    loading = false;
    renderSupermarket();
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
}
