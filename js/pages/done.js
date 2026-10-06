/**
 * Final page: the full code in slot order, plus a reset option.
 */
import { boot } from '../core.js';
import { h } from '../lib/dom.js';
import { remainingCount, revealedCode } from '../lib/state.js';
import { confetti, icon, openDialog, renderSlots, translateStatic } from '../lib/ui.js';

const ctx = await boot();
if (ctx) render(ctx);

function render({ config, t, store }) {
  const state = store.get();
  const remaining = remainingCount(state);
  translateStatic(document, t);
  document.getElementById('back-link').prepend(icon('back'));

  renderSlots(document.getElementById('slots'), revealedCode(state, config.codeChars), t, { labels: true });

  const incomplete = document.getElementById('incomplete');
  incomplete.hidden = remaining === 0;
  incomplete.replaceChildren(
    h('p', { class: 'cq-info-title', text: t('done.incomplete', { n: remaining }) }),
    h('a', { class: 'btn btn-cq-secondary mt-3', href: 'index.html' }, t('done.back')),
  );

  const outro = document.getElementById('outro');
  outro.textContent = config.outro;
  outro.hidden = remaining > 0 || !config.outro;

  document.getElementById('reset-button').prepend(icon('reset'));
  document.getElementById('reset-button').addEventListener('click', () => confirmReset(t, store));
  document.getElementById('view').hidden = false;

  if (remaining === 0) confetti(document.getElementById('slots').parentElement);
}

function confirmReset(t, store) {
  const cancel = h('button', { type: 'button', class: 'btn btn-cq-ghost', text: t('done.cancel') });
  const confirm = h('button', { type: 'button', class: 'btn btn-cq-primary', text: t('done.resetConfirm') });
  const dialog = openDialog(
    [
      h('h2', { text: t('done.resetTitle') }),
      h('p', { text: t('done.resetText') }),
      h('div', { class: 'cq-dialog-actions' }, cancel, confirm),
    ],
    { label: t('done.resetTitle') },
  );
  cancel.addEventListener('click', () => dialog.close());
  confirm.addEventListener('click', () => {
    store.reset();
    location.href = 'index.html';
  });
  cancel.focus();
}
