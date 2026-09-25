/* Королевская игра Ура: древняя гонка на четырёх двоичных кубиках — проведите семь фишек через поле */
(() => {
  'use strict';

  const PIECES = 7;
  const END = 15; // 0 — ещё не вышла, 1–14 — на поле, 15 — дома
  const ROSETTE = [4, 8, 14];
  const shared = (p) => p >= 5 && p <= 12;

  function rnd(s) {
    s.rnd = (s.rnd + 0x6d2b79f5) >>> 0;
    let t = s.rnd;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function create(seed) {
    return { rnd: seed >>> 0, p: [Array(PIECES).fill(0), Array(PIECES).fill(0)], turn: 0, phase: 'roll', dice: null, roll: 0, last: null };
  }

  function targets(s, side, roll) {
    const out = [];
    if (!roll) return out;
    const mine = s.p[side];
    const opp = s.p[1 - side];
    const seen = new Set();
    mine.forEach((from) => {
      if (from === END || seen.has(from)) return;
      seen.add(from);
      const to = from + roll;
      if (to > END) return;
      if (to !== END && mine.includes(to)) return;
      // центральная розетка безопасна: туда нельзя встать на фишку соперника
      if (to === 8 && opp.includes(8)) return;
      out.push({ from, to });
    });
    return out;
  }

  function legal(s, m) {
    if (!m) return false;
    if (m.roll) return s.phase === 'roll';
    if (s.phase !== 'move') return false;
    return targets(s, s.turn, s.roll).some((t) => t.from === m.from);
  }

  function apply(s, m) {
    const side = s.turn;
    if (m.roll) {
      s.dice = [0, 1, 2, 3].map(() => (rnd(s) < 0.5 ? 1 : 0));
      s.roll = s.dice.reduce((a, b) => a + b, 0);
      s.last = { side, roll: s.roll };
      if (!targets(s, side, s.roll).length) {
        s.last.pass = true;
        s.turn = 1 - side;
        s.phase = 'roll';
      } else s.phase = 'move';
      return;
    }
    const to = m.from + s.roll;
    const k = s.p[side].indexOf(m.from);
    s.p[side][k] = to;
    s.last = { side, from: m.from, to };
    if (shared(to)) {
      const j = s.p[1 - side].indexOf(to);
      if (j >= 0) {
        s.p[1 - side][j] = 0;
        s.last.hit = true;
      }
    }
    s.phase = 'roll';
    if (ROSETTE.includes(to)) s.last.again = true;
    else s.turn = 1 - side;
  }

  const home = (s, side) => s.p[side].filter((x) => x === END).length;

  // ---------- компьютер ----------

  // насколько фишка на общем поле под угрозой (соперник позади на 1–4 клетки)
  function danger(s, side, pos) {
    if (!shared(pos) || pos === 8) return 0;
    const opp = s.p[1 - side];
    const probs = [0, 4 / 16, 6 / 16, 4 / 16, 1 / 16];
    let d = 0;
    for (let k = 1; k <= 4; k++) {
      const q = pos - k;
      if (opp.includes(q) || (q <= 4 && q >= 0 && opp.some((x) => x === q)) || (q < 5 && opp.includes(0) && q === 0)) d += probs[k];
    }
    return d;
  }

  function scoreMove(s, side, t) {
    let v = t.to - t.from;
    if (t.to === END) v += 12;
    if (ROSETTE.includes(t.to)) v += t.to === 8 ? 14 : 9;
    if (shared(t.to) && s.p[1 - side].includes(t.to)) v += 16 + t.to;
    if (t.from === 8) v -= 6; // не покидаем безопасную розетку без нужды
    v -= danger(s, side, t.to) * (6 + t.to);
    v += danger(s, side, t.from) * (5 + t.from);
    if (t.from === 0) v += 2;
    return v;
  }

  function ai(s, level) {
    if (s.phase === 'roll') return { roll: 1 };
    const ts = targets(s, s.turn, s.roll);
    if (level === 'easy' && Math.random() < 0.5) return { from: ts[Math.floor(Math.random() * ts.length)].from };
    ts.sort((a, b) => scoreMove(s, s.turn, b) - scoreMove(s, s.turn, a) + (level === 'normal' ? (Math.random() - 0.5) * 4 : 0));
    return { from: ts[0].from };
  }

  // ---------- поле: 3 ряда по 8 клеток ----------

  // клетка пути стороны → [ряд, столбец]; сторона 0 — нижний ряд, 1 — верхний
  function cellOf(side, pos) {
    const row = side === 0 ? 2 : 0;
    if (pos >= 1 && pos <= 4) return [row, 4 - pos];
    if (pos >= 5 && pos <= 12) return [1, pos - 5];
    if (pos === 13 || pos === 14) return [row, 20 - pos];
    return null;
  }
  const EXISTS = (r, c) => r === 1 || c <= 3 || c >= 6;
  const ROS = new Set(['0,0', '2,0', '1,3', '0,6', '2,6']);

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const cells = {};
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ur-cell' + (EXISTS(r, c) ? '' : ' gap') + (ROS.has(r + ',' + c) ? ' ros' : '');
      b.style.gridRow = r + 1;
      b.style.gridColumn = c + 1;
      b.addEventListener('click', () => clickCell(r, c));
      boardEl.appendChild(b);
      cells[r + ',' + c] = b;
    }
  }

  function clickCell(r, c) {
    if (!duel.canMove()) return;
    const s = duel.state;
    if (s.phase !== 'move') return;
    // своя фишка в этой клетке
    for (let pos = 1; pos <= 14; pos++) {
      const rc = cellOf(s.turn, pos);
      if (rc && rc[0] === r && rc[1] === c && s.p[s.turn].includes(pos)) return duel.play({ from: pos });
    }
    // клик по клетке назначения
    const t = targets(s, s.turn, s.roll).find((x) => {
      const rc = cellOf(s.turn, x.to);
      return rc && rc[0] === r && rc[1] === c;
    });
    if (t) duel.play({ from: t.from });
  }

  $('ur-roll').addEventListener('click', () => duel.play({ roll: 1 }));
  $('ur-pool-0').addEventListener('click', () => duel.canMove() && duel.state.turn === 0 && duel.play({ from: 0 }));
  $('ur-pool-1').addEventListener('click', () => duel.canMove() && duel.state.turn === 1 && duel.play({ from: 0 }));

  const duel = SG.duel({
    game: 'ur',
    sides: ['Белые', 'Чёрные'],
    create,
    legal,
    apply,
    over(s) {
      for (const side of [0, 1]) if (home(s, side) === PIECES) return { winner: side, text: 'Все семь фишек дома.' };
      return null;
    },
    hint(s) {
      if (s.phase === 'roll') return 'бросайте кубики';
      return 'выпало ' + s.roll + ' — выберите фишку';
    },
    ai,
    aiDelay: 600,
    sound: (s, m) => (m.roll ? 'drop' : s.last && s.last.hit ? 'capture' : 'place'),
    render(s, v) {
      Object.values(cells).forEach((c) => {
        c.innerHTML = '';
        c.classList.remove('can', 'from', 'last');
      });
      const ts = v.canMove && s.phase === 'move' ? targets(s, s.turn, s.roll) : [];
      for (const side of [0, 1]) {
        s.p[side].forEach((pos) => {
          const rc = cellOf(side, pos);
          if (!rc) return;
          const el = cells[rc.join(',')];
          el.innerHTML = `<i class="ur-pc s${side}"></i>`;
          if (ts.some((t) => t.from === pos) && side === s.turn) el.classList.add('from');
        });
      }
      ts.forEach((t) => {
        const rc = cellOf(s.turn, t.to);
        if (rc) cells[rc.join(',')].classList.add('can');
      });
      if (s.last && s.last.to !== undefined) {
        const rc = cellOf(s.last.side, s.last.to);
        if (rc) cells[rc.join(',')].classList.add('last');
      }
      for (const side of [0, 1]) {
        const waiting = s.p[side].filter((x) => x === 0).length;
        const pool = $('ur-pool-' + side);
        pool.innerHTML = '<span>Ждут:</span>' + ('<i class="ur-pc s' + side + '"></i>').repeat(waiting) + '<span>Дома: ' + home(s, side) + '</span>';
        pool.classList.toggle('can', ts.some((t) => t.from === 0) && s.turn === side);
      }
      $('ur-dice').innerHTML = s.dice ? s.dice.map((d) => `<i class="ur-die${d ? ' on' : ''}"></i>`).join('') + `<b>${s.roll}</b>` : '';
      $('ur-roll').disabled = !v.canMove || s.phase !== 'roll';
      let note = '';
      if (s.last && s.last.pass) note = 'Выпало ' + s.last.roll + ' — ходить нечем, ход переходит.';
      else if (s.last && s.last.again) note = 'Розетка — ещё один бросок!';
      else if (s.last && s.last.hit) note = 'Фишка соперника сбита!';
      $('ur-note').textContent = note;
    },
  });
})();
