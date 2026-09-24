/* Пасьянс «Паук» */
(() => {
  'use strict';

  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const COLS = 10;
  // какие масти участвуют при 1, 2 и 4 мастях
  const SUIT_SETS = { 1: [0], 2: [0, 1], 4: [0, 1, 2, 3] };
  const isRed = (card) => card.suit === 1 || card.suit === 2;

  const $ = (id) => document.getElementById(id);
  const table = $('table');
  const movesEl = $('moves');
  const doneEl = $('done');
  const bestEl = $('best');
  const undoBtn = $('undo-btn');
  const overlay = $('overlay');
  const statusEl = $('status');

  let suits = SG.store.get('spider-suits', 1);
  if (!SUIT_SETS[suits]) suits = 1;
  let cards = [];
  let stock, tableau, completed;
  let moves = 0;
  let history = [];
  let won = false;
  let startTime = 0;
  let geo = {};

  // ---------- колода ----------

  function buildDeck() {
    table.querySelectorAll('.sol-card').forEach((el) => el.remove());
    cards = [];
    const set = SUIT_SETS[suits];
    // 104 карты: 8 полных мастей из выбранного набора
    for (let k = 0; k < 8; k++) {
      const suit = set[k % set.length];
      for (let rank = 1; rank <= 13; rank++) {
        const card = { id: cards.length, suit, rank, up: false };
        const el = document.createElement('div');
        el.className = 'sol-card' + (isRed(card) ? ' red' : '');
        const r = RANKS[rank];
        const s = SUITS[suit];
        el.innerHTML =
          `<div class="sol-face"><span class="tl">${r}<br>${s}</span><span class="mid">${s}</span><span class="br">${r}<br>${s}</span></div>` +
          '<div class="sol-back"></div>';
        el.dataset.id = card.id;
        table.appendChild(el);
        card.el = el;
        cards.push(card);
      }
    }
  }

  const slots = [];
  for (let t = 0; t < COLS; t++) {
    const el = document.createElement('div');
    el.className = 'sol-slot';
    table.appendChild(el);
    slots.push(el);
  }
  const stockSlot = document.createElement('div');
  stockSlot.className = 'sol-slot spider-stock';
  table.appendChild(stockSlot);

  // ---------- раскладка ----------

  function measure() {
    const W = table.clientWidth;
    const gap = Math.max(3, Math.round(W * 0.012));
    const cw = (W - gap * (COLS - 1)) / COLS;
    const ch = cw * 1.4;
    geo = { W, gap, cw, ch, tabY: ch + gap * 2 };
    table.style.setProperty('--cw', cw + 'px');
    table.style.setProperty('--ch', ch + 'px');
  }

  const colX = (i) => i * (geo.cw + geo.gap);

  function setPos(el, x, y, z) {
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.style.zIndex = z;
  }

  function offsets(pile) {
    const maxH = Math.max(window.innerHeight - 200, geo.ch * 4);
    let down = geo.ch * 0.1;
    let upOff = geo.ch * 0.26;
    const total = () => pile.reduce((h, c, k) => (k === pile.length - 1 ? h : h + (c.up ? upOff : down)), 0) + geo.ch;
    while (total() > maxH && upOff > geo.ch * 0.12) {
      upOff *= 0.92;
      down = Math.min(down, upOff * 0.45);
    }
    return { down, upOff };
  }

  function layout() {
    measure();
    setPos(stockSlot, colX(COLS - 1), 0, 0);
    stockSlot.hidden = stock.length > 0;
    slots.forEach((s, t) => setPos(s, colX(t), geo.tabY, 0));

    // колода: по стопке на каждую оставшуюся сдачу
    stock.forEach((c, k) => {
      const deal = Math.floor(k / COLS);
      setPos(c.el, colX(COLS - 1) - deal * geo.cw * 0.18, 0, 10 + k);
    });
    // собранные масти — стопкой слева вверху
    completed.forEach((seq, k) => seq.forEach((c, j) => setPos(c.el, k * geo.cw * 0.3, 0, 50 + k * 13 + (12 - j))));

    let maxBottom = geo.tabY + geo.ch;
    tableau.forEach((pile, t) => {
      const { down, upOff } = offsets(pile);
      let y = geo.tabY;
      pile.forEach((c, k) => {
        setPos(c.el, colX(t), y, 200 + k);
        if (k < pile.length - 1) y += c.up ? upOff : down;
      });
      maxBottom = Math.max(maxBottom, y + geo.ch);
    });
    table.style.height = maxBottom + geo.gap + 'px';
    cards.forEach((c) => c.el.classList.toggle('up', c.up));
    doneEl.textContent = completed.length + '/8';
  }

  // ---------- правила ----------

  const top = (pile) => pile[pile.length - 1];

  // Можно брать карту и всё, что над ней, если это убывающая последовательность одной масти
  function grab(card) {
    for (let t = 0; t < COLS; t++) {
      const k = tableau[t].indexOf(card);
      if (k < 0) continue;
      if (!card.up) return null;
      const group = tableau[t].slice(k);
      for (let i = 1; i < group.length; i++) {
        if (group[i].suit !== group[i - 1].suit || group[i].rank !== group[i - 1].rank - 1) return null;
      }
      return { t, index: k, group };
    }
    return null;
  }

  const canPlace = (card, t) => !tableau[t].length || top(tableau[t]).rank === card.rank + 1;

  function snapshot() {
    history.push({
      stock: stock.map((c) => c.id),
      tableau: tableau.map((p) => p.map((c) => c.id)),
      completed: completed.map((s) => s.map((c) => c.id)),
      up: cards.map((c) => c.up),
      moves,
    });
    if (history.length > 300) history.shift();
    undoBtn.disabled = false;
  }

  function countMove() {
    moves++;
    movesEl.textContent = moves;
    if (!startTime) startTime = Date.now();
  }

  function flipTop(t) {
    const c = top(tableau[t]);
    if (c && !c.up) c.up = true;
  }

  // Собранная масть от короля до туза уходит в «дом»
  function checkComplete(t) {
    const pile = tableau[t];
    if (pile.length < 13) return false;
    const seq = pile.slice(-13);
    for (let i = 0; i < 13; i++) {
      if (!seq[i].up || seq[i].rank !== 13 - i || seq[i].suit !== seq[0].suit) return false;
    }
    pile.splice(-13);
    completed.push(seq);
    flipTop(t);
    SG.sound.play('line', 3);
    return true;
  }

  function moveGroup(g, dest) {
    snapshot();
    tableau[g.t].splice(g.index);
    tableau[dest].push(...g.group);
    flipTop(g.t);
    countMove();
    SG.sound.play('card');
    checkComplete(dest);
    statusEl.textContent = '';
    layout();
    checkWin();
  }

  function dealRow() {
    if (!stock.length || won) return;
    if (tableau.some((p) => !p.length)) {
      statusEl.textContent = 'Перед сдачей заполните пустые столбцы.';
      SG.sound.play('error');
      return;
    }
    snapshot();
    for (let t = 0; t < COLS; t++) {
      const c = stock.pop();
      c.up = true;
      tableau[t].push(c);
    }
    countMove();
    SG.sound.play('card');
    statusEl.textContent = '';
    for (let t = 0; t < COLS; t++) checkComplete(t);
    layout();
    checkWin();
  }

  // Клик по карте: лучше всего — на карту той же масти, затем на любую подходящую, затем в пустой столбец
  function autoMove(card) {
    const g = grab(card);
    if (!g) return false;
    const targets = [...Array(COLS).keys()].filter((t) => t !== g.t && canPlace(card, t));
    if (!targets.length) return false;
    const score = (t) => {
      if (!tableau[t].length) return g.index === 0 ? -1 : 0;
      return top(tableau[t]).suit === card.suit ? 2 : 1;
    };
    targets.sort((a, b) => score(b) - score(a));
    if (score(targets[0]) < 0) return false;
    moveGroup(g, targets[0]);
    return true;
  }

  function checkWin() {
    if (completed.length < 8 || won) return;
    won = true;
    const seconds = Math.round((Date.now() - startTime) / 1000);
    const score = Math.max(0, 500 - moves + completed.length * 100);
    const key = 'spider-best-' + suits;
    const best = SG.store.get(key, null);
    const record = best === null || score > best;
    if (record) SG.store.set(key, score);
    SG.store.set('spider-wins', SG.store.get('spider-wins', 0) + 1);
    renderBest();
    undoBtn.disabled = true;
    SG.sound.play('win');
    $('overlay-text').textContent =
      'Пасьянс сошёлся за ' + moves + ' ходов и ' + SG.formatTime(seconds) + '. Очки: ' + score + '.' + (record ? ' Новый рекорд! 🏆' : '');
    table.classList.add('won');
    setTimeout(() => (overlay.hidden = false), 700);
  }

  function renderBest() {
    const best = SG.store.get('spider-best-' + suits, null);
    bestEl.textContent = best === null ? '—' : best;
  }

  function undo() {
    const h = history.pop();
    if (!h || won) return;
    SG.sound.play('click');
    const byId = (ids) => ids.map((id) => cards[id]);
    stock = byId(h.stock);
    tableau = h.tableau.map(byId);
    completed = h.completed.map(byId);
    cards.forEach((c, i) => (c.up = h.up[i]));
    moves = h.moves;
    movesEl.textContent = moves;
    undoBtn.disabled = !history.length;
    statusEl.textContent = '';
    layout();
  }

  function newGame() {
    overlay.hidden = true;
    table.classList.remove('won');
    table.classList.add('no-anim');
    buildDeck();
    const deck = SG.shuffle(cards.slice());
    tableau = [];
    for (let t = 0; t < COLS; t++) {
      tableau.push(deck.splice(0, t < 4 ? 6 : 5));
      top(tableau[t]).up = true;
    }
    stock = deck; // 50 карт = 5 сдач по 10
    completed = [];
    moves = 0;
    history = [];
    won = false;
    startTime = 0;
    movesEl.textContent = '0';
    undoBtn.disabled = true;
    statusEl.textContent = '';
    renderBest();
    layout();
    requestAnimationFrame(() => requestAnimationFrame(() => table.classList.remove('no-anim')));
  }

  // ---------- мышь и касания ----------

  let drag = null;

  table.addEventListener('pointerdown', (e) => {
    if (won || e.button > 0) return;
    const el = e.target.closest('.sol-card');
    if (!el) return;
    const card = cards[+el.dataset.id];
    if (stock.includes(card)) {
      dealRow();
      return;
    }
    const g = grab(card);
    if (!g) return;
    e.preventDefault();
    drag = {
      card,
      g,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      origin: g.group.map((c) => {
        const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(c.el.style.transform);
        return { x: +m[1], y: +m[2] };
      }),
    };
    table.setPointerCapture(e.pointerId);
  });

  table.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.g.group.forEach((c) => c.el.classList.add('dragging'));
    }
    drag.g.group.forEach((c, k) => setPos(c.el, drag.origin[k].x + dx, drag.origin[k].y + dy, 1000 + k));
  });

  table.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.g.group.forEach((c) => c.el.classList.remove('dragging'));
    if (!d.moved) {
      if (!autoMove(d.card)) {
        d.card.el.classList.remove('nope');
        void d.card.el.offsetWidth;
        d.card.el.classList.add('nope');
        SG.sound.play('error');
      }
      return;
    }
    const cx = d.origin[0].x + (e.clientX - d.sx) + geo.cw / 2;
    const col = Math.max(0, Math.min(COLS - 1, Math.floor(cx / (geo.cw + geo.gap))));
    if (col !== d.g.t && canPlace(d.card, col)) moveGroup(d.g, col);
    else layout();
  });

  table.addEventListener('pointercancel', () => {
    if (!drag) return;
    drag.g.group.forEach((c) => c.el.classList.remove('dragging'));
    drag = null;
    layout();
  });

  undoBtn.addEventListener('click', () => {
    undoBtn.blur();
    undo();
  });
  $('deal-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    dealRow();
  });
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  $('again-btn').addEventListener('click', newGame);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault();
      undo();
    }
  });

  SG.segmented($('suits'), String(suits), (v) => {
    suits = Number(v);
    SG.store.set('spider-suits', suits);
    newGame();
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      table.classList.add('no-anim');
      layout();
      requestAnimationFrame(() => table.classList.remove('no-anim'));
    }, 100);
  });

  newGame();
})();
