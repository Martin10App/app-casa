/* ============================================================
   api/voz.js — Cerebro de voz de "Nuestro Hogar" (Vercel)
   ------------------------------------------------------------
   Función serverless que:
   1) recibe un audio (base64, formato WAV) desde la app,
   2) se lo pasa a Google Gemini (multimodal): lo escucha,
      lo transcribe y lo interpreta en una sola llamada,
   3) devuelve los ítems ya estructurados + la transcripción.

   La clave de Gemini vive acá (variable de entorno
   GEMINI_API_KEY), NUNCA en la app pública. Sin dependencias
   npm: usa fetch nativo de Node 18+.
   ============================================================ */

const MODEL = 'gemini-2.5-flash';
const GEMINI = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Categorías válidas de la app (deben coincidir con utils/images.js)
const CATEGORIAS = [
  'compras', 'alma', 'carnes', 'verduras', 'frutas', 'lacteos', 'despensa',
  'limpieza', 'bebidas', 'farmacia', 'mascotas', 'regalos', 'escuela',
  'hogar', 'recordatorios', 'gastos', 'otros',
];

// Quién puede llamar a la función (el dominio de la app)
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
    const { audio, mime } = req.body || {};
    if (!audio) return res.status(400).json({ error: 'No llegó el audio' });

    const hoy = new Date();
    const hoyISO = hoy.toISOString().slice(0, 10);
    const diaSemana = hoy.toLocaleDateString('es-UY', { weekday: 'long' });

    const prompt = `Sos el asistente de una app familiar del hogar en Uruguay (español rioplatense).
En el audio, una persona dicta cosas para anotar en la app. Escuchá el audio y convertilo en una lista.
Hoy es ${diaSemana} ${hoyISO}.

Devolvé SOLO un JSON con esta forma exacta:
{"transcript":"lo que se dijo, textual","intent":"agregar","items":[{"name":"...","category":"...","priority":"baja|media|alta","qty":1,"dueDate":"YYYY-MM-DD o null","amount":null}]}

Reglas:
- "intent": normalmente "agregar". Poné "consultar" SOLO si la persona PREGUNTA dónde comprar algo o pide precios / el más barato / un top de precios (ej: "¿dónde compro X?", "dónde está más barato X", "tirame el top 3 de precios de X"). En "consultar", "items" lleva SOLO el/los productos por los que pregunta.
- Un item por cada cosa mencionada. "azúcar y fideos" = DOS items.
- "name": producto o tarea, corto, en minúscula salvo nombres propios (ej: "azúcar", "papel higiénico", "turno del dentista").
- "category": elegí UNA sola de esta lista exacta: ${CATEGORIAS.join(', ')}.
  Guía: seco/enlatado=despensa; carne/pollo/pescado=carnes; frutas=frutas; verduras=verduras; leche/queso/yogur=lacteos;
  jabón/lavandina/papel higiénico=limpieza; refrescos/agua/jugo=bebidas; remedios=farmacia; cosas de mascota=mascotas;
  útiles/escuela=escuela; cosas de la nena o de Alma=alma; regalos=regalos; turnos/citas/"acordate"/"anotá para tal día"=recordatorios;
  gastos de plata=gastos; compra genérica=compras; si no encaja=otros.
- "priority": "alta" si dice urgente/ya/se acabó; si no "media".
- "qty": número si menciona cantidad ("dos panes"→2); si no 1.
- "dueDate": SOLO si menciona día/fecha ("el viernes", "mañana", "el 20"); resolvelo a fecha real YYYY-MM-DD respecto de hoy; si no hay, null. Lo que lleva fecha suele ir en "recordatorios".
- "amount": número si menciona un monto de plata; si no null.
- Si el audio no tiene nada anotable: {"transcript":"...","items":[]}.
No agregues nada fuera del JSON.`;

    const body = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mime || 'audio/wav', data: audio } },
        ],
      }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    };

    const resp = await fetch(`${GEMINI}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error('[voz] Gemini falló:', t);
      return res.status(502).json({ error: 'La IA no pudo procesar el audio' });
    }
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    let parsed = {};
    try { parsed = JSON.parse(text); } catch { parsed = {}; }

    const items = (Array.isArray(parsed.items) ? parsed.items : [])
      .filter((it) => it && typeof it.name === 'string' && it.name.trim())
      .map((it) => ({
        name: String(it.name).trim().slice(0, 80),
        category: CATEGORIAS.includes(it.category) ? it.category : 'compras',
        priority: ['baja', 'media', 'alta'].includes(it.priority) ? it.priority : 'media',
        qty: Number.isFinite(it.qty) && it.qty > 0 ? Math.min(99, Math.round(it.qty)) : 1,
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(it.dueDate || '') ? it.dueDate : null,
        amount: Number.isFinite(it.amount) && it.amount > 0 ? it.amount : null,
      }))
      .slice(0, 25);

    const intent = parsed.intent === 'consultar' ? 'consultar' : 'agregar';
    return res.status(200).json({ transcript: (parsed.transcript || '').trim(), intent, items });
  } catch (err) {
    console.error('[voz] error:', err);
    return res.status(500).json({ error: 'Error procesando el audio' });
  }
};
