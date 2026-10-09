import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  decrypt,
  DecryptError,
  deriveKeyFromPin,
  encrypt,
  fromBase64url,
  IV_BYTES,
  parseKey,
  PIN_ITERATIONS,
  randomBytes,
  TAG_BYTES,
  toBase64url,
} from '../js/lib/crypto.js';
import { createPrivateAssets, decryptConfig, readKeyFragment, shareUrl, unlock } from '../js/lib/private-mode.js';
import { buildPrivate } from '../tools/build-private.mjs';
import { findForbidden } from '../tools/check-private.mjs';
import { encodeQr, qrToPng, qrToSvg } from '../tools/qr-code.mjs';

const text = (value) => new TextEncoder().encode(value);
const encryptJson = async (key, value) => encrypt(key, text(JSON.stringify(value)));

// --- encryption ---

test('encrypt/decrypt round trip, with a fresh IV every time', async () => {
  const key = randomBytes();
  const plain = text('The code is QXMRT 🔐');
  const a = await encrypt(key, plain);
  const b = await encrypt(key, plain);
  assert.equal(a.length, IV_BYTES + plain.length + TAG_BYTES);
  assert.notDeepEqual(a.subarray(0, IV_BYTES), b.subarray(0, IV_BYTES));
  assert.deepEqual(await decrypt(key, a), plain);
  assert.deepEqual(await decrypt(key, b), plain);
});

test('a wrong key fails cleanly with DecryptError', async () => {
  const sealed = await encrypt(randomBytes(), text('secret'));
  await assert.rejects(decrypt(randomBytes(), sealed), DecryptError);
});

test('damaged or truncated data fails cleanly with DecryptError', async () => {
  const key = randomBytes();
  const sealed = await encrypt(key, text('secret'));
  const flipped = sealed.slice();
  flipped[flipped.length - 1] ^= 1;
  await assert.rejects(decrypt(key, flipped), DecryptError);
  await assert.rejects(decrypt(key, sealed.subarray(0, IV_BYTES + 3)), DecryptError);
  await assert.rejects(decrypt(key, new Uint8Array()), DecryptError);
});

test('base64url keys round trip and invalid ones are rejected', () => {
  const key = randomBytes();
  const encoded = toBase64url(key);
  assert.equal(encoded.length, 43);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(parseKey(encoded), key);
  assert.deepEqual(fromBase64url('_-8'), new Uint8Array([0xff, 0xef]));
  assert.equal(parseKey(encoded.slice(1)), null, 'too short');
  assert.equal(parseKey(`${encoded.slice(1)}+`), null, 'not base64url');
  assert.equal(parseKey(''), null);
  assert.equal(parseKey(undefined), null);
});

// --- PIN ---

test('PIN derivation is PBKDF2-SHA-256 with 310k iterations and the link key as salt', async () => {
  assert.equal(PIN_ITERATIONS, 310_000);
  const material = randomBytes();
  const derived = await deriveKeyFromPin(material, '4711');
  assert.deepEqual(Buffer.from(derived), pbkdf2Sync('4711', material, PIN_ITERATIONS, 32, 'sha256'));
});

test('PIN derivation depends on both the PIN and the link key', async () => {
  const material = randomBytes();
  const fast = (m, pin) => deriveKeyFromPin(m, pin, 1000);
  const key = await fast(material, '1234');
  assert.deepEqual(await fast(material, ' 1234 '), key, 'surrounding spaces are ignored');
  assert.deepEqual(await fast(material, '１２３４'), key, 'full-width digits are normalized');
  assert.notDeepEqual(await fast(material, '1235'), key);
  assert.notDeepEqual(await fast(randomBytes(), '1234'), key);
});

// --- URL fragment ---

