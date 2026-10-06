/**
 * Pure state helpers. The state only records what happened per puzzle;
 * everything else (locked, remaining, revealed code) is derived.
 *
 * Shape: { v: 1, puzzles: [{ status: 'open'|'solved'|'skipped', startedAt: number|null, hints: number }] }
 */

export const STATE_VERSION = 1;
const STATUSES = new Set(['open', 'solved', 'skipped']);

/**
 * @param {number} count number of puzzles
 * @returns {object}
 */
export function createInitialState(count) {
  return {
    v: STATE_VERSION,
    puzzles: Array.from({ length: count }, () => ({ status: 'open', startedAt: null, hints: 0 })),
  };
}

/**
 * Repair anything loaded from storage. Unknown or broken data never throws;
 * it is replaced by a fresh state.
 * @param {any} raw
 * @param {number} count
 * @returns {object}
 */
export function normalizeState(raw, count) {
  const fresh = createInitialState(count);
  if (!raw || raw.v !== STATE_VERSION || !Array.isArray(raw.puzzles)) return fresh;
  fresh.puzzles = fresh.puzzles.map((empty, i) => {
    const p = raw.puzzles[i];
    if (!p || typeof p !== 'object') return empty;
    return {
      status: STATUSES.has(p.status) ? p.status : 'open',
      startedAt: Number.isFinite(p.startedAt) ? p.startedAt : null,
      hints: Number.isInteger(p.hints) && p.hints >= 0 ? p.hints : 0,
    };
  });
  return fresh;
}

function updatePuzzle(state, index, patch) {
  return {
    ...state,
    puzzles: state.puzzles.map((p, i) => (i === index ? { ...p, ...patch } : p)),
  };
}

/**
 * Remember when a puzzle was first opened (drives the skip timer).
 * @param {object} state
 * @param {number} index
 * @param {number} now ms timestamp
 */
export function markStarted(state, index, now) {
  if (state.puzzles[index].startedAt !== null) return state;
  return updatePuzzle(state, index, { startedAt: now });
}

/**
 * @param {object} state
 * @param {number} index
 * @param {'solved'|'skipped'} how
 */
export function markDone(state, index, how = 'solved') {
  if (isDone(state, index)) return state;
  return updatePuzzle(state, index, { status: how === 'skipped' ? 'skipped' : 'solved' });
}

/** @param {object} state @param {number} index */
export function recordHint(state, index) {
  return updatePuzzle(state, index, { hints: state.puzzles[index].hints + 1 });
}

/** @param {object} state @param {number} index */
export function isDone(state, index) {
  return state.puzzles[index].status !== 'open';
}

/**
 * In free order every puzzle is available; otherwise all earlier ones must be done.
 * @param {object} state
 * @param {number} index
 * @param {boolean} freeOrder
 */
export function isUnlocked(state, index, freeOrder) {
  if (freeOrder) return true;
  return state.puzzles.slice(0, index).every((p) => p.status !== 'open');
}

/**
 * Characters revealed so far, null for empty slots.
 * @param {object} state
 * @param {string[]} codeChars
 * @returns {(string|null)[]}
 */
export function revealedCode(state, codeChars) {
  return codeChars.map((ch, i) => (isDone(state, i) ? ch : null));
}

/** @param {object} state */
export function remainingCount(state) {
  return state.puzzles.filter((p) => p.status === 'open').length;
}

/**
 * Seconds left until the skip button may appear. 0 means show it now,
 * Infinity means never.
 * @param {object} state
 * @param {number} index
 * @param {number} skipAfterSeconds
 * @param {number} now
 */
export function secondsUntilSkip(state, index, skipAfterSeconds, now) {
  if (!skipAfterSeconds) return Infinity;
  const startedAt = state.puzzles[index].startedAt ?? now;
  const elapsed = Math.max(0, (now - startedAt) / 1000);
  return Math.max(0, Math.ceil(skipAfterSeconds - elapsed));
}
