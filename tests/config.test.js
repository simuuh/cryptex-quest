import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, validatePuzzleOptions } from '../js/lib/config.js';
import { createTranslator } from '../js/lib/i18n.js';
import { parsePuzzleIndex, puzzleUrl } from '../js/lib/routing.js';
import { createRng, shuffle } from '../js/lib/rng.js';
import exampleConfig from '../config.example.js';
import en from '../js/i18n/en.js';
import de from '../js/i18n/de.js';

const puzzles = (n) => Array.from({ length: n }, () => ({ type: 'sudoku' }));

test('a minimal valid config gets defaults', () => {
  const { errors, config } = validateConfig({ code: 'ABC', puzzles: puzzles(3) });
  assert.deepEqual(errors, []);
  assert.equal(config.language, 'en');
  assert.equal(config.skipAfterSeconds, 180);
  assert.equal(config.freeOrder, true);
  assert.equal(config.theme.mode, 'dark');
  assert.deepEqual(config.codeChars, ['A', 'B', 'C']);
});

test('the shipped example config is valid', () => {
  const { errors } = validateConfig(exampleConfig);
  assert.deepEqual(errors, []);
});

test('mismatched puzzle count is explained', () => {
  const { errors } = validateConfig({ code: 'QXMRT', puzzles: puzzles(4) });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /5 characters but there are 4 puzzles/);
});

test('code length limits and type errors', () => {
  assert.match(validateConfig({ code: 'AB', puzzles: puzzles(2) }).errors[0], /between 3 and 8/);
  assert.match(validateConfig({ code: 'ABCDEFGHI', puzzles: puzzles(9) }).errors[0], /between 3 and 8/);
  assert.match(validateConfig({ puzzles: puzzles(3) }).errors[0], /"code" is missing/);
  assert.match(validateConfig(null).errors[0], /must export an object/);
  const bad = validateConfig({ code: 'ABC', puzzles: puzzles(3), language: 'fr', freeOrder: 'yes', skipAfterSeconds: -1, theme: { mode: 'blue', accent: 'nope' } });
  assert.equal(bad.errors.length, 5);
});

test('emoji codes count as one character each', () => {
  const { errors, config } = validateConfig({ code: '🔑🌙⭐', puzzles: puzzles(3) });
  assert.deepEqual(errors, []);
  assert.equal(config.codeChars.length, 3);
});

test('module validators are prefixed with the puzzle number', () => {
  const modules = new Map([['sudoku', { validate: (o) => (o.bad ? ['bad option'] : []) }]]);
  const errors = validatePuzzleOptions([{ type: 'sudoku', options: {} }, { type: 'sudoku', options: { bad: true } }], modules);
  assert.deepEqual(errors, ['Puzzle 2 (sudoku): bad option']);
});

test('translator interpolates, pluralizes and falls back', () => {
  const t = createTranslator({ hi: 'Hallo {name}', n: { one: 'eins', other: '{n} viele' } }, { only: 'fallback' });
  assert.equal(t('hi', { name: 'Kim' }), 'Hallo Kim');
  assert.equal(t('n', { n: 1 }), 'eins');
  assert.equal(t('n', { n: 3 }), '3 viele');
  assert.equal(t('only'), 'fallback');
  assert.equal(t('missing'), 'missing');
});

test('German has every English key', () => {
  const missing = Object.keys(en).filter((key) => !(key in de));
  assert.deepEqual(missing, []);
});

test('routing uses 1-based ids and rejects junk', () => {
  assert.equal(puzzleUrl(0), 'puzzle.html?id=1');
  assert.equal(parsePuzzleIndex('?id=2', 5), 1);
  assert.equal(parsePuzzleIndex('?id=0', 5), null);
  assert.equal(parsePuzzleIndex('?id=6', 5), null);
  assert.equal(parsePuzzleIndex('?id=abc', 5), null);
  assert.equal(parsePuzzleIndex('', 5), null);
});

test('seeded rng is deterministic', () => {
  const a = createRng('seed');
  const b = createRng('seed');
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.deepEqual(shuffle([1, 2, 3, 4, 5], createRng(1)).sort(), [1, 2, 3, 4, 5]);
});
