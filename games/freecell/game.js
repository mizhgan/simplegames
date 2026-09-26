/* Пасьянс «Свободная ячейка» (FreeCell) */
(() => {
  'use strict';

  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const COLS = 8;
  const isRed = (c) => c.suit === 1 || c.suit === 2;

  const $ = (id) => document.getElementById(id);
  const table = $('table');
  const movesEl = $('moves');
  const timeEl = $('time');
  const bestEl = $('best');
  const undoBtn = $('undo-btn');
  const overlay = SG.overlay();

  let cards = [];
  let cells, foundations, tableau;
  let moves = 0;
  let history = [];
  let won = false;
  let startTime = 0;
  let timer = 0;
  let geo = {};

  // ---------- колода ----------

  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 1; rank <= 13; rank++) {
      const card = { id: cards.length, suit, rank };
      const el = document.createElement('div');
      el.className = 'sol-card up' + (isRed(card) ? ' red' : '');
      const r = RANKS[rank];
      const s = SUITS[suit];
      el.innerHTML = `<div class="sol-face"><span class="tl">${r}<br>${s}</span><span class="mid">${s}</span><span class="br">${r}<br>${s}</span></div>`;
      el.dataset.id = card.id;
      card.el = el;
      cards.push(card);
    }
  }

  const slots = [];
  for (let k = 0; k < 16; k++) {
    const el = document.createElement('div');
    el.className = 'sol-slot';
    if (k >= 4 && k < 8) el.dataset.label = 'A';
    table.appendChild(el);
    slots.push(el);
  }
  cards.forEach((c) => table.appendChild(c.el));

  // ---------- раскладка ----------

  function measure() {
    const W = table.clientWidth;
    const gap = Math.max(4, Math.round(W * 0.014));
    const cw = (W - gap * (COLS - 1)) / COLS;
    const ch = cw * 1.4;
    geo = { gap, cw, ch, tabY: ch + gap * 2.5 };
    table.style.setProperty('--cw', cw + 'px');
    table.style.setProperty('--ch', ch + 'px');
  }

  const colX = (i) => i * (geo.cw + geo.gap);

  function setPos(el, x, y, z) {
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.style.zIndex = z;
  }

  function layout() {
    measure();
    for (let k = 0; k < 8; k++) setPos(slots[k], colX(k), 0, 0);
    for (let k = 0; k < 8; k++) setPos(slots[8 + k], colX(k), geo.tabY, 0);
    cells.forEach((c, k) => c && setPos(c.el, colX(k), 0, 10));
    foundations.forEach((pile, f) => pile.forEach((c, k) => setPos(c.el, colX(4 + f), 0, 20 + k)));
    const maxH = Math.max(window.innerHeight - 200, geo.ch * 4);
    let maxBottom = geo.tabY + geo.ch;
    tableau.forEach((pile, t) => {
      let off = geo.ch * 0.27;
      while (pile.length > 1 && (pile.length - 1) * off + geo.ch > maxH && off > geo.ch * 0.12) off *= 0.92;
      pile.forEach((c, k) => setPos(c.el, colX(t), geo.tabY + k * off, 100 + k));
      maxBottom = Math.max(maxBottom, geo.tabY + (pile.length - 1) * off + geo.ch);
    });
    table.style.height = maxBottom + geo.gap + 'px';
  }

  // ---------- правила ----------

  const top = (pile) => pile[pile.length - 1];
  const freeCells = () => cells.filter((c) => !c).length;
  const emptyCols = () => tableau.filter((p) => !p.length).length;
  // Сколько карт можно перенести разом, используя свободные ячейки и пустые столбцы
  const maxMove = (toEmpty) => (freeCells() + 1) * Math.pow(2, emptyCols() - (toEmpty ? 1 : 0));

  const canStack = (card, onto) => !onto || (isRed(onto) !== isRed(card) && onto.rank === card.rank + 1);
  const canFound = (card, f) => (foundations[f].length ? top(foundations[f]).suit === card.suit && top(foundations[f]).rank === card.rank - 1 : card.rank === 1);

  function locate(card) {
    const ci = cells.indexOf(card);
    if (ci >= 0) return { type: 'cell', i: ci, group: [card] };
    for (let f = 0; f < 4; f++) if (top(foundations[f]) === card) return { type: 'found', i: f, group: [card] };
    for (let t = 0; t < COLS; t++) {
      const k = tableau[t].indexOf(card);
      if (k < 0) continue;
      const group = tableau[t].slice(k);
      for (let j = 1; j < group.length; j++) if (!canStack(group[j], group[j - 1])) return null;
      return { type: 'tab', i: t, index: k, group };
    }
    return null;
  }

  function snapshot() {
    history.push({
      cells: cells.map((c) => (c ? c.id : -1)),
      foundations: foundations.map((p) => p.map((c) => c.id)),
      tableau: tableau.map((p) => p.map((c) => c.id)),
      moves,
    });
    undoBtn.disabled = false;
  }

  function removeFrom(loc) {
    if (loc.type === 'cell') cells[loc.i] = null;
    else if (loc.type === 'found') foundations[loc.i].pop();
    else tableau[loc.i].splice(loc.index);
  }

  function doMove(loc, dest) {
    snapshot();
    removeFrom(loc);
    if (dest.type === 'cell') cells[dest.i] = loc.group[0];
    else if (dest.type === 'found') foundations[dest.i].push(loc.group[0]);
    else tableau[dest.i].push(...loc.group);
    moves++;
    movesEl.textContent = moves;
    if (!startTime) {
      startTime = Date.now();
      timer = setInterval(() => (timeEl.textContent = SG.formatTime((Date.now() - startTime) / 1000)), 500);
    }
    SG.sound.play(dest.type === 'found' ? 'place' : 'card', 7);
    autoFoundation();
    layout();
    checkWin();
  }

  function valid(loc, dest) {
    const card = loc.group[0];
    if (dest.type === 'cell') return loc.group.length === 1 && !cells[dest.i] && loc.type !== 'cell';
    if (dest.type === 'found') return loc.group.length === 1 && canFound(card, dest.i);
    if (loc.type === 'tab' && loc.i === dest.i) return false;
    const pile = tableau[dest.i];
    if (!canStack(card, top(pile))) return false;
    return loc.group.length <= maxMove(!pile.length);
  }

  // Карты, которые больше не понадобятся на поле, уходят в «дом» сами
  function autoFoundation() {
    let movedAny = true;
    while (movedAny) {
      movedAny = false;
      const minRed = Math.min(foundations[1].length, foundations[2].length);
      const minBlack = Math.min(foundations[0].length, foundations[3].length);
      const safe = (c) => c.rank <= 2 || c.rank <= (isRed(c) ? minBlack : minRed) + 1;
      const sources = [
        ...cells.map((c, i) => c && { card: c, loc: { type: 'cell', i, group: [c] } }),
        ...tableau.map((p, i) => p.length && { card: top(p), loc: { type: 'tab', i, index: p.length - 1, group: [top(p)] } }),
      ].filter(Boolean);
      for (const { card, loc } of sources) {
        if (!safe(card)) continue;
        const f = [0, 1, 2, 3].find((k) => canFound(card, k));
        if (f === undefined) continue;
        removeFrom(loc);
        foundations[f].push(card);
        movedAny = true;
        break;
      }
    }
  }

  function autoMove(card) {
    const loc = locate(card);
    if (!loc) return false;
    const tries = [];
    if (loc.group.length === 1) for (let f = 0; f < 4; f++) tries.push({ type: 'found', i: f });
    // сначала на непустые столбцы, потом в пустые, потом в ячейку
    for (let t = 0; t < COLS; t++) if (tableau[t].length) tries.push({ type: 'tab', i: t });
    for (let t = 0; t < COLS; t++) if (!tableau[t].length && !(loc.type === 'tab' && loc.index === 0)) tries.push({ type: 'tab', i: t });
    if (loc.type !== 'cell') for (let k = 0; k < 4; k++) tries.push({ type: 'cell', i: k });
    const dest = tries.find((d) => valid(loc, d));
    if (!dest) return false;
    doMove(loc, dest);
    return true;
  }

  function checkWin() {
    if (won || foundations.some((p) => p.length < 13)) return;
    won = true;
    clearInterval(timer);
    const seconds = Math.round((Date.now() - startTime) / 1000);
    const best = SG.store.get('freecell-best', null);
    const record = best === null || seconds < best;
    if (record) SG.store.set('freecell-best', seconds);
    SG.store.set('freecell-wins', SG.store.get('freecell-wins', 0) + 1);
    renderBest();
    undoBtn.disabled = true;
    SG.sound.play('win');
    overlay.text =
      'Пасьянс сошёлся за ' + SG.formatTime(seconds) + ' и ' + moves + ' ходов.' + (record ? ' Новый рекорд! 🏆' : '');
    table.classList.add('won');
    setTimeout(() => (overlay.hidden = false), 600);
  }

  function renderBest() {
    const best = SG.store.get('freecell-best', null);
    bestEl.textContent = best === null ? '—' : SG.formatTime(best);
  }

  function undo() {
    const h = history.pop();
    if (!h || won) return;
    SG.sound.play('click');
    cells = h.cells.map((id) => (id < 0 ? null : cards[id]));
    foundations = h.foundations.map((p) => p.map((id) => cards[id]));
    tableau = h.tableau.map((p) => p.map((id) => cards[id]));
    moves = h.moves;
    movesEl.textContent = moves;
    undoBtn.disabled = !history.length;
    layout();
  }

  function newGame() {
    clearInterval(timer);
    overlay.hidden = true;
    table.classList.remove('won');
    table.classList.add('no-anim');
    const deck = SG.shuffle(cards.slice());
    tableau = Array.from({ length: COLS }, () => []);
    deck.forEach((c, k) => tableau[k % COLS].push(c));
    cells = [null, null, null, null];
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
    requestAnimationFrame(() => requestAnimationFrame(() => table.classList.remove('no-anim')));
  }

  // ---------- мышь и касания ----------

  let drag = null;

  table.addEventListener('pointerdown', (e) => {
    if (won || e.button > 0) return;
    const el = e.target.closest('.sol-card');
    if (!el) return;
    const card = cards[+el.dataset.id];
    const loc = locate(card);
    if (!loc) return;
    e.preventDefault();
    drag = {
      card,
      loc,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      origin: loc.group.map((c) => {
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
      drag.loc.group.forEach((c) => c.el.classList.add('dragging'));
    }
    drag.loc.group.forEach((c, k) => setPos(c.el, drag.origin[k].x + dx, drag.origin[k].y + dy, 1000 + k));
  });

  table.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.loc.group.forEach((c) => c.el.classList.remove('dragging'));
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
    const cy = d.origin[0].y + (e.clientY - d.sy) + geo.ch / 2;
    const col = Math.max(0, Math.min(COLS - 1, Math.floor(cx / (geo.cw + geo.gap))));
    let dest;
    if (cy < geo.tabY - geo.gap) dest = col < 4 ? { type: 'cell', i: col } : { type: 'found', i: col - 4 };
    else dest = { type: 'tab', i: col };
    if (valid(d.loc, dest)) doMove(d.loc, dest);
    else {
      if (d.loc.group.length > 1 && dest.type === 'tab' && canStack(d.card, top(tableau[dest.i]))) {
        $('status').textContent = 'Столько карт не перенести: нужно больше свободных ячеек или пустых столбцов.';
        setTimeout(() => ($('status').textContent = ''), 2500);
      }
      layout();
    }
  });

  table.addEventListener('pointercancel', () => {
    if (!drag) return;
    drag.loc.group.forEach((c) => c.el.classList.remove('dragging'));
    drag = null;
    layout();
  });

  undoBtn.addEventListener('click', () => {
    undoBtn.blur();
    undo();
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
