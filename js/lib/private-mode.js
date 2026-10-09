/**
 * Private mode: the config and personal photos are published encrypted
 * (config.enc, *.enc) and the key travels in the URL fragment (#k=...),
 * which browsers never send to the server. No DOM here; the page-level
 * parts (PIN form, locked page) are passed in by js/core.js.
 */
import { decrypt, deriveKeyFromPin, DecryptError, parseKey } from './crypto.js';

export const KEY_PARAM = 'k';
export const PIN_PARAM = 'pin';

/**
 * Read the key from a URL fragment and return the fragment without it.
 * @param {string} hash e.g. location.hash: "#k=abc", "#k=abc&pin=1" (digit PIN) or "#k=abc&pin=a" (other PIN)
 * @returns {{ key: string|null, pin: boolean, pinDigits: boolean, rest: string }} rest is "" or "#..."
 */
export function readKeyFragment(hash) {
  const params = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
  const key = params.get(KEY_PARAM);
  const pinValue = params.get(PIN_PARAM);
  const pin = pinValue !== null && pinValue !== '0';
  params.delete(KEY_PARAM);
  params.delete(PIN_PARAM);
  const rest = params.toString();
  return { key: key || null, pin: Boolean(key) && pin, pinDigits: Boolean(key) && pinValue === '1', rest: rest ? `#${rest}` : '' };
}

/**
 * The link to hand out: the site URL plus the key in the fragment.
 * @param {string} baseUrl where dist/ is published, e.g. "https://example.com/quest/"
 * @param {string} key base64url key (or key material when a PIN is used)
 * @param {{ pin?: boolean, pinDigits?: boolean }} [options] pinDigits: the PIN is only digits (phones then show a number pad)
 */
export function shareUrl(baseUrl, key, { pin = false, pinDigits = true } = {}) {
  const url = new URL(baseUrl);
  url.hash = `${KEY_PARAM}=${key}${pin ? `&${PIN_PARAM}=${pinDigits ? '1' : 'a'}` : ''}`;
  return url.href;
}

/**
 * Decrypt and parse config.enc.
 * @param {Uint8Array} key
 * @param {Uint8Array} payload
 */
export async function decryptConfig(key, payload) {
  const text = new TextDecoder().decode(await decrypt(key, payload));
  try {
    return JSON.parse(text);
  } catch {
    throw new DecryptError('config.enc was decrypted but does not contain valid JSON.');
  }
}

/**
 * Find a key that opens config.enc: from the link first, then the stored one.
 * @param {object} input
 * @param {Uint8Array} input.payload contents of config.enc
 * @param {{ key: string|null, pin: boolean, pinDigits?: boolean }} input.fragment from readKeyFragment
 * @param {string|null} input.storedKey base64url key remembered from an earlier visit
 * @param {(attempt: { wrong: boolean, digits: boolean }) => Promise<string>} input.askPin asks the visitor for the PIN
 * @param {(material: Uint8Array, pin: string) => Promise<Uint8Array>} [input.derive]
 * @returns {Promise<{ raw: any, key: Uint8Array, source: 'link'|'storage' } | { locked: 'no-key'|'bad-link'|'bad-stored-key' }>}
 */
export async function unlock({ payload, fragment, storedKey, askPin, derive = deriveKeyFromPin }) {
  const tryKey = async (key) => {
    try {
      return await decryptConfig(key, payload);
    } catch (error) {
      if (error instanceof DecryptError) return undefined;
      throw error;
    }
  };

  const fromLink = fragment.key ? parseKey(fragment.key) : null;
  const stored = storedKey ? parseKey(storedKey) : null;
  if (fromLink && fragment.pin) {
    // The stored key is the derived one, so a returning visitor skips the PIN.
    const remembered = stored ? await tryKey(stored) : undefined;
    if (remembered !== undefined) return { raw: remembered, key: stored, source: 'storage' };
    for (let wrong = false; ; wrong = true) {
      const key = await derive(fromLink, await askPin({ wrong, digits: Boolean(fragment.pinDigits) }));
      const raw = await tryKey(key);
      if (raw !== undefined) return { raw, key, source: 'link' };
    }
  }
  if (fromLink) {
    const raw = await tryKey(fromLink);
    if (raw !== undefined) return { raw, key: fromLink, source: 'link' };
  }
  if (stored) {
    const raw = await tryKey(stored);
    if (raw !== undefined) return { raw, key: stored, source: 'storage' };
  }
  if (fragment.key) return { locked: 'bad-link' };
  return { locked: storedKey ? 'bad-stored-key' : 'no-key' };
}

/**
 * Turns encrypted asset paths into object URLs on demand.
 * @param {Record<string, { file: string, type?: string }>} map original path -> encrypted file
 * @param {Uint8Array} key
 * @param {object} io
 * @param {(path: string) => Promise<Uint8Array>} io.fetchBytes
 * @param {(blob: Blob) => string} io.createObjectUrl
 * @param {(message: string) => void} [io.warn]
 */
export function createPrivateAssets(map, key, { fetchBytes, createObjectUrl, warn = () => {} }) {
  const entries = map && typeof map === 'object' ? map : {};
  const urls = new Map();
  const pending = new Map();

  function load(path) {
    if (!pending.has(path)) {
      const { file, type } = entries[path];
      pending.set(
        path,
        fetchBytes(file)
          .then((payload) => decrypt(key, payload))
          .then((plain) => urls.set(path, createObjectUrl(new Blob([plain], { type: type || '' }))))
          .catch((error) => warn(`[cryptex-quest] The private file for "${path}" could not be opened (${error.message}).`)),
      );
    }
    return pending.get(path);
  }

  return {
    /** Decrypt every private file referenced anywhere inside `value`. */
    async prepare(value) {
      const paths = new Set();
      collectStrings(value, (text) => {
        const path = text.trim();
        if (Object.hasOwn(entries, path)) paths.add(path);
      });
      await Promise.all([...paths].map(load));
    },
    /** Object URL for a prepared private path; any other path is returned unchanged. */
    url(path) {
      return urls.get(typeof path === 'string' ? path.trim() : path) ?? path;
    },
  };
}

function collectStrings(value, visit) {
  if (typeof value === 'string') visit(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, visit));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectStrings(item, visit));
}
