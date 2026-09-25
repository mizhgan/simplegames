/* Понг: против компьютера, вдвоём и по сети */
(() => {
  'use strict';

  const W = 600;
  const H = 400;
  const PAD_W = 12;
  const PAD_H = 72;
  const BALL = 10;
  const WIN = 7;
  const PAD_X = [24, W - 24 - PAD_W];
  const AI_SPEED = { easy: 230, normal: 330, hard: 460 };

  function serve(s, dir) {
    s.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, speed: 330, dir, wait: 0.9 };
  }

  function create() {
    const s = { pads: [H / 2 - PAD_H / 2, H / 2 - PAD_H / 2], score: [0, 0], seed: Math.random() };
    serve(s, Math.random() < 0.5 ? -1 : 1);
    return s;
  }

  function movePad(s, side, inp, dt) {
    let y = s.pads[side];
    if (inp.py !== null && inp.py !== undefined) {
      const d = inp.py - (y + PAD_H / 2);
      y += Math.max(-900 * dt, Math.min(900 * dt, d));
    } else y += ((inp.d ? 1 : 0) - (inp.u ? 1 : 0)) * 420 * dt;
    s.pads[side] = Math.max(0, Math.min(H - PAD_H, y));
  }

  function hit(s, side, fx) {
    const b = s.ball;
    const dir = side === 0 ? 1 : -1;
    const x = PAD_X[side];
    const py = s.pads[side];
    if (Math.sign(b.vx) === dir) return;
    if (b.x + BALL / 2 < x || b.x - BALL / 2 > x + PAD_W) return;
    if (b.y + BALL / 2 < py || b.y - BALL / 2 > py + PAD_H) return;
    // угол отскока зависит от места удара
    const rel = (b.y - (py + PAD_H / 2)) / (PAD_H / 2);
    b.speed = Math.min(900, b.speed * 1.06);
    b.vx = Math.cos(rel) * b.speed * dir;
    b.vy = Math.sin(rel) * b.speed;
    b.x = dir > 0 ? x + PAD_W + BALL / 2 : x - BALL / 2;
    fx('bounce');
  }

  function step(s, inputs, dt, fx) {
    movePad(s, 0, inputs[0], dt);
    movePad(s, 1, inputs[1], dt);
    const b = s.ball;
    if (b.wait > 0) {
      b.wait -= dt;
      if (b.wait <= 0) {
        const a = (Math.random() - 0.5) * 0.8;
        b.vx = Math.cos(a) * b.speed * b.dir;
        b.vy = Math.sin(a) * b.speed;
      }
      return;
    }
    for (let k = 0; k < 3; k++) {
      b.x += (b.vx * dt) / 3;
      b.y += (b.vy * dt) / 3;
      if (b.y < BALL / 2) {
        b.y = BALL / 2;
        b.vy = Math.abs(b.vy);
        fx('tick');
      } else if (b.y > H - BALL / 2) {
        b.y = H - BALL / 2;
        b.vy = -Math.abs(b.vy);
        fx('tick');
      }
      hit(s, 0, fx);
      hit(s, 1, fx);
    }
    if (b.x < -20 || b.x > W + 20) {
      const who = b.x < 0 ? 1 : 0;
      s.score[who]++;
      fx('coin');
      if (s.score[who] < WIN) serve(s, who === 0 ? 1 : -1);
    }
  }

  // компьютер следит за мячом с ограниченной скоростью и небольшой ошибкой
  function ai(s, side, level) {
    const b = s.ball;
    const coming = side === 1 ? b.vx > 0 : b.vx < 0;
    const wobble = Math.sin(performance.now() / 300) * (level === 'hard' ? 8 : 22);
    const target = coming ? b.y + wobble : H / 2;
    const c = s.pads[side] + PAD_H / 2;
    const maxStep = AI_SPEED[level] / 60;
    const py = c + Math.max(-maxStep, Math.min(maxStep, target - c));
    return { u: false, d: false, l: false, r: false, f: false, px: null, py };
  }

  function draw(g, s, v) {
    const c = v.colors;
    g.fillStyle = c.bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = c.line;
    for (let y = 8; y < H; y += 24) g.fillRect(W / 2 - 2, y, 4, 12);
    g.fillStyle = c.text;
    g.globalAlpha = 0.25;
    g.font = '800 64px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillText(s.score[0], W / 2 - 70, 80);
    g.fillText(s.score[1], W / 2 + 70, 80);
    g.globalAlpha = 1;
    g.fillStyle = c.accent;
    g.fillRect(PAD_X[0], s.pads[0], PAD_W, PAD_H);
    g.fillStyle = c.accent2;
    g.fillRect(PAD_X[1], s.pads[1], PAD_W, PAD_H);
    g.fillStyle = c.text;
    g.fillRect(s.ball.x - BALL / 2, s.ball.y - BALL / 2, BALL, BALL);
  }

  const names = (v) => (v.mode === 'ai' ? ['Вы', 'Компьютер'] : v.mode === 'net' ? (v.me === 0 ? ['Вы', 'Соперник'] : ['Соперник', 'Вы']) : ['Игрок 1', 'Игрок 2']);

  SG.rt({
    game: 'pong',
    W,
    H,
    sides: ['Левая ракетка', 'Правая ракетка'],
    intro: 'Отбивайте мяч ракеткой. До ' + WIN + ' очков.',
    create,
    step,
    ai,
    draw,
    pointer: 'y',
    over: (s) => (s.score[0] >= WIN || s.score[1] >= WIN ? { winner: s.score[0] >= WIN ? 0 : 1, text: 'Счёт ' + s.score[0] + ' : ' + s.score[1] + '.' } : null),
    hud(s, v) {
      const n = names(v);
      return n[0] + ' ' + s.score[0] + ' : ' + s.score[1] + ' ' + n[1];
    },
  });
})();
