/**
 * App core: loads and validates the config, loads puzzle modules by type,
 * sets up i18n, theme and the persisted state store.
 *
 * Every page calls boot() and gets either a context object or null (in
 * which case a readable error page is already shown).
 */
import { BUILT_IN_TYPES, validateConfig, validatePuzzleOptions } from './lib/config.js';
import { createTranslator } from './lib/i18n.js';
import { createStorage } from './lib/storage.js';
import { createInitialState, normalizeState } from './lib/state.js';
import { hashString } from './lib/rng.js';
import { h, replaceChildren } from './lib/dom.js';
import en from './i18n/en.js';
import de from './i18n/de.js';

const DICTIONARIES = { en, de };
const THEME_VARIABLES = {
  accent: '--cq-accent',
  secondary: '--cq-secondary',
  background: '--cq-bg',
  surface: '--cq-surface',
  text: '--cq-text',
  softError: '--cq-soft-error',
};

/**
 * Load config.js if it exists, otherwise config.example.js.
 * A config.js that exists but fails to load is reported, never silently replaced.
 * @returns {Promise<any>}
 */
export async function loadRawConfig() {
  const userUrl = new URL('../config.js', import.meta.url);
  if (await looksLikeScript(userUrl)) {
    try {
      return (await import(userUrl.href)).default;
    } catch (error) {
      throw new Error(
        `config.js exists but could not be loaded. Usually this is a missing comma, bracket or quote. Browser message: ${error.message}`,
      );
    }
  }
  return (await import(new URL('../config.example.js', import.meta.url).href)).default;
}

async function looksLikeScript(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    const type = response.headers.get('content-type') ?? '';
    return response.ok && !type.includes('text/html');
  } catch {
    return false;
  }
}

/**
 * Import one module per distinct puzzle type from js/puzzles/<type>.js.
 * @param {string[]} types
 * @returns {Promise<{ modules: Map<string, object>, errors: string[] }>}
 */
export async function loadPuzzleModules(types) {
  const modules = new Map();
  const errors = [];
  await Promise.all(
    [...new Set(types)].map(async (type) => {
      try {
        const mod = (await import(`./puzzles/${type}.js`)).default;
        if (!mod || mod.id !== type || typeof mod.mount !== 'function') {
          errors.push(`js/puzzles/${type}.js is not a valid puzzle module (it needs a default export with id "${type}", title and mount).`);
        } else {
          modules.set(type, mod);
        }
      } catch {
        errors.push(
          `Puzzle type "${type}" could not be loaded. Check the spelling, or add js/puzzles/${type}.js. Built-in types: ${BUILT_IN_TYPES.join(', ')}.`,
        );
      }
    }),
  );
  return { modules, errors };
}

/**
 * Build a translator for a language, including strings shipped by puzzle modules.
 * @param {string} language
 * @param {Map<string, object>} [modules]
 */
export function buildTranslator(language, modules = new Map()) {
  const extra = (lang) => Object.assign({}, ...[...modules.values()].map((m) => m.strings?.[lang] ?? {}));
  const fallback = { ...extra('en'), ...en };
  const dictionary = { ...extra(language), ...(DICTIONARIES[language] ?? en) };
  const t = createTranslator(dictionary, fallback);
  t.has = (key) => key in dictionary || key in fallback;
  return t;
}

/**
 * Apply theme mode and color overrides as CSS variables on <html>.
 * @param {{ mode: string } & Record<string, string>} theme
 */
export function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme.mode;
  for (const [key, variable] of Object.entries(THEME_VARIABLES)) {
    if (theme[key]) root.style.setProperty(variable, theme[key]);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--cq-bg').trim() || meta.content;
}

/**
 * Persisted state store. The storage key depends on the code and puzzle
 * types, so changing the config starts a fresh quest.
 * @param {object} config normalized config
 */
export function createStore(config) {
  const fingerprint = [config.code, config.seed, ...config.puzzles.map((p) => p.type)].join('|');
  const storage = createStorage(`cryptex-quest:${hashString(fingerprint).toString(36)}`);
  const count = config.puzzles.length;
  let state = normalizeState(storage.load(), count);
  return {
    get: () => state,
    /** @param {(state: object) => object} reducer */
    update(reducer) {
      state = reducer(state);
      storage.save(state);
      return state;
    },
    reset() {
      storage.clear();
      state = createInitialState(count);
    },
    get persistent() {
      return storage.persistent;
    },
  };
}

/**
 * Show a friendly error page in place of the app.
 * @param {string[]} errors
 * @param {(key: string) => string} t
 */
export function renderErrorPage(errors, t) {
  const main = document.getElementById('app') ?? document.body;
  document.title = t('error.title');
  replaceChildren(
    main,
    h(
      'section',
      { class: 'cq-card cq-error', attrs: { role: 'alert' } },
      h('h1', { class: 'cq-title', text: t('error.title') }),
      h('p', { text: t('error.intro') }),
      h('ul', { class: 'cq-error-list' }, errors.map((message) => h('li', { text: message }))),
      h('p', { class: 'cq-muted', text: t('error.help') }),
    ),
  );
}

/**
 * Title, subtitle and instruction for a puzzle: config overrides win,
 * otherwise the module's i18n keys are used.
 * @param {object} ctx boot context
 * @param {number} index
 */
export function describePuzzle(ctx, index) {
  const entry = ctx.config.puzzles[index];
  const mod = ctx.modules.get(entry.type);
  const fromKey = (key) => (key && ctx.t.has(key) ? ctx.t(key) : '');
  return {
    title: entry.title || fromKey(mod.title) || entry.type,
    subtitle: entry.subtitle || fromKey(mod.subtitle ?? `${mod.id}.subtitle`),
    instruction: entry.instruction || fromKey(mod.instruction ?? `${mod.id}.instruction`),
  };
}

/**
 * Load everything a page needs.
 * @returns {Promise<null | { config: object, t: Function, modules: Map<string, object>, store: object }>}
 */
export async function boot() {
  let raw;
  try {
    raw = await loadRawConfig();
  } catch (error) {
    renderErrorPage([error.message], buildTranslator('en'));
    return null;
  }

  const language = DICTIONARIES[raw?.language] ? raw.language : 'en';
  document.documentElement.lang = language;
  const isColor = (value) => globalThis.CSS?.supports?.('color', value) ?? true;
  const { errors, config } = validateConfig(raw, { isColor });
  if (errors.length) {
    renderErrorPage(errors, buildTranslator(language));
    return null;
  }

  const { modules, errors: moduleErrors } = await loadPuzzleModules(config.puzzles.map((p) => p.type));
  const t = buildTranslator(language, modules);
  const allErrors = moduleErrors.length ? moduleErrors : validatePuzzleOptions(config.puzzles, modules);
  if (allErrors.length) {
    renderErrorPage(allErrors, t);
    return null;
  }

  applyTheme(config.theme);
  document.title = config.title || t('app.name');
  return { config, t, modules, store: createStore(config) };
}
