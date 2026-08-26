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
  apiKey:            "AIzaSyAVvQ4_JoouZ-3jDEFOaVzwVSgz1dxRpxk",
  authDomain:        "app-casa-261f3.firebaseapp.com",
  projectId:         "app-casa-261f3",
  storageBucket:     "app-casa-261f3.firebasestorage.app",
  messagingSenderId: "159310526936",
  appId:             "1:159310526936:web:27100ffce1bab07579daad",
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

const dataKey = (value = '') => String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

/* ============================================================
   ADAPTADOR NUBE — Firebase Firestore (SDK modular por CDN)
   ============================================================ */
async function createCloudAdapter() {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const fs = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const authMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
  const msgMod  = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js');

  const app = initializeApp(FIREBASE_CONFIG);
  // Cache local persistente: la app abre al instante y aguanta cortes de internet
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });
  const auth = authMod.getAuth(app);

  let itemsCol;
  let pricesCol;
  let invCol;
  let comprasCol;
  let homeCardsCol;
  let usersDoc;
  let homeDoc;
  let tokensDoc;
  let householdContext = null;

  function configureHousehold(context) {
    householdContext = context;
    const prefix = context?.legacy ? null : ['households', context.id];
    const collectionRef = (name) => prefix
      ? fs.collection(db, ...prefix, name)
      : fs.collection(db, name);
    const documentRef = (collectionName, documentName) => prefix
      ? fs.doc(db, ...prefix, collectionName, documentName)
      : fs.doc(db, collectionName, documentName);
    itemsCol = collectionRef('items');
    pricesCol = collectionRef('prices');
    invCol = collectionRef('inventory');
    comprasCol = collectionRef('compras');
    homeCardsCol = collectionRef('homeCards');
    usersDoc = documentRef('meta', 'users');
    homeDoc = documentRef('meta', 'home');
    tokensDoc = documentRef('meta', 'tokens');
  }

  // Compatibilidad: hasta resolver la sesión, las referencias conservan la casa histórica.
  configureHousehold({ id: 'martin-lucia', legacy: true });

  return {
    name: 'nube',

    /* ---- Autenticación (login con Google) ---- */
    authEnabled: true,

    onAuthChange(cb) {
      // Procesa el retorno de signInWithRedirect (móvil) sin romper si falla
      authMod.getRedirectResult(auth).catch((e) => console.warn('[Auth] redirect:', e));
      return authMod.onAuthStateChanged(auth, (user) => {
        cb(user ? { uid: user.uid, email: user.email, name: user.displayName, photo: user.photoURL } : null);
      });
    },

    async signIn() {
      const provider = new authMod.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await authMod.signInWithPopup(auth, provider);
      } catch (e) {
        // En apps instaladas / móviles el popup a veces está bloqueado → probamos redirect
        if (['auth/popup-blocked', 'auth/cancelled-popup-request', 'auth/operation-not-supported-in-this-environment', 'auth/popup-closed-by-user'].includes(e.code)) {
          await authMod.signInWithRedirect(auth, provider);
        } else {
          throw e;
        }
      }
    },

    async signOutUser() {
      await authMod.signOut(auth);
    },

    async getAuthToken() {
      return auth.currentUser ? auth.currentUser.getIdToken() : null;
    },

    getHouseholdId() {
      return householdContext?.id || '';
    },

    configureHousehold,

    async resolveHousehold(user) {
      const account = await fs.getDoc(fs.doc(db, 'accounts', user.uid));
      if (!account.exists()) return null;
      const data = account.data();
      const home = await fs.getDoc(fs.doc(db, 'households', data.householdId));
      if (!home.exists()) return null;
      return { id: data.householdId, profileId: data.profileId || user.uid, legacy: false, ...home.data() };
    },

    async createHousehold(draft, user) {
      const homeRef = fs.doc(fs.collection(db, 'households'));
      const inviteRef = fs.doc(fs.collection(db, 'invites'));
      const ownerProfile = { ...draft.profiles.owner, email: user.email || '', uid: user.uid };
      const profiles = { [user.uid]: ownerProfile, partner: draft.profiles.partner };
      const batch = fs.writeBatch(db);
      batch.set(homeRef, {
        name: draft.name,
        memberUids: [user.uid],
        ownerUid: user.uid,
        inviteId: inviteRef.id,
        createdAt: fs.serverTimestamp(),
      });
      batch.set(fs.doc(homeRef, 'meta', 'users'), profiles);
      batch.set(fs.doc(homeRef, 'meta', 'home'), { cardLabels: { alma: draft.childName } });
      batch.set(fs.doc(db, 'accounts', user.uid), { householdId: homeRef.id, profileId: user.uid });
      batch.set(inviteRef, {
        householdId: homeRef.id, householdName: draft.name, partnerProfile: draft.profiles.partner,
        createdBy: user.uid, active: true, createdAt: fs.serverTimestamp(),
      });
      await batch.commit();
      return { id: homeRef.id, profileId: user.uid, legacy: false, name: draft.name, inviteId: inviteRef.id, memberUids: [user.uid] };
    },

    async joinHousehold(inviteId, user) {
      const inviteRef = fs.doc(db, 'invites', inviteId);
      const invite = await fs.getDoc(inviteRef);
      if (!invite.exists() || invite.data().active !== true) throw new Error('invite-not-found');
      const householdId = invite.data().householdId;
      const inviteData = invite.data();
      const homeRef = fs.doc(db, 'households', householdId);
      const usersRef = fs.doc(homeRef, 'meta', 'users');
      const pending = inviteData.partnerProfile || { name: user.name || 'Mi pareja', emoji: '👤', bg: '#ffe3dc' };
      const batch = fs.writeBatch(db);
      batch.update(homeRef, { memberUids: fs.arrayUnion(user.uid) });
      batch.set(usersRef, {
        partner: fs.deleteField(),
        [user.uid]: { ...pending, pending: false, uid: user.uid, email: user.email || '' },
      }, { merge: true });
      batch.set(fs.doc(db, 'accounts', user.uid), { householdId, profileId: user.uid });
      batch.update(inviteRef, { active: false, usedBy: user.uid, usedAt: fs.serverTimestamp() });
      await batch.commit();
      return { id: householdId, profileId: user.uid, legacy: false, name: inviteData.householdName || 'Nuestro Hogar', memberUids: [inviteData.createdBy, user.uid] };
    },

    subscribeItems(cb) {
      const q = fs.query(itemsCol, fs.orderBy('createdAt', 'desc'));
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

    /* ---- Notificaciones push (Firebase Cloud Messaging) ---- */
    pushSupported() {
      return 'Notification' in window && 'serviceWorker' in navigator && msgMod.isSupported !== undefined;
    },

    /** Pide permiso, obtiene el token del dispositivo y lo guarda para este usuario. */
    async enablePush(vapidKey, userId) {
      if (!(await msgMod.isSupported())) return { ok: false, reason: 'no-soportado' };
      if (Notification.permission === 'denied') return { ok: false, reason: 'bloqueado' };
      const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (perm !== 'granted') return { ok: false, reason: 'sin-permiso' };

      // Ámbito propio: si lo registráramos en la raíz pisaríamos al sw.js
      // que hace andar la app sin conexión.
      const reg = await navigator.serviceWorker.register('firebase-messaging-sw.js', {
        scope: './firebase-cloud-messaging-push-scope',
      });
      const messaging = msgMod.getMessaging(app);
      const token = await msgMod.getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
      if (!token) return { ok: false, reason: 'sin-token' };

      // Guardamos el token bajo el usuario (varios dispositivos posibles)
      await fs.setDoc(tokensDoc, { [userId]: fs.arrayUnion(token) }, { merge: true });
      return { ok: true, token };
    },

    /** Avisos que llegan con la app abierta */
    onPushForeground(cb) {
      msgMod.isSupported().then((ok) => {
        if (!ok) return;
        msgMod.onMessage(msgMod.getMessaging(app), (payload) => cb(payload));
      });
    },

    /** Tokens de todos los usuarios (para saber a quién mandarle) */
    subscribeTokens(cb) {
      return fs.onSnapshot(tokensDoc, (snap) => cb(snap.exists() ? snap.data() : {}));
    },

    /** Saca un token que ya no sirve */
    async removeToken(userId, token) {
      await fs.setDoc(tokensDoc, { [userId]: fs.arrayRemove(token) }, { merge: true });
    },

    /* ---- Personalización del inicio (fotos de tarjetas, portada) ---- */
    subscribeHome(cb) {
      let legacy = {};
      let cards = {};
      const emit = () => cb({ ...legacy, cards: { ...(legacy.cards || {}), ...cards } });
      const unsubLegacy = fs.onSnapshot(homeDoc, (snap) => { legacy = snap.exists() ? snap.data() : {}; emit(); });
      const unsubCards = fs.onSnapshot(homeCardsCol, (snap) => {
        cards = Object.fromEntries(snap.docs.map((doc) => [doc.id, doc.data().photo]));
        emit();
      });
      return () => { unsubLegacy(); unsubCards(); };
    },

    async saveHome(data) {
      if (data.cardId && data.photo) {
        await fs.setDoc(fs.doc(homeCardsCol, data.cardId), { photo: data.photo, updatedAt: fs.serverTimestamp() });
      } else {
        await fs.setDoc(homeDoc, data, { merge: true });
      }
    },

    /* ---- Libreta de precios ---- */
    subscribePrices(cb) {
      const q = fs.query(pricesCol, fs.orderBy('updatedAt', 'desc'));
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

    /* ---- Compras (boletas escaneadas, con su desglose) ---- */
    subscribeCompras(cb) {
      const q = fs.query(comprasCol, fs.orderBy('date', 'desc'));
      return fs.onSnapshot(q, (snap) => {
        cb(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      }, (err) => console.error('[Firestore] error de compras:', err));
    },

    async saveCompra(compra) {
      const { id, ...data } = compra;
      await fs.setDoc(fs.doc(comprasCol, id), { ...data, createdAt: fs.serverTimestamp() });
    },

    async deleteCompra(id) {
      const batch = fs.writeBatch(db);
      batch.delete(fs.doc(comprasCol, id));
      batch.delete(fs.doc(itemsCol, `receipt_${id}`));
      await batch.commit();
    },

    /** Atomically stores a receipt and every derived record. Safe to retry. */
    async saveReceiptBundle(bundle) {
      const receiptRef = fs.doc(comprasCol, bundle.purchase.id);
      const inventoryRefs = bundle.inventory.map((item) => fs.doc(invCol, item.id));
      const priceRefs = bundle.prices.map((product) => fs.doc(pricesCol, product.id));
      return fs.runTransaction(db, async (tx) => {
        const [receiptSnap, inventorySnaps, priceSnaps] = await Promise.all([
          tx.get(receiptRef),
          Promise.all(inventoryRefs.map((ref) => tx.get(ref))),
          Promise.all(priceRefs.map((ref) => tx.get(ref))),
        ]);
        if (receiptSnap.exists()) return { duplicate: true };

        const purchaseData = { ...bundle.purchase };
        delete purchaseData.id;
        tx.set(receiptRef, { ...purchaseData, createdAt: fs.serverTimestamp() });

        bundle.inventory.forEach((item, index) => {
          const current = inventorySnaps[index].exists() ? inventorySnaps[index].data() : {};
          const { id, ...data } = item;
          tx.set(inventoryRefs[index], { ...current, ...data, updatedAt: fs.serverTimestamp() });
        });

        bundle.prices.forEach((product, index) => {
          const current = priceSnaps[index].exists() ? priceSnaps[index].data() : {};
          const entries = [...(current.entries || [])];
          const entryIndex = entries.findIndex((entry) => (entry.storeKey || dataKey(entry.store)) === product.entry.storeKey);
          if (entryIndex >= 0) entries[entryIndex] = product.entry; else entries.push(product.entry);
          tx.set(priceRefs[index], { ...current, name: current.name || product.name, entries, updatedAt: fs.serverTimestamp() });
        });

        if (bundle.expense) {
          const { id, ...data } = bundle.expense;
          tx.set(fs.doc(itemsCol, id), { ...data, createdAt: fs.serverTimestamp() });
        }
        return { duplicate: false };
      });
    },

    /* ---- Inventario (lo que hay en casa) ---- */
    subscribeInventory(cb) {
      const q = fs.query(invCol, fs.orderBy('updatedAt', 'desc'));
      return fs.onSnapshot(q, (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data();
          return { ...data, id: d.id, updatedAt: data.updatedAt?.toMillis?.() ?? data.updatedAt ?? Date.now() };
        });
        cb(list);
      }, (err) => console.error('[Firestore] error de inventario:', err));
    },

    async saveInventoryItem(item) {
      const { id, ...data } = item;
      await fs.setDoc(fs.doc(invCol, id), { ...data, updatedAt: fs.serverTimestamp() });
    },

    async deleteInventoryItem(id) {
      await fs.deleteDoc(fs.doc(invCol, id));
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
  const KEY_INV    = 'nh_inventory';
  const KEY_COMPRAS = 'nh_compras';
  const listeners = { items: new Set(), users: new Set(), prices: new Set(), home: new Set(), inv: new Set(), compras: new Set() };

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
  function emitInv() {
    const list = read(KEY_INV, []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    listeners.inv.forEach((cb) => cb(list));
  }
  function emitCompras() {
    const list = read(KEY_COMPRAS, []).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    listeners.compras.forEach((cb) => cb(list));
  }

  // Cambios hechos en otra pestaña del mismo navegador
  window.addEventListener('storage', (e) => {
    if (e.key === KEY_ITEMS)  emitItems();
    if (e.key === KEY_USERS)  emitUsers();
    if (e.key === KEY_PRICES) emitPrices();
    if (e.key === KEY_HOME)   emitHome();
    if (e.key === KEY_INV)    emitInv();
    if (e.key === KEY_COMPRAS) emitCompras();
  });

  return {
    name: 'local',

    /* ---- Auth: en modo local no hay login (siempre "dentro") ---- */
    authEnabled: false,
    onAuthChange(cb) { cb({ local: true }); return () => {}; },
    async signIn() {},
    async signOutUser() {},
    async getAuthToken() { return null; },
    getHouseholdId() { return 'local'; },
    configureHousehold() {},
    async resolveHousehold() { return { id: 'local', profileId: null, legacy: true }; },
    async createHousehold() { throw new Error('modo-local'); },
    async joinHousehold() { throw new Error('modo-local'); },

    /* ---- Push: no aplica en modo local ---- */
    pushSupported() { return false; },
    async enablePush() { return { ok: false, reason: 'modo-local' }; },
    onPushForeground() {},
    subscribeTokens(cb) { cb({}); return () => {}; },
    async removeToken() {},

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
      if (data.cardId && data.photo) {
        write(KEY_HOME, { ...current, cards: { ...(current.cards || {}), [data.cardId]: data.photo } });
      } else {
        write(KEY_HOME, { ...current, ...data });
      }
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

    /* ---- Compras ---- */
    subscribeCompras(cb) { listeners.compras.add(cb); emitCompras(); return () => listeners.compras.delete(cb); },

    async saveCompra(compra) {
      const list = read(KEY_COMPRAS, []);
      const idx = list.findIndex((c) => c.id === compra.id);
      const doc = { ...compra, createdAt: Date.now() };
      if (idx >= 0) list[idx] = doc; else list.push(doc);
      write(KEY_COMPRAS, list);
      emitCompras();
    },

    async deleteCompra(id) {
      write(KEY_COMPRAS, read(KEY_COMPRAS, []).filter((c) => c.id !== id));
      write(KEY_ITEMS, read(KEY_ITEMS, []).filter((item) => item.id !== `receipt_${id}`));
      emitCompras();
      emitItems();
    },

    async saveReceiptBundle(bundle) {
      const compras = read(KEY_COMPRAS, []);
      if (compras.some((purchase) => purchase.id === bundle.purchase.id)) return { duplicate: true };
      const inventory = read(KEY_INV, []);
      const prices = read(KEY_PRICES, []);
      const items = read(KEY_ITEMS, []);
      const now = Date.now();

      compras.push({ ...bundle.purchase, createdAt: now });
      for (const incoming of bundle.inventory) {
        const index = inventory.findIndex((item) => item.id === incoming.id);
        const value = { ...(index >= 0 ? inventory[index] : {}), ...incoming, updatedAt: now };
        if (index >= 0) inventory[index] = value; else inventory.push(value);
      }
      for (const incoming of bundle.prices) {
        const index = prices.findIndex((product) => product.id === incoming.id);
        const product = index >= 0 ? structuredClone(prices[index]) : { id: incoming.id, name: incoming.name, entries: [] };
        const entryIndex = product.entries.findIndex((entry) => (entry.storeKey || dataKey(entry.store)) === incoming.entry.storeKey);
        if (entryIndex >= 0) product.entries[entryIndex] = incoming.entry; else product.entries.push(incoming.entry);
        product.updatedAt = now;
        if (index >= 0) prices[index] = product; else prices.push(product);
      }
      if (bundle.expense) items.push({ ...bundle.expense, createdAt: now });

      write(KEY_COMPRAS, compras); write(KEY_INV, inventory); write(KEY_PRICES, prices); write(KEY_ITEMS, items);
      emitCompras(); emitInv(); emitPrices(); emitItems();
      return { duplicate: false };
    },

    /* ---- Inventario ---- */
    subscribeInventory(cb) { listeners.inv.add(cb); emitInv(); return () => listeners.inv.delete(cb); },

    async saveInventoryItem(item) {
      const list = read(KEY_INV, []);
      const idx = list.findIndex((p) => p.id === item.id);
      const doc = { ...item, updatedAt: Date.now() };
      if (idx >= 0) list[idx] = doc; else list.push(doc);
      write(KEY_INV, list);
      emitInv();
    },

    async deleteInventoryItem(id) {
      write(KEY_INV, read(KEY_INV, []).filter((p) => p.id !== id));
      emitInv();
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
export const subscribeCompras     = (cb)    => adapter.subscribeCompras(cb);
export const saveCompra           = (c)     => adapter.saveCompra(c);
export const deleteCompra         = (id)    => adapter.deleteCompra(id);
export const saveReceiptBundle    = (data)  => adapter.saveReceiptBundle(data);
export const subscribeInventory   = (cb)    => adapter.subscribeInventory(cb);
export const saveInventoryItem    = (item)  => adapter.saveInventoryItem(item);
export const deleteInventoryItem  = (id)    => adapter.deleteInventoryItem(id);
export const authEnabled    = ()            => adapter.authEnabled;
export const onAuthChange   = (cb)          => adapter.onAuthChange(cb);
export const signIn         = ()            => adapter.signIn();
export const signOutUser    = ()            => adapter.signOutUser();
export const getAuthToken   = ()            => adapter.getAuthToken();
export const getHouseholdId = ()            => adapter.getHouseholdId();
export const configureHousehold = (context) => adapter.configureHousehold(context);
export const resolveHousehold = (user)      => adapter.resolveHousehold(user);
export const createHousehold = (draft, user) => adapter.createHousehold(draft, user);
export const joinHousehold   = (code, user)  => adapter.joinHousehold(code, user);
export const pushSupported     = ()               => adapter.pushSupported();
export const enablePush        = (vapid, userId)  => adapter.enablePush(vapid, userId);
export const onPushForeground  = (cb)             => adapter.onPushForeground(cb);
export const subscribeTokens   = (cb)             => adapter.subscribeTokens(cb);
export const removeToken       = (userId, token)  => adapter.removeToken(userId, token);
