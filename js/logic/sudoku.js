/**
 * Pure 4x4 sudoku logic. Grids are flat arrays of 16 numbers, 0 = empty.
 */
import { shuffle } from '../lib/rng.js';

export const SIZE = 4;
export const BOX = 2;
const CELLS = SIZE * SIZE;

/** Target number of given cells per difficulty (hard = as few as uniqueness allows). */
export const GIVENS = { easy: 8, medium: 6, hard: 0 };

/** @param {number} index @returns {{ row: number, col: number, box: number }} */
export function position(index) {
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  return { row, col, box: Math.floor(row / BOX) * BOX + Math.floor(col / BOX) };
}

/** Indexes sharing a row, column or box with the given cell (excluding itself). */
export function peers(index) {
  const p = position(index);
  const result = [];
  for (let i = 0; i < CELLS; i++) {
    if (i === index) continue;
    const q = position(i);
    if (q.row === p.row || q.col === p.col || q.box === p.box) result.push(i);
  }
  return result;
}

const PEERS = Array.from({ length: CELLS }, (_, i) => peers(i));

/** @param {number[]} grid @param {number} index @param {number} value */
export function canPlace(grid, index, value) {
  return PEERS[index].every((peer) => grid[peer] !== value);
}

/**
 * Create a complete valid grid.
 * @param {() => number} rng
 * @returns {number[]}
 */
export function generateSolution(rng) {
  const grid = new Array(CELLS).fill(0);
  const fill = (index) => {
    if (index === CELLS) return true;
    for (const value of shuffle([1, 2, 3, 4], rng)) {
      if (!canPlace(grid, index, value)) continue;
      grid[index] = value;
      if (fill(index + 1)) return true;
    }
    grid[index] = 0;
    return false;
  };
  fill(0);
  return grid;
}

/**
 * Count solutions up to a limit (2 is enough to test uniqueness).
 * @param {number[]} grid
 * @param {number} [limit]
 */
export function countSolutions(grid, limit = 2) {
  const work = grid.slice();
  let count = 0;
  const solve = () => {
    const index = work.indexOf(0);
    if (index === -1) {
      count++;
      return;
    }
    for (let value = 1; value <= SIZE && count < limit; value++) {
      if (!canPlace(work, index, value)) continue;
      work[index] = value;
      solve();
      work[index] = 0;
    }
  };
  solve();
  return count;
}

/**
 * Generate a puzzle with exactly one solution.
 * @param {() => number} rng
 * @param {'easy'|'medium'|'hard'} [difficulty]
 * @returns {{ puzzle: number[], solution: number[] }}
 */
export function generatePuzzle(rng, difficulty = 'easy') {
  const solution = generateSolution(rng);
  const puzzle = solution.slice();
  const target = GIVENS[difficulty] ?? GIVENS.easy;
  let givens = CELLS;
  for (const index of shuffle([...Array(CELLS).keys()], rng)) {
    if (givens <= target) break;
    const kept = puzzle[index];
    puzzle[index] = 0;
    if (countSolutions(puzzle) === 1) givens--;
    else puzzle[index] = kept;
  }
  return { puzzle, solution };
}

/**
 * Cells whose value appears more than once in a row, column or box.
 * @param {number[]} grid
 * @returns {Set<number>}
 */
export function findConflicts(grid) {
  const conflicts = new Set();
  grid.forEach((value, index) => {
    if (!value) return;
    if (PEERS[index].some((peer) => grid[peer] === value)) conflicts.add(index);
  });
  return conflicts;
}

/** Complete and without conflicts. @param {number[]} grid */
export function isSolved(grid) {
  return grid.every((v) => v >= 1 && v <= SIZE) && findConflicts(grid).size === 0;
}

/**
 * Pick the cell a hint should fill: the preferred cell if it is empty or
 * wrong, otherwise the first such cell. Returns -1 if nothing is left.
 * @param {number[]} grid current entries
 * @param {number[]} solution
 * @param {number} [preferred]
 */
export function hintIndex(grid, solution, preferred = -1) {
  const needsHelp = (i) => grid[i] !== solution[i];
  if (preferred >= 0 && needsHelp(preferred)) return preferred;
  // Prefer wrong entries (they cause conflicts) over empty cells.
  const wrong = grid.findIndex((v, i) => v !== 0 && needsHelp(i));
  return wrong !== -1 ? wrong : grid.findIndex((v, i) => needsHelp(i));
}
