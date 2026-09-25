/* Аэрохоккей: забейте шайбу в ворота соперника */
(() => {
  'use strict';

  const W = 400;
  const H = 600;
  const PUCK_R = 14;
  const MAL_R = 26;
  const GOAL = 140;
  const WIN = 7;
  const MAX_PUCK = 1100;
  const KEY_SPEED = 520;
  const AI = { easy: { speed: 380, react: 0.35 }, normal: { speed: 560, react: 0.6 }, hard: { speed: 820, react: 0.9 } };

  const home = (side) => ({ x: W / 2, y: side === 0 ? H - 70 : 70 });

  function resetPuck(s, toward) {
    s.puck = { x: W / 2, y: toward === 0 ? H / 2 + 60 : H / 2 - 60, vx: 0, vy: 0 };
    s.wait = 0.8;
  }

  function create() {
    const s = { score: [0, 0], mal: [0, 1].map((i) => ({ ...home(i), vx: 0, vy: 0 })), flash: 0, lastGoal: -1 };
    resetPuck(s, Math.random() < 0.5 ? 0 : 1);
    return s;
  }

  function moveMallet(s, side, inp, dt) {
    const m = s.mal[side];
    const ox = m.x;
    const oy = m.y;
    if (inp.px !== null && inp.px !== undefined) {
      // за указателем — быстро, но не мгновенно
      const dx = inp.px - m.x;
      const dy = inp.py - m.y;
      const d = Math.hypot(dx, dy);
      const maxd = 1500 * dt;
      if (d > maxd) {
        m.x += (dx / d) * maxd;
        m.y += (dy / d) * maxd;
      } else {
        m.x = inp.px;
        m.y = inp.py;
      }
    } else {
      const ax = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
      const ay = (inp.d ? 1 : 0) - (inp.u ? 1 : 0);
      m.x += ax * KEY_SPEED * dt;
      m.y += ay * KEY_SPEED * dt;
    }
    // только своя половина
    m.x = Math.max(MAL_R, Math.min(W - MAL_R, m.x));
    if (side === 0) m.y = Math.max(H / 2 + MAL_R, Math.min(H - MAL_R, m.y));
    else m.y = Math.max(MAL_R, Math.min(H / 2 - MAL_R, m.y));
    m.vx = (m.x - ox) / dt;
    m.vy = (m.y - oy) / dt;
  }

  function collide(s, side, fx) {
    const m = s.mal[side];
    const p = s.puck;
    const dx = p.x - m.x;
    const dy = p.y - m.y;
    const d = Math.hypot(dx, dy);
    if (d >= PUCK_R + MAL_R || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    // выталкиваем шайбу из биты
    p.x = m.x + nx * (PUCK_R + MAL_R + 0.5);
    p.y = m.y + ny * (PUCK_R + MAL_R + 0.5);
    // отражение относительной скорости плюс скорость биты
    const rvx = p.vx - m.vx;
    const rvy = p.vy - m.vy;
    const dot = rvx * nx + rvy * ny;
    if (dot < 0) {
      p.vx -= 1.9 * dot * nx;
      p.vy -= 1.9 * dot * ny;
    }
    p.vx += m.vx * 0.15;
    p.vy += m.vy * 0.15;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > MAX_PUCK) {
      p.vx *= MAX_PUCK / sp;
      p.vy *= MAX_PUCK / sp;
    }
    fx('hit');
  }

  function step(s, inputs, dt, fx) {
    moveMallet(s, 0, inputs[0], dt);
    moveMallet(s, 1, inputs[1], dt);
    if (s.flash > 0) s.flash -= dt;
    const p = s.puck;
    if (s.wait > 0) {
      s.wait -= dt;
      collide(s, 0, fx);
      collide(s, 1, fx);
      return;
    }
    const sub = 4;
    for (let k = 0; k < sub; k++) {
      p.x += (p.vx * dt) / sub;
      p.y += (p.vy * dt) / sub;
      if (p.x < PUCK_R) {
        p.x = PUCK_R;
        p.vx = Math.abs(p.vx) * 0.9;
        fx('tick');
      } else if (p.x > W - PUCK_R) {
        p.x = W - PUCK_R;
        p.vx = -Math.abs(p.vx) * 0.9;
        fx('tick');
      }
      const inGoal = Math.abs(p.x - W / 2) < GOAL / 2;
      if (p.y < PUCK_R && !inGoal) {
        p.y = PUCK_R;
        p.vy = Math.abs(p.vy) * 0.9;
        fx('tick');
      } else if (p.y > H - PUCK_R && !inGoal) {
        p.y = H - PUCK_R;
        p.vy = -Math.abs(p.vy) * 0.9;
        fx('tick');
      }
      collide(s, 0, fx);
      collide(s, 1, fx);
    }
    p.vx *= 0.996;
    p.vy *= 0.996;
    // гол
    if (p.y < -PUCK_R || p.y > H + PUCK_R) {
      const scorer = p.y < 0 ? 0 : 1;
      s.score[scorer]++;
      s.lastGoal = scorer;
      s.flash = 1;
      fx('coin');
      resetPuck(s, 1 - scorer);
    }
  }

  // ---------- компьютер ----------
  function ai(s, side, level) {
    const cfg = AI[level];
    const m = s.mal[side];
    const p = s.puck;
    const own = side === 1 ? p.y < H / 2 : p.y > H / 2;
    const goalY = side === 1 ? 0 : H;
    let tx;
    let ty;
    if (own && (Math.abs(p.vy) < 250 || (side === 1 ? p.vy < 0 : p.vy > 0))) {
      // атакуем: бьём шайбу в сторону ворот, мимо биты соперника
      const opp = s.mal[1 - side];
      const aimX = W / 2 + (opp.x < W / 2 ? 1 : -1) * GOAL * 0.3;
      const aimY = side === 1 ? H : 0;
      let ax = aimX - p.x;
      let ay = aimY - p.y;
      const al = Math.hypot(ax, ay) || 1;
      ax /= al;
      ay /= al;
      // точка удара — чуть за шайбой по линии прицела, бита проходит сквозь неё
      tx = p.x - ax * (PUCK_R + MAL_R - 10);
      ty = p.y - ay * (PUCK_R + MAL_R - 10);
      if (side === 1 ? m.y > p.y : m.y < p.y) {
        // бита перед шайбой — объезжаем
        tx = p.x + (m.x < p.x ? -1 : 1) * (MAL_R + PUCK_R + 6);
        ty = p.y + (side === 1 ? -1 : 1) * (MAL_R + 4);
      }
    } else {
      // защищаем ворота: между шайбой и воротами
      const k = 0.18 + (1 - cfg.react) * 0.1;
      tx = W / 2 + (p.x - W / 2) * cfg.react * 0.8;
      ty = goalY + (p.y - goalY) * k + (side === 1 ? 40 : -40);
    }
    const dx = tx - m.x;
    const dy = ty - m.y;
    const d = Math.hypot(dx, dy) || 1;
    const stepLen = Math.min(d, (cfg.speed * 1) / 60);
    return { u: false, d: false, l: false, r: false, f: false, px: m.x + (dx / d) * stepLen, py: m.y + (dy / d) * stepLen };
  }

  // ---------- отрисовка ----------
  function draw(g, s, v) {
    const c = v.colors;
    g.fillStyle = c.bg;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = c.line;
    g.lineWidth = 3;
    g.strokeRect(4, 4, W - 8, H - 8);
    g.beginPath();
    g.moveTo(4, H / 2);
    g.lineTo(W - 4, H / 2);
    g.stroke();
    g.beginPath();
    g.arc(W / 2, H / 2, 60, 0, Math.PI * 2);
    g.stroke();
    // ворота
    g.fillStyle = c.accent3;
    g.fillRect(W / 2 - GOAL / 2, 0, GOAL, 6);
    g.fillStyle = c.accent2;
    g.fillRect(W / 2 - GOAL / 2, H - 6, GOAL, 6);
    for (const [y, a0, a1] of [[0, 0, Math.PI], [H, Math.PI, Math.PI * 2]]) {
      g.beginPath();
      g.arc(W / 2, y, GOAL / 2 + 10, a0, a1);
      g.stroke();
    }
    // счёт в поле (читается с любой стороны — рисуем без поворота текста не получится, поэтому крупно и полупрозрачно)
    g.globalAlpha = 0.18;
    g.fillStyle = c.text;
    g.font = '900 72px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const flipText = (text, x, y) => {
      g.save();
      g.translate(x, y);
      if (v.flip) g.rotate(Math.PI);
      g.fillText(text, 0, 0);
      g.restore();
    };
    flipText(s.score[1], W / 2, H / 2 - 110);
    flipText(s.score[0], W / 2, H / 2 + 110);
    g.globalAlpha = 1;
    // биты и шайба
    const mallet = (m, col) => {
      g.fillStyle = col;
      g.beginPath();
      g.arc(m.x, m.y, MAL_R, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.arc(m.x, m.y, MAL_R * 0.45, 0, Math.PI * 2);
      g.fill();
    };
    mallet(s.mal[0], c.accent2);
    mallet(s.mal[1], c.accent3);
    g.fillStyle = c.text;
    g.beginPath();
    g.arc(s.puck.x, s.puck.y, PUCK_R, 0, Math.PI * 2);
    g.fill();
    if (s.flash > 0) {
      g.globalAlpha = s.flash * 0.5;
      g.fillStyle = s.lastGoal === 0 ? c.accent2 : c.accent3;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
  }

  const names = (v) => (v.mode === 'ai' ? ['вы', 'компьютер'] : v.mode === 'net' ? (v.me === 0 ? ['вы', 'соперник'] : ['соперник', 'вы']) : ['нижний', 'верхний']);

  SG.rt({
    game: 'airhockey',
    W,
    H,
    sides: ['Голубая бита', 'Розовая бита'],
    intro: 'Водите битой мышью или пальцем. До ' + WIN + ' голов.',
    create,
    step,
    ai,
    draw,
    pointer: 'xy',
    pad: true,
    flipGuest: true,
    over: (s) => (s.score[0] >= WIN || s.score[1] >= WIN ? { winner: s.score[0] >= WIN ? 0 : 1, text: 'Счёт ' + s.score[0] + ' : ' + s.score[1] + '.' } : null),
    hud(s, v) {
      const n = names(v);
      const [a, b] = v.me === 1 ? [1, 0] : [0, 1];
      return n[a][0].toUpperCase() + n[a].slice(1) + ' ' + s.score[a] + ' : ' + s.score[b] + ' ' + n[b];
    },
  });
})();
