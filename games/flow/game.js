/* Соедини точки (Flow) */
(() => {
  'use strict';

  const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#facc15', '#f97316', '#06b6d4', '#d946ef', '#a16207', '#8b5cf6', '#f9a8d4', '#84cc16', '#64748b', '#be123c', '#14b8a6'];

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const statusEl = $('status');
  const overlay = SG.overlay();

  let size = Number(SG.store.get('flow-size', '6'));
  let N, ends, paths, active, solved, owner, sol, hints;
  // ends[k] = [a, b] — клетки концов цвета k; paths[k] — массив клеток от одного конца

  // ---------- генерация ----------

  const nb = (i) => {
    const r = Math.floor(i / N);
    const c = i % N;
    const out = [];
    if (r > 0) out.push(i - N);
    if (r < N - 1) out.push(i + N);
    if (c > 0) out.push(i - 1);
    if (c < N - 1) out.push(i + 1);
    return out;
  };

  // гамильтонов путь «змейкой», перемешанный ходами backbite
  function hamiltonian() {
    const p = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) p.push(r * N + (r % 2 ? N - 1 - c : c));
    const pos = new Array(N * N);
    const reindex = (from, to) => {
      for (let k = from; k <= to; k++) pos[p[k]] = k;
    };
    reindex(0, p.length - 1);
    const reverse = (a, b) => {
      while (a < b) {
        [p[a], p[b]] = [p[b], p[a]];
        a++;
        b--;
      }
    };
    const n = p.length;
    for (let it = 0; it < N * N * 60; it++) {
      if (Math.random() < 0.5) {
        const end = p[n - 1];
        const opts = nb(end).filter((v) => v !== p[n - 2]);
        const j = pos[opts[Math.floor(Math.random() * opts.length)]];
        reverse(j + 1, n - 1);
        reindex(j + 1, n - 1);
      } else {
        const end = p[0];
        const opts = nb(end).filter((v) => v !== p[1]);
        const j = pos[opts[Math.floor(Math.random() * opts.length)]];
        reverse(0, j - 1);
        reindex(0, j - 1);
      }
    }
    return p;
  }

  function generate() {
    for (;;) {
      const p = hamiltonian();
      const segs = [];
      let i = 0;
      while (i < p.length) {
        const left = p.length - i;
        let len = 3 + Math.floor(Math.random() * (2 * N - 5));
        if (left - len < 3) len = left;
        segs.push(p.slice(i, i + len));
        i += len;
      }
      if (segs.length > COLORS.length || segs.length < N - 1) continue;
      // отбрасываем тривиальные отрезки: концы рядом друг с другом
      if (segs.some((s) => nb(s[0]).includes(s[s.length - 1]))) continue;
      sol = segs;
      return segs.map((s) => [s[0], s[s.length - 1]]);
    }
  }

  // ---------- состояние ----------

  function rebuildOwner() {
    owner = new Array(N * N).fill(-1);
    ends.forEach(([a, b], k) => {
      owner[a] = k;
      owner[b] = k;
    });
    paths.forEach((p, k) => p.forEach((c) => (owner[c] = k)));
  }

  const endColor = (i) => ends.findIndex((e) => e.includes(i));
  const complete = (k) => {
    const p = paths[k];
    return p.length > 1 && ends[k].includes(p[0]) && ends[k].includes(p[p.length - 1]) && p[0] !== p[p.length - 1];
  };

  function save() {
    SG.store.set('flow-state', { N, ends, paths, solved, sol, hints });
  }

  function newGame() {
    N = size;
    ends = generate();
    paths = ends.map(() => []);
    solved = false;
    hints = 0;
    active = -1;
    overlay.hidden = true;
    rebuildOwner();
    save();
    resize();
    update();
  }

  // ---------- ввод ----------

  function cellAt(e) {
    const rect = canvas.getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * N);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * N);
    if (r < 0 || r >= N || c < 0 || c >= N) return -1;
    return r * N + c;
  }

  function stepTo(x) {
    const p = paths[active];
    const head = p[p.length - 1];
    const idx = p.indexOf(x);
    if (idx >= 0) {
      p.length = idx + 1;
      return true;
    }
    if (complete(active)) return false;
    const ec = endColor(x);
    if (ec >= 0 && ec !== active) return false;
    if (!nb(head).includes(x)) return false;
    // пересекаем чужую линию — обрезаем её
    const o = owner[x];
    if (o >= 0 && o !== active) {
      const q = paths[o];
      q.length = q.indexOf(x);
    }
    p.push(x);
    if (ec === active) SG.sound.play('place', 7);
    else SG.sound.play('tick');
    return true;
  }

  function moveToward(target) {
    for (let guard = 0; guard < 2 * N; guard++) {
      const p = paths[active];
      const head = p[p.length - 1];
      if (head === target) return;
      const hr = Math.floor(head / N);
      const hc = head % N;
      const tr = Math.floor(target / N);
      const tc = target % N;
      let nx;
      if (p.includes(target)) nx = target;
      else if (Math.abs(tr - hr) >= Math.abs(tc - hc)) nx = head + Math.sign(tr - hr) * N;
      else nx = head + Math.sign(tc - hc);
      if (!stepTo(nx)) return;
      rebuildOwner();
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (solved) return;
    const i = cellAt(e);
    if (i < 0) return;
    const ec = endColor(i);
    if (ec >= 0) {
      active = ec;
      paths[ec] = [i];
    } else if (owner[i] >= 0) {
      active = owner[i];
      const p = paths[active];
      p.length = p.indexOf(i) + 1;
    } else return;
    canvas.setPointerCapture(e.pointerId);
    rebuildOwner();
    draw();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (active < 0) return;
    const i = cellAt(e);
    if (i < 0) return;
    moveToward(i);
    draw();
  });

  const release = () => {
    if (active < 0) return;
    active = -1;
    update();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // ---------- проверка и отрисовка ----------

  function update() {
    rebuildOwner();
    const done = ends.filter((e, k) => complete(k)).length;
    const filled = paths.reduce((n, q) => n + (q.length > 1 ? q.length : 0), 0);
    const pct = Math.round((filled / (N * N)) * 100);
    $('flows').textContent = done + '/' + ends.length;
    $('fill').textContent = pct + '%';
    $('solved').textContent = SG.store.get('flow-solved', 0);
    if (!solved && done === ends.length && filled === N * N) {
      solved = true;
      SG.store.set('flow-solved', SG.store.get('flow-solved', 0) + 1);
      overlay.text = hints ? 'Подсказок: ' + hints + '.' : 'Без подсказок!';
      $('solved').textContent = SG.store.get('flow-solved', 0);
      SG.sound.play('win');
      setTimeout(() => (overlay.hidden = false), 400);
    }
    if (solved) statusEl.textContent = 'Головоломка решена! 🎉';
    else if (done === ends.length) statusEl.textContent = 'Все цвета соединены — теперь заполните всё поле.';
    else statusEl.textContent = 'Соедините точки одного цвета линиями.';
    save();
    draw();
  }

  let W = 0;
  function resize() {
    const cssW = canvas.getBoundingClientRect().width || 480;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssW * dpr);
    W = canvas.width;
    draw();
  }

  function draw() {
    if (!N || !W) return;
    const s = W / N;
    const dark = SG.currentTheme() === 'dark';
    ctx.fillStyle = dark ? '#0b0c16' : '#111827';
    ctx.fillRect(0, 0, W, W);
    // заливка занятых клеток
    for (let i = 0; i < N * N; i++) {
      const o = owner[i];
      if (o < 0 || !paths[o].includes(i)) continue;
      ctx.fillStyle = COLORS[o] + (complete(o) ? '40' : '26');
      ctx.fillRect((i % N) * s, Math.floor(i / N) * s, s, s);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(1, W / 400);
    for (let k = 1; k < N; k++) {
      ctx.beginPath();
      ctx.moveTo(k * s, 0);
      ctx.lineTo(k * s, W);
      ctx.moveTo(0, k * s);
      ctx.lineTo(W, k * s);
      ctx.stroke();
    }
    const cx = (i) => (i % N) * s + s / 2;
    const cy = (i) => Math.floor(i / N) * s + s / 2;
    paths.forEach((p, k) => {
      if (p.length < 2) return;
      ctx.strokeStyle = COLORS[k];
      ctx.lineWidth = s * 0.34;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx(p[0]), cy(p[0]));
      p.forEach((c) => ctx.lineTo(cx(c), cy(c)));
      ctx.stroke();
    });
    ends.forEach(([a, b], k) => {
      [a, b].forEach((i) => {
        ctx.fillStyle = COLORS[k];
        ctx.beginPath();
        ctx.arc(cx(i), cy(i), s * 0.36, 0, Math.PI * 2);
        ctx.fill();
        if (complete(k)) {
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = s * 0.06;
          ctx.stroke();
        }
      });
    });
  }

  window.addEventListener('resize', resize);
  document.addEventListener('sg:themechange', draw);

  SG.segmented($('size'), String(size), (v) => {
    size = Number(v);
    SG.store.set('flow-size', v);
    newGame();
  });
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  $('again-btn').addEventListener('click', newGame);
  $('hint-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (solved) return;
    // прокладываем правильную линию для первого цвета, который ещё не совпадает с решением
    const k = sol.findIndex((seg, j) => paths[j].join() !== seg.join() && paths[j].join() !== seg.slice().reverse().join());
    if (k < 0) return;
    const seg = sol[k];
    // освобождаем клетки решения от чужих линий
    paths.forEach((p, j) => {
      if (j === k) return;
      const cut = p.findIndex((c) => seg.includes(c));
      if (cut >= 0) p.length = cut;
    });
    paths[k] = seg.slice();
    hints++;
    SG.sound.play('hint');
    update();
  });
  $('reset-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (solved) return;
    paths = ends.map(() => []);
    update();
  });

  const saved = SG.store.get('flow-state', null);
  if (saved && saved.N === size && Array.isArray(saved.ends) && Array.isArray(saved.sol) && !saved.solved) {
    N = saved.N;
    ends = saved.ends;
    paths = saved.paths;
    sol = saved.sol;
    hints = saved.hints || 0;
    solved = false;
    active = -1;
    rebuildOwner();
    resize();
    update();
  } else newGame();
})();
