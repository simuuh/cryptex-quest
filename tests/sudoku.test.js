import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countSolutions, findConflicts, generatePuzzle, generateSolution, hintIndex, isSolved } from '../js/logic/sudoku.js';
import { createRng } from '../js/lib/rng.js';

test('generated solutions are valid for many seeds', () => {
  for (let seed = 0; seed < 200; seed++) {
    const grid = generateSolution(createRng(seed));
    assert.ok(isSolved(grid), `seed ${seed}`);
  }
});

test('generated puzzles have exactly one solution and respect difficulty', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    for (let seed = 0; seed < 100; seed++) {
      const { puzzle, solution } = generatePuzzle(createRng(`${difficulty}${seed}`), difficulty);
      const givens = puzzle.filter(Boolean).length;
      assert.equal(countSolutions(puzzle), 1, `${difficulty} seed ${seed}`);
      assert.ok(puzzle.every((v, i) => v === 0 || v === solution[i]));
      if (difficulty === 'easy') assert.equal(givens, 8);
      if (difficulty === 'medium') assert.equal(givens, 6);
      if (difficulty === 'hard') assert.ok(givens >= 4 && givens <= 6);
    }
  }
});

test('same seed gives the same puzzle', () => {
  assert.deepEqual(generatePuzzle(createRng('x')), generatePuzzle(createRng('x')));
});

test('conflicts are detected in rows, columns and boxes', () => {
  const grid = [
    1, 0, 0, 1,
    0, 1, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
  assert.deepEqual([...findConflicts(grid)].sort((a, b) => a - b), [0, 3, 5]);
  assert.equal(findConflicts(new Array(16).fill(0)).size, 0);
});

test('isSolved needs a full grid without conflicts', () => {
  const solution = generateSolution(createRng(7));
  assert.ok(isSolved(solution));
  const partial = solution.slice();
  partial[0] = 0;
  assert.ok(!isSolved(partial));
});

test('hintIndex prefers the selected cell, then wrong cells, then empty cells', () => {
  const solution = generateSolution(createRng(3));
  const grid = solution.slice();
  grid[2] = 0;
  grid[9] = 0;
  assert.equal(hintIndex(grid, solution, 9), 9);
  assert.equal(hintIndex(grid, solution), 2);
  grid[12] = (solution[12] % 4) + 1;
  assert.equal(hintIndex(grid, solution), 12);
  assert.equal(hintIndex(solution, solution), -1);
});
