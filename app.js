/* ============================================================
   app.js — Orquestador de "Nuestro Hogar"
   ------------------------------------------------------------
   Estado global, navegación entre vistas, renderizado y
   reacción en tiempo real a los cambios de datos.
   ============================================================ */

import { $, $$, escapeHtml, uid, greeting, randomPhrase, fmtDate, fmtTime, timeAgo, groupBy, debounce, normalize, fmtMoney, compressImage } from './utils/helpers.js';
import { ICONS, CATEGORIES, HOME_CARDS, pickHero, productVisual, productGradient, productGradientDark } from './utils/images.js';
import { initData, subscribeItems, addItem, updateItem, completeItem, restoreItem, deleteItem, subscribeUsers, saveUsers, subscribeHome, saveHome, subscribePrices, savePrice, deletePrice, subscribeInventory, saveInventoryItem, deleteInventoryItem, subscribeCompras, saveCompra, deleteCompra, isCloud, authEnabled, onAuthChange, signIn, signOutUser, enablePush, onPushForeground, subscribeTokens } from './firebase.js';
import { initModal, openModal } from './components/modal.js';
import { initPrices, renderPrices, openPriceModal } from './components/prices.js';
import { initInventory, renderInventory, openInventoryModal } from './components/inventory.js';
import { initVoice, openVoice } from './components/voice.js';
import { initBoleta, openBoleta } from './components/boleta.js';
import { loadSupers, nearestBranch, getLocation, fmtKm } from './utils/supers.js';
import { toast } from './components/toast.js';
import { requestNotifPermission, systemNotify, wasRemindedToday, markReminded } from './utils/notify.js';

/* ================= Estado ================= */
const DEFAULT_USERS = {
  u1: { name: 'Martín', emoji: '👨', bg: '#dbe7ff' },
  u2: { name: 'Lucía',  emoji: '👩', bg: '#ffe3dc' },
};

/* Notificaciones push: llave pública web-push (Firebase → Cloud Messaging)
   y dirección del "cartero" que las manda. */
const VAPID_KEY  = 'BMgNBXFXY6duoOgmOEVtc90f8c4SUwbMmxSCBgy_pHe279qHEXH09Ijwa4bVBYqRr-RUX9CAkOxnUQ2gygMKU60';
const NOTIFY_API = 'https://app-casa-omega.vercel.app/api/notificar';

/* Correos de Google autorizados → a qué perfil corresponde cada uno.
   Solo estas cuentas pueden entrar (la base queda cerrada a ellas).
   ⚠️ Van en minúsculas. */
const ALLOWED_USERS = {
  'martinmolina10101@gmail.com': 'u1',
  // Lucía puede tener varias cuentas → habilitamos todas las candidatas como u2
  'luciia0295@gmail.com':        'u2',
  'brumitta1608@gmail.com':      'u2',
};

const state = {
  items: [],
  prices: [],
  inventory: [],
  compras: [],           // boletas escaneadas con su desglose
  userLoc: null,         // { lat, lon } cuando el usuario comparte ubicación
  supers: null,          // catálogo de supermercados (para distancias)
  tokens: {},            // { u1: [tokens push], u2: [...] } para avisarle al otro
  home: { cards: {} },   // fotos personalizadas de tarjetas: { [cardId]: dataURL }
  users: structuredClone(DEFAULT_USERS),
  me: localStorage.getItem('nh_me') || null,   // 'u1' | 'u2'
  view: 'home',
  activeCard: null,                            // tarjeta abierta en la vista de lista
  search: { text: '', cat: null, prio: null, status: 'pendiente', when: null },
  statusMap: new Map(),                        // id → status previo (para notificaciones)
  firstSnapshot: true,
};

const isDark = () => document.documentElement.dataset.theme === 'dark';
const userOf = (id) => state.users[id] || { name: '—', emoji: '👤', bg: '#eee' };

/** Avatar de un usuario: foto real si la cargó, si no su emoji. */
function avatarHtml(id, cls = 'avatar-mini') {
  const u = userOf(id);
  return u.photo
    ? `<span class="${cls} ${cls}--photo"><img src="${u.photo}" alt=""></span>`
    : `<span class="${cls}">${u.emoji}</span>`;
}
const pending = () => state.items.filter((i) => i.status === 'pendiente');
const done    = () => state.items.filter((i) => i.status === 'completado');

/* ================= Tema claro / oscuro ================= */
function applyTheme(theme, animate = false) {
  if (animate) {
    document.body.classList.add('theme-anim');
    setTimeout(() => document.body.classList.remove('theme-anim'), 600);
  }
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('nh_theme', theme);
  $('#meta-theme').content = theme === 'dark' ? '#0e131c' : '#f7f9fc';
  $('#btn-theme').innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon;
}

function initTheme() {
  const saved = localStorage.getItem('nh_theme');
  const prefers = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved || prefers);
  $('#btn-theme').addEventListener('click', () => applyTheme(isDark() ? 'light' : 'dark', true));
}

/* ================= Portada ================= */
function initHero() {
  const hero = pickHero();
  const img = $('#hero-img');
  img.src = hero.url;
  img.alt = hero.alt;
  img.addEventListener('load', () => img.classList.add('is-loaded'));
  img.addEventListener('error', () => img.remove()); // queda el gradiente de respaldo

  $('#greeting').textContent = greeting();
  $('#phrase').textContent = randomPhrase();
}

function renderHeroStats() {
  const p = pending();
  const urgent = p.filter((i) => i.priority === 'alta').length;
  const today = new Date().toISOString().slice(0, 10);
  const dueSoon = p.filter((i) => i.dueDate && i.dueDate <= today).length;

  const pills = [`<span class="stat-pill">📝 ${p.length} pendiente${p.length === 1 ? '' : 's'}</span>`];
  if (urgent)  pills.push(`<span class="stat-pill">🔥 ${urgent} urgente${urgent === 1 ? '' : 's'}</span>`);
  if (dueSoon) pills.push(`<span class="stat-pill">⏰ ${dueSoon} para hoy</span>`);
  $('#hero-stats').innerHTML = pills.join('');
}

