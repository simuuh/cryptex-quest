/**
 * Pure logic for the tile-swap picture puzzle. An order is an array where
 * order[position] = tile id; the picture is complete when order[i] === i.
 */
import { shuffle } from '../lib/rng.js';

/**
 * Shuffle tiles so the puzzle starts with at most `maxCorrect` tiles in place.
 * @param {number} count number of tiles (size * size)
 * @param {() => number} rng
 * @param {number} [maxCorrect]
 * @returns {number[]}
 */
export function createShuffledOrder(count, rng, maxCorrect = 1) {
  const ids = [...Array(count).keys()];
  let best = null;
  for (let attempt = 0; attempt < 100; attempt++) {
    const order = shuffle(ids, rng);
    if (!best || countCorrect(order) < countCorrect(best)) best = order;
    if (countCorrect(best) <= maxCorrect) break;
  }
  return best;
}

/** @param {number[]} order @param {number} position */
export function isInPlace(order, position) {
  return order[position] === position;
}

/** @param {number[]} order */
export function countCorrect(order) {
  return order.filter((tile, position) => tile === position).length;
}

/** @param {number[]} order */
export function isComplete(order) {
  return countCorrect(order) === order.length;
}

/**
 * Swap two positions. Tiles already in place never move.
 * @param {number[]} order
 * @param {number} a
 * @param {number} b
 * @returns {number[]} a new order (the same array if the swap is not allowed)
 */
export function swapTiles(order, a, b) {
  if (a === b || isInPlace(order, a) || isInPlace(order, b)) return order;
  const next = order.slice();
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/**
 * The swap a hint should make: bring the right tile to the first wrong position.
 * @param {number[]} order
 * @returns {[number, number]|null}
 */
export function hintSwap(order) {
  const position = order.findIndex((tile, i) => tile !== i);
  if (position === -1) return null;
  return [position, order.indexOf(position)];
}

/**
 * CSS background-position for a tile id in a size x size grid.
 * @param {number} tile
 * @param {number} size
 * @returns {string}
 */
export function backgroundPosition(tile, size) {
  const row = Math.floor(tile / size);
  const col = tile % size;
  const step = 100 / (size - 1);
  return `${col * step}% ${row * step}%`;
}

export const PLACEHOLDER_IMAGE = 'assets/placeholder-picture.svg';
export const MAX_CROP_SIDE = 1200;

/**
 * Check that an image option is a relative path inside assets/.
 * @param {any} path
 * @returns {string|null} a human-readable problem, or null if fine
 */
export function imagePathProblem(path) {
  if (typeof path !== 'string' || !path.trim()) return 'image must be a file path in quotes, for example "assets/custom/photo.jpg".';
  const value = path.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('/') || value.startsWith('\\')) {
    return `image must be a relative path inside assets/, for example "assets/custom/photo.jpg" (got "${value}").`;
  }
  if (!value.startsWith('assets/') || value.split(/[\\/]/).includes('..')) {
    return `image must be inside the assets/ folder, for example "assets/custom/photo.jpg" (got "${value}").`;
  }
  return null;
}

/**
 * Source rectangle and output size for a centered square crop.
 * @param {number} width source width in pixels (after orientation)
 * @param {number} height source height in pixels
 * @param {number} [maxSide] largest output side
 * @returns {{ sx: number, sy: number, side: number, out: number }}
 */
export function squareCrop(width, height, maxSide = MAX_CROP_SIDE) {
  if (!(width > 0 && height > 0)) throw new Error('Image has no size.');
  const side = Math.min(width, height);
  return {
    sx: Math.floor((width - side) / 2),
    sy: Math.floor((height - side) / 2),
    side,
    out: Math.min(side, maxSide),
  };
}

/**
 * Load `src`; if that fails, warn and load `fallback` instead.
 * The loader is injected so this works (and is tested) without a browser.
 * @template T
 * @param {string} src
 * @param {string} fallback
 * @param {(path: string) => Promise<T>} load
 * @param {(message: string) => void} warn
 * @returns {Promise<{ value: T|null, path: string|null }>} value null if both fail
 */
export async function loadWithFallback(src, fallback, load, warn) {
  try {
    return { value: await load(src), path: src };
  } catch (error) {
    const reason = error?.message ?? String(error);
    if (src === fallback) {
      warn(`[cryptex-quest] The placeholder picture "${fallback}" could not be loaded (${reason}). Tiles are shown without a picture.`);
      return { value: null, path: null };
    }
    warn(
      `[cryptex-quest] The picture "${src}" could not be loaded (${reason}). Using the placeholder instead. ` +
        'Check that the file exists and that the path and capitalization in config.js match.',
    );
    try {
      return { value: await load(fallback), path: fallback };
    } catch (fallbackError) {
      warn(`[cryptex-quest] The placeholder picture "${fallback}" could not be loaded either (${fallbackError?.message ?? fallbackError}).`);
      return { value: null, path: null };
    }
  }
}
