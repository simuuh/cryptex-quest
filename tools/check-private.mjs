/**
 * Fails if git tracks (or has staged) a file that should never be public:
 * the real config, personal photos, encrypted builds or QR codes with the key.
 *
 *   node tools/check-private.mjs
 *
 * Zero dependencies, no npm needed. Use it as a pre-commit hook (see
 * docs/private-mode.md); CI runs it too.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RULES = [
  { test: (file) => file === 'config.js', why: 'your real config (copy of config.example.js)' },
  { test: (file) => file.startsWith('assets/custom/') && file !== 'assets/custom/README.md', why: 'a personal photo' },
  { test: (file) => file.startsWith('dist/'), why: 'build output of tools/build-private.mjs' },
  { test: (file) => file.endsWith('.enc'), why: 'an encrypted file from a private build' },
  { test: (file) => /^qr\./i.test(file.split('/').pop()), why: 'a QR code that contains the key' },
];

/**
 * @param {string[]} files repository-relative paths with "/" separators
 * @returns {{ file: string, why: string }[]}
 */
export function findForbidden(files) {
  return files.flatMap((file) => {
    const rule = RULES.find((r) => r.test(file));
    return rule ? [{ file, why: rule.why }] : [];
  });
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let output;
  try {
    // The index: everything committed plus everything staged for the next commit.
    output = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  } catch {
    console.error('check-private: could not run "git ls-files". Is git installed and is this a git repository?');
    process.exit(2);
  }
  const problems = findForbidden(output.split('\0').filter(Boolean));
  if (!problems.length) {
    console.log('check-private: OK, no personal files are tracked.');
    return;
  }
  console.error('check-private: these files must not be in git:\n');
  for (const { file, why } of problems) console.error(`  ${file}  (${why})`);
  console.error('\nRemove them from git but keep them on disk with:\n');
  console.error(`  git rm --cached -- ${problems.map((p) => JSON.stringify(p.file)).join(' ')}\n`);
  console.error('If they are already pushed, treat them as public (see docs/private-mode.md).');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
