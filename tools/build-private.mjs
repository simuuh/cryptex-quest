/**
 * Build an encrypted copy of the app for public static hosting ("private mode").
 *
 *   node tools/build-private.mjs --url https://example.com/quest/ [--pin] [--key <key>] [--out dist]
 *
 * Reads config.js and assets/custom/*, encrypts them with AES-256-GCM and
 * writes dist/ (app files + config.enc + *.enc). Prints the key and the
 * share link, and writes qr.png / qr.svg next to dist/ (never inside it).
 * Zero dependencies. See docs/private-mode.md.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateConfig } from '../js/lib/config.js';
import { deriveKeyFromPin, encrypt, normalizePin, parseKey, randomBytes, toBase64url } from '../js/lib/crypto.js';
import { shareUrl } from '../js/lib/private-mode.js';
import { encodeQr, qrToPng, qrToSvg } from './qr-code.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_FILES = ['index.html', 'puzzle.html', 'done.html', 'robots.txt'];
const APP_DIRS = ['css', 'fonts', 'js', 'assets'];
const PRIVATE_DIR = 'assets/custom';
const MIN_PIN_LENGTH = 4;
const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
};

/**
 * @param {object} options
 * @param {string} [options.root] project folder (default: this repository)
 * @param {string} [options.out] output folder (default: <root>/dist)
 * @param {string} [options.url] public URL of the published dist/ folder
 * @param {string} [options.key] reuse an existing key (base64url) so printed QR codes stay valid
 * @param {string} [options.pin] derive the key from the link key plus this PIN
 * @param {(message: string) => void} [options.log]
 */
export async function buildPrivate({ root = REPO_ROOT, out, url, key, pin, log = () => {} } = {}) {
  root = path.resolve(root);
  const outDir = path.resolve(out ?? path.join(root, 'dist'));
  const qrDir = path.dirname(outDir);
  if (url) assertHttpUrl(url);
  if (pin !== undefined && normalizePin(pin).length < MIN_PIN_LENGTH) {
    throw new UserError(`The PIN needs at least ${MIN_PIN_LENGTH} characters.`);
  }

  const config = await readConfig(root);
  const material = key ? parseKey(key) : randomBytes();
  if (!material) throw new UserError('--key must be the 43-character key printed by an earlier build.');
  const aesKey = pin === undefined ? material : await deriveKeyFromPin(material, pin);

  const privateFiles = await listFiles(path.join(root, PRIVATE_DIR));
  const privateAssets = {};
  for (const file of privateFiles) {
    const original = `${PRIVATE_DIR}/${file}`;
    privateAssets[original] = {
      file: `${PRIVATE_DIR}/${toHex(randomBytes(8))}.enc`,
      type: MIME_TYPES[path.extname(file).toLowerCase()] ?? '',
    };
  }
  const warnings = missingAssetWarnings(config, privateAssets);

  await prepareOutDir(outDir, root);
  for (const file of APP_FILES) await copyIfExists(path.join(root, file), path.join(outDir, file));
  for (const dir of APP_DIRS) await copyIfExists(path.join(root, dir), path.join(outDir, dir), path.join(root, PRIVATE_DIR));

  const written = ['config.enc'];
  const configBytes = new TextEncoder().encode(JSON.stringify({ ...config, privateAssets }));
  await fs.writeFile(path.join(outDir, 'config.enc'), await encrypt(aesKey, configBytes));
  for (const [original, { file }] of Object.entries(privateAssets)) {
    const target = path.join(outDir, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, await encrypt(aesKey, await fs.readFile(path.join(root, original))));
    written.push(file);
  }

  const keyText = toBase64url(material);
  const pinDigits = pin !== undefined && /^\d+$/.test(normalizePin(pin));
  const link = url ? shareUrl(url, keyText, { pin: pin !== undefined, pinDigits }) : null;
  const qr = link ? await writeQr(link, qrDir) : null;
  for (const warning of warnings) log(`Warning: ${warning}`);
  return { outDir, key: keyText, link, qr, encrypted: written, warnings, pin: pin !== undefined, pinDigits };
}

/** An expected problem with a readable message (printed without a stack trace). */
class UserError extends Error {}

function assertHttpUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new UserError(`--url must be a full address such as https://example.com/quest/ (got "${url}").`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new UserError('--url must start with https://');
  if (parsed.hash || parsed.search) throw new UserError('--url must not contain "#" or "?" parts.');
}

async function readConfig(root) {
  const file = path.join(root, 'config.js');
  try {
    await fs.access(file);
  } catch {
    throw new UserError('config.js is missing. Copy config.example.js to config.js and fill it in first.');
  }
  let raw;
  try {
    raw = (await import(`${pathToFileURL(file).href}?t=${Date.now()}`)).default;
  } catch (error) {
    throw new UserError(`config.js could not be loaded: ${error.message}`);
  }
  // Colors are checked by the browser at runtime (CSS.supports); here only the structure.
  const { errors } = validateConfig(raw, { isColor: () => true });
  if (errors.length) throw new UserError(`config.js needs a fix first:\n  - ${errors.join('\n  - ')}`);
  const json = JSON.parse(JSON.stringify(raw));
  if (JSON.stringify(json) !== JSON.stringify(raw)) throw new UserError('config.js may only contain plain text, numbers, true/false, lists and objects.');
  return json;
}

