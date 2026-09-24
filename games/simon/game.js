/* Саймон говорит — повторите последовательность */
(() => {
  'use strict';

  const TONES = [0, 4, 7, 12]; // сдвиг высоты звука для каждой кнопки, в полутонах

  const $ = (id) => document.getElementById(id);
  const pads = [...document.querySelectorAll('.sm-pad')];
  const centerEl = $('center');
  const statusEl = $('status');

  let seq = [];
  let pos = 0;
  let state = 'idle'; // idle | showing | input | over
  let best = SG.store.get('simon-best', 0);
  let timers = [];
  $('best').textContent = best;

  function light(k, ms) {
    const pad = pads[k];
    pad.classList.add('lit');
    SG.sound.play('place', TONES[k]);
    timers.push(setTimeout(() => pad.classList.remove('lit'), ms));
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
    pads.forEach((p) => p.classList.remove('lit'));
  }

  function show() {
    state = 'showing';
    pos = 0;
    centerEl.textContent = seq.length;
    statusEl.textContent = 'Запоминайте…';
    // чем длиннее цепочка, тем быстрее показ
    const step = Math.max(260, 620 - seq.length * 22);
    seq.forEach((k, i) => timers.push(setTimeout(() => light(k, step * 0.65), 500 + i * step)));
    timers.push(
      setTimeout(() => {
        state = 'input';
        statusEl.textContent = 'Ваша очередь: повторите.';
      }, 500 + seq.length * step)
    );
  }

  function next() {
    seq.push(Math.floor(Math.random() * 4));
    show();
  }

  function press(k) {
    if (state !== 'input') return;
    light(k, 220);
    if (seq[pos] !== k) return fail();
    pos++;
    if (pos === seq.length) {
      const score = seq.length;
      $('score').textContent = score;
      if (score > best) {
        best = score;
        SG.store.set('simon-best', best);
        $('best').textContent = best;
      }
      state = 'showing';
      statusEl.textContent = 'Верно!';
      timers.push(setTimeout(next, 700));
    }
  }

  function fail() {
    state = 'over';
    clearTimers();
    SG.sound.play('error');
    const score = seq.length - 1;
    centerEl.textContent = '✕';
    statusEl.textContent = 'Ошибка! Вы запомнили ' + score + ' ' + plural(score) + '. Нажмите «Старт», чтобы сыграть ещё.';
    document.querySelector('.sm-board').classList.add('fail');
    setTimeout(() => document.querySelector('.sm-board').classList.remove('fail'), 600);
  }

  const plural = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'шаг' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'шага' : 'шагов');

  function start() {
    clearTimers();
    seq = [];
    $('score').textContent = 0;
    SG.sound.play('level');
    next();
  }

  pads.forEach((pad, k) =>
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      press(k);
    })
  );
  centerEl.addEventListener('click', () => {
    if (state === 'idle' || state === 'over') start();
  });
  $('start-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    start();
  });
  const KEYMAP = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, KeyQ: 0, KeyW: 1, KeyA: 2, KeyS: 3 };
  document.addEventListener('keydown', (e) => {
    if (e.code in KEYMAP) press(KEYMAP[e.code]);
    else if ((e.code === 'Space' || e.code === 'Enter') && state !== 'showing' && state !== 'input') {
      e.preventDefault();
      start();
    }
  });
})();
