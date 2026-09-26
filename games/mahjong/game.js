/* Маджонг-пасьянс */
(() => {
  'use strict';

  // Раскладка «черепаха»: [слой, ряд, от столбца, до столбца]
  const LAYOUT_ROWS = [
    [0, 0, 1, 10], [0, 1, 2, 9], [0, 2, 1, 10], [0, 3, 0, 11],
    [0, 4, 0, 11], [0, 5, 1, 10], [0, 6, 2, 9], [0, 7, 1, 10],
    [1, 1, 3, 8], [1, 2, 3, 8], [1, 3, 3, 8], [1, 4, 3, 8], [1, 5, 3, 8], [1, 6, 3, 8],
    [2, 2, 4, 7], [2, 3, 4, 7], [2, 4, 4, 7], [2, 5, 4, 7],
    [3, 3, 5, 6], [3, 4, 5, 6],
  ];
  const COLS = 12;
  const ROWS = 8;

  // 34 вида костей: три масти по 9, четыре ветра и три дракона
  const KINDS = [];
  [['萬', 'wan'], ['筒', 'tong'], ['條', 'tiao']].forEach(([sub, cls]) => {
    for (let n = 1; n <= 9; n++) KINDS.push({ main: String(n), sub, cls });
  });
  ['東', '南', '西', '北'].forEach((ch) => KINDS.push({ main: ch, sub: '', cls: 'wind' }));
  [['中', 'red'], ['發', 'green'], ['白', 'white']].forEach(([ch, cls]) => KINDS.push({ main: ch, sub: '', cls: 'dragon ' + cls }));

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const leftEl = $('left');
  const timeEl = $('time');
  const bestEl = $('best');
  const statusEl = $('status');
  const overlay = SG.overlay();

  let tiles = []; // { z, r, c, kind, el, alive }
  let selected = null;
  let history = [];
  let startTime = 0;
  let timer = 0;
  let geo = {};

  const positions = [];
  LAYOUT_ROWS.forEach(([z, r, c0, c1]) => {
    for (let c = c0; c <= c1; c++) positions.push({ z, r, c });
  });

  // ---------- правила ----------

  const key = (z, r, c) => z * 1000 + r * 100 + c;

  function isFree(t, alive) {
    if (alive.has(key(t.z + 1, t.r, t.c))) return false;
    return !alive.has(key(t.z, t.r, t.c - 1)) || !alive.has(key(t.z, t.r, t.c + 1));
  }

  const aliveSet = () => new Set(tiles.filter((t) => t.alive).map((t) => key(t.z, t.r, t.c)));

  // Раздаём виды так, чтобы расклад гарантированно решался: снимаем свободные пары с полного поля
  function assignSolvable(list) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const alive = new Set(list.map((t) => key(t.z, t.r, t.c)));
      const remaining = list.slice();
      const pairs = [];
      let ok = true;
      while (remaining.length) {
        const free = remaining.filter((t) => isFree(t, alive));
        if (free.length < 2) {
          ok = false;
          break;
        }
        SG.shuffle(free);
        const [a, b] = free;
        pairs.push([a, b]);
        [a, b].forEach((t) => {
          alive.delete(key(t.z, t.r, t.c));
          remaining.splice(remaining.indexOf(t), 1);
        });
      }
      if (!ok) continue;
      // виды: каждый по две пары, в случайном порядке
      const kinds = SG.shuffle(pairs.map((_, k) => Math.floor(k / 2) % KINDS.length));
      pairs.forEach(([a, b], k) => (a.kind = b.kind = kinds[k]));
      return true;
    }
    return false;
  }

  function freeMatches() {
    const alive = aliveSet();
    const free = tiles.filter((t) => t.alive && isFree(t, alive));
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) if (free[i].kind === free[j].kind) return [free[i], free[j]];
    }
    return null;
  }

  // ---------- отрисовка ----------

  function measure() {
    const W = boardEl.clientWidth;
    const tw = W / (COLS + 0.5);
    const th = tw * 1.3;
    const dz = tw * 0.12;
    geo = { tw, th, dz };
    boardEl.style.height = ROWS * th + dz * 5 + 'px';
    boardEl.style.setProperty('--tw', tw + 'px');
    boardEl.style.setProperty('--th', th + 'px');
  }

  function build() {
    boardEl.querySelectorAll('.mj-tile').forEach((el) => el.remove());
    tiles.forEach((t) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'mj-tile';
      el.addEventListener('click', () => onTile(t));
      boardEl.appendChild(el);
      t.el = el;
    });
    paintFaces();
    layout();
  }

  function paintFaces() {
    tiles.forEach((t) => {
      const k = KINDS[t.kind];
      t.el.className = 'mj-tile ' + k.cls;
      t.el.innerHTML = `<span class="mj-main">${k.main}</span>${k.sub ? `<span class="mj-sub">${k.sub}</span>` : ''}`;
    });
  }

  function layout() {
    measure();
    const alive = aliveSet();
    tiles.forEach((t) => {
      t.el.style.left = t.c * geo.tw + geo.dz * 4 - t.z * geo.dz + 'px';
      t.el.style.top = t.r * geo.th + geo.dz * 4 - t.z * geo.dz + 'px';
      t.el.style.zIndex = t.z * 1000 + t.r * 20 + t.c;
      t.el.hidden = !t.alive;
      t.el.classList.toggle('free', t.alive && isFree(t, alive));
      t.el.classList.toggle('selected', t === selected);
    });
    leftEl.textContent = tiles.filter((t) => t.alive).length / 2;
  }

  // ---------- ход ----------

  function onTile(t) {
    if (!t.alive) return;
    if (!startTime) {
      startTime = Date.now();
      timer = setInterval(() => (timeEl.textContent = SG.formatTime((Date.now() - startTime) / 1000)), 500);
    }
    clearHints();
    if (!isFree(t, aliveSet())) {
      t.el.classList.remove('nope');
      void t.el.offsetWidth;
      t.el.classList.add('nope');
      SG.sound.play('error');
      return;
    }
    if (selected === t) {
      selected = null;
    } else if (selected && selected.kind === t.kind) {
      history.push([selected, t]);
      [selected, t].forEach((x) => {
        x.alive = false;
        x.el.classList.add('gone');
      });
      selected = null;
      SG.sound.play('match');
      setTimeout(() => {
        layout();
        afterMove();
      }, 180);
      return;
    } else {
      selected = t;
      SG.sound.play('click');
    }
    layout();
  }

  function afterMove() {
    $('undo-btn').disabled = !history.length;
    if (tiles.every((t) => !t.alive)) return win();
    statusEl.textContent = freeMatches() ? '' : 'Свободных пар больше нет — перемешайте кости.';
  }

  function win() {
    clearInterval(timer);
    const seconds = Math.round((Date.now() - startTime) / 1000);
    const best = SG.store.get('mahjong-best', null);
    const record = best === null || seconds < best;
    if (record) SG.store.set('mahjong-best', seconds);
    SG.store.set('mahjong-wins', SG.store.get('mahjong-wins', 0) + 1);
    renderBest();
    SG.sound.play('win');
    overlay.text = 'Все кости убраны за ' + SG.formatTime(seconds) + '.' + (record ? ' Новый рекорд! 🏆' : '');
    overlay.hidden = false;
  }

  function renderBest() {
    const best = SG.store.get('mahjong-best', null);
    bestEl.textContent = best === null ? '—' : SG.formatTime(best);
  }

  function clearHints() {
    tiles.forEach((t) => t.el && t.el.classList.remove('hint'));
  }

  function hint() {
    clearHints();
    const m = freeMatches();
    if (!m) {
      statusEl.textContent = 'Свободных пар нет — перемешайте кости.';
      SG.sound.play('error');
      return;
    }
    SG.sound.play('hint');
    m.forEach((t) => t.el.classList.add('hint'));
  }

  function reshuffle() {
    const rest = tiles.filter((t) => t.alive);
    if (!rest.length) return;
    assignSolvable(rest);
    selected = null;
    history = [];
    $('undo-btn').disabled = true;
    SG.sound.play('slide');
    paintFaces();
    layout();
    afterMove();
  }

  function undo() {
    const pair = history.pop();
    if (!pair) return;
    pair.forEach((t) => {
      t.alive = true;
      t.el.classList.remove('gone');
    });
    selected = null;
    SG.sound.play('click');
    layout();
    afterMove();
  }

  function newGame() {
    clearInterval(timer);
    overlay.hidden = true;
    startTime = 0;
    timeEl.textContent = '0:00';
    selected = null;
    history = [];
    statusEl.textContent = '';
    $('undo-btn').disabled = true;
    tiles = positions.map((p) => ({ ...p, kind: 0, alive: true }));
    assignSolvable(tiles);
    build();
    renderBest();
  }

  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  $('hint-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    hint();
  });
  $('shuffle-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    reshuffle();
  });
  $('undo-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    undo();
  });
  $('again-btn').addEventListener('click', newGame);
  window.addEventListener('resize', layout);

  newGame();
})();
