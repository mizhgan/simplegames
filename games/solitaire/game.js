/* Пасьянс «Косынка» (Klondike) */
(() => {
  'use strict';

  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const isRed = (card) => card.suit === 1 || card.suit === 2;

  const $ = (id) => document.getElementById(id);
  const table = $('table');
  const movesEl = $('moves');
  const timeEl = $('time');
  const bestEl = $('best');
  const undoBtn = $('undo-btn');
  const autoBtn = $('auto-btn');
  const overlay = SG.overlay();

  let drawCount = SG.store.get('solitaire-draw', 1);
  let cards = []; // все 52 карты: { id, suit, rank, up, el }
  let stock, waste, foundations, tableau;
  let moves = 0;
  let history = [];
  let startTime = 0;
  let timer = 0;
  let won = false;
  let geo = {}; // размеры, пересчитываются при изменении ширины

  // ---------- создание ----------

  function makeCardEl(card) {
    const el = document.createElement('div');
    el.className = 'sol-card' + (isRed(card) ? ' red' : '');
    const r = RANKS[card.rank];
    const s = SUITS[card.suit];
    el.innerHTML =
      `<div class="sol-face"><span class="tl">${r}<br>${s}</span><span class="mid">${s}</span><span class="br">${r}<br>${s}</span></div>` +
      '<div class="sol-back"></div>';
    el.dataset.id = card.id;
    table.appendChild(el);
    return el;
  }

  const slots = {};
  function makeSlot(name, label) {
    const el = document.createElement('div');
    el.className = 'sol-slot';
    if (label) el.dataset.label = label;
    table.appendChild(el);
    slots[name] = el;
  }
  makeSlot('stock', '↻');
  for (let f = 0; f < 4; f++) makeSlot('f' + f, 'A');
  for (let t = 0; t < 7; t++) makeSlot('t' + t, 'K');

  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 1; rank <= 13; rank++) {
      const card = { id: cards.length, suit, rank, up: false };
      card.el = makeCardEl(card);
      cards.push(card);
    }
  }

  // ---------- раскладка ----------

  function measure() {
    const W = table.clientWidth;
    const gap = Math.max(4, Math.round(W * 0.018));
    const cw = (W - gap * 6) / 7;
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

  function tableauOffsets(pile) {
    // сжимаем веер, если столбец слишком длинный
    const maxH = Math.max(window.innerHeight - 180, geo.ch * 4);
    let down = geo.ch * 0.12;
    let upOff = geo.ch * 0.28;
    const total = () => pile.reduce((h, c, k) => (k === pile.length - 1 ? h : h + (c.up ? upOff : down)), 0) + geo.ch;
    while (total() > maxH && upOff > geo.ch * 0.14) {
      upOff *= 0.92;
      down = Math.min(down, upOff * 0.5);
    }
    return { down, upOff };
  }

  function layout() {
    measure();
    setPos(slots.stock, colX(0), 0, 0);
    for (let f = 0; f < 4; f++) setPos(slots['f' + f], colX(3 + f), 0, 0);
    for (let t = 0; t < 7; t++) setPos(slots['t' + t], colX(t), geo.tabY, 0);

    stock.forEach((c, k) => setPos(c.el, colX(0), 0, 10 + k));
    const fanStart = Math.max(0, waste.length - (drawCount === 3 ? 3 : 1));
    waste.forEach((c, k) => {
      const fan = k >= fanStart ? (k - fanStart) * geo.cw * 0.28 : 0;
      setPos(c.el, colX(1) + fan, 0, 100 + k);
    });
    foundations.forEach((pile, f) => pile.forEach((c, k) => setPos(c.el, colX(3 + f), 0, 200 + k)));

    let maxBottom = geo.tabY + geo.ch;
    tableau.forEach((pile, t) => {
      const { down, upOff } = tableauOffsets(pile);
      let y = geo.tabY;
      pile.forEach((c, k) => {
        setPos(c.el, colX(t), y, 300 + k);
        if (k < pile.length - 1) y += c.up ? upOff : down;
      });
      maxBottom = Math.max(maxBottom, y + geo.ch);
    });
    table.style.height = maxBottom + geo.gap + 'px';

    cards.forEach((c) => c.el.classList.toggle('up', c.up));
    slots.stock.classList.toggle('recycle', !stock.length && waste.length > 0);
    autoBtn.hidden = !canAutoComplete();
  }

  // ---------- правила ----------

  const top = (pile) => pile[pile.length - 1];

  function canFoundation(card, f) {
    const pile = foundations[f];
    if (!pile.length) return card.rank === 1;
    return top(pile).suit === card.suit && top(pile).rank === card.rank - 1;
  }

  function canTableau(card, t) {
    const pile = tableau[t];
    if (!pile.length) return card.rank === 13;
    const tc = top(pile);
    return tc.up && isRed(tc) !== isRed(card) && tc.rank === card.rank + 1;
  }

  // Где лежит карта: { name, pile, index }
  function locate(card) {
    let k = stock.indexOf(card);
    if (k >= 0) return { name: 'stock', pile: stock, index: k };
    k = waste.indexOf(card);
    if (k >= 0) return { name: 'waste', pile: waste, index: k };
    for (let f = 0; f < 4; f++) {
      k = foundations[f].indexOf(card);
      if (k >= 0) return { name: 'f', f, pile: foundations[f], index: k };
    }
    for (let t = 0; t < 7; t++) {
      k = tableau[t].indexOf(card);
      if (k >= 0) return { name: 't', t, pile: tableau[t], index: k };
    }
    return null;
  }

  // Какие карты можно взять, начиная с этой
  function grab(card) {
    const loc = locate(card);
    if (!loc || !card.up) return null;
    if (loc.name === 'waste' || loc.name === 'f') return loc.index === loc.pile.length - 1 ? { loc, group: [card] } : null;
    if (loc.name === 't') return { loc, group: loc.pile.slice(loc.index) };
    return null;
  }

  function snapshot() {
    const ids = (p) => p.map((c) => c.id);
    history.push({
      stock: ids(stock),
      waste: ids(waste),
      foundations: foundations.map(ids),
      tableau: tableau.map(ids),
      up: cards.map((c) => c.up),
      moves,
    });
    if (history.length > 300) history.shift();
    undoBtn.disabled = false;
  }

  function moveGroup(loc, group, dest) {
    snapshot();
    loc.pile.splice(loc.index, group.length);
    const target = dest.name === 'f' ? foundations[dest.i] : tableau[dest.i];
    target.push(...group);
    SG.sound.play(dest.name === 'f' ? 'place' : 'card', 7);
    if (loc.name === 't' && loc.pile.length && !top(loc.pile).up) top(loc.pile).up = true;
    countMove();
    layout();
    checkWin();
  }

  function drawFromStock() {
    if (!stock.length && !waste.length) return;
    snapshot();
    SG.sound.play('card');
    if (!stock.length) {
      while (waste.length) {
        const c = waste.pop();
        c.up = false;
        stock.push(c);
      }
    } else {
      for (let k = 0; k < drawCount && stock.length; k++) {
        const c = stock.pop();
        c.up = true;
        waste.push(c);
      }
    }
    countMove();
    layout();
  }

  function countMove() {
    moves++;
    movesEl.textContent = moves;
    if (!startTime) {
      startTime = Date.now();
      timer = setInterval(() => (timeEl.textContent = SG.formatTime((Date.now() - startTime) / 1000)), 500);
    }
  }

  // Клик по карте: сначала в «дом», потом на подходящий столбец
  function autoMove(card) {
    const g = grab(card);
    if (!g) return false;
    if (g.group.length === 1 && g.loc.name !== 'f') {
      for (let f = 0; f < 4; f++) {
        if (canFoundation(card, f)) {
          moveGroup(g.loc, g.group, { name: 'f', i: f });
          return true;
        }
      }
    }
    const order = [...Array(7).keys()].filter((t) => !(g.loc.name === 't' && g.loc.t === t));
    // сначала непустые столбцы, чтобы короля не гонять по пустым
    order.sort((a, b) => (tableau[a].length ? 0 : 1) - (tableau[b].length ? 0 : 1));
    for (const t of order) {
      if (canTableau(card, t)) {
        if (card.rank === 13 && !tableau[t].length && g.loc.name === 't' && g.loc.index === 0) continue;
        moveGroup(g.loc, g.group, { name: 't', i: t });
        return true;
      }
    }
    return false;
  }

  const canAutoComplete = () => !won && !stock.length && !waste.length && tableau.every((p) => p.every((c) => c.up)) && tableau.some((p) => p.length);

  function autoComplete() {
    autoBtn.hidden = true;
    const stepAuto = () => {
      for (let t = 0; t < 7; t++) {
        const c = top(tableau[t]);
        if (!c) continue;
        for (let f = 0; f < 4; f++) {
          if (canFoundation(c, f)) {
            moveGroup({ name: 't', t, pile: tableau[t], index: tableau[t].length - 1 }, [c], { name: 'f', i: f });
            if (!won) setTimeout(stepAuto, 90);
            return;
          }
        }
      }
    };
    stepAuto();
  }

  function checkWin() {
    if (won || foundations.some((p) => p.length !== 13)) return;
    won = true;
    SG.sound.play('win');
    clearInterval(timer);
    const seconds = Math.round((Date.now() - startTime) / 1000);
    const key = 'solitaire-best-' + drawCount;
    const best = SG.store.get(key, null);
    const record = best === null || seconds < best;
    if (record) SG.store.set(key, seconds);
    SG.store.set('solitaire-wins', SG.store.get('solitaire-wins', 0) + 1);
    renderBest();
    undoBtn.disabled = true;
    overlay.text =
      'Пасьянс сошёлся за ' + SG.formatTime(seconds) + ' и ' + moves + ' ходов.' + (record ? ' Новый рекорд! 🏆' : '');
    table.classList.add('won');
    setTimeout(() => (overlay.hidden = false), 700);
  }

  function renderBest() {
    const best = SG.store.get('solitaire-best-' + drawCount, null);
    bestEl.textContent = best === null ? '—' : SG.formatTime(best);
  }

  function undo() {
    const h = history.pop();
    SG.sound.play('click');
    if (!h || won) return;
    const byId = (ids) => ids.map((id) => cards[id]);
    stock = byId(h.stock);
    waste = byId(h.waste);
    foundations = h.foundations.map(byId);
    tableau = h.tableau.map(byId);
    cards.forEach((c, i) => (c.up = h.up[i]));
    moves = h.moves;
    movesEl.textContent = moves;
    undoBtn.disabled = !history.length;
    layout();
  }

  function newGame() {
    clearInterval(timer);
    overlay.hidden = true;
    table.classList.remove('won');
    const deck = SG.shuffle(cards.slice());
    deck.forEach((c) => (c.up = false));
    tableau = [];
    for (let t = 0; t < 7; t++) {
      tableau.push(deck.splice(0, t + 1));
      top(tableau[t]).up = true;
    }
    stock = deck;
    waste = [];
    foundations = [[], [], [], []];
    moves = 0;
    history = [];
    won = false;
    startTime = 0;
    movesEl.textContent = '0';
    timeEl.textContent = '0:00';
    undoBtn.disabled = true;
    renderBest();
    layout();
  }

  // ---------- мышь и касания ----------

  let drag = null;

  table.addEventListener('pointerdown', (e) => {
    if (won || e.button > 0) return;
    const el = e.target.closest('.sol-card');
    if (!el) {
      if (e.target.closest('.sol-slot') === slots.stock) drawFromStock();
      return;
    }
    const card = cards[+el.dataset.id];
    if (stock.includes(card)) {
      drawFromStock();
      return;
    }
    const g = grab(card);
    if (!g) return;
    e.preventDefault();
    const rect = table.getBoundingClientRect();
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
      rect,
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

  const endDrag = (e) => {
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
    // куда бросили: по центру ведущей карты
    const cx = d.origin[0].x + (e.clientX - d.sx) + geo.cw / 2;
    const cy = d.origin[0].y + (e.clientY - d.sy) + geo.ch / 2;
    const col = Math.max(0, Math.min(6, Math.floor(cx / (geo.cw + geo.gap))));
    let dest = null;
    if (cy < geo.tabY - geo.gap / 2 && col >= 3 && d.g.group.length === 1 && canFoundation(d.card, col - 3)) {
      dest = { name: 'f', i: col - 3 };
    } else if (cy >= geo.tabY - geo.gap && !(d.g.loc.name === 't' && d.g.loc.t === col) && canTableau(d.card, col)) {
      dest = { name: 't', i: col };
    }
    if (dest) moveGroup(d.g.loc, d.g.group, dest);
    else layout();
  };
  table.addEventListener('pointerup', endDrag);
  table.addEventListener('pointercancel', () => {
    if (drag) {
      drag.g.group.forEach((c) => c.el.classList.remove('dragging'));
      drag = null;
      layout();
    }
  });

  undoBtn.addEventListener('click', () => {
    undoBtn.blur();
    undo();
  });
  autoBtn.addEventListener('click', autoComplete);
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

  SG.segmented($('draw'), String(drawCount), (v) => {
    drawCount = Number(v);
    SG.store.set('solitaire-draw', drawCount);
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

  table.classList.add('no-anim');
  newGame();
  requestAnimationFrame(() => table.classList.remove('no-anim'));
})();
