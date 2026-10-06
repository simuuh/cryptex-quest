/**
 * Pure word search logic: word placement, straight-line selection and
 * matching. Grids are flat arrays of letters, indexed row * size + col.
 */
import { randomInt, shuffle } from '../lib/rng.js';

export const MIN_SIZE = 6;
export const MAX_SIZE = 10;
export const MAX_WORDS = 8;
const FORWARD = [[0, 1], [1, 0], [1, 1], [-1, 1]];
const BACKWARD = FORWARD.map(([dr, dc]) => [-dr, -dc]);
const FILL_LETTERS = 'ABCDEFGHIJKLMNOPRSTUVWYZ';

/**
 * Uppercase a word for the grid.
 * @param {string} word
 */
export function normalizeWord(word) {
  return word.trim().toLocaleUpperCase();
}

/**
 * @param {{ words?: any, size?: any, backwards?: any }} options
 * @returns {string[]} errors
 */
export function validateOptions({ words, size = 8, backwards = false }) {
  const errors = [];
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
    errors.push(`size must be a whole number from ${MIN_SIZE} to ${MAX_SIZE} (got ${JSON.stringify(size)}).`);
    return errors;
  }
  if (typeof backwards !== 'boolean') errors.push('backwards must be true or false.');
  if (!Array.isArray(words) || words.length < 1 || words.length > MAX_WORDS) {
    errors.push(`words must be a list of 1 to ${MAX_WORDS} words, for example ['KEY', 'CODE'].`);
    return errors;
  }
  for (const word of words) {
    if (typeof word !== 'string' || !/^\p{L}+$/u.test(word.trim())) {
      errors.push(`"${word}" must be a single word made of letters only (no spaces or digits).`);
    } else if ([...normalizeWord(word)].length < 3 || [...normalizeWord(word)].length > size) {
      errors.push(`"${word}" must have 3 to ${size} letters to fit the ${size}x${size} grid.`);
    }
  }
  if (!errors.length && !tryPlaceWords(words.map(normalizeWord), size, () => 0.5, backwards)) {
    errors.push('the words do not fit into the grid. Use fewer or shorter words, or a bigger size.');
  }
  return errors;
}

/**
 * Cells for a word starting at (row, col) in a direction, or null if it leaves the grid.
 * @returns {number[]|null}
 */
function cellsFor(length, row, col, [dr, dc], size) {
  const endRow = row + dr * (length - 1);
  const endCol = col + dc * (length - 1);
  if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) return null;
  return Array.from({ length }, (_, i) => (row + dr * i) * size + (col + dc * i));
}

function tryPlaceWords(words, size, rng, backwards) {
  const directions = backwards ? [...FORWARD, ...BACKWARD] : FORWARD;
  const grid = new Array(size * size).fill('');
  const placements = [];
  const sorted = [...words].sort((a, b) => [...b].length - [...a].length);
  for (const word of sorted) {
    const letters = [...word];
    const options = [];
    for (const direction of directions) {
      for (let start = 0; start < size * size; start++) {
        const cells = cellsFor(letters.length, Math.floor(start / size), start % size, direction, size);
        if (cells && cells.every((cell, i) => grid[cell] === '' || grid[cell] === letters[i])) options.push(cells);
      }
    }
    if (!options.length) return null;
    const cells = options[randomInt(rng, options.length)];
    cells.forEach((cell, i) => (grid[cell] = letters[i]));
    placements.push({ word, cells });
  }
  return { grid, placements: words.map((word) => placements.find((p) => p.word === word)) };
}

/**
 * Place words and fill the rest with random letters.
 * @param {string[]} words already normalized
 * @param {number} size
 * @param {() => number} rng
 * @param {boolean} [backwards] also allow reversed directions
 * @returns {{ grid: string[], placements: { word: string, cells: number[] }[] }}
 */
export function generateGrid(words, size, rng, backwards = false) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = tryPlaceWords(shuffle(words, rng), size, rng, backwards);
    if (!result) continue;
    const grid = result.grid.map((letter) => letter || FILL_LETTERS[randomInt(rng, FILL_LETTERS.length)]);
    return { grid, placements: words.map((word) => result.placements.find((p) => p.word === word)) };
  }
  throw new Error('Words do not fit into the grid.');
}

/**
 * Cells on the straight line from start to end (horizontal, vertical or
 * diagonal), or null if the two cells are not on such a line.
 * @param {number} start
 * @param {number} end
 * @param {number} size
 * @returns {number[]|null}
 */
export function lineCells(start, end, size) {
  const r1 = Math.floor(start / size);
  const c1 = start % size;
  const dr = Math.floor(end / size) - r1;
  const dc = (end % size) - c1;
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
  const steps = Math.max(Math.abs(dr), Math.abs(dc));
  return Array.from({ length: steps + 1 }, (_, i) => (r1 + Math.sign(dr) * i) * size + (c1 + Math.sign(dc) * i));
}

/**
 * Which unfound placement (if any) matches the selected cells, in either direction.
 * @param {number[]} cells
 * @param {{ cells: number[] }[]} placements
 * @param {Set<number>} found indexes of placements already found
 * @returns {number} placement index or -1
 */
export function matchSelection(cells, placements, found) {
  const key = cells.join(',');
  const reversed = [...cells].reverse().join(',');
  return placements.findIndex((p, i) => !found.has(i) && (p.cells.join(',') === key || p.cells.join(',') === reversed));
}
