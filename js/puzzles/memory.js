/**
 * Memory: turn over two cards at a time; pairs stay open, others simply
 * turn back. Pairs can be emoji/short text or image paths.
 */
import { h } from '../lib/dom.js';
import { closeOpen, columnsFor, createState, flip, hintPair, isComplete, isImagePath, isMismatchShowing, matchPair, validatePairs } from '../logic/memory.js';

/** Used when the config sets no pairs: a small treasure-hunt theme. */
const DEFAULT_PAIRS = ['🔑', '🗝️', '🧩', '💎', '🗺️', '🎁'];
const MISMATCH_DELAY = 1000;

export default {
  id: 'memory',
  title: 'memory.title',

  /** @param {object} options */
  validate(options) {
    return options.pairs === undefined ? [] : validatePairs(options.pairs);
  },

  /**
   * @param {HTMLElement} container
   * @param {{ pairs?: string[] }} options
   * @param {object} api
   */
  mount(container, options, api) {
    const { t } = api;
    const pairs = options.pairs ?? DEFAULT_PAIRS;
    let state = createState(pairs.length, api.rng);
    let closeTimer = null;
    let solved = false;

    const cards = state.cards.map((pair, index) =>
      h(
        'button',
        { type: 'button', class: 'cq-card-flip', on: { click: () => tap(index) } },
        h('span', { class: 'cq-card-inner', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'cq-card-back' }), h('span', { class: 'cq-card-front' }, face(pairs[pair]))),
      ),
    );
    const board = h('div', { class: 'cq-memory', attrs: { role: 'group', 'aria-label': t('memory.board') } }, cards);
    board.style.setProperty('--columns', columnsFor(cards.length));
    const progress = h('p', { class: 'cq-note text-center' });
    container.replaceChildren(h('div', { class: 'cq-memory-wrap' }, board, progress));
    render();

    api.hint(() => {
      if (solved) return;
      clearTimeout(closeTimer);
      const pair = hintPair(isMismatchShowing(state) ? closeOpen(state) : state);
      if (!pair) return;
      state = matchPair(state, pair);
      afterMatch();
    });

    function tap(index) {
      if (solved) return;
      clearTimeout(closeTimer);
      const step = flip(state, index);
      state = step.state;
      if (step.result === 'match') {
        api.announce(t('memory.match'));
        afterMatch();
      } else if (step.result === 'mismatch') {
        api.announce(t('memory.noMatch'));
        closeTimer = setTimeout(() => {
          state = closeOpen(state);
          render();
        }, MISMATCH_DELAY);
      }
      render();
    }

    function afterMatch() {
      render();
      if (isComplete(state)) {
        solved = true;
        board.classList.add('is-solved');
        api.onSolved();
      }
    }

    function render() {
      cards.forEach((card, index) => {
        const label = labelFor(pairs[state.cards[index]]);
        const matched = state.matched.includes(index);
        const open = matched || state.open.includes(index);
        card.classList.toggle('is-open', open);
        card.classList.toggle('is-matched', matched);
        card.setAttribute('aria-disabled', String(matched || solved));
        card.setAttribute('aria-label', t(matched ? 'memory.cardMatched' : open ? 'memory.cardOpen' : 'memory.card', { n: index + 1, label }));
      });
      progress.textContent = t('memory.progress', { n: state.matched.length / 2, total: pairs.length });
    }

    return () => clearTimeout(closeTimer);
  },
};

function face(value) {
  return isImagePath(value) ? h('img', { src: value, alt: '', draggable: false }) : h('span', { class: 'cq-card-text', text: value });
}

/** Readable name for an image path, e.g. "assets/our-dog.jpg" -> "our dog". */
function labelFor(value) {
  if (!isImagePath(value)) return value;
  return value.split('/').pop().replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
}
