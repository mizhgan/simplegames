/* Артиллерия: два танка на холмах стреляют по очереди — с учётом ветра */
(() => {
  'use strict';

  const W = 720;
  const H = 420;
  const G = 300; // гравитация
  const R = 32; // радиус взрыва
  const DMG = 50;
  const TANK_W = 26;

  function terrain() {
    const k = [1, 2, 3, 5].map(() => [Math.random() * 6.28, 0.5 + Math.random()]);
    const base = H * (0.55 + Math.random() * 0.12);
    const hill = 60 + Math.random() * 60;
    const g = [];
    for (let x = 0; x < W; x++) {
      const t = x / W;
      let y = base;
      y -= Math.sin(t * Math.PI * 2 * 1 + k[0][0]) * 40 * k[0][1];
      y -= Math.sin(t * Math.PI * 2 * 2 + k[1][0]) * 28 * k[1][1];
      y -= Math.sin(t * Math.PI * 2 * 3.3 + k[2][0]) * 14 * k[2][1];
      // горка посередине, чтобы не стрелять прямой наводкой
      y -= Math.exp(-(((t - 0.5) / 0.12) ** 2)) * hill;
      g.push(Math.round(Math.max(90, Math.min(H - 20, y))));
    }
    return g;
  }

  function settle(s) {
    s.tanks.forEach((t) => {
      const x = Math.round(t.x);
      let y = H;
      for (let dx = -TANK_W / 2; dx <= TANK_W / 2; dx++) y = Math.min(y, s.ground[Math.max(0, Math.min(W - 1, x + dx))]);
      t.y = y;
    });
  }

  function newWind(s) {
    s.wind = Math.round((Math.random() * 2 - 1) * 70);
  }

  function create() {
    const s = {
      ground: terrain(),
      tv: 1,
      tanks: [
        { x: 60 + Math.random() * 60, y: 0, hp: 100, ang: 50, pow: 380 },
        { x: W - 60 - Math.random() * 60, y: 0, hp: 100, ang: 130, pow: 380 },
      ],
      turn: Math.random() < 0.5 ? 0 : 1,
      phase: 'aim',
      shell: null,
      boom: null,
      wait: 0,
      id: Math.floor(Math.random() * 1e9),
      shots: 0,
    };
    // ровные площадки под танками
    s.tanks.forEach((t) => {
      const x = Math.round(t.x);
      const y = s.ground[x];
      for (let dx = -18; dx <= 18; dx++) if (x + dx >= 0 && x + dx < W) s.ground[x + dx] = y;
    });
    settle(s);
    newWind(s);
    return s;
  }

  const muzzle = (t) => {
    const a = (t.ang * Math.PI) / 180;
    return { x: t.x + Math.cos(a) * 18, y: t.y - 10 - Math.sin(a) * 18, a };
  };

  function explode(s, x, y, fx) {
    s.boom = { x, y, t: 0.5 };
    for (let k = Math.max(0, Math.floor(x - R)); k <= Math.min(W - 1, Math.ceil(x + R)); k++) {
      const dy = Math.sqrt(Math.max(0, R * R - (k - x) ** 2));
      if (y + dy > s.ground[k]) s.ground[k] = Math.min(H - 2, Math.max(s.ground[k], Math.round(y + dy)));
    }
    s.tv++;
    s.tanks.forEach((t) => {
      const d = Math.hypot(t.x - x, t.y - 6 - y);
      if (d < R + 14) t.hp = Math.max(0, t.hp - Math.round(DMG * (1 - d / (R + 14)) + (d < 12 ? 15 : 0)));
    });
    settle(s);
    fx('explode');
  }

  let prevF = [false, false];
  function step(s, inputs, dt, fx) {
    if (s.boom) {
      s.boom.t -= dt;
      if (s.boom.t <= 0) s.boom = null;
    }
    if (s.phase === 'aim') {
      const t = s.tanks[s.turn];
      const inp = inputs[s.turn];
      const fast = inp.fast ? 1 : 0.5;
      // влево/вправо — угол ствола на экране, вверх/вниз — сила
      if (inp.l) t.ang = Math.min(178, t.ang + 60 * dt * fast);
      if (inp.r) t.ang = Math.max(2, t.ang - 60 * dt * fast);
      if (inp.u) t.pow = Math.min(700, t.pow + 220 * dt * fast);
      if (inp.d) t.pow = Math.max(120, t.pow - 220 * dt * fast);
      if (inp.f && !prevF[s.turn]) {
        const m = muzzle(t);
        s.shell = { x: m.x, y: m.y, vx: Math.cos(m.a) * t.pow, vy: -Math.sin(m.a) * t.pow, trail: [] };
        s.phase = 'fly';
        s.shots++;
        fx('hit');
      }
      prevF = [inputs[0].f, inputs[1].f];
      return;
    }
    prevF = [inputs[0].f, inputs[1].f];
    if (s.phase === 'fly') {
      const sh = s.shell;
      for (let k = 0; k < 4; k++) {
        const d = dt / 4;
        sh.vx += s.wind * d;
        sh.vy += G * d;
        sh.x += sh.vx * d;
        sh.y += sh.vy * d;
        const gx = Math.round(sh.x);
        const hitTank = s.tanks.some((t) => Math.abs(sh.x - t.x) < TANK_W / 2 && sh.y > t.y - 12 && sh.y < t.y + 2);
        if (sh.x < -40 || sh.x > W + 40 || sh.y > H) {
          s.shell = null;
          s.phase = 'wait';
          s.wait = 0.5;
          return;
        }
        if (hitTank || (gx >= 0 && gx < W && sh.y >= s.ground[gx])) {
          explode(s, sh.x, sh.y, fx);
          s.shell = null;
          s.phase = 'wait';
          s.wait = 0.9;
          return;
        }
      }
      if (s.shell.trail.length > 60) s.shell.trail.shift();
      s.shell.trail.push([Math.round(sh.x), Math.round(sh.y)]);
      return;
    }
    if (s.phase === 'wait') {
      s.wait -= dt;
      if (s.wait <= 0 && s.tanks.every((t) => t.hp > 0)) {
        s.turn = 1 - s.turn;
        s.phase = 'aim';
        newWind(s);
      }
    }
  }

  // ---------- компьютер: перебирает выстрелы на модели и наводит ствол ----------

  function simulate(s, x, y, vx, vy) {
    for (let k = 0; k < 2000; k++) {
      const d = 1 / 240;
      vx += s.wind * d;
      vy += G * d;
      x += vx * d;
      y += vy * d;
      if (x < -40 || x > W + 40 || y > H) return { x, y, out: true };
      const gx = Math.round(x);
      if (gx >= 0 && gx < W && y >= s.ground[gx]) return { x, y };
    }
    return { x, y, out: true };
  }

  const aiPlan = [{}, {}];
  function ai(s, side, level) {
    const inp = { u: false, d: false, l: false, r: false, f: false, px: null, py: null, fast: true };
    if (s.phase !== 'aim' || s.turn !== side) return inp;
    const t = s.tanks[side];
    const o = s.tanks[1 - side];
    const key = s.id + ':' + s.shots;
    const plan = aiPlan[side];
    if (plan.key !== key) {
      plan.key = key;
      plan.wait = 0.6 + Math.random() * 0.6;
      let best = null;
      const dirs = side === 0 ? [20, 85] : [95, 160];
      for (let ang = dirs[0]; ang <= dirs[1]; ang += 3) {
        for (let pow = 150; pow <= 700; pow += 15) {
          const a = (ang * Math.PI) / 180;
          const r = simulate(s, t.x + Math.cos(a) * 18, t.y - 10 - Math.sin(a) * 18, Math.cos(a) * pow, -Math.sin(a) * pow);
          if (r.out) continue;
          const miss = Math.abs(r.x - o.x) + Math.abs(r.y - o.y) * 0.3;
          const self = Math.abs(r.x - t.x) < R + 20;
          const v = miss + (self ? 500 : 0) + Math.abs(ang - (side ? 135 : 45)) * 0.05;
          if (!best || v < best.v) best = { v, ang, pow };
        }
      }
      best = best || { ang: t.ang, pow: t.pow };
      // промах в зависимости от уровня
      const err = { easy: [9, 70], normal: [4, 30], hard: [1.2, 8] }[level];
      plan.ang = Math.max(2, Math.min(178, best.ang + (Math.random() * 2 - 1) * err[0]));
      plan.pow = Math.max(120, Math.min(700, best.pow + (Math.random() * 2 - 1) * err[1]));
    }
    if (plan.wait > 0) {
      plan.wait -= 1 / 60;
      return inp;
    }
    if (Math.abs(t.ang - plan.ang) > 1) inp[t.ang < plan.ang ? 'l' : 'r'] = true;
    else if (Math.abs(t.pow - plan.pow) > 4) inp[t.pow < plan.pow ? 'u' : 'd'] = true;
    else inp.f = true;
    return inp;
  }

  // ---------- отрисовка ----------

  const PAL = SG.colors.players; // [0] — синий, [1] — красный
  function draw(g, s, v) {
    const c = v.colors;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1e3a8a');
    sky.addColorStop(1, '#93c5fd');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#65a30d';
    g.beginPath();
    g.moveTo(0, H);
    s.ground.forEach((y, x) => g.lineTo(x, y));
    g.lineTo(W, H);
    g.fill();
    g.strokeStyle = '#3f6212';
    g.lineWidth = 3;
    g.beginPath();
    s.ground.forEach((y, x) => (x ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    s.tanks.forEach((t, i) => {
      const m = muzzle(t);
      g.strokeStyle = '#111';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(t.x, t.y - 10);
      g.lineTo(m.x, m.y);
      g.stroke();
      g.fillStyle = t.hp > 0 ? PAL[i] : '#555';
      g.beginPath();
      g.roundRect(t.x - TANK_W / 2, t.y - 10, TANK_W, 10, 3);
      g.fill();
      g.beginPath();
      g.arc(t.x, t.y - 10, 7, Math.PI, 0);
      g.fill();
      // полоска здоровья
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.fillRect(t.x - 20, t.y - 34, 40, 5);
      g.fillStyle = t.hp > 50 ? '#22c55e' : t.hp > 25 ? '#fbbf24' : '#ef4444';
      g.fillRect(t.x - 20, t.y - 34, (40 * t.hp) / 100, 5);
      if (s.phase === 'aim' && s.turn === i) {
        g.fillStyle = '#fff';
        g.beginPath();
        g.moveTo(t.x, t.y - 40);
        g.lineTo(t.x - 6, t.y - 48);
        g.lineTo(t.x + 6, t.y - 48);
        g.fill();
      }
    });
    if (s.shell) {
      g.fillStyle = 'rgba(255,255,255,0.6)';
      s.shell.trail.forEach(([x, y]) => g.fillRect(x - 1, y - 1, 2, 2));
      g.fillStyle = '#111';
      g.beginPath();
      g.arc(s.shell.x, s.shell.y, 4, 0, Math.PI * 2);
      g.fill();
    }
    if (s.boom) {
      g.fillStyle = 'rgba(251,146,60,' + Math.max(0, s.boom.t * 1.6) + ')';
      g.beginPath();
      g.arc(s.boom.x, s.boom.y, R * (1.2 - s.boom.t), 0, Math.PI * 2);
      g.fill();
    }
    // ветер и прицел текущего игрока
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(W / 2 - 80, 8, 160, 26);
    g.fillStyle = '#fff';
    g.font = '700 13px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const wv = s.wind;
    g.fillText('Ветер ' + (wv === 0 ? '0' : (wv < 0 ? '← ' : '') + Math.abs(wv) + (wv > 0 ? ' →' : '')), W / 2, 21);
    const t = s.tanks[s.turn];
    const ang = t.ang <= 90 ? t.ang : 180 - t.ang;
    g.textAlign = s.turn ? 'right' : 'left';
    g.fillText('Угол ' + Math.round(ang) + '° · сила ' + Math.round(t.pow / 7), s.turn ? W - 12 : 12, 21);
    void c;
  }

  const names = (v) => (v.mode === 'ai' ? ['вы', 'компьютер'] : v.mode === 'net' ? (v.me === 0 ? ['вы', 'соперник'] : ['соперник', 'вы']) : ['синий', 'красный']);

  let sentTv = { id: null, tv: 0 };
  SG.rt({
    game: 'artillery',
    W,
    H,
    sides: ['Синий танк', 'Красный танк'],
    intro: 'Стреляйте по очереди: ← → — угол, ↑ ↓ — сила, пробел — выстрел. Учитывайте ветер!',
    create,
    step,
    ai,
    draw,
    pad: true,
    shared: true,
    fireLabel: '💥',
    over(s) {
      const [a, b] = s.tanks.map((t) => t.hp <= 0);
      if (!(a || b) || s.phase !== 'wait' || s.wait > 0) return null;
      return { winner: a && b ? null : a ? 1 : 0, text: 'Выстрелов: ' + s.shots + '.' };
    },
    hud(s, v) {
      const n = names(v);
      const who = s.phase === 'aim' ? ' · стреляет ' + n[s.turn] : '';
      return 'Синий (' + n[0] + ') ' + s.tanks[0].hp + ' ❤ · красный (' + n[1] + ') ' + s.tanks[1].hp + ' ❤' + who;
    },
    // рельеф передаём, только когда он изменился
    snapshot(s, full) {
      const snap = { tk: s.tanks, tu: s.turn, ph: s.phase, sh: s.shell, bo: s.boom, wi: s.wind, wa: s.wait, id: s.id, tv: s.tv, n: s.shots };
      if (full || sentTv.id !== s.id || sentTv.tv !== s.tv) {
        snap.g = s.ground;
        if (!full) sentTv = { id: s.id, tv: s.tv };
      }
      return snap;
    },
    restore(x, prev) {
      const ground = x.g || (prev && prev.id === x.id && prev.ground) || new Array(W).fill(H - 40);
      return { ground, tanks: x.tk, turn: x.tu, phase: x.ph, shell: x.sh, boom: x.bo, wind: x.wi, wait: x.wa, id: x.id, tv: x.tv, shots: x.n };
    },
  });
})();
