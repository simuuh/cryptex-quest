/**
 * Seeded pseudo-random numbers. Puzzles use these so a layout stays the
 * same when the page is reloaded.
 */

/**
 * Hash a string to an unsigned 32-bit integer (FNV-1a).
 * @param {string} text
 * @returns {number}
 */
export function hashString(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Create a deterministic random function (mulberry32).
 * @param {number|string} seed
 * @returns {() => number} returns floats in [0, 1)
 */
export function createRng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashString(String(seed));
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Random integer in [0, max).
 * @param {() => number} rng
 * @param {number} max
 * @returns {number}
 */
export function randomInt(rng, max) {
  return Math.floor(rng() * max);
}

/**
 * Return a shuffled copy of an array (Fisher-Yates).
 * @template T
 * @param {T[]} items
 * @param {() => number} rng
 * @returns {T[]}
 */
export function shuffle(items, rng) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
