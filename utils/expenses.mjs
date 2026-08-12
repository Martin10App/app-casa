export const PAYMENT_METHODS = {
  master_brou: { label: 'Master BROU · 1 pago', short: 'Master BROU' },
  debit: { label: 'Débito', short: 'Débito' },
  cash: { label: 'Efectivo', short: 'Efectivo' },
  transfer: { label: 'Transferencia', short: 'Transferencia' },
  other_credit: { label: 'Otra tarjeta', short: 'Otra tarjeta' },
  unknown: { label: 'Sin especificar', short: 'Sin especificar' },
};

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

// Martín confirmó que todas las compras históricas, anteriores al selector
// de forma de pago, fueron hechas con la Master BROU Recompensa.
export function paymentMethodFor(purchase) {
  return purchase.paymentMethod || 'master_brou';
}

const pad = (value) => String(value).padStart(2, '0');
const iso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function localDate(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function billingCycleFor(value = new Date()) {
  const date = localDate(value);
  const startsThisMonth = date.getDate() >= 24;
  const start = new Date(date.getFullYear(), date.getMonth() - (startsThisMonth ? 0 : 1), 24);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 23);
  return { start: iso(start), end: iso(end) };
}

export function shiftBillingCycle(cycle, months) {
  const start = localDate(cycle.start);
  start.setMonth(start.getMonth() + months);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 23);
  return { start: iso(start), end: iso(end) };
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

export function analyzeExpenses(purchases, cycle) {
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
    addTo(payments, paymentMethodFor(purchase), amount);

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
