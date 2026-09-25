/* Русские шашки */
(() => {
  'use strict';

  // Клетка: 0 — пусто, 1 — белая шашка, 2 — белая дамка, -1 — чёрная шашка, -2 — чёрная дамка.
  // Индекс r * 8 + c, r = 0 — верхний ряд. Белые внизу и ходят вверх.
  const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const DEPTH = { easy: 2, normal: 4, hard: 7 };
  const STEP_MS = 190;

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const piecesEl = $('pieces');
  const statusEl = $('status');
  const diffEl = $('difficulty');
  const undoBtn = $('undo-btn');

  let mode = SG.store.get('checkers-mode', 'ai');
  let difficulty = SG.store.get('checkers-diff', 'normal');
  let board, turn, finished, busy, quiet, history;
  let legal = [];
  let selected = null; // { from, step, candidates, at }
  let lastMove = null;
  const scores = { 1: 0, '-1': 0, D: 0 };
  let pieceEls = {}; // клетка → DOM-элемент шашки
  let mySide = 1; // в сетевой игре: 1 — белые, -1 — чёрные
  let flipped = false; // доска развёрнута, чтобы свои шашки были снизу
  const V = (i) => (flipped ? 63 - i : i);

  const side = (v) => Math.sign(v);
  const isKing = (v) => Math.abs(v) === 2;
  const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const lastRow = (s) => (s === 1 ? 0 : 7);

  // ---------- генерация ходов ----------

  function captureSequences(b, from) {
    const piece = b[from];
    const s = side(piece);
    const out = [];
    const work = b.slice();
    work[from] = 0; // своя стартовая клетка во время серии считается пустой

    function dfs(pos, king, path, captured) {
      const r = Math.floor(pos / 8);
      const c = pos % 8;
      let any = false;
      for (const [dr, dc] of DIRS) {
        if (!king) {
          const er = r + dr;
          const ec = c + dc;
          const lr = r + 2 * dr;
          const lc = c + 2 * dc;
          if (!inside(lr, lc)) continue;
          const e = er * 8 + ec;
          const l = lr * 8 + lc;
          if (side(work[e]) !== -s || captured.includes(e) || work[l] !== 0) continue;
          any = true;
          const promoted = lr === lastRow(s);
          dfs(l, promoted, [...path, l], [...captured, e]);
        } else {
          // дамка: летит до первой фигуры, бьёт её и может встать на любую свободную клетку за ней
          let rr = r + dr;
          let cc = c + dc;
          while (inside(rr, cc) && work[rr * 8 + cc] === 0) {
            rr += dr;
            cc += dc;
          }
          if (!inside(rr, cc)) continue;
          const e = rr * 8 + cc;
          if (side(work[e]) !== -s || captured.includes(e)) continue;
          const landings = [];
          rr += dr;
          cc += dc;
          while (inside(rr, cc) && work[rr * 8 + cc] === 0) {
            landings.push(rr * 8 + cc);
            rr += dr;
            cc += dc;
          }
          if (!landings.length) continue;
          any = true;
          const nextCaptured = [...captured, e];
          // если с какой-то клетки можно бить дальше — обязаны встать на такую
          const continuing = landings.filter((l) => canCaptureFrom(l, nextCaptured));
          (continuing.length ? continuing : landings).forEach((l) => dfs(l, true, [...path, l], nextCaptured));
        }
      }
      if (!any && path.length) {
        out.push({ from, to: pos, path, captured, promote: !isKing(piece) && king });
      }
    }

    function canCaptureFrom(pos, captured) {
      const r = Math.floor(pos / 8);
      const c = pos % 8;
      for (const [dr, dc] of DIRS) {
        let rr = r + dr;
        let cc = c + dc;
        while (inside(rr, cc) && work[rr * 8 + cc] === 0) {
          rr += dr;
          cc += dc;
        }
        if (!inside(rr, cc)) continue;
        const e = rr * 8 + cc;
        if (side(work[e]) !== -s || captured.includes(e)) continue;
        if (inside(rr + dr, cc + dc) && work[(rr + dr) * 8 + cc + dc] === 0) return true;
      }
      return false;
    }

    dfs(from, isKing(piece), [], []);
    return out;
  }

  function generateMoves(b, s) {
    const captures = [];
    const simple = [];
    for (let i = 0; i < 64; i++) {
      if (side(b[i]) !== s) continue;
      captures.push(...captureSequences(b, i));
      if (captures.length) continue;
      const r = Math.floor(i / 8);
      const c = i % 8;
      for (const [dr, dc] of DIRS) {
        if (isKing(b[i])) {
          let rr = r + dr;
          let cc = c + dc;
          while (inside(rr, cc) && b[rr * 8 + cc] === 0) {
            simple.push({ from: i, to: rr * 8 + cc, path: [rr * 8 + cc], captured: [], promote: false });
            rr += dr;
            cc += dc;
          }
        } else if (dr === -s) {
          const rr = r + dr;
          const cc = c + dc;
          if (inside(rr, cc) && b[rr * 8 + cc] === 0) {
            simple.push({ from: i, to: rr * 8 + cc, path: [rr * 8 + cc], captured: [], promote: rr === lastRow(s) });
          }
        }
      }
    }
    return captures.length ? captures : simple;
  }

  function applyMove(b, m) {
    const piece = b[m.from];
    b[m.from] = 0;
    m.captured.forEach((i) => (b[i] = 0));
    b[m.to] = m.promote ? piece * 2 : piece;
  }

  // ---------- ИИ ----------

  function evaluate(b, s) {
    let v = 0;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p) continue;
      const r = Math.floor(i / 8);
      const c = i % 8;
      let w = isKing(p) ? 320 : 100;
      if (!isKing(p)) w += (side(p) === 1 ? 7 - r : r) * 4; // продвижение
      if (c >= 2 && c <= 5 && r >= 2 && r <= 5) w += 6; // центр
      if (!isKing(p) && r === (side(p) === 1 ? 7 : 0)) w += 8; // охрана последнего ряда
      v += side(p) * w;
    }
    return v * s;
  }

  function negamax(b, s, depth, alpha, beta) {
    const moves = generateMoves(b, s);
    if (!moves.length) return -100000 - depth;
    if (depth <= 0 && !moves[0].captured.length) return evaluate(b, s);
    if (depth <= -4) return evaluate(b, s); // ограничение продления на взятиях
    moves.sort((x, y) => y.captured.length - x.captured.length);
    let best = -Infinity;
    for (const m of moves) {
      const nb = b.slice();
      applyMove(nb, m);
      const v = -negamax(nb, -s, depth - 1, -beta, -alpha);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  function aiChoose() {
    const moves = generateMoves(board, turn);
    if (difficulty === 'easy' && Math.random() < 0.3) return moves[Math.floor(Math.random() * moves.length)];
    let bestScore = -Infinity;
    let bestMoves = [];
    for (const m of moves) {
      const nb = board.slice();
      applyMove(nb, m);
      const v = -negamax(nb, -turn, DEPTH[difficulty] - 1, -Infinity, Infinity);
      if (v > bestScore) {
        bestScore = v;
        bestMoves = [m];
      } else if (v === bestScore) {
        bestMoves.push(m);
      }
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  // ---------- отрисовка ----------

  const squares = [];
  for (let i = 0; i < 64; i++) {
    const r = Math.floor(i / 8);
    const c = i % 8;
    const sq = document.createElement('div');
    sq.className = 'ck-sq ' + ((r + c) % 2 ? 'dark' : 'light');
    sq.dataset.i = i;
    boardEl.appendChild(sq);
    squares.push(sq);
  }

  function place(el, i) {
    i = V(i);
    el.style.setProperty('--r', Math.floor(i / 8));
    el.style.setProperty('--c', i % 8);
  }

  function buildPieces() {
    piecesEl.innerHTML = '';
    pieceEls = {};
    board.forEach((v, i) => {
      if (!v) return;
      const el = document.createElement('div');
      el.className = 'ck-piece ' + (v > 0 ? 'white' : 'black') + (isKing(v) ? ' king' : '');
      place(el, i);
      piecesEl.appendChild(el);
      pieceEls[i] = el;
    });
  }

  function renderHints() {
    squares.forEach((sq) => sq.classList.remove('target', 'from', 'last'));
    Object.values(pieceEls).forEach((el) => el.classList.remove('selected', 'movable'));
    if (lastMove) [lastMove.from, lastMove.to].forEach((i) => squares[V(i)].classList.add('last'));
    if (finished || busy || !humanTurn()) return;
    if (selected) {
      const at = selected.at;
      if (pieceEls[at]) pieceEls[at].classList.add('selected');
      squares[V(at)].classList.add('from');
      selected.candidates.forEach((m) => squares[V(m.path[selected.step])].classList.add('target'));
    } else {
      new Set(legal.map((m) => m.from)).forEach((i) => pieceEls[i] && pieceEls[i].classList.add('movable'));
    }
  }

  const humanTurn = () => mode === 'pvp' || (mode === 'net' ? net.active && turn === mySide : turn === 1);

  // ---------- ход партии ----------

  function startTurn() {
    legal = generateMoves(board, turn);
    selected = null;
    if (!legal.length) {
      finish(-turn);
      return;
    }
    if (quiet >= 30) {
      finish('D');
      return;
    }
    updateStatus();
    renderHints();
    undoBtn.disabled = !history.length || busy || mode === 'net';
    if (mode === 'ai' && !humanTurn()) {
      busy = true;
      renderHints();
      setTimeout(() => {
        busy = false;
        if (mode !== 'ai' || finished) return;
        const m = aiChoose();
        perform(m, m.from);
      }, 350);
    }
  }

  // Анимация хода по шагам; start — клетка, где шашка стоит визуально сейчас
  function perform(m, start) {
    busy = true;
    const el = pieceEls[m.from];
    delete pieceEls[m.from];
    const steps = m.path.slice(m.path.indexOf(start) + 1);
    let k = 0;
    const next = () => {
      if (k < steps.length) {
        place(el, steps[k]);
        k++;
        setTimeout(next, STEP_MS);
        return;
      }
      m.captured.forEach((i) => {
        const ce = pieceEls[i];
        delete pieceEls[i];
        if (ce) {
          ce.classList.add('taken');
          setTimeout(() => ce.remove(), 250);
        }
      });
      history.push({ board: board.slice(), turn, quiet, lastMove });
      const wasKingMove = isKing(board[m.from]);
      applyMove(board, m);
      SG.sound.play(m.captured.length ? 'capture' : 'place');
      if (m.promote) el.classList.add('king');
      if (m.promote) SG.sound.play('level');
      pieceEls[m.to] = el;
      quiet = !m.captured.length && wasKingMove ? quiet + 1 : 0;
      lastMove = m;
      turn = -turn;
      busy = false;
      startTurn();
    };
    next();
  }

  function onSquare(i) {
    if (finished || busy || !humanTurn()) return;
    if (selected) {
      const cands = selected.candidates.filter((m) => m.path[selected.step] === i);
      if (cands.length) {
        if (cands.every((m) => m.path.length === selected.step + 1)) {
          const start = selected.at;
          selected = null;
          renderHints();
          if (mode === 'net') net.send({ t: 'move', from: cands[0].from, path: cands[0].path });
          perform(cands[0], start);
        } else {
          // промежуточная клетка серии взятий
          place(pieceEls[selected.from], i);
          selected = { from: selected.from, step: selected.step + 1, candidates: cands, at: i };
          renderHints();
        }
        return;
      }
      if (selected.step > 0) return; // серию взятий нужно закончить
    }
    const own = legal.filter((m) => m.from === i);
    selected = own.length ? { from: i, step: 0, candidates: own, at: i } : null;
    if (own.length) SG.sound.play('click');
    renderHints();
  }

  function finish(winner) {
    finished = true;
    scores[winner]++;
    if ((mode === 'ai' && winner === 1) || (mode === 'net' && winner === mySide)) SG.store.set('checkers-wins', SG.store.get('checkers-wins', 0) + 1);
    renderScores();
    renderHints();
    undoBtn.disabled = true;
    const lost = (mode === 'ai' && winner === -1) || (mode === 'net' && winner !== mySide);
    SG.sound.play(winner === 'D' ? 'draw' : lost ? 'lose' : 'win');
    if (winner === 'D') statusEl.textContent = 'Ничья: 15 ходов дамками без взятий 🤝';
    else if (mode === 'net') statusEl.textContent = winner === mySide ? 'Вы победили! 🎉' : 'Соперник победил';
    else if (mode === 'ai') statusEl.textContent = winner === 1 ? 'Вы победили! 🎉' : 'Компьютер победил 🤖';
    else statusEl.textContent = (winner === 1 ? 'Белые' : 'Чёрные') + ' победили!';
  }

  function updateStatus() {
    const mustCapture = legal.length && legal[0].captured.length ? ' — нужно бить' : '';
    if (mode === 'net') statusEl.textContent = !net.active ? 'Нет соединения с соперником' : turn === mySide ? 'Ваш ход' + mustCapture : 'Ход соперника…';
    else if (mode === 'ai') statusEl.textContent = (turn === 1 ? 'Ваш ход' : 'Компьютер думает…') + (turn === 1 ? mustCapture : '');
    else statusEl.textContent = 'Ходят ' + (turn === 1 ? 'белые' : 'чёрные') + mustCapture;
  }

  function renderScores() {
    $('score-w').textContent = scores[1];
    $('score-b').textContent = scores[-1];
    $('score-d').textContent = scores.D;
    const n = mode === 'net';
    $('label-w').textContent = n ? (mySide === 1 ? 'Вы · белые' : 'Соперник') : mode === 'ai' ? 'Вы · белые' : 'Белые';
    $('label-b').textContent = n ? (mySide === -1 ? 'Вы · чёрные' : 'Соперник') : mode === 'ai' ? 'Компьютер' : 'Чёрные';
  }

  function newGame() {
    board = Array(64).fill(0);
    for (let i = 0; i < 64; i++) {
      const r = Math.floor(i / 8);
      if ((r + (i % 8)) % 2 === 0) continue;
      if (r < 3) board[i] = -1;
      else if (r > 4) board[i] = 1;
    }
    turn = 1;
    finished = false;
    busy = false;
    quiet = 0;
    history = [];
    lastMove = null;
    flipped = mode === 'net' && mySide === -1;
    if (mode === 'net') net.info('вы играете ' + (mySide === 1 ? 'белыми (ходят первыми)' : 'чёрными'));
    renderScores();
    buildPieces();
    startTurn();
  }

  function undo() {
    if (busy || !history.length || mode === 'net') return;
    // откатываемся до ближайшей позиции, где ходит человек
    let h;
    do h = history.pop();
    while (mode === 'ai' && h.turn !== 1 && history.length);
    board = h.board;
    turn = h.turn;
    quiet = h.quiet;
    lastMove = h.lastMove;
    finished = false;
    buildPieces();
    startTurn();
  }

  // ---------- ввод ----------

  boardEl.addEventListener('click', (e) => {
    const rect = boardEl.getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * 8);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * 8);
    if (inside(r, c)) onSquare(V(r * 8 + c));
  });

  // ---------- игра по сети ----------

  const net = SG.net.setup({
    game: 'checkers',
    modeEl: $('mode'),
    onConnect(role) {
      mode = 'net';
      mySide = role === 'host' ? 1 : -1;
      diffEl.style.display = 'none';
      scores[1] = scores[-1] = scores.D = 0;
      newGame();
    },
    onMessage(msg) {
      // ход соперника может прийти, пока ещё анимируется наш
      if (msg.t === 'move' && busy) return setTimeout(() => net.active && this.onMessage(msg), 120);
      if (msg.t === 'move' && !finished && turn !== mySide && Array.isArray(msg.path)) {
        const key = msg.path.join(',');
        const m = legal.find((x) => x.from === msg.from && x.path.join(',') === key);
        if (m) perform(m, m.from);
      } else if (msg.t === 'new') {
        mySide = msg.side;
        newGame();
      }
    },
    onDisconnect(voluntary) {
      if (mode !== 'net') return;
      if (voluntary) {
        modeSeg.set('pvp');
        mode = 'pvp';
        scores[1] = scores[-1] = scores.D = 0;
        newGame();
      } else {
        updateStatus();
        renderHints();
      }
    },
  });

  const modeSeg = SG.segmented($('mode'), mode, (v) => {
    mode = v;
    SG.store.set('checkers-mode', v);
    diffEl.style.display = mode === 'ai' ? '' : 'none';
    scores[1] = scores[-1] = scores.D = 0;
    renderScores();
    newGame();
  });
  SG.segmented(diffEl, difficulty, (v) => {
    difficulty = v;
    SG.store.set('checkers-diff', v);
    newGame();
  });
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (mode === 'net') {
      if (!net.active) return;
      mySide = -mySide;
      net.send({ t: 'new', side: -mySide });
    }
    newGame();
  });
  undoBtn.addEventListener('click', () => {
    undoBtn.blur();
    undo();
  });

  diffEl.style.display = mode === 'ai' ? '' : 'none';
  renderScores();
  newGame();
})();
