# Adding a puzzle

A puzzle type is **one file** in `js/puzzles/` plus **one entry** in the config. The core loads `js/puzzles/<type>.js` the first time a config entry uses `type: '<type>'`, so there is no registry to edit.

## The module interface

```js
export default {
  id: 'riddle',              // must equal the file name (js/puzzles/riddle.js)
  title: 'riddle.title',     // i18n key for the default title
  subtitle: 'riddle.subtitle',       // optional; defaults to '<id>.subtitle'
  instruction: 'riddle.instruction', // optional; defaults to '<id>.instruction'

  strings: { en: { ... }, de: { ... } }, // optional: UI strings shipped with the module

  validate(options) { return []; },      // optional: list of human-readable problems

  mount(container, options, api) {
    // build the puzzle inside `container`
    return () => { /* optional cleanup */ };
  },
};
```

### `mount(container, options, api)`

| Argument | Meaning |
| --- | --- |
| `container` | An empty element to render into. It stays on screen under the celebration dialog. |
| `options` | The `options` object from the config entry (`{}` if none was given). |
| `api` | The services described below. |

`mount` may return a cleanup function. The puzzle page calls it after the puzzle is solved, so remove document-level listeners and timers there. The DOM can stay.

### `api`

| Member | Description |
| --- | --- |
| `api.onSolved()` | Call this once when the puzzle is solved. The page saves progress and shows the character. Extra calls are ignored. |
| `api.hint(handler)` | Register the function the **Hint** button calls. The button only appears once a handler is registered. Every hint should make real progress, such as filling a cell, locking a tile or revealing a letter. |
| `api.t(key, params)` | Translate a key, for example `t('riddle.progress', { n: 2, total: 5 })`. Plural values use `{ one, other }` and the `n` param. |
| `api.rng()` | Seeded random number in `[0, 1)`. The seed comes from the config seed, the puzzle position and the type, so a layout survives reloads. Use it instead of `Math.random()`. |
| `api.announce(text)` | Show a short status line, which screen readers also announce. Use friendly wording and never say "wrong". |
| `api.reducedMotion` | `true` if the user prefers reduced motion. |
| `api.assetUrl(path)` | The URL to load for a file path from the options, such as `'assets/custom/photo.jpg'`. Use it for every image you show or fetch: in [private mode](private-mode.md) it returns a URL to the decrypted photo; otherwise it returns the path unchanged. |
| `api.showSolution` | `true` when the page wants the finished puzzle on screen (a solved puzzle is opened again, or the player chose **View the solution**). Render the solved state right away and don't call `onSolved()`; the same `api.rng` seed gives you the same layout. |

The **skip** button, the timer, saving state and the celebration are handled by the page. A puzzle only needs to call `onSolved()`.

## Template

`js/puzzles/riddle.js`: a single question with tappable answers.

```js
import { h } from '../lib/dom.js';

export default {
  id: 'riddle',
  title: 'riddle.title',
  strings: {
    en: {
      'riddle.title': 'Riddle',
      'riddle.subtitle': 'One question',
      'riddle.instruction': 'Pick the answer you think fits.',
      'riddle.again': 'Not quite. Try another one!',
    },
    de: {
      'riddle.title': 'Rätselfrage',
      'riddle.subtitle': 'Eine Frage',
      'riddle.instruction': 'Wähle die passende Antwort.',
      'riddle.again': 'Fast! Probier eine andere.',
    },
  },

  validate(options) {
    const errors = [];
    if (typeof options.question !== 'string') errors.push('question must be text in quotes.');
    if (!Array.isArray(options.answers) || options.answers.length < 2) errors.push('answers must be a list of at least 2 answers.');
    if (!Number.isInteger(options.correct)) errors.push('correct must be the number of the right answer, starting at 1.');
    return errors;
  },

  mount(container, options, api) {
    const buttons = options.answers.map((answer, i) =>
      h('button', { type: 'button', class: 'btn btn-cq-ghost w-100', text: answer, on: { click: () => pick(i) } }),
    );
    container.replaceChildren(
      h('div', { class: 'cq-card d-flex flex-column gap-2' }, h('p', { class: 'cq-lead', text: options.question }), buttons),
    );

    api.hint(() => {
      // Remove one wrong answer per hint.
      const wrong = buttons.find((b, i) => i !== options.correct - 1 && !b.hidden);
      if (wrong) wrong.hidden = true;
    });

    function pick(i) {
      if (i === options.correct - 1) api.onSolved();
      else api.announce(api.t('riddle.again'));
    }
  },
};
```

Config entry:

```js
{ type: 'riddle', options: { question: 'What has keys but opens no locks?', answers: ['A piano', 'A door', 'A map'], correct: 1 } },
```

## Guidelines

- **Put the logic in a pure module.** Place rules, generation and checks in `js/logic/<type>.js` with no DOM access, and test them in `tests/<type>.test.js` with `node --test`. See the built-in puzzles for examples.
- **No frustration.** Never show "wrong" or a red error. Soften clashes, let mistakes undo themselves, and make every hint count.
- **Phones first.** Make touch targets at least 44px, don't rely on hover, avoid horizontal scrolling at 360px, and offer tap as an alternative to drag.
- **Accessibility.** Use real `<button>`s with `aria-label`s that describe the state, add keyboard support where it makes sense, and only animate in ways `prefers-reduced-motion` can turn off.
- **Theme.** Use only the `--cq-*` CSS variables from `css/theme.css` so dark and light mode and custom accents keep working. Add styles to `css/puzzles.css` or inline them in the module.
- **Validation.** Return readable problems from `validate(options)`. They are shown as "Puzzle 3 (riddle): …" on the config error page.
- **Text.** Put user-facing text in `strings` (or in `js/i18n/*.js` for built-in puzzles), with English and German.
