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

  const session = createSession(ctx, index);
  if (isDone(store.get(), index)) return session.showSolution();
  store.update((s) => markStarted(s, index, Date.now()));
  session.play();
}

function showMessage(t, text) {
  document.getElementById('puzzle-title').textContent = text;
  document.getElementById('puzzle-instruction').replaceChildren(
    h('a', { class: 'btn btn-cq-primary mt-2', href: 'index.html', text: t('celebrate.continue') }),
  );
}

/**
 * Owns the stage for one puzzle: playing it, or showing the solved board with
 * a "play again" card below. Switching remounts the module.
 */
function createSession(ctx, index) {
  const { config, t, modules, store } = ctx;
  const entry = config.puzzles[index];
  const stage = document.getElementById('stage');
  const status = document.getElementById('status');
  const notice = document.getElementById('notice');
  const controls = document.getElementById('controls');
  const hintButton = document.getElementById('hint-button');
  const skipButton = document.getElementById('skip-button');
  let run = null;

  hintButton.prepend(icon('bulb'));
  skipButton.prepend(icon('skip'));
  hintButton.addEventListener('click', () => {
    if (!run || run.finished || !run.hintHandler) return;
    store.update((s) => recordHint(s, index));
    run.hintHandler();
  });
  skipButton.addEventListener('click', () => run?.finish('skipped'));

  function mount(showSolution) {
    if (run) {
      clearTimeout(run.skipTimer);
      run.destroy?.();
    }
    const current = { finished: showSolution, hintHandler: null, skipTimer: null, destroy: null, finish };
    run = current;
    status.textContent = '';
    notice.replaceChildren();
    hintButton.hidden = true;
    skipButton.hidden = true;

    function finish(how) {
      if (current.finished) return;
      current.finished = true;
      clearTimeout(current.skipTimer);
      controls.hidden = true;
      const wasDone = isDone(store.get(), index);
      store.update((s) => markDone(s, index, how));
      // Give the solved board a moment on screen before the dialog covers it.
      const delay = how === 'solved' && !prefersReducedMotion() ? 700 : 0;
      setTimeout(() => {
        current.destroy?.();
        current.destroy = null;
        celebrate(ctx, index, how, wasDone, () => (how === 'skipped' ? showSolution() : showDoneCard()));
      }, delay);
    }

    /** The API every puzzle module receives. See docs/adding-a-puzzle.md. */
    const api = {
      onSolved: () => finish('solved'),
      hint: (handler) => {
        if (current.finished) return;
        current.hintHandler = handler;
        hintButton.hidden = false;
      },
      t,
      rng: createRng(`${config.seed}|${index}|${entry.type}`),
      announce: (message) => {
        if (run === current) status.textContent = message;
      },
      reducedMotion: prefersReducedMotion(),
      assetUrl: ctx.assetUrl,
      showSolution,
    };

    const result = modules.get(entry.type).mount(stage, entry.options, api);
    current.destroy = typeof result === 'function' ? result : null;
    controls.hidden = showSolution;

    if (!showSolution && !isDone(store.get(), index)) {
      const wait = secondsUntilSkip(store.get(), index, config.skipAfterSeconds, Date.now());
      if (wait !== Infinity) current.skipTimer = setTimeout(() => (skipButton.hidden = false), wait * 1000);
    }
  }

  /** "Already solved" card with replay and back buttons, below the board. */
  function showDoneCard() {
    const again = h('button', { type: 'button', class: 'btn btn-cq-primary', on: { click: play } }, icon('reset'), t('puzzle.playAgain'));
    const back = h('a', { class: 'btn btn-cq-ghost', href: remainingCount(store.get()) === 0 ? 'done.html' : 'index.html', text: t('celebrate.continue') });
    notice.replaceChildren(
      h(
        'div',
        { class: 'cq-info mt-3' },
        h('p', { class: 'cq-info-title', text: t('puzzle.alreadyDone', { i: index + 1, char: config.codeChars[index] }) }),
        h('div', { class: 'cq-dialog-actions' }, again, back),
      ),
    );
  }

  function showSolution() {
    mount(true);
    showDoneCard();
  }

  function play() {
    mount(false);
    stage.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  return { play, showSolution };
}

function celebrate(ctx, index, how, wasDone, onStay) {
  const { config, t, store } = ctx;
  const allDone = remainingCount(store.get()) === 0;
  const target = allDone ? 'done.html' : `index.html?revealed=${index + 1}`;
  let stay = false;
  const go = h('a', { class: 'btn btn-cq-primary', href: target }, allDone ? t('celebrate.finish') : t('celebrate.continue'), icon('arrow'));
  const view = h('button', { type: 'button', class: 'btn btn-cq-ghost' }, icon('eye'), t('celebrate.viewSolution'));
  const dialog = openDialog(
    [
      h('h2', { text: how === 'skipped' ? t('celebrate.skipped') : t('celebrate.title') }),
      h('p', { text: t('celebrate.reveal', { i: index + 1 }) }),
      h('div', { class: 'cq-reveal-char', attrs: { role: 'img', 'aria-label': config.codeChars[index] } }, config.codeChars[index]),
      h('div', { class: 'cq-dialog-actions' }, go, view),
    ],
    {
      label: t('celebrate.title'),
      onClose: () => {
        if (stay) onStay();
        else location.href = target;
      },
    },
  );
  view.addEventListener('click', () => {
    stay = true;
    dialog.close();
  });
  if (how === 'solved' && !wasDone) confetti(dialog);
  go.focus();
}
