/* Мемори */
(() => {
  'use strict';

  const SIZES = {
    s: { cols: 4, rows: 4 },
    m: { cols: 5, rows: 4 },
    l: { cols: 6, rows: 6 },
  };
  const SYMBOLS = [
    '🍎', '🍌', '🍇', '🍉', '🍓', '🍒', '🥝', '🍍', '🥥',
    '🍑', '🍋', '🥕', '🌽', '🍄', '🥑', '🍔', '🍕', '🍩',
  ];

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const movesEl = $('moves');
  const timeEl = $('time');
  const bestEl = $('best');
  const overlay = $('overlay');
  const overlayText = $('overlay-text');

  let size = SG.store.get('memory-size', 's');
  if (!SIZES[size]) size = 's';
  let cards = [];
  let open = [];
  let moves = 0;
  let matchedPairs = 0;
  let totalPairs = 0;
  let locked = false;
  let startTime = 0;
  let timer = 0;

  function renderBest() {
    const best = SG.store.get('memory-best-' + size, null);
    bestEl.textContent = best === null ? '—' : best;
  }

  function stopTimer() {
    clearInterval(timer);
    timer = 0;
  }

  function elapsed() {
    return startTime ? (Date.now() - startTime) / 1000 : 0;
  }

  function newGame() {
    stopTimer();
    overlay.hidden = true;
    const { cols, rows } = SIZES[size];
    totalPairs = (cols * rows) / 2;
    const symbols = SG.shuffle(SYMBOLS.slice()).slice(0, totalPairs);
    const deck = SG.shuffle([...symbols, ...symbols]);

    boardEl.style.setProperty('--cols', cols);
    boardEl.dataset.size = size;
    boardEl.innerHTML = '';
    cards = deck.map((symbol, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'mem-card';
      el.setAttribute('aria-label', 'Карточка ' + (i + 1));
      el.innerHTML =
        '<div class="mem-inner"><div class="mem-face mem-back"></div><div class="mem-face mem-front">' +
        symbol +
        '</div></div>';
      const card = { symbol, el, matched: false };
      el.addEventListener('click', () => flip(card));
      boardEl.appendChild(el);
      return card;
    });

    open = [];
    moves = 0;
    matchedPairs = 0;
    locked = false;
    startTime = 0;
    movesEl.textContent = '0';
    timeEl.textContent = '0:00';
    renderBest();
  }

  function flip(card) {
    if (locked || card.matched || open.includes(card)) return;
    if (!startTime) {
      startTime = Date.now();
      timer = setInterval(() => (timeEl.textContent = SG.formatTime(elapsed())), 250);
    }
    card.el.classList.add('flipped');
    SG.sound.play('flip');
    card.el.setAttribute('aria-label', card.symbol);
    open.push(card);
    if (open.length < 2) return;

    moves++;
    movesEl.textContent = moves;
    const [a, b] = open;
    if (a.symbol === b.symbol) {
      a.matched = b.matched = true;
      a.el.classList.add('matched');
      b.el.classList.add('matched');
      a.el.disabled = b.el.disabled = true;
      open = [];
      matchedPairs++;
      SG.sound.play('match');
      if (matchedPairs === totalPairs) win();
    } else {
      locked = true;
      setTimeout(() => {
        SG.sound.play('flip');
        a.el.classList.remove('flipped');
        b.el.classList.remove('flipped');
        a.el.setAttribute('aria-label', 'Закрытая карточка');
        b.el.setAttribute('aria-label', 'Закрытая карточка');
        open = [];
        locked = false;
      }, 800);
    }
  }

  function win() {
    SG.sound.play('win');
    stopTimer();
    const seconds = elapsed();
    timeEl.textContent = SG.formatTime(seconds);
    const key = 'memory-best-' + size;
    const best = SG.store.get(key, null);
    const record = best === null || moves < best;
    if (record) SG.store.set(key, moves);
    renderBest();
    overlayText.textContent =
      'Все пары найдены за ' + moves + ' ходов и ' + SG.formatTime(seconds) + '.' + (record ? ' Новый рекорд! 🏆' : '');
    setTimeout(() => (overlay.hidden = false), 500);
  }

  SG.segmented($('size'), size, (v) => {
    size = v;
    SG.store.set('memory-size', v);
    newGame();
  });

  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  $('again-btn').addEventListener('click', newGame);

  newGame();
})();
