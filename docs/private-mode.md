# Private mode

Private mode lets you publish your personal quest on any public static host without exposing the cryptex code, your texts or your photos. A small build tool encrypts them; the browser decrypts them using a key that only exists in the link (and QR code) you give to the recipient.

It is optional. Without it, the app works exactly as described in the [README](../README.md).

## How it works

1. `node tools/build-private.mjs` reads `config.js` and everything in `assets/custom/`.
2. Each of these files is encrypted with **AES-256-GCM**, using a random 256-bit key and a fresh random 12-byte IV per file. The config becomes `config.enc`, and each photo becomes `assets/custom/<random name>.enc`. The original file names are not published.
3. The tool writes a complete, ready-to-upload copy of the app to `dist/`. `config.js` and the original photos are **not** in it.
4. The key is put into the **fragment** of the link: `https://example.com/quest/#k=<key>`. Browsers never send the part after `#` to the server, not in requests and not in the `Referer` header.
5. When the recipient opens the link, the page reads the key, removes it from the address bar, and remembers it in this browser (`localStorage`). From then on, the page works without the key in the URL. If the browser blocks storage, the key is kept in memory only, so opening another page of the quest shows the "open the link again" notice. Opening the link in a normal (non-private) window avoids this.
6. Photos are decrypted only when a puzzle needs them and are shown from memory (`blob:` URLs).

Without a working key, visitors see a short notice: *"Open the link or QR code you received."* They never see an error message or technical details.

## Threat model

Please read this before you rely on it.

**What private mode protects against**

