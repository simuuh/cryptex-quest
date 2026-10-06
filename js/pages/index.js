/**
 * Overview page: code slots, puzzle list and remaining count.
 */
import { boot, describePuzzle } from '../core.js';
import { h } from '../lib/dom.js';
import { isDone, isUnlocked, remainingCount, revealedCode } from '../lib/state.js';
import { puzzleUrl } from '../lib/routing.js';
import { icon, renderSlots, translateStatic } from '../lib/ui.js';

const ctx = await boot();
if (ctx) render(ctx);

function render(ctx) {
  const { config, t, store } = ctx;
  const state = store.get();
  translateStatic(document, t);

  document.getElementById('headline').textContent =
    config.title || (config.recipientName ? t('index.headlineNamed', { name: config.recipientName }) : t('index.headline'));
  document.getElementById('intro').textContent = config.intro || t('index.intro');

  const slots = document.getElementById('slots');
  slots.setAttribute('aria-label', t('slot.group'));
  renderSlots(slots, revealedCode(state, config.codeChars), t, { fresh: freshlyRevealed() });

  document.getElementById('puzzle-list').replaceChildren(
    ...config.puzzles.map((_, i) => h('li', {}, puzzleItem(ctx, state, i))),
  );

  renderProgress(t, remainingCount(state));
  document.getElementById('storage-warning').hidden = store.persistent;
  document.getElementById('view').hidden = false;
}

function puzzleItem(ctx, state, index) {
  const { config, t } = ctx;
  const { title, subtitle } = describePuzzle(ctx, index);
  const done = isDone(state, index);
  const unlocked = isUnlocked(state, index, config.freeOrder);
  const status = state.puzzles[index].status;
  const statusText = done ? t(`status.${status}`) : unlocked ? t('status.open') : t('status.locked');

  const stateNode = done
    ? [h('span', { class: 'cq-visually-hidden', text: statusText }), h('span', { class: 'cq-mini-slot', attrs: { 'aria-hidden': 'true' }, text: config.codeChars[index] })]
    : h('span', { class: `cq-pill${unlocked ? ' is-ready' : ''}` }, unlocked ? null : icon('lock'), statusText);

  const content = [
    h('span', { class: 'cq-item-num', attrs: { 'aria-hidden': 'true' } }, done ? icon('check') : String(index + 1)),
    h(
      'span',
      { class: 'cq-item-body' },
      h('span', { class: 'cq-visually-hidden', text: t('puzzle.label', { i: index + 1 }) + ': ' }),
      h('span', { class: 'cq-item-title', text: title }),
      subtitle && h('span', { class: 'cq-item-sub', text: subtitle }),
    ),
    h('span', { class: 'cq-item-state' }, stateNode),
  ];
  const className = `cq-item${done ? ' is-done' : ''}${unlocked ? '' : ' is-locked'}`;
  return unlocked
    ? h('a', { class: className, href: puzzleUrl(index) }, content)
    : h('div', { class: className, attrs: { 'aria-disabled': 'true' } }, content);
}

function renderProgress(t, remaining) {
  const box = document.getElementById('progress');
  if (remaining > 0) {
    box.replaceChildren(
      h(
        'div',
        { class: 'cq-info' },
        h('p', { class: 'cq-info-title', text: t('index.left', { n: remaining }) }),
        h('p', { text: t('index.leftHint') }),
      ),
    );
  } else {
    box.replaceChildren(
      h('p', { class: 'cq-info-title text-center mb-3', text: t('index.allDone') }),
      h('a', { class: 'btn btn-cq-primary w-100', href: 'done.html' }, t('index.toDone'), icon('arrow')),
    );
  }
}

/** Slot indexes revealed on the puzzle page just before coming back here. */
function freshlyRevealed() {
  const index = Number(new URLSearchParams(location.search).get('revealed'));
  return Number.isInteger(index) && index > 0 ? [index - 1] : [];
}
