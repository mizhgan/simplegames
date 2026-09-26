/* Водопроводчик — поверните трубы так, чтобы вода дошла до всех домов */
(() => {
  'use strict';

  // биты направлений: вверх, вправо, вниз, влево
  const U = 1;
  const R = 2;
  const D = 4;
  const L = 8;
  const DIRS = [
    [U, -1, 0, D],
    [R, 0, 1, L],
    [D, 1, 0, U],
    [L, 0, -1, R],
  ];

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const statusEl = $('status');
  const overlay = SG.overlay();

  let size = Number(SG.store.get('pipes-size', '7'));
  let N, base, rot, src, moves, solved, tiles;

  const rotMask = (m, k) => {
    for (let i = 0; i < ((k % 4) + 4) % 4; i++) m = ((m << 1) | (m >> 3)) & 15;
    return m;
  };
  const maskAt = (i) => rotMask(base[i], rot[i]);

  // ---------- генерация: случайное остовное дерево ----------

  function generate() {
    for (;;) {
      const m = new Array(N * N).fill(0);
      const inTree = new Array(N * N).fill(false);
      const start = Math.floor(N / 2) * N + Math.floor(N / 2);
      inTree[start] = true;
      const frontier = [];
      const addEdges = (i) => {
        const r = Math.floor(i / N);
        const c = i % N;
        for (const [bit, dr, dc, back] of DIRS) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && rr < N && cc >= 0 && cc < N && !inTree[rr * N + cc]) frontier.push([i, rr * N + cc, bit, back]);
        }
      };
      addEdges(start);
      while (frontier.length) {
        const k = Math.floor(Math.random() * frontier.length);
        const [a, b, bit, back] = frontier.splice(k, 1)[0];
        if (inTree[b]) continue;
        // не делаем крестовины — с ними слишком просто
        if (m[a] === 7 || m[a] === 11 || m[a] === 13 || m[a] === 14) continue;
        m[a] |= bit;
        m[b] |= back;
        inTree[b] = true;
        addEdges(b);
      }
      if (inTree.every(Boolean)) return { m, start };
    }
  }

  // ---------- проверка ----------

  function flow() {
    const wet = new Array(N * N).fill(false);
    let loose = 0;
    const stack = [src];
    wet[src] = true;
    while (stack.length) {
      const i = stack.pop();
      const m = maskAt(i);
      const r = Math.floor(i / N);
      const c = i % N;
      for (const [bit, dr, dc, back] of DIRS) {
        if (!(m & bit)) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr >= N || cc < 0 || cc >= N) {
          loose++;
          continue;
        }
        const j = rr * N + cc;
        if (!(maskAt(j) & back)) {
          loose++;
          continue;
        }
        if (!wet[j]) {
          wet[j] = true;
          stack.push(j);
        }
      }
    }
    return { wet, loose };
  }

  // ---------- отрисовка ----------

  function build() {
    boardEl.style.setProperty('--n', N);
    boardEl.innerHTML = '';
    tiles = [];
    for (let i = 0; i < N * N; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pp-tile';
      const m = base[i];
      const deg = [U, R, D, L].filter((x) => m & x).length;
      let inner = '<span class="pp-in">';
      if (m & U) inner += '<i class="arm u"></i>';
      if (m & R) inner += '<i class="arm r"></i>';
      if (m & D) inner += '<i class="arm d"></i>';
      if (m & L) inner += '<i class="arm l"></i>';
      inner += '<i class="hub"></i>';
      if (i === src) inner += '<i class="src"></i>';
      else if (deg === 1) inner += '<i class="home"></i>';
      inner += '</span>';
      b.innerHTML = inner;
      b.addEventListener('click', () => turn(i, 1));
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        turn(i, -1);
      });
      boardEl.appendChild(b);
      tiles.push(b);
    }
  }

  function render() {
    const { wet, loose } = flow();
    tiles.forEach((t, i) => {
      t.firstChild.style.transform = `rotate(${rot[i] * 90}deg)`;
      t.classList.toggle('wet', wet[i]);
    });
    const count = wet.filter(Boolean).length;
    $('moves').textContent = moves;
    $('wet').textContent = Math.round((count / (N * N)) * 100) + '%';
    $('solved').textContent = SG.store.get('pipes-solved', 0);
    if (!solved && count === N * N && loose === 0) {
      solved = true;
      boardEl.classList.add('done');
      SG.store.set('pipes-solved', SG.store.get('pipes-solved', 0) + 1);
      $('solved').textContent = SG.store.get('pipes-solved', 0);
      overlay.text = 'Ходов: ' + moves + '.';
      SG.sound.play('win');
      setTimeout(() => (overlay.hidden = false), 700);
    }
    statusEl.textContent = solved ? 'Вода дошла до всех домов! 🎉' : 'Поворачивайте трубы: клик — по часовой, правый клик — против.';
  }

  function turn(i, dir) {
    if (solved) return;
    rot[i] += dir;
    moves++;
    SG.sound.play('rotate');
    render();
    save();
  }

  function save() {
    SG.store.set('pipes-state', { N, base, rot: rot.map((r) => ((r % 4) + 4) % 4), src, moves, solved });
  }

  function newGame() {
    N = size;
    const g = generate();
    src = g.start;
    base = g.m;
    // перемешиваем повороты, пока поле не станет нерешённым
    do rot = base.map(() => Math.floor(Math.random() * 4));
    while (flow().wet.every(Boolean));
    moves = 0;
    solved = false;
    overlay.hidden = true;
    boardEl.classList.remove('done');
    build();
    render();
    save();
  }

  SG.segmented($('size'), String(size), (v) => {
    size = Number(v);
    SG.store.set('pipes-size', v);
    newGame();
  });
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  $('again-btn').addEventListener('click', newGame);

  const saved = SG.store.get('pipes-state', null);
  if (saved && saved.N === size && Array.isArray(saved.base) && saved.base.length === size * size && !saved.solved) {
    N = saved.N;
    base = saved.base;
    rot = saved.rot;
    src = saved.src;
    moves = saved.moves || 0;
    solved = false;
    build();
    render();
  } else newGame();
})();
