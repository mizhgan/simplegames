/* Пинбол-дуэль: у каждого пара флипперов на своём краю стола — не пропустите шар и забейте сопернику */
(() => {
  'use strict';

  const W = 420;
  const H = 640;
  const BR = 9;
  const FL = 80; // длина флиппера
  const FT = 7; // полутолщина
  const REST = 0.5;
  const UP = -0.45;
  const VMIN = 260;
  const VMAX = 760;
  const WIN = 5;
  const PX = [118, W - 118];
  const PY = H - 62;
  const BUMPERS = [
    { x: W / 2, y: H / 2, r: 26 },
    { x: W / 2 - 95, y: H / 2 - 70, r: 20 },
    { x: W / 2 + 95, y: H / 2 + 70, r: 20 },
    { x: W / 2 + 95, y: H / 2 - 70, r: 16 },
    { x: W / 2 - 95, y: H / 2 + 70, r: 16 },
  ];
  // направляющие к флипперам (низ) и их зеркала (верх)
  const GUIDES = [];
  [[0, H - 170, PX[0] - 4, PY - 2], [W, H - 170, PX[1] + 4, PY - 2]].forEach(([a, b, c, d]) => {
    GUIDES.push([a, b, c, d]);
    GUIDES.push([W - a, H - b, W - c, H - d]);
  });
  const AI = { easy: { miss: 0.3, early: 0.06, reach: 2 }, normal: { miss: 0.1, early: 0.04, reach: 6 }, hard: { miss: 0, early: 0.03, reach: 10 } };

  // флипперы: side 0 — низ, side 1 — верх; k 0 — левый по полю, 1 — правый
  function flippers() {
    const f = [];
    for (let side = 0; side < 2; side++) for (let k = 0; k < 2; k++) f.push({ side, k, a: 0, w: 0 });
    return f;
  }

  // геометрия флиппера: угол a — 0 покой, 1 поднят
  function geo(f) {
    const dir = f.k === 0 ? 1 : -1; // левый смотрит вправо
    const ang = REST + (UP - REST) * f.a;
    let px = PX[f.k];
    let py = PY;
    let cx = dir * Math.cos(ang);
    let cy = Math.sin(ang);
    if (f.side === 1) {
      px = W - px;
      py = H - py;
      cx = -cx;
      cy = -cy;
    }
    return { px, py, tx: px + cx * FL, ty: py + cy * FL };
  }

  function serve(s, toward) {
    const a = (Math.random() - 0.5) * 1.2;
    const dirY = toward === 0 ? 1 : -1;
    s.ball = { x: W / 2 + (Math.random() - 0.5) * 60, y: H / 2 + (toward === 0 ? 60 : -60), vx: Math.sin(a) * 260, vy: dirY * Math.cos(a) * 260 };
    s.pause = 1;
  }

  function create() {
    const s = { f: flippers(), score: [0, 0], ball: null, pause: 0, lit: BUMPERS.map(() => 0), msg: '', t: 0 };
    serve(s, Math.random() < 0.5 ? 0 : 1);
    return s;
  }

  function collideSeg(b, ax, ay, bx, by, rad, svx, svy, rest) {
    const dx = bx - ax;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy;
    let t = L2 ? ((b.x - ax) * dx + (b.y - ay) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + dx * t;
    const cy = ay + dy * t;
    const ex = b.x - cx;
    const ey = b.y - cy;
    const d = Math.hypot(ex, ey);
    if (d >= BR + rad || d === 0) return false;
    const nx = ex / d;
    const ny = ey / d;
    b.x = cx + nx * (BR + rad);
    b.y = cy + ny * (BR + rad);
    const rvx = b.vx - (svx ? svx(cx, cy) : 0);
    const rvy = b.vy - (svy ? svy(cx, cy) : 0);
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      b.vx -= (1 + rest) * vn * nx;
      b.vy -= (1 + rest) * vn * ny;
    }
    return true;
  }

  function step(s, inputs, dt, fx) {
    s.t += dt;
    s.lit = s.lit.map((x) => Math.max(0, x - dt));
    // флипперы
    s.f.forEach((f) => {
      const inp = inputs[f.side];
      const on = f.k === 0 ? inp.l || inp.u : inp.r || inp.f;
      const prevA = f.a;
      f.a = on ? Math.min(1, f.a + dt * 14) : Math.max(0, f.a - dt * 7);
      f.w = (f.a - prevA) / dt; // доля в секунду
      if (on && prevA === 0) fx('flip');
    });
    if (s.pause > 0) {
      s.pause -= dt;
      if (s.pause <= 0) s.msg = '';
      return;
    }
    const b = s.ball;
    const N = 8;
    for (let k = 0; k < N; k++) {
      const h = dt / N;
      b.x += b.vx * h;
      b.y += b.vy * h;
      if (b.x < BR) (b.x = BR), (b.vx = Math.abs(b.vx));
      if (b.x > W - BR) (b.x = W - BR), (b.vx = -Math.abs(b.vx));
      GUIDES.forEach((g) => collideSeg(b, g[0], g[1], g[2], g[3], 3, null, null, 0.7));
      s.f.forEach((f) => {
        const g = geo(f);
        // скорость точки флиппера: вращение вокруг оси
        const om = (UP - REST) * f.w * (f.k === 0 ? 1 : -1);
        const svx = (cx, cy) => -om * (cy - g.py);
        const svy = (cx, cy) => om * (cx - g.px);
        if (collideSeg(b, g.px, g.py, g.tx, g.ty, FT, svx, svy, 0.35) && f.w > 0) fx('hit');
      });
      BUMPERS.forEach((u, i) => {
        const dx = b.x - u.x;
        const dy = b.y - u.y;
        const d = Math.hypot(dx, dy);
        if (d < u.r + BR && d > 0) {
          const nx = dx / d;
          const ny = dy / d;
          b.x = u.x + nx * (u.r + BR);
          b.y = u.y + ny * (u.r + BR);
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            b.vx -= 2 * vn * nx;
            b.vy -= 2 * vn * ny;
          }
          b.vx += nx * 90;
          b.vy += ny * 90;
          s.lit[i] = 0.25;
          fx('bounce');
        }
      });
    }
    // скорость в пределах, шар не должен «залипать» поперёк стола
    let sp = Math.hypot(b.vx, b.vy);
    if (sp > VMAX) {
      b.vx *= VMAX / sp;
      b.vy *= VMAX / sp;
    }
    if (Math.abs(b.vy) < 70) b.vy = (b.vy >= 0 ? 1 : -1) * 70;
    sp = Math.hypot(b.vx, b.vy);
    if (sp < VMIN) {
      b.vx *= VMIN / sp;
      b.vy *= VMIN / sp;
    }
    if (b.y > H + 20 || b.y < -20) {
      const scorer = b.y > H ? 1 : 0;
      s.score[scorer]++;
      s.msg = (scorer ? 'Красный' : 'Синий') + ' забил!';
      fx('coin');
      serve(s, 1 - scorer);
      s.pause = 1.2;
    }
  }

  const segDist = (x, y, q) => {
    const dx = q.tx - q.px;
    const dy = q.ty - q.py;
    const t = Math.max(0, Math.min(1, ((x - q.px) * dx + (y - q.py) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - q.px - dx * t, y - q.py - dy * t);
  };

  const mem = [{}, {}];
  function ai(s, side, level) {
    const inp = { u: false, d: false, l: false, r: false, f: false, px: null, py: null };
    const b = s.ball;
    const c = AI[level];
    const m = mem[side];
    const toward = side === 0 ? b.vy > 0 : b.vy < 0;
    // «решение» — пропустить ли этот подход шара (для слабых уровней)
    const approach = Math.floor(s.t / 1.5);
    if (m.ap !== approach) {
      m.ap = approach;
      m.skip = Math.random() < c.miss;
      m.la = 0.03 + Math.random() * c.early;
    }
    [0, 1].forEach((k) => {
      const f = s.f[side * 2 + k];
      const q = geo({ ...f, a: 0.4 });
      let hit = false;
      // смотрим на несколько мгновений вперёд: шар подлетит к флипперу?
      for (let t = 0; t <= m.la + 0.001; t += 0.01) {
        if (segDist(b.x + b.vx * t, b.y + b.vy * t, q) < BR + FT + c.reach) hit = true;
      }
      inp[k === 0 ? 'l' : 'r'] = toward && hit && !m.skip;
    });
    return inp;
  }

  const PAL = ['#3b82f6', '#ef4444'];
  function draw(g, s, v) {
    g.fillStyle = '#0f172a';
    g.fillRect(0, 0, W, H);
    // зоны ворот
    [0, 1].forEach((side) => {
      g.fillStyle = side ? 'rgba(239,68,68,0.18)' : 'rgba(59,130,246,0.18)';
      g.fillRect(0, side ? 0 : H - 36, W, 36);
    });
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.setLineDash([8, 10]);
    g.beginPath();
    g.moveTo(0, H / 2);
    g.lineTo(W, H / 2);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = '#94a3b8';
    g.lineWidth = 6;
    g.lineCap = 'round';
    GUIDES.forEach((q) => {
      g.beginPath();
      g.moveTo(q[0], q[1]);
      g.lineTo(q[2], q[3]);
      g.stroke();
    });
    BUMPERS.forEach((u, i) => {
      g.fillStyle = s.lit[i] > 0 ? '#fde047' : '#a855f7';
      g.beginPath();
      g.arc(u.x, u.y, u.r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.arc(u.x, u.y, u.r * 0.5, 0, Math.PI * 2);
      g.fill();
    });
    s.f.forEach((f) => {
      const q = geo(f);
      g.strokeStyle = PAL[f.side];
      g.lineWidth = FT * 2;
      g.beginPath();
      g.moveTo(q.px, q.py);
      g.lineTo(q.tx, q.ty);
      g.stroke();
      g.fillStyle = '#e2e8f0';
      g.beginPath();
      g.arc(q.px, q.py, 4, 0, Math.PI * 2);
      g.fill();
    });
    g.lineCap = 'butt';
    const b = s.ball;
    const grad = g.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, BR);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(1, '#94a3b8');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(b.x, b.y, BR, 0, Math.PI * 2);
    g.fill();
    // счёт: у гостя поле повёрнуто — текст пишем в его ориентации
    g.save();
    if (v.flip) {
      g.translate(W, H);
      g.rotate(Math.PI);
    }
    g.textAlign = 'center';
    g.font = '800 40px system-ui, sans-serif';
    const top = v.flip ? 0 : 1;
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillText(String(s.score[top]), W / 2, H / 2 - 110);
    g.fillText(String(s.score[1 - top]), W / 2, H / 2 + 140);
    if (s.msg) {
      g.fillStyle = '#fff';
      g.font = '800 26px system-ui, sans-serif';
      g.fillText(s.msg, W / 2, H / 2 + 60);
    }
    g.restore();
  }

  const names = (v) => (v.mode === 'ai' ? ['вы', 'компьютер'] : v.mode === 'net' ? (v.me === 0 ? ['вы', 'соперник'] : ['соперник', 'вы']) : ['синий', 'красный']);

  SG.rt({
    game: 'pinball',
    W,
    H,
    sides: ['Синие флипперы', 'Красные флипперы'],
    intro: '← и → (или A и D) — левый и правый флипперы. Не пропустите шар на свою сторону! До ' + WIN + ' очков.',
    create,
    step,
    ai,
    draw,
    pad: true,
    flipGuest: true,
    fireLabel: '▶',
    over: (s) => (s.score[0] >= WIN || s.score[1] >= WIN ? { winner: s.score[0] >= WIN ? 0 : 1, text: 'Счёт ' + s.score[0] + ' : ' + s.score[1] + '.' } : null),
    hud(s, v) {
      const n = names(v);
      return 'Синий (' + n[0] + ') ' + s.score[0] + ' : ' + s.score[1] + ' красный (' + n[1] + ')';
    },
  });
})();
