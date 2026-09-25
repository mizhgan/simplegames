/* Мини-гольф вдвоём: шесть лунок со стенками, песком и водой — меньше ударов, чем у соперника */
(() => {
  'use strict';

  const W = 720;
  const H = 420;
  const BR = 7;
  const HR = 11;
  const FRICT = 150;
  const SAND = 520;
  const VMAX = 720;
  const MAXS = 8; // больше ударов на лунку нельзя
  const CELL = 10;

  // стены [x, y, w, h], песок и вода — такие же прямоугольники
  const HOLES = [
    { start: [80, 210], hole: [640, 210], walls: [[340, 130, 40, 160]], sand: [], water: [] },
    { start: [80, 80], hole: [640, 80], walls: [[330, 0, 40, 290]], sand: [[480, 300, 120, 80]], water: [] },
    { start: [80, 80], hole: [640, 340], walls: [[220, 0, 30, 290], [470, 130, 30, 290]], sand: [], water: [] },
    { start: [80, 210], hole: [640, 210], walls: [], sand: [[540, 150, 50, 120]], water: [[280, 110, 150, 200]] },
    { start: [80, 330], hole: [640, 90], walls: [[200, 150, 50, 50], [330, 240, 50, 50], [330, 60, 50, 50], [460, 150, 50, 50], [560, 250, 50, 50]], sand: [[180, 300, 120, 60]], water: [] },
    { start: [80, 90], hole: [640, 330], walls: [[200, 0, 320, 180], [200, 240, 320, 180]], sand: [], water: [[560, 0, 160, 150]] },
  ];

  const inRect = (x, y, r, pad = 0) => x > r[0] - pad && x < r[0] + r[2] + pad && y > r[1] - pad && y < r[1] + r[3] + pad;

  // поле расстояний до лунки в обход стен и воды — для компьютера
  const fields = HOLES.map((h) => {
    const cw = W / CELL;
    const ch = H / CELL;
    const d = new Array(cw * ch).fill(Infinity);
    const block = (cx, cy) => {
      const x = cx * CELL + CELL / 2;
      const y = cy * CELL + CELL / 2;
      return h.walls.some((r) => inRect(x, y, r, BR)) || h.water.some((r) => inRect(x, y, r, 2));
    };
    const q = [];
    const hc = Math.floor(h.hole[0] / CELL) + Math.floor(h.hole[1] / CELL) * cw;
    d[hc] = 0;
    q.push(hc);
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      const cx = c % cw;
      const cy = (c / cw) | 0;
      for (const [dx, dy, w] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch || block(nx, ny)) continue;
        const n = nx + ny * cw;
        const sandy = h.sand.some((r) => inRect(nx * CELL + 5, ny * CELL + 5, r)) ? 2.5 : 1;
        if (d[c] + w * sandy < d[n]) {
          d[n] = d[c] + w * sandy;
          q.push(n);
        }
      }
    }
    return (x, y) => {
      const cx = Math.max(0, Math.min(cw - 1, Math.floor(x / CELL)));
      const cy = Math.max(0, Math.min(ch - 1, Math.floor(y / CELL)));
      return d[cx + cy * cw] * CELL;
    };
  });

  function ball(h, i) {
    return { x: h.start[0], y: h.start[1] + (i ? 12 : -12), vx: 0, vy: 0, in: false, strokes: 0, lx: 0, ly: 0 };
  }

  function create() {
    const h = HOLES[0];
    return { hole: 0, b: [ball(h, 0), ball(h, 1)], turn: 0, phase: 'aim', aim: [0, 0], power: 0, charge: 0, cards: [[], []], msg: 'Лунка 1', wait: 0, shots: 0 };
  }

  // один шаг движения мяча; возвращает событие
  function move(b, h, dt) {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < 1) {
      b.vx = b.vy = 0;
      return null;
    }
    const sandy = h.sand.some((r) => inRect(b.x, b.y, r));
    const ns = Math.max(0, sp - (sandy ? SAND : FRICT) * dt);
    b.vx *= ns / sp;
    b.vy *= ns / sp;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let ev = null;
    if (b.x < BR) (b.x = BR), (b.vx = Math.abs(b.vx) * 0.8), (ev = 'wall');
    if (b.x > W - BR) (b.x = W - BR), (b.vx = -Math.abs(b.vx) * 0.8), (ev = 'wall');
    if (b.y < BR) (b.y = BR), (b.vy = Math.abs(b.vy) * 0.8), (ev = 'wall');
    if (b.y > H - BR) (b.y = H - BR), (b.vy = -Math.abs(b.vy) * 0.8), (ev = 'wall');
    for (const r of h.walls) {
      const cx = Math.max(r[0], Math.min(b.x, r[0] + r[2]));
      const cy = Math.max(r[1], Math.min(b.y, r[1] + r[3]));
      const dx = b.x - cx;
      const dy = b.y - cy;
      const d = Math.hypot(dx, dy);
      if (d < BR) {
        let nx;
        let ny;
        if (d > 0) {
          nx = dx / d;
          ny = dy / d;
        } else {
          nx = -Math.sign(b.vx) || 1;
          ny = 0;
        }
        b.x = cx + nx * BR;
        b.y = cy + ny * BR;
        const dot = b.vx * nx + b.vy * ny;
        if (dot < 0) {
          b.vx -= 1.8 * dot * nx;
          b.vy -= 1.8 * dot * ny;
        }
        ev = 'wall';
      }
    }
    if (h.water.some((r) => inRect(b.x, b.y, r))) return 'water';
    const hd = Math.hypot(b.x - h.hole[0], b.y - h.hole[1]);
    if (hd < HR && Math.hypot(b.vx, b.vy) < 230) return 'in';
    // мяч чуть тянет к лунке у самого края
    if (hd < HR + 6 && hd > 0) {
      b.vx += ((h.hole[0] - b.x) / hd) * 60 * dt;
      b.vy += ((h.hole[1] - b.y) / hd) * 60 * dt;
    }
    return ev;
  }

  function nextTurn(s) {
    const [a, c] = s.b;
    if (a.in && c.in) {
      s.cards[0].push(a.strokes);
      s.cards[1].push(c.strokes);
      s.phase = 'next';
      s.wait = 1.8;
      s.msg = 'Лунка ' + (s.hole + 1) + ': ' + a.strokes + ' : ' + c.strokes;
      return;
    }
    s.turn = 1 - s.turn;
    if (s.b[s.turn].in) s.turn = 1 - s.turn;
    s.phase = 'aim';
    // прицел по умолчанию — на лунку
    const b = s.b[s.turn];
    const h = HOLES[s.hole];
    s.aim[s.turn] = Math.atan2(h.hole[1] - b.y, h.hole[0] - b.x);
  }

  const lastPtr = [null, null];
  function step(s, inputs, dt, fx) {
    const h = HOLES[s.hole];
    if (s.phase === 'next') {
      s.wait -= dt;
      if (s.wait <= 0) {
        if (s.hole + 1 >= HOLES.length) {
          s.phase = 'done';
          return;
        }
        s.hole++;
        const nh = HOLES[s.hole];
        s.b = [ball(nh, 0), ball(nh, 1)];
        // первым бьёт тот, кто прошёл прошлую лунку лучше
        const l = s.cards[0].length - 1;
        s.turn = s.cards[1][l] < s.cards[0][l] ? 1 : 0;
        s.phase = 'aim';
        s.aim = [0, 0].map((_, i) => Math.atan2(nh.hole[1] - s.b[i].y, nh.hole[0] - s.b[i].x));
        s.msg = 'Лунка ' + (s.hole + 1);
        s.wait = 1.2;
      }
      return;
    }
    if (s.msg && s.phase === 'aim') {
      s.wait -= dt;
      if (s.wait <= 0) s.msg = '';
    }
    if (s.phase === 'aim') {
      const inp = inputs[s.turn];
      const b = s.b[s.turn];
      const pt = inp.px !== null && inp.px !== undefined ? inp.px + ',' + inp.py : null;
      if (pt && pt !== lastPtr[s.turn] && Math.hypot(inp.px - b.x, inp.py - b.y) > 12) s.aim[s.turn] = Math.atan2(inp.py - b.y, inp.px - b.x);
      lastPtr[s.turn] = pt;
      if (inp.l) s.aim[s.turn] -= 1.6 * dt;
      if (inp.r) s.aim[s.turn] += 1.6 * dt;
      if (inp.u) s.aim[s.turn] -= 0.25 * dt;
      if (inp.d) s.aim[s.turn] += 0.25 * dt;
      if (inp.f) {
        s.charge += dt;
        const t = (s.charge / 1.4) % 2;
        s.power = t < 1 ? t : 2 - t;
      } else if (s.charge > 0) {
        const v = 40 + s.power * (VMAX - 40);
        b.lx = b.x;
        b.ly = b.y;
        b.vx = Math.cos(s.aim[s.turn]) * v;
        b.vy = Math.sin(s.aim[s.turn]) * v;
        b.strokes++;
        s.shots++;
        s.charge = 0;
        s.power = 0;
        s.phase = 'roll';
        s.msg = '';
        fx('click');
      }
      return;
    }
    if (s.phase === 'roll') {
      const b = s.b[s.turn];
      let ev = null;
      for (let k = 0; k < 4 && !ev; k++) ev = move(b, h, dt / 4) || ev;
      if (ev === 'wall') fx('bounce');
      if (ev === 'water') {
        fx('drop');
        b.x = b.lx;
        b.y = b.ly;
        b.vx = b.vy = 0;
        b.strokes++;
        s.msg = 'В воду! +1 удар';
        s.wait = 1.2;
      }
      if (ev === 'in') {
        b.in = true;
        b.vx = b.vy = 0;
        fx(b.strokes === 1 ? 'win' : 'coin');
        s.msg = b.strokes === 1 ? 'С одного удара!' : 'В лунке за ' + b.strokes;
        s.wait = 1.2;
      }
      if (!b.in && b.vx === 0 && b.vy === 0 && b.strokes >= MAXS) {
        b.in = true;
        b.strokes = MAXS + 1;
        s.msg = 'Лимит ударов: ' + (MAXS + 1);
        s.wait = 1.2;
      }
      if (b.in || (b.vx === 0 && b.vy === 0)) nextTurn(s);
    }
  }

  // ---------- компьютер ----------

  function simulate(s, i, aim, power) {
    const h = HOLES[s.hole];
    const b = { ...s.b[i] };
    const v = 40 + power * (VMAX - 40);
    b.vx = Math.cos(aim) * v;
    b.vy = Math.sin(aim) * v;
    for (let t = 0; t < 2400; t++) {
      const ev = move(b, h, 1 / 240);
      if (ev === 'in') return -1000;
      if (ev === 'water') return 5000;
      if (b.vx === 0 && b.vy === 0) break;
    }
    return fields[s.hole](b.x, b.y);
  }

  const plan = [{}, {}];
  function ai(s, side, level) {
    const inp = { u: false, d: false, l: false, r: false, f: false, px: null, py: null };
    if (s.turn !== side || s.phase !== 'aim') return inp;
    const st = plan[side];
    const key = s.shots + ':' + s.hole;
    if (st.key !== key) {
      st.key = key;
      st.wait = 0.7;
      const b = s.b[side];
      const h = HOLES[s.hole];
      const direct = Math.atan2(h.hole[1] - b.y, h.hole[0] - b.x);
      const tries = level === 'easy' ? 40 : level === 'normal' ? 120 : 300;
      let best = null;
      for (let k = 0; k < tries; k++) {
        const aim = k < tries / 3 ? direct + (Math.random() - 0.5) * 0.3 : Math.random() * Math.PI * 2;
        const power = Math.random();
        const v = simulate(s, side, aim, power);
        if (!best || v < best.v) best = { v, aim, power };
      }
      const noise = { easy: [0.14, 0.14], normal: [0.06, 0.07], hard: [0.025, 0.035] }[level];
      st.aim = best.aim + (Math.random() - 0.5) * noise[0];
      st.power = Math.max(0.02, Math.min(0.97, best.power + (Math.random() - 0.5) * noise[1]));
      st.charging = false;
    }
    if (st.wait > 0) {
      st.wait -= 1 / 60;
      return inp;
    }
    if (!st.charging) {
      let diff = st.aim - s.aim[side];
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > 0.06) {
        inp[diff > 0 ? 'r' : 'l'] = true;
        return inp;
      }
      s.aim[side] = st.aim;
      st.charging = true;
    }
    inp.f = s.power < st.power || s.charge === 0;
    return inp;
  }

  // ---------- отрисовка ----------

  const PAL = SG.colors.players; // [0] — синий, [1] — красный
  function draw(g, s) {
    const h = HOLES[s.hole];
    g.fillStyle = '#166534';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#22c55e';
    g.fillRect(6, 6, W - 12, H - 12);
    g.fillStyle = '#fde68a';
    h.sand.forEach((r) => {
      g.beginPath();
      g.roundRect(r[0], r[1], r[2], r[3], 14);
      g.fill();
    });
    g.fillStyle = '#38bdf8';
    h.water.forEach((r) => {
      g.beginPath();
      g.roundRect(r[0], r[1], r[2], r[3], 18);
      g.fill();
    });
    g.fillStyle = '#78350f';
    h.walls.forEach((r) => g.fillRect(r[0], r[1], r[2], r[3]));
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.beginPath();
    g.arc(h.start[0], h.start[1], 20, 0, Math.PI * 2);
    g.fill();
    // лунка и флажок
    g.fillStyle = '#111';
    g.beginPath();
    g.arc(h.hole[0], h.hole[1], HR, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#e5e7eb';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(h.hole[0], h.hole[1]);
    g.lineTo(h.hole[0], h.hole[1] - 40);
    g.stroke();
    g.fillStyle = '#f59e0b';
    g.beginPath();
    g.moveTo(h.hole[0], h.hole[1] - 40);
    g.lineTo(h.hole[0] + 20, h.hole[1] - 33);
    g.lineTo(h.hole[0], h.hole[1] - 26);
    g.fill();
    if (s.phase === 'aim') {
      const b = s.b[s.turn];
      const a = s.aim[s.turn];
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.setLineDash([5, 6]);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.lineTo(b.x + Math.cos(a) * 90, b.y + Math.sin(a) * 90);
      g.stroke();
      g.setLineDash([]);
      if (s.charge > 0) {
        g.strokeStyle = s.power > 0.8 ? '#ef4444' : '#facc15';
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(b.x, b.y);
        g.lineTo(b.x - Math.cos(a) * (15 + 60 * s.power), b.y - Math.sin(a) * (15 + 60 * s.power));
        g.stroke();
      }
    }
    s.b.forEach((b, i) => {
      if (b.in) return;
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.arc(b.x + 2, b.y + 2, BR, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(b.x, b.y, BR, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = PAL[i];
      g.lineWidth = 3;
      g.stroke();
    });
    if (s.msg) {
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(W / 2 - 170, 12, 340, 40);
      g.fillStyle = '#fff';
      g.font = '800 22px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(s.msg, W / 2, 40);
    }
  }

  const names = (v) => (v.mode === 'ai' ? ['вы', 'компьютер'] : v.mode === 'net' ? (v.me === 0 ? ['вы', 'соперник'] : ['соперник', 'вы']) : ['синий', 'красный']);
  const total = (s, i) => s.cards[i].reduce((a, b) => a + b, 0) + (s.phase === 'next' || s.phase === 'done' ? 0 : s.b[i].strokes);

  SG.rt({
    game: 'minigolf',
    W,
    H,
    sides: ['Синий мяч', 'Красный мяч'],
    intro: 'Цельтесь мышью или ← →, держите пробел — сила качается, отпустите — удар. ' + HOLES.length + ' лунок, меньше ударов — лучше.',
    create,
    step,
    ai,
    draw,
    pad: true,
    shared: true,
    pointer: 'xy',
    fireLabel: 'Удар',
    over(s) {
      if (s.phase !== 'done') return null;
      const a = total(s, 0);
      const b = total(s, 1);
      return { winner: a === b ? null : a < b ? 0 : 1, text: 'Ударов: ' + a + ' : ' + b + ' (по лункам: ' + s.cards[0].join('-') + ' и ' + s.cards[1].join('-') + ').' };
    },
    hud(s, v) {
      const n = names(v);
      const who = s.phase === 'aim' ? ' · бьёт ' + n[s.turn] : '';
      return 'Лунка ' + (s.hole + 1) + '/' + HOLES.length + ' · синий (' + n[0] + ') ' + total(s, 0) + ' : ' + total(s, 1) + ' красный (' + n[1] + ')' + who;
    },
  });
})();
