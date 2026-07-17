/* ============================================================
   api/boleta.js — Lector de boletas de Nuestro Hogar (Vercel)
   ------------------------------------------------------------
   Recibe la foto de un ticket de supermercado y devuelve la
   compra desglosada: lugar, fecha, total y cada producto con
   su cantidad y precio, ya normalizado y categorizado.

   Usa Google Gemini (multimodal: lee la imagen directo).
   Clave en la variable de entorno GEMINI_API_KEY.
   ============================================================ */

const MODEL = 'gemini-2.5-flash';
const GEMINI = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const CATEGORIAS = [
  'compras', 'alma', 'carnes', 'verduras', 'frutas', 'lacteos', 'despensa',
  'limpieza', 'bebidas', 'farmacia', 'mascotas', 'regalos', 'escuela',
  'hogar', 'recordatorios', 'gastos', 'otros',
];

const CORS_ORIGIN = 'https://martin10app.github.io';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Falta configurar GEMINI_API_KEY' });

  try {
    const { image, mime } = req.body || {};
    if (!image) return res.status(400).json({ error: 'No llegó la foto' });

    const hoyISO = new Date().toISOString().slice(0, 10);

    const prompt = `Sos un lector de tickets de supermercado de Uruguay. Mirá la foto de la boleta y devolvé la compra desglosada.
Hoy es ${hoyISO}.

Devolvé SOLO un JSON con esta forma exacta:
{"store":"nombre del comercio","date":"YYYY-MM-DD","total":0,"items":[{"name":"...","raw":"...","qty":1,"unitPrice":0,"lineTotal":0,"category":"..."}]}

Reglas:
- "store": el nombre del comercio como se conoce (ej: "Macromercado", "Fresh Market", "Ta-Ta", "Devoto", "Tienda Inglesa", "Disco"). Si no se ve, poné "".
- "date": la fecha del ticket en YYYY-MM-DD. Si no se ve, usá ${hoyISO}.
- "total": el TOTAL final que pagó, como número (sin símbolos). Si no se ve, sumá los renglones.
- Un objeto por cada renglón de producto. IGNORÁ líneas que no sean productos (subtotales, descuentos generales, IVA, medios de pago, ahorro, puntos, vuelto).
- "raw": el texto tal cual aparece en la boleta (ej: "LECHE CONAP LARGA VIDA 1L").
- "name": el producto NORMALIZADO, corto, en minúscula, sin marca ni tamaño salvo que sea esencial (ej: "leche", "azúcar", "papel higiénico", "carne picada", "aceite"). Este nombre se usa para comparar precios entre supermercados, así que usá SIEMPRE el término genérico y consistente.
- "qty": cantidad como número (si dice 2x o 2 un., poné 2). Si es por peso (kg), poné 1 y que el precio sea el del renglón.
- "unitPrice": precio por unidad, número. "lineTotal": lo que se pagó por ese renglón, número.
- "category": UNA de esta lista exacta: ${CATEGORIAS.join(', ')}.
  Guía: seco/enlatado/fideos/arroz/azúcar/aceite=despensa; carne/pollo/pescado/fiambre=carnes; frutas=frutas; verduras=verduras;
  leche/queso/yogur/manteca=lacteos; jabón/lavandina/papel higiénico/detergente=limpieza; refrescos/agua/jugo/cerveza=bebidas;
  remedios=farmacia; cosas de mascota=mascotas; útiles=escuela; cosas de nena=alma; si no encaja=otros.
- Los precios en Uruguay usan coma decimal: "45,90" son 45.9. Convertilos a número con punto.
- Si la foto no es una boleta o no se lee nada, devolvé {"store":"","date":"${hoyISO}","total":0,"items":[]}.
No agregues nada fuera del JSON.`;

    const body = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mime || 'image/jpeg', data: image } },
        ],
      }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    };

    const resp = await fetch(`${GEMINI}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error('[boleta] Gemini falló:', t);
      return res.status(502).json({ error: 'La IA no pudo leer la boleta' });
    }
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    let parsed = {};
    try { parsed = JSON.parse(text); } catch { parsed = {}; }

    const num = (v) => {
      const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };

    const items = (Array.isArray(parsed.items) ? parsed.items : [])
      .filter((it) => it && typeof it.name === 'string' && it.name.trim())
      .map((it) => {
        const qty = Number.isFinite(it.qty) && it.qty > 0 ? Math.min(99, it.qty) : 1;
        const lineTotal = num(it.lineTotal);
        const unitPrice = num(it.unitPrice) || (lineTotal && qty ? +(lineTotal / qty).toFixed(2) : 0);
        return {
          name: String(it.name).trim().toLowerCase().slice(0, 60),
          raw: String(it.raw || '').trim().slice(0, 80),
          qty,
          unitPrice,
          lineTotal: lineTotal || +(unitPrice * qty).toFixed(2),
          category: CATEGORIAS.includes(it.category) ? it.category : 'despensa',
        };
      })
      .slice(0, 80);

    const sumaRenglones = +items.reduce((a, i) => a + (i.lineTotal || 0), 0).toFixed(2);

    return res.status(200).json({
      store: String(parsed.store || '').trim().slice(0, 40),
      date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date || '') ? parsed.date : hoyISO,
      total: num(parsed.total) || sumaRenglones,
      items,
    });
  } catch (err) {
    console.error('[boleta] error:', err);
    return res.status(500).json({ error: 'Error procesando la boleta' });
  }
};
