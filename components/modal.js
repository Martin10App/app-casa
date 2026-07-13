/* ============================================================
   components/modal.js — Modal "Agregar / editar elemento"
   ------------------------------------------------------------
   Un solo modal reutilizable: categoría, nombre (con imagen
   automática del producto), detalle, prioridad, cantidad,
   monto (gastos), fecha (recordatorios) y foto opcional.
   ============================================================ */

import { $, escapeHtml, uid, compressImage } from '../utils/helpers.js';
import { CATEGORIES, ICONS, productVisual, productGradient } from '../utils/images.js';
import { toast } from './toast.js';

let overlay = null;
let onSaveCb = null;
let onDeleteCb = null;
let state = null;

/* ---------- Construcción (una sola vez) ---------- */
function build() {
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal__handle"></div>
      <header class="modal__header">
        <h2 id="modal-title" class="modal__title">Agregar a la casa</h2>
        <button class="icon-btn modal__close" aria-label="Cerrar">${ICONS.close}</button>
      </header>

      <div class="modal__body">
        <!-- Vista previa automática del producto -->
        <div class="modal__preview">
          <div class="modal__preview-tile" id="m-preview-tile">
            <span id="m-preview-emoji">🏠</span>
            <img id="m-preview-photo" alt="" hidden>
          </div>
          <div class="modal__preview-hint" id="m-preview-hint">La imagen aparece sola al escribir</div>
        </div>

        <!-- Nombre -->
        <label class="field">
          <span class="field__label">¿Qué necesita la casa? <b class="req">*</b></span>
          <input id="m-name" class="field__input" type="text" placeholder="Azúcar, papel higiénico, regalo para Alma…"
                 maxlength="80" autocomplete="off" enterkeyhint="done">
        </label>

        <!-- Categoría -->
        <div class="field">
          <span class="field__label">Categoría</span>
          <div class="cat-grid" id="m-cats"></div>
        </div>

        <!-- Detalle -->
        <label class="field">
          <span class="field__label">Detalle <small>(opcional)</small></span>
          <input id="m-detail" class="field__input" type="text" placeholder="Marca, tamaño, dónde comprarlo…" maxlength="140">
        </label>

        <div class="field-row">
          <!-- Cantidad -->
          <div class="field field--qty">
            <span class="field__label">Cantidad</span>
            <div class="qty-stepper">
              <button type="button" class="qty-btn" id="m-qty-minus" aria-label="Menos">−</button>
              <span id="m-qty" class="qty-value">1</span>
              <button type="button" class="qty-btn" id="m-qty-plus" aria-label="Más">+</button>
            </div>
          </div>

          <!-- Prioridad -->
          <div class="field field--grow">
            <span class="field__label">Prioridad</span>
            <div class="prio-seg" role="radiogroup" aria-label="Prioridad">
              <button type="button" class="prio-btn prio-btn--baja"  data-prio="baja"  role="radio">Baja</button>
              <button type="button" class="prio-btn prio-btn--media" data-prio="media" role="radio">Media</button>
              <button type="button" class="prio-btn prio-btn--alta"  data-prio="alta"  role="radio">Alta</button>
            </div>
          </div>
        </div>

        <!-- Monto: solo para Gastos -->
        <label class="field" id="m-amount-field" hidden>
          <span class="field__label">Monto del gasto</span>
          <div class="field__prefix-wrap">
            <span class="field__prefix">$</span>
            <input id="m-amount" class="field__input field__input--prefixed" type="number" inputmode="numeric" min="0" placeholder="0">
          </div>
        </label>

        <!-- Fecha: solo para Recordatorios -->
        <label class="field" id="m-date-field" hidden>
          <span class="field__label">Fecha del recordatorio</span>
          <input id="m-date" class="field__input" type="date">
        </label>

        <!-- Foto -->
        <div class="field">
          <span class="field__label">Foto <small>(opcional — ej: la canilla rota)</small></span>
          <label class="photo-drop" id="m-photo-drop">
            ${ICONS.camera}
            <span id="m-photo-label">Tocar para sacar o elegir una foto</span>
            <input id="m-photo" type="file" accept="image/*" hidden>
          </label>
        </div>
      </div>

      <footer class="modal__footer">
        <button class="btn btn--ghost btn--danger" id="m-delete" hidden aria-label="Eliminar elemento">${ICONS.trash}</button>
        <button class="btn btn--ghost" id="m-cancel">Cancelar</button>
        <button class="btn btn--primary" id="m-save">${ICONS.check} Guardar</button>
      </footer>
    </div>`;
  document.body.appendChild(overlay);

  // Chips de categorías
  const catGrid = $('#m-cats', overlay);
  catGrid.innerHTML = Object.entries(CATEGORIES).map(([id, c]) => `
    <button type="button" class="cat-chip" data-cat="${id}" style="--chip-hue:${c.hue}">
      <span class="cat-chip__emoji">${c.emoji}</span>${c.label}
    </button>`).join('');

  /* ---------- Eventos ---------- */
  $('.modal__close', overlay).addEventListener('click', close);
  $('#m-cancel', overlay).addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) close();
  });

  catGrid.addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    state.category = chip.dataset.cat;
    syncCategory();
    updatePreview();
  });

  $('#m-name', overlay).addEventListener('input', updatePreview);

  $('#m-qty-minus', overlay).addEventListener('click', () => { state.qty = Math.max(1, state.qty - 1); syncQty(); });
  $('#m-qty-plus',  overlay).addEventListener('click', () => { state.qty = Math.min(99, state.qty + 1); syncQty(); });

  overlay.querySelectorAll('.prio-btn').forEach((b) =>
    b.addEventListener('click', () => { state.priority = b.dataset.prio; syncPriority(); })
  );

  $('#m-photo', overlay).addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      $('#m-photo-label', overlay).textContent = 'Comprimiendo…';
      state.photo = await compressImage(file);
      $('#m-photo-label', overlay).textContent = 'Foto lista ✓ (tocar para cambiar)';
      updatePreview();
    } catch {
      toast('No se pudo procesar la imagen', { emoji: '⚠️' });
      $('#m-photo-label', overlay).textContent = 'Tocar para sacar o elegir una foto';
    }
  });

  $('#m-save', overlay).addEventListener('click', save);
  $('#m-name', overlay).addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });

  $('#m-delete', overlay).addEventListener('click', async () => {
    if (!state.editingId || !onDeleteCb) return;
    const name = $('#m-name', overlay).value.trim();
    if (!confirm(`¿Eliminar "${name}" definitivamente?`)) return;
    await onDeleteCb(state.editingId);
    close();
  });
}

/* ---------- Sincronización visual del estado ---------- */
function syncCategory() {
  overlay.querySelectorAll('.cat-chip').forEach((c) =>
    c.classList.toggle('is-active', c.dataset.cat === state.category)
  );
  $('#m-amount-field', overlay).hidden = state.category !== 'gastos';
  $('#m-date-field', overlay).hidden   = state.category !== 'recordatorios';
}

function syncQty()      { $('#m-qty', overlay).textContent = state.qty; }
function syncPriority() {
  overlay.querySelectorAll('.prio-btn').forEach((b) => {
    const active = b.dataset.prio === state.priority;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-checked', active);
  });
}

/** Imagen automática: emoji del producto o foto subida */
function updatePreview() {
  const name = $('#m-name', overlay).value.trim();
  const tile = $('#m-preview-tile', overlay);
  const emojiEl = $('#m-preview-emoji', overlay);
  const photoEl = $('#m-preview-photo', overlay);

  if (state.photo) {
    photoEl.src = state.photo;
    photoEl.hidden = false;
    emojiEl.hidden = true;
    tile.style.background = 'none';
  } else {
    photoEl.hidden = true;
    emojiEl.hidden = false;
    emojiEl.textContent = productVisual(name, state.category);
    tile.style.background = productGradient(name || state.category, state.category);
  }
  $('#m-preview-hint', overlay).textContent = name
    ? (CATEGORIES[state.category]?.label || '')
    : 'La imagen aparece sola al escribir';
}

/* ---------- Guardar ---------- */
async function save() {
  const name = $('#m-name', overlay).value.trim();
  if (!name) {
    toast('Escribí qué necesita la casa', { emoji: '✏️' });
    $('#m-name', overlay).focus();
    return;
  }
  const btn = $('#m-save', overlay);
  btn.disabled = true;

  const item = {
    id: state.editingId || uid(),
    name,
    detail: $('#m-detail', overlay).value.trim(),
    category: state.category,
    priority: state.priority,
    qty: state.qty,
    amount: state.category === 'gastos' ? (parseFloat($('#m-amount', overlay).value) || null) : null,
    dueDate: state.category === 'recordatorios' ? ($('#m-date', overlay).value || null) : null,
    photo: state.photo || null,
    status: 'pendiente',
    completedBy: null,
    completedAt: null,
  };

  try {
    await onSaveCb(item, !!state.editingId);
    close();
  } catch (err) {
    console.error(err);
    toast('No se pudo guardar. Probá de nuevo.', { emoji: '⚠️' });
  } finally {
    btn.disabled = false;
  }
}

/* ---------- API pública ---------- */

/** Inicializa el modal. onSave(item, isEdit) persiste; onDelete(id) elimina. */
export function initModal(onSave, onDelete = null) {
  onSaveCb = onSave;
  onDeleteCb = onDelete;
  if (!overlay) build();
}

/** Abre el modal. prefill puede ser una categoría (string) o un ítem a editar. */
export function openModal(prefill = null) {
  state = {
    category: 'compras',
    priority: 'media',
    qty: 1,
    photo: null,
    editingId: null,
  };

  // Limpiar campos
  $('#m-name', overlay).value = '';
  $('#m-detail', overlay).value = '';
  $('#m-amount', overlay).value = '';
  $('#m-date', overlay).value = '';
  $('#m-photo', overlay).value = '';
  $('#m-photo-label', overlay).textContent = 'Tocar para sacar o elegir una foto';
  $('.modal__title', overlay).textContent = 'Agregar a la casa';

  if (typeof prefill === 'string' && CATEGORIES[prefill]) {
    state.category = prefill;
  } else if (prefill && typeof prefill === 'object') {
    // Modo edición
    state.category = prefill.category;
    state.priority = prefill.priority;
    state.qty = prefill.qty || 1;
    state.photo = prefill.photo || null;
    state.editingId = prefill.id;
    $('#m-name', overlay).value = prefill.name;
    $('#m-detail', overlay).value = prefill.detail || '';
    if (prefill.amount) $('#m-amount', overlay).value = prefill.amount;
    if (prefill.dueDate) $('#m-date', overlay).value = prefill.dueDate;
    $('.modal__title', overlay).textContent = 'Editar elemento';
  }

  $('#m-delete', overlay).hidden = !state.editingId;

  syncCategory();
  syncQty();
  syncPriority();
  updatePreview();

  overlay.classList.add('is-open');
  document.body.classList.add('no-scroll');
  setTimeout(() => $('#m-name', overlay).focus(), 350);
}

export function close() {
  overlay.classList.remove('is-open');
  document.body.classList.remove('no-scroll');
}
