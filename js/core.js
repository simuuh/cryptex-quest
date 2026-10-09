/**
 * App core: loads and validates the config, loads puzzle modules by type,
 * sets up i18n, theme and the persisted state store.
 *
 * Every page calls boot() and gets either a context object or null (in
 * which case a readable error page is already shown).
 *
 * Private mode: if config.enc exists, the config and personal photos are
 * decrypted in the browser with the key from the link (see docs/private-mode.md).
 */
import { BUILT_IN_TYPES, validateConfig, validatePuzzleOptions } from './lib/config.js';
import { createTranslator } from './lib/i18n.js';
import { createStorage } from './lib/storage.js';
import { createInitialState, normalizeState } from './lib/state.js';
import { hashString } from './lib/rng.js';
import { h, replaceChildren } from './lib/dom.js';
import { cryptoAvailable, toBase64url } from './lib/crypto.js';
import { createPrivateAssets, readKeyFragment, unlock } from './lib/private-mode.js';
import en from './i18n/en.js';
import de from './i18n/de.js';

const DICTIONARIES = { en, de };
const LOCKED = Symbol('locked');
const PLAIN_ASSETS = { prepare: async () => {}, url: (path) => path };
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
        `config.js exists but could not be loaded. Usually this is a missing comma, bracket or quote, or an apostrophe inside 'single quotes' (use "double quotes" for such text). Browser message: ${error.message}`,
      );
    }
  }
  return (await import(new URL('../config.example.js', import.meta.url).href)).default;
}

/**
 * Private mode: decrypt config.enc with the key from the link (#k=...) or
 * the one remembered from an earlier visit. The key never leaves the
 * browser and is never logged.
 * @returns {Promise<null | typeof LOCKED | { raw: any, assets: { prepare: Function, url: Function } }>}
 *   null when there is no config.enc (normal mode), LOCKED when a notice is shown instead
 */
async function loadPrivateConfig() {
  const payload = await fetchBytes(new URL('../config.enc', import.meta.url), { cache: 'no-store' }).catch(() => null);
  if (!payload) return null;

  // Take the key out of the address bar right away, so it is not left in
  // view, in bookmarks or in links copied from the address bar.
  const fragment = readKeyFragment(location.hash);
  if (fragment.key) history.replaceState(history.state, '', `${location.pathname}${location.search}${fragment.rest}`);

  const t = buildTranslator(visitorLanguage());
  if (!cryptoAvailable()) {
    renderPrivateNotice(t, 'private.insecureTitle', ['private.insecureText']);
    return LOCKED;
  }

  // One remembered key per folder, so several quests on one host do not clash.
  const scope = hashString(new URL('..', import.meta.url).pathname).toString(36);
  const keyStore = createStorage(`cryptex-quest:key:${scope}`);
  const stored = keyStore.load();
  const result = await unlock({
    payload,
    fragment,
    storedKey: typeof stored === 'string' ? stored : null,
    askPin: (attempt) => askPin(t, attempt),
  });
  document.getElementById('cq-pin')?.remove();
  if (result.locked) {
    if (result.locked === 'bad-stored-key') keyStore.clear();
    renderPrivateNotice(t, 'private.lockedTitle', ['private.lockedText', 'private.lockedHelp']);
    return LOCKED;
  }
  keyStore.save(toBase64url(result.key));

  const { privateAssets, ...raw } = result.raw && typeof result.raw === 'object' ? result.raw : {};
  const assets = createPrivateAssets(privateAssets, result.key, {
    fetchBytes: async (file) => {
      const bytes = await fetchBytes(new URL(`../${file}`, import.meta.url));
      if (!bytes) throw new Error('file not found');
      return bytes;
    },
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    warn: (message) => console.warn(message),
  });
  return { raw, assets };
}

/**
 * @param {URL} url
 * @param {RequestInit} [init]
 * @returns {Promise<Uint8Array|null>} null for a missing file (or an HTML fallback page)
 */
async function fetchBytes(url, init) {
  const response = await fetch(url, init);
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || type.includes('text/html')) return null;
  return new Uint8Array(await response.arrayBuffer());
}

/** The config language is not known before decrypting, so use the browser's. */
function visitorLanguage() {
  const preferred = globalThis.navigator?.languages?.[0] ?? globalThis.navigator?.language ?? 'en';
  const language = preferred.slice(0, 2).toLowerCase();
  return DICTIONARIES[language] ? language : 'en';
}

/**
 * Ask for the PIN in a card above the (still hidden) page.
 * @param {(key: string) => string} t
 * @param {{ wrong: boolean, digits: boolean }} attempt digits: show a number pad on phones
 * @returns {Promise<string>}
 */
function askPin(t, { wrong, digits }) {
  document.documentElement.lang = visitorLanguage();
  document.title = t('private.pinTitle');
  document.getElementById('cq-pin')?.remove();
  const input = h('input', {
    id: 'cq-pin-input',
    class: 'cq-pin-input',
    type: 'password',
    attrs: { inputmode: digits ? 'numeric' : 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', required: '' },
  });
  const button = h('button', { type: 'submit', class: 'btn btn-cq-primary', text: t('private.pinSubmit') });
  const error = wrong ? h('p', { id: 'cq-pin-error', class: 'cq-pin-error', attrs: { role: 'alert' }, text: t('private.pinWrong') }) : null;
  if (error) input.setAttribute('aria-describedby', error.id);
  const form = h(
    'form',
    { class: 'cq-pin-form' },
    h('label', { class: 'cq-section-title', attrs: { for: 'cq-pin-input' }, text: t('private.pinLabel') }),
    input,
    error,
    button,
  );
  const card = h(
    'section',
    { id: 'cq-pin', class: 'cq-card cq-private' },
    h('h1', { class: 'cq-title', text: t('private.pinTitle') }),
    h('p', { class: 'cq-lead', text: t('private.pinText') }),
    form,
  );
  (document.getElementById('app') ?? document.body).prepend(card);
  input.focus();
  return new Promise((resolve) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!input.value.trim()) return;
      input.disabled = true;
      button.disabled = true;
      button.textContent = t('private.pinBusy');
      resolve(input.value);
    });
  });
}

/**
 * A calm page for visitors without a (working) key. Never shows technical details.
 * @param {(key: string) => string} t
 * @param {string} titleKey
 * @param {string[]} textKeys
 */
function renderPrivateNotice(t, titleKey, textKeys) {
  document.documentElement.lang = visitorLanguage();
  document.title = t(titleKey);
  replaceChildren(
    document.getElementById('app') ?? document.body,
    h(
      'section',
      { class: 'cq-card cq-private', attrs: { role: 'status' } },
      h('h1', { class: 'cq-title', text: t(titleKey) }),
      textKeys.map((key, i) => h('p', { class: i ? 'cq-muted' : 'cq-lead', text: t(key) })),
    ),
  );
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
 * `assetUrl(path)` maps an image path from the config to a URL the browser
 * can load; in private mode, call `await prepareAssets(options)` first.
 * @returns {Promise<null | { config: object, t: Function, modules: Map<string, object>, store: object, assetUrl: (path: string) => string, prepareAssets: (value: any) => Promise<void> }>}
 */
export async function boot() {
  let raw;
  let assets = PLAIN_ASSETS;
  try {
    const privateConfig = await loadPrivateConfig();
    if (privateConfig === LOCKED) return null;
    if (privateConfig) ({ raw, assets } = privateConfig);
    else raw = await loadRawConfig();
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
  return { config, t, modules, store: createStore(config), assetUrl: assets.url, prepareAssets: assets.prepare };
}
