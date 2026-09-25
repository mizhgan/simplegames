/* Блокус (дуэт): выставьте как можно больше фигур, касаясь своих только углами */
(() => {
  'use strict';

  const N = 14;
  const START = [4 * N + 4, 9 * N + 9];
  // 21 фигура: от одной клетки до пяти
  const SHAPES = [
    [[0, 0]],
    [[0, 0], [1, 0]],
    [[0, 0], [1, 0], [2, 0]],
    [[0, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [2, 0], [3, 0]],
    [[0, 0], [0, 1], [0, 2], [1, 2]],
    [[0, 0], [1, 0], [2, 0], [1, 1]],
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]],
    [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
    [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]],
    [[0, 0], [0, 1], [1, 1], [1, 2], [1, 3]],
    [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],
    [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
    [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2], [1, 3]],
    [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]],
  ];
  // все повороты и отражения каждой фигуры
  const ORIENTS = SHAPES.map((sh) => {
    const seen = new Set();
    const out = [];
    for (let f = 0; f < 2; f++) {
      for (let r = 0; r < 4; r++) {
        let cells = sh.map(([x, y]) => (f ? [-x, y] : [x, y]));
        for (let k = 0; k < r; k++) cells = cells.map(([x, y]) => [-y, x]);
        const mx = Math.min(...cells.map((c) => c[0]));
        const my = Math.min(...cells.map((c) => c[1]));
        cells = cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
        const key = cells.map((c) => c.join(',')).join(';');
        if (!seen.has(key)) {
          seen.add(key);
          out.push(cells);
        }
      }
    }
    return out;
  });
  const SIZE = SHAPES.map((sh) => sh.length);

  const create = () => ({ b: new Array(N * N).fill(-1), left: [SHAPES.map((_, i) => i), SHAPES.map((_, i) => i)], turn: 0, passes: 0, lastMono: [false, false], placedAll: [false, false], n: 0 });
  const clone = (s) => ({ b: s.b.slice(), left: [s.left[0].slice(), s.left[1].slice()], turn: s.turn, passes: s.passes, lastMono: s.lastMono.slice(), placedAll: s.placedAll.slice(), n: s.n });

  const inb = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

  function fits(s, p, cells, ox, oy) {
    const b = s.b;
    let corner = false;
    const first = !b.some((v) => v === p);
    let start = false;
    for (const [cx, cy] of cells) {
      const x = cx + ox;
      const y = cy + oy;
      if (!inb(x, y) || b[y * N + x] >= 0) return false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(x + dx, y + dy) && b[(y + dy) * N + x + dx] === p) return false;
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) if (inb(x + dx, y + dy) && b[(y + dy) * N + x + dx] === p) corner = true;
      if (y * N + x === START[p]) start = true;
    }
    return first ? start : corner;
  }

  // клетки, от которых можно расти: пустые, касаются своих углом и не касаются сторон
  function anchors(s, p) {
    const out = [];
    const first = !s.b.some((v) => v === p);
    if (first) return [START[p]];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (s.b[y * N + x] >= 0) continue;
        let side = false;
        let corner = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(x + dx, y + dy) && s.b[(y + dy) * N + x + dx] === p) side = true;
        if (side) continue;
        for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) if (inb(x + dx, y + dy) && s.b[(y + dy) * N + x + dx] === p) corner = true;
        if (corner) out.push(y * N + x);
      }
    }
    return out;
  }

  function moves(s, p = s.turn, limit = Infinity) {
    if (s.over) return [];
    const out = [];
    const seen = new Set();
    const anc = anchors(s, p);
    for (const pi of s.left[p]) {
      ORIENTS[pi].forEach((cells, o) => {
        for (const a of anc) {
          const ax = a % N;
          const ay = Math.floor(a / N);
          for (const [cx, cy] of cells) {
            const ox = ax - cx;
            const oy = ay - cy;
            const key = pi + ':' + o + ':' + ox + ':' + oy;
            if (seen.has(key)) continue;
            seen.add(key);
            if (fits(s, p, cells, ox, oy)) {
              out.push({ p: pi, o, x: ox, y: oy });
              if (out.length >= limit) return;
            }
          }
        }
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  const hasMove = (s, p) => moves(s, p, 1).length > 0;

  function legal(s, m) {
    if (!m || s.over) return false;
    if (m.pass) return !hasMove(s, s.turn);
    if (!s.left[s.turn].includes(m.p) || !ORIENTS[m.p] || !ORIENTS[m.p][m.o]) return false;
    return fits(s, s.turn, ORIENTS[m.p][m.o], m.x, m.y);
  }

  function apply(s, m) {
    const me = s.turn;
    s.last = null;
    if (m.pass) s.passes++;
    else {
      s.passes = 0;
      const cells = ORIENTS[m.p][m.o].map(([cx, cy]) => (cy + m.y) * N + cx + m.x);
      cells.forEach((i) => (s.b[i] = me));
      s.left[me] = s.left[me].filter((x) => x !== m.p);
      s.lastMono[me] = m.p === 0;
      s.placedAll[me] = !s.left[me].length;
      s.last = cells;
      s.n++;
    }
    s.turn = 1 - me;
    // у следующего нет ходов — пропускает; у обоих нет — конец
    if (!hasMove(s, s.turn)) {
      if (!hasMove(s, me)) s.over = true;
      else {
        s.turn = me;
        s.skipped = 1 - me;
        return;
      }
    }
    s.skipped = -1;
  }

  function score(s, p) {
    if (s.placedAll[p]) return 15 + (s.lastMono[p] ? 5 : 0);
    return -s.left[p].reduce((a, i) => a + SIZE[i], 0);
  }

  // ---------- компьютер ----------

  function ai(s, level) {
    const me = s.turn;
    const all = moves(s);
    if (!all.length) return { pass: 1 };
    const oppAnc = new Set(anchors(s, 1 - me));
    const centre = (N - 1) / 2;
    const evalMove = (m) => {
      const cells = ORIENTS[m.p][m.o].map(([cx, cy]) => [cx + m.x, cy + m.y]);
      let v = SIZE[m.p] * 10;
      // перекрываем углы соперника и тянемся к центру и в свободное место
      for (const [x, y] of cells) {
        if (oppAnc.has(y * N + x)) v += 6;
        v -= (Math.abs(x - centre) + Math.abs(y - centre)) * (s.n < 8 ? 0.8 : 0.2);
      }
      if (level === 'hard') {
        const c = clone(s);
        cells.forEach(([x, y]) => (c.b[y * N + x] = me));
        v += anchors(c, me).length * 1.5 - anchors(c, 1 - me).length * 1.5;
      }
      return v + Math.random() * (level === 'easy' ? 25 : 2);
    };
    // для скорости оцениваем только крупные фигуры, пока они есть
    const maxSize = Math.max(...all.map((m) => SIZE[m.p]));
    let pool = all.filter((m) => SIZE[m.p] >= maxSize - (level === 'hard' ? 0 : 1));
    if (pool.length > 400) pool = SG.shuffle(pool.slice()).slice(0, 400);
    let best = pool[0];
    let bv = -Infinity;
    for (const m of pool) {
      const v = evalMove(m);
      if (v > bv) {
        bv = v;
        best = m;
      }
    }
    return best;
  }

  // ---------- интерфейс ----------

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const trayEls = [$('tray-0'), $('tray-1')];
  const cellEls = [];
  for (let i = 0; i < N * N; i++) {
    const c = document.createElement('div');
    c.className = 'bk-cell';
    c.dataset.i = i;
    boardEl.appendChild(c);
    cellEls.push(c);
  }
  let sel = -1; // выбранная фигура
  let orient = 0;
  let hover = -1;
  let tapped = -1;

  // якорь предпросмотра — клетка фигуры, ближайшая к её центру
  function placement(i) {
    if (sel < 0) return null;
    const cells = ORIENTS[sel][orient];
    const cx = Math.round(cells.reduce((a, c) => a + c[0], 0) / cells.length - 0.01);
    const cy = Math.round(cells.reduce((a, c) => a + c[1], 0) / cells.length - 0.01);
    return { p: sel, o: orient, x: (i % N) - cx, y: Math.floor(i / N) - cy };
  }

  boardEl.addEventListener('pointermove', (e) => {
    const c = e.target.closest('.bk-cell');
    if (!c || e.pointerType !== 'mouse') return;
    if (hover !== +c.dataset.i) {
      hover = +c.dataset.i;
      duel.render();
    }
  });
  boardEl.addEventListener('pointerleave', () => {
    hover = -1;
    duel.render();
  });
  boardEl.addEventListener('click', (e) => {
    const c = e.target.closest('.bk-cell');
    if (!c || !duel.canMove() || sel < 0) return;
    const i = +c.dataset.i;
    // на телефоне первое касание — предпросмотр, второе — ход
    if (!matchMedia('(hover: hover)').matches && tapped !== i) {
      tapped = i;
      hover = i;
      return duel.render();
    }
    const m = placement(i);
    if (duel.play(m)) {
      sel = -1;
      tapped = -1;
      hover = -1;
    } else SG.sound.play('error');
  });

  const rotate = () => {
    if (sel < 0) return;
    const os = ORIENTS[sel];
    // поворот на 90°: ищем ориентацию, совпадающую с повёрнутой текущей
    const cur = os[orient].map(([x, y]) => [-y, x]);
    orient = findOrient(sel, cur);
    duel.render();
  };
  const flip = () => {
    if (sel < 0) return;
    orient = findOrient(sel, ORIENTS[sel][orient].map(([x, y]) => [-x, y]));
    duel.render();
  };
  function findOrient(p, cells) {
    const mx = Math.min(...cells.map((c) => c[0]));
    const my = Math.min(...cells.map((c) => c[1]));
    const key = cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]).map((c) => c.join(',')).join(';');
    return Math.max(0, ORIENTS[p].findIndex((o) => o.map((c) => c.join(',')).join(';') === key));
  }
  $('rot-btn').addEventListener('click', rotate);
  $('flip-btn').addEventListener('click', flip);
  $('pass-btn').addEventListener('click', () => duel.play({ pass: 1 }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'к' || e.key === 'R') rotate();
    else if (e.key === 'f' || e.key === 'а' || e.key === 'F') flip();
    else if (e.key === 'Escape') {
      sel = -1;
      duel.render();
    }
  });

  function miniSvg(cells, cls) {
    const w = Math.max(...cells.map((c) => c[0])) + 1;
    const h = Math.max(...cells.map((c) => c[1])) + 1;
    return `<svg viewBox="0 0 ${w * 10} ${h * 10}" style="width:${w * 11}px;height:${h * 11}px" aria-hidden="true">${cells.map(([x, y]) => `<rect class="${cls}" x="${x * 10 + 0.5}" y="${y * 10 + 0.5}" width="9" height="9" rx="1.5"/>`).join('')}</svg>`;
  }

  const duel = SG.duel({
    game: 'blokus',
    sides: ['Синие', 'Оранжевые'],
    create,
    legal,
    apply,
    over(s) {
      if (!s.over) return null;
      const a = score(s, 0);
      const b = score(s, 1);
      return { winner: a === b ? null : a > b ? 0 : 1, text: 'Очки: ' + a + ' : ' + b + '.' };
    },
    hint(s) {
      if (!hasMove(s, s.turn)) return 'ходов нет — нажмите «Пас»';
      return sel < 0 ? 'выберите фигуру' : 'поставьте фигуру: касаться своих только углами (R — повернуть, F — отразить)';
    },
    ai,
    aiDelay: 350,
    sound: (s, m) => (m.pass ? 'click' : 'place'),
    onNew() {
      sel = -1;
      orient = 0;
    },
    render(s, v) {
      if (!v.canMove) sel = -1;
      const me = v.mode === 'pvp' ? s.turn : v.me === null || v.me === undefined ? 0 : v.me;
      const preview = new Map();
      let ok = false;
      if (v.canMove && sel >= 0 && hover >= 0) {
        const m = placement(hover);
        ok = legal(s, m);
        ORIENTS[m.p][m.o].forEach(([cx, cy]) => {
          const x = cx + m.x;
          const y = cy + m.y;
          if (inb(x, y)) preview.set(y * N + x, ok);
        });
      }
      const last = new Set(s.last || []);
      for (let i = 0; i < N * N; i++) {
        const val = s.b[i];
        let cls = 'bk-cell';
        if (val >= 0) cls += ' p' + val;
        else if (i === START[0] || i === START[1]) cls += ' start s' + (i === START[0] ? 0 : 1);
        if (last.has(i)) cls += ' last';
        if (preview.has(i)) cls += preview.get(i) ? ' pv-ok p' + s.turn : ' pv-bad';
        cellEls[i].className = cls;
      }
      [0, 1].forEach((p) => {
        const el = trayEls[p];
        const mine = v.canMove && p === s.turn && (v.mode === 'pvp' || p === me);
        el.innerHTML = '';
        el.parentElement.classList.toggle('active', p === s.turn && !v.over);
        el.parentElement.querySelector('.bk-score').textContent = score(s, p);
        for (const pi of s.left[p]) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'bk-piece' + (pi === sel && mine ? ' sel' : '');
          b.innerHTML = miniSvg(pi === sel && mine ? ORIENTS[pi][orient] : SHAPES[pi], 'p' + p);
          b.disabled = !mine;
          b.addEventListener('click', () => {
            if (sel !== pi) orient = 0;
            sel = sel === pi ? -1 : pi;
            SG.sound.play('click');
            duel.render();
          });
          el.appendChild(b);
        }
      });
      $('pass-btn').hidden = !(v.canMove && !hasMove(s, s.turn));
      $('rot-btn').disabled = $('flip-btn').disabled = sel < 0;
    },
  });
})();
