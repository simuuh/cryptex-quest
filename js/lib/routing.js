/**
 * URL helpers. Puzzle ids in URLs are 1-based (puzzle.html?id=1),
 * indexes in code are 0-based.
 */

/**
 * @param {number} index 0-based
 * @returns {string} relative URL
 */
export function puzzleUrl(index) {
  return `puzzle.html?id=${index + 1}`;
}

/**
 * Read the puzzle index from a query string.
 * @param {string} search e.g. location.search
 * @param {number} count number of puzzles
 * @returns {number|null} 0-based index, or null if missing/invalid
 */
export function parsePuzzleIndex(search, count) {
  const raw = new URLSearchParams(search).get('id');
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const index = Number(raw) - 1;
  return index >= 0 && index < count ? index : null;
}
