/**
 * Picture puzzle: a photo cut into 3x3 or 4x4 tiles. Tap two tiles to swap
 * them; tiles in the right place lock with a check mark.
 */
import { h } from '../lib/dom.js';
import { icon } from '../lib/ui.js';
import { backgroundPosition, countCorrect, createShuffledOrder, hintSwap, isComplete, isInPlace, swapTiles } from '../logic/image.js';

const DEFAULT_IMAGE = 'assets/placeholder-picture.svg';

export default {
  id: 'image',
  title: 'image.title',

  /** @param {object} options */
  validate(options) {
    const errors = [];
    if (options.image !== undefined && (typeof options.image !== 'string' || !options.image.trim())) {
      errors.push('image must be a file path in quotes, for example "assets/my-photo.jpg".');
    }
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

    loadSquareImage(options.image || DEFAULT_IMAGE).then((url) => {
      preview.src = url;
      board.style.setProperty('--image', `url("${url}")`);
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
 * Center-crop an image to a square data URL so tiles never look stretched.
 * Falls back to the original URL if the image cannot be read (e.g. another domain).
 * @param {string} src
 * @returns {Promise<string>}
 */
function loadSquareImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const side = Math.min(img.naturalWidth, img.naturalHeight) || 800;
        const out = Math.min(side, 1200);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = out;
        const sx = ((img.naturalWidth || side) - side) / 2;
        const sy = ((img.naturalHeight || side) - side) / 2;
        canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, out, out);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}
