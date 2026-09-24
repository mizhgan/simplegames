/* Сокобан */
(() => {
  'use strict';

  const LEVELS = window.SOKOBAN_LEVELS;
  const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const statusEl = $('status');
  const overlay = $('overlay');

  let done = SG.store.get('sokoban-done', []);
  let level = Math.min(SG.store.get('sokoban-level', 0), LEVELS.length - 1);
  let W, H, walls, goals, boxes, player, moves, pushes, history, won, boxEls, playerEl, cell;

  // ---------- уровень ----------

  function load(n) {
    level = n;
    SG.store.set('sokoban-level', n);
    const rows = LEVELS[n].m;
    H = rows.length;
    W = Math.max(...rows.map((r) => r.length));
    walls = new Set();
    goals = new Set();
    boxes = new Set();
    const outside = new Set();
    rows.forEach((row, r) => {
      for (let c = 0; c < W; c++) {
        const ch = row[c] || '-';
        const i = r * W + c;
        if (ch === '#') walls.add(i);
        if (ch === '-') outside.add(i);
        if ('.*+'.includes(ch)) goals.add(i);
        if ('$*'.includes(ch)) boxes.add(i);
        if ('@+'.includes(ch)) player = i;
      }
    });
    moves = 0;
    pushes = 0;
    history = [];
    won = false;
    overlay.hidden = true;
    build(outside);
    render();
  }

  function build(outside) {
    boardEl.style.setProperty('--w', W);
    boardEl.style.setProperty('--h', H);
    let s = '';
    for (let i = 0; i < W * H; i++) {
      const cls = outside.has(i) ? 'out' : walls.has(i) ? 'wall' : goals.has(i) ? 'floor goal' : 'floor';
      s += `<div class="sk-cell ${cls}" data-i="${i}"></div>`;
    }
    boardEl.innerHTML = s;
    boxEls = [...boxes].map(() => {
      const b = document.createElement('div');
      b.className = 'sk-box';
      boardEl.appendChild(b);
      return b;
    });
    playerEl = document.createElement('div');
    playerEl.className = 'sk-player';
    boardEl.appendChild(playerEl);
    fit();
  }

  function fit() {
    const avail = Math.min(boardEl.parentElement.clientWidth || 520, 560);
    cell = Math.max(24, Math.min(52, Math.floor(avail / W)));
    boardEl.style.setProperty('--cell', cell + 'px');
  }

  const place = (el, i) => {
    el.style.transform = `translate(${(i % W) * cell}px, ${Math.floor(i / W) * cell}px)`;
  };

  function render() {
    // коробки сопоставляем элементам по порядку, чтобы анимация шла у той, что двигалась
    const list = [...boxes];
    boxEls.forEach((el, k) => {
      const i = list[k];
      place(el, i);
      el.classList.toggle('on', goals.has(i));
    });
    place(playerEl, player);
    $('level').textContent = level + 1 + '/' + LEVELS.length;
    $('moves').textContent = moves;
    $('pushes').textContent = pushes;
    $('prev-btn').disabled = level === 0;
    $('next-btn').disabled = level === LEVELS.length - 1;
    $('undo-btn').disabled = !history.length || won;
    const left = list.filter((i) => !goals.has(i)).length;
    const best = SG.store.get('sokoban-best', {})[level];
    statusEl.textContent = won
      ? 'Уровень пройден! 🎉'
      : (done.includes(level) ? '✓ Пройден. ' : '') + 'Осталось ящиков: ' + left + (best ? ' · рекорд: ' + best + ' ход.' : '');
  }

  // коробки хранятся в Set, но для анимации нам важен порядок — заменяем элемент на месте
  function moveBox(from, to) {
    const list = [...boxes];
    const k = list.indexOf(from);
    list[k] = to;
    boxes = new Set(list);
  }

  // ---------- ходы ----------

  function step(dir) {
    if (won) return false;
    const [dr, dc] = DIRS[dir];
    const r = Math.floor(player / W) + dr;
    const c = (player % W) + dc;
    if (r < 0 || r >= H || c < 0 || c >= W) return false;
    const next = r * W + c;
    if (walls.has(next)) return false;
    if (boxes.has(next)) {
      const r2 = r + dr;
      const c2 = c + dc;
      const beyond = r2 * W + c2;
      if (r2 < 0 || r2 >= H || c2 < 0 || c2 >= W || walls.has(beyond) || boxes.has(beyond)) return false;
      history.push({ player, boxes: [...boxes], moves, pushes });
      moveBox(next, beyond);
      pushes++;
      SG.sound.play(goals.has(beyond) ? 'place' : 'slide', goals.has(beyond) ? 7 : 0);
    } else {
      history.push({ player, boxes: [...boxes], moves, pushes });
      SG.sound.play('tick');
    }
    player = next;
    moves++;
    if (history.length > 2000) history.shift();
    render();
    checkWin();
    return true;
  }

  function checkWin() {
    if ([...boxes].every((b) => goals.has(b))) {
      won = true;
      if (!done.includes(level)) {
        done.push(level);
        SG.store.set('sokoban-done', done);
      }
      const bests = SG.store.get('sokoban-best', {});
      const rec = !bests[level] || moves < bests[level];
      if (rec) {
        bests[level] = moves;
        SG.store.set('sokoban-best', bests);
      }
      SG.store.set('sokoban-solved', done.length);
      $('overlay-text').textContent =
        'Ходов: ' + moves + ', толчков: ' + pushes + ' (минимум толчков — ' + LEVELS[level].p + ').' + (rec ? ' Новый рекорд!' : '');
      $('again-btn').textContent = level < LEVELS.length - 1 ? 'Следующий уровень' : 'Сыграть заново';
      SG.sound.play('win');
      render();
      setTimeout(() => (overlay.hidden = false), 350);
    }
  }

  function undo() {
    if (won || !history.length) return;
    const h = history.pop();
    player = h.player;
    boxes = new Set(h.boxes);
    moves = h.moves;
    pushes = h.pushes;
    SG.sound.play('move');
    render();
  }

  // клик по клетке — идём туда кратчайшим путём (или толкаем соседний ящик)
  function walkTo(target) {
    if (won || walls.has(target) || target === player) return;
    const pr = Math.floor(player / W);
    const pc = player % W;
    const tr = Math.floor(target / W);
    const tc = target % W;
    if (boxes.has(target)) {
      if (Math.abs(pr - tr) + Math.abs(pc - tc) === 1) {
        step(tr < pr ? 'up' : tr > pr ? 'down' : tc < pc ? 'left' : 'right');
      }
      return;
    }
    const prev = new Map([[player, null]]);
    const q = [player];
    while (q.length) {
      const x = q.shift();
      if (x === target) break;
      for (const [d, [dr, dc]] of Object.entries(DIRS)) {
        const r = Math.floor(x / W) + dr;
        const c = (x % W) + dc;
        const y = r * W + c;
        if (r < 0 || r >= H || c < 0 || c >= W || walls.has(y) || boxes.has(y) || prev.has(y)) continue;
        if (!boardEl.children[y] || boardEl.children[y].classList.contains('out')) continue;
        prev.set(y, [x, d]);
        q.push(y);
      }
    }
    if (!prev.has(target)) return;
    const path = [];
    for (let x = target; prev.get(x); x = prev.get(x)[0]) path.unshift(prev.get(x)[1]);
    // идём по одной клетке, чтобы было видно движение
    let k = 0;
    const tick = () => {
      if (k >= path.length || won) return;
      step(path[k++]);
      setTimeout(tick, 60);
    };
    tick();
  }

  // ---------- управление ----------

  const KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  };
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (KEYS[e.code]) {
      e.preventDefault();
      step(KEYS[e.code]);
    } else if (e.code === 'KeyZ' || e.code === 'Backspace') {
      e.preventDefault();
      undo();
    } else if (e.code === 'KeyR') load(level);
    else if (e.key === 'Enter' && won) next();
  });
  boardEl.addEventListener('click', (e) => {
    const c = e.target.closest('.sk-cell');
    if (c) walkTo(Number(c.dataset.i));
    else {
      // клик мог попасть на ящик — определяем клетку по координатам
      const rect = boardEl.getBoundingClientRect();
      const col = Math.floor((e.clientX - rect.left) / cell);
      const row = Math.floor((e.clientY - rect.top) / cell);
      if (col >= 0 && col < W && row >= 0 && row < H) walkTo(row * W + col);
    }
  });
  SG.onSwipe(boardEl, (dir) => step(dir));
  document.querySelectorAll('.dpad [data-dir]').forEach((b) => b.addEventListener('click', () => step(b.dataset.dir)));

  function next() {
    load(level < LEVELS.length - 1 ? level + 1 : level);
  }

  $('undo-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    undo();
  });
  $('restart-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    load(level);
  });
  $('prev-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (level > 0) load(level - 1);
  });
  $('next-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (level < LEVELS.length - 1) load(level + 1);
  });
  $('again-btn').addEventListener('click', next);
  window.addEventListener('resize', () => {
    fit();
    render();
  });

  load(level);
})();
