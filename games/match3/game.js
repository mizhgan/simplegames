/* Три в ряд */
(() => {
  'use strict';

  const N = 8;
  const TYPES = 6;
  const MOVES = 30;
  const FALL_MS = 230;
  const VANISH_MS = 220;

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const scoreEl = $('score');
  const movesEl = $('moves');
  const bestEl = $('best');
  const overlay = SG.overlay();

  let grid; // grid[r][c] = { type, el }
  let score = 0;
  let movesLeft = MOVES;
  let busy = false;
  let selected = null; // [r, c]
  let best = SG.store.get('match3-best', 0);
  let hintTimer = 0;
  bestEl.textContent = best;

  const randType = () => Math.floor(Math.random() * TYPES);

  // ---------- DOM ----------

  function makeGem(type, r, c, fromRow) {
    const el = document.createElement('div');
    el.className = 'm3-gem';
    el.dataset.t = type;
    el.innerHTML = '<span></span>';
    setPos(el, fromRow === undefined ? r : fromRow, c);
    boardEl.appendChild(el);
    return { type, el };
  }

  function setPos(el, r, c) {
    el.style.setProperty('--r', r);
    el.style.setProperty('--c', c);
  }

  // ---------- правила ----------

  function findMatches(g) {
    const hit = new Set();
    const runs = [];
    for (let r = 0; r < N; r++) {
      let start = 0;
      for (let c = 1; c <= N; c++) {
        if (c < N && g[r][c] && g[r][start] && g[r][c].type === g[r][start].type) continue;
        if (c - start >= 3 && g[r][start]) {
          runs.push(c - start);
          for (let k = start; k < c; k++) hit.add(r * N + k);
        }
        start = c;
      }
    }
    for (let c = 0; c < N; c++) {
      let start = 0;
      for (let r = 1; r <= N; r++) {
        if (r < N && g[r][c] && g[start][c] && g[r][c].type === g[start][c].type) continue;
        if (r - start >= 3 && g[start][c]) {
          runs.push(r - start);
          for (let k = start; k < r; k++) hit.add(k * N + c);
        }
        start = r;
      }
    }
    return { hit, runs };
  }

  function swapIn(g, a, b) {
    const t = g[a[0]][a[1]];
    g[a[0]][a[1]] = g[b[0]][b[1]];
    g[b[0]][b[1]] = t;
  }

  function findMove() {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const r2 = r + dr;
          const c2 = c + dc;
          if (r2 >= N || c2 >= N) continue;
          swapIn(grid, [r, c], [r2, c2]);
          const ok = findMatches(grid).hit.size > 0;
          swapIn(grid, [r, c], [r2, c2]);
          if (ok) return [[r, c], [r2, c2]];
        }
      }
    }
    return null;
  }

  // Поле без готовых совпадений и хотя бы с одним ходом
  function fillFresh() {
    boardEl.querySelectorAll('.m3-gem').forEach((el) => el.remove());
    do {
      grid = Array.from({ length: N }, () => Array(N).fill(null));
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          let t;
          do t = randType();
          while (
            (c >= 2 && grid[r][c - 1].type === t && grid[r][c - 2].type === t) ||
            (r >= 2 && grid[r - 1][c].type === t && grid[r - 2][c].type === t)
          );
          grid[r][c] = { type: t };
        }
      }
    } while (!findMove());
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) grid[r][c] = makeGem(grid[r][c].type, r, c, r - N);
    }
    requestAnimationFrame(() => requestAnimationFrame(() => grid.forEach((row, r) => row.forEach((g, c) => setPos(g.el, r, c)))));
  }

  // ---------- ход ----------

  function trySwap(a, b) {
    if (busy || movesLeft <= 0) return;
    clearHint();
    busy = true;
    swapIn(grid, a, b);
    setPos(grid[a[0]][a[1]].el, a[0], a[1]);
    setPos(grid[b[0]][b[1]].el, b[0], b[1]);
    SG.sound.play('slide');
    setTimeout(() => {
      if (!findMatches(grid).hit.size) {
        // совпадений нет — меняем обратно
        swapIn(grid, a, b);
        setPos(grid[a[0]][a[1]].el, a[0], a[1]);
        setPos(grid[b[0]][b[1]].el, b[0], b[1]);
        SG.sound.play('error');
        setTimeout(() => (busy = false), FALL_MS);
        return;
      }
      movesLeft--;
      movesEl.textContent = movesLeft;
      resolve(1);
    }, FALL_MS);
  }

  function resolve(combo) {
    const { hit, runs } = findMatches(grid);
    if (!hit.size) {
      afterResolve();
      return;
    }
    // очки: 10 за камень, бонус за длинные ряды, множитель за каскады
    const bonus = runs.reduce((s, n) => s + (n >= 5 ? 100 : n === 4 ? 40 : 0), 0);
    const gained = (hit.size * 10 + bonus) * combo;
    setScore(score + gained);
    showPopup(hit, gained, combo);
    SG.sound.play('merge', Math.min(12, (combo - 1) * 3));

    hit.forEach((k) => {
      const g = grid[Math.floor(k / N)][k % N];
      g.el.classList.add('vanish');
      setTimeout(() => g.el.remove(), VANISH_MS);
      grid[Math.floor(k / N)][k % N] = null;
    });

    setTimeout(() => {
      // гравитация и новые камни сверху
      for (let c = 0; c < N; c++) {
        let write = N - 1;
        for (let r = N - 1; r >= 0; r--) {
          if (grid[r][c]) {
            const g = grid[r][c];
            grid[r][c] = null;
            grid[write][c] = g;
            setPos(g.el, write, c);
            write--;
          }
        }
        for (let r = write, k = 1; r >= 0; r--, k++) {
          grid[r][c] = makeGem(randType(), r, c, -k);
        }
      }
      requestAnimationFrame(() =>
        requestAnimationFrame(() => grid.forEach((row, r) => row.forEach((g, c) => setPos(g.el, r, c))))
      );
      setTimeout(() => resolve(combo + 1), FALL_MS + 40);
    }, VANISH_MS);
  }

  function afterResolve() {
    busy = false;
    if (movesLeft <= 0) {
      gameOver();
      return;
    }
    if (!findMove()) {
      toast('Ходов нет — перемешиваем');
      setTimeout(fillFresh, 600);
    }
  }

  function setScore(v) {
    score = v;
    scoreEl.textContent = score;
    if (score > best) {
      best = score;
      SG.store.set('match3-best', best);
      bestEl.textContent = best;
    }
  }

  function showPopup(hit, gained, combo) {
    const cellsArr = [...hit];
    const avgR = cellsArr.reduce((s, k) => s + Math.floor(k / N), 0) / cellsArr.length;
    const avgC = cellsArr.reduce((s, k) => s + (k % N), 0) / cellsArr.length;
    const el = document.createElement('div');
    el.className = 'm3-popup';
    el.textContent = '+' + gained + (combo > 1 ? ' ×' + combo : '');
    el.style.left = ((avgC + 0.5) / N) * 100 + '%';
    el.style.top = ((avgR + 0.5) / N) * 100 + '%';
    boardEl.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1400);
  }

  function gameOver() {
    const record = score > 0 && score >= best;
    SG.sound.play(record ? 'win' : 'level');
    overlay.text = 'Ходы закончились. Счёт: ' + score + '.' + (record ? ' Новый рекорд! 🏆' : '');
    overlay.hidden = false;
  }

  function newGame() {
    overlay.hidden = true;
    score = 0;
    movesLeft = MOVES;
    busy = false;
    selected = null;
    scoreEl.textContent = '0';
    movesEl.textContent = MOVES;
    fillFresh();
  }

  function clearHint() {
    clearTimeout(hintTimer);
    boardEl.querySelectorAll('.hint').forEach((el) => el.classList.remove('hint'));
  }

  function hint() {
    if (busy) return;
    clearHint();
    const m = findMove();
    if (!m) return;
    SG.sound.play('hint');
    m.forEach(([r, c]) => grid[r][c].el.classList.add('hint'));
    hintTimer = setTimeout(clearHint, 2500);
  }

  // ---------- ввод: клик по двум соседним камням или свайп ----------

  function cellAt(e) {
    const rect = boardEl.getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * N);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * N);
    return r >= 0 && r < N && c >= 0 && c < N ? [r, c] : null;
  }

  function select(cell) {
    boardEl.querySelectorAll('.selected').forEach((el) => el.classList.remove('selected'));
    selected = cell;
    if (cell) grid[cell[0]][cell[1]].el.classList.add('selected');
  }

  let press = null;
  boardEl.addEventListener('pointerdown', (e) => {
    if (busy || movesLeft <= 0) return;
    const cell = cellAt(e);
    if (!cell) return;
    e.preventDefault();
    press = { cell, x: e.clientX, y: e.clientY };
    boardEl.setPointerCapture(e.pointerId);
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (!press) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    const size = boardEl.clientWidth / N;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < size * 0.35) return;
    const [r, c] = press.cell;
    const target = Math.abs(dx) > Math.abs(dy) ? [r, c + Math.sign(dx)] : [r + Math.sign(dy), c];
    press = null;
    select(null);
    if (target[0] >= 0 && target[0] < N && target[1] >= 0 && target[1] < N) trySwap([r, c], target);
  });
  boardEl.addEventListener('pointerup', () => {
    if (!press) return;
    const cell = press.cell;
    press = null;
    if (selected && Math.abs(selected[0] - cell[0]) + Math.abs(selected[1] - cell[1]) === 1) {
      const a = selected;
      select(null);
      trySwap(a, cell);
    } else if (selected && selected[0] === cell[0] && selected[1] === cell[1]) {
      select(null);
    } else {
      select(cell);
      SG.sound.play('click');
    }
  });

  $('hint-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    hint();
  });
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  $('again-btn').addEventListener('click', newGame);

  newGame();
})();
