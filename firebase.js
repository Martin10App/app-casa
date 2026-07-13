/* ============================================================
   firebase.js — Capa de datos de "Nuestro Hogar"
   ------------------------------------------------------------
   ▸ MODO NUBE (Firebase Firestore): sincronización en tiempo
     real entre todos los dispositivos. Para activarlo, pegá tu
     configuración en FIREBASE_CONFIG (ver README.md).

   ▸ MODO LOCAL (automático): si todavía no configuraste
     Firebase, la app funciona igual guardando en localStorage.
     Así podés probarla ya mismo; al pegar la config, todo lo
     demás queda idéntico.

   La app solo usa la API exportada al final (initData, addItem,
   etc.) — nunca habla con Firestore directamente.
   ============================================================ */

/* 🔑 PEGÁ ACÁ TU CONFIGURACIÓN DE FIREBASE (Consola → Configuración
   del proyecto → Tus apps → SDK de Firebase → Configuración) */
const FIREBASE_CONFIG = {
  apiKey:            "TU_API_KEY",
  authDomain:        "TU_PROYECTO.firebaseapp.com",
  projectId:         "TU_PROYECTO",
  storageBucket:     "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId:             "TU_APP_ID",
};

/** ¿Hay configuración real de Firebase? */
export const isCloud = !FIREBASE_CONFIG.apiKey.startsWith('TU_');

/* ------------------------------------------------------------
   Estructura de un ítem:
   {
     id, name, detail, category, priority ('baja'|'media'|'alta'),
     status ('pendiente'|'completado'),
     qty (número), amount (para gastos), dueDate (recordatorios),
     photo (dataURL comprimido o null),
     createdBy, createdAt, completedBy, completedAt
   }
   ------------------------------------------------------------ */

let adapter = null;

/* ============================================================
   ADAPTADOR NUBE — Firebase Firestore (SDK modular por CDN)
   ============================================================ */
async function createCloudAdapter() {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const fs = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  const app = initializeApp(FIREBASE_CONFIG);
  // Cache local persistente: la app abre al instante y aguanta cortes de internet
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });

  const itemsCol  = fs.collection(db, 'items');
  const pricesCol = fs.collection(db, 'prices');
  const usersDoc  = fs.doc(db, 'meta', 'users');
  const homeDoc   = fs.doc(db, 'meta', 'home');

  return {
    name: 'nube',

    subscribeItems(cb) {
      const q = fs.query(itemsCol, fs.orderBy('createdAt', 'desc'), fs.limit(500));
      return fs.onSnapshot(q, (snap) => {
        const items = snap.docs.map((d) => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            // Timestamps de Firestore → milisegundos
            createdAt:   data.createdAt?.toMillis?.()   ?? data.createdAt   ?? Date.now(),
            completedAt: data.completedAt?.toMillis?.() ?? data.completedAt ?? null,
          };
        });
        cb(items);
      }, (err) => console.error('[Firestore] error de suscripción:', err));
    },

    async addItem(item) {
      const { id, ...data } = item;
      await fs.setDoc(fs.doc(itemsCol, id), { ...data, createdAt: fs.serverTimestamp() });
    },

    async updateItem(id, patch) {
      await fs.updateDoc(fs.doc(itemsCol, id), patch);
    },

    async completeItem(id, userId) {
      await fs.updateDoc(fs.doc(itemsCol, id), {
        status: 'completado', completedBy: userId, completedAt: fs.serverTimestamp(),
      });
    },

    async restoreItem(id) {
      await fs.updateDoc(fs.doc(itemsCol, id), {
        status: 'pendiente', completedBy: null, completedAt: null,
      });
    },

    async deleteItem(id) {
      await fs.deleteDoc(fs.doc(itemsCol, id));
    },

    subscribeUsers(cb) {
      return fs.onSnapshot(usersDoc, (snap) => { if (snap.exists()) cb(snap.data()); });
    },

    async saveUsers(users) {
      await fs.setDoc(usersDoc, users);
    },

    /* ---- Personalización del inicio (fotos de tarjetas, portada) ---- */
    subscribeHome(cb) {
      return fs.onSnapshot(homeDoc, (snap) => { if (snap.exists()) cb(snap.data()); });
    },

    async saveHome(data) {
      await fs.setDoc(homeDoc, data, { merge: true });
    },

    /* ---- Libreta de precios ---- */
    subscribePrices(cb) {
      const q = fs.query(pricesCol, fs.orderBy('updatedAt', 'desc'), fs.limit(300));
      return fs.onSnapshot(q, (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data();
          return { ...data, id: d.id, updatedAt: data.updatedAt?.toMillis?.() ?? data.updatedAt ?? Date.now() };
        });
        cb(list);
      }, (err) => console.error('[Firestore] error de precios:', err));
    },

    async savePrice(product) {
      const { id, ...data } = product;
      await fs.setDoc(fs.doc(pricesCol, id), { ...data, updatedAt: fs.serverTimestamp() });
    },

    async deletePrice(id) {
      await fs.deleteDoc(fs.doc(pricesCol, id));
    },
  };
}

