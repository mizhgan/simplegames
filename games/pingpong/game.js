/* Настольный теннис: вид из-за своего края стола, до 11 очков */
(() => {
  'use strict';

  const W = 720;
  const H = 460;
  // стол в метрах: x — поперёк, y — вдоль (от игрока 0 к игроку 1), z — высота над столом
  const TW = 1.525;
  const TL = 2.74;
  const NET = 0.1525;
  const GRAV = 6.5; // «медленная» гравитация — чтобы успевать
  const PAD_Y = [-0.25, TL + 0.25];
  const REACH = 0.26;
  const WIN = 11;
  const AI_SPEED = { easy: 1.25, normal: 1.8, hard: 2.6 };
  const HUMAN_SPEED = 2.4;
  // камера
  const CAM = { y: -2.0, z: 1.25, f: 540, hy: 70 };

  function create() {
    const s = { score: [0, 0], pads: [{ x: 0, vx: 0 }, { x: 0, vx: 0 }], ball: null, server: Math.random() < 0.5 ? 0 : 1, rally: 0, msg: '', msgT: 0, id: Math.floor(Math.random() * 1e9) };
    serve(s);
    return s;
  }

  function serve(s) {
    const p = s.server;
    const dir = p === 0 ? 1 : -1;
    s.ball = { x: s.pads[p].x, y: PAD_Y[p] + dir * 0.12, z: 0.3, vx: 0, vy: 0, vz: 0, held: true, heldT: 0, bounces: 0, hitter: p };
    s.rally = 0;
  }

  // удар: мяч летит на половину соперника, приземляясь в точку (tx, ty)
  function strike(s, side, smash, fx) {
    const b = s.ball;
    const pad = s.pads[side];
    const dir = side === 0 ? 1 : -1;
    const off = Math.max(-1, Math.min(1, (b.x - pad.x) / REACH));
    // край ракетки уводит мяч в сторону, движение ракетки — подкручивает
    const tx = off * TW * 0.62 - pad.vx * 0.12 + (b.x * 0.2);
    const depth = smash ? 0.85 : 0.62 + Math.random() * 0.15;
    const ty = TL / 2 + dir * (TL / 2) * depth;
    let T = smash ? 0.55 : 0.85;
    const z0 = Math.max(0.05, b.z);
    // поднимаем дугу, пока мяч не перелетает сетку
    for (let k = 0; k < 20; k++) {
      const vy = (ty - b.y) / T;
      const vz = (-z0 + 0.5 * GRAV * T * T) / T;
      const tn = (TL / 2 - b.y) / vy;
      const zn = z0 + vz * tn - 0.5 * GRAV * tn * tn;
      if (zn > NET + 0.05) break;
      T += 0.06;
    }
    b.vx = (tx - b.x) / T;
    b.vy = (ty - b.y) / T;
    b.vz = (-z0 + 0.5 * GRAV * T * T) / T;
    b.z = z0;
    b.held = false;
    b.bounces = 0;
    b.hitter = side;
    s.rally++;
    fx(smash ? 'hit' : 'tick');
  }

  function point(s, to, why, fx) {
    s.score[to]++;
    s.msg = why;
    s.msgT = 1.3;
    s.ball.dead = true;
    fx(to === 0 ? 'coin' : 'coin');
    // подача переходит каждые 2 очка (при 10:10 — каждое)
    const total = s.score[0] + s.score[1];
    const deuce = s.score[0] >= WIN - 1 && s.score[1] >= WIN - 1;
    if (deuce || total % 2 === 0) s.server = 1 - s.server;
  }

  const inTable = (x, y) => Math.abs(x) <= TW / 2 && y >= 0 && y <= TL;

  let pvpView = false; // вдвоём за одним экраном второй игрок — на дальнем конце
  function step(s, inputs, dt, fx) {
    if (s.msgT > 0) {
      s.msgT -= dt;
      if (s.msgT <= 0 && !over(s)) serve(s);
      if (s.ball.dead) return;
    }
    // ракетки
    s.pads.forEach((p, i) => {
      const inp = inputs[i];
      const ox = p.x;
      const sp = inp.speed || HUMAN_SPEED;
      if (inp.px !== null && inp.px !== undefined) {
        // экранная точка → место на линии ракетки (у дальнего игрока вдвоём — дальний масштаб)
        const ry = i === 1 && pvpView ? PAD_Y[1] - CAM.y : PAD_Y[0] - CAM.y;
        const tx = ((inp.px - W / 2) * ry) / CAM.f;
        p.x += Math.max(-sp * 1.4 * dt, Math.min(sp * 1.4 * dt, tx - p.x));
      } else {
        if (inp.l) p.x -= sp * dt;
        if (inp.r) p.x += sp * dt;
      }
      p.x = Math.max(-TW / 2 - 0.35, Math.min(TW / 2 + 0.35, p.x));
      p.vx = (p.x - ox) / dt;
    });
    const b = s.ball;
    if (b.held) {
      // мяч в руке у подающего: подача по кнопке или сама через 1,5 с
      b.x = s.pads[b.hitter].x;
      b.heldT += dt;
      const inp = inputs[b.hitter];
      if ((inp.f && b.heldT > 0.4) || b.heldT > 1.5) strike(s, b.hitter, false, fx);
      return;
    }
    const sub = 4;
    for (let k = 0; k < sub; k++) {
      const d = dt / sub;
      const py = b.y;
      b.vz -= GRAV * d;
      b.x += b.vx * d;
      b.y += b.vy * d;
      b.z += b.vz * d;
      // сетка
      if ((py - TL / 2) * (b.y - TL / 2) <= 0 && b.z < NET && Math.abs(b.x) < TW / 2 + 0.15) {
        b.y = py;
        b.vy = -b.vy * 0.2;
        b.vx *= 0.3;
        fx('tick');
      }
      // отскок от стола
      if (b.z <= 0 && b.vz < 0 && inTable(b.x, b.y)) {
        const side = b.y < TL / 2 ? 0 : 1;
        b.z = 0;
        b.vz = -b.vz * 0.88;
        b.vx *= 0.97;
        b.vy *= 0.97;
        fx('drop');
        if (side === b.hitter) return point(s, 1 - b.hitter, 'В сетку или на свою половину', fx);
        b.bounces++;
        if (b.bounces >= 2) return point(s, b.hitter, 'Не отбил', fx);
      }
      // удар ракеткой: мяч пересекает линию игрока
      for (const side of [0, 1]) {
        if (side === b.hitter) continue;
        const cross = side === 0 ? py > PAD_Y[0] && b.y <= PAD_Y[0] : py < PAD_Y[1] && b.y >= PAD_Y[1];
        if (!cross) continue;
        if (b.bounces >= 1 && Math.abs(b.x - s.pads[side].x) < REACH && b.z > -0.25 && b.z < 1) {
          strike(s, side, inputs[side].f, fx);
          return;
        }
      }
      // мяч упал на пол
      if (b.z < -0.76 || b.y < -2 || b.y > TL + 2) {
        return point(s, b.bounces >= 1 ? b.hitter : 1 - b.hitter, b.bounces >= 1 ? 'Не отбил' : 'Аут', fx);
      }
    }
  }

  function over(s) {
    const [a, c] = s.score;
    if ((a >= WIN || c >= WIN) && Math.abs(a - c) >= 2) return { winner: a > c ? 0 : 1, text: 'Счёт ' + a + ' : ' + c + '.' };
    return null;
  }

  // ---------- компьютер ----------

  function predictX(s, side) {
    // куда прилетит мяч на линии игрока (с учётом отскока)
    const b = { ...s.ball };
    for (let k = 0; k < 400; k++) {
      const d = 1 / 120;
      b.vz -= GRAV * d;
      b.x += b.vx * d;
      b.y += b.vy * d;
      b.z += b.vz * d;
      if (b.z <= 0 && b.vz < 0 && inTable(b.x, b.y)) b.vz = -b.vz * 0.88;
      if (side === 0 ? b.y <= PAD_Y[0] : b.y >= PAD_Y[1]) return b.x;
    }
    return b.x;
  }

  const aiState = [{}, {}];
  function ai(s, side, level) {
    const inp = { u: false, d: false, l: false, r: false, f: false, px: null, py: null, speed: AI_SPEED[level] };
    const b = s.ball;
    const pad = s.pads[side];
    const st = aiState[side];
    let target = 0;
    if (!b.dead && !b.held && b.hitter !== side) {
      const key = s.id + ':' + s.rally + ':' + b.bounces;
      if (st.key !== key) {
        st.key = key;
        const err = { easy: 0.3, normal: 0.14, hard: 0.05 }[level];
        // целимся краем ракетки так, чтобы мяч ушёл подальше от соперника
        const opp = s.pads[1 - side].x;
        const want = level === 'easy' ? (Math.random() - 0.5) * 0.5 : (opp > 0 ? -1 : 1) * (level === 'hard' ? 0.4 : 0.3);
        st.target = predictX(s, side) + (Math.random() * 2 - 1) * err - want * REACH;
        st.smash = level === 'hard' ? Math.random() < 0.35 : level === 'normal' ? Math.random() < 0.15 : false;
      }
      target = st.target;
      inp.f = st.smash;
    } else if (b.held && b.hitter === side) {
      target = (Math.random() - 0.5) * 0.02;
    }
    const dx = target - pad.x;
    if (dx > 0.02) inp.r = true;
    if (dx < -0.02) inp.l = true;
    return inp;
  }

  // ---------- отрисовка ----------

  function draw(g, s, v) {
    pvpView = v.mode === 'pvp';
    const k = g.canvas.width / W;
    // поле не переворачиваем — у гостя своя камера с его конца стола
    g.setTransform(k, 0, 0, k, 0, 0);
    const me = v.flip ? 1 : 0;
    const P = (x, y, z) => {
      if (me === 1) {
        x = -x;
        y = TL - y;
      }
      const ry = y - CAM.y;
      return [W / 2 + (x * CAM.f) / ry, CAM.hy - ((z - CAM.z) * CAM.f) / ry, ry];
    };
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1f2937');
    sky.addColorStop(0.35, '#374151');
    sky.addColorStop(1, '#7c2d12');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    const quad = (pts, fill) => {
      g.fillStyle = fill;
      g.beginPath();
      pts.forEach(([x, y, z], i) => {
        const [sx, sy] = P(x, y, z);
        if (i) g.lineTo(sx, sy);
        else g.moveTo(sx, sy);
      });
      g.closePath();
      g.fill();
    };
    const hw = TW / 2;
    // торец стола и столешница
    const nearY = me === 0 ? 0 : TL;
    quad([[-hw, nearY, 0], [hw, nearY, 0], [hw, nearY, -0.06], [-hw, nearY, -0.06]], '#0b3b6f');
    quad([[-hw, 0, 0], [hw, 0, 0], [hw, TL, 0], [-hw, TL, 0]], '#1d4ed8');
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    const line = (a, b) => {
      const [x1, y1] = P(...a);
      const [x2, y2] = P(...b);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    };
    line([-hw, 0, 0], [hw, 0, 0]);
    line([hw, 0, 0], [hw, TL, 0]);
    line([hw, TL, 0], [-hw, TL, 0]);
    line([-hw, TL, 0], [-hw, 0, 0]);
    g.lineWidth = 1;
    line([0, 0, 0], [0, TL, 0]);
    const b = s.ball;
    const far = me === 0 ? 1 : 0;
    const ballFar = me === 0 ? b.y > TL / 2 : b.y < TL / 2;
    const drawPad = (side, alpha) => {
      const p = s.pads[side];
      const z = 0.18;
      const [sx, sy, ry] = P(p.x, PAD_Y[side], z);
      const r = (0.075 * CAM.f) / ry;
      g.globalAlpha = alpha;
      g.fillStyle = '#7c4a1e';
      g.fillRect(sx - r * 0.18, sy + r * 0.7, r * 0.36, r * 1.3);
      g.fillStyle = side === 0 ? '#ef4444' : '#111827';
      g.beginPath();
      g.ellipse(sx, sy, r, r * 1.1, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = side === 0 ? '#fca5a5' : '#9ca3af';
      g.lineWidth = 2;
      g.stroke();
      g.globalAlpha = 1;
    };
    const drawBall = () => {
      if (b.dead && s.msgT < 1) return;
      if (inTable(b.x, b.y) && b.z >= 0) {
        const [shx, shy, ry] = P(b.x, b.y, 0);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.ellipse(shx, shy, (0.03 * CAM.f) / ry, (0.012 * CAM.f) / ry, 0, 0, Math.PI * 2);
        g.fill();
      }
      const [bx, by, ry] = P(b.x, b.y, b.z);
      g.fillStyle = '#fb923c';
      g.beginPath();
      g.arc(bx, by, Math.max(2, (0.028 * CAM.f) / ry), 0, Math.PI * 2);
      g.fill();
    };
    drawPad(far, 1);
    if (ballFar) drawBall();
    // сетка
    const [n1x, n1y] = P(-hw - 0.15, TL / 2, NET);
    const [n2x] = P(hw + 0.15, TL / 2, NET);
    const [, n0y] = P(0, TL / 2, 0);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(Math.min(n1x, n2x), n1y, Math.abs(n2x - n1x), n0y - n1y);
    g.fillStyle = '#fff';
    g.fillRect(Math.min(n1x, n2x), n1y - 1, Math.abs(n2x - n1x), 3);
    if (!ballFar) drawBall();
    drawPad(1 - far, 0.6);
    // табло
    const n = names(v);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(12, 12, 150, 50);
    g.font = '700 14px system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    [0, 1].forEach((i) => {
      g.fillStyle = s.server === i ? '#fbbf24' : '#fff';
      g.fillText((s.server === i ? '● ' : '  ') + n[i], 20, 26 + i * 22);
      g.textAlign = 'right';
      g.fillText(String(s.score[i]), 150, 26 + i * 22);
      g.textAlign = 'left';
    });
    if (s.msgT > 0 && s.msg) {
      g.fillStyle = '#fff';
      g.font = '800 24px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(s.msg, W / 2, 40);
    }
  }

  const names = (v) => (v.mode === 'ai' ? ['Вы', 'Компьютер'] : v.mode === 'net' ? (v.me === 0 ? ['Вы', 'Соперник'] : ['Соперник', 'Вы']) : ['Ближний', 'Дальний']);

  SG.rt({
    game: 'pingpong',
    W,
    H,
    sides: ['Ближний игрок', 'Дальний игрок'],
    intro: 'Двигайте ракетку мышью или ← →. Мяч отбивается сам, когда ракетка на его пути; край ракетки уводит мяч в сторону. Пробел — сильный удар.',
    create,
    step,
    ai,
    draw,
    over,
    pad: true,
    pointer: 'xy',
    flipGuest: true,
    fireLabel: '💥',
    hud(s, v) {
      const n = names(v);
      return n[0] + ' ' + s.score[0] + ' : ' + s.score[1] + ' ' + n[1] + ' · подаёт ' + n[s.server].toLowerCase();
    },
  });
})();
