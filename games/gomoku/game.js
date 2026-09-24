/* Гомоку — пять в ряд */
(() => {
  'use strict';

  const N = 15;
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const statusEl = $('status');
  const diffEl = $('difficulty');
  const undoBtn = $('undo-btn');

  let mode = SG.store.get('gomoku-mode', 'ai');
  let difficulty = SG.store.get('gomoku-diff', 'normal');
  let board, turn, over, history, thinking, timer;

  const cells = [];
  for (let i = 0; i < N * N; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gm-cell';
    const r = Math.floor(i / N);
    const c = i % N;
    if (r === 0) b.classList.add('t');
    if (r === N - 1) b.classList.add('b');
    if (c === 0) b.classList.add('l');
    if (c === N - 1) b.classList.add('r');
    if ([3, 7, 11].includes(r) && [3, 7, 11].includes(c)) b.classList.add('star');
    b.setAttribute('aria-label', 'Клетка ' + (r + 1) + '-' + (c + 1));
    b.addEventListener('click', () => humanMove(i));
    boardEl.appendChild(b);
    cells.push(b);
  }

  const at = (r, c) => (r >= 0 && r < N && c >= 0 && c < N ? board[r * N + c] : -1);

  // линия из 5+ через клетку i
  function winLine(i) {
    const p = board[i];
    const r0 = Math.floor(i / N);
    const c0 = i % N;
    for (const [dr, dc] of DIRS) {
      const line = [i];
      for (const s of [1, -1]) {
        let r = r0 + dr * s;
        let c = c0 + dc * s;
        while (at(r, c) === p) {
          line.push(r * N + c);
          r += dr * s;
          c += dc * s;
        }
      }
      if (line.length >= 5) return line;
    }
    return null;
  }

  // ---------- ИИ: оценка клеток по шаблонам ----------

  function lineScore(count, open) {
    if (count >= 5) return 100000;
    if (open === 0) return 0;
    if (count === 4) return open === 2 ? 10000 : 1200;
    if (count === 3) return open === 2 ? 1000 : 100;
    if (count === 2) return open === 2 ? 100 : 10;
    return open === 2 ? 10 : 1;
  }

  // ценность хода в клетку i для игрока p
  function cellValue(i, p) {
    const r0 = Math.floor(i / N);
    const c0 = i % N;
    let total = 0;
    let strong = 0;
    for (const [dr, dc] of DIRS) {
      let count = 1;
      let open = 0;
      let gap = 0;
      for (const s of [1, -1]) {
        let r = r0 + dr * s;
        let c = c0 + dc * s;
        while (at(r, c) === p) {
          count++;
          r += dr * s;
          c += dc * s;
        }
        if (at(r, c) === 0) {
          open++;
          // «разорванная» линия: X X _ X
          if (at(r + dr * s, c + dc * s) === p) gap++;
        }
      }
      let v = lineScore(count, open);
      if (gap && count < 5) v += lineScore(count + gap, open) * 0.4;
      if (v >= 1000) strong++;
      total += v;
    }
    // вилка из двух сильных угроз
    if (strong >= 2) total += 8000;
    return total;
  }

  function candidates() {
    const out = [];
    for (let i = 0; i < N * N; i++) {
      if (board[i]) continue;
      const r = Math.floor(i / N);
      const c = i % N;
      let near = false;
      for (let dr = -2; dr <= 2 && !near; dr++) for (let dc = -2; dc <= 2; dc++) if (at(r + dr, c + dc) > 0) { near = true; break; }
      if (near) out.push(i);
    }
    return out;
  }

  function aiMove() {
    const me = turn;
    const foe = 3 - me;
    const list = candidates();
    if (!list.length) return Math.floor((N * N) / 2);
    const scored = list.map((i) => {
      const atk = cellValue(i, me);
      const def = cellValue(i, foe);
      let s = atk * 1.1 + def;
      if (atk >= 100000) s = 1e9;
      else if (def >= 100000) s = 1e8;
      if (difficulty === 'normal') s *= 0.85 + Math.random() * 0.3;
      return { i, s: s + Math.random() };
    });
    scored.sort((a, b) => b.s - a.s);
    if (difficulty === 'easy') {
      // лёгкий: иногда не видит угрозы
      if (scored[0].s >= 1e8 && Math.random() < 0.7) return scored[0].i;
      const top = scored.slice(0, 5);
      return top[Math.floor(Math.random() * top.length)].i;
    }
    return scored[0].i;
  }

  // ---------- ход игры ----------

  function place(i) {
    board[i] = turn;
    history.push(i);
    SG.sound.play('place', turn === 1 ? 0 : 5);
    const line = winLine(i);
    if (line) {
      over = true;
      finish(turn);
      render(line);
      return;
    }
    if (history.length === N * N) {
      over = true;
      render();
      finish(0);
      return;
    }
    turn = 3 - turn;
    render();
  }

  function finish(winner) {
    if (!winner) {
      statusEl.textContent = 'Ничья — доска заполнена.';
      SG.sound.play('draw');
      return;
    }
    if (mode === 'ai') {
      if (winner === 1) {
        statusEl.textContent = 'Вы победили! 🎉';
        SG.store.set('gomoku-wins', SG.store.get('gomoku-wins', 0) + 1);
        SG.sound.play('win');
      } else {
        statusEl.textContent = 'Компьютер собрал пять в ряд.';
        SG.sound.play('lose');
      }
    } else {
      statusEl.textContent = (winner === 1 ? 'Чёрные' : 'Белые') + ' победили! 🎉';
      SG.sound.play('win');
    }
  }

  function humanMove(i) {
    if (over || thinking || board[i]) return;
    if (mode === 'ai' && turn !== 1) return;
    place(i);
    if (!over && mode === 'ai') {
      thinking = true;
      statusEl.textContent = 'Компьютер думает…';
      timer = setTimeout(() => {
        thinking = false;
        place(aiMove());
      }, 250);
    }
  }

  function render(line) {
    const last = history[history.length - 1];
    const win = new Set(line || []);
    cells.forEach((el, i) => {
      el.dataset.p = board[i];
      el.classList.toggle('last', i === last && !line);
      el.classList.toggle('win', win.has(i));
    });
    undoBtn.disabled = !history.length || over;
    $('wins').textContent = SG.store.get('gomoku-wins', 0);
    if (!over && !thinking) {
      if (mode === 'ai') statusEl.textContent = 'Ваш ход (чёрные).';
      else statusEl.textContent = 'Ходят ' + (turn === 1 ? 'чёрные' : 'белые') + '.';
    }
  }

  function undo() {
    if (thinking || over || !history.length) return;
    const steps = mode === 'ai' ? (history.length >= 2 ? 2 : 1) : 1;
    for (let k = 0; k < steps; k++) board[history.pop()] = 0;
    turn = history.length % 2 === 0 ? 1 : 2;
    render();
  }

  function newGame() {
    clearTimeout(timer);
    board = new Array(N * N).fill(0);
    turn = 1;
    over = false;
    thinking = false;
    history = [];
    render();
  }

  SG.segmented($('mode'), mode, (v) => {
    mode = v;
    SG.store.set('gomoku-mode', v);
    diffEl.style.display = mode === 'ai' ? '' : 'none';
    newGame();
  });
  SG.segmented(diffEl, difficulty, (v) => {
    difficulty = v;
    SG.store.set('gomoku-diff', v);
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
