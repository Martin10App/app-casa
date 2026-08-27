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
  normalizeExpenseBudget,
  expenseBudgetStatus,
  normalizeExpenseSettings,
  paymentMethodEntries,
  cardForPayment,
  buildInstallmentSchedule,
} from '../utils/expenses.mjs';

let deps;
let cycle = billingCycleFor();
let manualOverlay;
let budgetOverlay;
let budgetReturnFocus;

const monthFmt = new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'short' });
const numberFmt = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 });

function dateAtNoon(iso) { return new Date(`${iso}T12:00:00`); }
function cycleLabel(value) { return `${monthFmt.format(dateAtNoon(value.start))} – ${monthFmt.format(dateAtNoon(value.end))}`; }
function categoryLabel(key) { return EXPENSE_CATEGORIES[key] || 'Otros'; }
function settings() { return normalizeExpenseSettings(deps?.getExpenseSettings?.(), { legacy: Boolean(deps?.isLegacy?.()) }); }
function paymentLabel(key) { return Object.fromEntries(paymentMethodEntries(settings()))[key]?.short || PAYMENT_METHODS.unknown.short; }
function paymentOptions() { return paymentMethodEntries(settings()).filter(([key]) => key !== 'unknown').map(([key, item]) => `<option value="${key}">${escapeHtml(item.label)}</option>`).join(''); }

