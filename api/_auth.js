'use strict';

const crypto = require('crypto');

const PROJECT_ID = 'app-casa-261f3';
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const DEFAULT_EMAILS = [
  'martinmolina10101@gmail.com',
  'luciia0295@gmail.com',
  'brumitta1608@gmail.com',
];

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

async function getCerts() {
  if (certCache && Date.now() < certCacheUntil) return certCache;
  const response = await fetch(CERTS_URL);
  if (!response.ok) throw new Error('certificates');
  certCache = await response.json();
  const maxAge = /max-age=(\d+)/i.exec(response.headers.get('cache-control') || '');
  certCacheUntil = Date.now() + (Number(maxAge?.[1]) || 300) * 1000;
  return certCache;
}

async function verifyFirebaseToken(token) {
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
  return validateClaims(payload);
}

async function requireApiUser(req, res) {
  const token = extractBearer(req);
  if (!token) { res.status(401).json({ error: 'Falta iniciar sesión' }); return null; }
  try { return await verifyFirebaseToken(token); }
  catch (error) {
    const status = error.message === 'forbidden' ? 403 : 401;
    res.status(status).json({ error: status === 403 ? 'Cuenta sin acceso' : 'Sesión inválida' });
    return null;
  }
}

module.exports = { extractBearer, validateClaims, verifyFirebaseToken, requireApiUser };

