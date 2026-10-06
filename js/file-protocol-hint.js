/*
 * Classic (non-module) script: browsers block ES modules on file:// URLs,
 * which leaves a blank page. This explains what to do instead.
 */
(function () {
  if (location.protocol !== 'file:') return;
  document.addEventListener('DOMContentLoaded', function () {
    var main = document.getElementById('app') || document.body;
    var card = document.createElement('section');
    card.className = 'cq-card cq-error';
    card.setAttribute('role', 'alert');
    var lines = [
      ['h1', 'cq-title', 'Please open this through a web server'],
      ['p', '', 'Browsers block JavaScript modules on file:// pages. In this folder, run:'],
      ['pre', '', 'node tools/serve.js'],
      ['p', '', 'and open http://localhost:8000 — or upload the folder to your web host.'],
      ['p', 'cq-muted', 'Bitte über einen Webserver öffnen: im Ordner „node tools/serve.js“ ausführen und http://localhost:8000 aufrufen.'],
    ];
    lines.forEach(function (line) {
      var node = document.createElement(line[0]);
      if (line[1]) node.className = line[1];
      node.textContent = line[2];
      card.appendChild(node);
    });
    main.replaceChildren(card);
  });
})();
