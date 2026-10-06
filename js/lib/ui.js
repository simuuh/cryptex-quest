/**
 * UI pieces shared by the pages: static text, code slots, icons, dialogs.
 */
import { h, prefersReducedMotion } from './dom.js';

const ICONS = {
  back: 'M15 18l-6-6 6-6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  skip: 'M5 5l8 7-8 7zM15 5v14',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  reset: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
};

/**
 * Inline SVG icon, hidden from assistive tech.
 * @param {keyof ICONS} name
 * @returns {SVGElement}
 */
export function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'cq-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name]);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2.2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

/**
 * Fill every [data-i18n] element with its translated text.
 * @param {ParentNode} root
 * @param {Function} t
 */
export function translateStatic(root, t) {
  for (const node of root.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
}

/**
 * Render the row of code slots.
 * @param {HTMLElement} container a <ol> element
 * @param {(string|null)[]} chars revealed characters, null = hidden
 * @param {Function} t
 * @param {{ labels?: boolean, fresh?: number[] }} [options] fresh = indexes to animate
 */
export function renderSlots(container, chars, t, { labels = false, fresh = [] } = {}) {
  container.replaceChildren(
    ...chars.map((char, i) => {
      const filled = char !== null;
      return h(
        'li',
        {
          class: `cq-slot${filled ? ' is-filled' : ''}${fresh.includes(i) ? ' is-new' : ''}`,
          attrs: { 'aria-label': filled ? t('slot.filled', { i: i + 1, char }) : t('slot.empty', { i: i + 1 }) },
        },
        h('span', { class: 'cq-slot-box', attrs: { 'aria-hidden': 'true' }, text: filled ? char : '?' }),
        labels && h('span', { class: 'cq-slot-label', attrs: { 'aria-hidden': 'true' }, text: t('slot.label', { i: i + 1 }) }),
      );
    }),
  );
}

/**
 * Sprinkle confetti inside an element (skipped for reduced motion).
 * @param {HTMLElement} host must be position: relative or a dialog
 */
export function confetti(host) {
  if (prefersReducedMotion()) return;
  const colors = ['var(--cq-accent)', 'var(--cq-secondary)', 'var(--cq-soft-error)', 'var(--cq-text)'];
  const layer = h('div', { class: 'cq-confetti', attrs: { 'aria-hidden': 'true' } });
  for (let i = 0; i < 28; i++) {
    const piece = h('span');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.setProperty('--delay', `${Math.round(Math.random() * 400)}ms`);
    piece.style.setProperty('--drift', `${Math.round((Math.random() - 0.5) * 120)}px`);
    piece.style.setProperty('--spin', `${Math.round(180 + Math.random() * 540)}deg`);
    layer.append(piece);
  }
  host.prepend(layer);
  setTimeout(() => layer.remove(), 2400);
}

/**
 * Open a modal <dialog> with the given content; it removes itself on close.
 * @param {Node[]} content
 * @param {{ label: string, onClose?: () => void }} options
 * @returns {HTMLDialogElement}
 */
export function openDialog(content, { label, onClose }) {
  const dialog = h('dialog', { class: 'cq-dialog', attrs: { 'aria-label': label } }, content);
  dialog.addEventListener('close', () => {
    dialog.remove();
    onClose?.();
  });
  document.querySelectorAll('.cq-confetti').forEach((layer) => layer.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