/* ================= Render: tiles compartidos ================= */
function tileHtml(item, cssClass) {
  if (item.photo) return `<div class="${cssClass}"><img src="${item.photo}" alt=""></div>`;
  const grad = isDark() ? productGradientDark(item.name, item.category) : productGradient(item.name, item.category);
  return `<div class="${cssClass}" style="background:${grad}">${productVisual(item.name, item.category)}</div>`;
}

const PRIO_COLOR = { baja: 'var(--green)', media: 'var(--amber)', alta: 'var(--red)' };
const PRIO_LABEL = { baja: 'Baja', media: 'Media', alta: 'Alta' };

const RADIO_KM = 15;   // solo recomendamos súper dentro de este radio

/**
 * Dónde conviene comprar un producto: el más barato de la libreta,
 * pero teniendo en cuenta la cercanía. Si el usuario compartió ubicación,
 * solo considera lugares dentro de RADIO_KM (o de ubicación desconocida,
 * porque son lugares donde igual comprás). Devuelve { store, price, km } o null.
 */
function cheapestFor(name) {
  const prod = state.prices.find((p) => normalize(p.name) === normalize(name));
  if (!prod || !prod.entries?.length) return null;

  const { userLoc, supers } = state;
  let candidatos = prod.entries.map((e) => {
    let km = null;
    if (userLoc && supers) {
      const near = nearestBranch(e.store, userLoc.lat, userLoc.lon, supers);
      km = near ? near.km : null;
    }
    return { store: e.store, price: e.price, km };
  });

  // Con ubicación: quedarse con los que están dentro del radio (o sin ubicación conocida)
  if (userLoc && supers) {
    const cerca = candidatos.filter((c) => c.km == null || c.km <= RADIO_KM);
    if (cerca.length) candidatos = cerca;
  }

  return candidatos.reduce((m, c) => (m == null || c.price < m.price ? c : m), null);
}

/** Texto listo para mostrar el "más barato": "Macromercado · $62 · a 2,8 km" */
function dealText(deal) {
  if (!deal) return '';
  return `${escapeHtml(deal.store)} · ${fmtMoney(deal.price)}${deal.km != null ? ` · a ${fmtKm(deal.km)}` : ''}`;
}

/** Activa la ubicación en toda la app (para recomendar por cercanía) */
async function activarUbicacion() {
  try {
    state.supers = await loadSupers();
    state.userLoc = await getLocation();
    toast('Listo: ahora te recomiendo por precio y cercanía 📍', { emoji: '📍', type: 'success' });
    rerender();
    return true;
  } catch (err) {
    console.warn('[ubicacion]', err);
    const msg = err?.code === 1
      ? 'No diste permiso de ubicación. Habilitalo para recomendar por cercanía.'
      : 'No pude obtener tu ubicación. Probá de nuevo.';
    toast(msg, { emoji: '⚠️', duration: 5000 });
    return false;
  }
}

function itemCardHtml(item, i) {
  const cat = CATEGORIES[item.category] || CATEGORIES.otros;
  const by = userOf(item.createdBy);
  const today = new Date().toISOString().slice(0, 10);
  const deal = item.status === 'pendiente' ? cheapestFor(item.name) : null;
  return `
    <article class="item-card" data-id="${item.id}" style="--i:${i}; --prio-color:${PRIO_COLOR[item.priority] || 'transparent'}">
      ${tileHtml(item, 'item-card__tile')}
      <div class="item-card__body">
        <div class="item-card__name">${escapeHtml(item.name)}${item.qty > 1 ? `<span class="qty">×${item.qty}</span>` : ''}</div>
        ${item.detail ? `<div class="item-card__detail">${escapeHtml(item.detail)}</div>` : ''}
        ${deal ? `<div class="item-card__deal">🏷️ Más barato en ${dealText(deal)}</div>` : ''}
        <div class="item-card__meta">
          <span class="prio-tag prio-tag--${item.priority}">${PRIO_LABEL[item.priority]}</span>
          <span>${cat.emoji} ${cat.label}</span>
          <span>· ${avatarHtml(item.createdBy)} ${escapeHtml(by.name)} · ${timeAgo(item.createdAt)}</span>
          ${item.amount ? `<span class="item-card__amount">${fmtMoney(item.amount)}</span>` : ''}
          ${item.dueDate ? `<span class="item-card__due ${item.dueDate < today ? 'is-late' : ''}">⏰ ${fmtDate(item.dueDate + 'T12:00')}</span>` : ''}
        </div>
      </div>
      <button class="item-more" data-action="edit" aria-label="Editar ${escapeHtml(item.name)}">${ICONS.edit}</button>
      <button class="item-check" data-action="complete" aria-label="Marcar ${escapeHtml(item.name)} como listo">${ICONS.check}</button>
    </article>`;
}

function emptyStateHtml(emoji, title, sub) {
  return `
    <div class="empty-state">
      <span class="empty-state__emoji">${emoji}</span>
      <div class="empty-state__title">${title}</div>
      <div class="empty-state__sub">${sub}</div>
    </div>`;
}

/* Banner destacado de "Escanear boleta" — la función estrella, arriba de todo */
function featuredBoletaHtml() {
  const nComp = state.compras.length;
  return `
    <button class="home-featured" data-card="compras-boletas" aria-label="Escanear boleta">
      <img class="home-featured__img" src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1000&q=80"
           alt="" loading="lazy" onload="this.classList.add('is-loaded')" onerror="this.remove()">
      <span class="home-featured__badge">✨ Escaneo mágico</span>
      <span class="home-featured__body">
        <span class="home-featured__title">📸 Escaneá tu boleta</span>
        <span class="home-featured__sub">Sacá una foto del ticket y cargamos solos el inventario, los precios y el gasto.</span>
        <span class="home-featured__cta">${ICONS.camera} ${nComp ? `${nComp} compra${nComp === 1 ? '' : 's'} · escanear otra` : 'Escanear ahora'}</span>
      </span>
    </button>`;
}

