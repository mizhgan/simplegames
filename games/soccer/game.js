/* Мини-футбол: один на один плюс вратари — забейте больше за две минуты */
(() => {
  'use strict';

  const W = 720;
  const H = 440;
  const M = 30; // поля за воротами
  const GOAL = 150; // ширина ворот
  const PR = 16; // радиус игрока
  const BR = 9; // радиус мяча
  const MATCH = 120;
  const SPEED = { easy: 175, normal: 215, hard: 245 };
  const HUMAN = 235;
  const KICK = 560;
  const G0 = (H - GOAL) / 2;
  const G1 = (H + GOAL) / 2;

  const dir = (side) => (side === 0 ? 1 : -1); // куда атакует команда

  function kickoff(s, toward) {
    s.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    s.pl = [
      { x: W / 2 - 90, y: H / 2, vx: 0, vy: 0, cd: 0 },
      { x: W / 2 + 90, y: H / 2, vx: 0, vy: 0, cd: 0 },
    ];
    s.gk = [
      { x: M + 20, y: H / 2, cd: 0 },
      { x: W - M - 20, y: H / 2, cd: 0 },
    ];
    // пропустившая команда разыгрывает ближе к мячу
    if (toward !== undefined) s.pl[toward].x = W / 2 - dir(toward) * 40;
    s.wait = 1;
  }

  function create() {
    const s = { score: [0, 0], time: MATCH, goalBy: -1, flash: 0 };
    kickoff(s);
    return s;
  }

  function bounceBall(b) {
    if (b.y < BR) {
      b.y = BR;
      b.vy = Math.abs(b.vy) * 0.8;
    }
    if (b.y > H - BR) {
      b.y = H - BR;
      b.vy = -Math.abs(b.vy) * 0.8;
    }
    const inMouth = b.y > G0 && b.y < G1;
    if (!inMouth) {
      if (b.x < M + BR) {
        b.x = M + BR;
        b.vx = Math.abs(b.vx) * 0.8;
      }
      if (b.x > W - M - BR) {
        b.x = W - M - BR;
        b.vx = -Math.abs(b.vx) * 0.8;
      }
    } else {
      // штанги и сетка
      if (b.x < M && (b.y < G0 + BR || b.y > G1 - BR)) b.vy *= -0.6;
      if (b.x > W - M && (b.y < G0 + BR || b.y > G1 - BR)) b.vy *= -0.6;
      b.y = Math.max(G0 + BR * 0.5, Math.min(G1 - BR * 0.5, b.y));
    }
  }

  // столкновение круга-игрока с мячом
  function touch(p, b, r, fx) {
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d >= r + BR || d === 0) return false;
    const nx = dx / d;
    const ny = dy / d;
    b.x = p.x + nx * (r + BR);
    b.y = p.y + ny * (r + BR);
    const rel = (b.vx - (p.vx || 0)) * nx + (b.vy - (p.vy || 0)) * ny;
    if (rel < 0) {
      b.vx -= 1.5 * rel * nx;
      b.vy -= 1.5 * rel * ny;
      if (Math.abs(rel) > 120) fx('tick');
    }
    return true;
  }

  function kick(p, b, power, aim) {
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    let ax = dx / d;
    let ay = dy / d;
    if (aim) {
      // немного подкручиваем к цели
      const tx = aim.x - b.x;
      const ty = aim.y - b.y;
      const td = Math.hypot(tx, ty) || 1;
      ax = ax * 0.4 + (tx / td) * 0.6;
      ay = ay * 0.4 + (ty / td) * 0.6;
      const n = Math.hypot(ax, ay);
      ax /= n;
      ay /= n;
    }
    b.vx = ax * power + (p.vx || 0) * 0.3;
    b.vy = ay * power + (p.vy || 0) * 0.3;
  }

  function step(s, inputs, dt, fx) {
    if (s.flash > 0) s.flash -= dt;
    if (s.wait > 0) {
      s.wait -= dt;
      return;
    }
    s.time = Math.max(0, s.time - dt);
    const b = s.ball;
    // игроки
    s.pl.forEach((p, i) => {
      const inp = inputs[i];
      const sp = inp.speed || HUMAN;
      let ax = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
      let ay = (inp.d ? 1 : 0) - (inp.u ? 1 : 0);
      const n = Math.hypot(ax, ay) || 1;
      const tx = (ax / n) * sp;
      const ty = (ay / n) * sp;
      const k = Math.min(1, dt * 10);
      p.vx += (tx - p.vx) * k;
      p.vy += (ty - p.vy) * k;
      p.x = Math.max(M + PR, Math.min(W - M - PR, p.x + p.vx * dt));
      p.y = Math.max(PR, Math.min(H - PR, p.y + p.vy * dt));
      if (p.cd > 0) p.cd -= dt;
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (inp.f && p.cd <= 0 && d < PR + BR + 10) {
        kick(p, b, KICK, inp.aim);
        p.cd = 0.35;
        fx('hit');
      }
    });
    // игроки не проходят друг сквозь друга
    const [a, c] = s.pl;
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < PR * 2 && d > 0) {
      const push = (PR * 2 - d) / 2;
      a.x -= (dx / d) * push;
      a.y -= (dy / d) * push;
      c.x += (dx / d) * push;
      c.y += (dy / d) * push;
    }
    // вратари ходят по своей линии за мячом
    s.gk.forEach((g, i) => {
      const gx = i === 0 ? M + 20 : W - M - 20;
      const coming = (i === 0 ? b.vx < 0 : b.vx > 0) && Math.abs(b.vx) > 1;
      let ty = b.y;
      if (coming) ty = b.y + (b.vy * (gx - b.x)) / b.vx;
      ty = Math.max(G0 + 10, Math.min(G1 - 10, ty));
      const pvx = g.x;
      const pvy = g.y;
      const step2 = 170 * dt;
      g.y += Math.max(-step2, Math.min(step2, ty - g.y));
      // вратарь может чуть выйти к мячу
      const tx = Math.abs(b.x - gx) < 90 && b.y > G0 - 30 && b.y < G1 + 30 ? gx + dir(i) * 26 : gx;
      g.x += Math.max(-step2, Math.min(step2, tx - g.x));
      g.vx = (g.x - pvx) / dt;
      g.vy = (g.y - pvy) / dt;
      if (g.cd > 0) g.cd -= dt;
      if (touch(g, b, PR + 2, fx) && g.cd <= 0) {
        // выбивает мяч в поле, в сторону от своих ворот
        kick(g, b, 420, { x: W / 2 + dir(i) * 120, y: b.y < H / 2 ? H * 0.2 : H * 0.8 });
        g.cd = 0.5;
        fx('hit');
      }
    });
    s.pl.forEach((p) => touch(p, b, PR, fx));
    // мяч
    const sub = 3;
    for (let k = 0; k < sub; k++) {
      b.x += (b.vx * dt) / sub;
      b.y += (b.vy * dt) / sub;
      bounceBall(b);
    }
    const f = Math.exp(-0.9 * dt);
    b.vx *= f;
    b.vy *= f;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 900) {
      b.vx *= 900 / sp;
      b.vy *= 900 / sp;
    }
    // гол
    if (b.x < M - BR || b.x > W - M + BR) {
      const by = b.x < M ? 1 : 0;
      s.score[by]++;
      s.goalBy = by;
      s.flash = 1.4;
      fx('win');
      kickoff(s, 1 - by);
      s.wait = 1.4;
    }
  }

  // ---------- компьютер ----------

  function ai(s, side, level) {
    const inp = { u: false, d: false, l: false, r: false, f: false, px: null, py: null, speed: SPEED[level] };
    if (s.wait > 0) return inp;
    const p = s.pl[side];
    const b = s.ball;
    const dd = dir(side);
    const goal = { x: side === 0 ? W : 0, y: H / 2 };
    // точка за мячом на линии удара по воротам
    const gx = goal.x - b.x;
    const gy = goal.y - b.y;
    const gd = Math.hypot(gx, gy) || 1;
    const lead = level === 'easy' ? 0.05 : 0.15;
    const bx = b.x + b.vx * lead;
    const by = b.y + b.vy * lead;
    const behind = { x: bx - (gx / gd) * (PR + BR + 6), y: by - (gy / gd) * (PR + BR + 6) };
    let target;
    const onWrongSide = (p.x - b.x) * dd > -4;
    if (onWrongSide) {
      // обходим мяч сбоку, чтобы не забить в свои
      const sideY = p.y < b.y ? -1 : 1;
      target = { x: b.x - dd * 34, y: b.y + sideY * 30 };
    } else if (Math.hypot(behind.x - p.x, behind.y - p.y) < 14) {
      // уже за мячом — ведём его к воротам
      target = { x: b.x + (gx / gd) * 40, y: b.y + (gy / gd) * 40 };
    } else target = behind;
    // если мяч далеко у своих ворот и летит к ним — возвращаемся в защиту
    if (level !== 'easy' && (b.x - W / 2) * dd < -150 && (p.x - b.x) * dd > 60) target = { x: b.x - dd * 40, y: b.y };
    const tx = target.x - p.x;
    const ty = target.y - p.y;
    const dz = 3;
    if (tx > dz) inp.r = true;
    if (tx < -dz) inp.l = true;
    if (ty > dz) inp.d = true;
    if (ty < -dz) inp.u = true;
    // до мяча рукой подать и он перед нами — бьём
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < PR + BR + 8 && (b.x - p.x) * dd > 0) {
      const miss = level === 'easy' ? 90 : level === 'normal' ? 45 : 18;
      inp.f = Math.random() < (level === 'easy' ? 0.3 : 0.7);
      inp.aim = { x: goal.x, y: goal.y + (Math.random() - 0.5) * 2 * miss };
    }
    return inp;
  }

  // ---------- отрисовка ----------

  const TEAM = ['#22d3ee', '#ff5c93'];
  function draw(g, s, v) {
    const c = v.colors;
    g.fillStyle = '#15803d';
    g.fillRect(0, 0, W, H);
    for (let k = 0; k < 10; k++) {
      if (k % 2) continue;
      g.fillStyle = '#16a34a';
      g.fillRect(M + ((W - 2 * M) / 10) * k, 0, (W - 2 * M) / 10, H);
    }
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 3;
    g.strokeRect(M, 2, W - 2 * M, H - 4);
    g.beginPath();
    g.moveTo(W / 2, 2);
    g.lineTo(W / 2, H - 2);
    g.stroke();
    g.beginPath();
    g.arc(W / 2, H / 2, 55, 0, Math.PI * 2);
    g.stroke();
    g.strokeRect(M, G0 - 40, 80, GOAL + 80);
    g.strokeRect(W - M - 80, G0 - 40, 80, GOAL + 80);
    // ворота
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(0, G0, M, GOAL);
    g.fillRect(W - M, G0, M, GOAL);
    g.fillStyle = '#fff';
    [[M, G0], [M, G1], [W - M, G0], [W - M, G1]].forEach(([x, y]) => {
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
    });
    const body = (p, col, r, gk) => {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.ellipse(p.x + 3, p.y + 4, r, r * 0.8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = col;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = gk ? '#fbbf24' : '#fff';
      g.lineWidth = 3;
      g.stroke();
    };
    s.gk.forEach((p, i) => body(p, TEAM[i], PR + 2, true));
    s.pl.forEach((p, i) => {
      body(p, TEAM[i], PR, false);
      if (v.mode !== 'pvp' && v.me === i) {
        g.fillStyle = '#fff';
        g.beginPath();
        g.moveTo(p.x, p.y - PR - 12);
        g.lineTo(p.x - 6, p.y - PR - 20);
        g.lineTo(p.x + 6, p.y - PR - 20);
        g.fill();
      }
    });
    const b = s.ball;
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.arc(b.x + 3, b.y + 4, BR, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(b.x, b.y, BR, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    g.beginPath();
    g.arc(b.x, b.y, BR * 0.4, 0, Math.PI * 2);
    g.fill();
    if (s.flash > 0 && s.goalBy >= 0) {
      // надпись — всегда читаемо, даже на повёрнутом поле
      g.save();
      const k = g.canvas.width / W;
      g.setTransform(k, 0, 0, k, 0, 0);
      g.fillStyle = '#fff';
      g.font = '900 54px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = 'rgba(0,0,0,0.5)';
      g.shadowBlur = 12;
      g.fillText('ГОЛ!', W / 2, H / 2);
      g.restore();
    }
    void c;
  }

  const names = (v) => (v.mode === 'ai' ? ['вы', 'компьютер'] : v.mode === 'net' ? (v.me === 0 ? ['вы', 'соперник'] : ['соперник', 'вы']) : ['голубые', 'розовые']);

  SG.rt({
    game: 'soccer',
    W,
    H,
    sides: ['Голубые', 'Розовые'],
    intro: 'Две минуты, один на один плюс вратари. Пробел — удар.',
    create,
    step,
    ai,
    draw,
    pad: true,
    fireLabel: '⚽',
    flipGuest: true,
    over: (s) => (s.time <= 0 && s.wait <= 0 ? { winner: s.score[0] === s.score[1] ? null : s.score[0] > s.score[1] ? 0 : 1, text: 'Счёт ' + s.score[0] + ' : ' + s.score[1] + '.' } : null),
    hud(s, v) {
      const n = names(v);
      return 'Голубые (' + n[0] + ') ' + s.score[0] + ' : ' + s.score[1] + ' розовые (' + n[1] + ') · ' + SG.formatTime(Math.ceil(s.time));
    },
  });
})();
