/* Кватро: 16 фигур с четырьмя признаками, фигуру для хода выбирает соперник */
(() => {
  'use strict';

  // признаки фигуры — биты номера: 1 высокая, 2 тёмная, 4 квадратная, 8 с углублением
  const LINES = [
    [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
    [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15],
    [0, 5, 10, 15], [3, 6, 9, 12],
  ];
  const TRAITS = ['высокие', 'тёмные', 'квадратные', 'с углублением'];
  const TRAITS_NOT = ['низкие', 'светлые', 'круглые', 'сплошные'];

  // состояние: доска (−1 — пусто), кто ходит, что делает (выбирает фигуру сопернику или ставит полученную)
  const create = () => ({ board: new Array(16).fill(-1), used: 0, turn: 0, phase: 'give', piece: -1, turnCount: 0 });
  const clone = (s) => ({ board: s.board.slice(), used: s.used, turn: s.turn, phase: s.phase, piece: s.piece, turnCount: s.turnCount });

  function winLine(board) {
    for (const line of LINES) {
      let and = 15;
      let nand = 15;
      let full = true;
      for (const i of line) {
        const p = board[i];
        if (p < 0) {
          full = false;
          break;
        }
        and &= p;
        nand &= ~p;
      }
      if (full && (and || nand & 15)) return { line, trait: and ? TRAITS[Math.log2(and & -and)] : TRAITS_NOT[Math.log2(nand & -nand & 15)] };
    }
    return null;
  }

  function moves(s) {
    if (s.over) return [];
    const out = [];
    if (s.phase === 'give') {
      for (let p = 0; p < 16; p++) if (!(s.used & (1 << p))) out.push({ g: p });
    } else {
      for (let i = 0; i < 16; i++) if (s.board[i] < 0) out.push({ p: i });
    }
    return out;
  }

  function apply(s, m) {
    if (m.g !== undefined) {
      s.piece = m.g;
      s.used |= 1 << m.g;
      s.phase = 'place';
      s.turn = 1 - s.turn;
    } else {
      s.board[m.p] = s.piece;
      s.last = m.p;
      s.piece = -1;
      s.phase = 'give';
      s.turnCount++;
      const w = winLine(s.board);
      if (w) s.over = { winner: s.turn, w };
      else if (s.used === 0xffff) s.over = { winner: null };
    }
  }

  const legal = (s, m) =>
    !!m && !s.over && (s.phase === 'give' ? Number.isInteger(m.g) && m.g >= 0 && m.g < 16 && !(s.used & (1 << m.g)) : Number.isInteger(m.p) && m.p >= 0 && m.p < 16 && s.board[m.p] < 0);

  const G = {
    moves,
    play(s, m) {
      const c = clone(s);
      apply(c, m);
      return c;
    },
    winner: (s) => (s.over ? s.over.winner : undefined),
  };

  // выигрывает ли фигура p, если её поставить на доску
  function winningCell(s, p) {
    for (let i = 0; i < 16; i++) {
      if (s.board[i] >= 0) continue;
      s.board[i] = p;
      const w = winLine(s.board);
      s.board[i] = -1;
      if (w) return i;
    }
    return -1;
  }

  function ai(s, level) {
    const ms = moves(s);
    if (s.phase === 'place') {
      const win = winningCell(s, s.piece);
      if (win >= 0 && level !== 'easy') return { p: win };
      if (level === 'hard') return SG.duel.mcts(s, G, { timeMs: 1500 });
      // ставим так, чтобы у соперника осталась хоть одна «безопасная» фигура
      const safe = ms.filter((m) => {
        const c = G.play(s, m);
        return moves(c).some((g) => winningCell(c, g.g) < 0);
      });
      const pool = level === 'normal' && safe.length ? safe : ms;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    if (level === 'hard' && s.turnCount > 3) return SG.duel.mcts(s, G, { timeMs: 1500 });
    const safe = ms.filter((m) => winningCell(s, m.g) < 0);
    const pool = level !== 'easy' && safe.length ? safe : Math.random() < 0.5 && safe.length ? safe : ms;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ---------- отрисовка ----------

  function pieceSvg(p) {
    const tall = p & 1;
    const dark = p & 2;
    const square = p & 4;
    const hollow = p & 8;
    // высокие — крупнее и с ободком, низкие — маленькие
    const size = tall ? 40 : 25;
    const c = 50;
    const fill = dark ? 'var(--q-dark)' : 'var(--q-light)';
    const rim = tall ? ' stroke="var(--q-rim)" stroke-width="6"' : '';
    const shape = square
      ? `<rect x="${c - size + 3}" y="${c - size + 3}" width="${size * 2 - 6}" height="${size * 2 - 6}" rx="7" fill="${fill}"${rim}/>`
      : `<circle cx="${c}" cy="${c}" r="${size - 3}" fill="${fill}"${rim}/>`;
    const hole = hollow ? `<circle cx="${c}" cy="${c}" r="${size * 0.4}" fill="var(--q-hole)"/>` : '';
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${shape}${hole}</svg>`;
  }

  const describe = (p) => [p & 1 ? 'высокая' : 'низкая', p & 2 ? 'тёмная' : 'светлая', p & 4 ? 'квадратная' : 'круглая', p & 8 ? 'с углублением' : 'сплошная'].join(', ');

  const boardEl = document.getElementById('board');
  const poolEl = document.getElementById('pool');
  const handEl = document.getElementById('hand');
  const cells = [];
  for (let i = 0; i < 16; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'q-cell';
    b.addEventListener('click', () => duel.play({ p: i }));
    boardEl.appendChild(b);
    cells.push(b);
  }
  const poolBtns = [];
  for (let p = 0; p < 16; p++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'q-piece';
    b.innerHTML = pieceSvg(p);
    b.title = describe(p);
    b.setAttribute('aria-label', 'Отдать фигуру: ' + describe(p));
    b.addEventListener('click', () => duel.play({ g: p }));
    poolEl.appendChild(b);
    poolBtns.push(b);
  }

  const duel = SG.duel({
    game: 'quarto',
    sides: ['Первый', 'Второй'],
    create,
    legal,
    apply,
    over(s) {
      if (!s.over) return null;
      if (s.over.winner === null) return { winner: null, text: 'Доска заполнена.' };
      return { winner: s.over.winner, text: 'Четыре ' + s.over.w.trait + ' в ряд!' };
    },
    hint: (s) => (s.phase === 'give' ? 'выберите фигуру для соперника' : 'поставьте фигуру на доску'),
    ai,
    aiDelay: 500,
    sound: (s) => (s.phase === 'place' ? 'card' : 'place'),
    render(s, v) {
      const w = s.over && s.over.w;
      for (let i = 0; i < 16; i++) {
        const p = s.board[i];
        const c = cells[i];
        c.innerHTML = p >= 0 ? pieceSvg(p) : '';
        c.className = 'q-cell' + (i === s.last ? ' last' : '') + (w && w.line.includes(i) ? ' win' : '');
        c.disabled = !(v.canMove && s.phase === 'place' && p < 0);
        c.setAttribute('aria-label', 'Клетка ' + (i + 1) + (p >= 0 ? ': ' + describe(p) : ''));
      }
      for (let p = 0; p < 16; p++) {
        const b = poolBtns[p];
        const used = !!(s.used & (1 << p));
        b.classList.toggle('used', used);
        b.disabled = used || !(v.canMove && s.phase === 'give');
      }
      poolEl.classList.toggle('active', v.canMove && s.phase === 'give');
      boardEl.classList.toggle('active', v.canMove && s.phase === 'place');
      handEl.innerHTML = s.piece >= 0 ? pieceSvg(s.piece) : '';
      handEl.parentElement.classList.toggle('empty', s.piece < 0);
    },
  });
})();
