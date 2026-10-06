/**
 * 4x4 sudoku puzzle. Tap a cell, then a number. Clashes are tinted softly,
 * never called "wrong".
 */
import { h } from '../lib/dom.js';
import { findConflicts, generatePuzzle, GIVENS, hintIndex, isSolved, position, SIZE } from '../logic/sudoku.js';

export default {
  id: 'sudoku',
  title: 'sudoku.title',

  /** @param {object} options */
  validate(options) {
    const { difficulty = 'easy' } = options;
    return difficulty in GIVENS ? [] : [`difficulty must be "easy", "medium" or "hard" (got "${difficulty}").`];
  },

  /**
   * @param {HTMLElement} container
   * @param {{ difficulty?: 'easy'|'medium'|'hard' }} options
   * @param {object} api
   */
  mount(container, options, api) {
    const { t } = api;
    const { puzzle, solution } = generatePuzzle(api.rng, options.difficulty ?? 'easy');
    const grid = puzzle.slice();
    const locked = new Set(puzzle.flatMap((v, i) => (v ? [i] : [])));
    let selected = grid.indexOf(0);
    let lastClashCount = 0;
    let solved = false;

    const cells = grid.map((_, index) => {
      const { row, col } = position(index);
      const cell = h('button', { type: 'button', class: 'cq-sudoku-cell', on: { click: () => select(index) } });
      // Skip the gutter track between boxes (see .cq-sudoku in puzzles.css).
      cell.style.gridArea = `${row < 2 ? row + 1 : row + 2} / ${col < 2 ? col + 1 : col + 2}`;
      return cell;
    });
    const board = h('div', { class: 'cq-sudoku', attrs: { role: 'group', 'aria-label': t('sudoku.grid') } }, cells);

    const padButtons = [1, 2, 3, 4].map((n) =>
      h('button', { type: 'button', class: 'cq-pad-key', text: String(n), attrs: { 'aria-label': t('sudoku.number', { n }) }, on: { click: () => enter(n) } }),
    );
    const erase = h('button', { type: 'button', class: 'cq-pad-key cq-pad-erase', text: t('sudoku.erase'), on: { click: () => enter(0) } });
    const pad = h('div', { class: 'cq-pad', attrs: { role: 'group', 'aria-label': t('sudoku.pad') } }, padButtons, erase);

    container.replaceChildren(h('div', { class: 'cq-sudoku-wrap' }, board, pad));
    board.addEventListener('keydown', onKey);
    render();

    api.hint(() => {
      if (solved) return;
      const index = hintIndex(grid, solution, locked.has(selected) ? -1 : selected);
      if (index === -1) return;
      grid[index] = solution[index];
      locked.add(index);
      cells[index].classList.add('is-hinted');
      selected = grid.indexOf(0);
      afterChange();
    });

    function select(index) {
      if (solved || locked.has(index)) return;
      selected = index;
      render();
    }

    function enter(value) {
      if (solved) return;
      if (selected < 0 || locked.has(selected)) {
        api.announce(t('sudoku.selectFirst'));
        return;
      }
      grid[selected] = value;
      afterChange();
    }

    function afterChange() {
      render();
      const clashes = findConflicts(grid).size;
      if (clashes > lastClashCount) api.announce(t('sudoku.clash'));
      else if (clashes === 0) api.announce('');
      lastClashCount = clashes;
      if (isSolved(grid)) {
        solved = true;
        board.classList.add('is-solved');
        render();
        api.onSolved();
      }
    }

    function onKey(event) {
      const { key } = event;
      if (/^[1-4]$/.test(key)) enter(Number(key));
      else if (key === 'Backspace' || key === 'Delete' || key === '0') enter(0);
      else if (key.startsWith('Arrow')) moveFocus(key);
      else return;
      event.preventDefault();
    }

    function moveFocus(key) {
      const current = cells.indexOf(document.activeElement);
      if (current === -1) return;
      const { row, col } = position(current);
      const delta = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[key];
      const r = (row + delta[0] + SIZE) % SIZE;
      const c = (col + delta[1] + SIZE) % SIZE;
      const next = r * SIZE + c;
      cells[next].focus();
      select(next);
    }

    function render() {
      const conflicts = findConflicts(grid);
      cells.forEach((cell, index) => {
        const { row, col } = position(index);
        const value = grid[index];
        const given = locked.has(index);
        cell.textContent = value ? String(value) : '';
        cell.classList.toggle('is-given', given && puzzle[index] !== 0);
        cell.classList.toggle('is-selected', index === selected && !solved);
        cell.classList.toggle('is-clash', conflicts.has(index));
        cell.setAttribute('aria-pressed', String(index === selected && !solved));
        cell.setAttribute('aria-disabled', String(given || solved));
        const params = { r: row + 1, c: col + 1, v: value };
        cell.setAttribute('aria-label', !value ? t('sudoku.cellEmpty', params) : given ? t('sudoku.cellGiven', params) : t('sudoku.cellValue', params));
      });
      for (const key of [...padButtons, erase]) key.disabled = solved;
    }
  },
};
