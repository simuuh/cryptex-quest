import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, normalizeState, markStarted, markDone, recordHint,
  isUnlocked, revealedCode, remainingCount, secondsUntilSkip,
} from '../js/lib/state.js';
import { createStorage } from '../js/lib/storage.js';

test('initial state has one open entry per puzzle', () => {
  const s = createInitialState(3);
  assert.equal(s.puzzles.length, 3);
  assert.ok(s.puzzles.every((p) => p.status === 'open' && p.startedAt === null));
  assert.equal(remainingCount(s), 3);
});

test('normalizeState repairs garbage and resizes', () => {
  assert.deepEqual(normalizeState(null, 2), createInitialState(2));
  assert.deepEqual(normalizeState({ v: 99 }, 2), createInitialState(2));
  const repaired = normalizeState({ v: 1, puzzles: [{ status: 'weird', startedAt: 'x', hints: -1 }, { status: 'solved', startedAt: 5, hints: 2 }, {}] }, 2);
  assert.deepEqual(repaired.puzzles, [
    { status: 'open', startedAt: null, hints: 0 },
    { status: 'solved', startedAt: 5, hints: 2 },
  ]);
});

test('reducers are pure and record progress', () => {
  const s0 = createInitialState(3);
  const s1 = markStarted(s0, 1, 1000);
  assert.equal(s0.puzzles[1].startedAt, null);
  assert.equal(s1.puzzles[1].startedAt, 1000);
  assert.equal(markStarted(s1, 1, 2000).puzzles[1].startedAt, 1000, 'start time is kept');
  const s2 = markDone(recordHint(s1, 1), 1, 'skipped');
  assert.equal(s2.puzzles[1].status, 'skipped');
  assert.equal(s2.puzzles[1].hints, 1);
  assert.equal(markDone(s2, 1, 'solved').puzzles[1].status, 'skipped', 'done stays done');
  assert.deepEqual(revealedCode(s2, ['A', 'B', 'C']), [null, 'B', null]);
  assert.equal(remainingCount(s2), 2);
});

test('sequential order unlocks one by one, free order unlocks all', () => {
  let s = createInitialState(3);
  assert.equal(isUnlocked(s, 0, false), true);
  assert.equal(isUnlocked(s, 1, false), false);
  assert.equal(isUnlocked(s, 2, true), true);
  s = markDone(s, 0);
  assert.equal(isUnlocked(s, 1, false), true);
  assert.equal(isUnlocked(s, 2, false), false);
});

test('skip timer counts from first open', () => {
  const s = markStarted(createInitialState(1), 0, 10_000);
  assert.equal(secondsUntilSkip(s, 0, 180, 10_000), 180);
  assert.equal(secondsUntilSkip(s, 0, 180, 100_000), 90);
  assert.equal(secondsUntilSkip(s, 0, 180, 999_999), 0);
  assert.equal(secondsUntilSkip(s, 0, 0, 10_000), Infinity);
});

test('storage falls back to memory when the backend throws', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  const store = createStorage('k', broken);
  store.save({ a: 1 });
  assert.equal(store.persistent, false);
  assert.deepEqual(store.load(), { a: 1 });
});

test('storage uses the backend when it works', () => {
  const map = new Map();
  const backend = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
  const store = createStorage('k', backend);
  store.save({ b: 2 });
  assert.equal(map.get('k'), '{"b":2}');
  assert.deepEqual(createStorage('k', backend).load(), { b: 2 });
  store.clear();
  assert.equal(store.load(), null);
});
