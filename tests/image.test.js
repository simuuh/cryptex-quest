import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  backgroundPosition, countCorrect, createShuffledOrder, hintSwap, imagePathProblem, isComplete,
  loadWithFallback, PLACEHOLDER_IMAGE, squareCrop, swapTiles,
} from '../js/logic/image.js';
import exampleConfig from '../config.example.js';
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

test('squareCrop centers landscape and portrait images and caps the size', () => {
  assert.deepEqual(squareCrop(4000, 3000), { sx: 500, sy: 0, side: 3000, out: 1200 });
  assert.deepEqual(squareCrop(1080, 1920), { sx: 0, sy: 420, side: 1080, out: 1080 });
  assert.deepEqual(squareCrop(801, 800, 600), { sx: 0, sy: 0, side: 800, out: 600 });
  assert.throws(() => squareCrop(0, 100), /no size/);
});

test('image paths must be relative and inside assets/', () => {
  assert.equal(imagePathProblem('assets/custom/photo.jpg'), null);
  assert.equal(imagePathProblem(PLACEHOLDER_IMAGE), null);
  assert.match(imagePathProblem('https://example.com/a.jpg'), /relative path/);
  assert.match(imagePathProblem('/assets/a.jpg'), /relative path/);
  assert.match(imagePathProblem(String.raw`C:\Users\me\a.jpg`), /relative path/);
  assert.match(imagePathProblem(String.raw`\\server\share\a.jpg`), /relative path/);
  assert.match(imagePathProblem(String.raw`assets\..\secret.jpg`), /inside the assets\/ folder/);
  assert.match(imagePathProblem('photos/a.jpg'), /inside the assets\/ folder/);
  assert.match(imagePathProblem('assets/../secret.jpg'), /inside the assets\/ folder/);
  assert.match(imagePathProblem(''), /file path/);
});

test('example config uses the committed placeholder, not assets/custom/', () => {
  const entry = exampleConfig.puzzles.find((p) => p.type === 'image');
  assert.equal(entry.options.image, PLACEHOLDER_IMAGE);
});

test('loadWithFallback returns the picture when it loads', async () => {
  const warnings = [];
  const result = await loadWithFallback('assets/custom/a.jpg', PLACEHOLDER_IMAGE, async (p) => `data:${p}`, (m) => warnings.push(m));
  assert.deepEqual(result, { value: 'data:assets/custom/a.jpg', path: 'assets/custom/a.jpg' });
  assert.deepEqual(warnings, []);
});

test('loadWithFallback warns clearly and uses the placeholder when the picture fails', async () => {
  const warnings = [];
  const load = async (p) => {
    if (p !== PLACEHOLDER_IMAGE) throw new Error('HTTP 404');
    return 'placeholder-data';
  };
  const result = await loadWithFallback('assets/custom/missing.jpg', PLACEHOLDER_IMAGE, load, (m) => warnings.push(m));
  assert.deepEqual(result, { value: 'placeholder-data', path: PLACEHOLDER_IMAGE });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /assets\/custom\/missing\.jpg.*HTTP 404.*placeholder/);
});

test('loadWithFallback gives up gracefully when nothing loads', async () => {
  const warnings = [];
  const fail = async () => { throw new Error('offline'); };
  assert.deepEqual(await loadWithFallback('assets/custom/a.jpg', PLACEHOLDER_IMAGE, fail, (m) => warnings.push(m)), { value: null, path: null });
  assert.equal(warnings.length, 2);
  warnings.length = 0;
  assert.deepEqual(await loadWithFallback(PLACEHOLDER_IMAGE, PLACEHOLDER_IMAGE, fail, (m) => warnings.push(m)), { value: null, path: null });
  assert.equal(warnings.length, 1, 'no second attempt when the placeholder itself was requested');
});
