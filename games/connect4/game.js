/* Четыре в ряд */
(() => {
  'use strict';

  const COLS = 7;
  const ROWS = 6;
  const ORDER = [3, 2, 4, 1, 5, 0, 6]; // сначала центральные столбцы — так альфа-бета отсекает больше
  const DEPTH = { easy: 2, normal: 4, hard: 6 };
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const markerEl = $('markers');
  const statusEl = $('status');
  const diffEl = $('difficulty');

  let mode = SG.store.get('c4-mode', 'ai');
  let difficulty = SG.store.get('c4-diff', 'normal');
  // Клетка (r, c): r = 0 — нижний ряд. Индекс r * COLS + c.
  let grid, heights, turn, finished, thinking;
  let mySide = 1; // в сетевой игре: 1 — красные, 2 — жёлтые
  let starter = 2;
  const scores = { 1: 0, 2: 0, D: 0 };

  // ---------- DOM ----------

  const cellEls = [];
  for (let displayRow = 0; displayRow < ROWS; displayRow++) {
    for (let c = 0; c < COLS; c++) {
      const el = document.createElement('div');
      el.className = 'c4-cell';
      el.dataset.col = c;
      el.innerHTML = '<span class="c4-disc"></span>';
      boardEl.appendChild(el);
      cellEls[(ROWS - 1 - displayRow) * COLS + c] = el;
    }
  }
  const markers = [];
  for (let c = 0; c < COLS; c++) {
    const m = document.createElement('button');
    m.type = 'button';
    m.className = 'c4-marker';
    m.setAttribute('aria-label', 'Столбец ' + (c + 1));
    m.addEventListener('click', () => humanMove(c));
    markerEl.appendChild(m);
    markers.push(m);
  }

  // ---------- правила ----------

  const at = (g, r, c) => (r >= 0 && r < ROWS && c >= 0 && c < COLS ? g[r * COLS + c] : -1);

  function lineThrough(g, r, c) {
    const p = g[r * COLS + c];
    for (const [dr, dc] of DIRS) {
      const line = [[r, c]];
      for (const s of [1, -1]) {
        let rr = r + dr * s;
        let cc = c + dc * s;
        while (at(g, rr, cc) === p) {
          line.push([rr, cc]);
          rr += dr * s;
          cc += dc * s;
        }
      }
      if (line.length >= 4) return line;
    }
    return null;
  }

  // ---------- ИИ: негамакс с альфа-бета отсечением ----------

  function scoreWindow(a, b, c, d, p) {
    let mine = 0;
    let theirs = 0;
    for (const v of [a, b, c, d]) {
      if (v === p) mine++;
      else if (v) theirs++;
    }
    if (mine && theirs) return 0;
    if (mine === 3) return 5;
    if (mine === 2) return 2;
    if (theirs === 3) return -4;
    if (theirs === 2) return -1;
    return 0;
  }

  function heuristic(g, p) {
    let s = 0;
    for (let r = 0; r < ROWS; r++) {
      if (g[r * COLS + 3] === p) s += 3;
      else if (g[r * COLS + 3]) s -= 3;
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        for (const [dr, dc] of DIRS) {
          const r3 = r + dr * 3;
          const c3 = c + dc * 3;
          if (r3 < 0 || r3 >= ROWS || c3 < 0 || c3 >= COLS) continue;
          s += scoreWindow(
            g[r * COLS + c],
            g[(r + dr) * COLS + c + dc],
            g[(r + 2 * dr) * COLS + c + 2 * dc],
            g[r3 * COLS + c3],
            p
          );
        }
      }
    }
    return s;
  }

  function wins(g, h, c, p) {
    const r = h[c];
    g[r * COLS + c] = p;
    const w = lineThrough(g, r, c) !== null;
    g[r * COLS + c] = 0;
    return w;
  }

  function negamax(g, h, depth, alpha, beta, p, left) {
    if (left === 0) return 0;
    for (const c of ORDER) if (h[c] < ROWS && wins(g, h, c, p)) return 10000 + depth;
    if (depth === 0) return heuristic(g, p);
    let best = -Infinity;
    for (const c of ORDER) {
      if (h[c] >= ROWS) continue;
      g[h[c] * COLS + c] = p;
      h[c]++;
      const v = -negamax(g, h, depth - 1, -beta, -alpha, 3 - p, left - 1);
      h[c]--;
      g[h[c] * COLS + c] = 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  function aiChoose() {
    const g = grid.slice();
    const h = heights.slice();
    const valid = ORDER.filter((c) => h[c] < ROWS);
    const left = ROWS * COLS - g.filter(Boolean).length;
    // лёгкий уровень иногда ходит случайно, но выигрыш в один ход не упускает
    for (const c of valid) if (wins(g, h, c, turn)) return c;
    if (difficulty === 'easy' && Math.random() < 0.35) return valid[Math.floor(Math.random() * valid.length)];
    let bestScore = -Infinity;
    let bestCols = [];
    for (const c of valid) {
      g[h[c] * COLS + c] = turn;
      h[c]++;
      const v = -negamax(g, h, DEPTH[difficulty] - 1, -Infinity, Infinity, 3 - turn, left - 1);
      h[c]--;
      g[h[c] * COLS + c] = 0;
      if (v > bestScore) {
        bestScore = v;
        bestCols = [c];
      } else if (v === bestScore) {
        bestCols.push(c);
      }
    }
    return bestCols[Math.floor(Math.random() * bestCols.length)];
  }

  // ---------- ход партии ----------

  function place(c) {
    const r = heights[c];
    if (r >= ROWS) return;
    grid[r * COLS + c] = turn;
    heights[c]++;
    const el = cellEls[r * COLS + c];
    el.classList.add('p' + turn);
    el.style.setProperty('--fall', ROWS - r);
    SG.sound.play('drop');
    const line = lineThrough(grid, r, c);
    if (line) return finish(turn, line);
    if (heights.every((h) => h >= ROWS)) return finish('D');
    turn = 3 - turn;
    updateStatus();
    if (mode === 'ai' && turn === 2) scheduleAi();
  }

  function scheduleAi() {
    thinking = setTimeout(() => {
      thinking = null;
      place(aiChoose());
    }, 380);
  }

  function humanMove(c) {
    if (finished || thinking || heights[c] >= ROWS) return;
    if (mode === 'ai' && turn === 2) return;
    if (mode === 'net') {
      if (!net.active || turn !== mySide) return;
      net.send({ t: 'move', c });
    }
    place(c);
  }

  function finish(winner, line) {
    finished = true;
    scores[winner]++;
    if (line) {
      boardEl.classList.add('finished');
      line.forEach(([r, c]) => cellEls[r * COLS + c].classList.add('win'));
    }
    if ((mode === 'ai' && winner === 1) || (mode === 'net' && winner === mySide)) SG.store.set('c4-wins', SG.store.get('c4-wins', 0) + 1);
    renderScores();
    const lost = (mode === 'ai' && winner === 2) || (mode === 'net' && winner !== mySide);
    SG.sound.play(winner === 'D' ? 'draw' : lost ? 'lose' : 'win');
    if (winner === 'D') statusEl.textContent = 'Ничья 🤝';
    else if (mode === 'net') statusEl.textContent = winner === mySide ? 'Вы победили! 🎉' : 'Соперник победил';
    else if (mode === 'ai') statusEl.textContent = winner === 1 ? 'Вы победили! 🎉' : 'Компьютер победил 🤖';
    else statusEl.textContent = (winner === 1 ? 'Красные' : 'Жёлтые') + ' победили!';
  }

  function updateStatus() {
    statusEl.dataset.turn = turn;
    if (mode === 'net') statusEl.textContent = !net.active ? 'Нет соединения с соперником' : turn === mySide ? 'Ваш ход' : 'Ход соперника…';
    else if (mode === 'ai') statusEl.textContent = turn === 1 ? 'Ваш ход' : 'Компьютер думает…';
    else statusEl.textContent = 'Ходят ' + (turn === 1 ? 'красные' : 'жёлтые');
    markerEl.dataset.turn = turn;
  }

  function renderScores() {
    $('score-1').textContent = scores[1];
    $('score-2').textContent = scores[2];
    $('score-d').textContent = scores.D;
    const n = mode === 'net';
    $('label-1').textContent = n ? (mySide === 1 ? 'Вы · красные' : 'Соперник') : mode === 'ai' ? 'Вы' : 'Красные';
    $('label-2').textContent = n ? (mySide === 2 ? 'Вы · жёлтые' : 'Соперник') : mode === 'ai' ? 'Компьютер' : 'Жёлтые';
  }

  function newRound(first) {
    clearTimeout(thinking);
    thinking = null;
    grid = Array(ROWS * COLS).fill(0);
    heights = Array(COLS).fill(0);
    finished = false;
    starter = first || 3 - starter;
    turn = starter;
    boardEl.classList.remove('finished');
    cellEls.forEach((el) => {
      el.classList.remove('p1', 'p2', 'win');
    });
    updateStatus();
    if (mode === 'ai' && turn === 2) scheduleAi();
  }

  function resetScores() {
    scores[1] = scores[2] = scores.D = 0;
    starter = 2;
    renderScores();
    newRound();
  }

  // ---------- ввод ----------

  boardEl.addEventListener('click', (e) => {
    const cell = e.target.closest('.c4-cell');
    if (cell) humanMove(Number(cell.dataset.col));
  });
  boardEl.addEventListener('mousemove', (e) => {
    const cell = e.target.closest('.c4-cell');
    const col = cell ? Number(cell.dataset.col) : -1;
    markers.forEach((m, i) => m.classList.toggle('hover', i === col));
  });
  boardEl.addEventListener('mouseleave', () => markers.forEach((m) => m.classList.remove('hover')));

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const n = Number(e.key);
    if (n >= 1 && n <= COLS) humanMove(n - 1);
    else if ((e.key === 'Enter' || e.key === ' ') && finished) {
      e.preventDefault();
      $('new-round').click();
    }
  });

  // ---------- игра по сети ----------

  const net = SG.net.setup({
    game: 'connect4',
    modeEl: $('mode'),
    onConnect(role) {
      mode = 'net';
      mySide = role === 'host' ? 1 : 2;
      net.info('вы играете ' + (mySide === 1 ? 'красными' : 'жёлтыми'));
      diffEl.style.display = 'none';
      resetScores();
    },
    onMessage(msg) {
      if (msg.t === 'move' && !finished && turn !== mySide && Number.isInteger(msg.c) && msg.c >= 0 && msg.c < COLS) place(msg.c);
      else if (msg.t === 'new') newRound(msg.first);
      else if (msg.t === 'reset') resetScores();
    },
    onDisconnect(voluntary) {
      if (mode !== 'net') return;
      if (voluntary) {
        modeSeg.set('pvp');
        mode = 'pvp';
        resetScores();
      } else updateStatus();
    },
  });

  const modeSeg = SG.segmented($('mode'), mode, (v) => {
    mode = v;
    SG.store.set('c4-mode', v);
    diffEl.style.display = mode === 'ai' ? '' : 'none';
    resetScores();
  });
  SG.segmented(diffEl, difficulty, (v) => {
    difficulty = v;
    SG.store.set('c4-diff', v);
    resetScores();
  });
  $('new-round').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (mode === 'net') {
      if (!net.active) return;
      const first = 3 - starter;
      net.send({ t: 'new', first });
      newRound(first);
    } else newRound();
  });
  $('reset-score').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (mode === 'net') {
      if (!net.active) return;
      net.send({ t: 'reset' });
    }
    resetScores();
  });

  diffEl.style.display = mode === 'ai' ? '' : 'none';
  renderScores();
  newRound();
})();
