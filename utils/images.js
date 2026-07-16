/* ============================================================
   utils/images.js — Catálogo visual: categorías, portadas
   e imágenes automáticas de productos.
   Nunca dejamos un espacio vacío: si no hay foto, hay un
   tile premium con gradiente + emoji/ícono.
   ============================================================ */

/* ---------- Íconos SVG (trazo consistente, estilo Lucide) ---------- */
export const ICONS = {
  cart:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1.5"/><circle cx="19" cy="21" r="1.5"/><path d="M2.5 3h2l2.4 12.3a2 2 0 0 0 2 1.7h9.7a2 2 0 0 0 2-1.6L22 7H6"/></svg>',
  food:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2v9M4.5 2v4.5a2.5 2.5 0 0 0 5 0V2"/><path d="M17 2c-2 2.5-2.5 5.5-2.5 8H17v12"/><path d="M7 11v11"/></svg>',
  spark:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/></svg>',
  drink:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l-1.5 17a2 2 0 0 1-2 1.8h-5A2 2 0 0 1 7.5 20z"/><path d="M6.6 10h10.8"/></svg>',
  gift:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>',
  pharmacy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5-7-7a4.95 4.95 0 1 1 7-7l7 7a4.95 4.95 0 1 1-7 7z"/><path d="m8.5 8.5 7 7"/></svg>',
  pet:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10z"/></svg>',
  bell:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  money:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/></svg>',
  home:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 21V13h6v8"/></svg>',
  search:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  history:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3.5 2"/></svg>',
  plus:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  check:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 12.5 5 5L19.5 7"/></svg>',
  back:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  close:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  camera:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7.8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.8z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  trash:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  restore:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  sun:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M4.3 4.3l1.4 1.4M18.3 18.3l1.4 1.4M2.5 12h2M19.5 12h2M4.3 19.7l1.4-1.4M18.3 5.7l1.4-1.4"/></svg>',
  moon:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg>',
  basket:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 11 4-7M19 11l-4-7"/><path d="M2 11h20l-1.8 8.2a2 2 0 0 1-2 1.8H5.8a2 2 0 0 1-2-1.8z"/><path d="M8 15v3M12 15v3M16 15v3"/></svg>',
  edit:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>',
  empty:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
  star:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2.5 2.9 6.4 6.9.8-5.1 4.8 1.3 6.9L12 18l-6 3.4 1.3-6.9-5.1-4.8 6.9-.8z"/></svg>',
  tag:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 2.8 12V4a1.2 1.2 0 0 1 1.2-1.2h8a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.4"/></svg>',
  google:   '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.2c0-.7-.06-1.4-.18-2.06H12v3.9h5.9a5.05 5.05 0 0 1-2.19 3.31v2.74h3.54c2.07-1.9 3.26-4.71 3.26-8.05z"/><path fill="#34A853" d="M12 23c2.95 0 5.43-.98 7.24-2.65l-3.54-2.74c-.98.66-2.24 1.05-3.7 1.05-2.85 0-5.26-1.92-6.12-4.5H2.23v2.83A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.88 14.16a6.6 6.6 0 0 1 0-4.32V7.01H2.23a11 11 0 0 0 0 9.98z"/><path fill="#EA4335" d="M12 5.38c1.6 0 3.05.55 4.19 1.64l3.14-3.14A11 11 0 0 0 2.23 7.01l3.65 2.83C6.74 7.3 9.15 5.38 12 5.38z"/></svg>',
  box:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m7.5 4.3 9 5.15"/></svg>',
  mic:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v5"/></svg>',
};