- **The host.** The web host, FTP provider or CDN stores and serves only encrypted files. It never receives the key, as long as it serves the app files unchanged (see below).
- **People who find the address.** Anyone who gets the URL *without* the `#k=…` part, guesses the folder or browses the server sees only the "this quest is private" notice and encrypted files.
- **Search engines and link previews.** The pages carry `noindex`, and `robots.txt` asks crawlers to stay away. Even if a crawler ignores both, it only finds encrypted data.
- **A public repository.** The repository never contains your config, photos, builds or QR codes (see [Keeping the repository clean](#keeping-the-repository-clean)).

**What it does not protect against**

- **Anyone with the full link gets in.** The link *is* the key. If it is forwarded, posted, or the QR code is photographed, the person who has it can open the quest. That includes copies kept by messengers, QR scanner apps, and browser history sync, which may record the link before the page removes the key.
- **Anyone with the recipient's unlocked browser.** The key is remembered in that browser's `localStorage`.
- **No revocation.** A key cannot be withdrawn. The only way to lock out an old link is to build again with a **new** key, upload the new files, and delete the old ones from the host. Anyone who already downloaded the old encrypted files *and* has the old link can still decrypt that old copy.
- **A malicious or hacked host.** The decryption runs in the app's own JavaScript, which the host delivers. A host that deliberately changes those files could make the page read the key from the link and send it somewhere. Encryption protects against a curious host that looks at stored files, not against one that tampers with the app. Choose a host you trust, and re-upload the original files if you suspect tampering.
- **Metadata.** The app code itself is public (it is this open-source project). The number of photos, their approximate sizes and the upload dates are visible on the host.

**The optional PIN (`--pin`)**

With `--pin`, the link only carries *key material* (plus `&pin=1` for a digit PIN or `&pin=a` for any other PIN, which only decides whether phones show a number pad). The real key is derived from that material plus a PIN using PBKDF2-SHA-256 with 310,000 iterations. The PIN is never in the link; the recipient types it once, and the browser then remembers the derived key.

A PIN helps when a link or QR code is seen or forwarded casually: without the PIN, the link alone does not open the quest. It is **not** strong protection against a determined person who has both the link and the encrypted files. They can try PINs offline, and all 10,000 four-digit PINs can be tested in well under an hour on an ordinary laptop (faster with more hardware). Every extra digit makes this ten times slower, so a 6-digit PIN or a short word is much better. Share the PIN through a different channel than the link, for example by writing it inside the gift card.

**Requirements**

Decryption uses the browser's Web Crypto API, which only works on `https://` pages (and on `http://localhost` for testing). On a plain `http://` address the page shows a "please use a secure link" notice.

## Step by step

### 1. Prepare and test as usual

Create `config.js` and put your photos into `assets/custom/` as described in the [README](../README.md#quick-start). Test with `node tools/serve.js` and open <http://localhost:8000>. The local server shows the normal, unencrypted version.

### 2. Build

```sh
node tools/build-private.mjs --url https://your-domain.example/quest/
```

`--url` is the address where the **contents** of `dist/` will be reachable. The tool prints:

- the **key** (43 characters),
- the **share link** with `#k=<key>`,
- the paths of the **QR code** files `qr.png` and `qr.svg`. These are written next to `dist/`, not inside it, so they are never uploaded by accident.

Options:

| Option | Meaning |
| --- | --- |
| `--url <address>` | Public address of the published folder. Needed for the share link and the QR code. |
| `--pin` | Also require a PIN. The tool asks for it twice and does not show it. (`--pin=1234` also works but ends up in your shell history.) |
| `--key <key>` | Reuse the key of an earlier build, so a printed QR code keeps working after you change texts or photos. |
| `--out <folder>` | Output folder instead of `dist/`. For safety, the tool only empties a folder that is new, empty, or an earlier build. |

Store the key somewhere safe, for example in a password manager, if you may want to rebuild later with `--key`. It is not saved anywhere else.

### 3. Optional: test the build locally

`node tools/serve.js` serves the project folder, which contains your plain `config.js`, so it always shows the unencrypted quest. To test the encrypted build, build with a local address and serve `dist/`:

```sh
node tools/build-private.mjs --url http://localhost:8001/
node tools/serve.js 8001 dist
```

Open the printed link to unlock, and <http://localhost:8001/> in a private window to see the locked page. Use a different port than for normal testing: the browser remembers the key per address, so a normal tab that already used the link opens without it. Build again with your real `--url` before you upload.

### 4. Upload `dist/`

Upload the **contents** of `dist/` (not the folder itself) to the address you passed as `--url`. Any static host works, because the build is plain files with relative paths.

**FTP / shared web space**

1. Create the folder on your web space, for example `/quest/`.
2. If you are updating an earlier upload, delete the old `assets/custom/` folder on the server first. Encrypted files get new random names on every build, so old ones would otherwise pile up.
3. Upload everything inside `dist/` into that folder with your FTP client.
4. The server should send `.js` files as JavaScript. If the page stays blank, see the `.htaccess` hint in [deployment.md](deployment.md).

**Other static hosts** (Netlify, Cloudflare Pages, GitHub Pages and similar)

Drag and drop the `dist/` folder, or push its contents to a separate deployment repository. Because the build only contains encrypted personal data, a public deployment repository is fine. Keep that repository separate from your clone of this project.

`robots.txt` only has an effect at the root of a domain. In a subfolder, crawlers ignore it, but the `noindex` tag on every page still applies.

### 5. Test before you print

1. Open the share link on your phone. The quest should load, and the `#k=…` part should disappear from the address bar.
2. Open the address **without** `#k=…` in a private window. You should see the "this quest is private" notice.
3. With `--pin`: open the link in a private window, enter a wrong PIN (you are asked again), then the right one.

### 6. Print the QR code

- `qr.png` is ready to print. Print it at least **3 × 3 cm**, larger if it will be scanned from further away.
- `qr.svg` scales to any size without blurring, which is useful for a card layout in a word processor or design tool.
- Keep the white border around the code: scanners need it.
- Test the printed code with two different phones before wrapping the gift.
- The QR code contains the key. Treat the file like the link: don't upload it, and delete it once the gift is printed unless you keep it somewhere private.

## Updating after the gift is given

- **Same link, new content:** build with `--key <your key>` (and the same `--pin` setting), then upload again as in step 4. Progress is kept unless you change the code, seed or puzzle types (see [deployment.md](deployment.md#updating-after-the-gift-is-given)).
- **Lock out the old link:** build **without** `--key`, upload, and delete the old files on the host. Hand out the new link or QR code.

## Keeping the repository clean

The repository stays generic. These paths are in `.gitignore`:

```
/config.js
assets/custom/*   (except its README.md)
/dist/
*.enc
qr.*
```

`node tools/check-private.mjs` fails if git tracks or has staged any of these. It needs no npm packages and runs in CI too. To run it before every commit, install it as a git hook once:

```sh
printf '#!/bin/sh\nexec node tools/check-private.mjs\n' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

On Windows, run these two lines in Git Bash. If the check fails, the message shows how to remove a file from git while keeping it on disk (`git rm --cached`). If such a file was already pushed to a public repository, consider its contents public. For a key or link, that means building again with a new key.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "This quest is private" although the link was used | The link was cut off (some apps drop the part after `#`), the build was replaced with a new key, or the browser forgot its storage. Open the full link again. |
| "Please use a secure link" | The page was opened over `http://`. Use the `https://` address. |
| Notice appears after moving to another page of the quest | The browser blocks `localStorage` (often in private windows), so the key is not remembered. Open the link in a normal window. |
| Picture puzzle shows the placeholder | The photo was missing when you built, or the path in `config.js` does not match. The build prints a warning for paths it cannot find. |
| The tool says the output folder "does not look like an earlier build" | `--out` points to a folder with other files in it. Choose a new or empty folder. |
