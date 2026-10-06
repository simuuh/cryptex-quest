/**
 * Pure logic for connect-the-dots. Points live on a 100 x 100 board and are
 * connected in list order. Progress is a single number: how many dots are
 * connected so far (the next dot to tap has that index).
 */

export const MIN_POINTS = 3;
export const MAX_POINTS = 30;

/**
 * Validate a point list from the config.
 * @param {any} points
 * @returns {string[]} human-readable errors
 */
export function validatePoints(points) {
  if (!Array.isArray(points) || points.length < MIN_POINTS || points.length > MAX_POINTS) {
    return [`points must be a list of ${MIN_POINTS} to ${MAX_POINTS} [x, y] pairs, for example [[50, 10], [90, 90], [10, 90]].`];
  }
  const errors = [];
  points.forEach((p, i) => {
    const ok = Array.isArray(p) && p.length === 2 && p.every((v) => Number.isFinite(v) && v >= 0 && v <= 100);
    if (!ok) errors.push(`point ${i + 1} must be [x, y] with numbers from 0 to 100 (got ${JSON.stringify(p)}).`);
  });
  return errors;
}

/**
 * Smallest distance between any two points (board units).
 * @param {number[][]} points
 */
export function minDistance(points) {
  let min = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      min = Math.min(min, Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]));
    }
  }
  return min;
}

/**
 * Connect a dot if it is the next one in order.
 * @param {number} connected dots connected so far
 * @param {number} index dot that was tapped
 * @param {number} total
 * @returns {number} new connected count (unchanged if it was not the next dot)
 */
export function connect(connected, index, total) {
  return index === connected && connected < total ? connected + 1 : connected;
}

/**
 * SVG path through the connected dots; closes the shape when complete.
 * @param {number[][]} points
 * @param {number} connected
 * @param {boolean} closed
 * @returns {string}
 */
export function pathData(points, connected, closed) {
  if (connected < 1) return '';
  const d = points.slice(0, connected).map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  return closed && connected === points.length ? `${d} Z` : d;
}

/**
 * Index of the dot within `radius` of (x, y), or -1. Nearest wins.
 * @param {number[][]} points
 * @param {number} x
 * @param {number} y
 * @param {number} radius board units
 */
export function dotAt(points, x, y, radius) {
  let best = -1;
  let bestDistance = radius;
  points.forEach(([px, py], i) => {
    const distance = Math.hypot(px - x, py - y);
    if (distance <= bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best;
}
