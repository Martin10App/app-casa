/* ============================================================
   components/prices.js — Libreta de precios "¿Dónde comprar?"
   ------------------------------------------------------------
   Guarda el precio de un producto en distintos lugares
   (supermercados, ferias, etc.) y resalta dónde sale más
   barato, con cuánto ahorrás respecto del más caro.
   ============================================================ */

import { $, $$, escapeHtml, uid, normalize, fmtMoney, timeAgo } from '../utils/helpers.js';
import { ICONS, productVisual, productGradient, productGradientDark } from '../utils/images.js';
import { toast } from './toast.js';
import { nearestBranch, fmtKm } from '../utils/supers.js';

/* deps: { getPrices, getUsers, getMe, savePrice, deletePrice, isDark } */
let deps = null;
let modal = null;
let mState = null;

/* ---------- Utilidades de datos ---------- */
const cheapestEntry = (entries = []) =>
  entries.reduce((min, e) => (min == null || e.price < min.price ? e : min), null);
const dearestEntry = (entries = []) =>
  entries.reduce((max, e) => (max == null || e.price > max.price ? e : max), null);

/** Lista de lugares ya usados, para sugerir al escribir */
function knownStores() {
  const set = new Set();
  deps.getPrices().forEach((p) => p.entries?.forEach((e) => set.add(e.store)));
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

/* ---------- Tile visual del producto ---------- */
function tileHtml(name) {
  const grad = deps.isDark() ? productGradientDark(name, 'otros') : productGradient(name, 'otros');
  return `<div class="price-card__tile" style="background:${grad}">${productVisual(name, 'otros')}</div>`;
}

/** Distancia al comercio más cercano de esa cadena (si el usuario compartió ubicación) */
function distTxt(store) {
  const loc = deps.getUserLoc?.();
  const sup = deps.getSupers?.();
  if (!loc || !sup) return '';
  const near = nearestBranch(store, loc.lat, loc.lon, sup);
  return near && near.km <= 60 ? fmtKm(near.km) : '';
}

/** Pide la ubicación (compartida con toda la app) y activa el cálculo de distancias */
export async function activarCercania() {
  const btn = $('#prices-locate');
  if (btn) { btn.disabled = true; btn.textContent = '📍 Buscando tu ubicación…'; }
  const ok = await deps.activarUbicacion();
  if (btn) {
    btn.disabled = false;
    if (ok) { btn.textContent = '📍 Distancias activadas ✓'; btn.classList.add('is-active'); }
    else { btn.textContent = '📍 Ver a qué distancia tengo cada súper'; }
  }
  renderPrices();
}

/* ============================================================
   RENDER de la vista
   ============================================================ */
export function renderPrices() {
  const list = deps.getPrices();
  $('#prices-count').textContent = list.length
    ? `${list.length} producto${list.length === 1 ? '' : 's'}`
    : '';

  const container = $('#prices-list');
  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-state__emoji">🧾</span>
        <div class="empty-state__title">Todavía no cargaste precios</div>
        <div class="empty-state__sub">Anotá cuánto sale algo en cada lugar y te decimos dónde conviene comprar.</div>
      </div>`;
    return;
  }

  container.innerHTML = list.map((product) => {
    const entries = [...(product.entries || [])].sort((a, b) => a.price - b.price);
    const cheap = cheapestEntry(entries);
    const dear = dearestEntry(entries);
    const saving = cheap && dear && dear.price > cheap.price ? dear.price - cheap.price : 0;

    const rows = entries.map((e) => {
      const by = deps.getUsers()[e.by];
      const isCheap = e.price === cheap.price;
      const diff = e.price - cheap.price;
      const dist = distTxt(e.store);
      return `
        <div class="price-row ${isCheap ? 'is-cheap' : ''}" data-eid="${e.id}">
          <div class="price-row__store">
            ${isCheap ? '<span class="price-row__crown">👑</span>' : ''}
            <span>${escapeHtml(e.store)}</span>
            ${dist ? `<span class="price-row__dist">📍 ${dist}</span>` : ''}
            <span class="price-row__ago">${by ? by.emoji : ''} ${timeAgo(e.date)}</span>
          </div>
          <div class="price-row__right">
            <span class="price-row__price">${fmtMoney(e.price)}</span>
            ${diff > 0 ? `<span class="price-row__diff">+${fmtMoney(diff)}</span>` : ''}
            <button class="price-row__del" data-action="del-entry" aria-label="Borrar este precio">${ICONS.close}</button>
          </div>
        </div>`;
    }).join('');

    return `
      <article class="price-card" data-id="${product.id}">
        <header class="price-card__head">
          ${tileHtml(product.name)}
          <div class="price-card__info">
            <h3 class="price-card__name">${escapeHtml(product.name)}</h3>
            ${cheap ? `<div class="price-card__best">Más barato en <b>${escapeHtml(cheap.store)}</b> · ${fmtMoney(cheap.price)}${distTxt(cheap.store) ? ` · a ${distTxt(cheap.store)}` : ''}</div>` : ''}
          </div>
          <button class="item-more" data-action="add-here" aria-label="Agregar precio a ${escapeHtml(product.name)}">${ICONS.plus}</button>
        </header>
        ${saving > 0 ? `<div class="price-card__saving">Ahorrás hasta <b>${fmtMoney(saving)}</b> comprándolo en ${escapeHtml(cheap.store)}</div>` : ''}
        <div class="price-card__rows">${rows}</div>
      </article>`;
  }).join('');
}

/* ============================================================
   MODAL de agregar / actualizar precio
   ============================================================ */
function buildModal() {
  modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'price-overlay';
  modal.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="price-modal-title">
      <div class="modal__handle"></div>
      <header class="modal__header">
        <h2 id="price-modal-title" class="modal__title">Anotar precio</h2>
        <button class="icon-btn" data-close aria-label="Cerrar">${ICONS.close}</button>
      </header>

      <div class="modal__body">
        <div class="modal__preview">
          <div class="modal__preview-tile" id="p-preview-tile"><span id="p-preview-emoji">🧾</span></div>
          <div class="modal__preview-hint" id="p-preview-hint">¿Qué producto?</div>
        </div>

        <label class="field">
          <span class="field__label">Producto <b class="req">*</b></span>
          <input id="p-name" class="field__input" type="text" list="p-name-list"
                 placeholder="Leche 1L, aceite, yerba 1kg…" maxlength="60" autocomplete="off">
          <datalist id="p-name-list"></datalist>
        </label>

        <label class="field">
          <span class="field__label">Lugar / supermercado <b class="req">*</b></span>
          <input id="p-store" class="field__input" type="text" list="p-store-list"
                 placeholder="Ta-Ta, Devoto, feria, El Dorado…" maxlength="40" autocomplete="off">
          <datalist id="p-store-list"></datalist>
        </label>

        <label class="field">
          <span class="field__label">Precio <b class="req">*</b></span>
          <div class="field__prefix-wrap">
            <span class="field__prefix">$</span>
            <input id="p-price" class="field__input field__input--prefixed" type="number"
                   inputmode="decimal" min="0" step="any" placeholder="0">
          </div>
        </label>

        <div class="price-quickstores" id="p-quickstores"></div>
      </div>

      <footer class="modal__footer">
        <button class="btn btn--ghost" data-close>Cancelar</button>
        <button class="btn btn--primary" id="p-save">${ICONS.check} Guardar</button>
      </footer>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });

  $('#p-name', modal).addEventListener('input', updatePreview);
  $('#p-save', modal).addEventListener('click', save);
  $('#p-price', modal).addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });

  // Chips de lugares recientes
  $('#p-quickstores', modal).addEventListener('click', (e) => {
    const chip = e.target.closest('.price-quickstore');
    if (chip) { $('#p-store', modal).value = chip.dataset.store; $('#p-price', modal).focus(); }
  });
}

function updatePreview() {
  const name = $('#p-name', modal).value.trim();
  $('#p-preview-emoji', modal).textContent = productVisual(name, 'otros');
  $('#p-preview-tile', modal).style.background = productGradient(name || 'x', 'otros');
  $('#p-preview-hint', modal).textContent = name || '¿Qué producto?';
}

function fillDatalists() {
  const names = deps.getPrices().map((p) => p.name);
  $('#p-name-list', modal).innerHTML = names.map((n) => `<option value="${escapeHtml(n)}">`).join('');
  const stores = knownStores();
  $('#p-store-list', modal).innerHTML = stores.map((s) => `<option value="${escapeHtml(s)}">`).join('');
  $('#p-quickstores', modal).innerHTML = stores.slice(0, 6)
    .map((s) => `<button type="button" class="price-quickstore" data-store="${escapeHtml(s)}">${escapeHtml(s)}</button>`)
    .join('');
}

async function save() {
  const name  = $('#p-name', modal).value.trim();
  const store = $('#p-store', modal).value.trim();
  const price = parseFloat($('#p-price', modal).value);

  if (!name)  { toast('Escribí el producto', { emoji: '✏️' }); $('#p-name', modal).focus(); return; }
  if (!store) { toast('¿En qué lugar?', { emoji: '🏬' }); $('#p-store', modal).focus(); return; }
  if (!(price > 0)) { toast('Poné un precio válido', { emoji: '💲' }); $('#p-price', modal).focus(); return; }

  const btn = $('#p-save', modal);
  btn.disabled = true;

  // ¿Ya existe ese producto? (comparación sin distinguir mayúsculas/tildes)
  const existing = deps.getPrices().find((p) => normalize(p.name) === normalize(name));
  const product = existing ? structuredClone(existing) : { id: uid(), name, entries: [] };
  product.entries = product.entries || [];

  // Upsert de la entrada de ese lugar
  const idx = product.entries.findIndex((e) => normalize(e.store) === normalize(store));
  const entry = {
    id: idx >= 0 ? product.entries[idx].id : uid(),
    store, price, date: Date.now(), by: deps.getMe(),
  };
  if (idx >= 0) product.entries[idx] = entry; else product.entries.push(entry);

  try {
    await deps.savePrice(product);
    const cheap = cheapestEntry(product.entries);
    const isBest = cheap && cheap.store === store;
    toast(
      isBest && product.entries.length > 1
        ? `¡<b>${escapeHtml(store)}</b> es el más barato para ${escapeHtml(name)}! 🏆`
        : `Precio guardado: <b>${escapeHtml(name)}</b> en ${escapeHtml(store)}`,
      { emoji: '💲', type: 'success' }
    );
    closeModal();
  } catch (err) {
    console.error(err);
    toast('No se pudo guardar el precio', { emoji: '⚠️' });
  } finally {
    btn.disabled = false;
  }
}

export function openPriceModal(prefillName = '') {
  mState = {};
  fillDatalists();
  $('#p-name', modal).value = prefillName || '';
  $('#p-store', modal).value = '';
  $('#p-price', modal).value = '';
  updatePreview();

  modal.classList.add('is-open');
  document.body.classList.add('no-scroll');
  setTimeout(() => $(prefillName ? '#p-store' : '#p-name', modal).focus(), 350);
}

function closeModal() {
  modal.classList.remove('is-open');
  document.body.classList.remove('no-scroll');
}

/* ============================================================
   Inicialización + acciones de las tarjetas
   ============================================================ */
export function initPrices(dependencies) {
  deps = dependencies;
  buildModal();

  $('#prices-locate').addEventListener('click', activarCercania);

  $('#prices-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const card = btn.closest('.price-card');
    const id = card?.dataset.id;
    const product = deps.getPrices().find((p) => p.id === id);
    if (!product) return;

    if (btn.dataset.action === 'add-here') {
      openPriceModal(product.name);
      return;
    }

    if (btn.dataset.action === 'del-entry') {
      const eid = btn.closest('.price-row')?.dataset.eid;
      const clone = structuredClone(product);
      clone.entries = (clone.entries || []).filter((en) => en.id !== eid);
      if (!clone.entries.length) {
        await deps.deletePrice(id);
        toast('Producto quitado de la libreta', { emoji: '🗑️' });
      } else {
        await deps.savePrice(clone);
        toast('Precio borrado', { emoji: '🗑️' });
      }
    }
  });
}
