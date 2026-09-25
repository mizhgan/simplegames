/* Гонки: две машинки на кольцевой трассе, три круга — кто первым */
(() => {
  'use strict';

  const W = 720;
  const H = 450;
  const HW = 34; // полуширина трассы
  const LAPS = 5;
  const CAR_R = 9;
  const MAX = 270;
  const AI_MAX = { easy: 205, normal: 245, hard: 272 };
  // трассы: опорные точки, по ним строится гладкая кривая
  const TRACKS = [
    { name: 'Овал с шиканой', pts: [[120, 90], [600, 90], [660, 160], [640, 250], [520, 250], [470, 330], [560, 370], [540, 400], [140, 390], [70, 300], [70, 160]] },
    { name: 'Восьмёрка', pts: [[100, 80], [330, 80], [400, 200], [470, 330], [620, 370], [660, 250], [610, 90], [460, 70], [400, 200], [320, 360], [110, 380], [60, 230]] },
    { name: 'Серпантин', pts: [[80, 70], [640, 70], [670, 150], [600, 190], [180, 190], [150, 240], [190, 280], [610, 280], [670, 330], [630, 400], [90, 400], [50, 240]] },
  ];

  function spline(pts, per) {
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[(i + 2) % n];
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const steps = Math.max(4, Math.round(len / per));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const t2 = t * t;
        const t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    return out;
  }
  const PATHS = TRACKS.map((t) => spline(t.pts, 8));

  function nearest(path, x, y, from) {
    // ищем ближайшую точку трассы рядом с прошлой (или по всей трассе)
    const n = path.length;
    let best = from;
    let bd = Infinity;
    const range = from === undefined ? n : 25;
    const start = from === undefined ? 0 : from - range;
    for (let k = start; k < start + (from === undefined ? n : range * 2); k++) {
      const i = ((k % n) + n) % n;
      const d = (path[i][0] - x) ** 2 + (path[i][1] - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return { i: best, d: Math.sqrt(bd) };
  }

  function create() {
    const tr = Math.floor(Math.random() * TRACKS.length);
    const path = PATHS[tr];
    const n = path.length;
    const cars = [0, 1].map((side) => {
      const i = n - 3 - side * 3;
      const [x, y] = path[i];
      const [nx, ny] = path[(i + 1) % n];
      const a = Math.atan2(ny - y, nx - x);
      const off = side ? 12 : -12;
      return { x: x - Math.sin(a) * off, y: y + Math.cos(a) * off, a, v: 0, idx: i, prog: i - n, lap: 0, done: 0, off: false };
    });
    return { tr, cars, time: 0, finished: [] };
  }

  function step(s, inputs, dt, fx) {
    s.time += dt;
    const path = PATHS[s.tr];
    const n = path.length;
    s.cars.forEach((c, i) => {
      if (c.done) {
        c.v *= 0.96;
      } else {
        const inp = inputs[i];
        const top = inp.top || MAX;
        if (inp.u) c.v += 300 * dt;
        else if (inp.d) c.v -= (c.v > 0 ? 420 : 160) * dt;
        else c.v -= Math.sign(c.v) * Math.min(Math.abs(c.v), 90 * dt);
        const turn = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
        c.a += turn * 3.1 * dt * Math.min(1, Math.abs(c.v) / 110) * Math.sign(c.v || 1);
        const lim = c.off ? 110 : top;
        if (c.v > lim) c.v = Math.max(lim, c.v - 500 * dt);
        if (c.v < -90) c.v = -90;
      }
      c.x += Math.cos(c.a) * c.v * dt;
      c.y += Math.sin(c.a) * c.v * dt;
      c.x = Math.max(6, Math.min(W - 6, c.x));
      c.y = Math.max(6, Math.min(H - 6, c.y));
      const near = nearest(path, c.x, c.y, c.idx);
      c.off = near.d > HW;
      // прогресс по кругу: считаем переходы через старт
      let di = near.i - c.idx;
      if (di > n / 2) di -= n;
      if (di < -n / 2) di += n;
      c.idx = near.i;
      c.prog += di;
      const lap = Math.floor(c.prog / n) + 1;
      if (lap > c.lap && lap >= 2 && !c.done) fx('coin');
      c.lap = Math.max(c.lap, lap);
      if (!c.done && c.prog >= LAPS * n) {
        c.done = s.time;
        s.finished.push(i);
        fx('win');
      }
    });
    // машинки толкаются
    const [a, b] = s.cars;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < CAR_R * 2 && d > 0) {
      const push = (CAR_R * 2 - d) / 2;
      a.x -= (dx / d) * push;
      a.y -= (dy / d) * push;
      b.x += (dx / d) * push;
      b.y += (dy / d) * push;
      a.v *= 0.97;
      b.v *= 0.97;
      if (Math.abs(a.v - b.v) > 40) fx('tick');
    }
  }

  // ---------- компьютер: едет на точку впереди по трассе ----------

  function ai(s, side, level) {
    const inp = { u: false, d: false, l: false, r: false, f: false, px: null, py: null, top: AI_MAX[level] };
    const c = s.cars[side];
    if (c.done) return inp;
    const path = PATHS[s.tr];
    const n = path.length;
    const look = 5 + Math.floor(Math.max(0, c.v) / 40);
    const [tx, ty] = path[(c.idx + look) % n];
    let diff = Math.atan2(ty - c.y, tx - c.x) - c.a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (diff > 0.04) inp.r = true;
    if (diff < -0.04) inp.l = true;
    // впереди поворот — сбрасываем скорость
    const far = path[(c.idx + look + 10) % n];
    const mid = path[(c.idx + look) % n];
    const near = path[c.idx];
    const bend = Math.abs(Math.atan2(far[1] - mid[1], far[0] - mid[0]) - Math.atan2(mid[1] - near[1], mid[0] - near[0]));
    const b2 = bend > Math.PI ? Math.PI * 2 - bend : bend;
    const safe = AI_MAX[level] * (1 - Math.min(0.55, b2 * (level === 'hard' ? 0.45 : 0.6)));
    if (c.v < safe && Math.abs(diff) < 1.2) inp.u = true;
    else if (c.v > safe + 25) inp.d = true;
    if (c.v < 40) inp.u = true;
    return inp;
  }

  // ---------- отрисовка ----------

  const PAL = ['#3b82f6', '#ef4444'];
  function draw(g, s, v) {
    const c = v.colors;
    const path = PATHS[s.tr];
    g.fillStyle = '#3f8f3a';
    g.fillRect(0, 0, W, H);
    const line = (w, col, dash) => {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.lineJoin = 'round';
      g.setLineDash(dash || []);
      g.beginPath();
      path.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.stroke();
      g.setLineDash([]);
    };
    line(HW * 2 + 8, '#fff', [14, 14]);
    line(HW * 2 + 8, '#ef4444');
    line(HW * 2 + 8, '#fff', [14, 14]);
    line(HW * 2, '#4b5563');
    line(2, 'rgba(255,255,255,0.5)', [12, 16]);
    // старт-финиш: шахматка поперёк трассы
    const [x0, y0] = path[0];
    const [x1, y1] = path[1];
    const a = Math.atan2(y1 - y0, x1 - x0);
    g.save();
    g.translate(x0, y0);
    g.rotate(a);
    for (let k = -HW; k < HW; k += 6) {
      for (let r = 0; r < 2; r++) {
        g.fillStyle = ((k / 6) + r) % 2 ? '#fff' : '#111';
        g.fillRect(r * 6 - 6, k, 6, 6);
      }
    }
    g.restore();
    s.cars.forEach((car, i) => {
      g.save();
      g.translate(car.x, car.y);
      g.rotate(car.a);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(-10, -5, 22, 13);
      g.fillStyle = PAL[i];
      g.beginPath();
      g.roundRect(-12, -7, 24, 14, 4);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(-2, -5, 7, 10);
      g.fillStyle = '#111';
      [[-9, -9], [5, -9], [-9, 6], [5, 6]].forEach(([x, y]) => g.fillRect(x, y, 6, 3));
      g.restore();
      if (v.mode !== 'pvp' && v.me === i) {
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(car.x, car.y, 17, 0, Math.PI * 2);
        g.stroke();
      }
    });
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(8, 8, 190, 24);
    g.fillStyle = '#fff';
    g.font = '700 13px system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(TRACKS[s.tr].name + ' · ' + SG.formatTime(Math.floor(s.time)), 16, 20);
    void c;
  }

  const names = (v) => (v.mode === 'ai' ? ['вы', 'компьютер'] : v.mode === 'net' ? (v.me === 0 ? ['вы', 'соперник'] : ['соперник', 'вы']) : ['синяя', 'красная']);
  const lapOf = (car) => Math.min(LAPS, Math.max(1, car.lap));

  SG.rt({
    game: 'racing',
    W,
    H,
    sides: ['Синяя машинка', 'Красная машинка'],
    intro: 'Пять кругов. ↑ — газ, ↓ — тормоз, ← → — руль. На траве машинка вязнет.',
    create,
    step,
    ai,
    draw,
    pad: true,
    over(s) {
      if (!s.finished.length) return null;
      const w = s.finished[0];
      return { winner: w, text: 'Время победителя: ' + s.cars[w].done.toFixed(1) + ' с.' };
    },
    hud(s, v) {
      const n = names(v);
      const lead = s.cars[0].prog === s.cars[1].prog ? '' : ' · лидирует ' + (s.cars[0].prog > s.cars[1].prog ? n[0] : n[1]);
      return 'Синяя (' + n[0] + ') круг ' + lapOf(s.cars[0]) + '/' + LAPS + ' · красная (' + n[1] + ') круг ' + lapOf(s.cars[1]) + '/' + LAPS + lead;
    },
  });
})();
