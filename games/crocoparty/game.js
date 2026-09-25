/* Крокодил для компании: один рисует, остальные угадывают в чате — кто быстрее */
(() => {
  'use strict';

  const esc = SG.party.esc;
  const COLORS = ['#1f2233', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#8b5a2b', '#ffffff'];
  const SIZES = [3, 7, 16];
  const CHOOSE = 15;
  const REVEAL = 6000;
  const pretty = (w) => w.replace(/-/g, ' ');
  const norm = (w) => String(w).toLowerCase().replace(/ё/g, 'е').replace(/[\s-]+/g, ' ').replace(/[.!?,]/g, '').trim();

  // ---------- правила ----------

  function pool(level) {
    const W = window.CROC_WORDS;
    return level === 'hard' ? W.hard : level === 'mix' ? W.easy.concat(W.hard) : W.easy;
  }

  function create(players, opts) {
    const o = opts || {};
    const s = {
      ids: players.map((p) => p.id),
      names: {},
      score: {},
      laps: +o.laps || 1,
      time: +o.time || 80,
      level: o.level || 'easy',
      turn: -1,
      round: 0,
      phase: 'choose',
      now: Date.now(),
      used: [],
    };
    players.forEach((p) => {
      s.names[p.id] = p.name;
      s.score[p.id] = 0;
    });
    nextRound(s, s.now);
    return s;
  }

  function nextRound(s, now) {
    s.turn++;
    if (s.turn >= s.ids.length * s.laps) {
      s.phase = 'end';
      const best = Math.max(...s.ids.map((id) => s.score[id]));
      s.winners = s.ids.filter((id) => s.score[id] === best);
      return;
    }
    s.round++;
    s.drawer = s.ids[s.turn % s.ids.length];
    const words = pool(s.level).filter((w) => !s.used.includes(w));
    s.options = SG.shuffle(words.slice()).slice(0, 3);
    s.word = null;
    s.phase = 'choose';
    s.deadline = now + CHOOSE * 1000;
    s.guessed = [];
    s.strokes = [];
    s.hints = [];
  }

  function begin(s, w, now) {
    s.word = w;
    s.used.push(w);
    s.phase = 'draw';
    s.started = now;
    s.deadline = now + s.time * 1000;
  }

  function endRound(s, now) {
    s.phase = 'reveal';
    s.deadline = now + REVEAL;
    // рисующему — очки за каждого угадавшего
    s.score[s.drawer] += s.guessed.length * 3;
  }

  function act(s, id, a, now) {
    if (!a) return false;
    if (s.phase === 'choose' && id === s.drawer && s.options.includes(a.word)) {
      begin(s, a.word, now);
      return true;
    }
    if (s.phase === 'draw' && id === s.drawer && a.skip) {
      endRound(s, now);
      return true;
    }
    return false;
  }

  // догадки приходят через чат
  function chat(s, id, text) {
    if (s.phase !== 'draw' || !s.word) return undefined;
    const w = norm(s.word);
    const t = norm(text);
    if (id === s.drawer) return t.includes(w) ? false : undefined;
    if (s.guessed.includes(id)) return t.includes(w) ? false : undefined;
    if (t === w) {
      s.guessed.push(id);
      // первый — 10 очков, дальше меньше
      s.score[id] += Math.max(3, 11 - s.guessed.length * 2 + 1);
      if (s.guessed.length >= s.ids.length - 1) endRound(s, s.now);
      return '✅ угадал(а)!';
    }
    if (t.includes(w)) return false;
    // почти угадал — подскажем только ему
    if (Math.abs(t.length - w.length) <= 1 && dist(t, w) === 1) {
      s.close = { id, at: s.now };
    }
    return undefined;
  }

  function dist(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }

  function tick(s, now) {
    s.now = now;
    if (s.phase === 'end') return false;
    if (s.phase === 'draw') {
      // подсказки: открываем буквы на половине и трёх четвертях времени
      const part = (now - s.started) / (s.time * 1000);
      const want = part > 0.75 ? 2 : part > 0.5 ? 1 : 0;
      if (s.hints.length < want) {
        const idx = [...s.word].map((ch, i) => i).filter((i) => /[а-яё]/i.test(s.word[i]) && !s.hints.includes(i));
        if (idx.length > 2) s.hints.push(idx[Math.floor(Math.random() * idx.length)]);
        else s.hints.push(-1);
        return true;
      }
    }
    if (now < s.deadline) return false;
    if (s.phase === 'choose') begin(s, s.options[0], now);
    else if (s.phase === 'draw') endRound(s, now);
    else if (s.phase === 'reveal') nextRound(s, now);
    return true;
  }

  // рисунок идёт напрямую всем, хозяин хранит его для опоздавших
  function relay(s, id, m) {
    if (s.phase !== 'draw' || id !== s.drawer || !m) return false;
    if (m.clear) s.strokes = [];
    else if (m.undo) s.strokes.pop();
    else if (Array.isArray(m.s)) {
      for (const part of m.s) {
        if (!part || !Array.isArray(part.p)) continue;
        if (part.n || !s.strokes.length) s.strokes.push({ c: part.c, w: part.w, p: part.p.slice(0, 400) });
        else s.strokes[s.strokes.length - 1].p.push(...part.p.slice(0, 400));
      }
    } else return false;
    m.r = s.round;
    return true;
  }

  function leave(s, id) {
    if (s.drawer === id && (s.phase === 'draw' || s.phase === 'choose')) endRound(s, s.now);
  }

  // ---------- вид ----------

  function view(s, id) {
    const drawing = s.drawer === id;
    const reveal = s.phase === 'reveal' || s.phase === 'end';
    const mask = s.word ? [...s.word].map((ch, i) => (/[а-яё]/i.test(ch) ? (s.hints.includes(i) ? ch : '_') : ch === '-' ? ' ' : ch)).join('') : '';
    return {
      phase: s.phase,
      round: s.round,
      total: s.ids.length * s.laps,
      drawer: s.drawer,
      options: drawing && s.phase === 'choose' ? s.options : null,
      word: s.word && (drawing || reveal || s.guessed.includes(id)) ? pretty(s.word) : null,
      mask,
      guessed: s.guessed,
      scores: s.ids.map((pid) => ({ id: pid, name: s.names[pid], score: s.score[pid] })),
      left: Math.max(0, (s.deadline - Date.now()) / 1000),
      strokes: s.strokes,
      close: s.close && s.close.id === id && s.now - s.close.at < 4000,
      over: s.phase === 'end',
      winners: s.winners || null,
    };
  }

  // ---------- отрисовка ----------

  let built = null;
  function build(el) {
    el.innerHTML =
      '<div class="pt-panel cp">' +
      '<div class="cp-top"><span class="cp-status"></span><span class="pt-timer cp-timer" data-left="0">0</span></div>' +
      '<div class="cp-word" aria-live="polite"></div>' +
      '<div class="pt-seats cp-scores"></div>' +
      '<div class="cr-canvas-wrap"><canvas class="cr-canvas" aria-label="Холст"></canvas><div class="cr-pick" hidden></div></div>' +
      '<div class="cr-tools" hidden></div>' +
      '<form class="cp-guess"><input type="text" maxlength="40" placeholder="Ваш вариант…" autocomplete="off"><button class="btn btn-primary" type="submit">Это…</button></form>' +
      '<div class="cp-end" hidden></div></div>';
    const b = {
      el,
      canvas: el.querySelector('canvas'),
      tools: el.querySelector('.cr-tools'),
      pick: el.querySelector('.cr-pick'),
      status: el.querySelector('.cp-status'),
      timer: el.querySelector('.cp-timer'),
      word: el.querySelector('.cp-word'),
      scores: el.querySelector('.cp-scores'),
      guess: el.querySelector('.cp-guess'),
      end: el.querySelector('.cp-end'),
      strokes: [],
      round: -1,
      color: COLORS[0],
      size: SIZES[1],
      current: null,
      out: [],
      ui: null,
      v: null,
    };
    b.ctx = b.canvas.getContext('2d');
    COLORS.forEach((c) => {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'cr-color';
      x.style.background = c;
      x.setAttribute('aria-label', 'Цвет');
      x.addEventListener('click', () => {
        b.color = c;
        tools(b);
      });
      b.tools.appendChild(x);
    });
    SIZES.forEach((w) => {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'cr-size';
      x.innerHTML = `<i style="width:${w + 2}px;height:${w + 2}px"></i>`;
      x.addEventListener('click', () => {
        b.size = w;
        tools(b);
      });
      b.tools.appendChild(x);
    });
    const mk = (label, fn, title) => {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'btn btn-ghost';
      x.textContent = label;
      if (title) x.title = title;
      x.addEventListener('click', fn);
      b.tools.appendChild(x);
    };
    mk('↶', () => {
      b.strokes.pop();
      redraw(b);
      b.ui.relay({ undo: 1 });
    }, 'Отменить штрих');
    mk('Очистить', () => {
      b.strokes = [];
      redraw(b);
      b.ui.relay({ clear: 1 });
    });
    mk('Сдаться', () => b.ui.send({ skip: 1 }), 'Закончить раунд');
    const pos = (e) => {
      const r = b.canvas.getBoundingClientRect();
      return [+Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)).toFixed(4), +Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)).toFixed(4)];
    };
    const canDraw = () => b.v && b.v.phase === 'draw' && b.v.drawer === b.ui.me;
    b.canvas.addEventListener('pointerdown', (e) => {
      if (!canDraw()) return;
      b.canvas.setPointerCapture(e.pointerId);
      const [x, y] = pos(e);
      b.current = { c: b.color, w: b.size, p: [x, y] };
      b.strokes.push(b.current);
      stroke(b, b.current);
      b.out.push({ n: 1, c: b.color, w: b.size, p: [x, y] });
    });
    b.canvas.addEventListener('pointermove', (e) => {
      if (!b.current) return;
      const [x, y] = pos(e);
      const p = b.current.p;
      if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) < 0.003) return;
      const from = p.length;
      p.push(x, y);
      stroke(b, b.current, from);
      b.out.push({ p: [x, y] });
    });
    const up = () => (b.current = null);
    b.canvas.addEventListener('pointerup', up);
    b.canvas.addEventListener('pointercancel', up);
    // штрихи — пачками 20 раз в секунду
    b.flush = setInterval(() => {
      if (!b.out.length || !b.el.isConnected) return;
      const out = [];
      for (const x of b.out) {
        const last = out[out.length - 1];
        if (!x.n && last) last.p.push(...x.p);
        else out.push({ n: x.n, c: x.c, w: x.w, p: x.p.slice() });
      }
      b.out = [];
      b.ui.relay({ s: out });
    }, 50);
    b.guess.addEventListener('submit', (e) => {
      e.preventDefault();
      const i = b.guess.querySelector('input');
      if (i.value.trim()) b.ui.say(i.value.trim());
      i.value = '';
    });
    const fit = () => {
      const r = b.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      b.canvas.width = Math.round(r.width * dpr) || 600;
      b.canvas.height = Math.round(r.height * dpr) || 400;
      redraw(b);
    };
    window.addEventListener('resize', fit);
    b.fit = fit;
    requestAnimationFrame(fit);
    return b;
  }

  function stroke(b, s, from) {
    const W = b.canvas.width;
    const H = b.canvas.height;
    const ctx = b.ctx;
    ctx.strokeStyle = s.c;
    ctx.lineWidth = s.w * (W / 600);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const p = s.p;
    const start = Math.max(0, (from || 0) - 2);
    ctx.moveTo(p[start] * W, p[start + 1] * H);
    if (p.length === 2) ctx.lineTo(p[0] * W + 0.1, p[1] * H);
    for (let i = start + 2; i < p.length; i += 2) ctx.lineTo(p[i] * W, p[i + 1] * H);
    ctx.stroke();
  }

  function redraw(b) {
    b.ctx.fillStyle = '#fff';
    b.ctx.fillRect(0, 0, b.canvas.width, b.canvas.height);
    b.strokes.forEach((s) => stroke(b, s));
  }

  function tools(b) {
    b.tools.querySelectorAll('.cr-color').forEach((x, i) => x.classList.toggle('active', COLORS[i] === b.color));
    b.tools.querySelectorAll('.cr-size').forEach((x, i) => x.classList.toggle('active', SIZES[i] === b.size));
  }

  const points = (list) => list.reduce((a, s) => a + s.p.length, 0);

  function render(v, ui) {
    if (!built || !built.el.isConnected || built.el !== ui.el || !ui.el.querySelector('.cp')) built = build(ui.el);
    const b = built;
    b.ui = ui;
    b.v = v;
    const me = ui.me;
    const drawing = v.drawer === me;
    // новый раунд — чистый холст; иначе догоняем рисунок, если отстали
    if (b.round !== v.round) {
      b.round = v.round;
      b.strokes = JSON.parse(JSON.stringify(v.strokes || []));
      b.out = [];
      redraw(b);
    } else if (!drawing && points(v.strokes || []) > points(b.strokes)) {
      b.strokes = JSON.parse(JSON.stringify(v.strokes));
      redraw(b);
    }
    b.timer.dataset.left = v.left;
    b.timer.textContent = Math.ceil(v.left);
    b.timer.hidden = v.over;
    let status;
    if (v.over) status = 'Игра окончена';
    else if (v.phase === 'choose') status = drawing ? 'Выберите слово' : esc(ui.name(v.drawer)) + ' выбирает слово…';
    else if (v.phase === 'draw') status = drawing ? 'Рисуйте! Угадали: ' + v.guessed.length + ' из ' + (v.scores.length - 1) : 'Рисует ' + esc(ui.name(v.drawer)) + ' — пишите догадки';
    else status = 'Это было слово:';
    b.status.innerHTML = `Раунд ${Math.min(v.round, v.total)} из ${v.total} · ${status}`;
    b.word.textContent = v.phase === 'draw' ? (v.word ? v.word : v.mask.split('').join(' ')) : v.phase === 'reveal' ? v.word : '';
    b.word.classList.toggle('mask', v.phase === 'draw' && !v.word);
    if (v.close) b.word.textContent += '  · почти!';
    b.scores.innerHTML = v.scores
      .slice()
      .sort((x, y) => y.score - x.score)
      .map((p) => `<div class="pt-seat${p.id === v.drawer ? ' turn' : ''}${p.id === me ? ' me' : ''}"><b>${p.id === v.drawer ? '✏ ' : v.guessed.includes(p.id) ? '✅ ' : ''}${esc(p.name)}</b><span>${p.score}</span></div>`)
      .join('');
    b.tools.hidden = !(drawing && v.phase === 'draw');
    tools(b);
    b.guess.hidden = drawing || v.phase !== 'draw' || v.guessed.includes(me) || ui.watcher;
    b.canvas.style.cursor = drawing && v.phase === 'draw' ? 'crosshair' : 'default';
    if (v.options) {
      b.pick.hidden = false;
      b.pick.innerHTML = '<p>Что будете рисовать?</p>' + v.options.map((w) => `<button class="btn btn-primary" type="button" data-w="${esc(w)}">${esc(pretty(w))}</button>`).join('');
      b.pick.querySelectorAll('[data-w]').forEach((x) => x.addEventListener('click', () => ui.send({ word: x.dataset.w })));
    } else b.pick.hidden = true;
    b.end.hidden = !v.over;
    if (v.over) {
      const w = v.winners || [];
      b.end.innerHTML = `<p class="pt-big">${w.includes(me) ? 'Вы победили! 🏆' : 'Победа: ' + w.map((x) => esc(ui.name(x))).join(', ')}</p>`;
    }
    const key = v.phase + v.round;
    if (render.key !== key) {
      render.key = key;
      if (v.phase === 'reveal') SG.sound.play(v.guessed.includes(me) || (drawing && v.guessed.length) ? 'match' : 'flip');
      if (v.phase === 'choose' && drawing) SG.sound.play('hint');
      if (v.over) {
        const won = (v.winners || []).includes(me);
        SG.sound.play(won ? 'win' : 'lose');
        if (won) SG.store.set('crocoparty-wins', SG.store.get('crocoparty-wins', 0) + 1);
      }
    }
  }

  function onRelay(m, ui) {
    if (!built || !built.v || m.r !== built.round || built.v.drawer === ui.me) return;
    const b = built;
    if (m.clear) b.strokes = [];
    else if (m.undo) b.strokes.pop();
    else if (Array.isArray(m.s)) {
      for (const part of m.s) {
        if (part.n || !b.strokes.length) {
          b.strokes.push({ c: part.c, w: part.w, p: part.p.slice() });
          stroke(b, b.strokes[b.strokes.length - 1]);
        } else {
          const s = b.strokes[b.strokes.length - 1];
          const from = s.p.length;
          s.p.push(...part.p);
          stroke(b, s, from);
        }
      }
      return;
    }
    redraw(b);
  }

  SG.party({
    game: 'crocoparty',
    min: 2,
    max: 10,
    bots: false,
    onReset: () => (built = null),
    options: {
      html:
        '<label>Слова <select data-level><option value="easy">Простые</option><option value="mix">Смешанные</option><option value="hard">Сложные</option></select></label>' +
        '<label>Каждый рисует <select data-laps><option value="1">1 раз</option><option value="2">2 раза</option><option value="3">3 раза</option></select></label>' +
        '<label>Время на рисунок <select data-time><option value="60">60 секунд</option><option value="80" selected>80 секунд</option><option value="100">100 секунд</option></select></label>',
      read: (el) => ({ level: el.querySelector('[data-level]').value, laps: +el.querySelector('[data-laps]').value, time: +el.querySelector('[data-time]').value }),
      show(el, o) {
        if (!o) return;
        if (o.level) el.querySelector('[data-level]').value = o.level;
        if (o.laps) el.querySelector('[data-laps]').value = String(o.laps);
        if (o.time) el.querySelector('[data-time]').value = String(o.time);
      },
    },
    create,
    view,
    act,
    tick,
    chat,
    relay,
    onRelay,
    leave,
    render,
  });
})();