function budgetMessage(status) {
  if (status.key === 'green') return `Te quedan ${fmtMoney(status.remaining)} antes de entrar en amarillo.`;
  if (status.key === 'yellow') return `Te quedan ${fmtMoney(status.remaining)} antes de llegar al límite.`;
  return `Te pasaste ${fmtMoney(status.over)} del límite definido.`;
}

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
  const expenseSettings = settings();
  if (!cycle || Number(cycle.start.slice(8, 10)) !== expenseSettings.cycleStartDay) cycle = billingCycleFor(new Date(), expenseSettings.cycleStartDay);
  const report = analyzeExpenses(deps.getPurchases(), cycle, expenseSettings);
  const current = billingCycleFor(new Date(), expenseSettings.cycleStartDay);
  const nextDisabled = cycle.start >= current.start;
  const rawBudget = deps.getBudget?.();
  const hasBudget = Number(rawBudget?.ideal) > 0 && Number(rawBudget?.limit) > Number(rawBudget?.ideal);
  const budgetStatus = expenseBudgetStatus(report.total, deps.getBudget?.());
  const budget = budgetStatus.budget;

  host.innerHTML = `
    <section class="expense-summary">
      <div class="expense-cycle-nav">
        <button class="icon-btn" id="expense-prev" aria-label="Ver período anterior">${ICONS.back}</button>
        <div><small>Período de gastos</small><strong>${cycleLabel(cycle)}</strong></div>
        <button class="icon-btn expense-next" id="expense-next" aria-label="Ver período siguiente" ${nextDisabled ? 'disabled' : ''}>${ICONS.back}</button>
      </div>
      <div class="expense-total"><span>Total del período</span><strong>${fmtMoney(report.total)}</strong><small>${report.movements.length} movimiento${report.movements.length === 1 ? '' : 's'}</small></div>
      <div class="expense-payment-cards">
        ${expenseSettings.cards.length ? expenseSettings.cards.map((card) => `<div class="expense-payment-card"><span>${escapeHtml(card.name)}</span><b>${fmtMoney(report.payments.find((row) => row.key === card.id)?.total || 0)}</b><small>cierre ${card.closingDay} · vence ${card.dueDay}</small></div>`).join('') : '<div class="expense-payment-card"><span>Sin tarjetas cargadas</span><b>$ 0</b><small>Podés agregar OCA, Visa u otra</small></div>'}
        <div class="expense-payment-card"><span>Otros medios</span><b>${fmtMoney(report.payments.filter((row) => !expenseSettings.cards.some((card) => card.id === row.key)).reduce((sum, row) => sum + row.total, 0))}</b><small>débito, efectivo y más</small></div>
      </div>
    </section>
    ${hasBudget ? `<section class="expense-budget expense-budget--${budgetStatus.key}" aria-labelledby="expense-budget-title">
      <div class="expense-budget__head">
        <div>
          <small>Semáforo del período</small>
          <h3 id="expense-budget-title">${budgetStatus.label}</h3>
        </div>
        <button class="expense-budget__edit" id="expense-budget-edit" type="button">${ICONS.edit}<span>${deps.isLegacy?.() ? 'Cambiar límites' : 'Período y tarjetas'}</span></button>
      </div>
      <div class="expense-budget__track" role="progressbar" aria-label="Gasto del período respecto al límite" aria-valuemin="0" aria-valuemax="${budget.limit}" aria-valuenow="${Math.min(report.total, budget.limit)}"><span style="width:${budgetStatus.progress}%"></span></div>
      <div class="expense-budget__marks"><span>Ideal ${fmtMoney(budget.ideal)}</span><span>Límite ${fmtMoney(budget.limit)}</span></div>
      <p>${budgetMessage(budgetStatus)}</p>
    </section>` : `<section class="expense-budget" aria-labelledby="expense-budget-title"><div class="expense-budget__head"><div><small>Semáforo del período</small><h3 id="expense-budget-title">Sin límites configurados</h3></div><button class="expense-budget__edit" id="expense-budget-edit" type="button">${ICONS.edit}<span>${deps.isLegacy?.() ? 'Definir límites' : 'Período y tarjetas'}</span></button></div><p>El total empieza en cero. Podés definir un objetivo cuando quieras.</p></section>`}
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
  $('#expense-budget-edit').addEventListener('click', openBudgetSettings);
}

function buildBudgetOverlay() {
  budgetOverlay = document.createElement('div');
  budgetOverlay.className = 'modal-overlay';
  budgetOverlay.id = 'expense-budget-overlay';
  budgetOverlay.innerHTML = `<form class="modal expense-budget-modal" id="expense-budget-form" role="dialog" aria-modal="true" aria-labelledby="expense-budget-modal-title">
    <div class="modal__handle"></div>
    <header class="modal__header"><h2 class="modal__title" id="expense-budget-modal-title">${deps.isLegacy?.() ? 'Límites de gastos' : 'Período, tarjetas y límites'}</h2><button type="button" class="icon-btn" id="expense-budget-close" aria-label="Cerrar">${ICONS.close}</button></header>
    <div class="modal__body">
      <p class="expense-budget-help">${deps.isLegacy?.() ? 'Tu período histórico se mantiene del 24 al 23.' : 'Esta configuración pertenece solamente a este hogar.'}</p>
      ${deps.isLegacy?.() ? '' : `<label class="field"><span class="field__label">Día en que empieza el período</span><input class="field__input" id="expense-cycle-start" type="number" min="1" max="28" required></label>
      <fieldset class="expense-optional"><legend>Tarjetas de crédito (opcionales)</legend>
        ${[0, 1, 2].map((index) => `<div class="field-row expense-field-row"><label class="field field--grow"><span class="field__label">Tarjeta ${index + 1}</span><input class="field__input" id="expense-card-name-${index}" maxlength="30" placeholder="Ej. OCA o Visa"></label><label class="field"><span class="field__label">Cierre</span><input class="field__input" id="expense-card-close-${index}" type="number" min="1" max="28" placeholder="10"></label><label class="field"><span class="field__label">Vence</span><input class="field__input" id="expense-card-due-${index}" type="number" min="1" max="28" placeholder="25"></label></div>`).join('')}
      </fieldset>`}
      <label class="field"><span class="field__label">Gasto ideal${deps.isLegacy?.() ? '' : ' (opcional)'}</span><span class="field__prefix-wrap"><span class="field__prefix">$</span><input class="field__input field__input--prefixed" id="expense-budget-ideal" type="number" min="1" step="100" inputmode="decimal" ${deps.isLegacy?.() ? 'required' : ''}></span></label>
      <label class="field"><span class="field__label">Límite máximo${deps.isLegacy?.() ? '' : ' (opcional)'}</span><span class="field__prefix-wrap"><span class="field__prefix">$</span><input class="field__input field__input--prefixed" id="expense-budget-limit" type="number" min="1" step="100" inputmode="decimal" ${deps.isLegacy?.() ? 'required' : ''}></span></label>
      <div class="expense-budget-legend" aria-label="Cómo funciona el semáforo"><span><i class="is-green"></i>Verde hasta el ideal</span><span><i class="is-yellow"></i>Amarillo hasta el límite</span><span><i class="is-red"></i>Rojo al superarlo</span></div>
      <p class="expense-budget-error" id="expense-budget-error" role="alert"></p>
    </div>
    <footer class="modal__footer"><button type="button" class="btn btn--ghost" id="expense-budget-cancel">Cancelar</button><button class="btn btn--primary" id="expense-budget-save">Guardar configuración</button></footer>
  </form>`;
  document.body.appendChild(budgetOverlay);
  $('#expense-budget-close').addEventListener('click', closeBudgetSettings);
  $('#expense-budget-cancel').addEventListener('click', closeBudgetSettings);
  budgetOverlay.addEventListener('click', (event) => { if (event.target === budgetOverlay) closeBudgetSettings(); });
  $('#expense-budget-form').addEventListener('submit', saveBudgetSettings);
}

function openBudgetSettings(event) {
  if (!budgetOverlay) buildBudgetOverlay();
  budgetReturnFocus = event?.currentTarget || null;
  const rawBudget = deps.getBudget?.();
  const budget = rawBudget ? normalizeExpenseBudget(rawBudget) : null;
  $('#expense-budget-ideal').value = budget?.ideal || '';
  $('#expense-budget-limit').value = budget?.limit || '';
  if (!deps.isLegacy?.()) {
    const value = settings();
    $('#expense-cycle-start').value = value.cycleStartDay;
    [0, 1, 2].forEach((index) => { const card = value.cards[index]; $('#expense-card-name-'+index).value = card?.name || ''; $('#expense-card-close-'+index).value = card?.closingDay || ''; $('#expense-card-due-'+index).value = card?.dueDay || ''; });
  }
  $('#expense-budget-error').textContent = '';
  budgetOverlay.hidden = false;
  requestAnimationFrame(() => budgetOverlay.classList.add('is-open'));
  document.body.classList.add('no-scroll');
  setTimeout(() => $('#expense-budget-ideal').focus(), 250);
}

function closeBudgetSettings() {
  budgetOverlay?.classList.remove('is-open');
  document.body.classList.remove('no-scroll');
  setTimeout(() => {
    if (budgetOverlay) budgetOverlay.hidden = true;
    budgetReturnFocus?.focus();
  }, 250);
}

async function saveBudgetSettings(event) {
  event.preventDefault();
  const ideal = Number($('#expense-budget-ideal').value);
  const limit = Number($('#expense-budget-limit').value);
  const error = $('#expense-budget-error');
  if ((deps.isLegacy?.() || ideal || limit) && (!(ideal > 0) || !(limit > ideal))) {
    error.textContent = 'El límite máximo debe ser mayor que el gasto ideal.';
    return;
  }
  const button = $('#expense-budget-save');
  button.disabled = true;
  button.textContent = 'Guardando…';
  error.textContent = '';
  try {
    if (!deps.isLegacy?.()) {
      const cards = [0, 1, 2].map((index) => ({ name: $('#expense-card-name-'+index).value, closingDay: $('#expense-card-close-'+index).value, dueDay: $('#expense-card-due-'+index).value })).filter((card) => card.name.trim());
      if (cards.some((card) => !(Number(card.closingDay) >= 1 && Number(card.closingDay) <= 28 && Number(card.dueDay) >= 1 && Number(card.dueDay) <= 28))) throw new Error('fechas-tarjeta');
      await deps.saveBudget(ideal && limit ? normalizeExpenseBudget({ ideal, limit }) : null);
      await deps.saveExpenseSettings({ configured: true, cycleStartDay: Number($('#expense-cycle-start').value), cards });
      cycle = billingCycleFor(new Date(), Number($('#expense-cycle-start').value));
    } else await deps.saveBudget(normalizeExpenseBudget({ ideal, limit }));
    toast('Configuración de gastos actualizada', { emoji: '🚦', type: 'success' });
    closeBudgetSettings();
  } catch (saveError) {
    console.error('[límites de gastos]', saveError);
    error.textContent = saveError.message === 'fechas-tarjeta' ? 'Completá cierre y vencimiento (días 1 a 28) en cada tarjeta.' : 'No se pudo guardar. Probá de nuevo.';
  } finally {
    button.disabled = false;
    button.textContent = 'Guardar configuración';
  }
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
      <label class="field"><span class="field__label">Forma de pago</span><select class="field__input" id="expense-payment">${paymentOptions()}</select></label>
      <label class="field" id="expense-installments-field" hidden><span class="field__label">Cuotas</span><input class="field__input" id="expense-installments" type="number" min="1" max="60" step="1" value="1"><small id="expense-card-preview"></small></label>
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
  for (const id of ['expense-payment', 'expense-date', 'expense-amount', 'expense-installments']) $('#'+id).addEventListener('input', updateCardPreview);
}

function updateCardPreview() {
  const card = cardForPayment($('#expense-payment')?.value, settings());
  const field = $('#expense-installments-field');
  if (!field) return;
  field.hidden = !card;
  if (!card) return;
  const date = $('#expense-date').value || localISODate();
  const total = Number($('#expense-amount').value) || 0;
  const count = Number($('#expense-installments').value) || 1;
  const schedule = buildInstallmentSchedule({ purchaseDate: date, total, installments: count, card });
  $('#expense-card-preview').textContent = schedule.length ? `Primera cuota: ${schedule[0].date} · ${fmtMoney(schedule[0].amount)}. La app la contará en el mes de pago.` : '';
}

export function openManualExpense() {
  if (!manualOverlay) buildManualOverlay();
  $('#expense-manual-form').reset();
  $('#expense-date').value = localISODate();
  $('#expense-payment').innerHTML = paymentOptions();
  $('#expense-payment').value = settings().cards[0]?.id || 'debit';
  $('#expense-installments').value = '1';
  updateCardPreview();
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
  const card = cardForPayment(paymentMethod, settings());
  const installments = card ? Math.max(1, Math.min(60, Number($('#expense-installments').value) || 1)) : 1;
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
    const schedule = card ? buildInstallmentSchedule({ purchaseDate: date, total, installments, card }) : [{ number: 1, count: 1, amount: total, date }];
    const purchases = schedule.map((part, index) => ({ id: index ? `${id}_q${part.number}` : id, source: 'manual', store, date: part.date, purchaseDate: date, total: part.amount, items: index ? [] : [item], paymentMethod, expenseCategory, installmentNumber: part.number, installmentCount: part.count, createdBy: me }));
    const expenses = schedule.map((part, index) => ({ id: `receipt_${purchases[index].id}`, name: `${concept}${part.count > 1 ? ` · cuota ${part.number}/${part.count}` : ''}`, detail: `${store} · carga manual`, category: 'gastos', priority: 'media', qty: 1, amount: part.amount, dueDate: part.date, photo: null, status: 'completado', completedBy: me, completedAt: Date.now(), createdBy: me, sourceReceiptId: purchases[index].id }));
    await deps.saveReceiptBundle({
      purchase: purchases[0], additionalPurchases: purchases.slice(1),
      inventory: [], prices: [],
      expense: expenses[0], additionalExpenses: expenses.slice(1),
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
