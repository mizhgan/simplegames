/* Манкала (калах): 6 лунок по 4 камня, дополнительный ход и захват */
(() => {
  'use strict';

  // лунки 0–5 и амбар 6 — первого игрока, 7–12 и амбар 13 — второго
  const STORE = [6, 13];
  const PITS = [[0, 1, 2, 3, 4, 5], [7, 8, 9, 10, 11, 12]];
  const SEEDS = 4;

  function create() {
    const b = new Array(14).fill(SEEDS);
    b[6] = b[13] = 0;
    return { b, turn: 0, over: false };
  }
  const clone = (s) => ({ b: s.b.slice(), turn: s.turn, over: s.over });

  const moves = (s) => (s.over ? [] : PITS[s.turn].filter((i) => s.b[i] > 0));

  function apply(s, pit) {
    const b = s.b;
    const me = s.turn;
    let n = b[pit];
    b[pit] = 0;
    let i = pit;
    s.path = [];
    while (n > 0) {
      i = (i + 1) % 14;
      if (i === STORE[1 - me]) continue;
      b[i]++;
      n--;
      s.path.push(i);
    }
    s.last = i;
    s.captured = 0;
    // последний камень в свою пустую лунку — забираем его и камни соперника напротив
    if (PITS[me].includes(i) && b[i] === 1 && b[12 - i] > 0) {
      s.captured = b[12 - i] + 1;
      b[STORE[me]] += s.captured;
      b[i] = 0;
      b[12 - i] = 0;
    }
    s.extra = i === STORE[me];
    // у кого-то опустели лунки — остальные камни уходят в амбар хозяина
    if (PITS[0].every((x) => !b[x]) || PITS[1].every((x) => !b[x])) {
      for (const side of [0, 1]) {
        for (const x of PITS[side]) {
          b[STORE[side]] += b[x];
          b[x] = 0;
        }
      }
      s.over = true;
    }
    if (!s.extra) s.turn = 1 - me;
  }

  const legal = (s, m) => Number.isInteger(m) && moves(s).includes(m);

  const G = {
    moves,
    play(s, m) {
      const c = clone(s);
      apply(c, m);
      return c;
    },
    terminal(s) {
      if (!s.over) return null;
      const d = s.b[STORE[s.turn]] - s.b[STORE[1 - s.turn]];
      return d > 0 ? 1000 + d : d < 0 ? -1000 + d : 0;
    },
    evaluate(s) {
      const me = s.turn;
      let side = 0;
      for (const x of PITS[me]) side += s.b[x];
      for (const x of PITS[1 - me]) side -= s.b[x];
      return s.b[STORE[me]] - s.b[STORE[1 - me]] + side * 0.25;
    },
  };

  const DEPTH = { easy: 1, normal: 5, hard: 11 };

  // ---------- отрисовка ----------

  const boardEl = document.getElementById('board');
  const pitEls = [];
  for (let i = 0; i < 14; i++) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = STORE.includes(i) ? 'mc-store' : 'mc-pit';
    el.innerHTML = '<span class="mc-seeds"></span><b></b>';
    if (!STORE.includes(i)) el.addEventListener('click', () => duel.play(i));
    pitEls.push(el);
  }

  function seedsHtml(n, key) {
    // до 18 камней рисуем россыпью, дальше — только число
    let h = '';
    const shown = Math.min(n, 18);
    for (let k = 0; k < shown; k++) {
      const a = (k * 137.5 + key * 31) * (Math.PI / 180);
      const r = 8 + 26 * Math.sqrt((k + 0.5) / 18);
      h += `<i style="left:${50 + Math.cos(a) * r}%;top:${50 + Math.sin(a) * r}%;--h:${(k * 47 + key * 13) % 360}"></i>`;
    }
    return h;
  }

  const duel = SG.duel({
    game: 'mancala',
    sides: ['Нижние', 'Верхние'],
    create,
    legal,
    apply,
    over(s) {
      if (!s.over) return null;
      const a = s.b[6];
      const c = s.b[13];
      return { winner: a === c ? null : a > c ? 0 : 1, text: 'Счёт ' + Math.max(a, c) + ':' + Math.min(a, c) + '.' };
    },
    hint: (s) => (s.extra ? 'дополнительный ход!' : 'выберите лунку в своём ряду'),
    ai(s, level) {
      const ms = moves(s);
      if (level === 'easy' && Math.random() < 0.5) return ms[Math.floor(Math.random() * ms.length)];
      return SG.duel.search(s, G, { depth: DEPTH[level], timeMs: level === 'hard' ? 1500 : 600 });
    },
    aiDelay: 600,
    sound: (s) => (s.captured ? 'capture' : s.extra ? 'coin' : 'drop'),
    render(s, v) {
      // свой ряд — всегда снизу
      const bottom = v.flip ? 1 : 0;
      const top = 1 - bottom;
      boardEl.innerHTML = '';
      const row = (side, reverse) => {
        const r = document.createElement('div');
        r.className = 'mc-row' + (side === bottom ? ' mine' : '');
        const list = reverse ? PITS[side].slice().reverse() : PITS[side];
        list.forEach((i) => r.appendChild(pitEls[i]));
        return r;
      };
      boardEl.appendChild(pitEls[STORE[top]]);
      const mid = document.createElement('div');
      mid.className = 'mc-mid';
      mid.appendChild(row(top, true));
      mid.appendChild(row(bottom, false));
      boardEl.appendChild(mid);
      boardEl.appendChild(pitEls[STORE[bottom]]);
      const playable = new Set(v.canMove ? moves(s) : []);
      for (let i = 0; i < 14; i++) {
        const el = pitEls[i];
        el.querySelector('b').textContent = s.b[i];
        el.querySelector('.mc-seeds').innerHTML = seedsHtml(s.b[i], i);
        el.classList.toggle('last', v.last !== null && i === s.last);
        el.classList.toggle('sown', !!(v.last !== null && s.path && s.path.includes(i)));
        el.classList.toggle('side-0', i <= 6);
        el.classList.toggle('side-1', i > 6);
        if (!STORE.includes(i)) {
          el.disabled = !playable.has(i);
          el.setAttribute('aria-label', 'Лунка: ' + s.b[i] + ' камн.');
        } else el.setAttribute('aria-label', 'Амбар: ' + s.b[i]);
      }
    },
  });
})();
