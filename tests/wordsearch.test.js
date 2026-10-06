import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateGrid, lineCells, matchSelection, normalizeWord, validateOptions } from '../js/logic/wordsearch.js';
import { createRng } from '../js/lib/rng.js';

const WORDS = ['CRYPTEX', 'KEY', 'CODE', 'RIDDLE', 'QUEST'];

function readWord(grid, cells) {
  return cells.map((c) => grid[c]).join('');
}

test('every word is placed on a straight line and readable', () => {
  for (let seed = 0; seed < 100; seed++) {
    const { grid, placements } = generateGrid(WORDS, 8, createRng(seed));
    assert.equal(grid.length, 64);
    assert.ok(grid.every((l) => /^\p{L}$/u.test(l)));
    placements.forEach((p, i) => {
      assert.equal(p.word, WORDS[i]);
      assert.equal(readWord(grid, p.cells), p.word, `seed ${seed}`);
      assert.deepEqual(lineCells(p.cells[0], p.cells.at(-1), 8), p.cells);
    });
  }
});

test('forward-only placement never reads right-to-left or upwards-left', () => {
  for (let seed = 0; seed < 50; seed++) {
    const { placements } = generateGrid(WORDS, 8, createRng(seed));
    for (const { cells } of placements) {
      const step = cells[1] - cells[0];
      assert.ok([1, 8, 9, -7].includes(step), `step ${step}`);
    }
  }
});

test('words with umlauts are kept intact', () => {
  const { grid, placements } = generateGrid(['SCHLÜSSEL', 'RÄTSEL'].map(normalizeWord), 9, createRng(4));
  assert.equal(readWord(grid, placements[0].cells), 'SCHLÜSSEL');
});

test('lineCells accepts only straight lines', () => {
  assert.deepEqual(lineCells(0, 3, 8), [0, 1, 2, 3]);
  assert.deepEqual(lineCells(0, 27, 8), [0, 9, 18, 27]);
  assert.deepEqual(lineCells(24, 3, 8), [24, 17, 10, 3]);
  assert.deepEqual(lineCells(5, 5, 8), [5]);
  assert.equal(lineCells(0, 10, 8), null);
});

test('selection matches in both directions and only once', () => {
  const placements = [{ cells: [1, 2, 3] }, { cells: [8, 16, 24] }];
  assert.equal(matchSelection([3, 2, 1], placements, new Set()), 0);
  assert.equal(matchSelection([8, 16, 24], placements, new Set()), 1);
  assert.equal(matchSelection([1, 2, 3], placements, new Set([0])), -1);
  assert.equal(matchSelection([1, 2], placements, new Set()), -1);
});

test('options are validated with helpful messages', () => {
  assert.deepEqual(validateOptions({ words: WORDS }), []);
  assert.match(validateOptions({ words: ['TOOLONGWORD'] })[0], /3 to 8 letters/);
  assert.match(validateOptions({ words: ['TWO WORDS'] })[0], /letters only/);
  assert.match(validateOptions({ words: WORDS, size: 3 })[0], /size/);
  assert.match(validateOptions({ words: [] })[0], /1 to 8 words/);
  const crowded = ['ABCDEF', 'GHIJKL', 'MNOPQR', 'STUVWX', 'YZABCD', 'EFGHIJ', 'KLMNOP'];
  assert.match(validateOptions({ words: crowded, size: 6 })[0], /do not fit/);
});