/* ================= Render: Inicio ================= */
function renderHome() {
  const p = pending();
  const cards = HOME_CARDS.map((card, i) => {
    // La de boletas va destacada aparte, no en la grilla
    if (card.special === 'purchases') return '';
    const count = card.special === 'prices'
      ? state.prices.length
      : card.special === 'inventory'
      ? state.inventory.filter((i) => i.status !== 'tengo').length
      : p.filter((it) => card.cats.includes(it.category)).length;
    const customPhoto = state.home.cards?.[card.id];
    const imgSrc = customPhoto || card.img;
    return `
      <button class="home-card" data-card="${card.id}" style="--card-hue:${card.hue}; --i:${i}" aria-label="${card.label}, ${count} pendientes">
        <img class="home-card__img" src="${imgSrc}" alt="" loading="lazy"
             onload="this.classList.add('is-loaded')" onerror="this.remove()">
        <span class="home-card__icon">${ICONS[card.icon]}</span>
        <span class="home-card__count ${count ? '' : 'is-zero'}">${count}</span>
        <span class="home-card__edit" data-edit-card="${card.id}" role="button" tabindex="0" aria-label="Cambiar foto de ${card.label}">${ICONS.camera}</span>
        <span class="home-card__body">
          <span class="home-card__label">${card.label}</span>
          <span class="home-card__tagline">${card.tagline}</span>
        </span>
      </button>`;
  }).join('');
  $('#cards-grid').innerHTML = featuredBoletaHtml() + cards;
  renderHeroStats();
}

/* ================= Render: lista de una tarjeta ================= */
function renderList() {
  const card = HOME_CARDS.find((c) => c.id === state.activeCard);
  if (!card) return;
  const items = pending().filter((it) => card.cats.includes(it.category));
  $('#list-title').textContent = card.label;
  $('#list-count').textContent = items.length ? `${items.length} pendiente${items.length === 1 ? '' : 's'}` : '';
  $('#items-list').innerHTML = items.length
    ? items.map(itemCardHtml).join('')
    : emptyStateHtml('🌿', 'Todo al día', 'No hay nada pendiente por acá.');
}

/* ================= Render: búsqueda ================= */
function renderSearchFilters() {
  $('#filter-cats').innerHTML =
    `<button class="chip ${!state.search.cat ? 'is-active' : ''}" data-fcat="">Todas</button>` +
    Object.entries(CATEGORIES).map(([id, c]) =>
      `<button class="chip ${state.search.cat === id ? 'is-active' : ''}" data-fcat="${id}">${c.emoji} ${c.label}</button>`
    ).join('');

  const s = state.search;
  $('#filter-extra').innerHTML = `
    <button class="chip ${s.status === 'pendiente' ? 'is-active' : ''}" data-fstatus="pendiente">Pendientes</button>
    <button class="chip ${s.status === 'completado' ? 'is-active' : ''}" data-fstatus="completado">Completados</button>
    <button class="chip chip--baja ${s.prio === 'baja' ? 'is-active' : ''}" data-fprio="baja">🟢 Baja</button>
    <button class="chip chip--media ${s.prio === 'media' ? 'is-active' : ''}" data-fprio="media">🟡 Media</button>
    <button class="chip chip--alta ${s.prio === 'alta' ? 'is-active' : ''}" data-fprio="alta">🔴 Alta</button>
    <button class="chip ${s.when === 'hoy' ? 'is-active' : ''}" data-fwhen="hoy">Hoy</button>
    <button class="chip ${s.when === 'semana' ? 'is-active' : ''}" data-fwhen="semana">Últimos 7 días</button>`;
}

function renderSearchResults() {
  const s = state.search;
  const text = normalize(s.text);
  const now = Date.now();

  const results = state.items.filter((it) => {
    if (s.status && it.status !== s.status) return false;
    if (s.cat && it.category !== s.cat) return false;
    if (s.prio && it.priority !== s.prio) return false;
    if (s.when === 'hoy' && now - (it.createdAt || 0) > 24 * 3600e3) return false;
    if (s.when === 'semana' && now - (it.createdAt || 0) > 7 * 24 * 3600e3) return false;
    if (text && !normalize(it.name + ' ' + (it.detail || '')).includes(text)) return false;
    return true;
  });

  $('#search-results').innerHTML = results.length
    ? results.map(itemCardHtml).join('')
    : emptyStateHtml('🔍', 'Sin resultados', 'Probá con otra palabra o filtro.');
}

/* ================= Render: historial ================= */
function renderHistory() {
  const items = done().sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  $('#history-count').textContent = items.length ? `${items.length} completados` : '';

  if (!items.length) {
    $('#history-list').innerHTML = emptyStateHtml('🗂️', 'Historial vacío', 'Lo que completen va a aparecer acá.');
    return;
  }

  const byDay = groupBy(items, (it) => fmtDate(it.completedAt));
  $('#history-list').innerHTML = Object.entries(byDay).map(([day, group]) => `
    <div class="history-day">${day}</div>
    ${group.map((item, i) => {
      const by = userOf(item.createdBy);
      const doneBy = userOf(item.completedBy);
      return `
        <article class="history-item" data-id="${item.id}" style="--i:${i}">
          ${tileHtml(item, 'history-item__tile')}
          <div class="history-item__body">
            <div class="history-item__name">${escapeHtml(item.name)}${item.qty > 1 ? ` ×${item.qty}` : ''}</div>
            <div class="history-item__meta">
              ${avatarHtml(item.createdBy)} agregó <b>${escapeHtml(by.name)}</b> · ${avatarHtml(item.completedBy)} completó <b>${escapeHtml(doneBy.name)}</b> · ${fmtTime(item.completedAt)}
              ${item.amount ? ` · <b>${fmtMoney(item.amount)}</b>` : ''}
            </div>
          </div>
          <div class="history-item__actions">
            <button class="item-more" data-action="restore" aria-label="Restaurar">${ICONS.restore}</button>
            <button class="item-more" data-action="delete" aria-label="Eliminar">${ICONS.trash}</button>
          </div>
        </article>`;
    }).join('')}
  `).join('');
}

