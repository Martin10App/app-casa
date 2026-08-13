import { $, escapeHtml, fmtMoney } from '../utils/helpers.js';
import { ICONS } from '../utils/images.js';
import { toast } from './toast.js';

let deps;
let reader;
let cameraControls;
let searching = false;
let lastFocus = null;
let currentProduct = null;
let libraryPromise;
let generation = 0;

function digits(value = '') { return String(value).replace(/\D/g, ''); }
function acceptableCode(value = '') { return [8, 12, 13, 14].includes(digits(value).length); }

function safeUrl(value = '') {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

function loadReaderLibrary() {
  if (window.ZXingBrowser?.BrowserMultiFormatReader) return Promise.resolve();
  if (libraryPromise) return libraryPromise;
  libraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './vendor/zxing-browser.min.js';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => { libraryPromise = null; reject(new Error('ZXING_LOAD_FAILED')); };
    document.head.appendChild(script);
  });
  return libraryPromise;
}

function stopCamera() {
  try { cameraControls?.stop(); } catch { /* ya estaba detenida */ }
  cameraControls = null;
  const video = $('#barcode-video');
  for (const track of video?.srcObject?.getTracks?.() || []) track.stop();
  if (video) video.srcObject = null;
}

function setStatus(text, state = '') {
  const el = $('#barcode-status');
  el.textContent = text;
  el.dataset.state = state;
}

function clearResult() {
  currentProduct = null;
  $('#barcode-result').hidden = true;
  $('#barcode-result').innerHTML = '';
  $('#barcode-error').textContent = '';
}

