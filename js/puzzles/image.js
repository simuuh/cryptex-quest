/**
 * Picture puzzle: a photo cut into 3x3 or 4x4 tiles. Tap two tiles to swap
 * them; tiles in the right place lock with a check mark.
 */
import { h } from '../lib/dom.js';
import { icon } from '../lib/ui.js';
import {
  backgroundPosition,
  countCorrect,
  createShuffledOrder,
  hintSwap,
  imagePathProblem,
  isComplete,
  isInPlace,
  loadWithFallback,
  PLACEHOLDER_IMAGE,
  squareCrop,
  swapTiles,
} from '../logic/image.js';

export default {
  id: 'image',
  title: 'image.title',

  /** @param {object} options */
  validate(options) {
    const errors = [];
    const problem = options.image === undefined ? null : imagePathProblem(options.image);
    if (problem) errors.push(problem);
    if (options.size !== undefined && options.size !== 3 && options.size !== 4) {
      errors.push(`size must be 3 or 4 (got ${JSON.stringify(options.size)}).`);
    }
    return errors;
  },

  /**
   * @param {HTMLElement} container
   * @param {{ image?: string, size?: 3|4 }} options
   * @param {object} api
   */
  mount(container, options, api) {
    const { t } = api;
    const size = options.size ?? 3;
    const count = size * size;
    let order = createShuffledOrder(count, api.rng);
    let selected = -1;
    let solved = false;

    const tiles = order.map((_, position) =>
      h('button', { type: 'button', class: 'cq-tile', on: { click: () => tap(position) } }),
    );
    const preview = h('img', { class: 'cq-tile-preview', alt: t('image.alt'), hidden: true });
    const board = h('div', { class: 'cq-board cq-tiles', attrs: { role: 'group', 'aria-label': t('image.board') } }, tiles, preview);
    board.style.setProperty('--size', size);
    const bar = h('div', { class: 'cq-progress-bar' });
    const progressText = h('span');
    const previewButton = h('button', { type: 'button', class: 'btn btn-cq-ghost', attrs: { 'aria-pressed': 'false' } }, icon('eye'), h('span', { text: t('image.preview') }));
    previewButton.addEventListener('click', togglePreview);

    container.replaceChildren(
      h(
        'div',
        { class: 'cq-image-wrap' },
        board,
        h('div', { class: 'cq-progress-row' }, h('div', { class: 'cq-progress', attrs: { 'aria-hidden': 'true' } }, bar), progressText),
        previewButton,
      ),
    );

    const src = options.image?.trim() || PLACEHOLDER_IMAGE;
    loadWithFallback(src, PLACEHOLDER_IMAGE, loadSquareImage, (message) => console.warn(message)).then(({ value }) => {
      if (!value) return;
      preview.src = value;
      board.style.setProperty('--image', `url("${value}")`);
    });
    render();

    api.hint(() => {
      const swap = hintSwap(order);
      if (swap) apply(...swap);
    });

    function tap(position) {
      if (solved || isInPlace(order, position)) return;
      if (selected === -1) selected = position;
      else if (selected === position) selected = -1;
      else return apply(selected, position);
      render();
    }

    function apply(a, b) {
      order = swapTiles(order, a, b);
      selected = -1;
      for (const position of [a, b]) {
        tiles[position].classList.remove('is-swapped');
        void tiles[position].offsetWidth; // restart the animation
        tiles[position].classList.add('is-swapped');
      }
      render();
      if (isComplete(order)) {
        solved = true;
        board.classList.add('is-solved');
        previewButton.disabled = true;
        api.onSolved();
      }
    }

    function togglePreview() {
      preview.hidden = !preview.hidden;
      previewButton.setAttribute('aria-pressed', String(!preview.hidden));
      previewButton.lastChild.textContent = preview.hidden ? t('image.preview') : t('image.hidePreview');
    }

    function render() {
      tiles.forEach((tile, position) => {
        const id = order[position];
        const locked = isInPlace(order, position);
        tile.style.backgroundPosition = backgroundPosition(id, size);
        tile.classList.toggle('is-locked', locked);
        tile.classList.toggle('is-selected', position === selected);
        tile.setAttribute('aria-disabled', String(locked || solved));
        tile.setAttribute('aria-label', t(locked ? 'image.tileLocked' : position === selected ? 'image.tileSelected' : 'image.tile', { n: id + 1 }));
        tile.replaceChildren(locked && !solved ? h('span', { class: 'cq-tile-check', attrs: { 'aria-hidden': 'true' } }, icon('check')) : '');
      });
      const correct = countCorrect(order);
      bar.style.width = `${(correct / count) * 100}%`;
      progressText.textContent = t('image.progress', { n: correct, total: count });
    }
  },
};

/**
 * Load an image, honor its EXIF orientation, and center-crop it to a square
 * data URL so tiles never look stretched. Rejects if the file is missing or
 * cannot be decoded (the caller then falls back to the placeholder).
 * @param {string} src
 * @returns {Promise<string>}
 */
async function loadSquareImage(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const { source, width, height, release } = await decodeOriented(blob);
  try {
    const { sx, sy, side, out } = squareCrop(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = out;
    canvas.getContext('2d').drawImage(source, sx, sy, side, side, 0, 0, out, out);
    return canvas.toDataURL('image/jpeg', 0.9);
  } finally {
    release();
  }
}

/**
 * Decode a blob into something drawable, already rotated per EXIF.
 * createImageBitmap with imageOrientation 'from-image' is explicit about
 * orientation; where it is missing or rejects the blob (e.g. SVG), an <img>
 * is used, which modern browsers also draw in EXIF orientation.
 * @param {Blob} blob
 */
async function decodeOriented(blob) {
  if (typeof createImageBitmap === 'function' && blob.type !== 'image/svg+xml') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    // SVGs without width/height report 0; draw them at a sensible size.
    const width = img.naturalWidth || 1200;
    const height = img.naturalHeight || 1200;
    return { source: img, width, height, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw new Error(`not a readable image (${error.message || 'decode failed'})`);
  }
}
