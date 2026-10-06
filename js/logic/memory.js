/**
 * Pure memory (pairs) logic. State is a plain object so every step is a
 * small reducer that is easy to test:
 *   { cards: number[] (pair id per card), open: number[], matched: number[] }
 */
import { shuffle } from '../lib/rng.js';

export const MIN_PAIRS = 2;
export const MAX_PAIRS = 10;
const IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|svg|avif)$/i;

/**
 * Is a pair value an image path (rather than emoji/text)?
 * @param {string} value
 */
export function isImagePath(value) {
  return IMAGE_PATTERN.test(value.trim());
}

/**
 * @param {any} pairs
 * @returns {string[]} errors
 */
export function validatePairs(pairs) {
  if (!Array.isArray(pairs) || pairs.length < MIN_PAIRS || pairs.length > MAX_PAIRS) {
    return [`pairs must be a list of ${MIN_PAIRS} to ${MAX_PAIRS} items, for example ['🐱', '🐶', '🦊'].`];
  }
  const errors = [];
  if (pairs.some((p) => typeof p !== 'string' || !p.trim())) errors.push('every pair must be text (an emoji, a word or an image path) in quotes.');
  else if (new Set(pairs).size !== pairs.length) errors.push('every pair must be different, otherwise two pairs would look the same.');
  return errors;
}

/**
 * Two shuffled cards per pair.
 * @param {number} pairCount
 * @param {() => number} rng
 */
export function createState(pairCount, rng) {
  const cards = shuffle([...Array(pairCount).keys()].flatMap((id) => [id, id]), rng);
  return { cards, open: [], matched: [] };
}

/** @param {object} state */
export function isMismatchShowing(state) {
  return state.open.length === 2 && state.cards[state.open[0]] !== state.cards[state.open[1]];
}

/**
 * Turn a card face up. If a mismatched pair is still showing, it is turned
 * back first so play never blocks.
 * @param {object} state
 * @param {number} index
 * @returns {{ state: object, result: 'ignored'|'opened'|'match'|'mismatch' }}
 */
export function flip(state, index) {
  if (state.matched.includes(index) || state.open.includes(index) || index < 0 || index >= state.cards.length) {
    return { state, result: 'ignored' };
  }
  const open = isMismatchShowing(state) ? [index] : [...state.open, index];
  if (open.length < 2) return { state: { ...state, open }, result: 'opened' };
  const [a, b] = open;
  if (state.cards[a] === state.cards[b]) {
    return { state: { ...state, open: [], matched: [...state.matched, a, b] }, result: 'match' };
  }
  return { state: { ...state, open }, result: 'mismatch' };
}

/** Turn all open, unmatched cards face down. @param {object} state */
export function closeOpen(state) {
  return state.open.length ? { ...state, open: [] } : state;
}

/** @param {object} state */
export function isComplete(state) {
  return state.matched.length === state.cards.length;
}

/**
 * The two card indexes a hint should match: the partner of a single open
 * card if there is one, otherwise the first unmatched pair.
 * @param {object} state
 * @returns {[number, number]|null}
 */
export function hintPair(state) {
  const unmatched = (i) => !state.matched.includes(i);
  const first = state.open.length === 1 ? state.open[0] : state.cards.findIndex((_, i) => unmatched(i));
  if (first === -1) return null;
  const partner = state.cards.findIndex((pair, i) => i !== first && pair === state.cards[first] && unmatched(i));
  return [first, partner];
}

/**
 * Match a pair directly (used by hints).
 * @param {object} state
 * @param {[number, number]} pair
 */
export function matchPair(state, [a, b]) {
  return { ...state, open: [], matched: [...state.matched, a, b] };
}

/** Grid columns that keep cards large on a phone. @param {number} cardCount */
export function columnsFor(cardCount) {
  if (cardCount <= 4) return 2;
  if (cardCount % 3 === 0 && cardCount <= 9) return 3;
  return 4;
}
