/* ============================================================
   components/boleta.js — Escanear boleta del súper 📸
   ------------------------------------------------------------
   Sacás foto del ticket → la IA lo lee → revisás lo que entendió
   → y se reparte solo:
     · la compra completa (con desglose) → colección "compras"
     · cada producto → al inventario (queda "tengo")
     · cada precio → a la libreta de precios, con el lugar
     · el total → a Gastos
   Ese reparto es lo que hace que la app aprenda dónde conviene
   comprar cada cosa.
   ============================================================ */

import { $, $$, escapeHtml, uid, normalize, fmtMoney, fmtDate, compressImage } from '../utils/helpers.js';
import { ICONS, CATEGORIES, productVisual, productGradient, productGradientDark } from '../utils/images.js';
import { toast } from './toast.js';

const BOLETA_API = 'https://app-casa-omega.vercel.app/api/boleta';

/* deps: { getMe, getPrices, getInventory, savePrice, saveInventoryItem,
           saveCompra, addGasto, isDark } */
let deps = null;
let overlay = null;
let lectura = null;   // { store, date, total, items:[...] }

/* ============================================================
   Overlay
   ============================================================ */
function build() {
  overlay = document.createElement('div');
  overlay.className = 'voice-overlay';   // reutilizamos el estilo de hoja
  overlay.id = 'boleta-overlay';
  overlay.innerHTML = `
    <div class="voice-sheet boleta-sheet" role="dialog" aria-modal="true" aria-label="Escanear boleta">
      <button class="icon-btn voice-close" aria-label="Cerrar">${ICONS.close}</button>

      <!-- Elegir foto -->
      <div class="voice-stage" id="bol-start">
        <span class="boleta-emoji">🧾</span>
        <p class="voice-hint">Sacale una foto a la boleta</p>
        <p class="voice-sub">Que se vean los productos y el total. Después revisás lo que entendió antes de guardar.</p>
        <button class="btn btn--primary" id="bol-pick">${ICONS.camera} Sacar / elegir foto</button>
      </div>

      <!-- Procesando -->
      <div class="voice-stage" id="bol-processing" hidden>
        <div class="voice-spinner"></div>
        <p class="voice-hint">Leyendo la boleta…</p>
        <p class="voice-sub">Puede tardar unos segundos</p>
      </div>

      <!-- Revisión -->
      <div class="voice-stage boleta-review" id="bol-review" hidden>
        <h2 class="voice-review__title">Esto leí</h2>
        <div class="boleta-head">
          <label class="boleta-field">
            <span>Lugar</span>
            <input id="bol-store" class="field__input" type="text" placeholder="Macromercado" maxlength="40">
          </label>
          <label class="boleta-field boleta-field--sm">
            <span>Fecha</span>
            <input id="bol-date" class="field__input" type="date">
          </label>
          <label class="boleta-field boleta-field--sm">
            <span>Total</span>
            <input id="bol-total" class="field__input" type="number" step="any" min="0">
          </label>
        </div>
        <div class="boleta-items" id="bol-items"></div>
        <p class="boleta-aviso" id="bol-aviso"></p>
        <div class="voice-actions">
          <button class="btn btn--ghost" id="bol-retry">${ICONS.camera} Otra foto</button>
          <button class="btn btn--primary" id="bol-save">Guardar compra</button>
        </div>
      </div>

      <!-- Error -->
      <div class="voice-stage" id="bol-error" hidden>
        <span class="voice-error__emoji">😕</span>
        <p class="voice-hint" id="bol-error-msg">No pude leer la boleta.</p>
        <button class="btn btn--primary" id="bol-error-retry">${ICONS.camera} Probar otra foto</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  $('.voice-close', overlay).addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  $('#bol-pick', overlay).addEventListener('click', pickPhoto);
  $('#bol-retry', overlay).addEventListener('click', pickPhoto);
  $('#bol-error-retry', overlay).addEventListener('click', pickPhoto);
  $('#bol-save', overlay).addEventListener('click', guardar);

  // Borrar un renglón de la revisión
  $('#bol-items', overlay).addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (!del) return;
    lectura.items.splice(+del.dataset.del, 1);
    renderReview();
  });
}

function stage(id) {
  ['bol-start', 'bol-processing', 'bol-review', 'bol-error']
    .forEach((s) => { $('#' + s, overlay).hidden = (s !== id); });
}

/* ============================================================
   Foto → IA
   ============================================================ */
function pickPhoto() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  // Sin 'capture': así el celu te deja elegir entre sacar foto o buscar en la galería
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    stage('bol-processing');
    try {
      // Comprimimos pero dejamos buena resolución: la letra del ticket es chica
      const dataUrl = await compressImage(file, 1600, 0.85);
      const b64 = dataUrl.split(',')[1];
      const resp = await fetch(BOLETA_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: b64, mime: 'image/jpeg' }),
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      if (!data.items?.length) {
        showError('No encontré productos en la foto. Probá que se vea derecha, con buena luz y sin sombras.');
        return;
      }
      lectura = data;
      renderReview();
    } catch (err) {
      console.error('[boleta]', err);
      showError('No pude leer la boleta. Fijate que tengas internet y probá otra foto.');
    }
  };
  input.click();
}

/* ============================================================
   Revisión
   ============================================================ */
function renderReview() {
  $('#bol-store', overlay).value = lectura.store || '';
  $('#bol-date', overlay).value = lectura.date || new Date().toISOString().slice(0, 10);
  $('#bol-total', overlay).value = lectura.total || '';

  $('#bol-items', overlay).innerHTML = lectura.items.map((it, i) => {
    const cat = CATEGORIES[it.category] || CATEGORIES.otros;
    const grad = deps.isDark() ? productGradientDark(it.name, it.category) : productGradient(it.name, it.category);
    // ¿Este precio mejora lo que ya teníamos anotado?
    const comp = compararConHistorial(it.name, it.unitPrice, lectura.store);
    return `
      <div class="boleta-item" data-i="${i}">
        <span class="boleta-item__tile" style="background:${grad}">${productVisual(it.name, it.category)}</span>
        <span class="boleta-item__body">
          <span class="boleta-item__name">${escapeHtml(it.name)}${it.qty > 1 ? ` ×${it.qty}` : ''}</span>
          <span class="boleta-item__raw">${escapeHtml(it.raw || '')}</span>
          <span class="boleta-item__cat">${cat.emoji} ${cat.label}${comp ? ` · <b class="${comp.cls}">${comp.txt}</b>` : ''}</span>
        </span>
        <span class="boleta-item__price">${fmtMoney(it.unitPrice)}</span>
        <button class="boleta-item__del" data-del="${i}" aria-label="Quitar">${ICONS.close}</button>
      </div>`;
  }).join('');

  const n = lectura.items.length;
  $('#bol-aviso', overlay).innerHTML =
    `Se van a cargar <b>${n} producto${n === 1 ? '' : 's'}</b> al inventario, sus precios a la libreta, y el total a Gastos. Si algo está mal, quitalo con la ✕.`;
  stage('bol-review');
}

/** Compara el precio nuevo con lo que ya sabíamos de ese producto */
function compararConHistorial(name, price, store) {
  if (!price) return null;
  const prod = deps.getPrices().find((p) => normalize(p.name) === normalize(name));
  if (!prod || !prod.entries?.length) return null;
  const otros = prod.entries.filter((e) => normalize(e.store) !== normalize(store || ''));
  if (!otros.length) return null;
  const barato = otros.reduce((m, e) => (m == null || e.price < m.price ? e : m), null);
  if (price < barato.price) return { cls: 'is-win', txt: `¡más barato que en ${barato.store}!` };
  if (price > barato.price) return { cls: 'is-lose', txt: `en ${barato.store} sale ${fmtMoney(barato.price)}` };
  return null;
}

/* ============================================================
   Guardar → repartir a todos lados
   ============================================================ */
async function guardar() {
  const store = $('#bol-store', overlay).value.trim();
  const date = $('#bol-date', overlay).value || new Date().toISOString().slice(0, 10);
  const total = parseFloat($('#bol-total', overlay).value) || 0;
  if (!store) { toast('¿En qué lugar compraste?', { emoji: '🏪' }); $('#bol-store', overlay).focus(); return; }
  if (!lectura.items.length) { toast('No quedó ningún producto', { emoji: '🤷' }); return; }

  const btn = $('#bol-save', overlay);
  btn.disabled = true;
  btn.textContent = 'Guardando…';

  try {
    const me = deps.getMe();

    // 1) La compra con su desglose
    await deps.saveCompra({
      id: uid(), store, date, total,
      items: lectura.items,
      createdBy: me,
    });

    // 2) Cada producto → inventario (queda "tengo")
    const inv = deps.getInventory();
    for (const it of lectura.items) {
      const existente = inv.find((i) => normalize(i.name) === normalize(it.name));
      await deps.saveInventoryItem({
        id: existente?.id || uid(),
        name: existente?.name || it.name,
        category: it.category,
        status: 'tengo',
        updatedBy: me,
      });
    }

    // 3) Cada precio → libreta de precios (así aprende dónde conviene)
    const precios = deps.getPrices();
    for (const it of lectura.items) {
      if (!it.unitPrice) continue;
      const existente = precios.find((p) => normalize(p.name) === normalize(it.name));
      const prod = existente ? structuredClone(existente) : { id: uid(), name: it.name, entries: [] };
      prod.entries = prod.entries || [];
      const idx = prod.entries.findIndex((e) => normalize(e.store) === normalize(store));
      const entry = { id: idx >= 0 ? prod.entries[idx].id : uid(), store, price: it.unitPrice, date: Date.now(), by: me };
      if (idx >= 0) prod.entries[idx] = entry; else prod.entries.push(entry);
      await deps.savePrice(prod);
    }

    // 4) El total → Gastos
    if (total > 0) await deps.addGasto(store, total, date, lectura.items.length);

    toast(`Compra en <b>${escapeHtml(store)}</b> guardada · ${lectura.items.length} productos 🧾`, { emoji: '✅', type: 'success', duration: 5000 });
    close();
  } catch (err) {
    console.error('[boleta] guardar:', err);
    toast('No se pudo guardar la compra', { emoji: '⚠️' });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar compra';
  }
}

function showError(msg) {
  $('#bol-error-msg', overlay).textContent = msg;
  stage('bol-error');
}

/* ============================================================
   API pública
   ============================================================ */
export function initBoleta(dependencies) {
  deps = dependencies;
  if (!overlay) build();
}

export function openBoleta() {
  lectura = null;
  overlay.classList.add('is-open');
  document.body.classList.add('no-scroll');
  stage('bol-start');
}

function close() {
  overlay.classList.remove('is-open');
  document.body.classList.remove('no-scroll');
}
