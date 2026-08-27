export const PAYMENT_METHODS = {
  debit: { label: 'Débito', short: 'Débito' },
  cash: { label: 'Efectivo', short: 'Efectivo' },
  transfer: { label: 'Transferencia', short: 'Transferencia' },
  other_credit: { label: 'Otra tarjeta', short: 'Otra tarjeta' },
  unknown: { label: 'Sin especificar', short: 'Sin especificar' },
};

export const LEGACY_EXPENSE_SETTINGS = Object.freeze({
  configured: true,
  cycleStartDay: 24,
  cards: [{ id: 'master_brou', name: 'Master BROU', closingDay: 23, dueDay: 1, installments: false }],
});

const clampDay = (value, fallback = 1) => {
  const day = Math.trunc(Number(value));
  return day >= 1 && day <= 28 ? day : fallback;
};

function cleanCard(card, index) {
  const name = String(card?.name || '').trim().slice(0, 30);
  if (!name) return null;
  const rawId = String(card?.id || name).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const id = rawId === 'master_brou' ? rawId : (rawId.startsWith('card_') ? rawId : `card_${rawId || index + 1}`);
  return {
    id,
    name,
    closingDay: clampDay(card?.closingDay, 1),
    dueDay: clampDay(card?.dueDay, 1),
    ...(card?.installments === false ? { installments: false } : {}),
  };
}

export function normalizeExpenseSettings(value, { legacy = false } = {}) {
  if (!value || typeof value !== 'object') {
    return legacy
      ? { ...LEGACY_EXPENSE_SETTINGS, cards: LEGACY_EXPENSE_SETTINGS.cards.map((card) => ({ ...card })) }
      : { configured: false, cycleStartDay: 1, cards: [] };
  }
  const used = new Set();
  const cards = (Array.isArray(value.cards) ? value.cards : []).map(cleanCard).filter(Boolean).map((card, index) => {
    let id = card.id;
    while (used.has(id)) id = `${card.id}_${index + 1}`;
    used.add(id);
    return { ...card, id };
  });
  return {
    configured: value.configured !== false,
    cycleStartDay: clampDay(value.cycleStartDay, legacy ? 24 : 1),
    cards,
  };
}

export function paymentMethodEntries(settings) {
  const normalized = normalizeExpenseSettings(settings);
  const cards = normalized.cards.map((card) => [card.id, { label: `${card.name} · ${card.installments === false ? '1 pago' : 'crédito'}`, short: card.name, card }]);
  return [...cards, ...Object.entries(PAYMENT_METHODS)];
}

export function cardForPayment(method, settings) {
  return normalizeExpenseSettings(settings).cards.find((card) => card.id === method && card.installments !== false) || null;
}

export const EXPENSE_CATEGORIES = {
  supermercado: 'Supermercado',
  combustible: 'Nafta y combustible',
  comida: 'Comida y salidas',
  hogar: 'Casa y hogar',
  servicios: 'Servicios',
  salud: 'Salud',
  transporte: 'Transporte',
  educacion: 'Educación',
  ocio: 'Ocio',
  otros: 'Otros',
};

export const DEFAULT_EXPENSE_BUDGET = Object.freeze({ ideal: 30000, limit: 35000 });

export function normalizeExpenseBudget(value = {}) {
  const ideal = Number(value?.ideal);
  const limit = Number(value?.limit);
  if (!(ideal > 0) || !(limit > ideal)) return { ...DEFAULT_EXPENSE_BUDGET };
  return {
    ideal: Math.round(ideal * 100) / 100,
    limit: Math.round(limit * 100) / 100,
  };
}

export function expenseBudgetStatus(total, value) {
  const amount = Math.max(0, Number(total) || 0);
  const budget = normalizeExpenseBudget(value);
  const progress = Math.min(100, amount / budget.limit * 100);

  if (amount <= budget.ideal) {
    return { key: 'green', label: 'En objetivo', amount, budget, progress, remaining: budget.ideal - amount };
  }
  if (amount <= budget.limit) {
    return { key: 'yellow', label: 'Atención', amount, budget, progress, remaining: budget.limit - amount };
  }
  return { key: 'red', label: 'Límite superado', amount, budget, progress: 100, over: amount - budget.limit };
}

// Martín confirmó que todas las compras históricas, anteriores al selector
// de forma de pago, fueron hechas con la Master BROU Recompensa.
export function paymentMethodFor(purchase, settings = LEGACY_EXPENSE_SETTINGS) {
  return purchase.paymentMethod || (normalizeExpenseSettings(settings, { legacy: true }).cards.some((card) => card.id === 'master_brou') ? 'master_brou' : 'unknown');
}

