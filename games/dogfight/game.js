/* Воздушный бой: два самолёта, вид сверху — зайдите в хвост и собьёте соперника */
(() => {
  'use strict';

  const W = 720;
  const H = 450;
  const WIN = 5;
  const HP = 3;
  const TURN = 3.0; // рад/с
  const SPEED = [110, 170, 240]; // медленно / обычно / форсаж
  const BULLET = 480;
  const COOLDOWN = 0.22;
  const AI = { easy: { aim: 0.35, react: 0.5, fire: 0.5 }, normal: { aim: 0.15, react: 0.8, fire: 0.8 }, hard: { aim: 0.05, react: 1, fire: 1 } };

  function plane(side) {
    return { x: side ? W - 90 : 90, y: side ? 90 : H - 90, a: side ? Math.PI * 0.75 : -Math.PI * 0.25, hp: HP, cd: 0, dead: 0, v: SPEED[1] };
  }

  function create() {
    const s = { p: [plane(0), plane(1)], bullets: [], score: [0, 0], booms: [], clouds: [], t: 0 };
    for (let k = 0; k < 6; k++) s.clouds.push({ x: Math.random() * W, y: Math.random() * H, r: 30 + Math.random() * 40 });
    return s;
  }

  const wrap = (v, m) => ((v % m) + m) % m;
  // кратчайшая разность с учётом «сквозных» краёв
  const dwrap = (d, m) => (d > m / 2 ? d - m : d < -m / 2 ? d + m : d);

  function step(s, inputs, dt, fx) {
    s.t += dt;
    s.p.forEach((p, i) => {
      if (p.dead > 0) {
        p.dead -= dt;
        if (p.dead <= 0) Object.assign(p, plane(i));
        return;
      }
      const inp = inputs[i];
      if (inp.l) p.a -= TURN * dt;
      if (inp.r) p.a += TURN * dt;
      const target = inp.u ? SPEED[2] : inp.d ? SPEED[0] : SPEED[1];
      p.v += (target - p.v) * Math.min(1, dt * 2);
      p.x = wrap(p.x + Math.cos(p.a) * p.v * dt, W);
      p.y = wrap(p.y + Math.sin(p.a) * p.v * dt, H);
      p.cd -= dt;
      if (inp.f && p.cd <= 0) {
        p.cd = COOLDOWN;
        s.bullets.push({ x: p.x + Math.cos(p.a) * 18, y: p.y + Math.sin(p.a) * 18, vx: Math.cos(p.a) * BULLET + Math.cos(p.a) * p.v, vy: Math.sin(p.a) * BULLET + Math.sin(p.a) * p.v, life: 1.1, by: i });
        fx('tick');
      }
    });
    s.bullets = s.bullets.filter((b) => {
      b.x = wrap(b.x + b.vx * dt, W);
      b.y = wrap(b.y + b.vy * dt, H);
      b.life -= dt;
      const t = s.p[1 - b.by];
      if (t.dead <= 0 && Math.hypot(dwrap(b.x - t.x, W), dwrap(b.y - t.y, H)) < 14) {
        t.hp--;
        fx('hit');
        if (t.hp <= 0) {
          t.dead = 1.5;
          s.score[b.by]++;
          s.booms.push({ x: t.x, y: t.y, t: 0.8 });
          fx('explode');
        }
        return false;
      }
      return b.life > 0;
    });
    // столкновение самолётов — оба теряют жизнь
    const [a, c] = s.p;
    if (a.dead <= 0 && c.dead <= 0 && Math.hypot(dwrap(a.x - c.x, W), dwrap(a.y - c.y, H)) < 22) {
      a.hp = c.hp = 0;
      a.dead = c.dead = 1.5;
      s.booms.push({ x: a.x, y: a.y, t: 0.8 });
      fx('explode');
    }
    s.booms = s.booms.filter((b) => (b.t -= dt) > 0);
  }

  const aiMem = [{}, {}];
  function ai(s, side, level) {
    const inp = { u: false, d: false, l: false, r: false, f: false, px: null, py: null };
    const me = s.p[side];
    const o = s.p[1 - side];
    if (me.dead > 0) return inp;
    const cfg = AI[level];
    const mem = aiMem[side];
    if (!mem.t || s.t - mem.t > 0.25 / cfg.react || s.t < mem.t) {
      mem.t = s.t;
      mem.noise = (Math.random() - 0.5) * cfg.aim * 2;
    }
    let dx = dwrap(o.x - me.x, W);
    let dy = dwrap(o.y - me.y, H);
    const dist = Math.hypot(dx, dy);
    // упреждение
    const tt = dist / (BULLET + me.v);
    dx += Math.cos(o.a) * o.v * tt;
    dy += Math.sin(o.a) * o.v * tt;
    let want = Math.atan2(dy, dx) + mem.noise;
    if (o.dead > 0) want = me.a + 0.3;
    let diff = want - me.a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (diff > 0.05) inp.r = true;
    if (diff < -0.05) inp.l = true;
    inp.u = dist > 260;
    inp.d = dist < 90 && Math.abs(diff) > 1;
    inp.f = o.dead <= 0 && Math.abs(diff) < 0.18 && dist < 360 && Math.random() < cfg.fire;
    return inp;
  }

  const PAL = SG.colors.players; // [0] — синий, [1] — красный
  function drawPlane(g, p, col) {
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.a);
    g.scale(1.3, 1.3);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.beginPath();
    g.ellipse(6, 10, 16, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(18, 0);
    g.lineTo(-12, -6);
    g.lineTo(-14, 0);
    g.lineTo(-12, 6);
    g.closePath();
    g.fill();
    g.fillRect(-2, -16, 8, 32); // крылья
    g.fillRect(-14, -7, 4, 14); // хвост
    g.fillStyle = '#fff';
    g.fillRect(8, -2, 5, 4);
    g.restore();
  }

  function draw(g, s, v) {
    g.fillStyle = '#7dd3fc';
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    s.clouds.forEach((c) => {
      g.beginPath();
      g.ellipse(c.x, c.y, c.r, c.r * 0.55, 0, 0, Math.PI * 2);
      g.ellipse(c.x + c.r * 0.6, c.y + 5, c.r * 0.7, c.r * 0.45, 0, 0, Math.PI * 2);
      g.fill();
    });
    g.fillStyle = '#111';
    s.bullets.forEach((b) => g.fillRect(b.x - 2, b.y - 2, 4, 4));
    s.p.forEach((p, i) => {
      if (p.dead > 0) return;
      // рисуем и «призраки» у краёв, чтобы самолёт был виден при переходе
      for (const ox of [0, W, -W]) for (const oy of [0, H, -H]) {
        if ((ox && Math.abs(p.x + ox - W / 2) > W / 2 + 30) || (oy && Math.abs(p.y + oy - H / 2) > H / 2 + 30)) continue;
        drawPlane(g, { x: p.x + ox, y: p.y + oy, a: p.a }, PAL[i]);
      }
      // полоска жизней
      for (let k = 0; k < HP; k++) {
        g.fillStyle = k < p.hp ? PAL[i] : 'rgba(0,0,0,0.2)';
        g.fillRect(p.x - 13 + k * 9, p.y - 26, 7, 4);
      }
      if (v.me === i && v.mode !== 'pvp') {
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(p.x, p.y, 26, 0, Math.PI * 2);
        g.stroke();
      }
    });
    s.booms.forEach((b) => {
      g.fillStyle = 'rgba(251,146,60,' + b.t + ')';
      g.beginPath();
      g.arc(b.x, b.y, 40 * (1 - b.t) + 10, 0, Math.PI * 2);
      g.fill();
    });
  }

  const names = (v) => (v.mode === 'ai' ? ['вы', 'компьютер'] : v.mode === 'net' ? (v.me === 0 ? ['вы', 'соперник'] : ['соперник', 'вы']) : ['синий', 'красный']);

  SG.rt({
    game: 'dogfight',
    W,
    H,
    sides: ['Синий самолёт', 'Красный самолёт'],
    intro: '← → — повороты, ↑ — форсаж, ↓ — сбросить скорость, пробел — огонь. До ' + WIN + ' сбитых.',
    create,
    step,
    ai,
    draw,
    pad: true,
    fireLabel: '🔫',
    over: (s) => (s.score[0] >= WIN || s.score[1] >= WIN ? { winner: s.score[0] >= WIN ? (s.score[1] >= WIN ? null : 0) : 1, text: 'Сбито ' + s.score[0] + ' : ' + s.score[1] + '.' } : null),
    hud(s, v) {
      const n = names(v);
      return 'Синий (' + n[0] + ') ' + s.score[0] + ' : ' + s.score[1] + ' красный (' + n[1] + ')';
    },
  });
})();
