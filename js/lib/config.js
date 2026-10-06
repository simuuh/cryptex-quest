/**
 * Config validation and normalization. Pure: no DOM, no imports of puzzle
 * modules. Puzzle-specific option checks are passed in by the caller.
 */

export const BUILT_IN_TYPES = ['sudoku', 'image', 'dots', 'memory', 'wordsearch'];
export const LANGUAGES = ['en', 'de'];
export const MIN_CODE_LENGTH = 3;
export const MAX_CODE_LENGTH = 8;
const TYPE_PATTERN = /^[a-z][a-z0-9-]*$/;
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const THEME_COLOR_KEYS = ['accent', 'secondary', 'background', 'surface', 'text', 'softError'];

/**
 * Split a code into characters (emoji-safe for surrogate pairs).
 * @param {string} code
 * @returns {string[]}
 */
export function splitCode(code) {
  return Array.from(code);
}

/**
 * Validate a raw config object.
 * @param {any} raw the default export of config.js
 * @param {{ isColor?: (value: string) => boolean }} [helpers]
 * @returns {{ errors: string[], config: object|null }}
 */
export function validateConfig(raw, helpers = {}) {
  const isColor = helpers.isColor ?? ((v) => HEX_COLOR.test(v));
  const errors = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { errors: ['The config file must export an object: export default { code: "...", puzzles: [...] }'], config: null };
  }

  const codeChars = validateCode(raw.code, errors);
  const puzzles = validatePuzzles(raw.puzzles, errors);

  if (codeChars && puzzles && codeChars.length !== puzzles.length) {
    errors.push(
      `The code "${raw.code}" has ${codeChars.length} characters but there are ${puzzles.length} puzzles. ` +
        'Each puzzle reveals exactly one character, so both numbers must match.',
    );
  }

  for (const key of ['recipientName', 'title', 'intro', 'outro']) {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') {
      errors.push(`"${key}" must be text in quotes, for example ${key}: "Hello".`);
    }
  }

  const language = raw.language ?? 'en';
  if (!LANGUAGES.includes(language)) {
    errors.push(`"language" must be one of ${LANGUAGES.map((l) => `"${l}"`).join(', ')} (got "${language}").`);
  }

  const skipAfterSeconds = raw.skipAfterSeconds ?? 180;
  if (!Number.isFinite(skipAfterSeconds) || skipAfterSeconds < 0) {
    errors.push('"skipAfterSeconds" must be a number of seconds, 0 or more (0 = never show the skip button).');
  }

  const freeOrder = raw.freeOrder ?? true;
  if (typeof freeOrder !== 'boolean') {
    errors.push('"freeOrder" must be true or false (without quotes).');
  }

  const theme = validateTheme(raw.theme, isColor, errors);

  if (errors.length) return { errors, config: null };

  return {
    errors,
    config: {
      code: raw.code,
      codeChars,
      puzzles,
      recipientName: raw.recipientName ?? '',
      title: raw.title ?? '',
      intro: raw.intro ?? '',
      outro: raw.outro ?? '',
      language,
      theme,
      skipAfterSeconds,
      freeOrder,
      seed: raw.seed === undefined ? String(raw.code) : String(raw.seed),
    },
  };
}

function validateCode(code, errors) {
  if (typeof code !== 'string') {
    errors.push('"code" is missing. Set it to the cryptex code in quotes, for example code: "QXMRT".');
    return null;
  }
  const chars = splitCode(code);
  if (chars.length < MIN_CODE_LENGTH || chars.length > MAX_CODE_LENGTH) {
    errors.push(
      `"code" must have between ${MIN_CODE_LENGTH} and ${MAX_CODE_LENGTH} characters ("${code}" has ${chars.length}).`,
    );
    return null;
  }
  if (chars.some((ch) => /\s/.test(ch))) {
    errors.push(`"code" must not contain spaces ("${code}").`);
    return null;
  }
  return chars;
}

function validatePuzzles(list, errors) {
  if (!Array.isArray(list) || list.length === 0) {
    errors.push('"puzzles" must be a list in square brackets, with one entry per code character.');
    return null;
  }
  let ok = true;
  const puzzles = list.map((entry, i) => {
    const where = `Puzzle ${i + 1}`;
    if (!entry || typeof entry !== 'object') {
      errors.push(`${where} must be an object like { type: "sudoku", options: {} }.`);
      ok = false;
      return null;
    }
    if (typeof entry.type !== 'string' || !TYPE_PATTERN.test(entry.type)) {
      errors.push(`${where} needs a "type" such as ${BUILT_IN_TYPES.map((t) => `"${t}"`).join(', ')}.`);
      ok = false;
    }
    if (entry.options !== undefined && (typeof entry.options !== 'object' || Array.isArray(entry.options))) {
      errors.push(`${where}: "options" must be an object in curly braces.`);
      ok = false;
    }
    for (const key of ['title', 'subtitle', 'instruction']) {
      if (entry[key] !== undefined && typeof entry[key] !== 'string') {
        errors.push(`${where}: "${key}" must be text in quotes.`);
        ok = false;
      }
    }
    return {
      type: entry.type,
      options: entry.options ?? {},
      title: entry.title ?? '',
      subtitle: entry.subtitle ?? '',
      instruction: entry.instruction ?? '',
    };
  });
  return ok ? puzzles : null;
}

function validateTheme(theme, isColor, errors) {
  const result = { mode: 'dark' };
  if (theme === undefined) return result;
  if (!theme || typeof theme !== 'object') {
    errors.push('"theme" must be an object, for example theme: { mode: "dark", accent: "#E3B45B" }.');
    return result;
  }
  const mode = theme.mode ?? 'dark';
  if (mode !== 'dark' && mode !== 'light') {
    errors.push(`theme.mode must be "dark" or "light" (got "${mode}").`);
  }
  result.mode = mode;
  for (const key of THEME_COLOR_KEYS) {
    if (theme[key] === undefined) continue;
    if (typeof theme[key] !== 'string' || !isColor(theme[key])) {
      errors.push(`theme.${key} must be a color such as "#E3B45B" (got "${theme[key]}").`);
    } else {
      result[key] = theme[key];
    }
  }
  return result;
}

/**
 * Run each puzzle module's optional validate(options) and collect errors.
 * @param {object[]} puzzles normalized puzzle entries
 * @param {Map<string, object>} modules loaded puzzle modules by type
 * @returns {string[]}
 */
export function validatePuzzleOptions(puzzles, modules) {
  const errors = [];
  puzzles.forEach((entry, i) => {
    const mod = modules.get(entry.type);
    if (typeof mod?.validate !== 'function') return;
    for (const message of mod.validate(entry.options) ?? []) {
      errors.push(`Puzzle ${i + 1} (${entry.type}): ${message}`);
    }
  });
  return errors;
}