test('readKeyFragment takes the key out and keeps everything else', () => {
  const none = { key: null, pin: false, pinDigits: false, rest: '' };
  assert.deepEqual(readKeyFragment('#k=abc'), { key: 'abc', pin: false, pinDigits: false, rest: '' });
  assert.deepEqual(readKeyFragment('#k=abc&pin=1'), { key: 'abc', pin: true, pinDigits: true, rest: '' });
  assert.deepEqual(readKeyFragment('#k=abc&pin=a'), { key: 'abc', pin: true, pinDigits: false, rest: '' });
  assert.deepEqual(readKeyFragment('#top&k=abc'), { key: 'abc', pin: false, pinDigits: false, rest: '#top=' });
  assert.deepEqual(readKeyFragment('#x=1&k=abc&pin=0'), { key: 'abc', pin: false, pinDigits: false, rest: '#x=1' });
  assert.deepEqual(readKeyFragment(''), none);
  assert.deepEqual(readKeyFragment('#'), none);
  assert.deepEqual(readKeyFragment('#k='), none);
  assert.deepEqual(readKeyFragment('#pin=1'), none);
});

test('shareUrl puts the key in the fragment, never in the path or query', () => {
  const key = toBase64url(randomBytes());
  const link = shareUrl('https://example.com/quest/', key);
  assert.equal(link, `https://example.com/quest/#k=${key}`);
  assert.equal(shareUrl('https://example.com/quest/index.html', 'abc', { pin: true }), 'https://example.com/quest/index.html#k=abc&pin=1');
  assert.equal(shareUrl('https://example.com/quest/', 'abc', { pin: true, pinDigits: false }), 'https://example.com/quest/#k=abc&pin=a');
  const parsed = new URL(link);
  assert.equal(parsed.search, '');
  assert.equal(readKeyFragment(parsed.hash).key, key);
});

// --- unlocking ---

test('unlock opens config.enc with the key from the link', async () => {
  const key = randomBytes();
  const payload = await encryptJson(key, { code: 'ABC' });
  const result = await unlock({ payload, fragment: readKeyFragment(`#k=${toBase64url(key)}`), storedKey: null, askPin: assert.fail });
  assert.deepEqual(result.raw, { code: 'ABC' });
  assert.deepEqual(result.key, key);
  assert.equal(result.source, 'link');
});

test('unlock uses the remembered key when the link has none', async () => {
  const key = randomBytes();
  const payload = await encryptJson(key, { code: 'ABC' });
  const result = await unlock({ payload, fragment: readKeyFragment(''), storedKey: toBase64url(key), askPin: assert.fail });
  assert.equal(result.source, 'storage');
});

test('unlock reports a locked state instead of throwing', async () => {
  const payload = await encryptJson(randomBytes(), { code: 'ABC' });
  const other = toBase64url(randomBytes());
  const none = readKeyFragment('');
  assert.deepEqual(await unlock({ payload, fragment: none, storedKey: null, askPin: assert.fail }), { locked: 'no-key' });
  assert.deepEqual(await unlock({ payload, fragment: none, storedKey: other, askPin: assert.fail }), { locked: 'bad-stored-key' });
  assert.deepEqual(await unlock({ payload, fragment: readKeyFragment(`#k=${other}`), storedKey: null, askPin: assert.fail }), { locked: 'bad-link' });
  assert.deepEqual(await unlock({ payload, fragment: readKeyFragment('#k=garbage'), storedKey: null, askPin: assert.fail }), { locked: 'bad-link' });
});

test('unlock with a PIN asks again after a wrong PIN', async () => {
  const material = randomBytes();
  const derive = (m, pin) => deriveKeyFromPin(m, pin, 1000);
  const key = await derive(material, '2468');
  const payload = await encryptJson(key, { code: 'ABC' });
  const answers = ['1111', '2468'];
  const attempts = [];
  const result = await unlock({
    payload,
    fragment: readKeyFragment(`#k=${toBase64url(material)}&pin=1`),
    storedKey: null,
    derive,
    askPin: async (attempt) => {
      assert.equal(attempt.digits, true);
      attempts.push(attempt.wrong);
      return answers.shift();
    },
  });
  assert.deepEqual(attempts, [false, true]);
  assert.deepEqual(result.key, key, 'the derived key is what gets remembered');

  const again = await unlock({ payload, fragment: readKeyFragment(`#k=${toBase64url(material)}&pin=1`), storedKey: toBase64url(key), derive, askPin: assert.fail });
  assert.equal(again.source, 'storage', 'a returning visitor is not asked again');
});

