/**
 * Word search: drag across a word, or tap its first and last letter.
 * Selections that are not a word just fade away.
 */
import { h } from '../lib/dom.js';
import { icon } from '../lib/ui.js';
import { generateGrid, lineCells, matchSelection, normalizeWord, validateOptions } from '../logic/wordsearch.js';

const DEFAULT_WORDS = ['CRYPTEX', 'KEY', 'CODE'];

export default {
  id: 'wordsearch',
  title: 'wordsearch.title',

  /** @param {object} options */
  validate(options) {
    return validateOptions({ words: DEFAULT_WORDS, ...options });
  },

  /**
   * @param {HTMLElement} container
   * @param {{ words?: string[], size?: number, backwards?: boolean }} options
   * @param {object} api
   */
  mount(container, options, api) {
    const { t } = api;
    const size = options.size ?? 8;
    const words = (options.words ?? DEFAULT_WORDS).map(normalizeWord);
    const { grid, placements } = generateGrid(words, size, api.rng, options.backwards ?? false);
    const found = new Set();
    const hinted = new Set();
    let pendingStart = -1;
    let drag = null;
    let suppressClick = false;
    let solved = false;

    const cells = grid.map((letter, index) =>
      h('button', { type: 'button', class: 'cq-ws-cell', text: letter, dataset: { index }, on: { click: () => onCellClick(index) } }),
    );
    const board = h('div', { class: 'cq-board cq-ws', attrs: { role: 'group', 'aria-label': t('wordsearch.board') } }, cells);
    board.style.setProperty('--size', size);
    const chips = words.map((word) => h('li', { class: 'cq-ws-word' }, h('span', { text: word }), h('span', { class: 'cq-visually-hidden' })));
    const progress = h('span', { class: 'cq-ws-count' });
    container.replaceChildren(
      h(
        'div',
        { class: 'cq-ws-wrap' },
        board,
        h('div', { class: 'cq-ws-words-head' }, h('h2', { class: 'cq-section-title mb-0', text: t('wordsearch.wordsHeading') }), progress),
        h('ul', { class: 'cq-ws-words' }, chips),
      ),
    );

    board.addEventListener('pointerdown', onPointerDown);
    board.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    render();

    api.hint(() => {
      if (solved) return;
      const open = placements.map((_, i) => i).filter((i) => !found.has(i));
      const next = open.find((i) => !hinted.has(i));
      if (next !== undefined) {
        // First hint per word: light up its first letter and start a selection there.
        hinted.add(next);
        pendingStart = placements[next].cells[0];
        api.announce(t('wordsearch.firstLetter'));
        render();
      } else {
        // Every remaining word already has its first letter shown: reveal one.
        markFound(open[0]);
      }
    });

    function cellIndexAt(x, y) {
      const el = document.elementFromPoint(x, y)?.closest?.('.cq-ws-cell');
      return el && board.contains(el) ? Number(el.dataset.index) : -1;
    }

    function onPointerDown(event) {
      const index = cellIndexAt(event.clientX, event.clientY);
      if (solved || index === -1) return;
      drag = { start: index, end: index };
    }

    function onPointerMove(event) {
      if (!drag) return;
      const index = cellIndexAt(event.clientX, event.clientY);
      if (index === -1 || index === drag.end) return;
      drag.end = index;
      render();
    }

    function onPointerUp() {
      if (!drag) return;
      const { start, end } = drag;
      drag = null;
      if (start !== end) {
        // A real drag: evaluate it and ignore the click that may follow.
        suppressClick = true;
        setTimeout(() => (suppressClick = false), 0);
        pendingStart = -1;
        evaluate(start, end);
      }
      render();
    }

    function onCellClick(index) {
      if (solved || suppressClick) return;
      if (pendingStart === -1) {
        pendingStart = index;
        api.announce(t('wordsearch.start', { letter: grid[index] }));
      } else if (pendingStart === index) {
        pendingStart = -1;
      } else {
        const start = pendingStart;
        pendingStart = -1;
        evaluate(start, index);
      }
      render();
    }

    function evaluate(start, end) {
      const line = lineCells(start, end, size);
      const match = line ? matchSelection(line, placements, found) : -1;
      if (match !== -1) return markFound(match);
      // Not a word: let the selection fade softly, no error message.
      for (const cell of line ?? [start, end]) {
        cells[cell].classList.remove('is-fading');
        void cells[cell].offsetWidth;
        cells[cell].classList.add('is-fading');
      }
    }

    function markFound(index) {
      found.add(index);
      if (placements[index].cells.includes(pendingStart)) pendingStart = -1;
      api.announce(t('wordsearch.found', { word: placements[index].word }));
      render();
      if (found.size === placements.length) {
        solved = true;
        board.classList.add('is-solved');
        api.onSolved();
      }
    }

    function render() {
      const foundCells = new Set([...found].flatMap((i) => placements[i].cells));
      const hintCells = new Set([...hinted].filter((i) => !found.has(i)).map((i) => placements[i].cells[0]));
      const selection = new Set(drag ? lineCells(drag.start, drag.end, size) ?? [drag.start] : []);
      cells.forEach((cell, index) => {
        const row = Math.floor(index / size) + 1;
        const col = (index % size) + 1;
        cell.classList.toggle('is-found', foundCells.has(index));
        cell.classList.toggle('is-hinted', hintCells.has(index));
        cell.classList.toggle('is-selecting', selection.has(index) || index === pendingStart);
        cell.setAttribute('aria-pressed', String(index === pendingStart));
        cell.setAttribute('aria-label', t('wordsearch.letter', { letter: grid[index], r: row, c: col }));
      });
      chips.forEach((chip, i) => {
        const isFound = found.has(i);
        chip.classList.toggle('is-found', isFound);
        chip.lastChild.textContent = `, ${t(isFound ? 'wordsearch.wordFound' : 'wordsearch.wordOpen')}`;
        if (isFound && !chip.querySelector('svg')) chip.prepend(icon('check'));
      });
      progress.textContent = t('wordsearch.progress', { n: found.size, total: placements.length });
    }

    return () => {
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
    };
  },
};
