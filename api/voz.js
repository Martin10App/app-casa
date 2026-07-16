/* ============================================================
   api/voz.js — Cerebro de voz de "Nuestro Hogar" (Vercel)
   ------------------------------------------------------------
   Función serverless que:
   1) recibe un audio (base64) desde la app,
   2) lo transcribe con Whisper (Groq),
   3) lo interpreta con un LLM y devuelve los ítems ya
      estructurados (nombre, categoría, prioridad, fecha).

   La clave de Groq vive acá (variable de entorno GROQ_API_KEY),
   NUNCA en la app pública. Sin dependencias npm: usa fetch,
   FormData y Blob nativos de Node 18+.
   ============================================================ */

const GROQ = 'https://api.groq.com/openai/v1';

// Categorías válidas de la app (deben coincidir con utils/images.js)
const CATEGORIAS = [
  'compras', 'alma', 'carnes', 'verduras', 'frutas', 'lacteos', 'despensa',
  'limpieza', 'bebidas', 'farmacia', 'mascotas', 'regalos', 'escuela',
  'hogar', 'recordatorios', 'gastos', 'otros',
];

/* Quién puede usar la función (mismos correos que la app) */
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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Falta configurar GROQ_API_KEY' });

  try {
    const { audio, mime } = req.body || {};
    if (!audio) return res.status(400).json({ error: 'No llegó el audio' });

    /* ---------- 1) Transcribir con Whisper ---------- */
    const bytes = Buffer.from(audio, 'base64');
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mime || 'audio/webm' }), 'audio.webm');
    form.append('model', 'whisper-large-v3');
    form.append('language', 'es');
    form.append('temperature', '0');

    const trResp = await fetch(`${GROQ}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!trResp.ok) {
      const t = await trResp.text();
      console.error('[voz] transcripción falló:', t);
      return res.status(502).json({ error: 'No se pudo transcribir el audio' });
    }
    const trData = await trResp.json();
    const transcript = (trData.text || '').trim();
    if (!transcript) return res.status(200).json({ transcript: '', items: [] });

    /* ---------- 2) Entender e ítemizar con un LLM ---------- */
    const hoy = new Date();
    const hoyISO = hoy.toISOString().slice(0, 10);
    const diaSemana = hoy.toLocaleDateString('es-UY', { weekday: 'long' });

    const sistema = `Sos un asistente de una app familiar del hogar en Uruguay (español rioplatense).
Recibís lo que una persona dictó por voz y tenés que convertirlo en una lista de cosas para anotar en la app.
Hoy es ${diaSemana} ${hoyISO}.

Devolvé SOLO un JSON válido con esta forma exacta:
{"items":[{"name":"...","category":"...","priority":"baja|media|alta","qty":1,"dueDate":"YYYY-MM-DD o null","amount":null}]}

Reglas:
- Una entrada por cada cosa mencionada. Si dice "azúcar y fideos" son DOS items.
- "name": el producto o tarea, corto y en minúscula salvo nombres propios (ej: "azúcar", "papel higiénico", "turno del dentista").
- "category": ELEGÍ una de esta lista y nada más: ${CATEGORIAS.join(', ')}.
  Guía: comida seca/enlatados=despensa; carne/pollo/pescado=carnes; frutas=frutas; verduras=verduras; leche/queso/yogur=lacteos;
  jabón/lavandina/papel higiénico/limpieza=limpieza; refrescos/agua/jugo=bebidas; remedios/farmacia=farmacia; comida/cosas de mascota=mascotas;
  útiles/escuela=escuela; cosas de la nena o para Alma=alma; regalos=regalos; turnos/citas/recordatorios/"acordate"/"anotá para tal día"=recordatorios;
  gastos de plata=gastos; si no encaja=otros; compra genérica=compras.
- "priority": "alta" si dice urgente/ya/se acabó; si no, "media". Casi nunca "baja".
- "qty": número si menciona cantidad (ej "dos panes"→2), si no 1.
- "dueDate": SOLO si menciona un día/fecha (ej "el viernes", "mañana", "el 20"). Resolvelo a fecha real YYYY-MM-DD respecto de hoy. Si no hay fecha, null. Lo que tenga fecha suele ir en category "recordatorios".
- "amount": si menciona un monto de dinero, el número; si no, null.
- Si el audio no tiene nada anotable, devolvé {"items":[]}.
No agregues texto fuera del JSON.`;

    const chatResp = await fetch(`${GROQ}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: transcript },
        ],
      }),
    });
    if (!chatResp.ok) {
      const t = await chatResp.text();
      console.error('[voz] interpretación falló:', t);
      // Igual devolvemos el texto para que la app al menos muestre lo que se entendió
      return res.status(200).json({ transcript, items: [] });
    }
    const chatData = await chatResp.json();
    let parsed = {};
    try { parsed = JSON.parse(chatData.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }

    // Validar / limpiar los items
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

    return res.status(200).json({ transcript, items });
  } catch (err) {
    console.error('[voz] error:', err);
    return res.status(500).json({ error: 'Error procesando el audio' });
  }
};
