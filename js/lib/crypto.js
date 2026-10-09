/**
 * AES-256-GCM helpers for private mode. Uses Web Crypto only, so the same
 * module runs in the browser and in Node (tools/build-private.mjs, tests).
 *
 * Encrypted file format: 12-byte random IV, then the GCM ciphertext
 * (which ends with the 16-byte authentication tag).
 */

export const KEY_BYTES = 32;
export const IV_BYTES = 12;
export const TAG_BYTES = 16;
export const PIN_ITERATIONS = 310_000;

/** Thrown when data cannot be decrypted: wrong key, wrong PIN, damaged or truncated file. */
export class DecryptError extends Error {
  constructor(message = 'The data could not be decrypted with this key.') {
    super(message);
    this.name = 'DecryptError';
  }
}

function subtle() {
  const api = globalThis.crypto?.subtle;
  if (!api) throw new Error('Web Crypto is not available (it needs https:// or localhost).');
  return api;
}

/** @returns {boolean} whether Web Crypto can be used here */
export function cryptoAvailable() {
  return Boolean(globalThis.crypto?.subtle);
}

/** @param {number} [length] @returns {Uint8Array} */
export function randomBytes(length = KEY_BYTES) {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

/**
 * @param {Uint8Array} bytes
 * @returns {string} base64url without padding
 */
export function toBase64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * @param {string} text base64url, padding optional
 * @returns {Uint8Array|null} null if the text is not valid base64url
 */
export function fromBase64url(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*={0,2}$/.test(text)) return null;
  const plain = text.replace(/=+$/, '');
  if (plain.length % 4 === 1) return null;
  try {
    const binary = atob(plain.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * Decode a key from base64url and check its length.
 * @param {string} text
 * @returns {Uint8Array|null}
 */
export function parseKey(text) {
  const bytes = fromBase64url(text);
  return bytes && bytes.length === KEY_BYTES ? bytes : null;
}

function importAesKey(keyBytes, usage) {
  if (!(keyBytes instanceof Uint8Array) || keyBytes.length !== KEY_BYTES) {
    throw new TypeError(`The key must be ${KEY_BYTES} bytes.`);
  }
  return subtle().importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [usage]);
}

/**
 * @param {Uint8Array} keyBytes 32-byte key
 * @param {Uint8Array} data plaintext
 * @returns {Promise<Uint8Array>} IV followed by ciphertext
 */
export async function encrypt(keyBytes, data) {
  const key = await importAesKey(keyBytes, 'encrypt');
  const iv = randomBytes(IV_BYTES);
  const sealed = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, data));
  const out = new Uint8Array(IV_BYTES + sealed.length);
  out.set(iv);
  out.set(sealed, IV_BYTES);
  return out;
}

/**
 * @param {Uint8Array} keyBytes 32-byte key
 * @param {Uint8Array} payload IV followed by ciphertext
 * @returns {Promise<Uint8Array>} plaintext
 * @throws {DecryptError} for a wrong key or damaged data
 */
export async function decrypt(keyBytes, payload) {
  if (!(payload instanceof Uint8Array) || payload.length < IV_BYTES + TAG_BYTES) {
    throw new DecryptError('The encrypted file is empty or truncated.');
  }
  const key = await importAesKey(keyBytes, 'decrypt');
  try {
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv: payload.subarray(0, IV_BYTES) }, key, payload.subarray(IV_BYTES));
    return new Uint8Array(plain);
  } catch {
    throw new DecryptError();
  }
}

/**
 * PINs are compared as typed, apart from surrounding spaces and Unicode
 * normalization (so full-width digits from some keyboards still match).
 * @param {string} pin
 */
export function normalizePin(pin) {
  return String(pin ?? '').normalize('NFKC').trim();
}

/**
 * Derive the AES key from the key material in the link plus a PIN.
 * PBKDF2-SHA-256 with the PIN as password and the random material as salt.
 * @param {Uint8Array} material 32 random bytes from the link
 * @param {string} pin
 * @param {number} [iterations]
 * @returns {Promise<Uint8Array>} 32-byte key
 */
export async function deriveKeyFromPin(material, pin, iterations = PIN_ITERATIONS) {
  if (!(material instanceof Uint8Array) || material.length !== KEY_BYTES) {
    throw new TypeError(`The key material must be ${KEY_BYTES} bytes.`);
  }
  const password = new TextEncoder().encode(normalizePin(pin));
  const base = await subtle().importKey('raw', password, 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: material, iterations }, base, KEY_BYTES * 8);
  return new Uint8Array(bits);
}