/* ============================================================
   ADAPTADOR LOCAL — localStorage (modo prueba sin Firebase)
   Sincroniza entre pestañas del mismo dispositivo vía
   el evento 'storage'.
   ============================================================ */
function createLocalAdapter() {
  const KEY_ITEMS  = 'nh_items';
  const KEY_USERS  = 'nh_users';
  const KEY_PRICES = 'nh_prices';
  const KEY_HOME   = 'nh_home';
  const listeners = { items: new Set(), users: new Set(), prices: new Set(), home: new Set() };

  const read  = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  function emitItems() {
    const items = read(KEY_ITEMS, []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    listeners.items.forEach((cb) => cb(items));
  }
  function emitUsers() {
    const users = read(KEY_USERS, null);
    if (users) listeners.users.forEach((cb) => cb(users));
  }
  function emitPrices() {
    const list = read(KEY_PRICES, []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    listeners.prices.forEach((cb) => cb(list));
  }
  function emitHome() {
    const data = read(KEY_HOME, null);
    if (data) listeners.home.forEach((cb) => cb(data));
  }

  // Cambios hechos en otra pestaña del mismo navegador
  window.addEventListener('storage', (e) => {
    if (e.key === KEY_ITEMS)  emitItems();
    if (e.key === KEY_USERS)  emitUsers();
    if (e.key === KEY_PRICES) emitPrices();
    if (e.key === KEY_HOME)   emitHome();
  });

  return {
    name: 'local',

    subscribeItems(cb) { listeners.items.add(cb); emitItems(); return () => listeners.items.delete(cb); },

    async addItem(item) {
      const items = read(KEY_ITEMS, []);
      items.push({ ...item, createdAt: Date.now() });
      write(KEY_ITEMS, items);
      emitItems();
    },

    async updateItem(id, patch) {
      const items = read(KEY_ITEMS, []).map((it) => (it.id === id ? { ...it, ...patch } : it));
      write(KEY_ITEMS, items);
      emitItems();
    },

    async completeItem(id, userId) {
      await this.updateItem(id, { status: 'completado', completedBy: userId, completedAt: Date.now() });
    },

    async restoreItem(id) {
      await this.updateItem(id, { status: 'pendiente', completedBy: null, completedAt: null });
    },

    async deleteItem(id) {
      write(KEY_ITEMS, read(KEY_ITEMS, []).filter((it) => it.id !== id));
      emitItems();
    },

    subscribeUsers(cb) { listeners.users.add(cb); emitUsers(); return () => listeners.users.delete(cb); },

    async saveUsers(users) { write(KEY_USERS, users); emitUsers(); },

    /* ---- Personalización del inicio ---- */
    subscribeHome(cb) { listeners.home.add(cb); emitHome(); return () => listeners.home.delete(cb); },

    async saveHome(data) {
      const current = read(KEY_HOME, {});
      write(KEY_HOME, { ...current, ...data });
      emitHome();
    },

    /* ---- Libreta de precios ---- */
    subscribePrices(cb) { listeners.prices.add(cb); emitPrices(); return () => listeners.prices.delete(cb); },

    async savePrice(product) {
      const list = read(KEY_PRICES, []);
      const idx = list.findIndex((p) => p.id === product.id);
      const doc = { ...product, updatedAt: Date.now() };
      if (idx >= 0) list[idx] = doc; else list.push(doc);
      write(KEY_PRICES, list);
      emitPrices();
    },

    async deletePrice(id) {
      write(KEY_PRICES, read(KEY_PRICES, []).filter((p) => p.id !== id));
      emitPrices();
    },
  };
}

/* ============================================================
   API PÚBLICA — lo único que usa el resto de la app
   ============================================================ */

/** Inicializa la capa de datos (elige nube o local automáticamente) */
export async function initData() {
  if (adapter) return adapter;
  if (isCloud) {
    try {
      adapter = await createCloudAdapter();
    } catch (err) {
      console.error('[Firebase] No se pudo inicializar, usando modo local:', err);
      adapter = createLocalAdapter();
    }
  } else {
    adapter = createLocalAdapter();
  }
  console.info(`[Nuestro Hogar] Capa de datos: modo ${adapter.name}`);
  return adapter;
}

export const subscribeItems = (cb)          => adapter.subscribeItems(cb);
export const addItem        = (item)        => adapter.addItem(item);
export const updateItem     = (id, patch)   => adapter.updateItem(id, patch);
export const completeItem   = (id, userId)  => adapter.completeItem(id, userId);
export const restoreItem    = (id)          => adapter.restoreItem(id);
export const deleteItem     = (id)          => adapter.deleteItem(id);
export const subscribeUsers = (cb)          => adapter.subscribeUsers(cb);
export const saveUsers      = (users)       => adapter.saveUsers(users);
export const subscribeHome  = (cb)          => adapter.subscribeHome(cb);
export const saveHome       = (data)        => adapter.saveHome(data);
export const subscribePrices = (cb)         => adapter.subscribePrices(cb);
export const savePrice      = (product)     => adapter.savePrice(product);
export const deletePrice    = (id)          => adapter.deletePrice(id);
