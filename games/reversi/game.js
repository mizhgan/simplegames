/* Реверси */
(() => {
  'use strict';

  const N = 8;
  const BLACK = 1;
  const WHITE = -1;
  const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const DEPTH = { easy: 1, normal: 3, hard: 5 };
  // Ценность клеток: углы — лучшие, клетки рядом с углами — опасные
  const WEIGHTS = [
    100, -20, 10, 5, 5, 10, -20, 100,
    -20, -50, -2, -2, -2, -2, -50, -20,
    10, -2, 1, 1, 1, 1, -2, 10,
    5, -2, 1, 0, 0, 1, -2, 5,
    5, -2, 1, 0, 0, 1, -2, 5,
    10, -2, 1, 1, 1, 1, -2, 10,
    -20, -50, -2, -2, -2, -2, -50, -20,
    100, -20, 10, 5, 5, 10, -20, 100,
  ];

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const statusEl = $('status');
  const diffEl = $('difficulty');
  const undoBtn = $('undo-btn');

  let mode = SG.store.get('reversi-mode', 'ai');
  let difficulty = SG.store.get('reversi-diff', 'normal');
  let board, turn, finished, thinking, history, lastMove;

  const cells = [];
  for (let i = 0; i < N * N; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rv-cell';
    b.innerHTML = '<span class="rv-disc"><span class="rv-face black"></span><span class="rv-face white"></span></span>';
    b.addEventListener('click', () => humanMove(i));
    boardEl.appendChild(b);
    cells.push(b);
  }

  // ---------- правила ----------

  function flipsFor(b, i, p) {
    if (b[i]) return [];
    const r = Math.floor(i / N);
    const c = i % N;
    const out = [];
    for (const [dr, dc] of DIRS) {
      const line = [];
      let rr = r + dr;
      let cc = c + dc;
      while (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === -p) {
        line.push(rr * N + cc);
        rr += dr;
        cc += dc;
      }
      if (line.length && rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === p) out.push(...line);
    }
    return out;
  }

  function validMoves(b, p) {
    const out = [];
    for (let i = 0; i < N * N; i++) {
      const f = flipsFor(b, i, p);
      if (f.length) out.push({ i, flips: f });
    }
    return out;
  }

  function apply(b, m, p) {
    b[m.i] = p;
    m.flips.forEach((k) => (b[k] = p));
  }

  const count = (b, p) => b.filter((v) => v === p).length;

  // ---------- ИИ ----------

  function evaluate(b, p) {
    let pos = 0;
    let discs = 0;
    for (let i = 0; i < N * N; i++) {
      if (!b[i]) continue;
      pos += WEIGHTS[i] * b[i];
      discs += b[i];
    }
    const mob = validMoves(b, BLACK).length - validMoves(b, WHITE).length;
    const empties = b.filter((v) => !v).length;
    // в эндшпиле важнее количество фишек, раньше — позиция и мобильность
    return p * (pos + mob * 5 + (empties < 12 ? discs * 10 : 0));
  }

  function negamax(b, p, depth, alpha, beta, passed) {
    const moves = validMoves(b, p);
    if (!moves.length) {
      if (passed || !validMoves(b, -p).length) {
        const diff = count(b, p) - count(b, -p);
        return diff > 0 ? 10000 + diff : diff < 0 ? -10000 + diff : 0;
      }
      return -negamax(b, -p, depth, -beta, -alpha, true);
    }
    if (depth === 0) return evaluate(b, p);
    moves.sort((x, y) => WEIGHTS[y.i] - WEIGHTS[x.i]);
    let best = -Infinity;
    for (const m of moves) {
      const nb = b.slice();
      apply(nb, m, p);
      const v = -negamax(nb, -p, depth - 1, -beta, -alpha, false);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  function aiChoose() {
    const moves = validMoves(board, turn);
    let bestScore = -Infinity;
    let bestMoves = [];
    for (const m of moves) {
      const nb = board.slice();
      apply(nb, m, turn);
      const v = -negamax(nb, -turn, DEPTH[difficulty] - 1, -Infinity, Infinity, false) + (difficulty === 'easy' ? Math.random() * 30 : 0);
      if (v > bestScore) {
        bestScore = v;
        bestMoves = [m];
      } else if (v === bestScore) {
        bestMoves.push(m);
      }
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  // ---------- партия ----------

  const humanTurn = () => mode === 'pvp' || turn === BLACK;

  function render(flipped = []) {
    const moves = !finished && humanTurn() && !thinking ? validMoves(board, turn) : [];
    const hints = new Set(moves.map((m) => m.i));
    cells.forEach((el, i) => {
      el.classList.toggle('black', board[i] === BLACK);
      el.classList.toggle('white', board[i] === WHITE);
      el.classList.toggle('hint', hints.has(i));
      el.classList.toggle('last', i === lastMove);
      el.disabled = !hints.has(i);
      if (flipped.includes(i)) {
        el.classList.remove('flip');
        void el.offsetWidth;
        el.classList.add('flip');
      }
    });
    $('score-b').textContent = count(board, BLACK);
    $('score-w').textContent = count(board, WHITE);
    undoBtn.disabled = !history.length || !!thinking;
  }

  function place(m) {
    history.push({ board: board.slice(), turn, lastMove });
    apply(board, m, turn);
    lastMove = m.i;
    SG.sound.play('place', turn === BLACK ? 0 : 4);
    if (m.flips.length >= 4) setTimeout(() => SG.sound.play('flip'), 120);
    turn = -turn;
    nextTurn(m.flips);
  }

  function nextTurn(flipped) {
    if (!validMoves(board, turn).length) {
      if (!validMoves(board, -turn).length) {
        finish();
        render(flipped);
        return;
      }
      // ход переходит к сопернику
      const who = mode === 'ai' ? (turn === BLACK ? 'У вас нет ходов — пропуск' : 'У компьютера нет ходов — ваш ход') : (turn === BLACK ? 'У чёрных' : 'У белых') + ' нет ходов — пропуск';
      turn = -turn;
      statusEl.textContent = who;
      render(flipped);
      if (!humanTurn()) scheduleAi(900);
      return;
    }
    updateStatus();
    render(flipped);
    if (!humanTurn()) scheduleAi(450);
  }

  function scheduleAi(delay) {
    thinking = setTimeout(() => {
      const m = aiChoose();
      thinking = null;
      place(m);
    }, delay);
    render();
  }

  function humanMove(i) {
    if (finished || thinking || !humanTurn()) return;
    const flips = flipsFor(board, i, turn);
    if (!flips.length) return;
    place({ i, flips });
  }

  function finish() {
    finished = true;
    const b = count(board, BLACK);
    const w = count(board, WHITE);
    let text;
    if (b === w) {
      text = 'Ничья ' + b + ':' + w + ' 🤝';
      SG.sound.play('draw');
    } else if (mode === 'ai') {
      const win = b > w;
      text = (win ? 'Вы победили ' : 'Компьютер победил ') + b + ':' + w + (win ? ' 🎉' : ' 🤖');
      SG.sound.play(win ? 'win' : 'lose');
      if (win) SG.store.set('reversi-wins', SG.store.get('reversi-wins', 0) + 1);
    } else {
      text = (b > w ? 'Чёрные' : 'Белые') + ' победили ' + b + ':' + w + '!';
      SG.sound.play('win');
    }
    statusEl.textContent = text;
  }

  function updateStatus() {
    if (mode === 'ai') statusEl.textContent = turn === BLACK ? 'Ваш ход (чёрные)' : 'Компьютер думает…';
    else statusEl.textContent = 'Ходят ' + (turn === BLACK ? 'чёрные' : 'белые');
  }

  function newGame() {
    clearTimeout(thinking);
    thinking = null;
    board = Array(N * N).fill(0);
    board[27] = WHITE;
    board[36] = WHITE;
    board[28] = BLACK;
    board[35] = BLACK;
    turn = BLACK;
    finished = false;
    history = [];
    lastMove = -1;
    $('label-b').textContent = mode === 'ai' ? 'Вы · чёрные' : 'Чёрные';
    $('label-w').textContent = mode === 'ai' ? 'Компьютер' : 'Белые';
    updateStatus();
    render();
  }

  function undo() {
    if (thinking || !history.length) return;
    let h;
    do h = history.pop();
    while (mode === 'ai' && h.turn !== BLACK && history.length);
    board = h.board;
    turn = h.turn;
    lastMove = h.lastMove;
    finished = false;
    SG.sound.play('click');
    updateStatus();
    render();
  }

  SG.segmented($('mode'), mode, (v) => {
    mode = v;
    SG.store.set('reversi-mode', v);
    diffEl.style.display = mode === 'ai' ? '' : 'none';
    newGame();
  });
  SG.segmented(diffEl, difficulty, (v) => {
    difficulty = v;
    SG.store.set('reversi-diff', v);
    newGame();
  });
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  undoBtn.addEventListener('click', () => {
    undoBtn.blur();
    undo();
  });

  diffEl.style.display = mode === 'ai' ? '' : 'none';
  newGame();
})();
