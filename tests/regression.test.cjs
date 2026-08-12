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
  assert.deepEqual(report.merchants.map((row) => [row.key, row.total]), [['Macromercado', 1500], ['Ancap', 500]]);
  assert.deepEqual(report.payments.map((row) => [row.key, row.total]), [['master_brou', 1500], ['debit', 500]]);
  assert.equal(report.products[0].quantity, 3);
  assert.equal(report.products[0].unit, 'kg');
});