/* ================= Render: Boletas / compras ================= */
function renderCompras() {
  const list = state.compras;
  const gastado = list.reduce((a, c) => a + (c.total || 0), 0);
  $('#compras-count').textContent = list.length
    ? `${list.length} compra${list.length === 1 ? '' : 's'} · ${fmtMoney(gastado)}`
    : '';

  $('#compras-list').innerHTML = list.length
    ? list.map((c, i) => {
        const by = userOf(c.createdBy);
        const items = c.items || [];
        return `
          <article class="compra-card" data-id="${c.id}" style="--i:${i}">
            <header class="compra-card__head">
              <div class="compra-card__info">
                <div class="compra-card__store">🏪 ${escapeHtml(c.store || 'Sin lugar')}</div>
                <div class="compra-card__meta">${fmtDate(c.date + 'T12:00')} · ${items.length} producto${items.length === 1 ? '' : 's'} · ${by.emoji} ${escapeHtml(by.name)}</div>
              </div>
              <div class="compra-card__total">${fmtMoney(c.total || 0)}</div>
            </header>
            <details class="compra-card__detalle">
              <summary>Ver desglose</summary>
              <div class="compra-card__items">
                ${items.map((it) => `
                  <div class="compra-line">
                    <span>${(CATEGORIES[it.category] || CATEGORIES.otros).emoji} ${escapeHtml(it.name)}${it.qty > 1 ? ` ×${it.qty}` : ''}</span>
                    <span class="compra-line__price">${fmtMoney(it.lineTotal || it.unitPrice || 0)}</span>
                  </div>`).join('')}
              </div>
              <button class="btn btn--ghost btn--small compra-del" data-action="del-compra">${ICONS.trash} Borrar compra</button>
            </details>
          </article>`;
      }).join('')
    : `<div class="empty-state">
         <span class="empty-state__emoji">🧾</span>
         <div class="empty-state__title">Todavía no escaneaste ninguna boleta</div>
         <div class="empty-state__sub">Sacale foto al ticket del súper y cargamos solos el inventario, los precios y el gasto.</div>
       </div>`;
}

/* ================= Render: Modo Supermercado ================= */
function renderSuper() {
  const items = pending().sort((a, b) => {
    const order = { alta: 0, media: 1, baja: 2 };
    return order[a.priority] - order[b.priority];
  });
  $('#super-sub').textContent = `${items.length} pendiente${items.length === 1 ? '' : 's'}`;
  $('#super-list').innerHTML = items.length
    ? items.map((item, i) => `
      <article class="super-card" data-id="${item.id}" style="--i:${i}">
        ${tileHtml(item, 'super-card__tile')}
        <div class="super-card__body">
          <div class="super-card__name">${escapeHtml(item.name)}</div>
          ${item.detail ? `<div class="super-card__detail">${escapeHtml(item.detail)}</div>` : ''}
          ${(() => { const d = cheapestFor(item.name); return d ? `<div class="super-card__deal">🏷️ Más barato en ${dealText(d)}</div>` : ''; })()}
          <span class="super-card__qty">×${item.qty || 1}</span>
        </div>
        <button class="super-check" data-action="super-complete" aria-label="Marcar ${escapeHtml(item.name)}">${ICONS.check}</button>
      </article>`).join('')
    : emptyStateHtml('🎉', '¡Changuito completo!', 'No queda nada pendiente para comprar.');
}

/* ================= Navegación ================= */
function show(view) {
  state.view = view;
  $$('.view').forEach((v) => v.classList.toggle('is-active', v.id === `view-${view}`));
  $$('.nav-btn[data-nav]').forEach((b) => b.classList.toggle('is-active', b.dataset.nav === view));
  $('#hero').classList.toggle('is-hidden', view !== 'home');
  window.scrollTo({ top: 0 });

  if (view === 'home') renderHome();
  if (view === 'list') renderList();
  if (view === 'prices') renderPrices();
  if (view === 'inventory') renderInventory();
  if (view === 'compras') renderCompras();
  if (view === 'search') { renderSearchFilters(); renderSearchResults(); }
  if (view === 'history') renderHistory();
}

function openSuper() {
  renderSuper();
  const superEl = $('#view-super');
  superEl.hidden = false;
  superEl.classList.remove('is-closing');
  document.body.classList.add('no-scroll');
}

function closeSuper() {
  const superEl = $('#view-super');
  superEl.classList.add('is-closing');
  setTimeout(() => { superEl.hidden = true; document.body.classList.remove('no-scroll'); }, 300);
}

/* ================= Acciones sobre ítems ================= */
async function handleComplete(id, cardEl, doneClass) {
  cardEl.classList.add(doneClass);
  // Espera a que termine la animación antes de persistir
  const item = state.items.find((it) => it.id === id);
  setTimeout(async () => {
    try {
      await completeItem(id, state.me);
      if (item) pushToOther(`${userOf(state.me).name} completó: ${item.name}`, '¡Una cosa menos! ✅');
    } catch (err) {
      console.error(err);
      cardEl.classList.remove(doneClass);
      toast('No se pudo guardar el cambio', { emoji: '⚠️' });
    }
  }, 420);
}

