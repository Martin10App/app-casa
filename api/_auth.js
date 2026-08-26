'use strict';

const crypto = require('crypto');

const PROJECT_ID = 'app-casa-261f3';
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const DEFAULT_EMAILS = [
  'martinmolina10101@gmail.com',
  'luciia0295@gmail.com',
  'brumitta1608@gmail.com',
];
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';

let certCache = null;
let certCacheUntil = 0;

function allowedEmails() {
  return new Set((process.env.ALLOWED_EMAILS || DEFAULT_EMAILS.join(','))
    .split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
}

function extractBearer(req) {
  const value = String(req.headers?.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function decodePart(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function validateClaims(payload, now = Math.floor(Date.now() / 1000)) {
  if (payload.aud !== PROJECT_ID) throw new Error('audience');
  if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) throw new Error('issuer');
  if (!payload.sub || payload.exp <= now || payload.iat > now + 60) throw new Error('expired');
  const email = String(payload.email || '').toLowerCase();
  if (!payload.email_verified || !allowedEmails().has(email)) throw new Error('forbidden');
  return { uid: payload.sub, email };
}

function validateVerifiedClaims(payload, now = Math.floor(Date.now() / 1000)) {
  if (payload.aud !== PROJECT_ID) throw new Error('audience');
  if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) throw new Error('issuer');
  if (!payload.sub || payload.exp <= now || payload.iat > now + 60) throw new Error('expired');
  const email = String(payload.email || '').toLowerCase();
  if (!payload.email_verified || !email) throw new Error('forbidden');
  return { uid: payload.sub, email };
}

async function getCerts() {
  if (certCache && Date.now() < certCacheUntil) return certCache;
  const response = await fetch(CERTS_URL);
  if (!response.ok) throw new Error('certificates');
  certCache = await response.json();
  const maxAge = /max-age=(\d+)/i.exec(response.headers.get('cache-control') || '');
  certCacheUntil = Date.now() + (Number(maxAge?.[1]) || 300) * 1000;
  return certCache;
}

async function verifyFirebaseToken(token, options = {}) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('format');
  const header = decodePart(parts[0]);
  const payload = decodePart(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('algorithm');
  const cert = (await getCerts())[header.kid];
  if (!cert) throw new Error('certificate');
  const ok = crypto.verify(
    'RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`),
    new crypto.X509Certificate(cert).publicKey, Buffer.from(parts[2], 'base64url')
  );
  if (!ok) throw new Error('signature');
  return options.allowAnyVerified ? validateVerifiedClaims(payload) : validateClaims(payload);
}

let serviceToken = null;
let serviceTokenUntil = 0;

const b64url = (input) => Buffer.from(input).toString('base64url');

async function getFirestoreAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (serviceToken && now < serviceTokenUntil - 60) return serviceToken;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('service-account');
  const sa = JSON.parse(raw);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: FIRESTORE_SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const key = String(sa.private_key || '').replace(/\\n/g, '\n');
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(key).toString('base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  if (!response.ok) throw new Error('service-token');
  const data = await response.json();
  serviceToken = data.access_token; serviceTokenUntil = now + (data.expires_in || 3600);
  return serviceToken;
}

function firestoreStrings(field) {
  return (field?.arrayValue?.values || []).map((value) => value.stringValue).filter(Boolean);
}

async function isHouseholdMember(householdId, uid) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(householdId)) return false;
  const token = await getFirestoreAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/households/${encodeURIComponent(householdId)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return false;
  const document = await response.json();
  return firestoreStrings(document.fields?.memberUids).includes(uid);
}

async function requireApiUser(req, res) {
  const token = extractBearer(req);
  if (!token) { res.status(401).json({ error: 'Falta iniciar sesión' }); return null; }
  try {
    const user = await verifyFirebaseToken(token, { allowAnyVerified: true });
    if (allowedEmails().has(user.email)) return { ...user, householdId: 'martin-lucia' };
    const householdId = String(req.headers?.['x-household-id'] || '').trim();
    if (!householdId || !(await isHouseholdMember(householdId, user.uid))) throw new Error('forbidden');
    return { ...user, householdId };
  }
  catch (error) {
    const status = error.message === 'forbidden' ? 403 : 401;
    res.status(status).json({ error: status === 403 ? 'Cuenta sin acceso' : 'Sesión inválida' });
    return null;
  }
}

module.exports = { extractBearer, validateClaims, validateVerifiedClaims, verifyFirebaseToken, isHouseholdMember, requireApiUser };

