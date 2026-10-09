# Deployment

cryptex-quest is a folder of static files with relative paths. It runs from any web server that can serve files, in the site root or in a subfolder.

To publish on a public host without exposing the code or your photos, use [private mode](private-mode.md): it builds an encrypted `dist/` folder that you upload instead of the files listed below.

## Before uploading

1. `config.js` exists and the overview page shows no config error when tested locally (`node tools/serve.js`, then open <http://localhost:8000>).
2. Your photos are in `assets/custom/` and the paths in `config.js` match the file names exactly. Many hosts are case-sensitive, so `Photo.JPG` and `photo.jpg` are different files. `assets/custom/` is ignored by git, so if you deploy from a repository (GitHub Pages), copy those photos in separately.
3. Upload at least: `index.html`, `puzzle.html`, `done.html`, `config.js`, `css/`, `fonts/`, `js/` and `assets/`. `tests/`, `tools/`, `docs/` and `package.json` are not needed on the server, though they do no harm.

## HTTPS

Use an `https://` URL. Phones are much stricter with plain `http://` pages, and some browsers clear or restrict `localStorage` there, so progress could be lost between visits. Most hosts (GitHub Pages, Netlify, and most shared hosting with Let's Encrypt) provide HTTPS for free.

## Option A: FTP / shared web space

1. Create a folder, for example `/quest/`, on your web space.
2. Upload the files listed above into it with an FTP client.
3. Open `https://your-domain.example/quest/` and solve the first puzzle to check that it works.

The server must send `.js` files as JavaScript (`text/javascript` or `application/javascript`). Nearly every host does this. If you see a blank page and a console error about the MIME type `text/plain`, add this line to an `.htaccess` file in the folder (Apache):

```
AddType text/javascript .js
```

## Option B: GitHub Pages

Your real `config.js` is in `.gitignore`, so it is not pushed with the normal code. Choose one of these:

- **Separate private-ish deployment repo.** Create a new repository, copy the app files including `config.js` into it, push, and enable *Settings → Pages → Deploy from a branch*. Remember that Pages sites are public even if the repository is private on paid plans.
- **Fork and commit the config.** In your fork, remove `config.js` from `.gitignore` and commit it. Only do this if you are fine with the code being public, which it effectively is anyway (see "Honest note" in the README).

The site is then available at `https://<user>.github.io/<repo>/`.

This repository itself deploys a **demo** with `config.example.js` through GitHub Actions (`.github/workflows/ci.yml`) on every push to `main`, after the tests pass. To use it in your fork, set *Settings → Pages → Source* to *GitHub Actions*. It never uses your real `config.js`.

## Option C: Netlify, Cloudflare Pages and others

Drag and drop the folder (with `config.js`) into the dashboard. No build command and no publish directory beyond the folder itself are needed.

## QR code

Generate a QR code for the final URL with any generator, ideally an offline one or one that does not add redirects or tracking. Test it with two different phones before wrapping the gift.

## Updating after the gift is given

- Changing `code`, `seed` or the list of puzzle types starts a **fresh quest** for the recipient, because the progress key depends on them.
- Changing texts, images or colors keeps the progress.
- If an update does not show up, reload the page. Some hosts cache files for a while.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "Please open this through a web server" | The HTML file was opened by double-click (`file://`), where browsers block ES modules. Run `node tools/serve.js` and open http://localhost:8000. |
| Blank page on the server, console mentions MIME type | The server sends `.js` as `text/plain`. See the `.htaccess` line above. |
| "The config needs a quick fix" | Read the listed problems. Usually the code length does not match the number of puzzles, or a comma or quote is missing. |
| A 404 for `config.js` in the console | This is normal while no `config.js` exists. The app then uses `config.example.js`. |
| A 404 for `config.enc` in the console | This is normal when you do not use [private mode](private-mode.md). The app checks for it first. |
| Picture puzzle shows the placeholder instead of your photo | The file is missing, the path or capitalization is wrong, or it is not a readable image. The browser console names the file and the reason. |
| Progress lost | The page was opened over `http://`, in a private window, or browser data was cleared. |
