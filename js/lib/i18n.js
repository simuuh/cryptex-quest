/**
 * Minimal translation helper with {placeholder} interpolation and
 * plural forms ({ one, other }).
 */

/**
 * @param {Record<string, any>} dictionary active language
 * @param {Record<string, any>} [fallback] used for missing keys (English)
 * @returns {(key: string, params?: Record<string, any>) => string}
 */
export function createTranslator(dictionary, fallback = {}) {
  return function t(key, params = {}) {
    let value = dictionary[key] ?? fallback[key];
    if (value === undefined) return key;
    if (typeof value === 'object') {
      value = params.n === 1 ? value.one : value.other;
    }
    return String(value).replace(/\{(\w+)\}/g, (match, name) =>
      params[name] === undefined ? match : String(params[name]),
    );
  };
}
