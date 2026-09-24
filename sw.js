/* Service worker SimpleGames: офлайн-режим. Файл генерируется: python3 tools/build-sw.py */
const VERSION = '4ed95b4b3bb9';
const CACHE = 'sg-' + VERSION;
const PRECACHE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "games/2048/game.js",
  "games/2048/index.html",
  "games/2048/style.css",
  "games/balda/game.js",
  "games/balda/index.html",
  "games/balda/style.css",
  "games/balda/words.js",
  "games/battleship/game.js",
  "games/battleship/index.html",
  "games/battleship/style.css",
  "games/breakout/game.js",
  "games/breakout/index.html",
  "games/bubbles/game.js",
  "games/bubbles/index.html",
  "games/checkers/game.js",
  "games/checkers/index.html",
  "games/checkers/style.css",
  "games/connect4/game.js",
  "games/connect4/index.html",
  "games/connect4/style.css",
  "games/dino/game.js",
  "games/dino/index.html",
  "games/dino/style.css",
  "games/durak/game.js",
  "games/durak/index.html",
  "games/durak/style.css",
  "games/fifteen/game.js",
  "games/fifteen/index.html",
  "games/fifteen/style.css",
  "games/fillword/game.js",
  "games/fillword/index.html",
  "games/fillword/style.css",
  "games/fillword/words.js",
  "games/flappy/game.js",
  "games/flappy/index.html",
  "games/freecell/game.js",
  "games/freecell/index.html",
  "games/freecell/style.css",
  "games/jumper/game.js",
  "games/jumper/index.html",
  "games/lines/game.js",
  "games/lines/index.html",
  "games/lines/style.css",
  "games/mahjong/game.js",
  "games/mahjong/index.html",
  "games/mahjong/style.css",
  "games/match3/game.js",
  "games/match3/index.html",
  "games/match3/style.css",
  "games/memory/game.js",
  "games/memory/index.html",
  "games/memory/style.css",
  "games/minesweeper/game.js",
  "games/minesweeper/index.html",
  "games/minesweeper/style.css",
  "games/nardy/game.js",
  "games/nardy/index.html",
  "games/nardy/style.css",
  "games/nonogram/game.js",
  "games/nonogram/index.html",
  "games/nonogram/style.css",
  "games/pacman/game.js",
  "games/pacman/index.html",
  "games/reversi/game.js",
  "games/reversi/index.html",
  "games/reversi/style.css",
  "games/snake/game.js",
  "games/snake/index.html",
  "games/solitaire/game.js",
  "games/solitaire/index.html",
  "games/spider/game.js",
  "games/spider/index.html",
  "games/spider/style.css",
  "games/stack/game.js",
  "games/stack/index.html",
  "games/sudoku/game.js",
  "games/sudoku/index.html",
  "games/sudoku/style.css",
  "games/tetris/game.js",
  "games/tetris/index.html",
  "games/tetris/style.css",
  "games/tictactoe/game.js",
  "games/tictactoe/index.html",
  "games/tictactoe/style.css",
  "games/wordle/game.js",
  "games/wordle/index.html",
  "games/wordle/style.css",
  "games/wordle/words.js",
  "sg/css/cards.css",
  "sg/css/style.css",
  "sg/img/favicon.svg",
  "sg/img/icon-180.png",
  "sg/img/icon-192.png",
  "sg/img/icon-512.png",
  "sg/img/icon-maskable-512.png",
  "sg/js/common.js"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sg-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function saveCopy(request, response) {
  if (response && response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // страницы: сначала сеть (чтобы видеть обновления), без сети — из кеша
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => saveCopy(request, response))
        .catch(() =>
          caches
            .match(request, { ignoreSearch: true })
            .then((cached) => cached || caches.match(new URL('index.html', self.registration.scope).href))
        )
    );
    return;
  }

  // остальное: сразу из кеша, а в фоне обновляем
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      const network = fetch(request)
        .then((response) => saveCopy(request, response))
        .catch(() => cached);
      return cached || network;
    })
  );
});
