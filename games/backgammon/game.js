/* Короткие нарды (бэкгаммон): бейте одиночные шашки соперника, стройте заборы и первыми выведите все 15 */
(() => {
  'use strict';

  const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const BAR = -1;
  const OFF = 24;
  const ROLL_MS = 800; // бросок костей
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function rnd(s) {
    s.rnd = (s.rnd + 0x6d2b79f5) >>> 0;
    let t = s.rnd;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // b[p] > 0 — шашки стороны 0 (идёт от 23 к 0), < 0 — стороны 1 (от 0 к 23)
  function create(seed) {
    const b = Array(24).fill(0);
    b[23] = 2;
    b[12] = 5;
    b[7] = 3;
    b[5] = 5;
    b[0] = -2;
    b[11] = -5;
    b[16] = -3;
    b[18] = -5;
    const s = { rnd: seed >>> 0, b, bar: [0, 0], off: [0, 0], turn: 0, phase: 'roll', dice: [], left: [], last: null };
    // первый ход — у того, чья кость больше
    let a;
    let c;
    do {
      a = 1 + Math.floor(rnd(s) * 6);
      c = 1 + Math.floor(rnd(s) * 6);
    } while (a === c);
    s.turn = a > c ? 0 : 1;
    s.opening = [a, c];
    return s;
  }

  const sign = (side) => (side === 0 ? 1 : -1);
  const own = (s, side, p) => s.b[p] * sign(side) > 0;
  const count = (s, side, p) => Math.max(0, s.b[p] * sign(side));
  const dest = (side, from, d) => (from === BAR ? (side === 0 ? 24 - d : d - 1) : side === 0 ? from - d : from + d);
  const inHome = (side, p) => (side === 0 ? p <= 5 : p >= 18);

  function allHome(s, side) {
    if (s.bar[side]) return false;
    for (let p = 0; p < 24; p++) if (own(s, side, p) && !inHome(side, p)) return false;
    return true;
  }

  // одиночный шаг: откуда и какая кость
  function stepOk(s, side, from, d) {
    if (s.bar[side] && from !== BAR) return null;
    if (from === BAR ? !s.bar[side] : !own(s, side, from)) return null;
    const to = dest(side, from, d);
    if (to < 0 || to > 23) {
      // вывод: все дома, точная кость — или большая, если дальше шашек нет
      if (!allHome(s, side) || from === BAR) return null;
      const dist = side === 0 ? from + 1 : 24 - from;
      if (d === dist) return OFF;
      if (d > dist) {
        for (let p = 0; p < 24; p++) {
          if (!own(s, side, p)) continue;
          const pd = side === 0 ? p + 1 : 24 - p;
          if (pd > dist) return null;
        }
        return OFF;
      }
      return null;
    }
    if (s.b[to] * sign(side) <= -2) return null;
    return to;
  }

  function doStep(s, side, from, d) {
    const to = stepOk(s, side, from, d);
    const c = { ...s, b: s.b.slice(), bar: s.bar.slice(), off: s.off.slice(), left: s.left.slice() };
    if (from === BAR) c.bar[side]--;
    else c.b[from] -= sign(side);
    let hit = false;
    if (to === OFF) c.off[side]++;
    else {
      if (c.b[to] * sign(side) === -1) {
        c.b[to] = 0;
        c.bar[1 - side]++;
        hit = true;
      }
      c.b[to] += sign(side);
    }
    c.left.splice(c.left.indexOf(d), 1);
    return { c, to, hit };
  }

  // все последовательности, использующие максимум костей
  function sequences(s) {
    const side = s.turn;
    const out = [];
    let best = 0;
    const seen = new Set();
    const rec = (st, seq) => {
      let any = false;
      const dice = [...new Set(st.left)];
      for (const d of dice) {
        const froms = st.bar[side] ? [BAR] : [...Array(24).keys()].filter((p) => own(st, side, p));
        for (const f of froms) {
          if (stepOk(st, side, f, d) === null) continue;
          any = true;
          const { c } = doStep(st, side, f, d);
          const key = c.b.join() + c.bar + c.off + c.left;
          if (seen.has(key)) continue;
          seen.add(key);
          rec(c, seq.concat([{ from: f, d }]));
        }
      }
      if (!any) {
        if (seq.length > best) {
          best = seq.length;
          out.length = 0;
        }
        if (seq.length === best) out.push({ seq, end: st });
      }
    };
    rec(s, []);
    // одна кость из двух — обязательно большая, если можно
    if (best === 1 && s.left.length === 2 && s.left[0] !== s.left[1]) {
      const hi = Math.max(...s.left);
      const big = out.filter((x) => x.seq[0].d === hi);
      if (big.length) return big;
    }
    return out;
  }

  function legal(s, m) {
    if (!m) return false;
    if (m.roll) return s.phase === 'roll';
    if (s.phase !== 'move') return false;
    const seqs = sequences(s);
    const steps = m.seq || [m];
    // шаги должны быть началом одной из лучших последовательностей
    let st = s;
    for (let k = 0; k < steps.length; k++) {
      const st0 = steps[k];
      if (!st.left.includes(st0.d) || stepOk(st, s.turn, st0.from, st0.d) === null) return false;
      st = doStep(st, s.turn, st0.from, st0.d).c;
    }
    const key = st.b.join() + st.bar + st.off;
    return seqs.some((x) => {
      // префикс: можно дойти до позиции st, продолжив до одной из лучших
      let t = s;
      for (let k = 0; k < x.seq.length; k++) {
        if (t.b.join() + t.bar + t.off === key && k === steps.length) return true;
        t = doStep(t, s.turn, x.seq[k].from, x.seq[k].d).c;
      }
      return t.b.join() + t.bar + t.off === key && x.seq.length === steps.length;
    });
  }

  function apply(s, m) {
    const side = s.turn;
    if (m.roll) {
      const a = 1 + Math.floor(rnd(s) * 6);
      const c = 1 + Math.floor(rnd(s) * 6);
      s.dice = [a, c];
      s.left = a === c ? [a, a, a, a] : [a, c];
      s.phase = 'move';
      s.last = { side, roll: [a, c] };
      if (!sequences(s)[0].seq.length) {
        s.last.pass = true;
        endTurn(s);
      }
      return;
    }
    const steps = m.seq || [m];
    let hit = false;
    const moved = [];
    for (const st of steps) {
      const r = doStep(s, side, st.from, st.d);
      Object.assign(s, r.c);
      hit = hit || r.hit;
      moved.push([st.from, r.to]);
    }
    s.last = { side, moved, hit };
    if (s.off[side] === 15) return;
    const rest = sequences(s);
    if (!s.left.length || !rest[0].seq.length) endTurn(s);
  }

  function endTurn(s) {
    s.turn = 1 - s.turn;
    s.phase = 'roll';
    s.left = [];
  }

  function over(s) {
    for (const side of [0, 1]) {
      if (s.off[side] < 15) continue;
      const o = 1 - side;
      let kind = 'победа';
      if (!s.off[o]) {
        kind = 'марс (двойная победа)';
        let deep = s.bar[o] > 0;
        for (let p = 0; p < 24; p++) if (own(s, o, p) && inHome(side, p)) deep = true;
        if (deep) kind = 'кокс (тройная победа)';
      }
      return { winner: side, text: 'Все шашки выведены — ' + kind + '.' };
    }
    return null;
  }

  // ---------- компьютер ----------

  function pips(s, side) {
    let n = s.bar[side] * 25;
    for (let p = 0; p < 24; p++) if (own(s, side, p)) n += count(s, side, p) * (side === 0 ? p + 1 : 24 - p);
    return n;
  }

  function evaluate(s, side, level) {
    const o = 1 - side;
    let v = (pips(s, o) - pips(s, side)) * 1 + (s.off[side] - s.off[o]) * 8 + s.bar[o] * 18 - s.bar[side] * 18;
    for (let p = 0; p < 24; p++) {
      const c = count(s, side, p);
      if (c === 1) {
        // одиночная шашка под ударом: сколько шашек соперника позади в пределах 12
        let threat = 0;
        for (let q = 0; q < 24; q++) {
          if (!own(s, o, q)) continue;
          const dist = side === 0 ? p - q : q - p;
          if (dist < 0 && -dist <= 12) threat += -dist <= 6 ? 3 : 1;
        }
        if (s.bar[o]) threat += 3;
        v -= threat * (level === 'hard' ? 4 : 3) * (1 + (inHome(o, p) ? 0.5 : 0));
      }
      if (c >= 2) v += inHome(side, p) ? 6 : 3;
    }
    return v;
  }

  function ai(s, level) {
    if (s.phase === 'roll') return { roll: 1 };
    const seqs = sequences(s);
    if (level === 'easy' && Math.random() < 0.4) return { seq: seqs[Math.floor(Math.random() * seqs.length)].seq };
    let best = null;
    for (const x of seqs) {
      const v = evaluate(x.end, s.turn, level) + (level === 'normal' ? Math.random() * 4 : 0);
      if (!best || v > best.v) best = { v, seq: x.seq };
    }
    return { seq: best.seq };
  }

  // ---------- интерфейс ----------

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const TOP = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  const BOTTOM = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
  const pointEls = {};
  [['top', TOP], ['bottom', BOTTOM]].forEach(([row, list]) => {
    list.forEach((p, k) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'nd-point ' + row + (k % 2 ? ' alt' : '');
      el.style.gridRow = row === 'top' ? '1' : '3';
      el.style.gridColumn = String(k + 1 + (k >= 6 ? 1 : 0));
      el.dataset.slot = row + k;
      el.addEventListener('click', () => clickPoint(+el.dataset.p));
      boardEl.appendChild(el);
      pointEls[row + k] = el;
    });
  });
  const barEl = document.createElement('button');
  barEl.type = 'button';
  barEl.className = 'nd-bar bg-bar';
  barEl.addEventListener('click', () => clickPoint(BAR));
  boardEl.appendChild(barEl);
  let sel = null;

  function stepsFrom(s, from) {
    // допустимые одиночные шаги из точки
    const out = [];
    for (const d of [...new Set(s.left)]) {
      if (stepOk(s, s.turn, from, d) === null) continue;
      if (legal(s, { from, d })) out.push({ from, d, to: stepOk(s, s.turn, from, d) });
    }
    return out;
  }

  function clickPoint(p) {
    if (!duel.canMove()) return;
    const s = duel.state;
    if (s.phase !== 'move') return;
    if (sel !== null) {
      const st = stepsFrom(s, sel).filter((x) => x.to === p).sort((a, b) => a.d - b.d)[0];
      if (st) {
        sel = null;
        return duel.play({ from: st.from, d: st.d });
      }
    }
    if ((p === BAR && s.bar[s.turn]) || (p >= 0 && own(s, s.turn, p))) {
      sel = stepsFrom(s, p).length ? (sel === p ? null : p) : null;
      SG.sound.play('click');
    } else sel = null;
    duel.render();
  }
  // один спокойный оборот: кости докатываются и ближе к концу ложатся выпавшими гранями (остальное покажет render)
  let rolled = null; // ход, бросок которого сейчас катится
  function rollDice(el, dice) {
    const spans = el.querySelectorAll('.nd-die');
    if (spans.length !== 2) el.innerHTML = '<span class="nd-die">🎲</span><span class="nd-die">🎲</span>';
    el.querySelectorAll('.nd-die').forEach((x) => x.classList.remove('used'));
    el.classList.add('rolling');
    // грани меняем у тех же костей, чтобы не начинать их вращение заново
    setTimeout(() => el.classList.contains('rolling') && el.querySelectorAll('.nd-die').forEach((x, i) => (x.textContent = FACES[dice[i]])), ROLL_MS * 0.6);
  }

  $('bg-off').addEventListener('click', () => clickPoint(OFF));
  $('bg-roll').addEventListener('click', () => duel.play({ roll: 1 }));

  const duel = SG.duel({
    game: 'backgammon',
    sides: ['Белые', 'Чёрные'],
    create,
    legal,
    apply,
    over,
    hint(s) {
      if (s.phase === 'roll') return 'бросайте кости';
      return sel === null ? 'выберите шашку' : 'куда пойти?';
    },
    ai,
    aiDelay: 700,
    sound: (s, m) => (m.roll ? 'drop' : s.last && s.last.hit ? 'capture' : 'place'),
    roll: (s, m) => (m.roll && !reduce() ? ROLL_MS : 0),
    rollText: 'Кости катятся…',
    onNew() {
      sel = null;
    },
    render(s, v) {
      if (!v.canMove) sel = null;
      const flip = v.flip;
      const targets = sel !== null && v.canMove ? stepsFrom(s, sel).map((x) => x.to) : [];
      const froms = v.canMove && s.phase === 'move' && sel === null ? new Set([...Array(24).keys(), BAR].filter((p) => stepsFrom(s, p).length)) : new Set();
      const lastTo = new Set(s.last && s.last.moved ? s.last.moved.map((x) => x[1]) : []);
      [['top', TOP], ['bottom', BOTTOM]].forEach(([row, list]) => {
        list.forEach((p0, k) => {
          const p = flip ? 23 - p0 : p0;
          const el = pointEls[row + k];
          el.dataset.p = p;
          const n = Math.abs(s.b[p]);
          const color = s.b[p] > 0 ? 'white' : 'black';
          const shown = Math.min(n, 5);
          let html = '';
          for (let i = 0; i < shown; i++) html += `<span class="nd-chk ${color}">${i === shown - 1 && n > 5 ? n : ''}</span>`;
          el.innerHTML = html;
          el.classList.toggle('from', froms.has(p));
          el.classList.toggle('selected', sel === p);
          el.classList.toggle('target', targets.includes(p));
          el.classList.toggle('last', lastTo.has(p));
        });
      });
      barEl.innerHTML = (s.bar[0] ? '<span class="nd-chk white">' + s.bar[0] + '</span>' : '') + (s.bar[1] ? '<span class="nd-chk black">' + s.bar[1] + '</span>' : '');
      barEl.classList.toggle('from', froms.has(BAR));
      barEl.classList.toggle('selected', sel === BAR);
      $('bg-off').classList.toggle('target', targets.includes(OFF));
      $('off-0').textContent = s.off[0];
      $('off-1').textContent = s.off[1];
      $('bg-roll').disabled = !v.canMove || s.phase !== 'roll';
      // пока кости катятся, выпавшее и его последствия не показываем
      if (v.busy) {
        if (v.last !== rolled) {
          rolled = v.last;
          rollDice($('dice'), s.dice);
        }
        return;
      }
      rolled = null;
      $('dice').classList.remove('rolling');
      const all = s.dice.length ? (s.dice[0] === s.dice[1] ? [s.dice[0], s.dice[0], s.dice[0], s.dice[0]] : s.dice.slice()) : [];
      const left = s.left.slice();
      $('dice').innerHTML = s.phase === 'roll' && !s.last ? '' : all
        .map((d) => {
          const k = left.indexOf(d);
          if (k >= 0) left.splice(k, 1);
          return `<span class="nd-die${k < 0 && s.phase === 'move' ? ' used' : s.phase === 'roll' ? ' used' : ''}">${FACES[d]}</span>`;
        })
        .join('');
      $('bg-note').textContent = s.last && s.last.pass ? 'Выпало ' + s.last.roll.join('–') + ': ходить нечем.' : s.last && s.last.hit ? 'Шашка соперника сбита на бар!' : '';
    },
  });
})();
