const normalize = (value = '') => String(value).toLocaleLowerCase('es-UY').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const CATEGORY_RULES = [
  ['frutas', ['manzana', 'banana', 'naranja', 'mandarina', 'pera', 'frutilla', 'limon', 'fruta']],
  ['verduras', ['tomate', 'lechuga', 'papa', 'boniato', 'cebolla', 'ajo', 'zanahoria', 'zapallo', 'verdura', 'morron']],
  ['carnes', ['carne', 'pollo', 'milanesa', 'pescado', 'chorizo', 'hamburguesa', 'asado', 'picada']],
  ['lacteos', ['leche', 'yogur', 'queso', 'manteca', 'crema', 'huevo', 'helado']],
  ['bebidas', ['agua', 'refresco', 'jugo', 'cerveza', 'vino', 'bebida']],
  ['limpieza', ['jabon', 'detergente', 'lavandina', 'limpiador', 'esponja', 'papel higienico', 'bolsa de basura']],
  ['farmacia', ['remedio', 'ibuprofeno', 'paracetamol', 'curita', 'alcohol', 'shampoo', 'pasta dental']],
  ['mascotas', ['racion', 'arena sanitaria', 'comida de perro', 'comida de gato']],
  ['despensa', ['arroz', 'fideo', 'pasta', 'harina', 'azucar', 'sal', 'aceite', 'yerba', 'cafe', 'galleta', 'pan', 'atun']],
];

export function inferShoppingCategory(name, fallback = 'compras') {
  const key = normalize(name);
  return CATEGORY_RULES.find(([, words]) => words.some((word) => key.includes(word)))?.[0] || fallback;
}

export const SHOPPING_AISLES = [
  { id: 'frutas-verduras', label: 'Frutas y verduras', icon: 'food', categories: ['frutas', 'verduras'] },
  { id: 'carniceria', label: 'Carnicería', icon: 'food', categories: ['carnes'] },
  { id: 'refrigerados', label: 'Lácteos y refrigerados', icon: 'drink', categories: ['lacteos'] },
  { id: 'despensa', label: 'Despensa y bebidas', icon: 'basket', categories: ['despensa', 'bebidas', 'compras'] },
  { id: 'limpieza', label: 'Limpieza y hogar', icon: 'spark', categories: ['limpieza', 'hogar'] },
  { id: 'cuidado', label: 'Cuidado y mascotas', icon: 'pharmacy', categories: ['farmacia', 'mascotas'] },
  { id: 'otros', label: 'Otros', icon: 'box', categories: ['alma', 'regalos', 'escuela', 'otros', 'recordatorios', 'gastos'] },
];

export function groupShoppingItems(items) {
  const priority = { alta: 0, media: 1, baja: 2 };
  const groups = SHOPPING_AISLES.map((aisle) => ({ ...aisle, items: [] }));
  for (const item of items) {
    const category = item.category === 'compras' ? inferShoppingCategory(item.name, item.category) : item.category;
    const group = groups.find((aisle) => aisle.categories.includes(category)) || groups.at(-1);
    group.items.push(item);
  }
  for (const group of groups) group.items.sort((a, b) => (priority[a.priority] ?? 1) - (priority[b.priority] ?? 1));
  return groups.filter((group) => group.items.length);
}

export function shoppingInsights(items, dealsById = {}) {
  let estimatedTotal = 0;
  let pricedCount = 0;
  const stores = new Map();
  for (const item of items) {
    const deal = dealsById[item.id];
    if (!deal?.price) continue;
    pricedCount += 1;
    estimatedTotal += Number(deal.price) * (Number(item.qty) || 1);
    const current = stores.get(deal.store) || { store: deal.store, count: 0 };
    current.count += 1;
    stores.set(deal.store, current);
  }
  const bestStore = [...stores.values()].sort((a, b) => b.count - a.count || a.store.localeCompare(b.store))[0] || null;
  return {
    estimatedTotal,
    pricedCount,
    urgentCount: items.filter((item) => item.priority === 'alta').length,
    bestStore,
  };
}

function itemUnitPrice(item) {
  const direct = Number(item?.unitPrice);
  if (direct > 0) return direct;
  const quantity = Number(item?.purchaseQuantity ?? item?.qty) || 1;
  const total = Number(item?.lineTotal);
  return total > 0 ? total / quantity : 0;
}

function entryDate(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(String(value))) return String(value).slice(0, 10);
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export function purchaseRecommendations(purchases, savedPrices = [], limit = 36) {
  const products = new Map();
  const supermarketCategories = new Set(['frutas', 'verduras', 'carnes', 'lacteos', 'bebidas', 'limpieza', 'farmacia', 'mascotas', 'despensa', 'compras']);
  const ordered = [...(purchases || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  for (const purchase of ordered) {
    const date = String(purchase.date || '').slice(0, 10);
    const store = String(purchase.store || 'Sin lugar').trim();
    const isMacro = /macro\s*mercado/i.test(store);
    const seen = new Set();
    for (const item of purchase.items || []) {
      const name = String(item.name || '').trim();
      const key = normalize(name);
      const category = item.category || inferShoppingCategory(name);
      if (!key || !supermarketCategories.has(category)) continue;
      const current = products.get(key) || { name, category, times: 0, lastDate: '', lastPrice: null, macroPrice: null };
      if (!seen.has(key)) current.times += 1;
      seen.add(key);
      const price = itemUnitPrice(item);
      if (date >= current.lastDate) {
        current.name = name;
        current.category = item.category || current.category;
        current.lastDate = date;
        if (price > 0) current.lastPrice = { store, price, date };
      }
      if (isMacro && price > 0 && (!current.macroPrice || date >= current.macroPrice.date)) {
        current.macroPrice = {
          store: 'Macromercado', price, date, source: 'boleta', card: 'Macropass',
          comparisonPrice: Number(item.comparisonPrice) || null,
          comparisonUnit: item.comparisonUnit || null,
        };
      }
      products.set(key, current);
    }
  }

  // La libreta de precios también se alimenta de las boletas. Usarla permite
  // recuperar productos históricos aunque la compra completa no esté disponible.
  for (const saved of savedPrices || []) {
    const name = String(saved.name || '').trim();
    const key = normalize(name);
    const category = saved.category || inferShoppingCategory(name);
    if (!key || !supermarketCategories.has(category)) continue;
    const current = products.get(key) || { name, category, times: 0, lastDate: '', lastPrice: null, macroPrice: null };
    for (const entry of saved.entries || []) {
      const price = Number(entry.price);
      const date = entryDate(entry.date);
      const store = String(entry.store || 'Sin lugar').trim();
      if (!(price > 0)) continue;
      if (!current.lastPrice || date >= current.lastDate) {
        current.lastDate = date;
        current.lastPrice = { store, price, date, source: 'boleta', comparisonPrice: Number(entry.comparisonPrice) || null, comparisonUnit: entry.comparisonUnit || null };
      }
      if (/macro\s*mercado/i.test(store) && (!current.macroPrice || date >= current.macroPrice.date)) {
        current.macroPrice = { store: 'Macromercado', price, date, source: 'boleta', card: 'Macropass', comparisonPrice: Number(entry.comparisonPrice) || null, comparisonUnit: entry.comparisonUnit || null };
      }
    }
    products.set(key, current);
  }
  return [...products.values()]
    .sort((a, b) => b.times - a.times || b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name, 'es'))
    .slice(0, Math.max(0, limit));
}
