/* Сумо: вытолкните соперника за край круга — рывок, упор и хитрые уходы в сторону */
(() => {
  'use strict';

  const W = 560;
  const H = 560;
  const CX = W / 2;
  const CY = H / 2;
  const RING = 230;
  const R = 30;
  const ACC = 520;
  const DRAG = 1.6;
  const DASH = 430;
  const DASH_CD = 1.4;
  const WIN = 3;
  const AI = { easy: { react: 0.35, dash: 0.3, edge: 0.6 }, normal: { react: 0.15, dash: 0.7, edge: 0.8 }, hard: { react: 0.05, dash: 1, edge: 0.9 } };

  function fighters() {
    return [
      { x: CX - 90, y: CY, vx: 0, vy: 0, cd: 0.5, dash: 0, fx: 1, fy: 0 },
      { x: CX + 90, y: CY, vx: 0, vy: 0, cd: 0.5, dash: 0, fx: -1, fy: 0 },
    ];
  }

  function create() {
    return { p: fighters(), score: [0, 0], round: 1, pause: 1.2, msg: 'Раунд 1', t: 0, loser: null };
  }

  function step(s, inputs, dt, fx) {
    s.t += dt;
    if (s.pause > 0) {
      s.pause -= dt;
      if (s.pause <= 0) {
        s.msg = '';
        if (s.loser !== null && Math.max(...s.score) < WIN) {
          s.p = fighters();
          s.loser = null;
          s.round++;
          s.msg = 'Раунд ' + s.round;
          s.pause = 1;
        }
      }
      return;
    }
    s.p.forEach((p, i) => {
      const inp = inputs[i];
      let ax = 0;
      let ay = 0;
      if (inp.px !== null && inp.px !== undefined) {
        const dx = inp.px - p.x;
        const dy = inp.py - p.y;
        const d = Math.hypot(dx, dy);
        if (d > 8) {
          ax = dx / d;
          ay = dy / d;
        }
      }
      if (inp.l) ax -= 1;
      if (inp.r) ax += 1;
      if (inp.u) ay -= 1;
      if (inp.d) ay += 1;
      const n = Math.hypot(ax, ay);
      if (n > 0) {
        ax /= n;
        ay /= n;
        p.fx = ax;
        p.fy = ay;
      }
      p.vx += ax * ACC * dt;
      p.vy += ay * ACC * dt;
      p.cd -= dt;
      p.dash -= dt;
      if (inp.f && p.cd <= 0) {
        p.cd = DASH_CD;
        p.dash = 0.25;
        p.vx += p.fx * DASH;
        p.vy += p.fy * DASH;
        fx('jump');
      }
      const k = Math.exp(-DRAG * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    });
    // столкновение: упругий толчок, рывок бьёт сильнее
    const [a, b] = s.p;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 2 * R && d > 0) {
      const nx = dx / d;
      const ny = dy / d;
      const over = (2 * R - d) / 2;
      a.x -= nx * over;
      a.y -= ny * over;
      b.x += nx * over;
      b.y += ny * over;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel > 0) {
        const bonusA = a.dash > 0 ? 1.35 : 1;
        const bonusB = b.dash > 0 ? 1.35 : 1;
        const j = rel * 1.05;
        b.vx += nx * j * bonusA;
        b.vy += ny * j * bonusA;
        a.vx -= nx * j * bonusB;
        a.vy -= ny * j * bonusB;
        if (rel > 120) fx('hit');
        else if (rel > 40) fx('bounce');
      }
    }
    const out = s.p.map((p) => Math.hypot(p.x - CX, p.y - CY) > RING);
    if (out[0] || out[1]) {
      fx('flag');
      if (out[0] && out[1]) {
        s.msg = 'Оба за кругом — переигровка';
        s.loser = -1;
      } else {
        const w = out[0] ? 1 : 0;
        s.score[w]++;
        s.loser = 1 - w;
        s.msg = (w ? 'Красный' : 'Синий') + ' выиграл раунд!';
      }
      s.pause = 1.6;
    }
  }

  const mem = [{}, {}];
  function ai(s, side, level) {
    const inp = { u: false, d: false, l: false, r: false, f: false, px: null, py: null };
    if (s.pause > 0) return inp;
    const cfg = AI[level];
    const me = s.p[side];
    const o = s.p[1 - side];
    const m = mem[side];
    if (!m.t || s.t - m.t > cfg.react || s.t < m.t) {
      m.t = s.t;
      m.jx = (Math.random() - 0.5) * 30 * (1 - cfg.edge);
      m.jy = (Math.random() - 0.5) * 30 * (1 - cfg.edge);
    }
    // цель — точка за соперником (толкаем его к краю), но если сами у края — уходим к центру
    const odx = o.x - CX;
    const ody = o.y - CY;
    const od = Math.hypot(odx, ody) || 1;
    let tx = o.x - (odx / od) * 20 + m.jx;
    let ty = o.y - (ody / od) * 20 + m.jy;
    const myd = Math.hypot(me.x - CX, me.y - CY);
    if (myd > RING * cfg.edge * 0.85) {
      // заходим сбоку, чтобы не вылететь
      tx = me.x + (CX - me.x) * 0.6 + (o.x - me.x) * 0.4;
      ty = me.y + (CY - me.y) * 0.6 + (o.y - me.y) * 0.4;
    }
    // уклон от рывка соперника у края
    if (o.dash > 0 && myd > RING * 0.6) {
      tx = me.x - (o.y - me.y);
      ty = me.y + (o.x - me.x);
    }
    const dx = tx - me.x;
    const dy = ty - me.y;
    if (Math.abs(dx) > 6) inp[dx > 0 ? 'r' : 'l'] = true;
    if (Math.abs(dy) > 6) inp[dy > 0 ? 'd' : 'u'] = true;
    const dist = Math.hypot(o.x - me.x, o.y - me.y);
    const facing = (me.fx * (o.x - me.x) + me.fy * (o.y - me.y)) / (dist || 1);
    inp.f = me.cd <= 0 && dist < 150 && facing > 0.85 && Math.random() < cfg.dash * 0.2;
    return inp;
  }

  const PAL = ['#3b82f6', '#ef4444'];
  function draw(g, s, v) {
    g.fillStyle = '#a3845c';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#e8d3a8';
    g.beginPath();
    g.arc(CX, CY, RING + 14, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(CX, CY, RING, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 4;
    [-1, 1].forEach((k) => {
      g.beginPath();
      g.moveTo(CX + k * 30, CY - 22);
      g.lineTo(CX + k * 30, CY + 22);
      g.stroke();
    });
    s.p.forEach((p, i) => {
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.beginPath();
      g.arc(p.x + 4, p.y + 5, R, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f5c9a3';
      g.beginPath();
      g.arc(p.x, p.y, R, 0, Math.PI * 2);
      g.fill();
      // пояс-маваси
      g.strokeStyle = PAL[i];
      g.lineWidth = 9;
      g.beginPath();
      g.arc(p.x, p.y, R - 6, 0, Math.PI * 2);
      g.stroke();
      // пучок волос по направлению взгляда
      g.fillStyle = '#1f2937';
      g.beginPath();
      g.arc(p.x - p.fx * 6, p.y - p.fy * 6, 8, 0, Math.PI * 2);
      g.fill();
      // руки вперёд
      g.fillStyle = '#f5c9a3';
      [-1, 1].forEach((k) => {
        g.beginPath();
        g.arc(p.x + p.fx * (R - 2) - p.fy * 16 * k, p.y + p.fy * (R - 2) + p.fx * 16 * k, 8, 0, Math.PI * 2);
        g.fill();
      });
      if (p.dash > 0) {
        g.strokeStyle = 'rgba(250,204,21,0.8)';
        g.lineWidth = 4;
        g.beginPath();
        g.arc(p.x, p.y, R + 6, 0, Math.PI * 2);
        g.stroke();
      }
      // полоска готовности рывка
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(p.x - 20, p.y - R - 14, 40, 5);
      g.fillStyle = PAL[i];
      g.fillRect(p.x - 20, p.y - R - 14, 40 * Math.max(0, Math.min(1, 1 - p.cd / DASH_CD)), 5);
      if (v.me === i && v.mode !== 'pvp') {
        g.fillStyle = '#111';
        g.font = '700 13px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText('вы', p.x, p.y - R - 20);
      }
    });
    if (s.msg) {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(0, CY - 30, W, 52);
      g.fillStyle = '#fff';
      g.font = '800 26px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(s.msg, CX, CY + 5);
    }
  }

  const names = (v) => (v.mode === 'ai' ? ['вы', 'компьютер'] : v.mode === 'net' ? (v.me === 0 ? ['вы', 'соперник'] : ['соперник', 'вы']) : ['синий', 'красный']);

  SG.rt({
    game: 'sumo',
    W,
    H,
    sides: ['Синий борец', 'Красный борец'],
    intro: 'Стрелки или WASD — движение, пробел — рывок. Вытолкните соперника за круг. До ' + WIN + ' побед.',
    create,
    step,
    ai,
    draw,
    pad: true,
    fireLabel: 'Рывок',
    over: (s) => (s.pause <= 0 && Math.max(...s.score) >= WIN ? { winner: s.score[0] >= WIN ? 0 : 1, text: 'Счёт ' + s.score[0] + ' : ' + s.score[1] + '.' } : null),
    hud(s, v) {
      const n = names(v);
      return 'Раунд ' + s.round + ' · синий (' + n[0] + ') ' + s.score[0] + ' : ' + s.score[1] + ' красный (' + n[1] + ')';
    },
  });
})();
