/* Пятнашки */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const movesEl = $('moves');
  const timeEl = $('time');
  const bestEl = $('best');
  const overlay = $('overlay');
  const overlayText = $('overlay-text');

  let size = SG.store.get('fifteen-size', 4);
  if (![3, 4, 5].includes(size)) size = 4;
  let cells = []; // cells[позиция] = номер плитки, 0 — пусто
  let tileEls = {};
  let moves = 0;
  let startTime = 0;
  let timer = 0;
  let solved = false;

  const blank = () => cells.indexOf(0);

  function neighbors(i) {
    const r = Math.floor(i / size);
    const c = i % size;
    const out = [];
    if (r > 0) out.push(i - size);
    if (r < size - 1) out.push(i + size);
    if (c > 0) out.push(i - 1);
    if (c < size - 1) out.push(i + 1);
    return out;
  }

  const isSolved = () => cells.every((v, i) => (i === cells.length - 1 ? v === 0 : v === i + 1));

  // Перемешивание случайными ходами из собранного состояния — всегда решаемо.
  function shuffle() {
    cells = [...Array(size * size).keys()].map((i) => (i === size * size - 1 ? 0 : i + 1));
    let prev = -1;
    do {
      for (let k = 0; k < size * size * 30; k++) {
        const b = blank();
        const options = neighbors(b).filter((n) => n !== prev);
        const n = options[Math.floor(Math.random() * options.length)];
        cells[b] = cells[n];
        cells[n] = 0;
        prev = b;
      }
    } while (isSolved());
  }

  function newGame() {
    clearInterval(timer);
    overlay.hidden = true;
    shuffle();
    moves = 0;
    startTime = 0;
    solved = false;
    movesEl.textContent = '0';
    timeEl.textContent = '0:00';
    boardEl.style.setProperty('--n', size);
    boardEl.innerHTML = '';
    tileEls = {};
    cells.forEach((v) => {
      if (!v) return;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'ft-tile';
      el.textContent = v;
      el.addEventListener('click', () => clickTile(v));
      boardEl.appendChild(el);
      tileEls[v] = el;
    });
    renderBest();
    render();
  }

  function render() {
    cells.forEach((v, i) => {
      if (!v) return;
      const el = tileEls[v];
      el.style.setProperty('--r', Math.floor(i / size));
      el.style.setProperty('--c', i % size);
      el.classList.toggle('in-place', v === i + 1);
    });
  }

  function renderBest() {
    const best = SG.store.get('fifteen-best-' + size, null);
    bestEl.textContent = best === null ? '—' : best;
  }

  // Клик по плитке в одной строке/столбце с пустой клеткой сдвигает всю линию.
  function clickTile(v) {
    if (solved) return;
    const i = cells.indexOf(v);
    const b = blank();
    const sameRow = Math.floor(i / size) === Math.floor(b / size);
    const sameCol = i % size === b % size;
    if (!sameRow && !sameCol) return;
    const step = sameRow ? (i > b ? 1 : -1) : i > b ? size : -size;
    let cur = b;
    while (cur !== i) {
      cells[cur] = cells[cur + step];
      cur += step;
      moves++;
    }
    cells[i] = 0;
    afterMove();
  }

  // Стрелка «влево» двигает влево плитку, стоящую справа от пустой клетки, и т. д.
  function moveDir(dir) {
    if (solved) return;
    const b = blank();
    const r = Math.floor(b / size);
    const c = b % size;
    let src = -1;
    if (dir === 'left' && c < size - 1) src = b + 1;
    if (dir === 'right' && c > 0) src = b - 1;
    if (dir === 'up' && r < size - 1) src = b + size;
    if (dir === 'down' && r > 0) src = b - size;
    if (src < 0) return;
    cells[b] = cells[src];
    cells[src] = 0;
    moves++;
    afterMove();
  }

  function afterMove() {
    if (!startTime) {
      startTime = Date.now();
      timer = setInterval(() => (timeEl.textContent = SG.formatTime((Date.now() - startTime) / 1000)), 250);
    }
    movesEl.textContent = moves;
    render();
    if (isSolved()) win();
  }

  function win() {
    solved = true;
    clearInterval(timer);
    const seconds = (Date.now() - startTime) / 1000;
    timeEl.textContent = SG.formatTime(seconds);
    const key = 'fifteen-best-' + size;
    const best = SG.store.get(key, null);
    const record = best === null || moves < best;
    if (record) SG.store.set(key, moves);
    renderBest();
    boardEl.classList.add('solved');
    overlayText.textContent =
      'Собрано за ' + moves + ' ходов и ' + SG.formatTime(seconds) + '.' + (record ? ' Новый рекорд! 🏆' : '');
    setTimeout(() => {
      boardEl.classList.remove('solved');
      overlay.hidden = false;
    }, 700);
  }

  const KEYS = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const d = KEYS[e.code];
    if (d) {
      e.preventDefault();
      moveDir(d);
    }
  });
  SG.onSwipe(boardEl, moveDir, 30);

  SG.segmented($('size'), String(size), (v) => {
    size = Number(v);
    SG.store.set('fifteen-size', size);
    newGame();
  });
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  $('again-btn').addEventListener('click', newGame);

  newGame();
})();
