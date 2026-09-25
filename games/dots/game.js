/* Точки и квадраты */
(() => {
  'use strict';

  const SP = 60;
  const M = 16;

  const $ = (id) => document.getElementById(id);
  const svg = $('board');
  const statusEl = $('status');
  const diffEl = $('difficulty');

  let mode = SG.store.get('dots-mode', 'ai');
  let difficulty = SG.store.get('dots-diff', 'normal');
  let size = SG.store.get('dots-size', '4');
  let R, C, H, L, lines, owner, turn, score, over, busy, timer, boxLines, lineBoxes, lastLine;
  let mySide = 1; // в сетевой игре: 1 — синие (ходят первыми), 2 — красные

  // ---------- геометрия ----------

  function setup() {
    R = C = Number(size);
    H = (R + 1) * C;
    L = H + R * (C + 1);
    boxLines = [];
    lineBoxes = Array.from({ length: L }, () => []);
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const b = r * C + c;
        const ls = [r * C + c, (r + 1) * C + c, H + r * (C + 1) + c, H + r * (C + 1) + c + 1];
        boxLines.push(ls);
        ls.forEach((l) => lineBoxes[l].push(b));
      }
    }
  }

  const sides = (ln, b) => boxLines[b].reduce((s, l) => s + ln[l], 0);

  // рисует линию и возвращает список закрытых квадратов
  function draw(ln, l) {
    ln[l] = 1;
    return lineBoxes[l].filter((b) => sides(ln, b) === 4);
  }

  const free = (ln) => {
    const out = [];
    for (let l = 0; l < L; l++) if (!ln[l]) out.push(l);
    return out;
  };

  const completes = (ln, l) => lineBoxes[l].some((b) => sides(ln, b) === 3);
  const unsafe = (ln, l) => lineBoxes[l].some((b) => sides(ln, b) === 2);

  // сколько квадратов заберёт жадный соперник после линии l
  function giveaway(ln, l) {
    const copy = ln.slice();
    copy[l] = 1;
    let n = 0;
    for (;;) {
      const t = free(copy).find((x) => completes(copy, x));
      if (t === undefined) return n;
      n += draw(copy, t).length;
    }
  }

  // ---------- ИИ ----------

  function aiMove() {
    const avail = free(lines);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const takes = avail.filter((l) => completes(lines, l));
    const safe = avail.filter((l) => !completes(lines, l) && !unsafe(lines, l));

    if (difficulty === 'easy') {
      if (takes.length && Math.random() < 0.75) return pick(takes);
      if (safe.length && Math.random() < 0.7) return pick(safe);
      return pick(avail);
    }

    if (takes.length) {
      // двойной ход закрывает сразу два квадрата — берём
      const dbl = takes.find((l) => lineBoxes[l].filter((b) => sides(lines, b) === 3).length === 2);
      if (dbl !== undefined) return dbl;
      if (difficulty === 'hard') {
        const dd = doubleDeal(takes);
        if (dd !== undefined) return dd;
      }
      return takes[0];
    }
    if (safe.length) return pick(safe);
    // жертвуем как можно меньше
    let best = [];
    let bestN = Infinity;
    for (const l of avail) {
      const n = giveaway(lines, l);
      if (n < bestN) {
        bestN = n;
        best = [l];
      } else if (n === bestN) best.push(l);
    }
    return pick(best);
  }

  // «двойная уступка»: отдаём последние два квадрата цепочки,
  // чтобы сопернику пришлось открыть следующую длинную цепочку
  function doubleDeal(takes) {
    // после жадного взятия всего должны остаться только «опасные» ходы
    const copy = lines.slice();
    let taken = 0;
    for (;;) {
      const t = free(copy).find((x) => completes(copy, x));
      if (t === undefined) break;
      taken += draw(copy, t).length;
    }
    const rest = free(copy);
    if (!rest.length || rest.some((l) => !unsafe(copy, l))) return undefined;
    const left = owner.filter((o) => !o).length - taken;
    if (left < 3) return undefined;
    const dd = takes.map((t) => {
      const a = lineBoxes[t].find((b) => sides(lines, b) === 3);
      const bBox = lineBoxes[t].find((b) => b !== a);
      if (bBox === undefined || sides(lines, bBox) !== 2) return undefined;
      const far = boxLines[bBox].filter((l) => !lines[l] && l !== t);
      if (far.length !== 1) return undefined;
      const beyond = lineBoxes[far[0]].find((b) => b !== bBox);
      if (beyond !== undefined && sides(lines, beyond) >= 2) return undefined;
      return far[0];
    });
    // сначала забираем всё остальное, уступаем в самом конце
    const other = takes.find((t, k) => dd[k] === undefined);
    if (other !== undefined) return other;
    return dd[0];
  }

  // ---------- ход ----------

  function play(l) {
    if (lines[l]) return;
    lastLine = l;
    const done = draw(lines, l);
    done.forEach((b) => {
      owner[b] = turn;
      score[turn]++;
    });
    SG.sound.play(done.length ? 'coin' : 'click');
    if (score[1] + score[2] === R * C) {
      over = true;
      render();
      finish();
      return;
    }
    if (!done.length) turn = 3 - turn;
    render();
    if (mode === 'ai' && turn === 2) {
      busy = true;
      timer = setTimeout(() => {
        busy = false;
        play(aiMove());
      }, 380);
    }
  }

  function finish() {
    const [a, b] = [score[1], score[2]];
    if (mode === 'net') net.result(a === b ? 'draw' : (a > b ? 1 : 2) === mySide ? 'win' : 'lose');
    if (mode === 'net') {
      const mine = mySide === 1 ? a : b;
      const theirs = mySide === 1 ? b : a;
      if (mine > theirs) {
        statusEl.textContent = 'Победа ' + mine + ':' + theirs + '! 🎉';
        SG.store.set('dots-wins', SG.store.get('dots-wins', 0) + 1);
        SG.sound.play('win');
      } else if (mine < theirs) {
        statusEl.textContent = 'Соперник выиграл ' + theirs + ':' + mine + '.';
        SG.sound.play('lose');
      } else {
        statusEl.textContent = 'Ничья ' + a + ':' + b + '.';
        SG.sound.play('draw');
      }
    } else if (mode === 'ai') {
      if (a > b) {
        statusEl.textContent = 'Победа ' + a + ':' + b + '! 🎉';
        SG.store.set('dots-wins', SG.store.get('dots-wins', 0) + 1);
        SG.sound.play('win');
      } else if (a < b) {
        statusEl.textContent = 'Компьютер выиграл ' + b + ':' + a + '.';
        SG.sound.play('lose');
      } else {
        statusEl.textContent = 'Ничья ' + a + ':' + b + '.';
        SG.sound.play('draw');
      }
    } else {
      statusEl.textContent = a === b ? 'Ничья!' : (a > b ? 'Синие' : 'Красные') + ' победили ' + Math.max(a, b) + ':' + Math.min(a, b) + '! 🎉';
      SG.sound.play(a === b ? 'draw' : 'win');
    }
    $('wins').textContent = SG.store.get('dots-wins', 0);
  }

  // ---------- отрисовка ----------

  function lineCoords(l) {
    if (l < H) {
      const r = Math.floor(l / C);
      const c = l % C;
      return [M + c * SP, M + r * SP, M + (c + 1) * SP, M + r * SP];
    }
    const k = l - H;
    const r = Math.floor(k / (C + 1));
    const c = k % (C + 1);
    return [M + c * SP, M + r * SP, M + c * SP, M + (r + 1) * SP];
  }

  function build() {
    const w = M * 2 + C * SP;
    const h = M * 2 + R * SP;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    let s = '';
    for (let b = 0; b < R * C; b++) {
      const r = Math.floor(b / C);
      const c = b % C;
      s += `<g class="db-box" data-b="${b}"><rect x="${M + c * SP + 4}" y="${M + r * SP + 4}" width="${SP - 8}" height="${SP - 8}" rx="6"/><text x="${M + c * SP + SP / 2}" y="${M + r * SP + SP / 2}"></text></g>`;
    }
    for (let l = 0; l < L; l++) {
      const [x1, y1, x2, y2] = lineCoords(l);
      s += `<g class="db-line" data-l="${l}"><line class="hit" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line class="vis" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/></g>`;
    }
    for (let r = 0; r <= R; r++) for (let c = 0; c <= C; c++) s += `<circle class="db-dot" cx="${M + c * SP}" cy="${M + r * SP}" r="5"/>`;
    svg.innerHTML = s;
  }

  function render() {
    svg.querySelectorAll('.db-line').forEach((g) => {
      const l = Number(g.dataset.l);
      g.classList.toggle('on', !!lines[l]);
      g.classList.toggle('last', l === lastLine);
    });
    svg.querySelectorAll('.db-box').forEach((g) => {
      const o = owner[Number(g.dataset.b)];
      g.dataset.o = o;
      g.querySelector('text').textContent = o ? (mode === 'ai' ? (o === 1 ? 'Я' : 'К') : mode === 'net' ? (o === mySide ? 'Я' : 'С') : o === 1 ? 'С' : 'К') : '';
    });
    svg.dataset.turn = turn;
    $('s1').textContent = score[1];
    $('s2').textContent = score[2];
    const n = mode === 'net';
    $('l1').textContent = n ? (mySide === 1 ? 'Вы' : 'Соперник') : mode === 'ai' ? 'Вы' : 'Синие';
    $('l2').textContent = n ? (mySide === 2 ? 'Вы' : 'Соперник') : mode === 'ai' ? 'Компьютер' : 'Красные';
    if (!over) {
      if (n) statusEl.textContent = !net.active ? 'Нет соединения с соперником' : turn === mySide ? 'Ваш ход — проведите линию.' : 'Ход соперника…';
      else if (mode === 'ai') statusEl.textContent = turn === 1 ? 'Ваш ход — проведите линию.' : 'Ходит компьютер…';
      else statusEl.textContent = 'Ходят ' + (turn === 1 ? 'синие' : 'красные') + '.';
    }
  }

  svg.addEventListener('click', (e) => {
    const g = e.target.closest('.db-line');
    if (!g || over || busy) return;
    if (mode === 'ai' && turn !== 1) return;
    const l = Number(g.dataset.l);
    if (lines[l]) return;
    if (mode === 'net') {
      if (!net.active || turn !== mySide) return;
      net.send({ t: 'move', l });
    }
    play(l);
  });

  function newGame() {
    clearTimeout(timer);
    setup();
    lines = new Array(L).fill(0);
    owner = new Array(R * C).fill(0);
    score = { 1: 0, 2: 0 };
    turn = 1;
    over = false;
    busy = false;
    lastLine = -1;
    build();
    render();
    $('wins').textContent = SG.store.get('dots-wins', 0);
  }

  // ---------- игра по сети ----------

  function netNew() {
    // начинающий новую партию меняется цветом с соперником и сообщает размер поля
    mySide = 3 - mySide;
    net.send({ t: 'new', side: 3 - mySide, size });
    newGame();
  }

  const net = SG.net.setup({
    game: 'dots',
    onRematch: () => $('new-btn').click(),
    modeEl: $('mode'),
    onConnect(role) {
      mode = 'net';
      diffEl.style.display = 'none';
      net.info('поле ' + size + '×' + size);
      if (role === 'host') {
        mySide = 2;
        netNew();
      } else {
        mySide = 2;
        newGame();
      }
    },
    onMessage(msg) {
      if (msg.t === 'move' && !over && turn !== mySide && Number.isInteger(msg.l) && msg.l >= 0 && msg.l < L && !lines[msg.l]) play(msg.l);
      else if (msg.t === 'new' && ['3', '4', '5'].includes(String(msg.size))) {
        mySide = msg.side;
        size = String(msg.size);
        sizeSeg.set(size);
        net.info('поле ' + size + '×' + size);
        newGame();
      }
    },
    onDisconnect(voluntary) {
      if (mode !== 'net') return;
      if (voluntary) {
        modeSeg.set('pvp');
        mode = 'pvp';
        newGame();
      } else render();
    },
  });

  const modeSeg = SG.segmented($('mode'), mode, (v) => {
    mode = v;
    SG.store.set('dots-mode', v);
    diffEl.style.display = mode === 'ai' ? '' : 'none';
    newGame();
  });
  SG.segmented(diffEl, difficulty, (v) => {
    difficulty = v;
    SG.store.set('dots-diff', v);
    newGame();
  });
  const sizeSeg = SG.segmented($('size'), size, (v) => {
    size = v;
    SG.store.set('dots-size', v);
    if (mode === 'net') {
      if (net.active) {
        net.info('поле ' + size + '×' + size);
        netNew();
      }
    } else newGame();
  });
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (mode === 'net') {
      if (net.active) netNew();
    } else newGame();
  });

  diffEl.style.display = mode === 'ai' ? '' : 'none';
  newGame();
})();
