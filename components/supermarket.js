import { $, escapeHtml, fmtMoney, normalize, uid } from '../utils/helpers.js';
import { CATEGORIES, ICONS } from '../utils/images.js';
import { inferShoppingCategory, groupShoppingItems, shoppingInsights } from '../utils/shopping.mjs';
import { toast } from './toast.js';

let deps;

export function renderSupermarket() {
  if (!deps) return;
  const items = deps.getPending();
  const deals = Object.fromEntries(items.map((item) => [item.id, deps.cheapestFor(item.name)]));
  const insight = shoppingInsights(items, deals);
  const groups = groupShoppingItems(items);
  $('#super-sub').textContent = `${items.length} por comprar${insight.urgentCount ? ` · ${insight.urgentCount} urgente${insight.urgentCount === 1 ? '' : 's'}` : ''}`;
  $('#super-smart').innerHTML = `
    <div class="super-smart__stat"><span>Productos</span><strong>${items.length}</strong></div>
    <div class="super-smart__stat"><span>Estimado</span><strong>${insight.pricedCount ? fmtMoney(insight.estimatedTotal) : '—'}</strong><small>${insight.pricedCount}/${items.length || 0} con precio</small></div>
    <div class="super-smart__tip">${insight.bestStore
      ? `${ICONS.tag}<span><b>Conviene mirar ${escapeHtml(insight.bestStore.store)}</b><small>Tiene el mejor precio en ${insight.bestStore.count} producto${insight.bestStore.count === 1 ? '' : 's'} de tu lista.</small></span>`
      : `${ICONS.spark}<span><b>La app aprende con cada boleta</b><small>Cuando haya precios guardados te dirá dónde conviene comprar.</small></span>`}</div>`;
  $('#super-list').innerHTML = groups.length
    ? groups.map((group) => `<section class="super-aisle">
        <header class="super-aisle__head"><span>${ICONS[group.icon] || ICONS.box}</span><h3>${group.label}</h3><b>${group.items.length}</b></header>
        <div class="super-aisle__items">${group.items.map((item, i) => {
          const by = deps.userOf(item.createdBy);
          const deal = deals[item.id];
          return `<article class="super-card super-card--${item.priority}" data-id="${item.id}" style="--i:${i}">
            ${deps.tileHtml(item, 'super-card__tile')}
            <div class="super-card__body">
              <div class="super-card__name">${escapeHtml(item.name)}</div>
              ${item.detail ? `<div class="super-card__detail">${escapeHtml(item.detail)}</div>` : ''}
              ${deal ? `<div class="super-card__deal">${ICONS.tag} ${deps.dealText(deal)}</div>` : ''}
              <div class="super-card__meta"><span class="super-card__qty">×${item.qty || 1}</span>${item.priority === 'alta' ? '<span class="super-card__urgent">Urgente</span>' : ''}<span>${deps.avatarHtml(item.createdBy)} ${escapeHtml(by.name)}</span></div>
            </div>
            <button class="super-edit" data-action="edit" aria-label="Editar ${escapeHtml(item.name)}">${ICONS.edit}</button>
            <button class="super-check" data-action="super-complete" aria-label="Compré ${escapeHtml(item.name)}">${ICONS.check}</button>
          </article>`;
        }).join('')}</div>
      </section>`).join('')
    : `<div class="super-complete">${ICONS.check}<h3>¡Changuito completo!</h3><p>No queda nada pendiente. Podés agregar algo arriba si te acordás de otra cosa.</p></div>`;
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
}
