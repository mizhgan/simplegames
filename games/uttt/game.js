/* Ultimate крестики-нолики: девять полей 3×3 в одном большом */
(() => {
  'use strict';

  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const MARK = ['✕', '◯'];
  const AI_MS = { easy: 120, normal: 700, hard: 1800 };

  // победитель маленького поля: 1 — X, 2 — O, 3 — ничья, 0 — идёт
  function small(cells, b) {
    const o = b * 9;
    for (const [a, c, d] of LINES) {
      const v = cells[o + a];
      if (v && v === cells[o + c] && v === cells[o + d]) return v;
    }
    for (let i = 0; i < 9; i++) if (!cells[o + i]) return 0;
    return 3;
  }

  function bigWinner(big) {
    for (const [a, c, d] of LINES) {
      const v = big[a];
      if ((v === 1 || v === 2) && v === big[c] && v === big[d]) return { v, line: [a, c, d] };
    }
    return big.every((x) => x) ? { v: 3 } : null;
  }

  const create = () => ({ cells: new Array(81).fill(0), big: new Array(9).fill(0), forced: -1, turn: 0 });
  const clone = (s) => ({ cells: s.cells.slice(), big: s.big.slice(), forced: s.forced, turn: s.turn });

  function moves(s) {
    if (bigWinner(s.big)) return [];
    const out = [];
    for (let b = 0; b < 9; b++) {
      if (s.big[b] || (s.forced >= 0 && s.forced !== b)) continue;
      for (let c = 0; c < 9; c++) if (!s.cells[b * 9 + c]) out.push(b * 9 + c);
    }
    return out;
  }

  function apply(s, i) {
    const b = Math.floor(i / 9);
    s.cells[i] = s.turn + 1;
    s.big[b] = small(s.cells, b);
    const next = i % 9;
    s.forced = s.big[next] ? -1 : next;
    s.turn = 1 - s.turn;
    s.last = i;
  }

  const legal = (s, i) => Number.isInteger(i) && moves(s).includes(i);

  function winnerOf(s) {
    const w = bigWinner(s.big);
    if (!w) return undefined;
    return w.v === 3 ? null : w.v - 1;
  }

  const G = {
    moves,
    play(s, m) {
      const c = clone(s);
      apply(c, m);
      return c;
    },
    winner: winnerOf,
  };

  // ---------- отрисовка ----------

  const boardEl = document.getElementById('board');
  const subs = [];
  const cellEls = [];
  for (let b = 0; b < 9; b++) {
    const sb = document.createElement('div');
    sb.className = 'ut-sub';
    for (let c = 0; c < 9; c++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ut-cell';
      btn.setAttribute('aria-label', 'Поле ' + (b + 1) + ', клетка ' + (c + 1));
      btn.addEventListener('click', () => duel.play(b * 9 + c));
      sb.appendChild(btn);
      cellEls.push(btn);
    }
    const big = document.createElement('span');
    big.className = 'ut-big';
    sb.appendChild(big);
    boardEl.appendChild(sb);
    subs.push(sb);
  }

  const duel = SG.duel({
    game: 'uttt',
    sides: ['Крестики', 'Нолики'],
    create,
    legal,
    apply,
    over(s) {
      const w = bigWinner(s.big);
      if (!w) return null;
      return w.v === 3 ? { winner: null, text: 'Все поля разыграны.' } : { winner: w.v - 1, line: w.line };
    },
    hint: (s) => (s.forced >= 0 ? 'ходите в подсвеченное поле' : 'можно ходить в любое свободное поле'),
    ai(s, level) {
      const ms = moves(s);
      // очевидное: выиграть партию или не дать выиграть сопернику
      for (const m of ms) if (winnerOf(G.play(s, m)) === s.turn) return m;
      return SG.duel.mcts(s, G, { timeMs: AI_MS[level] });
    },
    sound: (s) => (s.big[Math.floor(s.last / 9)] ? 'merge' : 'place'),
    render(s, v) {
      const playable = new Set(v.canMove ? moves(s) : []);
      const w = bigWinner(s.big);
      for (let b = 0; b < 9; b++) {
        const sb = subs[b];
        const open = !s.big[b] && !w && (s.forced < 0 || s.forced === b);
        sb.className = 'ut-sub' + (open ? ' open' : '') + (s.big[b] === 1 ? ' won-x' : s.big[b] === 2 ? ' won-o' : s.big[b] === 3 ? ' drawn' : '') + (w && w.line && w.line.includes(b) ? ' win' : '');
        sb.lastChild.textContent = s.big[b] === 1 ? MARK[0] : s.big[b] === 2 ? MARK[1] : '';
        for (let c = 0; c < 9; c++) {
          const i = b * 9 + c;
          const el = cellEls[i];
          const val = s.cells[i];
          el.textContent = val ? MARK[val - 1] : '';
          el.className = 'ut-cell' + (val === 1 ? ' x' : val === 2 ? ' o' : '') + (i === s.last ? ' last' : '');
          el.disabled = !playable.has(i);
        }
      }
      boardEl.classList.toggle('turn-o', s.turn === 1);
    },
  });
})();
