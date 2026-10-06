import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect, dotAt, minDistance, pathData, validatePoints } from '../js/logic/dots.js';
import exampleConfig from '../config.example.js';

const triangle = [[50, 10], [90, 90], [10, 90]];

test('only the next dot connects', () => {
  assert.equal(connect(0, 0, 3), 1);
  assert.equal(connect(1, 2, 3), 1, 'skipping ahead does nothing');
  assert.equal(connect(1, 0, 3), 1, 'tapping an old dot does nothing');
  assert.equal(connect(3, 3, 3), 3, 'nothing after the last dot');
});

test('path grows and closes when complete', () => {
  assert.equal(pathData(triangle, 0, true), '');
  assert.equal(pathData(triangle, 2, true), 'M50 10 L90 90');
  assert.equal(pathData(triangle, 3, true), 'M50 10 L90 90 L10 90 Z');
  assert.equal(pathData(triangle, 3, false), 'M50 10 L90 90 L10 90');
});

test('dotAt finds the nearest dot inside the radius', () => {
  assert.equal(dotAt(triangle, 52, 12, 5), 0);
  assert.equal(dotAt(triangle, 50, 50, 5), -1);
  assert.equal(dotAt([[10, 10], [14, 10]], 13, 10, 10), 1);
});

test('point validation explains problems', () => {
  assert.deepEqual(validatePoints(triangle), []);
  assert.equal(validatePoints([[1, 1]]).length, 1);
  assert.match(validatePoints([[1, 1], [2, 200], [3, 3]])[0], /point 2/);
  assert.equal(validatePoints('nope').length, 1);
});

test('the example shape is comfortably tappable', () => {
  const dots = exampleConfig.puzzles.find((p) => p.type === 'dots');
  assert.deepEqual(validatePoints(dots.options.points), []);
  assert.ok(minDistance(dots.options.points) >= 14);
});
