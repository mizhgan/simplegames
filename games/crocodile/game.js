/* Крокодил-рисовалка: один рисует слово, другой угадывает */
(() => {
  'use strict';

  const ROUND_SEC = 90;
  const COLORS = ['#1f2233', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#8b5a2b', '#ffffff'];
  const SIZES = [3, 7, 16];
  const pretty = (w) => w.replace(/-/g, ' ');
  const norm = (w) => w.toLowerCase().replace(/ё/g, 'е').replace(/[\s-]+/g, ' ').trim();

  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  const statusEl = $('status');
  const wordEl = $('word');
  const timerEl = $('timer');
  const chatEl = $('chat');
  const guessForm = $('guess-form');
  const guessInput = $('guess-input');
  const toolsEl = $('tools');
  const pickEl = $('pick');
  const partyEl = $('party');
  const diffEl = $('difficulty');

  let mode = 'pvp'; // pvp — компания у одного экрана, net — по сети
  let level = SG.store.get('croc-diff', 'easy');
  let drawer = true; // рисую ли я
  let word = '';
  let revealed = false;
  let roundOn = false;
  let deadline = 0;
  let timerId = 0;
  let color = COLORS[0];
  let size = SIZES[1];
  let strokes = []; // [{c, w, p: [x, y, …]}] в долях от размера холста
  let current = null;
  let outBuf = [];
  const score = { me: 0, them: 0, rounds: 0 };

  // ---------- холст ----------

  function fit() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    redraw();
  }

  function drawStroke(s, from) {
    const W = canvas.width;
    const H = canvas.height;
    const k = W / 600;
    ctx.strokeStyle = s.c;
    ctx.lineWidth = s.w * k;
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

  function redraw() {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    strokes.forEach((s) => drawStroke(s));
  }

  const canDraw = () => roundOn && drawer && (mode !== 'pvp' || revealed);

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!canDraw()) return;
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    current = { c: color, w: size, p: [x, y] };
    strokes.push(current);
    drawStroke(current);
    queue({ t: 'd', c: color, w: size, p: [x, y], n: 1 });
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!current) return;
    const [x, y] = pos(e);
    const p = current.p;
    if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) < 0.003) return;
    const from = p.length;
    p.push(+x.toFixed(4), +y.toFixed(4));
    drawStroke(current, from);
    queue({ t: 'd', p: [+x.toFixed(4), +y.toFixed(4)] });
  });
  const end = () => (current = null);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // отправляем штрихи пачками ~20 раз в секунду
  function queue(part) {
    if (mode !== 'net') return;
    outBuf.push(part);
  }
  setInterval(() => {
    if (!outBuf.length || mode !== 'net' || !net.active) return;
    // склеиваем точки одного штриха
    const out = [];
    for (const x of outBuf) {
      const last = out[out.length - 1];
      if (!x.n && last) last.p.push(...x.p);
      else out.push({ c: x.c, w: x.w, p: x.p.slice(), n: x.n });
    }
    outBuf = [];
    net.send({ t: 'strokes', s: out });
  }, 50);

  // ---------- инструменты ----------

  COLORS.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cr-color';
    b.style.background = c;
    b.setAttribute('aria-label', 'Цвет');
    b.addEventListener('click', () => {
      color = c;
      renderTools();
    });
    toolsEl.appendChild(b);
  });
  SIZES.forEach((w) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cr-size';
    b.innerHTML = `<i style="width:${w + 2}px;height:${w + 2}px"></i>`;
    b.setAttribute('aria-label', 'Толщина ' + w);
    b.addEventListener('click', () => {
      size = w;
      renderTools();
    });
    toolsEl.appendChild(b);
  });
  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.className = 'btn btn-ghost';
  undoBtn.textContent = '↶';
  undoBtn.title = 'Отменить штрих';
  undoBtn.addEventListener('click', () => {
    if (!canDraw()) return;
    strokes.pop();
    redraw();
    if (mode === 'net') net.send({ t: 'undo' });
  });
  toolsEl.appendChild(undoBtn);
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn btn-ghost';
  clearBtn.textContent = 'Очистить';
  clearBtn.addEventListener('click', () => {
    if (!canDraw()) return;
    strokes = [];
    redraw();
    if (mode === 'net') net.send({ t: 'clear' });
  });
  toolsEl.appendChild(clearBtn);

  function renderTools() {
    toolsEl.querySelectorAll('.cr-color').forEach((b, i) => b.classList.toggle('active', COLORS[i] === color));
    toolsEl.querySelectorAll('.cr-size').forEach((b, i) => b.classList.toggle('active', SIZES[i] === size));
    toolsEl.classList.toggle('off', !canDraw());
  }

  // ---------- раунды ----------

  function pool() {
    return level === 'hard' ? window.CROC_WORDS.hard : window.CROC_WORDS.easy;
  }

  function offerWords() {
    // рисующий выбирает одно из трёх слов
    const p = pool();
    const opts = new Set();
    while (opts.size < 3) opts.add(p[Math.floor(Math.random() * p.length)]);
    pickEl.innerHTML = '<p>Выберите слово, которое будете рисовать:</p>';
    for (const w of opts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-primary';
      b.textContent = pretty(w);
      b.addEventListener('click', () => beginRound(w));
      pickEl.appendChild(b);
    }
    pickEl.hidden = false;
  }

  function beginRound(w) {
    pickEl.hidden = true;
    word = w;
    revealed = mode === 'net';
    strokes = [];
    redraw();
    roundOn = true;
    deadline = Date.now() + ROUND_SEC * 1000;
    clearInterval(timerId);
    timerId = setInterval(tick, 250);
    tick();
    if (mode === 'net') net.send({ t: 'round', len: [...w].length, hint: pretty(w).replace(/[^ ]/g, '_') });
    chatEl.innerHTML = '';
    render();
  }

  function tick() {
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    timerEl.textContent = roundOn ? left : '—';
    timerEl.classList.toggle('low', roundOn && left <= 10);
    // исход раунда решает рисующий
    if (roundOn && left <= 0 && drawer) finishRound(false);
  }

  function finishRound(guessed, by) {
    if (!roundOn) return;
    roundOn = false;
    clearInterval(timerId);
    timerEl.textContent = '—';
    timerEl.classList.remove('low');
    score.rounds++;
    if (guessed) {
      // очко получают оба: угадавший и нарисовавший
      score.me++;
      score.them++;
    }
    if (mode === 'net' && drawer) {
      net.send({ t: 'end', ok: guessed, word, by });
      drawer = false; // следующий раунд рисует друг
    }
    SG.sound.play(guessed ? 'win' : 'lose');
    statusEl.textContent = (guessed ? 'Угадано! ' : 'Время вышло. ') + 'Слово: «' + pretty(word) + '»';
    render();
  }

  function addChat(text, cls) {
    const li = document.createElement('li');
    li.textContent = text;
    if (cls) li.className = cls;
    chatEl.prepend(li);
  }

  guessForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const g = guessInput.value.trim();
    if (!g || !roundOn || drawer || mode !== 'net') return;
    guessInput.value = '';
    net.send({ t: 'guess', g: g.slice(0, 40) });
    addChat('Вы: ' + g, 'mine');
  });

  function nextRound() {
    clearInterval(timerId);
    roundOn = false;
    word = '';
    strokes = [];
    redraw();
    chatEl.innerHTML = '';
    if (mode === 'net') {
      if (!net.active) return render();
      if (drawer) offerWords();
      else pickEl.hidden = true;
    } else offerWords();
    render();
  }

  function render() {
    const guesser = mode === 'net' && !drawer;
    guessForm.hidden = !guesser;
    guessInput.disabled = !roundOn;
    partyEl.hidden = !roundOn || !(mode === 'pvp' || drawer);
    $('ok-btn').hidden = mode !== 'pvp';
    if (mode === 'pvp') {
      wordEl.innerHTML = roundOn ? (revealed ? 'Рисуйте: <b>' + pretty(word) + '</b>' : '<button class="btn btn-ghost" type="button" id="reveal">Показать слово (только рисующему)</button>') : '';
      const rv = $('reveal');
      if (rv) rv.addEventListener('click', () => {
        revealed = true;
        render();
      });
      if (roundOn) statusEl.textContent = 'Рисуйте — остальные угадывают вслух!';
      else if (!pickEl.hidden) statusEl.textContent = 'Новый раунд: выберите слово (так, чтобы не видели остальные)';
    } else if (mode === 'net') {
      if (!net.active) statusEl.textContent = 'Нет соединения с соперником';
      else if (roundOn) statusEl.textContent = drawer ? 'Рисуйте! Друг угадывает.' : 'Угадайте, что рисует друг!';
      else if (!word) statusEl.textContent = drawer ? 'Выберите слово' : 'Друг выбирает слово…';
      wordEl.innerHTML = roundOn ? (drawer ? 'Рисуйте: <b>' + pretty(word) + '</b>' : 'Слово: <b class="cr-mask">' + hintMask + '</b>') : '';
    }
    $('score-me').textContent = score.me;
    $('score-rounds').textContent = score.rounds;
    $('new-btn').hidden = mode === 'net';
    renderTools();
  }
  let hintMask = '';

  // компания у одного экрана: рисующий сам отмечает, угадали ли
  $('ok-btn').addEventListener('click', () => finishRound(true));
  $('skip-btn').addEventListener('click', () => finishRound(false));
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (mode === 'pvp') nextRound();
  });

  // ---------- сеть ----------

  const net = SG.net.setup({
    game: 'crocodile',
    // загаданное слово зрителям не показываем
    mirrorMask: (el) => {
      el.querySelectorAll('#pick').forEach((k) => k.remove());
      const w = el.querySelector('#word');
      if (w && /Рисуйте/.test(w.textContent)) w.textContent = 'Рисует игрок 1';
      el.querySelectorAll('#guess-form, #tools, #party').forEach((k) => k.remove());
    },
    modeEl: $('mode'),
    onConnect(role) {
      mode = 'net';
      diffEl.style.display = 'none';
      score.me = score.them = score.rounds = 0;
      drawer = role === 'host';
      net.info('по очереди рисуем и угадываем');
      nextRound();
    },
    onMessage(msg) {
      if (msg.t === 'strokes' && !drawer && Array.isArray(msg.s)) {
        for (const part of msg.s) {
          if (part.n || !strokes.length) {
            strokes.push({ c: part.c || '#000', w: part.w || 5, p: part.p });
            drawStroke(strokes[strokes.length - 1]);
          } else {
            const s = strokes[strokes.length - 1];
            const from = s.p.length;
            s.p.push(...part.p);
            drawStroke(s, from);
          }
        }
      } else if (msg.t === 'undo' && !drawer) {
        strokes.pop();
        redraw();
      } else if (msg.t === 'clear' && !drawer) {
        strokes = [];
        redraw();
      } else if (msg.t === 'round' && !drawer) {
        word = '?';
        hintMask = String(msg.hint || '').slice(0, 40);
        strokes = [];
        redraw();
        roundOn = true;
        chatEl.innerHTML = '';
        deadline = Date.now() + ROUND_SEC * 1000;
        clearInterval(timerId);
        timerId = setInterval(tick, 250);
        tick();
        render();
        guessInput.focus();
      } else if (msg.t === 'guess' && drawer && roundOn) {
        const g = String(msg.g).slice(0, 40);
        const ok = norm(g) === norm(pretty(word));
        addChat('Друг: ' + g, ok ? 'ok' : '');
        if (ok) finishRound(true, g);
        else net.send({ t: 'miss', g });
      } else if (msg.t === 'miss' && !drawer) {
        SG.sound.play('error');
      } else if (msg.t === 'end' && !drawer) {
        word = String(msg.word || '');
        finishRound(!!msg.ok);
        // следующий раунд рисуем мы
        drawer = true;
        setTimeout(() => net.active && mode === 'net' && !roundOn && nextRound(), 2500);
      }
    },
    onDisconnect(voluntary) {
      if (mode !== 'net') return;
      if (voluntary) {
        mode = 'pvp';
        modeSeg.set('pvp');
        diffEl.style.display = '';
        score.me = score.them = score.rounds = 0;
        drawer = true;
        nextRound();
      } else {
        roundOn = false;
        clearInterval(timerId);
        render();
      }
    },
  });

  const modeSeg = SG.segmented($('mode'), 'pvp', () => {
    mode = 'pvp';
    drawer = true;
    diffEl.style.display = '';
    score.me = score.them = score.rounds = 0;
    nextRound();
  });
  SG.segmented(diffEl, level, (v) => {
    level = v;
    SG.store.set('croc-diff', v);
    if (mode === 'pvp' && !roundOn) offerWords();
  });

  window.addEventListener('resize', fit);
  fit();
  nextRound();
})();
