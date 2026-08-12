import { $, escapeHtml, fmtMoney, uid } from '../utils/helpers.js';
import { ICONS } from '../utils/images.js';
import { toast } from './toast.js';
import { localISODate } from '../utils/date.js';
import {
  PAYMENT_METHODS,
  EXPENSE_CATEGORIES,
  billingCycleFor,
  shiftBillingCycle,
  analyzeExpenses,
} from '../utils/expenses.mjs';

let deps;
let cycle = billingCycleFor();
let manualOverlay;

const monthFmt = new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'short' });
const numberFmt = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 });

function dateAtNoon(iso) { return new Date(`${iso}T12:00:00`); }
function cycleLabel(value) { return `${monthFmt.format(dateAtNoon(value.start))} – ${monthFmt.format(dateAtNoon(value.end))}`; }
function categoryLabel(key) { return EXPENSE_CATEGORIES[key] || 'Otros'; }
function paymentLabel(key) { return PAYMENT_METHODS[key]?.short || PAYMENT_METHODS.unknown.short; }

function breakdown(title, rows, labelFor, total, emptyText) {
  if (!rows.length) return `<section class="expense-breakdown"><h4>${title}</h4><p class="expense-empty">${emptyText}</p></section>`;
  const max = Math.max(...rows.map((row) => row.total), 1);
  return `<section class="expense-breakdown">
    <h4>${title}</h4>
    ${rows.slice(0, 8).map((row) => `<div class="expense-bar-row">
      <div class="expense-bar-row__labels"><span>${escapeHtml(labelFor(row.key))}</span><b>${fmtMoney(row.total)}</b></div>
      <div class="expense-bar" role="img" aria-label="${escapeHtml(labelFor(row.key))}: ${fmtMoney(row.total)}"><span style="width:${Math.max(3, row.total / max * 100)}%"></span></div>
      <small>${total ? Math.round(row.total / total * 100) : 0}% del período</small>
    </div>`).join('')}
  </section>`;
}

export function getExpenseCycle() { return cycle; }

export function renderExpenseDashboard() {
  const host = $('#expense-dashboard');
  if (!host || !deps) return;
  const report = analyzeExpenses(deps.getPurchases(), cycle);
  const current = billingCycleFor();
  const nextDisabled = cycle.start >= current.start;
  const master = report.payments.find((row) => row.key === 'master_brou')?.total || 0;
  const outsideCredit = report.total - master;

  host.innerHTML = `
    <section class="expense-summary">
      <div class="expense-cycle-nav">
        <button class="icon-btn" id="expense-prev" aria-label="Ver período anterior">${ICONS.back}</button>
        <div><small>Período de la tarjeta</small><strong>${cycleLabel(cycle)}</strong></div>
        <button class="icon-btn expense-next" id="expense-next" aria-label="Ver período siguiente" ${nextDisabled ? 'disabled' : ''}>${ICONS.back}</button>
      </div>
      <div class="expense-total"><span>Total del período</span><strong>${fmtMoney(report.total)}</strong><small>${report.movements.length} movimiento${report.movements.length === 1 ? '' : 's'}</small></div>
      <div class="expense-payment-cards">
        <div class="expense-payment-card expense-payment-card--master"><span>Master BROU</span><b>${fmtMoney(master)}</b><small>cierre 23</small></div>
        <div class="expense-payment-card"><span>Otros medios</span><b>${fmtMoney(outsideCredit)}</b><small>débito, efectivo y más</small></div>
      </div>
    </section>
    <details class="expense-analysis" ${report.movements.length ? 'open' : ''}>
      <summary>Ver análisis del período</summary>
      <div class="expense-analysis__body">
        ${breakdown('Por forma de pago', report.payments, paymentLabel, report.total, 'Todavía no hay formas de pago registradas.')}
        ${breakdown('Dónde se fue la plata', report.merchants, (key) => key, report.total, 'Todavía no hay lugares registrados.')}
        ${breakdown('Por categoría', report.categories, categoryLabel, report.total, 'Todavía no hay categorías registradas.')}
        <section class="expense-breakdown">
          <h4>Qué compraron</h4>
          ${report.products.length ? `<div class="expense-products">${report.products.slice(0, 12).map((item) => `<div><span>${escapeHtml(item.name)}</span><b>${numberFmt.format(item.quantity)} ${escapeHtml(item.unit)} · ${fmtMoney(item.spent)}</b></div>`).join('')}</div>` : '<p class="expense-empty">Los productos aparecerán al escanear boletas o agregar cantidades a mano.</p>'}
        </section>
      </div>
    </details>`;

  $('#expense-prev').addEventListener('click', () => { cycle = shiftBillingCycle(cycle, -1); deps.render(); });
  $('#expense-next').addEventListener('click', () => { if (!nextDisabled) { cycle = shiftBillingCycle(cycle, 1); deps.render(); } });
}

