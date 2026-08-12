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
    sizeLabel: '500 g', comparisonUnit: 'kg', comparisonPrice: 120,
  });
  assert.deepEqual(presentation('leche 1,5 L', 90), {
    sizeLabel: '1,5 l', comparisonUnit: 'l', comparisonPrice: 60,
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