function bindItemActions(container, doneClass = 'item-card--completing') {
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const cardEl = btn.closest('[data-id]');
    const id = cardEl?.dataset.id;
    if (!id) return;
    const item = state.items.find((it) => it.id === id);

    switch (btn.dataset.action) {
      case 'complete':
      case 'super-complete':
        btn.classList.add('is-on');
        handleComplete(id, cardEl, btn.dataset.action === 'super-complete' ? 'super-card--done' : doneClass);
        break;
      case 'edit':
        if (item) openModal(item);
        break;
      case 'restore':
        await restoreItem(id);
        toast(`<b>${escapeHtml(item?.name || '')}</b> volvió a pendientes`, { emoji: '↩️' });
        break;
      case 'delete':
        if (confirm(`¿Eliminar "${item?.name}" definitivamente?`)) {
          await deleteItem(id);
          toast('Eliminado del historial', { emoji: '🗑️' });
        }
        break;
    }
  });
}

/* ================= Notificaciones en tiempo real ================= */
function detectChanges(items) {
  if (state.firstSnapshot) {
    items.forEach((it) => state.statusMap.set(it.id, it.status));
    state.firstSnapshot = false;
    return;
  }

  for (const it of items) {
    const prev = state.statusMap.get(it.id);
    const other = it.createdBy !== state.me;
    const isRecent = Date.now() - (it.createdAt || 0) < 3 * 60e3;

    if (prev === undefined && other && isRecent) {
      const by = userOf(it.createdBy);
      toast(`${by.emoji} <b>${escapeHtml(by.name)}</b> agregó: ${escapeHtml(it.name)}`, { emoji: '✨', type: 'success' });
      systemNotify('Nuestro Hogar', `${by.name} agregó: ${it.name}`);
    }
    if (prev === 'pendiente' && it.status === 'completado' && it.completedBy !== state.me) {
      const by = userOf(it.completedBy);
      toast(`${by.emoji} <b>${escapeHtml(by.name)}</b> completó: ${escapeHtml(it.name)}`, { emoji: '✅' });
      systemNotify('Nuestro Hogar', `${by.name} completó: ${it.name}`);
    }
    state.statusMap.set(it.id, it.status);
  }
}

/* ================= Notificaciones push (al otro) ================= */
const otherUser = () => (state.me === 'u1' ? 'u2' : 'u1');

/** Le manda un aviso al celular del otro, aunque tenga la app cerrada.
    Es "dispará y seguí": si falla, no molesta al usuario. */
function pushToOther(title, body = '') {
  const tokens = state.tokens?.[otherUser()] || [];
  if (!tokens.length || !authEnabled()) return;
  fetch(NOTIFY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokens, title, body }),
  }).catch((err) => console.warn('[push] no se pudo avisar:', err));
}

/** Activa las notificaciones en ESTE dispositivo (necesita gesto del usuario). */
async function activarNotificaciones() {
  if (!authEnabled()) { toast('Las notificaciones andan solo con la nube activada', { emoji: '📴' }); return; }
  if (VAPID_KEY.startsWith('PEGAR_')) { toast('Falta configurar la llave de notificaciones', { emoji: '🔧' }); return; }
  toast('Activando notificaciones…', { emoji: '🔔', duration: 1500 });
  try {
    const r = await enablePush(VAPID_KEY, state.me);
    if (r.ok) {
      toast('¡Listo! Ya te van a llegar avisos 🔔', { emoji: '✅', type: 'success' });
    } else {
      const msgs = {
        'bloqueado': 'Tenés las notificaciones bloqueadas. Habilitalas en los ajustes del navegador.',
        'sin-permiso': 'No diste permiso para las notificaciones.',
        'no-soportado': 'Este dispositivo no soporta notificaciones. En iPhone, instalá la app en la pantalla de inicio.',
        'sin-token': 'No se pudo registrar el dispositivo. Probá de nuevo.',
      };
      toast(msgs[r.reason] || 'No se pudieron activar', { emoji: '⚠️', duration: 5500 });
    }
  } catch (err) {
    console.error('[push]', err);
    toast('No se pudieron activar las notificaciones', { emoji: '⚠️' });
  }
}

/* ================= Recordatorios que avisan ================= */
/** Si hay un recordatorio pendiente cuya fecha ya llegó, avisa (una vez por día). */
function checkReminders() {
  const today = new Date().toISOString().slice(0, 10);
  pending()
    .filter((it) => it.category === 'recordatorios' && it.dueDate && it.dueDate <= today && !wasRemindedToday(it.id))
    .forEach((it) => {
      toast(`⏰ Recordatorio de hoy: <b>${escapeHtml(it.name)}</b>`, { emoji: '⏰', type: 'success', duration: 7000 });
      systemNotify('Recordatorio — Nuestro Hogar', it.name);
      markReminded(it.id);
    });
}

/* ================= Fotos de tarjetas ================= */
/** Abre el selector de archivos y guarda la foto elegida en la tarjeta. */
function pickCardPhoto(cardId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      toast('Procesando foto…', { emoji: '⏳', duration: 1500 });
      const dataUrl = await compressImage(file, 1000, 0.72);
      const cards = { ...(state.home.cards || {}), [cardId]: dataUrl };
      await saveHome({ cards });
      toast('Foto actualizada ✓', { emoji: '📸', type: 'success' });
    } catch (err) {
      console.error(err);
      toast('No se pudo procesar la foto', { emoji: '⚠️' });
    }
  };
  input.click();
}

/* ================= Usuarios ================= */
function renderAvatarBtn() {
  const me = userOf(state.me);
  const btn = $('#btn-user');
  btn.style.setProperty('--avatar-bg', me.bg);
  btn.title = me.name;
  btn.innerHTML = me.photo ? `<img src="${me.photo}" alt="">` : me.emoji;
}

function showUserPicker() {
  $('#user-options').innerHTML = Object.entries(state.users).map(([id, u]) => `
    <button class="user-option" data-user="${id}" style="--user-bg:${u.bg}">
      <span class="user-option__avatar" style="--user-bg:${u.bg}; background:${u.bg}">${u.photo ? `<img src="${u.photo}" alt="">` : u.emoji}</span>
      <span class="user-option__name">${escapeHtml(u.name)}</span>
    </button>`).join('');
  $('#user-overlay').hidden = false;
}

