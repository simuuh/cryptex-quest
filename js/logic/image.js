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
