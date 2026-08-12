'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { localISODate } = require('../api/_date');
const { presentation } = require('../api/_presentation');
const { extractBearer, validateClaims } = require('../api/_auth');

test('Uruguay keeps the local calendar date after UTC midnight', () => {
  assert.equal(localISODate(new Date('2026-08-13T00:30:00Z')), '2026-08-12');
});

test('package prices are normalized per kilogram and litre', () => {
  assert.deepEqual(presentation('arroz 500 g', 60), {
    sizeLabel: '500 g', comparisonUnit: 'kg', comparisonPrice: 120, packageQuantity: 0.5,
  });
  assert.deepEqual(presentation('leche 1,5 L', 90), {
    sizeLabel: '1,5 l', comparisonUnit: 'l', comparisonPrice: 60, packageQuantity: 1.5,
  });
  assert.equal(presentation('Arroz oficial · 1.0 Kilogramos', 30).comparisonPrice, 30);
  assert.equal(presentation('Aceite oficial · 900.0 Mililitros', 90).comparisonPrice, 100);
});

test('API authorization accepts only verified household accounts', () => {
  const now = 2_000_000_000;
  const base = { aud: 'app-casa-261f3', iss: 'https://securetoken.google.com/app-casa-261f3', sub: 'u', exp: now + 60, iat: now - 60, email_verified: true };
  assert.equal(validateClaims({ ...base, email: 'MartinMolina10101@gmail.com' }, now).email, 'martinmolina10101@gmail.com');
  assert.throws(() => validateClaims({ ...base, email: 'intruso@example.com' }, now), /forbidden/);
  assert.equal(extractBearer({ headers: { authorization: 'Bearer token-value' } }), 'token-value');
});

test('private APIs reject missing Firebase authentication before processing', async () => {
  for (const name of ['voz', 'boleta', 'notificar', 'precios-online']) {
    const handler = require(`../api/${name}.js`);
    let status = 200;
    const res = {
      setHeader() {}, status(value) { status = value; return this; },
      json(body) { return body; }, end() {},
    };
    await handler({ method: name === 'precios-online' ? 'GET' : 'POST', headers: {}, body: {}, query: {} }, res);
    assert.equal(status, 401, `${name} must reject anonymous calls`);
  }
});

test('service worker never caches live household API responses', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const bypass = source.indexOf("url.hostname === 'app-casa-omega.vercel.app'");
  const externalCache = source.indexOf('url.origin !== location.origin');
  assert.ok(bypass > 0 && bypass < externalCache);
});

test('voice review only inspects rows that own a checkbox', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'components', 'voice.js'), 'utf8');
  assert.match(source, /#voice-items \.voice-item/);
  assert.match(source, /checkbox\?\.checked/);
});

test('camera and gallery are separate receipt inputs', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'components', 'boleta.js'), 'utf8');
  assert.match(source, /source === 'camera'/);
  assert.match(source, /setAttribute\('capture', 'environment'\)/);
  assert.match(source, /pickPhoto\('gallery'\)/);
});

test('card cycles run from day 24 through day 23 and reports stay separated', async () => {
  const expenses = await import('../utils/expenses.mjs');
  assert.deepEqual(expenses.billingCycleFor('2026-08-12'), { start: '2026-07-24', end: '2026-08-23' });
  assert.deepEqual(expenses.billingCycleFor('2026-08-24'), { start: '2026-08-24', end: '2026-09-23' });
  assert.deepEqual(expenses.shiftBillingCycle({ start: '2026-12-24', end: '2027-01-23' }, 1), { start: '2027-01-24', end: '2027-02-23' });

  const report = expenses.analyzeExpenses([
    { date: '2026-07-23', store: 'Viejo', total: 999, paymentMethod: 'cash' },
    { date: '2026-07-24', store: 'Macromercado', total: 1200, paymentMethod: 'master_brou', expenseCategory: 'supermercado', items: [{ name: 'Pollo', purchaseQuantity: 2, purchaseUnit: 'kg', lineTotal: 500 }] },
    { date: '2026-08-02', store: 'Ancap', total: 500, paymentMethod: 'debit', expenseCategory: 'combustible' },
    { date: '2026-08-23', store: 'MACROMERCADO', total: 300, paymentMethod: 'master_brou', expenseCategory: 'supermercado', items: [{ name: 'pollo', purchaseQuantity: 1, purchaseUnit: 'kg', lineTotal: 300 }] },
    { date: '2026-08-24', store: 'Nuevo', total: 777, paymentMethod: 'cash' },
  ], { start: '2026-07-24', end: '2026-08-23' });
  assert.equal(report.total, 2000);
  assert.deepEqual(report.merchants.map((row) => [row.key, row.total]), [['Macromercado', 1500], ['ANCAP', 500]]);
  assert.deepEqual(report.payments.map((row) => [row.key, row.total]), [['master_brou', 1500], ['debit', 500]]);
  assert.equal(report.products[0].quantity, 3);
  assert.equal(report.products[0].unit, 'kg');
});

