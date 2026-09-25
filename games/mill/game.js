/* Мельница (девять фишек): расстановка, ходы, «полёт» с тремя фишками, снятие фишек соперника */
(() => {
  'use strict';

  // 24 точки: три квадрата, в каждом по 8 точек по часовой стрелке от левого верхнего угла
  const RING = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]];
  const POS = [];
  for (let r = 0; r < 3; r++) for (const [x, y] of RING) POS.push([r + x * (3 - r), r + y * (3 - r)]);
  const ADJ = Array.from({ length: 24 }, () => []);
  const link = (a, b) => {
    ADJ[a].push(b);
    ADJ[b].push(a);
  };
  for (let r = 0; r < 3; r++) for (let k = 0; k < 8; k++) link(r * 8 + k, r * 8 + ((k + 1) % 8));
  for (let r = 0; r < 2; r++) for (const k of [1, 3, 5, 7]) link(r * 8 + k, (r + 1) * 8 + k);
  const MILLS = [];
  for (let r = 0; r < 3; r++) for (const k of [0, 2, 4, 6]) MILLS.push([r * 8 + k, r * 8 + k + 1, r * 8 + ((k + 2) % 8)]);
  for (const k of [1, 3, 5, 7]) MILLS.push([k, 8 + k, 16 + k]);
  const MILLS_AT = Array.from({ length: 24 }, (_, i) => MILLS.filter((m) => m.includes(i)));

  const MEN = 9;
  const sideName = (s) => (s ? 'Чёрные' : 'Белые');
  const QUIET_LIMIT = 100; // 50 ходов каждого без снятия фишек — ничья

  const create = () => ({ b: new Array(24).fill(-1), hand: [MEN, MEN], count: [0, 0], turn: 0, quiet: 0 });
  const clone = (s) => ({ b: s.b.slice(), hand: s.hand.slice(), count: s.count.slice(), turn: s.turn, quiet: s.quiet });

  const inMill = (b, i) => b[i] >= 0 && MILLS_AT[i].some((m) => m.every((x) => b[x] === b[i]));

  function removable(b, side) {
    const all = [];
    const free = [];
    for (let i = 0; i < 24; i++) {
      if (b[i] !== side) continue;
      all.push(i);
      if (!inMill(b, i)) free.push(i);
    }
    return free.length ? free : all;
  }

  function moves(s) {
    const me = s.turn;
    const b = s.b;
    const out = [];
    const steps = [];
    if (s.hand[me] > 0) {
      for (let t = 0; t < 24; t++) if (b[t] < 0) steps.push([-1, t]);
    } else {
      const fly = s.count[me] === 3;
      for (let f = 0; f < 24; f++) {
        if (b[f] !== me) continue;
        const targets = fly ? POS.map((_, i) => i) : ADJ[f];
        for (const t of targets) if (b[t] < 0) steps.push([f, t]);
      }
    }
    for (const [f, t] of steps) {
      if (f >= 0) b[f] = -1;
      b[t] = me;
      if (inMill(b, t)) for (const r of removable(b, 1 - me)) out.push({ f, t, r });
      else out.push({ f, t, r: -1 });
      b[t] = -1;
      if (f >= 0) b[f] = me;
    }
    return out;
  }

  function apply(s, m) {
    const me = s.turn;
    if (m.f >= 0) s.b[m.f] = -1;
    else {
      s.hand[me]--;
      s.count[me]++;
    }
    s.b[m.t] = me;
    s.quiet++;
    if (m.r >= 0) {
      s.b[m.r] = -1;
      s.count[1 - me]--;
      s.quiet = 0;
    }
    s.turn = 1 - me;
  }

  // итог для стороны, которой ходить: проиграла, если фишек меньше трёх или некуда ходить
  function result(s) {
    const me = s.turn;
    if (s.hand[me] === 0 && s.count[me] < 3) return { winner: 1 - me, text: sideName(me) + ': осталось всего две фишки.' };
    if (s.quiet >= QUIET_LIMIT) return { winner: null, text: '50 ходов без снятия фишек.' };
    if (!moves(s).length) return { winner: 1 - me, text: sideName(me) + ': фишки заперты, ходить некуда.' };
    return null;
  }

  const same = (a, b) => a && b && a.f === b.f && a.t === b.t && a.r === b.r;
  const legal = (s, m) => !!m && moves(s).some((x) => same(x, m));

  const G = {
    moves,
    play(s, m) {
      const c = clone(s);
      apply(c, m);
      return c;
    },
    terminal(s, depth) {
      const me = s.turn;
      if (s.hand[me] === 0 && s.count[me] < 3) return -10000 - depth;
      if (s.quiet >= QUIET_LIMIT) return 0;
      return null;
    },
    evaluate(s) {
      const me = s.turn;
      const op = 1 - me;
      let v = (s.count[me] + s.hand[me] - s.count[op] - s.hand[op]) * 100;
      // почти готовые мельницы (две свои и пустая)
      for (const m of MILLS) {
        let a = 0;
        let o = 0;
        let e = 0;
        for (const x of m) {
          if (s.b[x] === me) a++;
          else if (s.b[x] === op) o++;
          else e++;
        }
        if (a === 2 && e === 1) v += 12;
        if (o === 2 && e === 1) v -= 12;
        if (a === 3) v += 6;
        if (o === 3) v -= 6;
      }
      // подвижность в фазе ходов
      if (!s.hand[me] && !s.hand[op]) {
        let mob = 0;
        for (let i = 0; i < 24; i++) {
          if (s.b[i] < 0) continue;
          for (const j of ADJ[i]) if (s.b[j] < 0) mob += s.b[i] === me ? 1 : -1;
        }
        v += mob * 3;
        if (s.count[me] > 3 && !moves(s).length) return -10000;
      }
      return v;
    },
    order: (s, ms) => ms.slice().sort((a, b) => (b.r >= 0) - (a.r >= 0)),
  };

  const LEVEL = { easy: [1, 200], normal: [3, 700], hard: [6, 1600] };

  // ---------- отрисовка ----------

  const svg = document.getElementById('board');
  const handEls = [document.getElementById('hand-0'), document.getElementById('hand-1')];
  const NS = 'http://www.w3.org/2000/svg';
  const X = (i) => 10 + POS[i][0] * 30;
  const Y = (i) => 10 + POS[i][1] * 30;
  let lines = '';
  for (const m of MILLS) lines += `<line x1="${X(m[0])}" y1="${Y(m[0])}" x2="${X(m[2])}" y2="${Y(m[2])}"/>`;
  svg.innerHTML = `<g class="ml-lines">${lines}</g><g class="ml-points"></g>`;
  const pointsG = svg.querySelector('.ml-points');
  const pts = POS.map((_, i) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'ml-pt');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.innerHTML = `<circle class="hit" cx="${X(i)}" cy="${Y(i)}" r="12"/><circle class="dot" cx="${X(i)}" cy="${Y(i)}" r="2.6"/><circle class="man" cx="${X(i)}" cy="${Y(i)}" r="8"/>`;
    g.addEventListener('click', () => click(i));
    g.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), click(i)));
    pointsG.appendChild(g);
    return g;
  });

  let sel = -1; // выбранная фишка для хода
  let pend = null; // собрали мельницу — ждём, какую фишку снять

  function click(i) {
    const s = duel.state;
    if (!duel.canMove()) return;
    const all = moves(s);
    if (pend) {
      const m = all.find((x) => x.f === pend.f && x.t === pend.t && x.r === i);
      if (m) {
        pend = null;
        sel = -1;
        duel.play(m);
      }
      return;
    }
    if (s.b[i] === s.turn && s.hand[s.turn] === 0) {
      sel = sel === i ? -1 : i;
      SG.sound.play('click');
      return duel.render();
    }
    const f = s.hand[s.turn] > 0 ? -1 : sel;
    if (f === -1 && s.hand[s.turn] === 0) return;
    const cand = all.filter((x) => x.f === f && x.t === i);
    if (!cand.length) return;
    if (cand[0].r >= 0) {
      pend = { f, t: i };
      SG.sound.play('match');
      return duel.render();
    }
    sel = -1;
    duel.play(cand[0]);
  }

  const duel = SG.duel({
    game: 'mill',
    sides: ['Белые', 'Чёрные'],
    create,
    legal,
    apply,
    over: result,
    hint(s) {
      if (pend) return 'мельница! Снимите фишку соперника';
      if (s.hand[s.turn] > 0) return 'поставьте фишку (осталось ' + s.hand[s.turn] + ')';
      if (s.count[s.turn] === 3) return 'осталось три фишки — можно прыгать на любую точку';
      return sel >= 0 ? 'куда пойти?' : 'выберите фишку';
    },
    ai(s, level) {
      const [depth, ms] = LEVEL[level];
      const all = moves(s);
      if (level === 'easy' && Math.random() < 0.4) return all[Math.floor(Math.random() * all.length)];
      return SG.duel.search(s, G, { depth, timeMs: ms });
    },
    aiDelay: 450,
    onNew() {
      sel = -1;
      pend = null;
    },
    sound: (s, m) => (m.r >= 0 ? 'capture' : m.f >= 0 ? 'slide' : 'place'),
    render(s, v) {
      if (!v.canMove) {
        sel = -1;
        pend = null;
      }
      const all = v.canMove ? moves(s) : [];
      const targets = new Set();
      const removeSet = new Set();
      const movable = new Set();
      if (pend) all.filter((x) => x.f === pend.f && x.t === pend.t).forEach((x) => removeSet.add(x.r));
      else if (s.hand[s.turn] > 0) all.forEach((x) => targets.add(x.t));
      else {
        all.forEach((x) => movable.add(x.f));
        if (sel >= 0) all.filter((x) => x.f === sel).forEach((x) => targets.add(x.t));
      }
      const last = v.last && v.last.m;
      for (let i = 0; i < 24; i++) {
        let owner = s.b[i];
        if (pend) {
          if (i === pend.f) owner = -1;
          if (i === pend.t) owner = s.turn;
        }
        const cls = ['ml-pt'];
        if (owner >= 0) cls.push(owner === 0 ? 'white' : 'black');
        if (i === sel) cls.push('sel');
        if (targets.has(i)) cls.push('target');
        if (removeSet.has(i)) cls.push('remove');
        if (movable.has(i) && sel < 0) cls.push('movable');
        if (last && (last.t === i || last.f === i)) cls.push('last');
        if (last && last.r === i) cls.push('taken');
        if (owner >= 0 && inMill(pend ? Object.assign(s.b.slice(), { [pend.t]: s.turn, [pend.f]: -1 }) : s.b, i)) cls.push('mill');
        pts[i].setAttribute('class', cls.join(' '));
      }
      for (const side of [0, 1]) {
        handEls[side].innerHTML = '<i></i>'.repeat(s.hand[side]);
        handEls[side].parentElement.classList.toggle('turn', s.turn === side && !v.over);
        handEls[side].parentElement.querySelector('b').textContent = s.count[side] + ' на поле';
      }
      svg.classList.toggle('flipped', v.flip);
    },
  });
})();
