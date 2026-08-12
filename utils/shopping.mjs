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