test('ANCAP and its Bregu SRL receipt name are one merchant', async () => {
  const expenses = await import('../utils/expenses.mjs');
  const report = expenses.analyzeExpenses([
    { date: '2026-08-01', store: 'ANCAP', total: 1200, paymentMethod: 'master_brou', expenseCategory: 'combustible' },
    { date: '2026-08-10', store: 'BREGU S.R.L.', total: 800, paymentMethod: 'debit', expenseCategory: 'combustible' },
  ], { start: '2026-07-24', end: '2026-08-23' });
  assert.deepEqual(report.merchants, [{ key: 'ANCAP', total: 2000 }]);
});

test('historical expenses without payment metadata belong to Master BROU', async () => {
  const expenses = await import('../utils/expenses.mjs');
  const report = expenses.analyzeExpenses([
    { date: '2026-08-01', store: 'Macromercado', total: 1500 },
    { date: '2026-08-10', store: 'ANCAP', total: 1000, paymentMethod: 'master_brou' },
    { date: '2026-08-12', store: 'Leñería', total: 500, paymentMethod: 'debit' },
  ], { start: '2026-07-24', end: '2026-08-23' });
  assert.deepEqual(report.payments.map((row) => [row.key, row.total]), [['master_brou', 2500], ['debit', 500]]);
  assert.equal(expenses.paymentMethodFor({}), 'master_brou');
});

test('quick supermarket entry infers aisles and groups a useful route', async () => {
  const shopping = await import('../utils/shopping.mjs');
  assert.equal(shopping.inferShoppingCategory('2 kilos de pollo'), 'carnes');
  assert.equal(shopping.inferShoppingCategory('Papel higiénico'), 'limpieza');
  assert.equal(shopping.inferShoppingCategory('una cosa rara'), 'compras');
  const groups = shopping.groupShoppingItems([
    { id: '1', name: 'Arroz', category: 'compras', priority: 'media' },
    { id: '2', name: 'Tomate', category: 'compras', priority: 'alta' },
    { id: '3', name: 'Pollo', category: 'carnes', priority: 'baja' },
  ]);
  assert.deepEqual(groups.map((group) => [group.id, group.items.map((item) => item.id)]), [
    ['frutas-verduras', ['2']], ['carniceria', ['3']], ['despensa', ['1']],
  ]);
});

test('supermarket insights estimate prices and recommend the best-covered store', async () => {
  const { shoppingInsights } = await import('../utils/shopping.mjs');
  const insight = shoppingInsights([
    { id: 'a', qty: 2, priority: 'alta' }, { id: 'b', qty: 1, priority: 'media' }, { id: 'c', qty: 1, priority: 'alta' },
  ], {
    a: { store: 'Macromercado', price: 100 }, b: { store: 'Macromercado', price: 50 }, c: { store: 'Ta-Ta', price: 80 },
  });
  assert.equal(insight.estimatedTotal, 330);
  assert.equal(insight.pricedCount, 3);
  assert.equal(insight.urgentCount, 2);
  assert.deepEqual(insight.bestStore, { store: 'Macromercado', count: 2 });
});

test('live price matching rejects unrelated products and prefers exact grocery names', () => {
  const { relevance, bestOfficialArticles, officialStoreName, parseOfficialBasket } = require('../api/precios-online')._test;
  assert.ok(relevance('Leche entera Conaprole 1 L', 'leche') > 0);
  assert.ok(relevance('Leche entera Conaprole 1 L', 'leche entera') > relevance('Dulce de leche Conaprole 1 kg', 'leche entera'));
  assert.ok(relevance('Dulce de leche Conaprole 1 kg', 'leche') < 0);
  assert.equal(relevance('Papel higiénico 8 unidades', 'pollo'), 0);
  assert.equal(officialStoreName('Macromercado- Suc. Las Piedras N°16'), 'Macromercado');
  assert.deepEqual(bestOfficialArticles([
    { id: 1, name: 'Arroz Blanco - Aruba' },
    { id: 2, name: 'Harina de trigo' },
    { id: 3, name: 'Arroz Parboiled' },
  ], 'arroz', 2).map((item) => item.id), [1, 3]);
  const official = parseOfficialBasket({
    datos: [{ id: '1', Artículo: 'Arroz', 'Devoto | LAS PIEDRAS': '$35.0 - 12/08/26', 'Macromercado | Las Piedras': '$29.0 (*)' }],
    establecimientos: [
      { name: 'Devoto- Suc. LAS PIEDRAS', localidad: 'Las Piedras, CANELONES', direccion: 'Pouey 1', web: 'https://devoto.com.uy' },
      { name: 'Macromercado- Suc. Las Piedras', localidad: 'Las Piedras, CANELONES', direccion: 'Ruta 5' },
    ],
  }, [{ id: 1, name: 'Arroz blanco', unidad: '1.0 Kilogramos' }]);
  assert.equal(official.length, 1, 'estimated SIPC prices marked with (*) must be ignored');
  assert.equal(official[0].store, 'Devoto');
  assert.equal(official[0].comparisonPrice, 35);
});

test('supermarket mode loads live prices in batches and keeps a receipt fallback', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const component = fs.readFileSync(path.join(__dirname, '..', 'components', 'supermarket.js'), 'utf8');
  assert.match(app, /compareShoppingPrices/);
  assert.match(app, /unique\.slice\(start, start \+ 6\)/);
  assert.match(component, /Precios reales de Las Piedras/);
  assert.match(component, /La app seguirá usando tus boletas/);
  assert.match(component, /data-action="price-details"/);
});

