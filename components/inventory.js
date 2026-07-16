/* ============================================================
   components/inventory.js — Inventario "¿Qué tengo en casa?"
   ------------------------------------------------------------
   Registrás lo que hay en casa con su estado (Tengo / Queda
   poco / Se acabó). Sirve para, estando en el súper, chequear
   si ya tenés algo sin volver a casa. Buscador instantáneo.
   Si algo se está por acabar, lo mandás a la lista de compras
   con un toque.
   ============================================================ */

import { $, $$, escapeHtml, uid, normalize, timeAgo, debounce } from '../utils/helpers.js';
import { ICONS, CATEGORIES, productVisual, productGradient, productGradientDark } from '../utils/images.js';
import { toast } from './toast.js';

/* deps: { getInventory, getUsers, getMe, saveInventoryItem, deleteInventoryItem, addToShopping, isDark } */
let deps = null;
let modal = null;
let mState = null;
let filter = { text: '', status: null };

/* Estados posibles del inventario */
const STATUS = {
  tengo:   { label: 'Tengo',       short: 'Tengo',      color: 'var(--green)', soft: 'var(--green-soft)', emoji: '✅' },
  poco:    { label: 'Queda poco',  short: 'Poco',       color: 'var(--amber)', soft: 'var(--amber-soft)', emoji: '🟡' },
  agotado: { label: 'Se acabó',    short: 'Se acabó',   color: 'var(--red)',   soft: 'var(--red-soft)',   emoji: '🔴' },
};
const STATUS_ORDER = ['tengo', 'poco', 'agotado'];
const nextStatus = (s) => STATUS_ORDER[(STATUS_ORDER.indexOf(s) + 1) % STATUS_ORDER.length];

function tileHtml(item) {
  const grad = deps.isDark() ? productGradientDark(item.name, item.category) : productGradient(item.name, item.category);
  return `<div class="inv-card__tile" style="background:${grad}">${productVisual(item.name, item.category)}</div>`;
}

/* ============================================================
   RENDER de la vista
   ============================================================ */
export function renderInventory() {
  const all = deps.getInventory();
  const low = all.filter((i) => i.status !== 'tengo').length;
  $('#inv-count').textContent = all.length
    ? `${all.length} ítem${all.length === 1 ? '' : 's'}${low ? ` · ${low} por reponer` : ''}`
    : '';

  // Filtros de estado
  $('#inv-filters').innerHTML = `
    <button class="chip ${!filter.status ? 'is-active' : ''}" data-fstatus="">Todo</button>
    <button class="chip ${filter.status === 'tengo' ? 'is-active' : ''}" data-fstatus="tengo">✅ Tengo</button>
    <button class="chip ${filter.status === 'poco' ? 'is-active' : ''}" data-fstatus="poco">🟡 Queda poco</button>
    <button class="chip ${filter.status === 'agotado' ? 'is-active' : ''}" data-fstatus="agotado">🔴 Se acabó</button>`;

  const text = normalize(filter.text);
  const list = all.filter((i) => {
    if (filter.status && i.status !== filter.status) return false;
    if (text && !normalize(i.name).includes(text)) return false;
    return true;
  });

  const container = $('#inv-list');
  if (!all.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-state__emoji">📦</span>
        <div class="empty-state__title">Todavía no cargaste nada</div>
        <div class="empty-state__sub">Anotá lo que tenés en casa y, estando en el súper, chequeás acá sin volver.</div>
      </div>`;
    return;
  }
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-state__emoji">🔍</span><div class="empty-state__title">Sin resultados</div><div class="empty-state__sub">Probá con otra palabra o filtro.</div></div>`;
    return;
  }

  container.innerHTML = list.map((item) => {
    const st = STATUS[item.status] || STATUS.tengo;
    const by = deps.getUsers()[item.updatedBy];
    return `
      <article class="inv-card" data-id="${item.id}" style="--st-color:${st.color}">
        ${tileHtml(item)}
        <div class="inv-card__body">
          <div class="inv-card__name">${escapeHtml(item.name)}</div>
          <div class="inv-card__meta">${by ? by.emoji : ''} ${timeAgo(item.updatedAt)}</div>
        </div>
        ${item.status !== 'tengo'
          ? `<button class="inv-toshop" data-action="to-shop" aria-label="Agregar a compras">${ICONS.cart}</button>`
          : ''}
        <button class="inv-status" data-action="cycle" style="background:${st.soft}; color:${st.color}">
          ${st.emoji} ${st.short}
        </button>
      </article>`;
  }).join('');
}

/* ============================================================
   MODAL de agregar / editar ítem de inventario
   ============================================================ */
