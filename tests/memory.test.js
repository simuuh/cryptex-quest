import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeOpen, columnsFor, createState, flip, hintPair, isComplete, isImagePath, matchPair, validatePairs } from '../js/logic/memory.js';
import { createRng } from '../js/lib/rng.js';

const fixed = { cards: [0, 1, 0, 1], open: [], matched: [] };

test('deck has two cards per pair', () => {
  const { cards } = createState(6, createRng(1));
  assert.equal(cards.length, 12);
  for (let id = 0; id < 6; id++) assert.equal(cards.filter((c) => c === id).length, 2);
});

test('matching pair stays open', () => {
  let { state, result } = flip(fixed, 0);
  assert.equal(result, 'opened');
  ({ state, result } = flip(state, 2));
  assert.equal(result, 'match');
  assert.deepEqual(state.matched, [0, 2]);
  assert.deepEqual(state.open, []);
  assert.equal(flip(state, 0).result, 'ignored');
});

test('mismatched pair flips back, and a third tap closes it immediately', () => {
  let { state, result } = flip(flip(fixed, 0).state, 1);
  assert.equal(result, 'mismatch');
  assert.deepEqual(state.open, [0, 1]);
  assert.deepEqual(closeOpen(state).open, []);
  ({ state, result } = flip(state, 3));
  assert.equal(result, 'opened');
  assert.deepEqual(state.open, [3]);
});

test('tapping the same card twice is ignored', () => {
  const once = flip(fixed, 0).state;
  assert.equal(flip(once, 0).result, 'ignored');
});

test('hints finish the game', () => {
  let state = createState(5, createRng('hint'));
  state = flip(state, 3).state;
  const [a, b] = hintPair(state);
  assert.equal(a, 3, 'hint completes the open card first');
  assert.equal(state.cards[a], state.cards[b]);
  for (let pair = hintPair(state); pair; pair = hintPair(state)) state = matchPair(state, pair);
  assert.ok(isComplete(state));
});

test('validation and helpers', () => {
  assert.deepEqual(validatePairs(['a', 'b']), []);
  assert.equal(validatePairs(['a']).length, 1);
  assert.match(validatePairs(['a', 'a'])[0], /different/);
  assert.match(validatePairs(['a', ''])[0], /text/);
  assert.ok(isImagePath('assets/cat.JPG'));
  assert.ok(!isImagePath('🐱'));
  assert.equal(columnsFor(4), 2);
  assert.equal(columnsFor(6), 3);
  assert.equal(columnsFor(12), 4);
});
