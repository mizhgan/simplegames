/* Гекс: соедините свои стороны ромба цепочкой шестиугольников */
(() => {
  'use strict';

  const N = 9;
  const CELLS = N * N;
  const NB = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const list = [];
      for (const [dr, dc] of [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]]) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < N && cc >= 0 && cc < N) list.push(rr * N + cc);
      }
      NB.push(list);
    }
  }

  // сторона 0 (красные) соединяет верх и низ, сторона 1 (синие) — левый и правый края
  const stack = new Int16Array(CELLS);
  const seen = new Uint8Array(CELLS);
  function connected(b, side, wantPath) {
    seen.fill(0);
    const from = new Int16Array(CELLS).fill(-1);
    let sp = 0;
    for (let k = 0; k < N; k++) {
      const i = side === 0 ? k : k * N;
      if (b[i] === side + 1) {
        stack[sp++] = i;
        seen[i] = 1;
      }
    }
    while (sp) {
      const i = stack[--sp];
      if (side === 0 ? i >= CELLS - N : i % N === N - 1) {
        if (!wantPath) return true;
        const path = [];
        for (let x = i; x >= 0; x = from[x]) path.push(x);
        return path;
      }
      for (const j of NB[i]) {
        if (!seen[j] && b[j] === side + 1) {
          seen[j] = 1;
          from[j] = i;
          stack[sp++] = j;
        }
      }
    }
    return false;
  }

  const create = () => ({ b: new Array(CELLS).fill(0), turn: 0, n: 0 });
  const clone = (s) => ({ b: s.b.slice(), turn: s.turn, n: s.n, win: s.win });

  function apply(s, i) {
    s.b[i] = s.turn + 1;
    s.n++;
    s.last = i;
    if (connected(s.b, s.turn)) s.win = s.turn;
    s.turn = 1 - s.turn;
  }

  const moves = (s) => {
    if (s.win !== undefined) return [];
    const out = [];
    for (let i = 0; i < CELLS; i++) if (!s.b[i]) out.push(i);
    return out;
  };
  const legal = (s, i) => Number.isInteger(i) && i >= 0 && i < CELLS && !s.b[i] && s.win === undefined;

  // случайное доигрывание: заполняем доску до конца (в гексе ничьих не бывает) и смотрим, кто соединил
  const tmp = new Uint8Array(CELLS);
  const empt = new Int16Array(CELLS);
  function rollout(s) {
    let n = 0;
    for (let i = 0; i < CELLS; i++) {
      tmp[i] = s.b[i];
      if (!tmp[i]) empt[n++] = i;
    }
    for (let k = n - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      const t = empt[k];
      empt[k] = empt[j];
      empt[j] = t;
    }
    let who = s.turn;
    for (let k = 0; k < n; k++) {
      tmp[empt[k]] = who + 1;
      who = 1 - who;
    }
    return connected(tmp, 0) ? 0 : 1;
  }

  const G = {
    moves,
    play(s, m) {
      const c = clone(s);
      apply(c, m);
      return c;
    },
    winner: (s) => s.win,
    rollout,
  };

  const AI_MS = { easy: 150, normal: 900, hard: 2200 };

  function ai(s, level) {
    const ms = moves(s);
    // выигрыш в один ход и защита от него
    for (const m of ms) {
      s.b[m] = s.turn + 1;
      const w = connected(s.b, s.turn);
      s.b[m] = 0;
      if (w) return m;
    }
    for (const m of ms) {
      s.b[m] = 2 - s.turn;
      const w = connected(s.b, 1 - s.turn);
      s.b[m] = 0;
      if (w && level !== 'easy') return m;
    }
    // первый ход — ближе к центру
    if (s.n === 0) {
      const c = Math.floor(N / 2);
      const opts = [c * N + c, (c - 1) * N + c + 1, (c + 1) * N + c - 1];
      return opts[Math.floor(Math.random() * opts.length)];
    }
    return rave(s, AI_MS[level]);
  }

  // UCT с RAVE: в гексе случайное доигрывание заполняет всю доску, поэтому статистика «все ходы как первые»
  // (AMAF) очень информативна и сильно ускоряет поиск
  function rave(root, ms) {
    const deadline = performance.now() + ms;
    const K = 800;
    const mk = (s, move) => ({ s, move, n: 0, w: 0, an: 0, aw: 0, kids: null });
    const top = mk(clone(root), -1);
    const final = new Uint8Array(CELLS);
    let it = 0;
    while ((it & 31) || performance.now() < deadline) {
      it++;
      const path = [top];
      let node = top;
      // спуск по дереву
      while (node.kids && node.kids.length && node.s.win === undefined) {
        let best = null;
        let bv = -1;
        for (const k of node.kids) {
          const beta = k.an / (k.n + k.an + (k.n * k.an) / K + 1e-9);
          const q = k.n ? k.w / k.n : 0.5;
          const a = k.an ? k.aw / k.an : 0.5;
          const v = (1 - beta) * q + beta * a + (k.n ? 0 : 0.5);
          if (v > bv) {
            bv = v;
            best = k;
          }
        }
        node = best;
        path.push(node);
      }
      // раскрываем лист, если его уже посещали
      if (!node.kids && node.s.win === undefined && (node.n > 0 || node === top)) {
        node.kids = moves(node.s).map((m) => {
          const c = clone(node.s);
          apply(c, m);
          return mk(c, m);
        });
        if (node.kids.length) {
          node = node.kids[Math.floor(Math.random() * node.kids.length)];
          path.push(node);
        }
      }
      // доигрывание
      let winner;
      if (node.s.win !== undefined) {
        winner = node.s.win;
        for (let i = 0; i < CELLS; i++) final[i] = node.s.b[i];
      } else {
        winner = rollout(node.s);
        final.set(tmp);
      }
      // обратный проход: обычная статистика и AMAF для всех ходов, сделанных тем же игроком
      for (let d = path.length - 1; d >= 0; d--) {
        const nd = path[d];
        nd.n++;
        if (d > 0) nd.w += winner === path[d - 1].s.turn ? 1 : 0;
        if (nd.kids) {
          const mover = nd.s.turn;
          for (const k of nd.kids) {
            if (final[k.move] === mover + 1) {
              k.an++;
              if (winner === mover) k.aw++;
            }
          }
        }
      }
    }
    let best = top.kids[0];
    for (const k of top.kids) if (k.n > best.n) best = k;
    SG.duel.lastIterations = it;
    return best.move;
  }

  // ---------- отрисовка ----------

  const svg = document.getElementById('board');
  const NS = 'http://www.w3.org/2000/svg';
  const R = 10;
  const W = Math.sqrt(3) * R;
  const cx = (r, c) => 20 + (c + r / 2) * W + W / 2;
  const cy = (r) => 20 + r * 1.5 * R + R;
  const hexPath = (x, y, k = 1) => {
    let d = '';
    for (let a = 0; a < 6; a++) {
      const ang = (Math.PI / 180) * (60 * a - 30);
      d += (a ? 'L' : 'M') + (x + R * k * Math.cos(ang)).toFixed(2) + ' ' + (y + R * k * Math.sin(ang)).toFixed(2);
    }
    return d + 'Z';
  };
  const width = cx(N - 1, N - 1) + W / 2 + 20;
  const height = cy(N - 1) + R + 20;
  svg.setAttribute('viewBox', `0 0 ${width.toFixed(1)} ${height.toFixed(1)}`);

  // цветные края: верх и низ — красные, левый и правый — синие
  const edge = (pts, cls) => `<polyline class="hx-edge ${cls}" points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}"/>`;
  const top = [];
  const bottom = [];
  const left = [];
  const right = [];
  for (let k = 0; k < N; k++) {
    top.push([cx(0, k) - W / 2, cy(0) - R / 2], [cx(0, k), cy(0) - R]);
    bottom.push([cx(N - 1, k), cy(N - 1) + R], [cx(N - 1, k) + W / 2, cy(N - 1) + R / 2]);
    left.push([cx(k, 0) - W / 2, cy(k) - R / 2], [cx(k, 0) - W / 2, cy(k) + R / 2]);
    right.push([cx(k, N - 1) + W / 2, cy(k) - R / 2], [cx(k, N - 1) + W / 2, cy(k) + R / 2]);
  }
  let html = '<g class="hx-edges">' + edge(top, 'red') + edge(bottom, 'red') + edge(left, 'blue') + edge(right, 'blue') + '</g><g class="hx-cells">';
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) html += `<path class="hx" data-i="${r * N + c}" d="${hexPath(cx(r, c), cy(r))}"/>`;
  html += '</g><g class="hx-stones"></g>';
  svg.innerHTML = html;
  const cellEls = [...svg.querySelectorAll('.hx')];
  const stones = svg.querySelector('.hx-stones');
  cellEls.forEach((el, i) => {
    el.addEventListener('click', () => duel.play(i));
    const r = Math.floor(i / N);
    const c = i % N;
    el.setAttribute('aria-label', 'abcdefghijk'[c] + (r + 1));
  });

  const duel = SG.duel({
    game: 'hex',
    sides: ['Красные', 'Синие'],
    create,
    legal,
    apply,
    over(s) {
      if (s.win === undefined) return null;
      return { winner: s.win, text: (s.win === 0 ? 'Красные соединили верх и низ.' : 'Синие соединили левый и правый края.') };
    },
    hint: (s) => (s.turn === 0 ? 'соедините верхний и нижний края' : 'соедините левый и правый края'),
    ai,
    aiDelay: 250,
    render(s, v) {
      const path = s.win !== undefined ? new Set(connected(s.b, s.win, true) || []) : new Set();
      let st = '';
      for (let i = 0; i < CELLS; i++) {
        const el = cellEls[i];
        el.setAttribute('class', 'hx' + (s.b[i] ? ' taken' : v.canMove ? ' free' : '') + (path.has(i) ? ' path' : ''));
        if (s.b[i]) {
          const r = Math.floor(i / N);
          const c = i % N;
          st += `<path class="hx-stone ${s.b[i] === 1 ? 'red' : 'blue'}${i === s.last ? ' last' : ''}${path.has(i) ? ' path' : ''}" d="${hexPath(cx(r, c), cy(r), 0.78)}"/>`;
        }
      }
      stones.innerHTML = st;
      svg.classList.toggle('turn-blue', s.turn === 1);
    },
  });
})();
