/* Крестики-нолики */
(() => {
  'use strict';

  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  // Вероятность «идеального» хода компьютера на каждом уровне
  const SKILL = { easy: 0.25, normal: 0.7, hard: 1 };
  // Раскладка цифрового блока: 7 8 9 сверху, 1 2 3 снизу
  const NUMPAD = { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 };

  const X_SVG =
    '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="mark mark-x" pathLength="100" d="M18 18 L82 82"/><path class="mark mark-x" pathLength="100" d="M82 18 L18 82"/></svg>';
  const O_SVG =
    '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="mark mark-o" pathLength="100" cx="50" cy="50" r="34" transform="rotate(-90 50 50)"/></svg>';

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const statusEl = $('status');
  const diffEl = $('difficulty');

  let mode = SG.store.get('ttt-mode', 'ai');
  let difficulty = SG.store.get('ttt-diff', 'normal');
  let board;
  let turn;
  let starter = 'O'; // первый newRound() переключит на X
  let finished = false;
  let thinking = null;
  let mySide = 'X'; // в сетевой игре: за кого играем мы
  const scores = { X: 0, O: 0, D: 0 };

  const cells = [];
  for (let i = 0; i < 9; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ttt-cell';
    b.setAttribute('role', 'gridcell');
    b.addEventListener('click', () => humanMove(i));
    boardEl.appendChild(b);
    cells.push(b);
  }

  function evaluate(b) {
    for (const line of LINES) {
      const [a, c, d] = line;
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return { winner: b[a], line };
    }
    if (b.every(Boolean)) return { winner: 'D' };
    return null;
  }

  // Минимакс: компьютер играет за O
  function minimax(b, player, depth) {
    const res = evaluate(b);
    if (res) {
      if (res.winner === 'O') return 10 - depth;
      if (res.winner === 'X') return depth - 10;
      return 0;
    }
    let best = player === 'O' ? -Infinity : Infinity;
    for (let i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = player;
      const s = minimax(b, player === 'O' ? 'X' : 'O', depth + 1);
      b[i] = null;
      best = player === 'O' ? Math.max(best, s) : Math.min(best, s);
    }
    return best;
  }

  function aiChoose() {
    const empty = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    if (Math.random() > SKILL[difficulty]) {
      return empty[Math.floor(Math.random() * empty.length)];
    }
    let bestScore = -Infinity;
    let bestMoves = [];
    for (const i of empty) {
      board[i] = 'O';
      const s = minimax(board, 'X', 1);
      board[i] = null;
      if (s > bestScore) {
        bestScore = s;
        bestMoves = [i];
      } else if (s === bestScore) {
        bestMoves.push(i);
      }
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  function place(i) {
    board[i] = turn;
    cells[i].innerHTML = turn === 'X' ? X_SVG : O_SVG;
    SG.sound.play('place', turn === 'X' ? 0 : -5);
    cells[i].disabled = true;
    cells[i].setAttribute('aria-label', turn === 'X' ? 'Крестик' : 'Нолик');
    const res = evaluate(board);
    if (res) {
      finish(res);
    } else {
      turn = turn === 'X' ? 'O' : 'X';
      updateStatus();
      if (mode === 'ai' && turn === 'O') scheduleAi();
      if (mode === 'net') lockBoard(turn !== mySide || !net.active);
    }
  }

  function scheduleAi() {
    lockBoard(true);
    thinking = setTimeout(() => {
      thinking = null;
      lockBoard(false);
      place(aiChoose());
    }, 420);
  }

  function lockBoard(locked) {
    cells.forEach((c, i) => (c.disabled = locked || !!board[i] || finished));
  }

  function humanMove(i) {
    if (finished || board[i] || thinking) return;
    if (mode === 'ai' && turn === 'O') return;
    if (mode === 'net') {
      if (!net.active || turn !== mySide) return;
      net.send({ t: 'move', i });
    }
    place(i);
  }

  function finish(res) {
    finished = true;
    lockBoard(true);
    boardEl.classList.add('finished');
    scores[res.winner]++;
    if (res.line) res.line.forEach((i) => cells[i].classList.add('win'));
    if ((mode === 'ai' && res.winner === 'X') || (mode === 'net' && res.winner === mySide)) {
      SG.store.set('ttt-wins', SG.store.get('ttt-wins', 0) + 1);
    }
    renderScores();
    const lost = (mode === 'ai' && res.winner === 'O') || (mode === 'net' && res.winner !== mySide);
    SG.sound.play(res.winner === 'D' ? 'draw' : lost ? 'lose' : 'win');
    if (res.winner === 'D') statusEl.textContent = 'Ничья 🤝';
    else if (mode === 'net') statusEl.textContent = res.winner === mySide ? 'Вы победили! 🎉' : 'Соперник победил';
    else if (mode === 'ai') statusEl.textContent = res.winner === 'X' ? 'Вы победили! 🎉' : 'Компьютер победил 🤖';
    else statusEl.textContent = 'Победили ' + (res.winner === 'X' ? 'крестики ✕' : 'нолики ◯') + '!';
  }

  function updateStatus() {
    if (mode === 'net') statusEl.textContent = !net.active ? 'Нет соединения с соперником' : turn === mySide ? 'Ваш ход' : 'Ход соперника…';
    else if (mode === 'ai') statusEl.textContent = turn === 'X' ? 'Ваш ход' : 'Компьютер думает…';
    else statusEl.textContent = 'Ходят ' + (turn === 'X' ? 'крестики ✕' : 'нолики ◯');
  }

  function renderScores() {
    $('score-x').textContent = scores.X;
    $('score-o').textContent = scores.O;
    $('score-d').textContent = scores.D;
    const net = mode === 'net';
    $('label-x').textContent = net ? (mySide === 'X' ? 'Вы · X' : 'Соперник · X') : mode === 'ai' ? 'Вы · X' : 'Игрок X';
    $('label-o').textContent = net ? (mySide === 'O' ? 'Вы · O' : 'Соперник · O') : mode === 'ai' ? 'Компьютер · O' : 'Игрок O';
  }

  function newRound(first) {
    clearTimeout(thinking);
    thinking = null;
    board = Array(9).fill(null);
    finished = false;
    starter = first || (starter === 'X' ? 'O' : 'X');
    turn = starter;
    boardEl.classList.remove('finished');
    cells.forEach((c, i) => {
      c.innerHTML = '';
      c.classList.remove('win');
      c.disabled = false;
      c.setAttribute('aria-label', 'Клетка ' + (i + 1));
    });
    updateStatus();
    if (mode === 'ai' && turn === 'O') scheduleAi();
    if (mode === 'net') lockBoard(turn !== mySide || !net.active);
  }

  function resetScores() {
    scores.X = scores.O = scores.D = 0;
    starter = 'O';
    renderScores();
    newRound();
  }

  function syncDifficultyVisibility() {
    diffEl.style.display = mode === 'ai' ? '' : 'none';
  }

  // ---------- игра по сети ----------

  const net = SG.net.setup({
    game: 'tictactoe',
    modeEl: $('mode'),
    onConnect(role) {
      mode = 'net';
      mySide = role === 'host' ? 'X' : 'O';
      net.info('вы играете за ' + (mySide === 'X' ? 'крестики ✕' : 'нолики ◯'));
      syncDifficultyVisibility();
      resetScores();
    },
    onMessage(msg) {
      if (msg.t === 'move' && !finished && turn !== mySide && Number.isInteger(msg.i) && !board[msg.i]) place(msg.i);
      else if (msg.t === 'new') newRound(msg.first);
      else if (msg.t === 'reset') resetScores();
    },
    onDisconnect(voluntary) {
      if (mode !== 'net') return;
      if (voluntary) {
        modeSeg.set('pvp');
        mode = 'pvp';
        syncDifficultyVisibility();
        resetScores();
      } else {
        lockBoard(true);
        updateStatus();
      }
    },
  });

  const modeSeg = SG.segmented($('mode'), mode, (v) => {
    mode = v;
    SG.store.set('ttt-mode', v);
    syncDifficultyVisibility();
    resetScores();
  });

  SG.segmented(diffEl, difficulty, (v) => {
    difficulty = v;
    SG.store.set('ttt-diff', v);
    resetScores();
  });

  $('new-round').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (mode === 'net') {
      if (!net.active) return;
      const first = starter === 'X' ? 'O' : 'X';
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

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key;
    if (key in NUMPAD) {
      humanMove(NUMPAD[key]);
    } else if ((key === 'Enter' || key === ' ') && finished) {
      e.preventDefault();
      $('new-round').click();
    }
  });

  syncDifficultyVisibility();
  renderScores();
  newRound();
})();