/** Relative paths (with "/") of all files below dir, except README.md at its top. */
async function listFiles(dir, prefix = '') {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(path.join(dir, entry.name), `${relative}/`)));
    else if (entry.isFile() && relative !== 'README.md' && !entry.name.startsWith('.')) files.push(relative);
  }
  return files;
}

function missingAssetWarnings(config, privateAssets) {
  const warnings = [];
  const visit = (value) => {
    if (typeof value === 'string') {
      const text = value.trim();
      if (text.startsWith(`${PRIVATE_DIR}/`) && !privateAssets[text]) warnings.push(`"${text}" is used in config.js but not found in ${PRIVATE_DIR}/.`);
    } else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(config);
  return warnings;
}

/** Empty the output folder, but only if it is safe: never the project itself, never a folder that is not an earlier build. */
async function prepareOutDir(outDir, root) {
  const contains = (parent, child) => {
    const relative = path.relative(parent, child);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  };
  if (contains(outDir, root)) {
    throw new UserError(`--out must not be the project folder or one of its parents (got "${outDir}").`);
  }
  if ([...APP_DIRS, ...APP_FILES].some((entry) => contains(path.join(root, entry), outDir))) {
    throw new UserError(`--out must not be inside one of the app folders (got "${outDir}").`);
  }
  let existing = [];
  try {
    existing = await fs.readdir(outDir);
  } catch {
    /* does not exist yet */
  }
  if (existing.length && !existing.includes('config.enc')) {
    throw new UserError(`${outDir} is not empty and does not look like an earlier build. Choose an empty or new folder.`);
  }
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
}

async function copyIfExists(source, target, skip) {
  let stat;
  try {
    stat = await fs.stat(source);
  } catch {
    return;
  }
  if (stat.isFile()) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
    return;
  }
  for (const entry of await fs.readdir(source)) {
    const from = path.join(source, entry);
    if (skip && path.resolve(from) === path.resolve(skip)) continue;
    await copyIfExists(from, path.join(target, entry), skip);
  }
}

async function writeQr(link, dir) {
  const qr = encodeQr(link, { ecc: 'M' });
  const png = path.join(dir, 'qr.png');
  const svg = path.join(dir, 'qr.svg');
  await fs.writeFile(png, qrToPng(qr));
  await fs.writeFile(svg, qrToSvg(qr));
  return { png, svg };
}

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const [name, inline] = argv[i].split(/=(.*)/s, 2);
    const value = () => inline ?? argv[++i];
    if (name === '--url') options.url = value();
    else if (name === '--key') options.key = value();
    else if (name === '--out') options.out = value();
    else if (name === '--pin') options.pin = inline ?? true;
    else if (name === '--help' || name === '-h') options.help = true;
    else throw new UserError(`Unknown option "${argv[i]}". Run with --help for the list.`);
  }
  return options;
}

/** Read a line without echoing it (falls back to a visible prompt when stdin is not a terminal). */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
    let muted = false;
    rl._writeToOutput = (text) => {
      if (!muted || text.includes('\n')) process.stdout.write(muted ? '\n' : text);
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

const HELP = `Build an encrypted copy of cryptex-quest for public static hosting.

  node tools/build-private.mjs --url https://example.com/quest/ [options]

  --url <address>   where the contents of dist/ will be published (needed for the link and QR code)
  --pin             also protect the quest with a PIN (asked here, entered by the recipient once)
  --key <key>       reuse the key of an earlier build, so a printed QR code keeps working
  --out <folder>    output folder (default: dist)

Details: docs/private-mode.md`;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return console.log(HELP);
  if (options.pin === true) {
    const first = await askHidden(`PIN (at least ${MIN_PIN_LENGTH} characters): `);
    const second = await askHidden('Repeat the PIN: ');
    if (normalizePin(first) !== normalizePin(second)) throw new UserError('The two PINs are different. Nothing was built.');
    options.pin = first;
  } else if (typeof options.pin === 'string') {
    console.warn('Note: a PIN given as --pin=... is saved in your shell history. Plain --pin asks for it instead.');
  }

  const result = await buildPrivate({ ...options, log: (message) => console.warn(message) });
  const rel = (file) => path.relative(process.cwd(), file) || '.';
  console.log(`\nEncrypted build written to ${rel(result.outDir)}/ (${result.encrypted.length} encrypted file(s)).`);
  console.log(`\nKey (keep it private; reuse it with --key to keep the same link):\n  ${result.key}`);
  if (result.link) {
    console.log(`\nShare link:\n  ${result.link}`);
    console.log(`\nQR code (local only, do not upload):\n  ${rel(result.qr.png)}\n  ${rel(result.qr.svg)}`);
  } else {
    console.log(`\nShare link: <your address>#k=${result.key}${result.pin ? `&pin=${result.pinDigits ? '1' : 'a'}` : ''}`);
    console.log('Run again with --url <address> --key <the key above> to get the full link and a QR code.');
  }
  if (result.pin) console.log('\nThe PIN is not in the link. Give it to the recipient separately.');
  console.log(`\nUpload the contents of ${rel(result.outDir)}/ to your host. Test the link on a phone before printing the QR code.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof UserError ? error.message : error);
    process.exit(1);
  });
}
