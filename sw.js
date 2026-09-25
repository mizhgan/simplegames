/* Service worker SimpleGames: офлайн-режим. Файл генерируется: python3 tools/build-sw.py */
const VERSION = 'bb6114427ea3';
const CACHE = 'sg-' + VERSION;
const PRECACHE = [
  "./",
  "achievements.html",
  "index.html",
  "manifest.webmanifest",
  "games/2048/game.js",
  "games/2048/index.html",
  "games/2048/style.css",
  "games/asteroids/game.js",
  "games/asteroids/index.html",
  "games/balda/game.js",
  "games/balda/index.html",
  "games/balda/style.css",
  "games/battleship/game.js",
  "games/battleship/index.html",
  "games/battleship/style.css",
  "games/blackjack/game.js",
  "games/blackjack/index.html",
  "games/blackjack/style.css",
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
  "games/dots/game.js",
  "games/dots/index.html",
  "games/dots/style.css",
  "games/durak/game.js",
  "games/durak/index.html",
  "games/durak/style.css",
  "games/eggs/game.js",
  "games/eggs/index.html",
  "games/fifteen/game.js",
  "games/fifteen/index.html",
  "games/fifteen/style.css",
  "games/fillword/game.js",
  "games/fillword/index.html",
  "games/fillword/style.css",
  "games/flappy/game.js",
  "games/flappy/index.html",
  "games/flow/game.js",
  "games/flow/index.html",
  "games/flow/style.css",
  "games/freecell/game.js",
  "games/freecell/index.html",
  "games/freecell/style.css",
  "games/frogger/game.js",
  "games/frogger/index.html",
  "games/gomoku/game.js",
  "games/gomoku/index.html",
  "games/gomoku/style.css",
  "games/hangman/game.js",
  "games/hangman/index.html",
  "games/hangman/style.css",
  "games/invaders/game.js",
  "games/invaders/index.html",
  "games/jumper/game.js",
  "games/jumper/index.html",
  "games/kakuro/game.js",
  "games/kakuro/gen.js",
  "games/kakuro/index.html",
  "games/kakuro/style.css",
  "games/killer/game.js",
  "games/killer/index.html",
  "games/killer/style.css",
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
  "games/pipes/game.js",
  "games/pipes/index.html",
  "games/pipes/style.css",
  "games/pong/game.js",
  "games/pong/index.html",
  "games/reversi/game.js",
  "games/reversi/index.html",
  "games/reversi/style.css",
  "games/simon/game.js",
  "games/simon/index.html",
  "games/simon/style.css",
  "games/snake/game.js",
  "games/snake/index.html",
  "games/sokoban/game.js",
  "games/sokoban/index.html",
  "games/sokoban/levels.js",
  "games/sokoban/style.css",
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
  "games/tanks/game.js",
  "games/tanks/index.html",
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
  "games/wordsmith/game.js",
  "games/wordsmith/index.html",
  "games/wordsmith/style.css",
  "games/yahtzee/game.js",
  "games/yahtzee/index.html",
  "games/yahtzee/style.css",
  "sg/css/cards.css",
  "sg/css/style.css",
  "sg/data/balda-dict.js",
  "sg/data/nouns.js",
  "sg/img/favicon.svg",
  "sg/img/icon-180.png",
  "sg/img/icon-192.png",
  "sg/img/icon-512.png",
  "sg/img/icon-maskable-512.png",
  "sg/js/common.js",
  "sg/js/net.js",
  "sg/js/site.js",
  "sg/vendor/peerjs.min.js"
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
