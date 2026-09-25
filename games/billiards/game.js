/* Бильярд («Американка»): любой шар в любую лузу, кто первым забьёт восемь */
(() => {
  'use strict';

  const W = 720;
  const H = 400;
  const M = 34; // борт
  const BR = 9;
  const PR = 19; // радиус лузы
  const WIN = 8;
  const FRICTION = 130; // замедление, px/с²
  const MAXV = 1500;
  const POCKETS = [
    [M - 6, M - 6], [W / 2, M - 10], [W - M + 6, M - 6],
    [M - 6, H - M + 6], [W / 2, H - M + 10], [W - M + 6, H - M + 6],
  ];
  const HEAD = [M + (W - 2 * M) * 0.25, H / 2];
  const FOOT = [M + (W - 2 * M) * 0.72, H / 2];
  const COLORS = ['#fff', '#fbbf24', '#2563eb', '#dc2626', '#7c3aed', '#f97316', '#16a34a', '#7f1d1d', '#111', '#fbbf24', '#2563eb', '#dc2626', '#7c3aed', '#f97316', '#16a34a', '#7f1d1d'];

  function rack() {
    const balls = [{ x: HEAD[0], y: HEAD[1], vx: 0, vy: 0, in: false }];
    const order = SG.shuffle([...Array(15)].map((_, i) => i + 1));
    let k = 0;
    for (let row = 0; row < 5; row++) {
      for (let j = 0; j <= row; j++) {
        balls[order[k++]] = { x: FOOT[0] + row * BR * 1.75, y: FOOT[1] + (j - row / 2) * BR * 2.02, vx: 0, vy: 0, in: false };
      }
    }
    return balls;
  }

  function create() {
    return { balls: rack(), turn: 0, phase: 'aim', aim: 0, power: 0, charge: 0, score: [0, 0], potted: [[], []], shotPots: 0, scratch: false, msg: '', id: Math.floor(Math.random() * 1e9), shots: 0 };
  }

  function free(balls, x, y) {
    return balls.every((b) => b.in || Math.hypot(b.x - x, b.y - y) > BR * 2.1);
  }

  function spot(balls, b, [x, y]) {
    // ставим шар на точку или правее/левее, если она занята
    for (let d = 0; d < 300; d += 4) {
      for (const sx of [1, -1]) {
        if (free(balls, x + d * sx, y)) {
          Object.assign(b, { x: x + d * sx, y, vx: 0, vy: 0, in: false });
          return;
        }
      }
    }
  }

  // ---------- физика ----------

  // один шаг; возвращает забитые шары и было ли касание шаров
  function physics(balls, dt, ev) {
    const n = balls.length;
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (b.in) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0) {
        const ns = Math.max(0, sp - FRICTION * dt - sp * 0.25 * dt);
        b.vx *= ns / sp;
        b.vy *= ns / sp;
      }
      // лузы
      if (POCKETS.some(([px, py]) => Math.hypot(b.x - px, b.y - py) < PR)) {
        b.in = true;
        b.vx = b.vy = 0;
        ev.pots.push(i);
        continue;
      }
      // борта (у луз бортов нет)
      const nearPocket = POCKETS.some(([px, py]) => Math.hypot(b.x - px, b.y - py) < PR + BR + 4);
      if (!nearPocket) {
        if (b.x < M + BR) {
          b.x = M + BR;
          b.vx = Math.abs(b.vx) * 0.78;
          ev.rail = true;
        }
        if (b.x > W - M - BR) {
          b.x = W - M - BR;
          b.vx = -Math.abs(b.vx) * 0.78;
          ev.rail = true;
        }
        if (b.y < M + BR) {
          b.y = M + BR;
          b.vy = Math.abs(b.vy) * 0.78;
          ev.rail = true;
        }
        if (b.y > H - M - BR) {
          b.y = H - M - BR;
          b.vy = -Math.abs(b.vy) * 0.78;
          ev.rail = true;
        }
      } else {
        // в створе лузы шар может уйти в неё, но не за пределы стола
        b.x = Math.max(M - 20, Math.min(W - M + 20, b.x));
        b.y = Math.max(M - 20, Math.min(H - M + 20, b.y));
      }
    }
    for (let i = 0; i < n; i++) {
      const a = balls[i];
      if (a.in) continue;
      for (let j = i + 1; j < n; j++) {
        const b = balls[j];
        if (b.in) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 4 * BR * BR || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const over = (2 * BR - d) / 2;
        a.x -= nx * over;
        a.y -= ny * over;
        b.x += nx * over;
        b.y += ny * over;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 0) {
          const k = rel * 0.96;
          a.vx -= k * nx;
          a.vy -= k * ny;
          b.vx += k * nx;
          b.vy += k * ny;
          if (i === 0 || j === 0) ev.hit = true;
          ev.click = Math.max(ev.click || 0, rel);
        }
      }
    }
  }

  const moving = (balls) => balls.some((b) => !b.in && (Math.abs(b.vx) > 0.5 || Math.abs(b.vy) > 0.5));

  function shoot(s, power) {
    const cue = s.balls[0];
    const v = 120 + power * (MAXV - 120);
    cue.vx = Math.cos(s.aim) * v;
    cue.vy = Math.sin(s.aim) * v;
    s.phase = 'roll';
    s.shotPots = 0;
    s.scratch = false;
    s.shots++;
    s.msg = '';
  }

  const lastPtr = [null, null];
  function step(s, inputs, dt, fx) {
    if (s.phase === 'aim') {
      const inp = inputs[s.turn];
      const pt = inp.px !== null && inp.px !== undefined ? inp.px + ',' + inp.py : null;
      if (pt && pt !== lastPtr[s.turn]) {
        const cue = s.balls[0];
        s.aim = Math.atan2(inp.py - cue.y, inp.px - cue.x);
      }
      lastPtr[s.turn] = pt;
      if (inp.l) s.aim -= 1.1 * dt;
      if (inp.r) s.aim += 1.1 * dt;
      if (inp.u) s.aim -= 0.12 * dt;
      if (inp.d) s.aim += 0.12 * dt;
      if (inp.f) {
        // сила «качается» туда-обратно, пока держите удар
        s.charge += dt;
        const t = (s.charge / 1.4) % 2;
        s.power = t < 1 ? t : 2 - t;
      } else if (s.charge > 0) {
        shoot(s, s.power);
        s.charge = 0;
        fx('hit');
      }
      return;
    }
    if (s.phase === 'roll') {
      const ev = { pots: [] };
      for (let k = 0; k < 8; k++) physics(s.balls, dt / 8, ev);
      if (ev.click > 150) fx('tick');
      ev.pots.forEach((i) => {
        if (i === 0) s.scratch = true;
        else {
          s.potted[s.turn].push(i);
          s.score[s.turn]++;
          s.shotPots++;
        }
        fx('coin');
      });
      if (!moving(s.balls)) {
        s.balls.forEach((b) => {
          b.vx = 0;
          b.vy = 0;
        });
        endShot(s, fx);
      }
    }
  }

  function endShot(s, fx) {
    s.phase = 'aim';
    s.power = 0;
    s.charge = 0;
    if (s.scratch) {
      // биток в лузе: возвращаем его, а один забитый шар игрока — на стол
      spot(s.balls, s.balls[0], HEAD);
      const back = s.potted[s.turn].pop();
      if (back) {
        s.score[s.turn]--;
        spot(s.balls, s.balls[back], FOOT);
      }
      s.msg = 'Биток в лузе — штраф' + (back ? ': один шар вернулся на стол' : '');
      s.turn = 1 - s.turn;
      fx('error');
    } else if (s.shotPots) {
      s.msg = 'Забито: ' + s.shotPots + ' — бейте ещё';
    } else {
      s.msg = '';
      s.turn = 1 - s.turn;
    }
    // целимся по умолчанию в ближайший шар
    const cue = s.balls[0];
    let best = null;
    s.balls.forEach((b, i) => {
      if (!i || b.in) return;
      const d = Math.hypot(b.x - cue.x, b.y - cue.y);
      if (!best || d < best.d) best = { d, b };
    });
    if (best) s.aim = Math.atan2(best.b.y - cue.y, best.b.x - cue.x);
  }

  // ---------- компьютер: перебирает удары в лузы и проверяет их на модели ----------

  function clone(balls) {
    return balls.map((b) => ({ x: b.x, y: b.y, vx: 0, vy: 0, in: b.in }));
  }

  function simulate(balls, aim, power) {
    const bs = clone(balls);
    const v = 120 + power * (MAXV - 120);
    bs[0].vx = Math.cos(aim) * v;
    bs[0].vy = Math.sin(aim) * v;
    const ev = { pots: [] };
    for (let t = 0; t < 900 && moving(bs); t++) for (let k = 0; k < 4; k++) physics(bs, 1 / 240, ev);
    const scratch = ev.pots.includes(0);
    const pots = ev.pots.filter((i) => i).length;
    return { score: pots * 10 - (scratch ? 25 : 0) + (ev.hit ? 1 : -3), pots, scratch };
  }

  function segClear(balls, x0, y0, x1, y1, skip) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L2 = dx * dx + dy * dy;
    return balls.every((b, i) => {
      if (b.in || skip.includes(i)) return true;
      const t = Math.max(0, Math.min(1, ((b.x - x0) * dx + (b.y - y0) * dy) / L2));
      return Math.hypot(x0 + dx * t - b.x, y0 + dy * t - b.y) > BR * 2 - 0.5;
    });
  }

  function plan(s, level) {
    const balls = s.balls;
    const cue = balls[0];
    const cands = [];
    balls.forEach((b, i) => {
      if (!i || b.in) return;
      POCKETS.forEach(([px, py]) => {
        const dx = px - b.x;
        const dy = py - b.y;
        const d = Math.hypot(dx, dy);
        const gx = b.x - (dx / d) * BR * 2;
        const gy = b.y - (dy / d) * BR * 2;
        const ax = gx - cue.x;
        const ay = gy - cue.y;
        const ad = Math.hypot(ax, ay);
        const cut = Math.acos(Math.max(-1, Math.min(1, (ax * dx + ay * dy) / (ad * d))));
        if (cut > 1.3) return;
        if (!segClear(balls, cue.x, cue.y, gx, gy, [0, i]) || !segClear(balls, b.x, b.y, px, py, [i])) return;
        cands.push({ aim: Math.atan2(ay, ax), cost: cut * 2 + (d + ad) / 400 });
      });
    });
    cands.sort((a, b) => a.cost - b.cost);
    let best = null;
    for (const c of cands.slice(0, level === 'easy' ? 3 : 10)) {
      for (const pw of [0.35, 0.55, 0.8]) {
        const r = simulate(balls, c.aim, pw);
        if (!best || r.score > best.score) best = { ...r, aim: c.aim, power: pw };
      }
    }
    if (!best || best.score < 5) {
      // забить не выходит — просто бьём по ближайшему шару
      let near = null;
      balls.forEach((b, i) => {
        if (!i || b.in) return;
        const d = Math.hypot(b.x - cue.x, b.y - cue.y);
        if ((!near || d < near.d) && segClear(balls, cue.x, cue.y, b.x, b.y, [0, i])) near = { d, b };
      });
      const t = near ? near.b : balls.find((b, i) => i && !b.in);
      const aim = Math.atan2(t.y - cue.y, t.x - cue.x);
      if (!best || simulate(balls, aim, 0.5).score > best.score) best = { aim, power: 0.5 };
    }
    const noise = { easy: 0.05, normal: 0.016, hard: 0.004 }[level];
    return { aim: best.aim + (Math.random() * 2 - 1) * noise, power: best.power };
  }

  const aiState = [{}, {}];
  function ai(s, side, level) {
    const inp = { u: false, d: false, l: false, r: false, f: false, px: null, py: null };
    if (s.phase !== 'aim' || s.turn !== side) return inp;
    const st = aiState[side];
    const key = s.id + ':' + s.shots;
    if (st.key !== key) {
      st.key = key;
      st.plan = plan(s, level);
      st.wait = 0.8;
      st.charging = false;
    }
    if (st.wait > 0) {
      st.wait -= 1 / 60;
      return inp;
    }
    let diff = st.plan.aim - s.aim;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (!st.charging && Math.abs(diff) > 0.03) {
      inp[diff > 0 ? 'r' : 'l'] = true;
      return inp;
    }
    if (!st.charging && Math.abs(diff) > 0.0005) {
      // доводка — сразу ставим точный угол, как будто аккуратно довели
      s.aim = st.plan.aim;
    }
    st.charging = true;
    inp.f = s.power < st.plan.power || s.charge === 0;
    return inp;
  }

  // ---------- отрисовка ----------

  function ball(g, b, i) {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.arc(b.x + 2, b.y + 2, BR, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = COLORS[i];
    g.beginPath();
    g.arc(b.x, b.y, BR, 0, Math.PI * 2);
    g.fill();
    if (i > 8) {
      // «полосатые»: белые шапочки
      g.save();
      g.clip();
      g.fillStyle = '#fff';
      g.fillRect(b.x - BR, b.y - BR, BR * 2, 4);
      g.fillRect(b.x - BR, b.y + BR - 4, BR * 2, 4);
      g.restore();
    }
    if (i) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(b.x, b.y, 4.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111';
      g.font = '700 6.5px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(i), b.x, b.y + 0.5);
    }
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.beginPath();
    g.arc(b.x - 3, b.y - 3, 2.2, 0, Math.PI * 2);
    g.fill();
  }

  // луч прицела до первого шара
  function aimRay(s) {
    const cue = s.balls[0];
    const dx = Math.cos(s.aim);
    const dy = Math.sin(s.aim);
    let best = null;
    s.balls.forEach((b, i) => {
      if (!i || b.in) return;
      const fx = b.x - cue.x;
      const fy = b.y - cue.y;
      const t = fx * dx + fy * dy;
      if (t <= 0) return;
      const perp = fx * fx + fy * fy - t * t;
      const r2 = 4 * BR * BR;
      if (perp > r2) return;
      const hit = t - Math.sqrt(r2 - perp);
      if (!best || hit < best.t) best = { t: hit, b };
    });
    if (best) return { x: cue.x + dx * best.t, y: cue.y + dy * best.t, b: best.b };
    // до борта
    let t = 2000;
    if (dx > 0) t = Math.min(t, (W - M - BR - cue.x) / dx);
    if (dx < 0) t = Math.min(t, (M + BR - cue.x) / dx);
    if (dy > 0) t = Math.min(t, (H - M - BR - cue.y) / dy);
    if (dy < 0) t = Math.min(t, (M + BR - cue.y) / dy);
    return { x: cue.x + dx * t, y: cue.y + dy * t, b: null };
  }

  function draw(g, s, v) {
    g.fillStyle = '#5b3a1e';
    g.beginPath();
    g.roundRect(0, 0, W, H, 18);
    g.fill();
    g.fillStyle = '#0f7a43';
    g.fillRect(M - 8, M - 8, W - 2 * M + 16, H - 2 * M + 16);
    g.fillStyle = '#12924f';
    g.fillRect(M, M, W - 2 * M, H - 2 * M);
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(HEAD[0], M);
    g.lineTo(HEAD[0], H - M);
    g.stroke();
    [HEAD, FOOT].forEach(([x, y]) => {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.arc(x, y, 2, 0, Math.PI * 2);
      g.fill();
    });
    POCKETS.forEach(([x, y]) => {
      g.fillStyle = '#0a0a0a';
      g.beginPath();
      g.arc(x, y, PR - 1, 0, Math.PI * 2);
      g.fill();
    });
    s.balls.forEach((b, i) => !b.in && ball(g, b, i));
    if (s.phase === 'aim' && !s.balls[0].in) {
      const cue = s.balls[0];
      const r = aimRay(s);
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.setLineDash([5, 6]);
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(cue.x, cue.y);
      g.lineTo(r.x, r.y);
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.beginPath();
      g.arc(r.x, r.y, BR, 0, Math.PI * 2);
      g.stroke();
      if (r.b) {
        // куда покатится прицельный шар
        const nx = r.b.x - r.x;
        const ny = r.b.y - r.y;
        const nd = Math.hypot(nx, ny) || 1;
        g.strokeStyle = 'rgba(255,255,255,0.4)';
        g.beginPath();
        g.moveTo(r.b.x, r.b.y);
        g.lineTo(r.b.x + (nx / nd) * 60, r.b.y + (ny / nd) * 60);
        g.stroke();
      }
      // кий
      const back = 14 + s.power * 60;
      const ca = Math.cos(s.aim);
      const sa = Math.sin(s.aim);
      g.strokeStyle = '#d6b27c';
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cue.x - ca * back, cue.y - sa * back);
      g.lineTo(cue.x - ca * (back + 230), cue.y - sa * (back + 230));
      g.stroke();
      g.strokeStyle = '#3b2412';
      g.beginPath();
      g.moveTo(cue.x - ca * (back + 150), cue.y - sa * (back + 150));
      g.lineTo(cue.x - ca * (back + 230), cue.y - sa * (back + 230));
      g.stroke();
      g.lineCap = 'butt';
    }
    // шкала силы и забитые шары
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(W / 2 - 200, H - 20, 120, 8);
    g.fillStyle = s.power > 0.8 ? '#ef4444' : '#fbbf24';
    g.fillRect(W / 2 - 200, H - 20, 120 * s.power, 8);
    [0, 1].forEach((p) => {
      s.potted[p].forEach((i, k) => ball(g, { x: p ? W - 24 - k * 20 : 24 + k * 20, y: 14 }, i));
    });
    if (s.msg) {
      g.fillStyle = '#fff';
      g.font = '700 13px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(s.msg, W / 2, 16);
    }
    void v;
  }

  const names = (v) => (v.mode === 'ai' ? ['вы', 'компьютер'] : v.mode === 'net' ? (v.me === 0 ? ['вы', 'соперник'] : ['соперник', 'вы']) : ['игрок 1', 'игрок 2']);

  SG.rt({
    game: 'billiards',
    W,
    H,
    sides: ['Первый игрок', 'Второй игрок'],
    intro: 'Целиться — мышью или ← →, держите пробел, чтобы набрать силу, отпустите — удар. Первым забейте ' + WIN + ' шаров.',
    create,
    step,
    ai,
    draw,
    pad: true,
    shared: true,
    pointer: 'xy',
    fireLabel: 'Удар',
    over(s) {
      if (s.phase !== 'aim') return null;
      const w = s.score[0] >= WIN ? 0 : s.score[1] >= WIN ? 1 : s.balls.every((b, i) => !i || b.in) ? (s.score[0] === s.score[1] ? null : s.score[0] > s.score[1] ? 0 : 1) : undefined;
      return w === undefined ? null : { winner: w, text: 'Счёт ' + s.score[0] + ' : ' + s.score[1] + '.' };
    },
    hud(s, v) {
      const n = names(v);
      const who = s.phase === 'aim' ? ' · бьёт ' + n[s.turn] : '';
      return n[0][0].toUpperCase() + n[0].slice(1) + ': ' + s.score[0] + ' · ' + n[1] + ': ' + s.score[1] + ' (до ' + WIN + ')' + who;
    },
    snapshot: (s) => ({
      b: s.balls.map((b) => (b.in ? 0 : [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10])),
      t: s.turn, ph: s.phase, a: s.aim, pw: s.power, sc: s.score, po: s.potted, m: s.msg,
    }),
    restore: (x) => ({
      balls: x.b.map((b) => (b ? { x: b[0], y: b[1], vx: 0, vy: 0, in: false } : { x: 0, y: 0, vx: 0, vy: 0, in: true })),
      turn: x.t, phase: x.ph, aim: x.a, power: x.pw, score: x.sc, potted: x.po, msg: x.m,
    }),
  });
})();
