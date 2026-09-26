/* Яйцелов — по мотивам «Ну, погоди!» (Электроника ИМ-02) */
(() => {
  'use strict';

  const W = 600;
  const H = 420;
  const STEPS = 5;
  // желоба: 0 — левый верхний, 1 — левый нижний, 2 — правый верхний, 3 — правый нижний
  const CHUTES = [
    { x1: 40, y1: 112, x2: 196, y2: 176 },
    { x1: 40, y1: 236, x2: 196, y2: 300 },
    { x1: 560, y1: 112, x2: 404, y2: 176 },
    { x1: 560, y1: 236, x2: 404, y2: 300 },
  ];
  const TONES = [0, -5, 4, -1];

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const overlay = SG.overlay();

  let mode = SG.store.get('eggs-mode', 'a');
  let state = 'idle';
  let pos, eggs, score, misses, tick, tickTimer, broken, hare, hareTimer, catchFlash;
  let best = SG.store.get('eggs-best', 0);
  let last = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(((w * H) / W) * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    draw();
  }

  function newGame() {
    pos = 0;
    eggs = [];
    score = 0;
    misses = 0;
    tickTimer = 0;
    broken = null;
    hare = false;
    hareTimer = 8 + Math.random() * 8;
    catchFlash = 0;
    state = 'playing';
    overlay.hidden = true;
    hud();
  }

  function hud() {
    $('score').textContent = score;
    $('best').textContent = best;
    const full = Math.floor(misses);
    const half = misses - full >= 0.5;
    $('misses').textContent = misses ? '🐣'.repeat(full) + (half ? '½' : '') : '—';
  }

  const interval = () => {
    const base = mode === 'b' ? 0.38 : 0.52;
    // скорость растёт с очками, а после каждой сотни чуть сбрасывается, как в оригинале
    const inHundred = score % 100;
    const hundreds = Math.floor(score / 100);
    return Math.max(0.14, base - hundreds * 0.05 - inHundred * 0.0022);
  };

  function step() {
    tick = (tick || 0) + 1;
    // двигаем яйца; то, что скатилось с конца желоба, ловим или роняем
    const next = [];
    for (const e of eggs) {
      e.s++;
      if (e.s < STEPS) {
        next.push(e);
        continue;
      }
      if (e.c === pos) {
        score++;
        catchFlash = 0.15;
        SG.sound.play('coin');
        // за 200 и 500 очков штрафы сгорают
        if (score === 200 || score === 500) {
          misses = 0;
          SG.sound.play('level');
        }
        if (score > best) {
          best = score;
          SG.store.set('eggs-best', best);
        }
      } else {
        misses += hare ? 0.5 : 1;
        broken = { c: e.c, t: 0 };
        SG.sound.play('error');
        if (misses >= 3) {
          eggs = next;
          hud();
          return gameOver();
        }
      }
      hud();
    }
    eggs = next;
    if (eggs.length) SG.sound.play('place', TONES[eggs[eggs.length - 1].c] + eggs[eggs.length - 1].s);
    // новое яйцо: не больше одного на каждой ступени, чтобы любое можно было поймать
    const maxEggs = Math.min(4, 1 + Math.floor(score / 12));
    const busy = new Set(eggs.map((e) => e.s));
    if (eggs.length < maxEggs && !busy.has(0) && Math.random() < 0.55) {
      eggs.push({ c: Math.floor(Math.random() * 4), s: 0 });
    } else if (!eggs.length) eggs.push({ c: Math.floor(Math.random() * 4), s: 0 });
  }

  function update(dt) {
    if (broken) {
      broken.t += dt;
      if (broken.t > 1.6) broken = null;
    }
    if (catchFlash > 0) catchFlash -= dt;
    if (state !== 'playing') return;
    hareTimer -= dt;
    if (hareTimer <= 0) {
      hare = !hare;
      hareTimer = hare ? 5 + Math.random() * 4 : 10 + Math.random() * 12;
    }
    tickTimer += dt;
    if (tickTimer >= interval()) {
      tickTimer = 0;
      step();
    }
  }

  function gameOver() {
    state = 'over';
    SG.sound.play('lose');
    overlay.title = 'Ну, погоди!';
    overlay.text = 'Поймано яиц: ' + score + '.' + (score && score === best ? ' Это рекорд! 🏆' : '');
    $('start-btn').textContent = 'Ещё раз';
    setTimeout(() => (overlay.hidden = false), 900);
  }

  // ---------- отрисовка ----------

  const INK = '#1f2a1d';
  const LCD = '#c9d4b8';

  function eggPos(c, s) {
    const ch = CHUTES[c];
    const k = s / (STEPS - 1);
    return [ch.x1 + (ch.x2 - ch.x1) * k, ch.y1 + (ch.y2 - ch.y1) * k - 11];
  }

  function hen(x, y, flip) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(flip ? -1 : 1, 1);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(16, -14, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(15, -24, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(23, -15);
    ctx.lineTo(30, -12);
    ctx.lineTo(23, -10);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(18, -16, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function wolf() {
    const left = pos < 2;
    const up = pos === 0 || pos === 2;
    const cx = W / 2;
    ctx.save();
    ctx.translate(cx, 0);
    ctx.scale(left ? 1 : -1, 1);
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#6b7280';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    // ноги
    ctx.beginPath();
    ctx.moveTo(-10, 330);
    ctx.lineTo(-22, 392);
    ctx.moveTo(14, 330);
    ctx.lineTo(24, 392);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(-28, 394, 12, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(30, 394, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // тело (штаны и майка)
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.roundRect(-26, 290, 54, 48, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.roundRect(-24, 222, 50, 76, 14);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#94a3b8';
    for (let y = 236; y < 296; y += 12) {
      ctx.beginPath();
      ctx.moveTo(-22, y);
      ctx.lineTo(24, y);
      ctx.stroke();
    }
    ctx.strokeStyle = INK;
    // голова
    ctx.fillStyle = '#6b7280';
    ctx.beginPath();
    ctx.ellipse(-4, 196, 26, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-18, 176);
    ctx.lineTo(-22, 148);
    ctx.lineTo(-6, 170);
    ctx.moveTo(8, 172);
    ctx.lineTo(16, 146);
    ctx.lineTo(20, 176);
    ctx.fill();
    ctx.stroke();
    // морда смотрит в сторону желоба
    ctx.beginPath();
    ctx.ellipse(-30, 204, 18, 11, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(-46, 200, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-14, 188, 7, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(-17, 190, 3, 0, Math.PI * 2);
    ctx.fill();
    // руки с корзиной
    const by = up ? 186 : 306;
    const bx = -96;
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#6b7280';
    ctx.beginPath();
    ctx.moveTo(-18, 236);
    ctx.lineTo(bx + 30, by + 2);
    ctx.moveTo(20, 236);
    ctx.quadraticCurveTo(0, by + 30, bx + 44, by + 8);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.moveTo(bx - 22, by - 6);
    ctx.lineTo(bx + 30, by - 6);
    ctx.lineTo(bx + 22, by + 20);
    ctx.lineTo(bx - 14, by + 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.moveTo(bx - 18, by + 4);
    ctx.lineTo(bx + 26, by + 4);
    ctx.moveTo(bx - 16, by + 12);
    ctx.lineTo(bx + 24, by + 12);
    ctx.stroke();
    if (catchFlash > 0) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(bx + 4, by - 10, 8, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    ctx.fillStyle = LCD;
    ctx.fillRect(0, 0, W, H);
    // земля и кусты
    ctx.fillStyle = '#a3b38d';
    ctx.fillRect(0, 380, W, 40);
    // желоба-насесты
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    CHUTES.forEach((c) => {
      ctx.beginPath();
      ctx.moveTo(c.x1 - (c.x2 > c.x1 ? 30 : -30), c.y1 - 12);
      ctx.lineTo(c.x2, c.y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c.x1 - (c.x2 > c.x1 ? 30 : -30), c.y1 - 12);
      ctx.lineTo(c.x1 - (c.x2 > c.x1 ? 30 : -30), 380);
      ctx.stroke();
    });
    hen(34, 92, false);
    hen(34, 216, false);
    hen(566, 92, true);
    hen(566, 216, true);
    // заяц в окошке
    if (hare) {
      ctx.fillStyle = '#f5f5f4';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(W / 2 - 110, 34, 5, 18, -0.2, 0, Math.PI * 2);
      ctx.ellipse(W / 2 - 96, 34, 5, 18, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(W / 2 - 103, 62, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(W / 2 - 108, 58, 2, 0, Math.PI * 2);
      ctx.arc(W / 2 - 98, 58, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('штраф ×½', W / 2 - 82, 66);
    }
    // яйца
    if (eggs)
      eggs.forEach((e) => {
        const [x, y] = eggPos(e.c, e.s);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(e.s * 0.9 * (e.c < 2 ? 1 : -1));
        ctx.fillStyle = '#fffbeb';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 7, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });
    // разбитое яйцо и убегающий цыплёнок
    if (broken) {
      const left = broken.c < 2;
      const bx = left ? 130 : W - 130;
      ctx.fillStyle = '#fef08a';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(bx, 386, 16, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const run = Math.min(1, broken.t / 1.4);
      const chx = bx + (left ? -1 : 1) * run * 110;
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(chx, 368 - (Math.floor(broken.t * 10) % 2) * 3, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (pos !== undefined) wolf();
    // счёт в стиле ЖКИ
    ctx.fillStyle = INK;
    ctx.font = '800 34px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(String(score || 0).padStart(3, '0'), W - 30, 48);
    // штрафные цыплята
    for (let k = 0; k < 3; k++) {
      const x = W - 150 + k * 26;
      const on = misses >= k + 1 ? 1 : misses >= k + 0.5 ? 0.5 : 0;
      ctx.globalAlpha = on ? (on === 1 ? 1 : 0.5) : 0.12;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(x, 72, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (state === 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.font = '800 32px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Пауза', W / 2, H / 2);
    }
  }

  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // ---------- управление ----------

  function move(p) {
    if (state !== 'playing') return;
    pos = p;
  }

  function togglePause() {
    if (state === 'playing') state = 'paused';
    else if (state === 'paused') state = 'playing';
    $('pause-btn').textContent = state === 'paused' ? 'Продолжить' : 'Пауза';
  }

  const KEYS = { KeyQ: 0, KeyA: 1, KeyP: 2, KeyL: 3, KeyE: 2, KeyD: 3, Numpad7: 0, Numpad1: 1, Numpad9: 2, Numpad3: 3 };
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code in KEYS) move(KEYS[e.code]);
    else if (e.code === 'ArrowLeft') move(pos === 2 ? 0 : pos === 3 ? 1 : pos);
    else if (e.code === 'ArrowRight') move(pos === 0 ? 2 : pos === 1 ? 3 : pos);
    else if (e.code === 'ArrowUp') move(pos === 1 ? 0 : pos === 3 ? 2 : pos);
    else if (e.code === 'ArrowDown') move(pos === 0 ? 1 : pos === 2 ? 3 : pos);
    else if (e.code === 'Escape' || e.code === 'Space') {
      if (state === 'idle' || state === 'over') {
        if (e.code === 'Space') newGame();
      } else togglePause();
    } else if (e.code === 'Enter' && (state === 'idle' || state === 'over')) newGame();
    else return;
    e.preventDefault();
  });
  window.addEventListener('blur', () => state === 'playing' && togglePause());
  // касание поля: четверть экрана = положение корзины
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const left = e.clientX - r.left < r.width / 2;
    const up = e.clientY - r.top < r.height * 0.55;
    move(left ? (up ? 0 : 1) : up ? 2 : 3);
  });
  SG.touchKeys($('touch'), {}, (code) => move(Number(code)));

  SG.segmented($('mode'), mode, (v) => {
    mode = v;
    SG.store.set('eggs-mode', v);
    if (state === 'playing' || state === 'paused') newGame();
  });
  $('start-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  $('pause-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    togglePause();
  });
  window.addEventListener('resize', resize);

  pos = 0;
  eggs = [];
  score = 0;
  misses = 0;
  hud();
  resize();
  last = performance.now();
  requestAnimationFrame(frame);
})();
