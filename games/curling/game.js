/* Кёрлинг: пускайте камни к дому, закручивайте и натирайте лёд — чей камень ближе к центру */
(() => {
  'use strict';

  const W = 760;
  const H = 260;
  const R = 11;
  const HX = 620; // центр дома
  const HY = H / 2;
  const HOUSE = 62;
  const START = 50;
  const BACK = 700;
  const MINX = 440; // камень, не доехавший сюда, снимается
  const STONES = 4; // камней у каждого за энд
  const ENDS = 4;
  const FRICT = 60;
  const SWEEP = 42;
  const MINV = 170;
  const MAXV = 300;

  function create() {
    return { stones: [], end: 1, thrown: [0, 0], turn: 0, hammer: 1, phase: 'aim', aim: 0, power: 0, charge: 0, spin: 1, score: [0, 0], ends: [], msg: '', shots: 0, sweep: false };
  }

  function launch(s) {
    const v = MINV + s.power * (MAXV - MINV);
    s.stones.push({ x: START, y: HY, vx: Math.cos(s.aim) * v, vy: Math.sin(s.aim) * v, side: s.turn, spin: s.spin, id: s.shots + 1 });
    s.thrown[s.turn]++;
    s.phase = 'roll';
    s.shots++;
    s.power = 0;
    s.charge = 0;
  }

  function physics(stones, dt, sweep, ev) {
    for (const st of stones) {
      const sp = Math.hypot(st.vx, st.vy);
      if (sp < 0.5) {
        st.vx = st.vy = 0;
        continue;
      }
      // закрутка: камень уходит вбок, сильнее к концу пути
      const curl = st.spin * 18 * (1 - Math.min(1, sp / MAXV));
      const px = -st.vy / sp;
      const py = st.vx / sp;
      st.vx += px * curl * dt;
      st.vy += py * curl * dt;
      const dec = (sweep && st.id === sweep ? SWEEP : FRICT) * dt;
      const ns = Math.max(0, sp - dec);
      st.vx *= ns / sp;
      st.vy *= ns / sp;
      st.x += st.vx * dt;
      st.y += st.vy * dt;
      // борта
      if (st.y < R || st.y > H - R) st.out = true;
    }
    for (let i = 0; i < stones.length; i++) {
      for (let j = i + 1; j < stones.length; j++) {
        const a = stones[i];
        const b = stones[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= 2 * R || d === 0) continue;
        const nx = dx / d;
        const ny = dy / d;
        const over = (2 * R - d) / 2;
        a.x -= nx * over;
        a.y -= ny * over;
        b.x += nx * over;
        b.y += ny * over;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 0) {
          a.vx -= rel * nx * 0.95;
          a.vy -= rel * ny * 0.95;
          b.vx += rel * nx * 0.95;
          b.vy += rel * ny * 0.95;
          if (ev) ev.hit = true;
        }
      }
    }
    for (const st of stones) if (st.x > BACK + R) st.out = true;
    return stones.filter((st) => !st.out);
  }

  const moving = (stones) => stones.some((st) => Math.abs(st.vx) > 0.5 || Math.abs(st.vy) > 0.5);
  const distC = (st) => Math.hypot(st.x - HX, st.y - HY);

  function scoreEnd(s) {
    const inHouse = s.stones.filter((st) => distC(st) <= HOUSE + R).sort((a, b) => distC(a) - distC(b));
    if (!inHouse.length) return { side: null, n: 0 };
    const side = inHouse[0].side;
    let n = 0;
    for (const st of inHouse) {
      if (st.side !== side) break;
      n++;
    }
    return { side, n };
  }

  const lastPtr = [null, null];
  function step(s, inputs, dt, fx) {
    const inp = inputs[s.turn];
    if (s.phase === 'aim') {
      const pt = inp.px !== null && inp.px !== undefined ? inp.px + ',' + inp.py : null;
      if (pt && pt !== lastPtr[s.turn] && inp.px > START + 20) s.aim = Math.max(-0.25, Math.min(0.25, Math.atan2(inp.py - HY, inp.px - START)));
      lastPtr[s.turn] = pt;
      if (inp.u) s.aim = Math.max(-0.25, s.aim - 0.25 * dt);
      if (inp.d) s.aim = Math.min(0.25, s.aim + 0.25 * dt);
      if (inp.l && !s.spinHeld) s.spin = -1;
      if (inp.r && !s.spinHeld) s.spin = 1;
      if (inp.f) {
        s.charge += dt;
        const t = (s.charge / 1.6) % 2;
        s.power = t < 1 ? t : 2 - t;
      } else if (s.charge > 0) {
        launch(s);
        fx('slide');
      }
      return;
    }
    if (s.phase === 'roll') {
      // натирание: бросивший держит пробел, пока камень едет
      s.sweep = !!inp.f;
      const ev = {};
      for (let k = 0; k < 4; k++) s.stones = physics(s.stones, dt / 4, s.sweep && s.shots, ev);
      if (ev.hit) fx('hit');
      if (!moving(s.stones)) {
        // не доехавший до зоны камень снимается
        s.stones = s.stones.filter((st) => !(st.id === s.shots && st.x < MINX));
        afterThrow(s, fx);
      }
      return;
    }
    if (s.phase === 'endwait') {
      s.wait -= dt;
      if (s.wait <= 0) {
        s.stones = [];
        s.thrown = [0, 0];
        s.end++;
        s.turn = 1 - s.hammer;
        s.phase = 'aim';
        s.aim = 0;
        s.msg = '';
      }
    }
  }

  function afterThrow(s, fx) {
    s.sweep = false;
    if (s.thrown[0] >= STONES && s.thrown[1] >= STONES) {
      const r = scoreEnd(s);
      s.ends.push(r);
      if (r.side !== null) {
        s.score[r.side] += r.n;
        s.hammer = 1 - r.side;
      }
      s.msg = r.side === null ? 'Энд ' + s.end + ': пустой дом' : 'Энд ' + s.end + ': +' + r.n;
      s.lastEnd = r;
      fx('coin');
      s.phase = s.end >= ENDS ? 'done' : 'endwait';
      s.wait = 2.5;
      return;
    }
    // ходят по очереди; первым ходит тот, у кого нет «молотка»
    s.turn = 1 - s.turn;
    if (s.thrown[s.turn] >= STONES) s.turn = 1 - s.turn;
    s.phase = 'aim';
    s.aim = 0;
  }

  // ---------- компьютер: перебор бросков на модели ----------

  function simulate(s, aim, power, spin, sweepAll) {
    const stones = s.stones.map((x) => ({ ...x }));
    const v = MINV + power * (MAXV - MINV);
    stones.push({ x: START, y: HY, vx: Math.cos(aim) * v, vy: Math.sin(aim) * v, side: s.turn, spin, id: -1 });
    let list = stones;
    for (let t = 0; t < 1200 && moving(list); t++) list = physics(list, 1 / 60, sweepAll ? -1 : false, null);
    list = list.filter((st) => !(st.id === -1 && st.x < MINX));
    return { list };
  }

  function value(s, list) {
    const sorted = list.filter((st) => distC(st) <= HOUSE + R).sort((a, b) => distC(a) - distC(b));
    let v = 0;
    for (const st of sorted) {
      if (st.side !== s.turn) break;
      v += 10;
    }
    if (sorted.length && sorted[0].side !== s.turn) {
      let n = 0;
      for (const st of sorted) {
        if (st.side === s.turn) break;
        n++;
      }
      v -= n * 10;
    }
    if (sorted.length && sorted[0].side === s.turn) v += 20 - distC(sorted[0]) / 5;
    return v;
  }

  const plan = [{}, {}];
  function ai(s, side, level) {
    const inp = { u: false, d: false, l: false, r: false, f: false, px: null, py: null };
    if (s.turn !== side) return inp;
    const st = plan[side];
    if (s.phase === 'roll') {
      inp.f = !!st.sweep;
      return inp;
    }
    if (s.phase !== 'aim') return inp;
    const key = s.shots + ':' + s.end;
    if (st.key !== key) {
      st.key = key;
      st.wait = 0.8;
      let best = null;
      const tries = level === 'easy' ? 20 : level === 'normal' ? 60 : 140;
      for (let k = 0; k < tries; k++) {
        const aim = (Math.random() - 0.5) * 0.3;
        const power = Math.random();
        const spin = Math.random() < 0.5 ? -1 : 1;
        const r = simulate(s, aim, power, spin, false);
        const v = value(s, r.list);
        if (!best || v > best.v) best = { v, aim, power, spin };
      }
      const noise = { easy: [0.03, 0.08], normal: [0.012, 0.035], hard: [0.004, 0.012] }[level];
      st.aim = best.aim + (Math.random() - 0.5) * noise[0];
      st.power = Math.max(0.03, Math.min(0.97, best.power + (Math.random() - 0.5) * noise[1]));
      st.spin = best.spin;
      st.sweep = false;
      st.charging = false;
    }
    if (st.wait > 0) {
      st.wait -= 1 / 60;
      return inp;
    }
    if (s.spin !== st.spin) {
      inp[st.spin < 0 ? 'l' : 'r'] = true;
      return inp;
    }
    if (!st.charging && Math.abs(s.aim - st.aim) >= 0.02) {
      inp[s.aim > st.aim ? 'u' : 'd'] = true;
      return inp;
    }
    // точная доводка прицела
    if (!st.charging) s.aim = st.aim;
    st.charging = true;
    inp.f = s.power < st.power || s.charge === 0;
    return inp;
  }

  // ---------- отрисовка ----------

  const PAL = SG.colors.players; // [0] — синий, [1] — красный
  function draw(g, s, v) {
    g.fillStyle = '#eef6fb';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 2;
    [[MINX, '#ef4444'], [BACK, '#94a3b8'], [START + 30, '#94a3b8']].forEach(([x, c]) => {
      g.strokeStyle = c;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    });
    [[HOUSE, '#2563eb'], [HOUSE * 0.66, '#fff'], [HOUSE * 0.33, '#dc2626'], [5, '#fff']].forEach(([r, c]) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(HX, HY, r, 0, Math.PI * 2);
      g.fill();
    });
    g.strokeStyle = 'rgba(0,0,0,0.15)';
    g.beginPath();
    g.moveTo(0, HY);
    g.lineTo(W, HY);
    g.stroke();
    s.stones.forEach((st) => {
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.beginPath();
      g.arc(st.x + 2, st.y + 2, R, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#9ca3af';
      g.beginPath();
      g.arc(st.x, st.y, R, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = PAL[st.side];
      g.beginPath();
      g.arc(st.x, st.y, R * 0.62, 0, Math.PI * 2);
      g.fill();
    });
    if (s.phase === 'aim') {
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.setLineDash([6, 6]);
      g.beginPath();
      g.moveTo(START, HY);
      g.lineTo(START + Math.cos(s.aim) * 600, HY + Math.sin(s.aim) * 600);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = PAL[s.turn];
      g.beginPath();
      g.arc(START, HY, R, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111';
      g.font = '700 14px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(s.spin > 0 ? '↻' : '↺', START, HY - 18);
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.fillRect(10, H - 18, 120, 8);
      g.fillStyle = s.power > 0.85 ? '#ef4444' : '#f59e0b';
      g.fillRect(10, H - 18, 120 * s.power, 8);
    }
    if (s.sweep) {
      const last = s.stones[s.stones.length - 1];
      if (last) {
        g.fillStyle = 'rgba(250,204,21,0.6)';
        g.fillRect(last.x + 14, last.y - 12, 6, 24);
      }
    }
    // оставшиеся камни
    [0, 1].forEach((side) => {
      for (let k = 0; k < STONES - s.thrown[side]; k++) {
        g.fillStyle = PAL[side];
        g.beginPath();
        g.arc(14 + k * 16, side ? 14 : 34, 6, 0, Math.PI * 2);
        g.fill();
      }
    });
    if (s.msg) {
      g.fillStyle = '#111';
      g.font = '800 20px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(s.msg, 300, 30);
    }
    void v;
  }

  const names = (v) => (v.mode === 'ai' ? ['вы', 'компьютер'] : v.mode === 'net' ? (v.me === 0 ? ['вы', 'соперник'] : ['соперник', 'вы']) : ['синие', 'красные']);

  SG.rt({
    game: 'curling',
    W,
    H,
    sides: ['Синие камни', 'Красные камни'],
    intro: 'Целиться — мышью или ↑ ↓, закрутка — ← →, держите пробел для силы и отпустите. Пока камень едет, держите пробел — натирать лёд.',
    create,
    step,
    ai,
    draw,
    pad: true,
    shared: true,
    pointer: 'xy',
    fireLabel: 'Бросок',
    over(s) {
      if (s.phase !== 'done') return null;
      const [a, b] = s.score;
      return { winner: a === b ? null : a > b ? 0 : 1, text: 'Счёт ' + a + ' : ' + b + ' за ' + ENDS + ' энда.' };
    },
    hud(s, v) {
      const n = names(v);
      const who = s.phase === 'aim' ? ' · бросает ' + n[s.turn] : s.phase === 'roll' ? ' · камень в пути' : '';
      return 'Энд ' + Math.min(s.end, ENDS) + '/' + ENDS + ' · синие (' + n[0] + ') ' + s.score[0] + ' : ' + s.score[1] + ' красные (' + n[1] + ')' + who;
    },
  });
})();
