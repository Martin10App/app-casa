/* ============================================================
   api/notificar.js — El "cartero" de Nuestro Hogar (Vercel)
   ------------------------------------------------------------
   Recibe { tokens, title, body } desde la app y manda la
   notificación push a esos dispositivos vía Firebase Cloud
   Messaging (API v1), aunque la app esté cerrada.

   Necesita la variable de entorno FIREBASE_SERVICE_ACCOUNT
   con el JSON de la cuenta de servicio (secreto, solo Vercel).
   Sin dependencias npm: usa crypto y fetch nativos.
   ============================================================ */

const crypto = require('crypto');

const PROJECT_ID = 'app-casa-261f3';
const CORS_ORIGIN = 'https://martin10app.github.io';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

// Cache del token de acceso (dura ~1h) para no re-autenticar en cada aviso
let cachedToken = null;
let cachedExp = 0;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const b64url = (input) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Firma un JWT y lo cambia por un access token de Google */
async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < cachedExp - 60) return cachedToken;

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key)
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${unsigned}.${signature}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!resp.ok) throw new Error('OAuth falló: ' + (await resp.text()));
  const data = await resp.json();
  cachedToken = data.access_token;
  cachedExp = now + (data.expires_in || 3600);
  return cachedToken;
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return res.status(500).json({ error: 'Falta configurar FIREBASE_SERVICE_ACCOUNT' });

  let sa;
  try {
    sa = JSON.parse(raw);
  } catch (e) {
    // Diagnóstico seguro: nada del contenido secreto, solo la forma
    return res.status(500).json({
      error: 'FIREBASE_SERVICE_ACCOUNT no es un JSON válido',
      detalle: e.message,
      largo: raw.length,
      empieza: raw.trim().slice(0, 1),
      termina: raw.trim().slice(-1),
      tieneSaltosReales: /\r|\n/.test(raw),
    });
  }
  if (!sa || !sa.private_key || !sa.client_email) {
    return res.status(500).json({ error: 'Al JSON le faltan campos', campos: sa ? Object.keys(sa) : [] });
  }
  // Vercel a veces guarda los saltos de línea escapados
  if (sa.private_key.includes('\\n')) sa.private_key = sa.private_key.replace(/\\n/g, '\n');

  try {
    const { tokens, title, body } = req.body || {};
    const list = (Array.isArray(tokens) ? tokens : []).filter(Boolean).slice(0, 10);
    if (!list.length) return res.status(400).json({ error: 'No hay destinatarios' });
    if (!title) return res.status(400).json({ error: 'Falta el título' });

    const accessToken = await getAccessToken(sa);
    const url = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

    const results = await Promise.all(list.map(async (token) => {
      const message = {
        message: {
          token,
          notification: { title, body: body || '' },
          webpush: {
            notification: { icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'nuestro-hogar' },
            fcm_options: { link: 'https://martin10app.github.io/app-casa/' },
          },
        },
      };
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
      if (r.ok) return { token: token.slice(0, 12), ok: true };
      const errText = await r.text();
      console.error('[notificar] FCM:', errText);
      // Token muerto (app desinstalada) → la app lo puede limpiar
      const dead = r.status === 404 || errText.includes('UNREGISTERED') || errText.includes('INVALID_ARGUMENT');
      return { token: token.slice(0, 12), ok: false, dead };
    }));

    return res.status(200).json({ sent: results.filter((r) => r.ok).length, results });
  } catch (err) {
    console.error('[notificar] error:', err);
    return res.status(500).json({ error: 'No se pudo enviar la notificación' });
  }
};
