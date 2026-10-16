/* Три в ряд: особые камни, блиц и дуэль по сети с атаками */
(() => {
  'use strict';

  const N = 8;
  const TYPES = 6;
  const MOVES = 30;
  const BLITZ_SOLO = 60;
  const BLITZ_NET = 90;
  const STONE = -1;
  const RAINBOW = -2;
  const FALL_MS = 230;
  const VANISH_MS = 220;
  const WARN_MS = 3000; // окно, чтобы отбить атаку
  const FOG_MS = 5000;

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const scoreEl = $('score');
  const movesEl = $('moves');
  const leftLabel = $('left-label');
  const bestEl = $('best');
  const statusEl = $('status');
  const fogEl = $('fog');
  const incomingEl = $('incoming');
  const oppEl = $('opp');
  const oppBoard = $('opp-board');
  const newBtn = $('new-btn');
  const againBtn = $('again-btn');
  const variantEl = $('variant');
  const overlay = SG.overlay();

  let mode = 'solo'; // solo | net
  const savedVariant = () => (SG.store.get('match3-variant', 'moves') === 'blitz' ? 'blitz' : 'moves');
  let variant = savedVariant(); // moves | blitz

  let grid; // grid[r][c] = { type, sp, ice, el }; sp: null | 'h' | 'v' | 'bomb' | 'rainbow'
  let score = 0;
  let movesLeft = MOVES;
  let deadline = 0; // блиц: когда кончается время
  let clock = 0;
  let busy = false;
  let over = true;
  let selected = null; // [r, c]
  let hintTimer = 0;
  let hints = 0; // сколько раз брали подсказку в этой партии
  let turn = null; // итоги текущего хода: { combo, bombs, rainbows }
  let rnd = Math.random;

  // дуэль
  const opp = { score: 0, left: '', done: false, board: '' };
  let incoming = null; // { atk, until, timer }
  let queued = []; // атаки, которые применим, когда закончится каскад
  let fogTimer = 0;

  const bestKey = () => (variant === 'blitz' ? 'match3-blitz-best' : 'match3-best');
  let best = 0;
  const showBest = () => {
    best = SG.store.get(bestKey(), 0);
    bestEl.textContent = best;
  };

  // Повторяемый генератор: у обоих игроков дуэли одинаковое поле и одинаковые падающие камни
  function mulberry32(a) {
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const randType = () => Math.floor(rnd() * TYPES);
  const newSeed = () => Math.floor(Math.random() * 2 ** 31);

  // ---------- DOM ----------

  function makeGem(type, r, c, fromRow, sp = null) {
    const el = document.createElement('div');
    el.innerHTML = '<span></span>';
    const g = { type, sp, ice: false, el };
    paint(g);
    setPos(el, fromRow === undefined ? r : fromRow, c);
    boardEl.appendChild(el);
    return g;
  }

  function paint(g) {
    const el = g.el;
    el.dataset.t = g.type === RAINBOW ? 'r' : g.type === STONE ? 's' : g.type;
    el.classList.add('m3-gem');
    for (const s of ['h', 'v', 'bomb']) el.classList.toggle('sp-' + s, g.sp === s);
    el.classList.toggle('ice', g.ice);
  }

  function setPos(el, r, c) {
    el.style.setProperty('--r', r);
    el.style.setProperty('--c', c);
  }

  const settle = () =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => grid.forEach((row, r) => row.forEach((g, c) => g && setPos(g.el, r, c))))
    );

  const at = (k) => grid[Math.floor(k / N)][k % N];
  const isNormal = (g) => g && g.type >= 0;
  const movable = (g) => g && g.type !== STONE && !g.ice;
  const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;

  // ---------- правила ----------

  function findMatches(g) {
    const hit = new Set();
    const runs = [];
    const same = (a, b) => a && b && a.type >= 0 && a.type === b.type;
    for (let r = 0; r < N; r++) {
      let start = 0;
      for (let c = 1; c <= N; c++) {
        if (c < N && same(g[r][c], g[r][start])) continue;
        if (c - start >= 3 && isNormal(g[r][start])) {
          const run = [];
          for (let k = start; k < c; k++) run.push(r * N + k);
          runs.push(run);
          run.forEach((k) => hit.add(k));
        }
        start = c;
      }
    }
    for (let c = 0; c < N; c++) {
      let start = 0;
      for (let r = 1; r <= N; r++) {
        if (r < N && same(g[r][c], g[start][c])) continue;
        if (r - start >= 3 && isNormal(g[start][c])) {
          const run = [];
          for (let k = start; k < r; k++) run.push(k * N + c);
          runs.push(run);
          run.forEach((k) => hit.add(k));
        }
        start = r;
      }
    }
    return { hit, runs };
  }

  // Ряды с общим камнем (уголок «Г», «Т», крест) — одна фигура
  function shapesOf(runs) {
    const shapes = [];
    for (const run of runs) {
      const touching = shapes.filter((sh) => run.some((k) => sh.cells.has(k)));
      const merged = { cells: new Set(run), runs: [run] };
      touching.forEach((sh) => {
        sh.cells.forEach((k) => merged.cells.add(k));
        merged.runs.push(...sh.runs);
        shapes.splice(shapes.indexOf(sh), 1);
      });
      shapes.push(merged);
    }
    return shapes;
  }

  // Бонус за фигуру: из 5 камней +60, из 6 +100, из 7 и больше +200.
  // Прямой ряд: 4 камня +40, 5 — +100, 6 — +200, 7 и больше — +300.
  const lineBonus = (n) => (n >= 7 ? 300 : n === 6 ? 200 : n === 5 ? 100 : n === 4 ? 40 : 0);
  function shapeBonus(sh) {
    let b = Math.max(...sh.runs.map((r) => lineBonus(r.length)));
    if (sh.runs.length > 1) b = Math.max(b, sh.cells.size >= 7 ? 200 : sh.cells.size >= 6 ? 100 : 60);
    return b;
  }

  // Какие особые камни даёт фигура и где они появятся: 5 в ряд — радуга (7 и больше — две),
  // уголок/«Т» — бомба, 4 в ряд — молния
  function specialFor(sh, swapped) {
    const longest = sh.runs.reduce((a, b) => (b.length > a.length ? b : a));
    let sp = null;
    if (longest.length >= 5) sp = 'rainbow';
    else if (sh.runs.length > 1 && sh.cells.size >= 5) sp = 'bomb';
    else if (longest.length === 4) sp = Math.floor(longest[0] / N) === Math.floor(longest[1] / N) ? 'h' : 'v';
    if (!sp) return [];
    const cross = [...sh.cells].filter((k) => sh.runs.filter((r) => r.includes(k)).length > 1);
    const order = [...swapped.filter((k) => sh.cells.has(k)), ...cross, longest[Math.floor(longest.length / 2)], ...sh.cells];
    const k = order.find((j) => !at(j).sp);
    if (k === undefined) return [];
    const out = [{ k, sp }];
    if (longest.length >= 7) {
      // вторая радуга — в дальнем от первой конце ряда
      const far = longest.filter((j) => j !== k && !at(j).sp).sort((a, b) => Math.abs(b - k) - Math.abs(a - k))[0];
      if (far !== undefined) out.push({ k: far, sp });
    }
    return out;
  }

  function mostCommonType() {
    const cnt = Array(TYPES).fill(0);
    grid.forEach((row) => row.forEach((g) => isNormal(g) && cnt[g.type]++));
    return cnt.indexOf(Math.max(...cnt));
  }

  function area(r0, c0, rad) {
    const out = [];
    for (let r = r0 - rad; r <= r0 + rad; r++) for (let c = c0 - rad; c <= c0 + rad; c++) if (inside(r, c)) out.push(r * N + c);
    return out;
  }
  const rowCells = (r) => Array.from({ length: N }, (_, c) => r * N + c);
  const colCells = (c) => Array.from({ length: N }, (_, r) => r * N + c);
  function typeCells(t) {
    const out = [];
    grid.forEach((row, r) => row.forEach((g, c) => g && g.type === t && out.push(r * N + c)));
    return out;
  }
  function cellOf(g) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c] === g) return r * N + c;
    return -1;
  }

  function swapIn(g, a, b) {
    const t = g[a[0]][a[1]];
    g[a[0]][a[1]] = g[b[0]][b[1]];
    g[b[0]][b[1]] = t;
  }

  // Ход, который что-то соберёт: обычный ряд, радуга или два особых камня
  function findMove() {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const r2 = r + dr;
          const c2 = c + dc;
          if (r2 >= N || c2 >= N) continue;
          const a = grid[r][c];
          const b = grid[r2][c2];
          if (!movable(a) || !movable(b)) continue;
          if (a.sp === 'rainbow' || b.sp === 'rainbow' || (a.sp && b.sp)) return [[r, c], [r2, c2]];
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
    settle();
  }

  // Перемешать камни на поле (каменные блоки и лёд остаются на месте)
  function reshuffle() {
    const free = [];
    grid.forEach((row, r) => row.forEach((g, c) => movable(g) && free.push([r, c])));
    const gems = free.map(([r, c]) => grid[r][c]);
    for (let tries = 0; tries < 60; tries++) {
      for (let i = gems.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [gems[i], gems[j]] = [gems[j], gems[i]];
      }
      free.forEach(([r, c], i) => (grid[r][c] = gems[i]));
      if (!findMatches(grid).hit.size && findMove()) {
        grid.forEach((row, r) => row.forEach((g, c) => setPos(g.el, r, c)));
        return;
      }
    }
    // не вышло — новое поле (блоки и лёд пропадают)
    fillFresh();
  }

  // ---------- ход ----------

  const canPlay = () => !busy && !over && !!grid;

  function trySwap(a, b) {
    if (!canPlay()) return false;
    const ga = grid[a[0]][a[1]];
    const gb = grid[b[0]][b[1]];
    if (!movable(ga) || !movable(gb)) {
      SG.sound.play('error');
      [ga, gb].forEach((g) => g && !movable(g) && shake(g.el));
      return false;
    }
    clearHint();
    busy = true;
    swapIn(grid, a, b);
    setPos(ga.el, b[0], b[1]);
    setPos(gb.el, a[0], a[1]);
    SG.sound.play('slide');
    setTimeout(() => {
      const ka = a[0] * N + a[1];
      const kb = b[0] * N + b[1];
      turn = { combo: 0, bombs: 0, rainbows: 0, big: 0 };
      let forced = null;
      // ga теперь стоит в b, gb — в a
      if (ga.sp && gb.sp) forced = comboSpecials(ga, gb, b);
      else if (ga.sp === 'rainbow' || gb.sp === 'rainbow') {
        // радуга и обычный камень — исчезает весь его цвет
        const rb = ga.sp === 'rainbow' ? ga : gb;
        const other = rb === ga ? gb : ga;
        rb.sp = null;
        turn.rainbows = 1;
        forced = new Set([...typeCells(other.type), rb === ga ? kb : ka]);
        flash(forced, 'rainbow');
      }
      if (!forced && !findMatches(grid).hit.size) {
        // совпадений нет — меняем обратно
        turn = null;
        swapIn(grid, a, b);
        setPos(ga.el, a[0], a[1]);
        setPos(gb.el, b[0], b[1]);
        SG.sound.play('error');
        setTimeout(() => (busy = false), FALL_MS);
        return;
      }
      if (variant === 'moves') {
        movesLeft--;
        movesEl.textContent = movesLeft;
      }
      resolve(1, forced, [ka, kb]);
    }, FALL_MS);
    return true;
  }

  // Два особых камня поменяли местами; g1 теперь стоит в клетке b
  function comboSpecials(g1, g2, b) {
    const [r, c] = b;
    const kinds = [g1.sp, g2.sp];
    const lines = kinds.filter((s) => s === 'h' || s === 'v').length;
    const bombs = kinds.filter((s) => s === 'bomb').length;
    let cells;
    let kind = 'blast';
    if (kinds.includes('rainbow')) {
      turn.rainbows = 1;
      kind = 'rainbow';
      if (lines + bombs === 0) cells = [...Array(N * N).keys()]; // две радуги — всё поле
      else {
        // радуга и особый камень: исчезает весь его цвет, а сам он срабатывает
        const sp = g1.sp === 'rainbow' ? g2 : g1;
        const rb = sp === g1 ? g2 : g1;
        rb.sp = null;
        const set = new Set([...typeCells(sp.type), cellOf(rb)]);
        flash(set, kind);
        return set;
      }
    } else if (lines === 2) {
      cells = [...rowCells(r), ...colCells(c)]; // две молнии — крест
    } else if (lines === 1) {
      // молния и бомба — крест шириной в 3 клетки
      cells = [];
      for (let d = -1; d <= 1; d++) {
        if (inside(r + d, 0)) cells.push(...rowCells(r + d));
        if (inside(0, c + d)) cells.push(...colCells(c + d));
      }
    } else {
      cells = area(r, c, 2); // две бомбы — 5×5
    }
    turn.bombs += bombs;
    g1.sp = g2.sp = null;
    paint(g1);
    paint(g2);
    const set = new Set(cells);
    flash(set, kind);
    return set;
  }

  // Что сжигает особый камень, когда его собрали или задело
  function blastOf(g, k) {
    const r = Math.floor(k / N);
    const c = k % N;
    if (g.sp === 'h') return rowCells(r);
    if (g.sp === 'v') return colCells(c);
    if (g.sp === 'bomb') return area(r, c, 1);
    if (g.sp === 'rainbow') return typeCells(mostCommonType());
    return [];
  }

  function resolve(combo, forced, swapped) {
    const { hit, runs } = findMatches(grid);
    if (!hit.size && !(forced && forced.size)) {
      afterResolve();
      return;
    }
    turn.combo = Math.max(turn.combo, combo);
    let bonus = 0;
    const created = new Map(); // клетка -> какой особый камень в ней появится
    for (const sh of shapesOf(runs)) {
      bonus += shapeBonus(sh);
      for (const s of specialFor(sh, swapped || [])) if (!created.has(s.k)) created.set(s.k, s.sp);
      if (sh.runs.some((r) => r.length >= 6)) turn.big++;
    }

    // что исчезнет: собранные ряды, сработавшие особые камни и всё, что они задели
    const clear = new Set(forced || []);
    hit.forEach((k) => clear.add(k));
    created.forEach((_, k) => clear.delete(k));
    const queue = [...clear];
    while (queue.length) {
      const k = queue.pop();
      const g = at(k);
      if (!g || !g.sp) continue;
      const cells = blastOf(g, k);
      if (g.sp === 'bomb') turn.bombs++;
      if (g.sp === 'rainbow') turn.rainbows++;
      if (g.sp === 'h' || g.sp === 'v') ray(k, g.sp);
      else flash(new Set(cells), g.sp === 'bomb' ? 'blast' : 'rainbow');
      g.sp = null;
      for (const j of cells) {
        if (created.has(j) || clear.has(j)) continue;
        clear.add(j);
        queue.push(j);
      }
    }

    // рядом со сбором ломаются каменные блоки и тает лёд
    const near = new Set();
    clear.forEach((k) => {
      const r = Math.floor(k / N);
      const c = k % N;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inside(r + dr, c + dc)) near.add((r + dr) * N + c + dc);
    });
    near.forEach((k) => {
      if (clear.has(k) || created.has(k)) return;
      const g = at(k);
      if (!g) return;
      if (g.type === STONE) clear.add(k);
      else if (g.ice) {
        g.ice = false;
        paint(g);
      }
    });

    // очки: 10 за камень, бонус за длинные ряды и уголки, множитель за каскады
    let gems = 0;
    clear.forEach((k) => at(k).type !== STONE && gems++);
    const gained = (gems * 10 + bonus) * combo;
    setScore(score + gained);
    if (gained) showPopup(clear.size ? clear : hit, gained, combo);
    SG.sound.play('merge', Math.min(12, (combo - 1) * 3));

    created.forEach((sp, k) => {
      const g = at(k);
      g.sp = sp;
      g.ice = false;
      if (sp === 'rainbow') g.type = RAINBOW;
      paint(g);
      g.el.classList.add('born');
      setTimeout(() => g.el.classList.remove('born'), 500);
    });

    clear.forEach((k) => {
      const g = at(k);
      g.el.classList.add('vanish');
      setTimeout(() => g.el.remove(), VANISH_MS);
      grid[Math.floor(k / N)][k % N] = null;
    });

    setTimeout(() => {
      // гравитация и новые камни сверху; каменные блоки падают как обычные
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
        for (let r = write, k = 1; r >= 0; r--, k++) grid[r][c] = makeGem(randType(), r, c, -k);
      }
      settle();
      setTimeout(() => resolve(combo + 1, null, null), FALL_MS + 40);
    }, VANISH_MS);
  }

  function afterResolve() {
    const t = turn;
    turn = null;
    if (mode === 'net' && t) sendAttacks(t);
    applyQueued();
    busy = false;
    if (mode === 'net') sendState();
    if (over) return;
    if ((variant === 'moves' && movesLeft <= 0) || (variant === 'blitz' && performance.now() >= deadline)) {
      finish();
      return;
    }
    if (!findMove()) {
      toast('Ходов нет — перемешиваем');
      busy = true;
      setTimeout(() => {
        reshuffle();
        busy = false;
        sendState();
      }, 600);
    }
  }

  function setScore(v) {
    score = v;
    scoreEl.textContent = score;
    if (mode === 'solo' && score > best) {
      best = score;
      SG.store.set(bestKey(), best);
      bestEl.textContent = best;
    }
  }

  // ---------- эффекты ----------

  function showPopup(cells, gained, combo) {
    const arr = [...cells];
    const avgR = arr.reduce((s, k) => s + Math.floor(k / N), 0) / arr.length;
    const avgC = arr.reduce((s, k) => s + (k % N), 0) / arr.length;
    const el = document.createElement('div');
    el.className = 'm3-popup';
    el.textContent = '+' + gained + (combo > 1 ? ' ×' + combo : '');
    el.style.left = ((avgC + 0.5) / N) * 100 + '%';
    el.style.top = ((avgR + 0.5) / N) * 100 + '%';
    boardEl.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function fxEl(cls, k) {
    const el = document.createElement('div');
    el.className = cls;
    el.style.setProperty('--r', Math.floor(k / N));
    el.style.setProperty('--c', k % N);
    boardEl.appendChild(el);
    setTimeout(() => el.remove(), 500);
  }

  // молния: луч через всю строку или столбец
  function ray(k, sp) {
    fxEl('m3-ray ' + sp, k);
    SG.sound.play('line');
  }

  // взрыв бомбы или радуга: вспышка на задетых клетках
  function flash(cells, kind) {
    cells.forEach((k) => fxEl('m3-flash ' + kind, k));
    SG.sound.play(kind === 'blast' ? 'explode' : 'level');
  }

  function shake(el) {
    el.classList.remove('nope');
    void el.offsetWidth;
    el.classList.add('nope');
    setTimeout(() => el.classList.remove('nope'), 400);
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
  }

  // ---------- партия ----------

  const blitzSec = () => (mode === 'net' ? BLITZ_NET : BLITZ_SOLO);

  function setLeft() {
    if (variant === 'moves') {
      leftLabel.textContent = 'Ходы';
      movesEl.textContent = movesLeft;
    } else {
      leftLabel.textContent = 'Время';
      movesEl.textContent = over ? 0 : Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
    }
  }

  function tick() {
    if (over || variant !== 'blitz') return;
    setLeft();
    if (mode === 'net') renderOpp();
    if (performance.now() >= deadline && !busy) finish();
  }

  function finish() {
    if (over) return;
    over = true;
    clearInterval(clock);
    clearHint();
    select(null);
    setLeft();
    if (mode === 'net') {
      net.send({ t: 'done', score });
      sendState();
      if (opp.done) decide();
      else statusEl.textContent = 'Ваш счёт: ' + score + '. Ждём, пока соперник доиграет…';
      return;
    }
    const record = score > 0 && score >= best;
    // итог партии: при рекорде — «победа», иначе спокойный итог
    SG.sound.play(record ? 'win' : 'draw');
    overlay.show(
      variant === 'blitz' ? 'Время вышло!' : 'Ходы закончились',
      'Счёт: ' + score + (hints ? ', подсказок: ' + hints : '') + '.' + (record ? ' Новый рекорд! 🏆' : '')
    );
  }

  function decide() {
    const res = score > opp.score ? 'win' : score < opp.score ? 'lose' : 'draw';
    net.result(res);
    SG.sound.play(res);
    if (res === 'win') SG.store.set('match3-wins', SG.store.get('match3-wins', 0) + 1);
    const title = res === 'win' ? 'Победа! 🎉' : res === 'lose' ? 'Соперник набрал больше' : 'Ничья 🤝';
    statusEl.textContent = title + ' Счёт ' + score + ' : ' + opp.score + '.';
    againBtn.hidden = true;
    overlay.show(title, 'Ваш счёт: ' + score + ', у соперника: ' + opp.score + '. Реванш — кнопкой вверху.');
    renderOpp();
  }

  function start(seed, v) {
    variant = v;
    variantSeg.set(v);
    rnd = mulberry32(seed);
    overlay.hidden = true;
    againBtn.hidden = mode === 'net';
    score = 0;
    movesLeft = MOVES;
    busy = false;
    over = false;
    turn = null;
    hints = 0;
    select(null);
    clearIncoming();
    queued = [];
    hideFog();
    clearHint();
    SG.hintCount('hint-btn', 0);
    scoreEl.textContent = '0';
    showBest();
    clearInterval(clock);
    deadline = variant === 'blitz' ? performance.now() + blitzSec() * 1000 : 0;
    if (deadline) clock = setInterval(tick, 200);
    setLeft();
    opp.score = 0;
    opp.left = '';
    opp.done = false;
    opp.board = '';
    fillFresh();
    if (mode === 'net') {
      statusEl.textContent =
        'Дуэль на ' + (variant === 'blitz' ? BLITZ_NET + ' секунд' : MOVES + ' ходов') + ', поле одинаковое — наберите больше очков!';
      renderOpp();
      sendState();
    } else {
      statusEl.textContent = 'Наберите как можно больше очков за ' + (variant === 'blitz' ? BLITZ_SOLO + ' секунд' : MOVES + ' ходов');
    }
  }

  function newGame() {
    if (mode === 'net') {
      if (!net.active || net.role !== 'host') return;
      const seed = newSeed();
      net.send({ t: 'new', seed, v: variant });
      start(seed, variant);
    } else start(newSeed(), variant);
  }

  // ---------- дуэль: поле соперника ----------

  // Поле строкой: цифра — цвет, A–F — молния/бомба этого цвета, a–f — камень во льду, r — радуга, s — блок
  function encode() {
    let s = '';
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const g = grid[r][c];
        if (!g) s += '.';
        else if (g.type === STONE) s += 's';
        else if (g.type === RAINBOW) s += 'r';
        else if (g.ice) s += 'abcdef'[g.type];
        else if (g.sp) s += 'ABCDEF'[g.type];
        else s += g.type;
      }
    }
    return s;
  }

  function sendState() {
    if (mode !== 'net' || !net.active || !grid) return;
    net.send({ t: 'st', score, left: variant === 'moves' ? movesLeft : -1, board: encode() });
  }

  const miniCells = [];
  for (let i = 0; i < N * N; i++) {
    const d = document.createElement('i');
    oppBoard.appendChild(d);
    miniCells.push(d);
  }

  function renderOpp() {
    oppEl.hidden = mode !== 'net';
    if (mode !== 'net') return;
    $('opp-score').textContent = opp.score;
    let left;
    if (opp.done) left = 'партия окончена';
    else if (variant === 'moves') left = 'ходов: ' + (opp.left === '' ? MOVES : opp.left);
    else left = '⏱ ' + movesEl.textContent + ' с';
    $('opp-left').textContent = left;
    miniCells.forEach((d, i) => (d.dataset.k = opp.board[i] || '.'));
  }

  // ---------- дуэль: атаки ----------

  const ATK = {
    stone: { icon: '🪨', name: 'каменные блоки' },
    ice: { icon: '❄️', name: 'лёд' },
    fog: { icon: '🌫', name: 'туман' },
  };

  function sendAttacks(t) {
    if (!net.active || over) return;
    // отбились: каскад ×2 и больше, пока горит предупреждение
    if (incoming && !incoming.atk.back && t.combo >= 2 && performance.now() < incoming.until) {
      const a = incoming.atk;
      clearIncoming();
      net.send({ t: 'atk', kind: a.kind, n: a.n, ms: a.ms, back: true });
      toast('↩ Отбито!');
      SG.sound.play('coin');
    }
    const out = [];
    // каскад ×3 — 2 блока, ряд из 6 и больше — ещё 3
    const stones = (t.combo >= 3 ? 2 : 0) + (t.big ? 3 : 0);
    if (stones) out.push({ kind: 'stone', n: stones });
    if (t.bombs) out.push({ kind: 'ice', n: 3 });
    if (t.rainbows) out.push({ kind: 'fog', ms: FOG_MS });
    out.forEach((a) => net.send({ t: 'atk', ...a }));
    if (out.length) toast(out.map((a) => ATK[a.kind].icon).join(' ') + ' Атака на соперника!');
  }

  function receiveAttack(msg) {
    if (over || !grid || !ATK[msg.kind]) return;
    const atk = {
      kind: msg.kind,
      n: Math.max(1, Math.min(6, Math.round(+msg.n) || 2)),
      ms: Math.max(1000, Math.min(8000, +msg.ms || FOG_MS)),
      back: !!msg.back,
    };
    // уже висит предупреждение — прошлая атака прилетает сразу
    if (incoming) {
      const prev = incoming.atk;
      clearIncoming();
      landAttack(prev);
    }
    const ms = atk.back ? 1200 : WARN_MS;
    const timer = setTimeout(() => {
      if (!incoming || incoming.atk !== atk) return;
      clearIncoming();
      landAttack(atk);
    }, ms);
    incoming = { atk, until: performance.now() + ms, timer };
    incomingEl.hidden = false;
    incomingEl.querySelector('span').textContent =
      ATK[atk.kind].icon + (atk.back ? ' Атака вернулась!' : ' Атака: ' + ATK[atk.kind].name + '! Каскад ×2 — отбить');
    const bar = incomingEl.querySelector('i');
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(1)';
    void bar.offsetWidth;
    bar.style.transition = 'transform ' + ms + 'ms linear';
    bar.style.transform = 'scaleX(0)';
    SG.sound.play('flag');
  }

  function clearIncoming() {
    if (incoming) clearTimeout(incoming.timer);
    incoming = null;
    incomingEl.hidden = true;
  }

  // атака долетела: сразу или, если идёт каскад, после него
  function landAttack(atk) {
    if (over) return;
    queued.push(atk);
    if (busy) return;
    applyQueued();
    sendState();
    if (!findMove()) reshuffle();
  }

  function pickCells(n, ok) {
    const free = [];
    grid.forEach((row, r) => row.forEach((g, c) => ok(g) && free.push([r, c])));
    for (let i = free.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [free[i], free[j]] = [free[j], free[i]];
    }
    return free.slice(0, n);
  }

  function applyQueued() {
    const list = queued;
    queued = [];
    for (const atk of list) {
      if (over) break;
      if (atk.kind === 'stone') {
        pickCells(atk.n, (g) => isNormal(g) && !g.sp && !g.ice).forEach(([r, c]) => {
          const g = grid[r][c];
          g.type = STONE;
          paint(g);
          shake(g.el);
        });
        toast('🪨 Соперник подбросил каменные блоки: ' + atk.n);
      } else if (atk.kind === 'ice') {
        pickCells(atk.n, (g) => isNormal(g) && !g.ice).forEach(([r, c]) => {
          grid[r][c].ice = true;
          paint(grid[r][c]);
        });
        toast('❄️ Соперник заморозил камни: ' + atk.n);
      } else if (atk.kind === 'fog') {
        fogEl.dataset.side = ['top', 'bottom', 'left', 'right'][Math.floor(Math.random() * 4)];
        fogEl.hidden = false;
        clearTimeout(fogTimer);
        fogTimer = setTimeout(hideFog, atk.ms);
        toast('🌫 Туман на ' + Math.round(atk.ms / 1000) + ' секунд!');
      }
      SG.sound.play('hit');
    }
  }

  function hideFog() {
    clearTimeout(fogTimer);
    fogEl.hidden = true;
  }

  // ---------- подсказка ----------

  function clearHint() {
    clearTimeout(hintTimer);
    boardEl.querySelectorAll('.hint').forEach((el) => el.classList.remove('hint'));
  }

  function hint() {
    if (!canPlay()) return;
    clearHint();
    const m = findMove();
    if (!m) return;
    hints++;
    SG.hintCount('hint-btn', hints);
    SG.sound.play('hint');
    m.forEach(([r, c]) => grid[r][c].el.classList.add('hint'));
    hintTimer = setTimeout(clearHint, 2500);
  }

  // ---------- ввод: клик по двум соседним камням или свайп ----------

  function cellAt(e) {
    const rect = boardEl.getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * N);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * N);
    return inside(r, c) ? [r, c] : null;
  }

  function select(cell) {
    boardEl.querySelectorAll('.selected').forEach((el) => el.classList.remove('selected'));
    selected = cell;
    if (cell && grid[cell[0]][cell[1]]) grid[cell[0]][cell[1]].el.classList.add('selected');
  }

  let press = null;
  boardEl.addEventListener('pointerdown', (e) => {
    if (!canPlay()) return;
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
    if (inside(target[0], target[1])) trySwap([r, c], target);
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
  newBtn.addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  againBtn.addEventListener('click', newGame);

  // ---------- режимы ----------

  const variantSeg = SG.segmented(variantEl, variant, (v) => {
    variant = v;
    if (mode === 'solo') SG.store.set('match3-variant', v);
    newGame();
  });

  function toSolo() {
    mode = 'solo';
    modeSeg.set('solo');
    variantEl.style.display = '';
    newBtn.style.display = '';
    variant = savedVariant();
    renderOpp();
  }

  const net = SG.net.setup({
    game: 'match3',
    modeEl: $('mode'),
    onRematch: () => newGame(),
    onConnect(role) {
      mode = 'net';
      // правила дуэли выбирает хозяин
      variantEl.style.display = role === 'host' ? '' : 'none';
      newBtn.style.display = role === 'host' ? '' : 'none';
      net.info('одно поле на двоих, ходим одновременно');
      opp.score = 0;
      opp.done = false;
      opp.board = '';
      renderOpp();
      if (role === 'host') newGame();
      else {
        over = true;
        clearInterval(clock);
        overlay.hidden = true;
        statusEl.textContent = 'Ждём, пока соперник начнёт партию…';
      }
    },
    onMessage(msg) {
      if (!msg) return;
      if (msg.t === 'new' && Number.isFinite(+msg.seed)) {
        start(+msg.seed, msg.v === 'blitz' ? 'blitz' : 'moves');
      } else if (msg.t === 'st') {
        opp.score = Math.max(0, +msg.score || 0);
        if (+msg.left >= 0) opp.left = +msg.left;
        if (typeof msg.board === 'string') opp.board = msg.board.slice(0, N * N);
        renderOpp();
      } else if (msg.t === 'done' && !opp.done) {
        opp.score = Math.max(0, +msg.score || 0);
        opp.done = true;
        renderOpp();
        if (over && grid) decide();
        else toast('Итог соперника: ' + opp.score + ' очков');
      } else if (msg.t === 'atk') receiveAttack(msg);
    },
    onDisconnect(voluntary) {
      if (mode !== 'net') return;
      clearIncoming();
      hideFog();
      toSolo();
      if (voluntary) newGame();
      else statusEl.textContent = 'Нет соединения с соперником — доигрывайте одни';
    },
  });

  const modeSeg = SG.segmented($('mode'), 'solo', () => {
    toSolo();
    newGame();
  });

  // ---------- для тестов ----------

  window.__m3 = {
    get state() {
      return {
        mode,
        variant,
        score,
        movesLeft,
        busy,
        over,
        board: grid && encode(),
        opp: { ...opp },
        incoming: incoming && incoming.atk,
        fog: !fogEl.hidden,
      };
    },
    // поле из 8 строк в формате encode(); у особых камней A–F вид задаёт sps: { клетка: 'h' | 'v' | 'bomb' }
    setBoard(rows, sps = {}) {
      boardEl.querySelectorAll('.m3-gem').forEach((el) => el.remove());
      grid = rows.map((row, r) =>
        [...row].map((ch, c) => {
          let g;
          if (ch === 's') g = makeGem(STONE, r, c);
          else if (ch === 'r') g = makeGem(RAINBOW, r, c, undefined, 'rainbow');
          else if (/[a-f]/.test(ch)) {
            g = makeGem('abcdef'.indexOf(ch), r, c);
            g.ice = true;
          } else if (/[A-F]/.test(ch)) g = makeGem('ABCDEF'.indexOf(ch), r, c, undefined, sps[r * N + c] || 'h');
          else g = makeGem(+ch, r, c);
          paint(g);
          return g;
        })
      );
    },
    trySwap,
    findMove,
    attack: (kind, n, ms) => receiveAttack({ kind, n, ms }),
    finish,
  };

  newGame();
})();
