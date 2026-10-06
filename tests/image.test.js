import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backgroundPosition, countCorrect, createShuffledOrder, hintSwap, isComplete, swapTiles } from '../js/logic/image.js';
import { createRng } from '../js/lib/rng.js';

test('shuffled orders are permutations with few tiles in place', () => {
  for (const size of [3, 4]) {
    for (let seed = 0; seed < 100; seed++) {
      const order = createShuffledOrder(size * size, createRng(seed));
      assert.deepEqual(order.slice().sort((a, b) => a - b), [...Array(size * size).keys()]);
      assert.ok(countCorrect(order) <= 1, `size ${size} seed ${seed}`);
      assert.ok(!isComplete(order));
    }
  }
});

test('tiles in place are locked', () => {
  const order = [0, 2, 1, 3];
  assert.deepEqual(swapTiles(order, 1, 2), [0, 1, 2, 3]);
  assert.equal(swapTiles(order, 0, 1), order, 'tile 0 is in place and must not move');
  assert.equal(swapTiles(order, 1, 1), order);
});

test('following hints always completes the picture', () => {
  let order = createShuffledOrder(16, createRng('hint'));
  let steps = 0;
  for (let swap = hintSwap(order); swap; swap = hintSwap(order)) {
    const before = countCorrect(order);
    order = swapTiles(order, ...swap);
    assert.ok(countCorrect(order) > before, 'every hint locks at least one tile');
    steps++;
  }
  assert.ok(isComplete(order));
  assert.ok(steps <= 15);
});

test('background positions cover the corners', () => {
  assert.equal(backgroundPosition(0, 3), '0% 0%');
  assert.equal(backgroundPosition(8, 3), '100% 100%');
  assert.equal(backgroundPosition(1, 4), '33.333333333333336% 0%');
});
