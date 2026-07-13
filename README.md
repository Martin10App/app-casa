# 🏠 Nuestro Hogar

Centro de organización familiar: compras compartidas, recordatorios, regalos, gastos imprevistos y más — sincronizado en tiempo real entre los dos.

**PWA instalable** en Android, iPhone, Windows y Mac.

---

## Cómo funciona hoy

La app arranca en **modo local** (guarda en el navegador) para que puedas probarla ya mismo sin configurar nada. Para que se sincronice entre sus celulares hay que conectar Firebase (5 minutos, gratis):

## 1. Crear el proyecto de Firebase

1. Entrá a <https://console.firebase.google.com> con tu cuenta de Google.
2. **Agregar proyecto** → nombre: `nuestro-hogar` → podés desactivar Analytics → **Crear**.
3. En el panel, menú **Compilación → Firestore Database** → **Crear base de datos** → ubicación `southamerica-east1` (São Paulo, la más cercana) → empezar en **modo de prueba**.

> ⚠️ El modo de prueba expira a los 30 días. Después andá a la pestaña **Reglas** y pegá esto (acceso abierto solo para quien tenga la URL de tu app; para uso de dos personas alcanza, pero si querés más seguridad se puede agregar Firebase Auth):
>
> ```
> rules_version = '2';
> service cloud.firestore {
>   match /databases/{database}/documents {
>     match /{document=**} {
>       allow read, write: if true;
>     }
>   }
> }
> ```

## 2. Registrar la app web

1. En la portada del proyecto: ícono **`</>`** (Web) → apodo `nuestro-hogar` → **Registrar app**.
2. Te muestra un bloque `const firebaseConfig = { ... }`.
3. Copiá esos valores y pegalos en **`firebase.js`** (arriba de todo, donde dice `PEGÁ ACÁ TU CONFIGURACIÓN`).

Listo: al recargar, la app pasa sola a modo nube y todo se sincroniza en tiempo real.

## 3. Publicar (necesita HTTPS)

Cualquiera de estas opciones gratis:

- **Netlify** (la que ya usás): arrastrá la carpeta `nuestro-hogar` a <https://app.netlify.com/drop>, o conectala a un repo.
- **Vercel / GitHub Pages** también sirven.

> La PWA (instalación + notificaciones + service worker) solo funciona bajo **HTTPS** o en `localhost`.

## 4. Instalar en los celulares

- **Android (Chrome):** abrir la URL → menú ⋮ → **Agregar a pantalla principal** (o el aviso "Instalar app").
- **iPhone (Safari):** abrir la URL → botón Compartir → **Agregar a inicio**.
- **Windows/Mac (Chrome/Edge):** ícono de instalación en la barra de direcciones.

## Notificaciones

- Con la app **abierta o en segundo plano**: toast interno + notificación del sistema cuando el otro agrega o completa algo (pide permiso la primera vez).
- Con la app **totalmente cerrada**: requeriría Firebase Cloud Messaging con un paso de servidor; se puede agregar más adelante si lo querés.

## Estructura del proyecto

```
nuestro-hogar/
├── index.html          Estructura de la app (una sola página, 4 vistas + modo súper)
├── styles.css          Todo el diseño: tokens, modo claro/oscuro, animaciones
├── app.js              Estado, navegación, render y tiempo real
├── firebase.js         Capa de datos: Firestore o localStorage (automático)
├── manifest.json       Manifiesto PWA
├── sw.js               Service worker: caché offline + clic en notificaciones
├── components/
│   ├── modal.js        Modal de agregar/editar elemento
│   └── toast.js        Avisos flotantes
├── utils/
│   ├── helpers.js      Fechas, saludos, compresión de fotos, etc.
│   ├── images.js       Categorías, imágenes automáticas de productos, portadas
│   └── notify.js       Notificaciones del sistema
└── icons/              Íconos de la PWA
```

## Detalles de diseño

- Tipografía: **Fraunces** (títulos) + **Inter** (interfaz)
- Portada con foto que rota en cada apertura y saludo según la hora
- Imagen automática del producto al escribir ("azúcar" → 🍚, "yerba" → 🧉, ~90 productos)
- Modo claro/oscuro con transición animada (respeta la preferencia del sistema la primera vez)
- Las fotos que suben se comprimen a ~100-200 KB antes de guardarse