/* ---------- Fotos de portada (rotan en cada apertura) ---------- */
/* Unsplash con fallback: si una foto no carga, el CSS muestra un gradiente cálido. */
export const HERO_IMAGES = [
  { url: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1600&q=80',  alt: 'Cocina moderna y cálida' },
  { url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1600&q=80', alt: 'Sala de estar luminosa' },
  { url: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1600&q=80', alt: 'Interior de hogar minimalista' },
  { url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80', alt: 'Casa moderna al atardecer' },
  { url: 'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&w=1600&q=80', alt: 'Rincón cálido con sillón' },
  { url: 'https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?auto=format&fit=crop&w=1600&q=80', alt: 'Desayuno sobre la mesa' },
];

export function pickHero() {
  return HERO_IMAGES[Math.floor(Math.random() * HERO_IMAGES.length)];
}

/* ---------- Categorías canónicas ---------- */
export const CATEGORIES = {
  compras:       { label: 'Compras',       icon: 'cart',     emoji: '🛒', hue: 215 },
  alma:          { label: 'Alma',          icon: 'star',     emoji: '👧', hue: 320 },
  carnes:        { label: 'Carnes',        icon: 'food',     emoji: '🥩', hue: 4   },
  verduras:      { label: 'Verduras',      icon: 'food',     emoji: '🥦', hue: 130 },
  frutas:        { label: 'Frutas',        icon: 'food',     emoji: '🍎', hue: 22  },
  lacteos:       { label: 'Lácteos',       icon: 'food',     emoji: '🥛', hue: 200 },
  despensa:      { label: 'Despensa',      icon: 'basket',   emoji: '🫙', hue: 38  },
  limpieza:      { label: 'Limpieza',      icon: 'spark',    emoji: '🧼', hue: 190 },
  bebidas:       { label: 'Bebidas',       icon: 'drink',    emoji: '🥤', hue: 260 },
  farmacia:      { label: 'Farmacia',      icon: 'pharmacy', emoji: '💊', hue: 350 },
  mascotas:      { label: 'Mascotas',      icon: 'pet',      emoji: '🐾', hue: 28  },
  regalos:       { label: 'Regalos',       icon: 'gift',     emoji: '🎁', hue: 330 },
  escuela:       { label: 'Escuela',       icon: 'edit',     emoji: '🎒', hue: 245 },
  hogar:         { label: 'Hogar',         icon: 'home',     emoji: '🏠', hue: 165 },
  recordatorios: { label: 'Recordatorios', icon: 'bell',     emoji: '🔔', hue: 45  },
  gastos:        { label: 'Gastos',        icon: 'money',    emoji: '💸', hue: 150 },
  otros:         { label: 'Otros',         icon: 'empty',    emoji: '📦', hue: 220 },
};

/* ---------- Tarjetas de la pantalla principal ----------
   Cada tarjeta agrupa una o varias categorías y tiene su foto. */
export const HOME_CARDS = [
  {
    id: 'compras', label: 'Compras', cats: ['compras'],
    img: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=75',
    icon: 'cart', hue: 215, tagline: 'Lo que falta comprar',
  },
  {
    id: 'alma', label: 'Alma', cats: ['alma', 'escuela'],
    img: 'https://images.unsplash.com/photo-1503919545889-aef636e10ad4?auto=format&fit=crop&w=900&q=75',
    icon: 'star', hue: 320, tagline: 'Todo lo que necesita ella',
  },
  {
    id: 'alimentos', label: 'Alimentos', cats: ['carnes', 'verduras', 'frutas', 'lacteos', 'despensa'],
    img: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=900&q=75',
    icon: 'food', hue: 130, tagline: 'Carnes, verduras, despensa',
  },
  {
    id: 'limpieza', label: 'Limpieza', cats: ['limpieza'],
    img: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=900&q=75',
    icon: 'spark', hue: 190, tagline: 'Para que brille la casa',
  },
  {
    id: 'bebidas', label: 'Bebidas', cats: ['bebidas'],
    img: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=75',
    icon: 'drink', hue: 260, tagline: 'Refrescos, jugos y más',
  },
  {
    id: 'regalos', label: 'Regalos', cats: ['regalos'],
    img: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=900&q=75',
    icon: 'gift', hue: 330, tagline: 'Detalles para sorprender',
  },
  {
    id: 'farmacia', label: 'Farmacia', cats: ['farmacia'],
    img: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=900&q=75',
    icon: 'pharmacy', hue: 350, tagline: 'Salud y botiquín',
  },
  {
    id: 'mascotas', label: 'Mascotas', cats: ['mascotas'],
    img: 'https://images.unsplash.com/photo-1450778869180-41d0601e046e?auto=format&fit=crop&w=900&q=75',
    icon: 'pet', hue: 28, tagline: 'Para los de cuatro patas',
  },
  {
    id: 'recordatorios', label: 'Recordatorios', cats: ['recordatorios'],
    img: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=900&q=75',
    icon: 'bell', hue: 45, tagline: 'Que no se pase nada',
  },
  {
    id: 'gastos', label: 'Gastos', cats: ['gastos'],
    img: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=900&q=75',
    icon: 'money', hue: 150, tagline: 'Imprevistos del mes',
  },
  {
    id: 'inventario', label: 'Inventario', cats: [], special: 'inventory',
    img: 'https://images.unsplash.com/photo-1584992236310-6edddc08acff?auto=format&fit=crop&w=900&q=75',
    icon: 'box', hue: 165, tagline: '¿Qué tengo en casa?',
  },
  {
    id: 'precios', label: 'Precios', cats: [], special: 'prices',
    img: 'https://images.unsplash.com/photo-1580913428735-bd3c269d6a82?auto=format&fit=crop&w=900&q=75',
    icon: 'tag', hue: 275, tagline: '¿Dónde sale más barato?',
  },
  {
    id: 'hogar', label: 'Hogar y otros', cats: ['hogar', 'otros'],
    img: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=900&q=75',
    icon: 'home', hue: 165, tagline: 'Casa y demás',
  },
];

/* ---------- Imágenes automáticas de productos ----------
   Mapa de palabras clave → emoji. Cuando el usuario escribe
   "azúcar" mostramos automáticamente su visual. */
const PRODUCT_MAP = [
  // Despensa
  [['azucar'], '🍚'], [['sal'], '🧂'], [['arroz'], '🍚'], [['harina'], '🌾'],
  [['aceite'], '🫒'], [['vinagre'], '🍶'], [['fideos', 'pasta', 'tallarines', 'ñoquis', 'noquis'], '🍝'],
  [['polenta'], '🌽'], [['yerba', 'mate'], '🧉'], [['cafe'], '☕'], [['te ', 'te'], '🍵'],
  [['azafran', 'condimento', 'oregano', 'pimienta'], '🌿'], [['miel'], '🍯'],
  [['mermelada', 'dulce'], '🍓'], [['dulce de leche'], '🍮'], [['cereal', 'avena', 'granola'], '🥣'],
  [['atun', 'sardina'], '🐟'], [['lenteja', 'porotos', 'garbanzo'], '🫘'],
  [['sopa', 'caldo'], '🍲'], [['mayonesa', 'ketchup', 'mostaza', 'aderezo'], '🥫'],
  [['galletas', 'galletitas', 'bizcochos'], '🍪'], [['alfajor'], '🍫'], [['chocolate', 'cacao'], '🍫'],
  [['caramelos', 'golosinas'], '🍬'], [['pan ', 'pan', 'flauta', 'baguette'], '🍞'],
  [['tortilla', 'tapas', 'masa'], '🫓'], [['torta', 'bizcochuelo'], '🍰'],
  // Frescos
  [['leche'], '🥛'], [['yogur', 'yogurt'], '🥛'], [['queso', 'muzzarella', 'muzarela'], '🧀'],
  [['manteca', 'margarina'], '🧈'], [['crema'], '🥛'], [['huevo'], '🥚'], [['helado'], '🍨'],
  // Carnes
  [['carne', 'asado', 'pulpa', 'picada', 'nalga'], '🥩'], [['pollo', 'suprema'], '🍗'],
  [['pescado', 'merluza'], '🐟'], [['milanesa'], '🍖'], [['chorizo', 'salchicha', 'pancho'], '🌭'],
  [['jamon', 'fiambre', 'mortadela', 'salame'], '🥓'], [['hamburguesa'], '🍔'],
  [['pizza', 'muzza'], '🍕'], [['empanada'], '🥟'],
  // Verduras y frutas
  [['tomate'], '🍅'], [['lechuga', 'ensalada', 'espinaca', 'acelga'], '🥬'],
  [['papa', 'papas'], '🥔'], [['boniato'], '🍠'], [['cebolla'], '🧅'], [['ajo'], '🧄'],
  [['zanahoria'], '🥕'], [['zapallo', 'calabaza', 'calabacin', 'zucchini'], '🎃'],
  [['morron', 'pimiento'], '🫑'], [['choclo'], '🌽'], [['brocoli', 'coliflor'], '🥦'],
  [['palta'], '🥑'], [['manzana'], '🍎'], [['banana'], '🍌'], [['naranja', 'mandarina'], '🍊'],
  [['limon'], '🍋'], [['frutilla', 'fresa'], '🍓'], [['uva'], '🍇'], [['pera'], '🍐'],
  [['durazno'], '🍑'], [['sandia'], '🍉'], [['melon'], '🍈'], [['anana', 'piña'], '🍍'],
  [['kiwi'], '🥝'],
  // Bebidas
  [['agua'], '💧'], [['refresco', 'coca', 'sprite', 'fanta', 'gaseosa'], '🥤'],
  [['jugo'], '🧃'], [['cerveza'], '🍺'], [['vino'], '🍷'], [['whisky', 'ron', 'vodka', 'grappa'], '🥃'],
  [['espumante', 'champagne', 'sidra'], '🍾'],
  // Limpieza e higiene
  [['papel higienico', 'papel hig'], '🧻'], [['servilleta', 'rollo cocina', 'papel cocina'], '🧻'],
  [['detergente'], '🧴'], [['lavandina', 'hipoclorito', 'cloro'], '🧴'],
  [['jabon polvo', 'jabon en polvo', 'ariel', 'skip'], '🧺'], [['suavizante'], '🧺'],
  [['jabon'], '🧼'], [['esponja'], '🧽'], [['escoba', 'palo', 'trapo'], '🧹'],
  [['desodorante ambiente', 'aromatizante'], '🌸'], [['insecticida', 'raid'], '🦟'],
  [['bolsas residuo', 'bolsas basura', 'bolsas'], '🗑️'],
  [['shampoo', 'champu', 'acondicionador'], '🧴'], [['pasta dientes', 'dentifrico', 'cepillo dientes'], '🪥'],
  [['desodorante'], '🧴'], [['perfume'], '🌺'], [['crema corporal', 'protector solar'], '🧴'],
  [['pañal', 'panal'], '👶'], [['toallitas'], '🧻'], [['maquinita', 'afeitar', 'gillette'], '🪒'],
  // Farmacia
  [['paracetamol', 'ibuprofeno', 'aspirina', 'remedio', 'pastilla', 'medicamento', 'perifar'], '💊'],
  [['jarabe'], '🍼'], [['curita', 'venda', 'gasa'], '🩹'], [['alcohol', 'algodon'], '🧴'],
  [['termometro'], '🌡️'], [['vitamina'], '💊'], [['anteojos', 'lentes'], '👓'],
  // Mascotas
  [['perro', 'dogui', 'pedigree'], '🐶'], [['gato', 'whiskas'], '🐱'],
  [['arena gato', 'piedritas'], '🐱'], [['hueso', 'juguete perro'], '🦴'],
  // Hogar y varios
  [['pila', 'bateria'], '🔋'], [['lamparita', 'foco', 'bombilla'], '💡'],
  [['vela'], '🕯️'], [['fosforo', 'encendedor'], '🔥'], [['carbon', 'leña', 'lena'], '🪵'],
  [['flores', 'planta'], '🪴'], [['herramienta', 'destornillador', 'martillo'], '🔧'],
  [['canilla', 'grifo', 'caño', 'cano'], '🚰'], [['cinta', 'pegamento', 'silicona'], '🩹'],
  [['cuaderno', 'lapiz', 'utiles', 'cartuchera'], '✏️'], [['juguete', 'muñeca', 'muneca'], '🧸'],
  [['mochila'], '🎒'], [['pediatra', 'vacuna', 'turno medico'], '💉'], [['ropa', 'campera', 'buzo', 'remera'], '👕'],
  [['zapatilla', 'championes', 'zapato'], '👟'], [['libro', 'cuento'], '📖'], [['disfraz'], '🎭'],
  [['regalo'], '🎁'], [['cumpleaños', 'cumpleanos', 'cumple'], '🎂'],
  [['nafta', 'combustible'], '⛽'], [['garrafa', 'supergas', 'gas'], '🔥'],
];

/**
 * Devuelve el visual automático de un producto según su nombre.
 * Si no hay coincidencia, cae al emoji de la categoría.
 * Siempre devuelve algo — nunca un espacio vacío.
 */
export function productVisual(name = '', category = 'otros') {
  const n = ' ' + name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + ' ';
  for (const [keys, emoji] of PRODUCT_MAP) {
    for (const k of keys) {
      if (n.includes(k.trim())) return emoji;
    }
  }
  return (CATEGORIES[category] || CATEGORIES.otros).emoji;
}

/** Gradiente suave y determinístico para el tile de un producto */
export function productGradient(name = '', category = 'otros') {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  const baseHue = (CATEGORIES[category] || CATEGORIES.otros).hue;
  const hue = (baseHue + (hash % 40) - 20 + 360) % 360;
  return `linear-gradient(135deg, hsl(${hue} 65% 92%), hsl(${(hue + 40) % 360} 60% 86%))`;
}

/** Versión para modo oscuro del gradiente */
export function productGradientDark(name = '', category = 'otros') {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  const baseHue = (CATEGORIES[category] || CATEGORIES.otros).hue;
  const hue = (baseHue + (hash % 40) - 20 + 360) % 360;
  return `linear-gradient(135deg, hsl(${hue} 30% 24%), hsl(${(hue + 40) % 360} 28% 18%))`;
}