let settingsPhotos = {};  // fotos elegidas en ajustes, sin guardar aún: { [userId]: dataURL }
function showSettings() {
  settingsPhotos = {};
  $('#settings-users').innerHTML = Object.entries(state.users).map(([id, u]) => `
    <div class="settings-user" data-user="${id}">
      <button type="button" class="settings-user__photo" data-photo-user="${id}" style="background:${u.bg}" aria-label="Cambiar foto de ${escapeHtml(u.name)}">
        ${u.photo ? `<img src="${u.photo}" alt="">` : `<span class="settings-user__emoji-preview">${u.emoji}</span>`}
        <span class="settings-user__cam">${ICONS.camera}</span>
      </button>
      <div class="settings-user__fields">
        <input class="settings-user__emoji" maxlength="4" value="${escapeHtml(u.emoji)}" aria-label="Emoji" placeholder="👤">
        <input class="field__input" maxlength="20" value="${escapeHtml(u.name)}" aria-label="Nombre" placeholder="Nombre">
      </div>
    </div>`).join('');
  $('#settings-signout').hidden = !authEnabled();   // "Cerrar sesión" solo en modo nube
  $('#settings-overlay').hidden = false;
}

/* ================= Re-render global ================= */
function rerender() {
  renderHeroStats();
  const badge = $('#super-badge');
  const count = pending().length;
  badge.hidden = !count;
  badge.textContent = count > 99 ? '99+' : count;

  if (state.view === 'home') renderHome();
  if (state.view === 'list') renderList();
  if (state.view === 'prices') renderPrices();
  if (state.view === 'inventory') renderInventory();
  if (state.view === 'compras') renderCompras();
  if (state.view === 'search') renderSearchResults();
  if (state.view === 'history') renderHistory();
  if (!$('#view-super').hidden) renderSuper();
}

/* ================= Login: pantalla de acceso ================= */
/** Navegadores dentro de otras apps (WhatsApp, Instagram…) bloquean el login de Google */
function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /WhatsApp|Instagram|FBAN|FBAV|FB_IAB|Messenger|Line\/|TikTok|Snapchat/i.test(ua);
}

function showInAppBrowserHelp() {
  const overlay = $('#auth-overlay');
  overlay.hidden = false;
  $('#auth-title').textContent = 'Abrí la app en tu navegador';
  $('#auth-sub').innerHTML = 'Estás abriendo el enlace <b>dentro de otra app</b> (como WhatsApp) y ahí Google no deja iniciar sesión.<br><br>Tocá el botón de <b>compartir</b> o los <b>tres puntitos</b> (⋯) y elegí <b>“Abrir en Safari”</b> (o Chrome). O copiá el enlace y pegalo en el navegador.';
  $('#auth-google').hidden = true;
  $('#auth-copylink').hidden = false;
  $('#auth-signout').hidden = true;
}

function showAuthGate(mode, email = '') {
  const overlay = $('#auth-overlay');
  overlay.hidden = false;
  if (mode === 'denied') {
    $('#auth-title').textContent = 'Cuenta sin acceso';
    $('#auth-sub').innerHTML = `La cuenta <b>${escapeHtml(email)}</b> no está habilitada para esta casa. Entrá con la cuenta correcta.`;
    $('#auth-signout').hidden = false;
  } else {
    $('#auth-title').textContent = 'Nuestro Hogar';
    $('#auth-sub').textContent = 'Iniciá sesión para entrar a la casa';
    $('#auth-signout').hidden = true;
  }
}

/* ================= Arranque de datos (una sola vez, tras el login) ================= */
let appStarted = false;
function startApp() {
  if (appStarted) return;   // onAuthChange puede dispararse varias veces
  appStarted = true;

  subscribeUsers((users) => {
    state.users = { ...structuredClone(DEFAULT_USERS), ...users };
    renderAvatarBtn();
    rerender();
  });

  subscribeItems((items) => {
    state.items = items;
    detectChanges(items);
    rerender();
    checkReminders();
  });

  // Mientras la app queda abierta, revisar cada 20 min si cruzó la fecha de algún recordatorio
  setInterval(checkReminders, 20 * 60_000);

  subscribePrices((prices) => {
    state.prices = prices;
    if (state.view === 'prices') renderPrices();
    if (state.view === 'home') renderHome();
  });

  subscribeHome((home) => {
    state.home = { cards: {}, ...home };
    if (state.view === 'home') renderHome();
  });

  subscribeInventory((inv) => {
    state.inventory = inv;
    if (state.view === 'inventory') renderInventory();
    if (state.view === 'home') renderHome();
  });

  subscribeCompras((compras) => {
    state.compras = compras;
    if (state.view === 'compras') renderCompras();
  });

  // Buzones de notificaciones de cada uno
  subscribeTokens((tokens) => { state.tokens = tokens || {}; });

  // Aviso recibido con la app abierta → toast lindo
  onPushForeground((payload) => {
    const n = payload?.notification || {};
    if (n.title) toast(`${escapeHtml(n.title)}${n.body ? ` · ${escapeHtml(n.body)}` : ''}`, { emoji: '🔔', type: 'success' });
  });

  // Usuario actual (en modo nube ya viene del login; en local, elegir)
  if (state.me && (DEFAULT_USERS[state.me] || state.users[state.me])) {
    renderAvatarBtn();
  } else {
    showUserPicker();
  }
}