test('private assets are decrypted on demand; other paths pass through', async () => {
  const key = randomBytes();
  const files = { 'assets/custom/1a.enc': await encrypt(key, text('JPEGDATA')) };
  const blobs = [];
  const assets = createPrivateAssets({ 'assets/custom/dog.jpg': { file: 'assets/custom/1a.enc', type: 'image/jpeg' } }, key, {
    fetchBytes: async (file) => files[file],
    createObjectUrl: (blob) => {
      blobs.push(blob);
      return `blob:test/${blobs.length}`;
    },
  });
  assert.equal(assets.url('assets/custom/dog.jpg'), 'assets/custom/dog.jpg', 'unchanged until prepared');
  await assets.prepare({ pairs: ['🐶', ' assets/custom/dog.jpg', 'assets/custom/dog.jpg'] });
  assert.equal(assets.url('assets/custom/dog.jpg'), 'blob:test/1');
  assert.equal(assets.url('assets/placeholder-picture.svg'), 'assets/placeholder-picture.svg');
  assert.equal(blobs.length, 1, 'each file is decrypted once');
  assert.equal(blobs[0].type, 'image/jpeg');
  assert.equal(await blobs[0].text(), 'JPEGDATA');
});

// --- build tool ---

test('build-private writes only encrypted personal data and a working link', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cq-private-'));
  try {
    await fs.mkdir(path.join(root, 'assets/custom/sub'), { recursive: true });
    await fs.mkdir(path.join(root, 'js'), { recursive: true });
    await fs.writeFile(path.join(root, 'index.html'), '<!doctype html>');
    await fs.writeFile(path.join(root, 'js/app.js'), 'export {};');
    await fs.writeFile(path.join(root, 'assets/icon.svg'), '<svg/>');
    await fs.writeFile(path.join(root, 'assets/custom/README.md'), 'readme');
    await fs.writeFile(path.join(root, 'assets/custom/holiday-with-mum.jpg'), 'PHOTO-BYTES');
    await fs.writeFile(path.join(root, 'assets/custom/sub/dog.png'), 'DOG-BYTES');
    await fs.writeFile(
      path.join(root, 'config.js'),
      `export default { code: 'XYZ', recipientName: 'Alex', puzzles: [
        { type: 'image', options: { image: 'assets/custom/holiday-with-mum.jpg' } },
        { type: 'memory', options: { pairs: ['assets/custom/sub/dog.png', 'assets/custom/missing.jpg'] } },
        { type: 'sudoku' },
      ] };`,
    );

    const result = await buildPrivate({ root, url: 'https://example.com/quest/' });
    const out = path.join(root, 'dist');
    const listing = await listAll(out);

    assert.ok(listing.includes('index.html') && listing.includes('js/app.js') && listing.includes('assets/icon.svg'));
    assert.ok(listing.includes('config.enc'));
    assert.ok(!listing.includes('config.js'));
    assert.ok(!listing.some((f) => /holiday|dog|README/.test(f)), `no original names in ${listing}`);
    assert.equal(listing.filter((f) => f.endsWith('.enc')).length, 3);
    for (const file of listing) {
      const content = await fs.readFile(path.join(out, file), 'latin1');
      assert.ok(!/XYZ|Alex|PHOTO-BYTES|DOG-BYTES/.test(content), `${file} leaks plaintext`);
    }
    assert.deepEqual(result.warnings, ['"assets/custom/missing.jpg" is used in config.js but not found in assets/custom/.']);

    const qrPng = await fs.readFile(path.join(root, 'qr.png'));
    assert.deepEqual([...qrPng.subarray(1, 4)], [0x50, 0x4e, 0x47]);
    assert.match(await fs.readFile(path.join(root, 'qr.svg'), 'utf8'), /^<\?xml[\s\S]*<svg/);

    const fragment = readKeyFragment(new URL(result.link).hash);
    const opened = await unlock({ payload: new Uint8Array(await fs.readFile(path.join(out, 'config.enc'))), fragment, storedKey: null, askPin: assert.fail });
    assert.equal(opened.raw.code, 'XYZ');
    const entry = opened.raw.privateAssets['assets/custom/holiday-with-mum.jpg'];
    assert.equal(entry.type, 'image/jpeg');
    const photo = await decrypt(opened.key, new Uint8Array(await fs.readFile(path.join(out, entry.file))));
    assert.equal(new TextDecoder().decode(photo), 'PHOTO-BYTES');

    // Rebuilding with --key keeps the link; with a PIN the link alone is not enough.
    const again = await buildPrivate({ root, url: 'https://example.com/quest/', key: result.key, pin: '9753' });
    assert.equal(again.link, `${result.link}&pin=1`);
    const word = await buildPrivate({ root, url: 'https://example.com/quest/', key: result.key, pin: 'otter' });
    assert.equal(word.link, `${result.link}&pin=a`, 'a non-digit PIN must not force a number pad');
    await buildPrivate({ root, url: 'https://example.com/quest/', key: result.key, pin: '9753' });
    const payload = new Uint8Array(await fs.readFile(path.join(out, 'config.enc')));
    await assert.rejects(decryptConfig(parseKey(result.key), payload), DecryptError);
    const withPin = await unlock({ payload, fragment: readKeyFragment(new URL(again.link).hash), storedKey: null, askPin: async () => '9753' });
    assert.equal(withPin.raw.code, 'XYZ');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('build-private refuses to wipe a folder that is not an earlier build', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cq-private-'));
  try {
    await fs.writeFile(path.join(root, 'config.js'), "export default { code: 'XYZ', puzzles: [{ type: 'sudoku' }, { type: 'sudoku' }, { type: 'sudoku' }] };");
    await fs.mkdir(path.join(root, 'other'));
    await fs.writeFile(path.join(root, 'other/keep.txt'), 'keep');
    await assert.rejects(buildPrivate({ root, out: path.join(root, 'other') }), /does not look like an earlier build/);
    await assert.rejects(buildPrivate({ root, out: root }), /must not be the project folder/);
    assert.equal(await fs.readFile(path.join(root, 'other/keep.txt'), 'utf8'), 'keep');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function listAll(dir, prefix = '') {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) result.push(...(await listAll(path.join(dir, entry.name), `${prefix}${entry.name}/`)));
    else result.push(prefix + entry.name);
  }
  return result;
}

// --- repo hygiene and QR ---

test('check-private flags personal files but not the app', () => {
  const flagged = findForbidden([
    'config.js',
    'config.example.js',
    'js/lib/config.js',
    'assets/custom/README.md',
    'assets/custom/me.jpg',
    'dist/index.html',
    'tools/dist.md',
    'photos/x.enc',
    'qr.png',
    'print/qr.svg',
    'tools/qr-code.mjs',
  ]).map((p) => p.file);
  assert.deepEqual(flagged, ['config.js', 'assets/custom/me.jpg', 'dist/index.html', 'photos/x.enc', 'qr.png', 'print/qr.svg']);
});

test('QR encoder picks a sensible size and draws the finder patterns', () => {
  const link = shareUrl('https://example.com/quest/', toBase64url(randomBytes()), { pin: true });
  const qr = encodeQr(link);
  assert.equal(qr.size, qr.version * 4 + 17);
  assert.ok(qr.version <= 6, `a share link should fit a small code (got version ${qr.version})`);
  const finder = [0, 1, 2, 3, 4, 5, 6].map((y) => [0, 1, 2, 3, 4, 5, 6].map((x) => qr.modules[y][x]));
  for (const [x, y] of [[0, 0], [6, 6], [2, 2], [4, 3]]) assert.equal(finder[y][x], true);
  for (const [x, y] of [[1, 1], [5, 1], [1, 5]]) assert.equal(finder[y][x], false);
  assert.match(qrToSvg(qr), /viewBox="0 0 (\d+) \1"/);
  assert.deepEqual([...qrToPng(qr).subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.throws(() => encodeQr('x'.repeat(4000)), RangeError);
});