function buildManualOverlay() {
  manualOverlay = document.createElement('div');
  manualOverlay.className = 'modal-overlay';
  manualOverlay.id = 'expense-manual-overlay';
  manualOverlay.innerHTML = `<form class="modal expense-manual" id="expense-manual-form" role="dialog" aria-modal="true" aria-labelledby="expense-manual-title">
    <div class="modal__handle"></div>
    <header class="modal__header"><h2 class="modal__title" id="expense-manual-title">Anotar un gasto</h2><button type="button" class="icon-btn" id="expense-manual-close" aria-label="Cerrar">${ICONS.close}</button></header>
    <div class="modal__body">
      <label class="field"><span class="field__label">Lugar</span><input class="field__input" id="expense-store" required maxlength="60" placeholder="Ej. Leñería, estación, feria"></label>
      <label class="field"><span class="field__label">Qué compraste</span><input class="field__input" id="expense-concept" required maxlength="80" placeholder="Ej. Leña"></label>
      <div class="field-row expense-field-row">
        <label class="field field--grow"><span class="field__label">Monto</span><span class="field__prefix-wrap"><span class="field__prefix">$</span><input class="field__input field__input--prefixed" id="expense-amount" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="500"></span></label>
        <label class="field field--grow"><span class="field__label">Fecha</span><input class="field__input" id="expense-date" type="date" required></label>
      </div>
      <label class="field"><span class="field__label">Forma de pago</span><select class="field__input" id="expense-payment">${Object.entries(PAYMENT_METHODS).filter(([key]) => key !== 'unknown').map(([key, item]) => `<option value="${key}">${item.label}</option>`).join('')}</select></label>
      <label class="field"><span class="field__label">Categoría</span><select class="field__input" id="expense-category">${Object.entries(EXPENSE_CATEGORIES).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label>
      <fieldset class="expense-optional"><legend>Cantidad (opcional)</legend><div class="field-row expense-field-row">
        <label class="field field--grow"><span class="field__label">Cantidad</span><input class="field__input" id="expense-quantity" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Ej. 3"></label>
        <label class="field field--grow"><span class="field__label">Unidad</span><select class="field__input" id="expense-unit"><option value="unidad">unidades</option><option value="kg">kg</option><option value="l">litros</option><option value="m3">m³</option></select></label>
      </div></fieldset>
    </div>
    <footer class="modal__footer"><button type="button" class="btn btn--ghost" id="expense-manual-cancel">Cancelar</button><button class="btn btn--primary" id="expense-manual-save">Guardar gasto</button></footer>
  </form>`;
  document.body.appendChild(manualOverlay);
  $('#expense-manual-close').addEventListener('click', closeManualExpense);
  $('#expense-manual-cancel').addEventListener('click', closeManualExpense);
  manualOverlay.addEventListener('click', (event) => { if (event.target === manualOverlay) closeManualExpense(); });
  $('#expense-manual-form').addEventListener('submit', saveManualExpense);
}

export function openManualExpense() {
  if (!manualOverlay) buildManualOverlay();
  $('#expense-manual-form').reset();
  $('#expense-date').value = localISODate();
  $('#expense-payment').value = 'master_brou';
  $('#expense-category').value = 'otros';
  manualOverlay.hidden = false;
  requestAnimationFrame(() => manualOverlay.classList.add('is-open'));
  document.body.classList.add('no-scroll');
  setTimeout(() => $('#expense-store').focus(), 250);
}

function closeManualExpense() {
  manualOverlay?.classList.remove('is-open');
  document.body.classList.remove('no-scroll');
  setTimeout(() => { if (manualOverlay) manualOverlay.hidden = true; }, 250);
}

async function saveManualExpense(event) {
  event.preventDefault();
  const store = $('#expense-store').value.trim();
  const concept = $('#expense-concept').value.trim();
  const total = Number($('#expense-amount').value);
  const date = $('#expense-date').value;
  const paymentMethod = $('#expense-payment').value;
  const expenseCategory = $('#expense-category').value;
  const quantity = Number($('#expense-quantity').value) || 1;
  const unit = $('#expense-quantity').value ? $('#expense-unit').value : 'unidad';
  if (!store || !concept || !date || !(total > 0)) return;

  const button = $('#expense-manual-save');
  button.disabled = true;
  button.textContent = 'Guardando…';
  try {
    const id = `m_${uid()}`;
    const me = deps.getMe();
    const item = { name: concept, qty: quantity, purchaseQuantity: quantity, purchaseUnit: unit, unitPrice: total / quantity, lineTotal: total, category: 'otros', raw: 'Carga manual' };
    await deps.saveReceiptBundle({
      purchase: { id, source: 'manual', store, date, total, items: [item], paymentMethod, expenseCategory, createdBy: me },
      inventory: [], prices: [],
      expense: { id: `receipt_${id}`, name: concept, detail: `${store} · carga manual`, category: 'gastos', priority: 'media', qty: 1, amount: total, dueDate: date, photo: null, status: 'completado', completedBy: me, completedAt: Date.now(), createdBy: me, sourceReceiptId: id },
    });
    toast(`<b>${escapeHtml(concept)}</b> guardado en ${escapeHtml(store)}`, { emoji: '✅', type: 'success' });
    closeManualExpense();
  } catch (error) {
    console.error('[gasto manual]', error);
    toast('No se pudo guardar el gasto', { emoji: '⚠️' });
  } finally {
    button.disabled = false;
    button.textContent = 'Guardar gasto';
  }
}

export function initExpenses(dependencies) { deps = dependencies; }
