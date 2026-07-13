/* ============================================================
   components/toast.js — Avisos flotantes elegantes
   ============================================================ */

let root = null;

function ensureRoot() {
  if (!root) {
    root = document.createElement('div');
    root.className = 'toast-root';
    root.setAttribute('aria-live', 'polite');
    document.body.appendChild(root);
  }
  return root;
}

/**
 * Muestra un toast.
 * @param {string} html    Contenido (ya escapado por quien llama)
 * @param {object} opts    { emoji, duration, type: 'info'|'success' }
 */
export function toast(html, { emoji = '', duration = 3800, type = 'info' } = {}) {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `${emoji ? `<span class="toast__emoji">${emoji}</span>` : ''}<span class="toast__text">${html}</span>`;
  ensureRoot().appendChild(el);

  // Entrada animada en el próximo frame
  requestAnimationFrame(() => el.classList.add('toast--in'));

  const remove = () => {
    el.classList.remove('toast--in');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 500); // por si no dispara transitionend
  };
  const timer = setTimeout(remove, duration);
  el.addEventListener('click', () => { clearTimeout(timer); remove(); });
}
