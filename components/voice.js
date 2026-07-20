/* ============================================================
   components/voice.js — Anotar por voz 🎙️
   ------------------------------------------------------------
   Grabás un audio, lo mandamos al "cerebro" (función en Vercel
   con Gemini), y te muestra lo que entendió para cargarlo.

   Grabamos en WAV mono 16 kHz con la Web Audio API (funciona
   en Android y iPhone; formato que Gemini entiende siempre).
   ============================================================ */

import { $, $$, escapeHtml, fmtMoney } from '../utils/helpers.js';
import { ICONS, CATEGORIES } from '../utils/images.js';
import { toast } from './toast.js';

// URL del cerebro (función serverless en Vercel)
const VOICE_API = 'https://app-casa-omega.vercel.app/api/voz';

/* deps: { addItems(items), getMe } */
let deps = null;
let overlay = null;

// Estado de grabación
let audioCtx = null, mediaStream = null, processor = null, sourceNode = null;
let chunks = [], recording = false, startedAt = 0, timerId = null;
let reviewItems = [];

/* ============================================================
   Construcción del overlay
   ============================================================ */
function build() {
  overlay = document.createElement('div');
  overlay.className = 'voice-overlay';
  overlay.innerHTML = `
    <div class="voice-sheet" role="dialog" aria-modal="true" aria-label="Anotar por voz">
      <button class="icon-btn voice-close" aria-label="Cerrar">${ICONS.close}</button>

      <!-- Estado: grabando -->
      <div class="voice-stage" id="voice-recording">
        <button class="voice-orb" id="voice-orb" aria-label="Terminar de grabar">
          <span class="voice-orb__pulse"></span>
          <span class="voice-orb__icon">${ICONS.mic}</span>
        </button>
        <div class="voice-timer" id="voice-timer">0:00</div>
        <p class="voice-hint" id="voice-hint">Escuchando… decí qué necesitás</p>
        <p class="voice-sub">Ej: "comprá azúcar y dos leches, y acordate del dentista el viernes"</p>
        <button class="btn btn--primary voice-stop" id="voice-stop">${ICONS.check} Terminé</button>
      </div>

      <!-- Estado: procesando -->
      <div class="voice-stage" id="voice-processing" hidden>
        <div class="voice-spinner"></div>
        <p class="voice-hint">Entendiendo lo que dijiste…</p>
      </div>

      <!-- Estado: consulta "¿dónde compro X?" (top precios) -->
      <div class="voice-stage" id="voice-consulta" hidden>
        <h2 class="voice-review__title" id="voice-consulta-title">¿Dónde comprar?</h2>
        <p class="voice-transcript" id="voice-consulta-transcript"></p>
        <div class="voice-items" id="voice-consulta-list"></div>
        <p class="voice-sub" id="voice-consulta-hint"></p>
        <div class="voice-actions">
          <button class="btn btn--ghost" id="voice-consulta-retry">${ICONS.mic} De nuevo</button>
        </div>
      </div>

      <!-- Estado: revisión -->
      <div class="voice-stage" id="voice-review" hidden>
        <h2 class="voice-review__title">Esto entendí</h2>
        <p class="voice-transcript" id="voice-transcript"></p>
        <div class="voice-items" id="voice-items"></div>
        <div class="voice-actions">
          <button class="btn btn--ghost" id="voice-retry">${ICONS.mic} De nuevo</button>
          <button class="btn btn--primary" id="voice-add">Agregar</button>
        </div>
      </div>

      <!-- Estado: error -->
      <div class="voice-stage" id="voice-error" hidden>
        <span class="voice-error__emoji">😕</span>
        <p class="voice-hint" id="voice-error-msg">No se pudo procesar el audio.</p>
        <button class="btn btn--primary" id="voice-error-retry">${ICONS.mic} Probar de nuevo</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  $('.voice-close', overlay).addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  $('#voice-orb', overlay).addEventListener('click', stopAndSend);
  $('#voice-stop', overlay).addEventListener('click', stopAndSend);
  $('#voice-retry', overlay).addEventListener('click', restart);
  $('#voice-error-retry', overlay).addEventListener('click', restart);
  $('#voice-add', overlay).addEventListener('click', addAll);
  $('#voice-consulta-retry', overlay).addEventListener('click', restart);

  // Elegir dónde comprar (o agregar igual) desde la consulta
  $('#voice-consulta-list', overlay).addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-add]');
    if (!btn) return;
    const product = btn.dataset.add;
    const store = btn.dataset.store || '';
    btn.disabled = true;
    try {
      await deps.addOne(product, store);
      toast(
        store ? `<b>${escapeHtml(product)}</b> agregado · comprar en ${escapeHtml(store)} 🛒` : `<b>${escapeHtml(product)}</b> agregado`,
        { emoji: '✅', type: 'success' }
      );
      close();
    } catch (err) {
      console.error(err);
      toast('No se pudo agregar', { emoji: '⚠️' });
    }
  });
}

function showStage(id) {
  ['voice-recording', 'voice-processing', 'voice-consulta', 'voice-review', 'voice-error']
    .forEach((s) => { $('#' + s, overlay).hidden = (s !== id); });
}

/* ============================================================
   Grabación (Web Audio → WAV 16 kHz mono)
   ============================================================ */
async function startRecording() {
  chunks = [];
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch (err) {
    console.error('[voz] micrófono:', err);
    showError('No pude acceder al micrófono. Dale permiso al navegador y probá de nuevo.');
    return;
  }
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  sourceNode = audioCtx.createMediaStreamSource(mediaStream);
  processor = audioCtx.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (e) => {
    if (recording) chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  sourceNode.connect(processor);
  processor.connect(audioCtx.destination);

  recording = true;
  startedAt = Date.now();
  tick();
  timerId = setInterval(tick, 250);
}

function tick() {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  $('#voice-timer', overlay).textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  // Corte de seguridad: máximo 60 s
  if (s >= 60) stopAndSend();
}

function teardownAudio() {
  recording = false;
  clearInterval(timerId);
  try { processor && processor.disconnect(); } catch {}
  try { sourceNode && sourceNode.disconnect(); } catch {}
  try { mediaStream && mediaStream.getTracks().forEach((t) => t.stop()); } catch {}
  try { audioCtx && audioCtx.close(); } catch {}
  processor = sourceNode = mediaStream = audioCtx = null;
}

async function stopAndSend() {
  if (!recording) return;
  const inRate = audioCtx.sampleRate;
  teardownAudio();

  if (!chunks.length) { showError('No escuché nada. Probá hablar un poco más fuerte.'); return; }
  showStage('voice-processing');

  // Unir + bajar a 16 kHz + WAV + base64
  const flat = flatten(chunks);
  const down = downsample(flat, inRate, 16000);
  const wav = encodeWav(down, 16000);
  const b64 = arrayBufferToBase64(wav);

  try {
    const resp = await fetch(VOICE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: b64, mime: 'audio/wav' }),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();

    // ¿Es una consulta "¿dónde compro X?" en vez de un pedido de anotar?
    if (data.intent === 'consultar' && data.items?.length) {
      renderConsulta(data.transcript, data.items[0].name);
      return;
    }

    reviewItems = data.items || [];
    if (!reviewItems.length) {
      showError(data.transcript ? `Escuché: "${data.transcript}" pero no encontré nada para anotar.` : 'No encontré nada para anotar. Probá de nuevo.');
      return;
    }
    renderReview(data.transcript, reviewItems);
  } catch (err) {
    console.error('[voz] envío:', err);
    showError('No me pude conectar con el asistente. Fijate que tengas internet y probá de nuevo.');
  }
}

/* ---------- Consulta: "¿dónde compro X?" → top precios ---------- */
function fmtKmShort(km) {
  if (km == null) return '';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function placeRow(store, product, price, km, medal) {
  return `
    <button class="voice-item voice-consulta-place" data-store="${escapeHtml(store)}" data-add="${escapeHtml(product)}">
      <span class="voice-consulta-medal">${medal}</span>
      <span class="voice-item__body">
        <span class="voice-item__name">${escapeHtml(store)}</span>
        ${km ? `<span class="voice-item__cat">📍 a ${km}</span>` : ''}
      </span>
      <span class="voice-consulta-price">${fmtMoney(price)}</span>
    </button>`;
}

async function renderConsulta(transcript, product) {
  $('#voice-consulta-title', overlay).textContent = `¿Dónde comprar ${product}?`;
  $('#voice-consulta-transcript', overlay).textContent = transcript ? `“${transcript}”` : '';
  const list = $('#voice-consulta-list', overlay);
  const hint = $('#voice-consulta-hint', overlay);

  // Mostramos la etapa con un "comparando…" mientras junta todo (tus precios + online)
  list.innerHTML = `<div class="voice-online-loading">💰 Comparando precios…</div>`;
  hint.textContent = '';
  showStage('voice-consulta');

  const all = await deps.comparePrices(product);   // ya viene ordenado de más barato a más caro
  if (!list.isConnected || $('#voice-consulta', overlay).hidden) return;   // el usuario cerró/cambió

  const medals = ['🥇', '🥈', '🥉'];
  let html = '';

  if (all.length) {
    html += `<div class="voice-explore-title">💰 Dónde está más barato</div>`;
    html += all.map((c, i) => {
      const km = fmtKmShort(c.km);
      const tag = c.source === 'online' ? '🌐 online hoy' : '🧾 tu precio';
      return `
        <button class="voice-item voice-consulta-place ${c.source === 'online' ? 'voice-online-place' : ''}" data-store="${escapeHtml(c.store)}" data-add="${escapeHtml(product)}">
          <span class="voice-consulta-medal">${medals[i] || '•'}</span>
          <span class="voice-item__body">
            <span class="voice-item__name">${escapeHtml(c.store)}</span>
            <span class="voice-item__cat">${tag}${km ? ` · 📍 a ${km}` : ''}</span>
          </span>
          <span class="voice-consulta-price">${fmtMoney(c.price)}</span>
        </button>`;
    }).join('');
  } else {
    html += `<div class="voice-consulta-empty">Todavía no tengo precios de <b>${escapeHtml(product)}</b>. Escaneá una boleta o mirá abajo qué súper tenés cerca.</div>`;
  }

  // Cerca tuyo para explorar (sin precio cargado)
  const cerca = deps.nearbyStores ? deps.nearbyStores(all.map((c) => c.store)) : [];
  if (cerca.length) {
    html += `<div class="voice-explore-title">📍 Cerca tuyo (todavía sin precio)</div>`;
    html += cerca.map((c) => `
      <button class="voice-item voice-explore-place" data-store="${escapeHtml(c.name)}" data-add="${escapeHtml(product)}">
        <span class="voice-consulta-medal">🏬</span>
        <span class="voice-item__body">
          <span class="voice-item__name">${escapeHtml(c.name)}</span>
          <span class="voice-item__cat">📍 a ${fmtKmShort(c.km)} · andá y escaneá para comparar</span>
        </span>
      </button>`).join('');
  }

  html += `<button class="btn btn--primary voice-consulta-full" data-add="${escapeHtml(product)}">➕ Agregar a la lista</button>`;

  list.innerHTML = html;
  hint.textContent = all.length ? 'Tocá dónde lo comprás y lo agrego a la lista 👇' : '';
}

/* ---------- Revisión de lo entendido ---------- */
function renderReview(transcript, items) {
  $('#voice-transcript', overlay).textContent = transcript ? `“${transcript}”` : '';
  $('#voice-items', overlay).innerHTML = items.map((it, i) => {
    const cat = CATEGORIES[it.category] || CATEGORIES.otros;
    const extra = [
      it.qty > 1 ? `×${it.qty}` : '',
      it.priority === 'alta' ? '🔴' : '',
      it.dueDate ? `⏰ ${it.dueDate.slice(8, 10)}/${it.dueDate.slice(5, 7)}` : '',
    ].filter(Boolean).join(' ');
    return `
      <label class="voice-item" data-i="${i}">
        <span class="voice-item__tile">${cat.emoji}</span>
        <span class="voice-item__body">
          <span class="voice-item__name">${escapeHtml(it.name)}</span>
          <span class="voice-item__cat">${cat.label}${extra ? ' · ' + extra : ''}</span>
        </span>
        <input type="checkbox" class="voice-item__check" checked>
      </label>`;
  }).join('');
  showStage('voice-review');
}

async function addAll() {
  const chosen = [];
  $$('.voice-item', overlay).forEach((row) => {
    if (row.querySelector('.voice-item__check').checked) chosen.push(reviewItems[+row.dataset.i]);
  });
  if (!chosen.length) { close(); return; }
  const btn = $('#voice-add', overlay);
  btn.disabled = true;
  try {
    await deps.addItems(chosen);
    toast(`${chosen.length} cosa${chosen.length === 1 ? '' : 's'} anotada${chosen.length === 1 ? '' : 's'} por voz 🎙️`, { emoji: '✅', type: 'success' });
    close();
  } catch (err) {
    console.error(err);
    toast('No se pudieron guardar. Probá de nuevo.', { emoji: '⚠️' });
  } finally {
    btn.disabled = false;
  }
}

function showError(msg) {
  $('#voice-error-msg', overlay).textContent = msg;
  showStage('voice-error');
}

function restart() {
  showStage('voice-recording');
  $('#voice-timer', overlay).textContent = '0:00';
  startRecording();
}

/* ============================================================
   API pública
   ============================================================ */
export function initVoice(dependencies) {
  deps = dependencies;
  if (!overlay) build();
}

export function openVoice() {
  overlay.classList.add('is-open');
  document.body.classList.add('no-scroll');
  showStage('voice-recording');
  $('#voice-timer', overlay).textContent = '0:00';
  startRecording();
}

function close() {
  teardownAudio();
  overlay.classList.remove('is-open');
  document.body.classList.remove('no-scroll');
}

/* ============================================================
   Utilidades de audio
   ============================================================ */
function flatten(buffers) {
  let len = 0;
  for (const b of buffers) len += b.length;
  const out = new Float32Array(len);
  let off = 0;
  for (const b of buffers) { out.set(b, off); off += b.length; }
  return out;
}

function downsample(buffer, inRate, outRate) {
  if (outRate >= inRate) return buffer;
  const ratio = inRate / outRate;
  const newLen = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLen);
  let pos = 0, i = 0;
  while (i < newLen) {
    const next = Math.round((i + 1) * ratio);
    let sum = 0, count = 0;
    for (let j = pos; j < next && j < buffer.length; j++) { sum += buffer[j]; count++; }
    result[i] = count ? sum / count : 0;
    pos = next; i++;
  }
  return result;
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);       // PCM
  view.setUint16(22, 1, true);       // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