function buildModal() {
  modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'inv-overlay';
  modal.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="inv-modal-title">
      <div class="modal__handle"></div>
      <header class="modal__header">
        <h2 id="inv-modal-title" class="modal__title">Agregar a casa</h2>
        <button class="icon-btn" data-close aria-label="Cerrar">${ICONS.close}</button>
      </header>

      <div class="modal__body">
        <div class="modal__preview">
          <div class="modal__preview-tile" id="inv-preview-tile"><span id="inv-preview-emoji">📦</span></div>
          <div class="modal__preview-hint" id="inv-preview-hint">¿Qué tenés?</div>
        </div>

        <label class="field">
          <span class="field__label">¿Qué hay en casa? <b class="req">*</b></span>
          <input id="inv-name" class="field__input" type="text" placeholder="Arroz, aceite, papel higiénico…" maxlength="60" autocomplete="off">
        </label>

        <div class="field">
          <span class="field__label">¿Cómo estás de eso?</span>
          <div class="prio-seg" role="radiogroup" aria-label="Estado">
            <button type="button" class="inv-seg inv-seg--tengo"   data-status="tengo"   role="radio">✅ Tengo</button>
            <button type="button" class="inv-seg inv-seg--poco"    data-status="poco"    role="radio">🟡 Poco</button>
            <button type="button" class="inv-seg inv-seg--agotado" data-status="agotado" role="radio">🔴 Se acabó</button>
          </div>
        </div>

        <div class="field">
          <span class="field__label">Categoría</span>
          <div class="cat-grid" id="inv-cats"></div>
        </div>
      </div>

      <footer class="modal__footer">
        <button class="btn btn--ghost btn--danger" id="inv-delete" hidden aria-label="Eliminar">${ICONS.trash}</button>
        <button class="btn btn--ghost" data-close>Cancelar</button>
        <button class="btn btn--primary" id="inv-save">${ICONS.check} Guardar</button>
      </footer>
    </div>`;
  document.body.appendChild(modal);

  $('#inv-cats', modal).innerHTML = Object.entries(CATEGORIES).map(([id, c]) =>
    `<button type="button" class="cat-chip" data-cat="${id}" style="--chip-hue:${c.hue}"><span class="cat-chip__emoji">${c.emoji}</span>${c.label}</button>`
  ).join('');

  modal.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal(); });

  $('#inv-name', modal).addEventListener('input', updatePreview);
  $('#inv-name', modal).addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });

  $('#inv-cats', modal).addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    mState.category = chip.dataset.cat;
    syncCategory(); updatePreview();
  });

  modal.querySelectorAll('.inv-seg').forEach((b) =>
    b.addEventListener('click', () => { mState.status = b.dataset.status; syncStatus(); })
  );

  $('#inv-save', modal).addEventListener('click', save);
  $('#inv-delete', modal).addEventListener('click', async () => {
    if (!mState.editingId) return;
    if (!confirm(`¿Quitar "${$('#inv-name', modal).value.trim()}" del inventario?`)) return;
    await deps.deleteInventoryItem(mState.editingId);
    toast('Quitado del inventario', { emoji: '🗑️' });
    closeModal();
  });
}

function syncCategory() {
  modal.querySelectorAll('.cat-chip').forEach((c) => c.classList.toggle('is-active', c.dataset.cat === mState.category));
}
function syncStatus() {
  modal.querySelectorAll('.inv-seg').forEach((b) => b.classList.toggle('is-active', b.dataset.status === mState.status));
}
function updatePreview() {
  const name = $('#inv-name', modal).value.trim();
  $('#inv-preview-emoji', modal).textContent = productVisual(name, mState.category);
  $('#inv-preview-tile', modal).style.background = productGradient(name || mState.category, mState.category);
  $('#inv-preview-hint', modal).textContent = name || '¿Qué tenés?';
}

async function save() {
  const name = $('#inv-name', modal).value.trim();
  if (!name) { toast('Escribí qué es', { emoji: '✏️' }); $('#inv-name', modal).focus(); return; }
  const btn = $('#inv-save', modal);
  btn.disabled = true;
  const item = {
    id: mState.editingId || uid(),
    name,
    category: mState.category,
    status: mState.status,
    updatedBy: deps.getMe(),
  };
  try {
    await deps.saveInventoryItem(item);
    toast(`<b>${escapeHtml(name)}</b> en el inventario`, { emoji: '📦', type: 'success' });
    closeModal();
  } catch (err) {
    console.error(err);
    toast('No se pudo guardar', { emoji: '⚠️' });
  } finally {
    btn.disabled = false;
  }
}

export function openInventoryModal(prefill = null) {
  mState = { category: 'despensa', status: 'tengo', editingId: null };
  $('#inv-name', modal).value = '';
  $('#inv-modal-title', modal).textContent = 'Agregar a casa';
  $('#inv-delete', modal).hidden = true;

  if (prefill && typeof prefill === 'object') {
    mState.category = prefill.category || 'despensa';
    mState.status = prefill.status || 'tengo';
    mState.editingId = prefill.id;
    $('#inv-name', modal).value = prefill.name;
    $('#inv-modal-title', modal).textContent = 'Editar ítem';
    $('#inv-delete', modal).hidden = false;
  }

  syncCategory(); syncStatus(); updatePreview();
  modal.classList.add('is-open');
  document.body.classList.add('no-scroll');
  setTimeout(() => $('#inv-name', modal).focus(), 350);
}

function closeModal() {
  modal.classList.remove('is-open');
  document.body.classList.remove('no-scroll');
}

/* ============================================================
   Inicialización + acciones de la vista
   ============================================================ */
export function initInventory(dependencies) {
  deps = dependencies;
  buildModal();

  // Buscador instantáneo
  $('#inv-search').addEventListener('input', debounce((e) => { filter.text = e.target.value; renderInventory(); }, 120));

  // Filtros de estado
  $('#inv-filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const s = chip.dataset.fstatus;
    filter.status = s || null;
    renderInventory();
  });

  // Acciones sobre cada ítem
  $('#inv-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    const card = e.target.closest('.inv-card');
    if (!card) return;
    const id = card.dataset.id;
    const item = deps.getInventory().find((i) => i.id === id);
    if (!item) return;

    if (!btn) { openInventoryModal(item); return; }   // tocar la tarjeta = editar

    if (btn.dataset.action === 'cycle') {
      const status = nextStatus(item.status);
      await deps.saveInventoryItem({ ...item, status, updatedBy: deps.getMe() });
      return;
    }
    if (btn.dataset.action === 'to-shop') {
      await deps.addToShopping(item);
      toast(`<b>${escapeHtml(item.name)}</b> agregado a Compras 🛒`, { emoji: '🛒', type: 'success' });
      return;
    }
  });
}