/* ================= Arranque ================= */
async function boot() {
  // Íconos estáticos declarados en el HTML
  $$('[data-icon]').forEach((el) => { el.innerHTML = ICONS[el.dataset.icon] || ''; });
  $('[data-nav="home"]', $('#view-list')).innerHTML = ICONS.back;
  $('#prices-back').innerHTML = ICONS.back;
  $('#inv-back').innerHTML = ICONS.back;
  $('#compras-back').innerHTML = ICONS.back;
  $('#inv-search-icon').innerHTML = ICONS.search;
  $('#search-icon').innerHTML = ICONS.search;
  $('#super-close').innerHTML = ICONS.close;

  initTheme();
  initHero();
  renderHome();

  // Capa de datos (nube o local)
  await initData();

  // Login: en modo nube exigimos cuenta de Google autorizada; en local se entra directo
  if (authEnabled()) {
    $('#auth-g-icon').innerHTML = ICONS.google;
    $('#auth-google').addEventListener('click', async () => {
      const btn = $('#auth-google');
      btn.disabled = true;
      try { await signIn(); }
      catch (err) {
        console.error('[Auth]', err);
        toast('No se pudo iniciar sesión. Probá de nuevo.', { emoji: '⚠️' });
      } finally { btn.disabled = false; }
    });
    $('#auth-signout').addEventListener('click', () => signOutUser());
    $('#auth-copylink').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.href); toast('Enlace copiado ✓ Pegalo en Safari', { emoji: '📋', type: 'success' }); }
      catch { toast('Copiá el enlace desde la barra de arriba', { emoji: '📋' }); }
    });

    // Dentro de WhatsApp/Instagram el login no funciona → guiamos a abrir en el navegador
    if (isInAppBrowser()) { showInAppBrowserHelp(); return; }

    onAuthChange((user) => {
      if (!user) { showAuthGate('signin'); return; }
      const email = (user.email || '').toLowerCase();
      const mapped = ALLOWED_USERS[email];
      if (!mapped) { showAuthGate('denied', email); return; }
      // Cuenta autorizada
      state.me = mapped;
      localStorage.setItem('nh_me', mapped);
      $('#auth-overlay').hidden = true;
      startApp();
    });
  } else {
    toast('Modo local: falta pegar la config de Firebase para sincronizar entre celulares (ver README)', { emoji: '📴', duration: 6500 });
    startApp();
  }

  // Modal de alta/edición
  initModal(async (item, isEdit) => {
    if (isEdit) {
      const { id, status, completedBy, completedAt, ...patch } = item;
      await updateItem(id, patch);
      toast(`<b>${escapeHtml(item.name)}</b> actualizado`, { emoji: '✏️', type: 'success' });
    } else {
      await addItem({ ...item, createdBy: state.me });
      const deal = cheapestFor(item.name);
      toast(
        deal
          ? `<b>${escapeHtml(item.name)}</b> agregado · 🏷️ más barato en ${dealText(deal)}`
          : `<b>${escapeHtml(item.name)}</b> agregado`,
        { emoji: '✅', type: 'success', duration: deal ? 5000 : 3800 }
      );
      pushToOther(`${userOf(state.me).name} agregó: ${item.name}`, CATEGORIES[item.category]?.label || '');
      requestNotifPermission();
    }
  }, async (id) => {
    await deleteItem(id);
    toast('Elemento eliminado', { emoji: '🗑️' });
  });

  // Inventario
  initInventory({
    getInventory: () => state.inventory,
    getUsers: () => state.users,
    getMe: () => state.me,
    saveInventoryItem,
    deleteInventoryItem,
    isDark,
    addToShopping: (invItem) => addItem({
      id: uid(), name: invItem.name, detail: '', category: invItem.category || 'compras',
      priority: 'media', qty: 1, amount: null, dueDate: null, photo: null,
      status: 'pendiente', completedBy: null, completedAt: null, createdBy: state.me,
    }),
  });

  // Anotar por voz 🎙️
  initVoice({
    getMe: () => state.me,
    addItems: async (items) => {
      for (const it of items) {
        await addItem({
          id: uid(), name: it.name, detail: '', category: it.category || 'compras',
          priority: it.priority || 'media', qty: it.qty || 1,
          amount: it.amount || null, dueDate: it.dueDate || null, photo: null,
          status: 'pendiente', completedBy: null, completedAt: null, createdBy: state.me,
        });
      }
      const nombres = items.map((i) => i.name).slice(0, 3).join(', ');
      pushToOther(
        `${userOf(state.me).name} anotó ${items.length} cosa${items.length === 1 ? '' : 's'}`,
        nombres + (items.length > 3 ? '…' : '')
      );
    },
  });

  // Escanear boletas 📸 → reparte a compras, inventario, precios y gastos
  initBoleta({
    getMe: () => state.me,
    getPrices: () => state.prices,
    getInventory: () => state.inventory,
    savePrice,
    saveInventoryItem,
    saveCompra,
    isDark,
    addGasto: (store, total, date, cantidad) => addItem({
      id: uid(),
      name: `Compra en ${store}`,
      detail: `${cantidad} producto${cantidad === 1 ? '' : 's'} · boleta escaneada`,
      category: 'gastos', priority: 'media', qty: 1,
      amount: total, dueDate: date, photo: null,
      status: 'completado', completedBy: state.me, completedAt: Date.now(),
      createdBy: state.me,
    }),
  });

  // Libreta de precios
  initPrices({
    getPrices: () => state.prices,
    getUsers:  () => state.users,
    getMe:     () => state.me,
    getUserLoc: () => state.userLoc,
    getSupers:  () => state.supers,
    activarUbicacion,
    savePrice,
    deletePrice,
    isDark,
  });

  /* ---------- Eventos globales ---------- */

  // Navegación inferior
  $$('.nav-btn[data-nav]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.nav === 'super-nav') { openSuper(); return; }
      show(b.dataset.nav);
    })
  );
  $('[data-nav="home"]', $('#view-list')).addEventListener('click', () => show('home'));
  $('#prices-back').addEventListener('click', () => show('home'));
  $('#inv-back').addEventListener('click', () => show('home'));
  $('#compras-back').addEventListener('click', () => show('home'));
  $('#btn-escanear').addEventListener('click', openBoleta);

  // Borrar una compra desde su desglose
  $('#compras-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="del-compra"]');
    if (!btn) return;
    const card = btn.closest('.compra-card');
    const compra = state.compras.find((c) => c.id === card?.dataset.id);
    if (!compra) return;
    if (!confirm(`¿Borrar la compra en ${compra.store}? (el inventario y los precios quedan como están)`)) return;
    await deleteCompra(compra.id);
    toast('Compra borrada', { emoji: '🗑️' });
  });

  // FAB → en la libreta de precios abre el modal de precios; si no, el de elementos
  $('#fab').addEventListener('click', () => {
    if (state.view === 'prices') { openPriceModal(); return; }
    if (state.view === 'inventory') { openInventoryModal(); return; }
    const card = state.view === 'list' ? HOME_CARDS.find((c) => c.id === state.activeCard) : null;
    openModal(card ? card.cats[0] : null);
  });

  // Tarjetas del inicio
  $('#cards-grid').addEventListener('click', (e) => {
    // Lapicito de foto: cambiar la imagen de la tarjeta
    const editEl = e.target.closest('[data-edit-card]');
    if (editEl) { e.stopPropagation(); pickCardPhoto(editEl.dataset.editCard); return; }

    // Incluye tanto las tarjetas normales (.home-card) como el banner destacado (.home-featured)
    const cardEl = e.target.closest('[data-card]');
    if (!cardEl) return;
    const card = HOME_CARDS.find((c) => c.id === cardEl.dataset.card);
    if (card?.special === 'purchases') { show('compras'); openBoleta(); return; }
    if (card?.special === 'prices') { show('prices'); return; }
    if (card?.special === 'inventory') { show('inventory'); return; }
    state.activeCard = cardEl.dataset.card;
    show('list');
  });

  // Modo supermercado
  $('#btn-super').addEventListener('click', openSuper);
  $('#super-close').addEventListener('click', closeSuper);

  // Botón de voz
  $('#voice-fab').addEventListener('click', openVoice);

  // Acciones sobre ítems en cada contenedor
  bindItemActions($('#items-list'));
  bindItemActions($('#search-results'));
  bindItemActions($('#history-list'));
  bindItemActions($('#super-list'));

  // Búsqueda instantánea
  $('#search-input').addEventListener('input', debounce((e) => {
    state.search.text = e.target.value;
    renderSearchResults();
  }, 150));

  // Filtros (toggle)
  $('.filter-rows').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const { fcat, fprio, fstatus, fwhen } = chip.dataset;
    if (fcat !== undefined)   state.search.cat    = fcat || null;
    if (fprio !== undefined)  state.search.prio   = state.search.prio === fprio ? null : fprio;
    if (fstatus !== undefined) state.search.status = state.search.status === fstatus ? null : fstatus;
    if (fwhen !== undefined)  state.search.when   = state.search.when === fwhen ? null : fwhen;
    renderSearchFilters();
    renderSearchResults();
  });

  // Selector de usuario
  $('#user-options').addEventListener('click', (e) => {
    const opt = e.target.closest('.user-option');
    if (!opt) return;
    state.me = opt.dataset.user;
    localStorage.setItem('nh_me', state.me);
    $('#user-overlay').hidden = true;
    renderAvatarBtn();
    const me = userOf(state.me);
    toast(`¡Hola, <b>${escapeHtml(me.name)}</b>! ${me.emoji}`, { emoji: '👋', type: 'success' });
    requestNotifPermission();
  });
  // En modo nube la identidad la fija el login → el avatar abre ajustes (no el selector)
  $('#btn-user').addEventListener('click', () => { authEnabled() ? showSettings() : showUserPicker(); });
  $('#btn-edit-users').addEventListener('click', () => { $('#user-overlay').hidden = true; showSettings(); });
  $('#settings-signout').addEventListener('click', () => signOutUser());
  $('#settings-notif').addEventListener('click', activarNotificaciones);

  // Ajustes de usuarios
  $('#settings-cancel').addEventListener('click', () => { $('#settings-overlay').hidden = true; if (!authEnabled()) showUserPicker(); });

  // Tocar el avatar en ajustes → elegir foto
  $('#settings-users').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-photo-user]');
    if (!btn) return;
    const id = btn.dataset.photoUser;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await compressImage(file, 512, 0.8);
        settingsPhotos[id] = dataUrl;
        btn.innerHTML = `<img src="${dataUrl}" alt=""><span class="settings-user__cam">${ICONS.camera}</span>`;
      } catch {
        toast('No se pudo procesar la foto', { emoji: '⚠️' });
      }
    };
    input.click();
  });

  $('#settings-save').addEventListener('click', async () => {
    const updated = {};
    $$('.settings-user').forEach((row) => {
      const id = row.dataset.user;
      const [emojiInput, nameInput] = row.querySelectorAll('input');
      updated[id] = {
        ...state.users[id],
        emoji: emojiInput.value.trim() || state.users[id].emoji,
        name:  nameInput.value.trim()  || state.users[id].name,
        ...(settingsPhotos[id] ? { photo: settingsPhotos[id] } : {}),
      };
    });
    await saveUsers(updated);
    state.users = updated;
    $('#settings-overlay').hidden = true;
    renderAvatarBtn();
    rerender();
    if (!authEnabled()) showUserPicker();
  });

  // Volver a la app: refrescar saludo y contadores
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      $('#greeting').textContent = greeting();
      rerender();
      checkReminders();
    }
  });

  // Service worker (PWA) + auto-actualización
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    let refreshing = false;
    const hadController = !!navigator.serviceWorker.controller;
    // Cuando una versión nueva toma el control, recargamos una sola vez
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing || !hadController) return;   // no recargar en la primera instalación
      refreshing = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // Buscar actualizaciones al abrir y cada vez que la app vuelve al frente
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch((err) => console.warn('[SW]', err));
  }
}

boot();