function priceRows(rows, type) {
  if (!rows.length) return '';
  const heading = type === 'exact' ? 'Mismo código encontrado' : 'Precios comparables';
  return `<section class="barcode-prices"><h3>${heading}</h3>${rows.slice(0, 6).map((row, index) => {
    const link = safeUrl(row.link);
    return `<div class="barcode-price ${index === 0 ? 'is-best' : ''}">
      <div><b>${escapeHtml(row.store)}</b><small>${escapeHtml(row.product || '')}</small></div>
      <strong>${fmtMoney(row.price)}</strong>
      ${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" aria-label="Ver precio en ${escapeHtml(row.store)}">Ver</a>` : '<span></span>'}
    </div>`;
  }).join('')}</section>`;
}

function renderResult(data) {
  const result = $('#barcode-result');
  const product = data.product;
  if (!product) {
    result.innerHTML = `<div class="barcode-empty">${ICONS.search}<h3>No encontramos este producto</h3><p>El código es válido, pero todavía no aparece en los catálogos consultados. Podés probar con otro o agregarlo a mano arriba.</p></div>`;
    result.hidden = false;
    setStatus(`Código ${escapeHtml(data.barcode)} sin coincidencias`, 'warning');
    return;
  }
  currentProduct = product;
  const image = safeUrl(product.image);
  const exact = data.exactResults || [];
  const comparable = (data.comparableResults || []).filter((row) => !exact.some((item) => String(item.store).toLowerCase() === String(row.store).toLowerCase()));
  result.innerHTML = `
    <div class="barcode-product">
      <div class="barcode-product__image">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}">` : ICONS.barcode}</div>
      <div><span>Código ${escapeHtml(data.barcode)}</span><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml([product.brand, product.quantity].filter(Boolean).join(' · '))}</p></div>
    </div>
    ${priceRows(exact, 'exact')}
    ${priceRows(comparable, 'comparable')}
    ${!exact.length && !comparable.length ? '<p class="barcode-no-prices">Reconocimos el producto, pero no encontramos un precio actual en Las Piedras.</p>' : ''}
    <p class="barcode-note">“Mismo código” es el producto idéntico. “Comparable” puede variar en marca o presentación: revisalo antes de comprar.</p>
    <button class="btn btn--primary barcode-add" id="barcode-add" type="button">${ICONS.plus} Agregar a la lista</button>`;
  result.hidden = false;
  setStatus(exact.length ? `Encontrado en ${exact.length} comercio${exact.length === 1 ? '' : 's'} por código` : 'Producto reconocido; mostrando opciones comparables', 'success');
  $('#barcode-add').addEventListener('click', addCurrentProduct);
}

async function searchCode(rawCode) {
  const code = digits(rawCode);
  $('#barcode-input').value = code;
  $('#barcode-error').textContent = '';
  if (!acceptableCode(code)) {
    $('#barcode-error').textContent = 'Revisá el código: debe tener 8, 12, 13 o 14 números.';
    $('#barcode-input').focus();
    return;
  }
  if (searching) return;
  const requestGeneration = ++generation;
  searching = true;
  stopCamera();
  clearResult();
  $('#barcode-search').disabled = true;
  setStatus('Buscando el producto y sus precios…', 'loading');
  try {
    const data = await deps.lookupBarcode(code);
    if (requestGeneration === generation && !$('#barcode-sheet').hidden) renderResult(data);
  } catch (error) {
    console.warn('[código de barras]', error);
    setStatus('No pudimos consultar los precios. Revisá tu conexión y probá otra vez.', 'error');
  } finally {
    if (requestGeneration === generation) {
      searching = false;
      $('#barcode-search').disabled = false;
    }
  }
}

async function startCamera() {
  const cameraGeneration = generation;
  stopCamera();
  setStatus('Dale permiso a la cámara y apuntá al código…');
  try {
    await loadReaderLibrary();
    if (cameraGeneration !== generation || $('#barcode-sheet').hidden) return;
    reader ||= new window.ZXingBrowser.BrowserMultiFormatReader();
    cameraControls = await reader.decodeFromConstraints(
      { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      $('#barcode-video'),
      (result) => { if (result && !searching) searchCode(result.getText()); },
    );
    if (cameraGeneration !== generation || $('#barcode-sheet').hidden) { stopCamera(); return; }
    setStatus('Alineá las barras dentro del recuadro');
  } catch (error) {
    console.warn('[cámara código]', error);
    setStatus('No pudimos abrir la cámara. Elegí una foto o escribí el código.', 'warning');
  }
}

async function scanFile(file) {
  if (!file) return;
  stopCamera();
  clearResult();
  setStatus('Leyendo el código de la foto…', 'loading');
  const url = URL.createObjectURL(file);
  try {
    await loadReaderLibrary();
    reader ||= new window.ZXingBrowser.BrowserMultiFormatReader();
    const result = await reader.decodeFromImageUrl(url);
    await searchCode(result.getText());
  } catch (error) {
    console.warn('[foto código]', error);
    setStatus('No se distingue un código en esa foto. Acercate, evitá reflejos y probá de nuevo.', 'warning');
  } finally {
    URL.revokeObjectURL(url);
    $('#barcode-file').value = '';
  }
}

async function addCurrentProduct() {
  if (!currentProduct || searching) return;
  const button = $('#barcode-add');
  button.disabled = true;
  button.textContent = 'Agregando…';
  try {
    const saved = await deps.addScannedItem(currentProduct.name);
    toast(saved.duplicate ? `<b>${escapeHtml(saved.name)}</b> ahora son ${saved.qty}` : `<b>${escapeHtml(saved.name)}</b> agregado a la lista`, { emoji: '✓', type: 'success' });
    closeBarcodeScanner();
  } catch (error) {
    console.error('[agregar escaneado]', error);
    toast('No se pudo agregar. Probá de nuevo.', { emoji: '⚠️' });
    button.disabled = false;
    button.innerHTML = `${ICONS.plus} Agregar a la lista`;
  }
}

export function openBarcodeScanner() {
  generation += 1;
  searching = false;
  lastFocus = document.activeElement;
  const sheet = $('#barcode-sheet');
  sheet.hidden = false;
  document.body.classList.add('no-scroll');
  clearResult();
  $('#barcode-input').value = '';
  $('#barcode-search').disabled = false;
  $('#barcode-camera').hidden = false;
  $('#barcode-close').focus({ preventScroll: true });
  startCamera();
}

export function closeBarcodeScanner() {
  generation += 1;
  searching = false;
  stopCamera();
  $('#barcode-sheet').hidden = true;
  document.body.classList.toggle('no-scroll', !$('#view-super').hidden);
  lastFocus?.focus?.();
}

export function initBarcodeScanner(dependencies) {
  deps = dependencies;
  $('#super-scan').addEventListener('click', openBarcodeScanner);
  $('#barcode-close').innerHTML = ICONS.close;
  $('#barcode-close').addEventListener('click', closeBarcodeScanner);
  $('[data-barcode-close]').addEventListener('click', closeBarcodeScanner);
  $('#barcode-photo').addEventListener('click', () => $('#barcode-file').click());
  $('#barcode-file').addEventListener('change', (event) => scanFile(event.target.files?.[0]));
  $('#barcode-input').addEventListener('input', (event) => { event.target.value = digits(event.target.value); });
  $('#barcode-manual').addEventListener('submit', (event) => { event.preventDefault(); searchCode($('#barcode-input').value); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#barcode-sheet').hidden) closeBarcodeScanner();
  });
}
