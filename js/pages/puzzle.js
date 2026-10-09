/**
 * Puzzle page: mounts one puzzle module and handles hint, skip and the
 * celebration when a character is revealed.
 */
import { boot, describePuzzle } from '../core.js';
import { h, prefersReducedMotion } from '../lib/dom.js';
import { createRng } from '../lib/rng.js';
import { parsePuzzleIndex } from '../lib/routing.js';
import { isDone, isUnlocked, markDone, markStarted, recordHint, remainingCount, secondsUntilSkip } from '../lib/state.js';
import { confetti, icon, openDialog, translateStatic } from '../lib/ui.js';

const ctx = await boot();
if (ctx) await render(ctx);

async function render(ctx) {
  const { config, t, store } = ctx;
  translateStatic(document, t);
  document.getElementById('back-link').prepend(icon('back'));
  document.getElementById('view').hidden = false;

  const index = parsePuzzleIndex(location.search, config.puzzles.length);
  if (index === null) return showMessage(t, t('puzzle.notFound'));
  if (!isUnlocked(store.get(), index, config.freeOrder)) return showMessage(t, t('puzzle.locked'));

  const { title, instruction } = describePuzzle(ctx, index);
  document.getElementById('puzzle-label').textContent = t('puzzle.label', { i: index + 1 });
  document.getElementById('puzzle-title').textContent = title;
  document.getElementById('puzzle-instruction').textContent = instruction;
  document.title = `${title} · ${config.title || t('app.name')}`;
  await ctx.prepareAssets(config.puzzles[index].options);

  if (isDone(store.get(), index)) {
    const again = h('button', { type: 'button', class: 'btn btn-cq-ghost mt-3', text: t('puzzle.playAgain') });
    const notice = h(
      'div',
      { class: 'cq-info' },
      h('p', { class: 'cq-info-title', text: t('puzzle.alreadyDone', { i: index + 1, char: config.codeChars[index] }) }),
      again,
    );
    document.getElementById('notice').replaceChildren(notice);
    again.addEventListener('click', () => {
      notice.remove();
      startPuzzle(ctx, index);
    });
    return;
  }
  store.update((s) => markStarted(s, index, Date.now()));
  startPuzzle(ctx, index);
}

function showMessage(t, text) {
  document.getElementById('puzzle-title').textContent = text;
  document.getElementById('puzzle-instruction').replaceChildren(
    h('a', { class: 'btn btn-cq-primary mt-2', href: 'index.html', text: t('celebrate.continue') }),
  );
}

function startPuzzle(ctx, index) {
  const { config, t, modules, store } = ctx;
  const entry = config.puzzles[index];
  const stage = document.getElementById('stage');
  const status = document.getElementById('status');
  const controls = document.getElementById('controls');
  const hintButton = document.getElementById('hint-button');
  const skipButton = document.getElementById('skip-button');
  let hintHandler = null;
  let finished = false;
  let skipTimer = null;
  let destroy = null;

  const finish = (how) => {
    if (finished) return;
    finished = true;
    clearTimeout(skipTimer);
    controls.hidden = true;
    const wasDone = isDone(store.get(), index);
    store.update((s) => markDone(s, index, how));
    // Give the solved board a moment on screen before the dialog covers it.
    setTimeout(() => celebrate(ctx, index, how, wasDone, () => destroy?.()), how === 'solved' && !prefersReducedMotion() ? 700 : 0);
  };

  /** The API every puzzle module receives. See docs/adding-a-puzzle.md. */
  const api = {
    onSolved: () => finish('solved'),
    hint: (handler) => {
      hintHandler = handler;
      hintButton.hidden = false;
    },
    t,
    rng: createRng(`${config.seed}|${index}|${entry.type}`),
    announce: (message) => {
      status.textContent = message;
    },
    reducedMotion: prefersReducedMotion(),
    assetUrl: ctx.assetUrl,
  };

  hintButton.prepend(icon('bulb'));
  hintButton.hidden = true;
  hintButton.addEventListener('click', () => {
    if (finished || !hintHandler) return;
    store.update((s) => recordHint(s, index));
    hintHandler();
  });
  skipButton.prepend(icon('skip'));
  skipButton.addEventListener('click', () => finish('skipped'));

  const result = modules.get(entry.type).mount(stage, entry.options, api);
  destroy = typeof result === 'function' ? result : null;
  controls.hidden = false;

  if (!isDone(store.get(), index)) {
    const wait = secondsUntilSkip(store.get(), index, config.skipAfterSeconds, Date.now());
    if (wait !== Infinity) skipTimer = setTimeout(() => (skipButton.hidden = false), wait * 1000);
  }
}

function celebrate(ctx, index, how, wasDone, cleanup) {
  const { config, t, store } = ctx;
  const allDone = remainingCount(store.get()) === 0;
  const target = allDone ? 'done.html' : `index.html?revealed=${index + 1}`;
  const go = h('a', { class: 'btn btn-cq-primary', href: target }, allDone ? t('celebrate.finish') : t('celebrate.continue'), icon('arrow'));
  const dialog = openDialog(
    [
      h('h2', { text: how === 'skipped' ? t('celebrate.skipped') : t('celebrate.title') }),
      h('p', { text: t('celebrate.reveal', { i: index + 1 }) }),
      h('div', { class: 'cq-reveal-char', attrs: { role: 'img', 'aria-label': config.codeChars[index] } }, config.codeChars[index]),
      h('div', { class: 'cq-dialog-actions' }, go),
    ],
    { label: t('celebrate.title'), onClose: () => (location.href = target) },
  );
  if (how === 'solved' && !wasDone) confetti(dialog);
  go.focus();
  cleanup();
}
