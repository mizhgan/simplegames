/* Реакция: кто быстрее нажмёт на зелёный сигнал — и не попадётся на жёлтую обманку */
(() => {
  'use strict';

  const W = 640;
  const H = 360;
  const ROUNDS = 10;
  const AI = { easy: { rt: 0.42, jitter: 0.12, jump: 0.05, fool: 0.25 }, normal: { rt: 0.31, jitter: 0.07, jump: 0.03, fool: 0.12 }, hard: { rt: 0.23, jitter: 0.04, jump: 0.01, fool: 0.05 } };
  const SHAPES = ['circle', 'square', 'star'];

  function newRound(s) {
    s.phase = 'wait';
    s.t = 0;
    s.delay = 1.4 + Math.random() * 2.6;
    s.fakeAt = Math.random() < 0.35 ? 0.6 + Math.random() * (s.delay - 0.9) : -1;
    s.shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    s.armed = [false, false];
    s.res = null;
  }

  function create() {
    const s = { round: 1, score: [0, 0], best: [null, null], times: [[], []], phase: 'wait' };
    newRound(s);
    s.delay += 0.8;
    return s;
  }

  function step(s, inputs, dt, fx) {
    s.t += dt;
    const press = [0, 1].map((i) => {
      // нажатие засчитывается, только если кнопку сначала отпустили
      if (!inputs[i].f) {
        s.armed[i] = true;
        return false;
      }
      if (!s.armed[i]) return false;
      s.armed[i] = false;
      return true;
    });
    if (s.phase === 'result') {
      if (s.t > 1.8) {
        if (s.round >= ROUNDS) {
          s.phase = 'done';
          return;
        }
        s.round++;
        newRound(s);
      }
      return;
    }
    if (s.phase === 'wait' || s.phase === 'fake') {
      if (s.phase === 'wait' && s.fakeAt > 0 && s.t >= s.fakeAt && s.t < s.fakeAt + 0.7) {
        s.phase = 'fake';
        fx('tick');
      } else if (s.phase === 'fake' && s.t >= s.fakeAt + 0.7) s.phase = 'wait';
      const early = press.indexOf(true);
      if (early >= 0) {
        const both = press[0] && press[1];
        if (!both) s.score[1 - early]++;
        s.res = { who: both ? null : 1 - early, why: s.phase === 'fake' ? 'fake' : 'early', by: early };
        s.phase = 'result';
        s.t = 0;
        fx('error');
        return;
      }
      if (s.phase === 'wait' && s.t >= s.delay) {
        s.phase = 'go';
        s.t = 0;
        fx('reveal');
      }
      return;
    }
    if (s.phase === 'go') {
      const hit = [0, 1].filter((i) => press[i]);
      if (hit.length) {
        const w = hit.length === 2 ? null : hit[0];
        const ms = Math.round(s.t * 1000);
        if (w !== null) {
          s.score[w]++;
          s.times[w].push(ms);
          if (s.best[w] === null || ms < s.best[w]) s.best[w] = ms;
        }
        s.res = { who: w, why: 'fast', ms };
        s.phase = 'result';
        s.t = 0;
        fx('hit');
        return;
      }
      if (s.t > 2) {
        s.res = { who: null, why: 'slow' };
        s.phase = 'result';
        s.t = 0;
      }
    }
  }

  const plan = [{}, {}];
  function ai(s, side, level) {
    const inp = { u: false, d: false, l: false, r: false, f: false, px: null, py: null };
    const c = AI[level];
    const p = plan[side];
    const key = s.round + ':' + s.phase;
    if (p.key !== key) {
      p.key = key;
      p.at = s.phase === 'go' ? c.rt + (Math.random() - 0.3) * c.jitter * 2 : s.phase === 'fake' ? (Math.random() < c.fool ? c.rt * 1.1 : 99) : s.phase === 'wait' && Math.random() < c.jump ? 0.5 + Math.random() * 1.5 : 99;
      p.hold = 0;
    }
    if (p.hold > 0) {
      p.hold -= 1 / 60;
      inp.f = true;
      return inp;
    }
    if (s.t >= p.at && (s.phase === 'go' || s.phase === 'fake' || s.phase === 'wait')) {
      p.at = 99;
      p.hold = 0.1;
      inp.f = true;
    }
    return inp;
  }

  const PAL = SG.colors.players; // [0] — синий, [1] — красный
  function shape(g, kind, x, y, r) {
    g.beginPath();
    if (kind === 'circle') g.arc(x, y, r, 0, Math.PI * 2);
    else if (kind === 'square') g.rect(x - r, y - r, 2 * r, 2 * r);
    else
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? r * 0.45 : r;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
    g.closePath();
    g.fill();
  }

  function draw(g, s, v) {
    const n = names(v);
    const bg = s.phase === 'go' ? '#16a34a' : s.phase === 'fake' ? '#a16207' : s.phase === 'result' ? '#1e293b' : '#7f1d1d';
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    if (s.phase === 'wait') {
      g.font = '800 38px system-ui, sans-serif';
      g.fillText('Ждите…', W / 2, H / 2);
      g.font = '600 15px system-ui, sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillText('Жмите, когда фон станет зелёным', W / 2, H / 2 + 40);
    } else if (s.phase === 'fake') {
      g.fillStyle = '#facc15';
      shape(g, s.shape, W / 2, H / 2 - 20, 60);
      g.fillStyle = '#fff';
      g.font = '800 24px system-ui, sans-serif';
      g.fillText('Не жмите!', W / 2, H / 2 + 70);
    } else if (s.phase === 'go') {
      g.fillStyle = '#fff';
      shape(g, s.shape, W / 2, H / 2 - 20, 60);
      g.font = '900 40px system-ui, sans-serif';
      g.fillText('ЖМИ!', W / 2, H / 2 + 72);
    } else if (s.res) {
      const r = s.res;
      g.font = '800 30px system-ui, sans-serif';
      let text;
      let sub = '';
      if (r.why === 'fast') {
        text = r.who === null ? 'Одновременно!' : 'Быстрее: ' + n[r.who];
        sub = r.ms + ' мс';
      } else if (r.why === 'slow') text = 'Никто не успел';
      else {
        text = (r.why === 'fake' ? 'Обманка! ' : 'Фальстарт! ') + n[r.by];
        sub = r.who === null ? 'оба поторопились' : 'очко получает ' + n[r.who];
      }
      g.fillStyle = r.who === null ? '#fff' : PAL[r.who];
      g.fillText(text, W / 2, H / 2 - 10);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.font = '600 18px system-ui, sans-serif';
      g.fillText(sub, W / 2, H / 2 + 30);
    }
    // счёт по бокам
    [0, 1].forEach((i) => {
      g.fillStyle = PAL[i];
      g.fillRect(i ? W - 90 : 10, 10, 80, 44);
      g.fillStyle = '#fff';
      g.font = '800 24px system-ui, sans-serif';
      g.fillText(String(s.score[i]), i ? W - 50 : 50, 33);
      g.font = '600 12px system-ui, sans-serif';
      g.fillText(n[i], i ? W - 50 : 50, 66);
    });
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.font = '700 14px system-ui, sans-serif';
    g.fillText('Попытка ' + Math.min(s.round, ROUNDS) + ' из ' + ROUNDS, W / 2, 24);
    g.textBaseline = 'alphabetic';
  }

  const names = (v) => (v.mode === 'ai' ? ['вы', 'компьютер'] : v.mode === 'net' ? (v.me === 0 ? ['вы', 'соперник'] : ['соперник', 'вы']) : ['синий', 'красный']);

  SG.rt({
    game: 'reaction',
    W,
    H,
    sides: ['Синий', 'Красный'],
    intro: 'Жмите пробел, как только фон станет зелёным. Жёлтая фигура — обманка! Вдвоём: синий — пробел, красный — Enter.',
    create,
    step,
    ai,
    draw,
    pad: true,
    fireLabel: 'Жми!',
    over(s) {
      if (s.phase !== 'done') return null;
      const [a, b] = s.score;
      const best = s.best.map((x) => (x === null ? '—' : x + ' мс'));
      return { winner: a === b ? null : a > b ? 0 : 1, text: 'Счёт ' + a + ' : ' + b + '. Лучшая реакция: ' + best[0] + ' и ' + best[1] + '.' };
    },
    hud(s, v) {
      const n = names(v);
      return 'Синий (' + n[0] + ') ' + s.score[0] + ' : ' + s.score[1] + ' красный (' + n[1] + ')';
    },
  });
})();
