/* Цветные линии (Lines 98) */
(() => {
  'use strict';

  const N = 9;
  const COLORS = 7;
  const SPAWN = 3;
  const MIN_LINE = 5;
  const STEP_MS = 40;
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const nextEl = $('next');
  const scoreEl = $('score');
  const bestEl = $('best');
  const undoBtn = $('undo-btn');
  const overlay = SG.overlay();

  let grid; // 0 — пусто, 1..7 — цвет шара
  let next;
  let score;
  let selected = -1;
  let busy = false;
  let over = false;
  let history = null;
  let best = SG.store.get('lines-best', 0);
  bestEl.textContent = best;

  const cells = [];
  for (let i = 0; i < N * N; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ln-cell';
    b.innerHTML = '<span class="ln-ball"></span>';
    b.addEventListener('click', () => onCell(i));
    boardEl.appendChild(b);
    cells.push(b);
  }

  const randColor = () => 1 + Math.floor(Math.random() * COLORS);
  const empties = () => grid.reduce((a, v, i) => (v ? a : (a.push(i), a)), []);

  // ---------- отрисовка ----------

  function paint(i, cls) {
    const el = cells[i];
    el.dataset.c = grid[i] || '';
    el.classList.toggle('has', !!grid[i]);
    el.classList.remove('selected', 'appear', 'vanish');
    if (cls) {
      void el.offsetWidth;
      el.classList.add(cls);
    }
  }

  function renderAll() {
    for (let i = 0; i < N * N; i++) paint(i);
    if (selected >= 0) cells[selected].classList.add('selected');
    renderNext();
    scoreEl.textContent = score;
    undoBtn.disabled = !history || busy;
  }

  function renderNext() {
    nextEl.innerHTML = next.map((c) => `<span class="ln-ball" data-c="${c}"></span>`).join('');
  }

  function setScore(v) {
    score = v;
    scoreEl.textContent = score;
    if (score > best) {
      best = score;
      SG.store.set('lines-best', best);
      bestEl.textContent = best;
    }
  }

  // ---------- правила ----------

  function findPath(from, to) {
    const prev = new Map([[from, -1]]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === to) break;
      const r = Math.floor(cur / N);
      const c = cur % N;
      for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
        const n = nr * N + nc;
        if (grid[n] || prev.has(n)) continue;
        prev.set(n, cur);
        queue.push(n);
      }
    }
    if (!prev.has(to)) return null;
    const path = [];
    for (let p = to; p !== -1; p = prev.get(p)) path.unshift(p);
    return path;
  }

  // Все клетки, входящие в линии из 5+ шаров одного цвета через клетку i
  function linesAt(i) {
    const color = grid[i];
    if (!color) return [];
    const r = Math.floor(i / N);
    const c = i % N;
    const out = new Set();
    for (const [dr, dc] of DIRS) {
      const line = [i];
      for (const s of [1, -1]) {
        let rr = r + dr * s;
        let cc = c + dc * s;
        while (rr >= 0 && rr < N && cc >= 0 && cc < N && grid[rr * N + cc] === color) {
          line.push(rr * N + cc);
          rr += dr * s;
          cc += dc * s;
        }
      }
      if (line.length >= MIN_LINE) line.forEach((x) => out.add(x));
    }
    return [...out];
  }

  const pointsFor = (n) => n * 2 + (n - MIN_LINE) ** 2 * 2;

  function clearLines(indices) {
    const all = new Set();
    indices.forEach((i) => linesAt(i).forEach((x) => all.add(x)));
    if (!all.size) return 0;
    all.forEach((i) => {
      cells[i].classList.add('vanish');
      grid[i] = 0;
    });
    setTimeout(() => all.forEach((i) => paint(i)), 300);
    setScore(score + pointsFor(all.size));
    SG.sound.play('line', all.size - 3);
    return all.size;
  }

  function spawnBalls(colors) {
    const placed = [];
    for (const color of colors) {
      const free = empties();
      if (!free.length) break;
      const i = free[Math.floor(Math.random() * free.length)];
      grid[i] = color;
      paint(i, 'appear');
      placed.push(i);
    }
    return placed;
  }

  function newNext() {
    next = Array.from({ length: SPAWN }, randColor);
    renderNext();
  }

  // ---------- ход ----------

  function onCell(i) {
    if (busy || over) return;
    if (grid[i]) {
      if (selected >= 0) cells[selected].classList.remove('selected');
      selected = selected === i ? -1 : i;
      SG.sound.play('click');
      if (selected >= 0) cells[selected].classList.add('selected');
      return;
    }
    if (selected < 0) return;
    const path = findPath(selected, i);
    if (!path) {
      cells[i].classList.remove('blocked');
      void cells[i].offsetWidth;
      cells[i].classList.add('blocked');
      SG.sound.play('error');
      return;
    }
    history = { grid: grid.slice(), next: next.slice(), score };
    animateMove(path);
  }

  function animateMove(path) {
    busy = true;
    undoBtn.disabled = true;
    const color = grid[path[0]];
    SG.sound.play('slide');
    cells[path[0]].classList.remove('selected');
    selected = -1;
    let k = 0;
    const step = () => {
      grid[path[k]] = 0;
      paint(path[k]);
      k++;
      grid[path[k]] = color;
      paint(path[k]);
      if (k < path.length - 1) setTimeout(step, STEP_MS);
      else afterMove(path[k]);
    };
    step();
  }

  function afterMove(dest) {
    if (!clearLines([dest])) {
      const placed = spawnBalls(next);
      newNext();
      clearLines(placed);
      if (!empties().length) {
        over = true;
        setTimeout(showGameOver, 500);
      }
    }
    busy = false;
    undoBtn.disabled = !history || over;
    save();
  }

  function showGameOver() {
    SG.sound.play('lose');
    const record = score > 0 && score >= best;
    overlay.text = 'Поле заполнено. Счёт: ' + score + '.' + (record ? ' Новый рекорд! 🏆' : '');
    overlay.hidden = false;
    SG.store.remove('lines-state');
  }

  function undo() {
    if (!history || busy) return;
    grid = history.grid;
    next = history.next;
    score = history.score;
    history = null;
    selected = -1;
    over = false;
    overlay.hidden = true;
    renderAll();
    save();
  }

  function save() {
    if (!over) SG.store.set('lines-state', { grid, next, score });
  }

  function newGame() {
    overlay.hidden = true;
    grid = Array(N * N).fill(0);
    score = 0;
    selected = -1;
    over = false;
    history = null;
    next = Array.from({ length: SPAWN }, randColor);
    renderAll();
    spawnBalls(Array.from({ length: 5 }, randColor));
    undoBtn.disabled = true;
    save();
  }

  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  $('again-btn').addEventListener('click', newGame);
  undoBtn.addEventListener('click', () => {
    undoBtn.blur();
    undo();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault();
      undo();
    }
  });

  const saved = SG.store.get('lines-state', null);
  if (saved && Array.isArray(saved.grid) && saved.grid.length === N * N && saved.grid.some((v) => !v)) {
    grid = saved.grid;
    next = saved.next;
    score = saved.score;
    renderAll();
  } else {
    newGame();
  }
})();