const pad = (value) => String(value).padStart(2, '0');
const iso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function localDate(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function billingCycleFor(value = new Date(), startDay = 24) {
  const date = localDate(value);
  const day = clampDay(startDay, 24);
  const startsThisMonth = date.getDate() >= day;
  const start = new Date(date.getFullYear(), date.getMonth() - (startsThisMonth ? 0 : 1), day);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, day - 1);
  return { start: iso(start), end: iso(end) };
}

export function shiftBillingCycle(cycle, months) {
  const start = localDate(cycle.start);
  const day = start.getDate();
  start.setMonth(start.getMonth() + months);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, day - 1);
  return { start: iso(start), end: iso(end) };
}

function dateWithDay(year, month, day) {
  return new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()));
}

export function statementDueDate(purchaseDate, card) {
  const purchase = localDate(purchaseDate);
  const closingDay = clampDay(card?.closingDay, 1);
  const dueDay = clampDay(card?.dueDay, 1);
  const closingMonth = purchase.getMonth() + (purchase.getDate() > closingDay ? 1 : 0);
  const closing = dateWithDay(purchase.getFullYear(), closingMonth, closingDay);
  const dueMonth = closing.getMonth() + (dueDay <= closing.getDate() ? 1 : 0);
  return iso(dateWithDay(closing.getFullYear(), dueMonth, dueDay));
}

export function buildInstallmentSchedule({ purchaseDate, total, installments = 1, card }) {
  const count = Math.max(1, Math.min(60, Math.trunc(Number(installments)) || 1));
  const cents = Math.round((Number(total) || 0) * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  const firstDue = localDate(statementDueDate(purchaseDate, card));
  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    count,
    amount: (base + (index < remainder ? 1 : 0)) / 100,
    date: iso(dateWithDay(firstDue.getFullYear(), firstDue.getMonth() + index, firstDue.getDate())),
  }));
}

export function isInCycle(date, cycle) {
  const value = String(date || '').slice(0, 10);
  return value >= cycle.start && value <= cycle.end;
}

function addTo(map, key, amount) {
  map.set(key, (map.get(key) || 0) + amount);
}

function normalizedKey(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-UY').trim();
}

export function canonicalMerchant(name) {
  const display = name?.trim() || 'Sin lugar';
  const key = normalizedKey(display);
  // Los tickets de ANCAP pueden traer la razón social de la estación.
  if (key.includes('ancap') || key.includes('bregu')) return 'ANCAP';
  return display;
}

function addMerchant(map, name, amount) {
  const display = canonicalMerchant(name);
  const key = normalizedKey(display);
  const current = map.get(key) || { key: display, total: 0 };
  current.total += amount;
  map.set(key, current);
}

function sortedRows(map) {
  return [...map].map(([key, total]) => ({ key, total })).sort((a, b) => b.total - a.total);
}

export function analyzeExpenses(purchases, cycle, settings = LEGACY_EXPENSE_SETTINGS) {
  const movements = purchases.filter((purchase) => isInCycle(purchase.date, cycle));
  const merchants = new Map();
  const categories = new Map();
  const payments = new Map();
  const products = new Map();
  let total = 0;

  for (const purchase of movements) {
    const amount = Number(purchase.total) || 0;
    total += amount;
    addMerchant(merchants, purchase.store, amount);
    addTo(categories, purchase.expenseCategory || 'otros', amount);
    addTo(payments, paymentMethodFor(purchase, settings), amount);

    for (const item of purchase.items || []) {
      const name = item.name?.trim();
      if (!name) continue;
      const unit = item.purchaseUnit || 'unidad';
      const quantity = Number(item.purchaseQuantity ?? item.qty) || 0;
      const key = `${normalizedKey(name)}|${unit}`;
      const current = products.get(key) || { key, name, unit, quantity: 0, spent: 0 };
      current.quantity += quantity;
      current.spent += Number(item.lineTotal ?? item.unitPrice) || 0;
      products.set(key, current);
    }
  }

  return {
    movements,
    total,
    merchants: [...merchants.values()].sort((a, b) => b.total - a.total),
    categories: sortedRows(categories),
    payments: sortedRows(payments),
    products: [...products.values()].sort((a, b) => b.spent - a.spent),
  };
}
