/* Го 9×9: подсчёт по площади (китайские правила), коми 6,5, правило ко */
(() => {
  'use strict';

  const N = 9;
  const CELLS = N * N;
  const PASS = CELLS;
  const KOMI = 6.5;
  const fmt = (x) => String(x).replace('.', ',');
  const NB = [];
  const DIAG = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      NB.push([[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => a >= 0 && a < N && b >= 0 && b < N).map(([a, b]) => a * N + b));
      DIAG.push([[r - 1, c - 1], [r - 1, c + 1], [r + 1, c - 1], [r + 1, c + 1]].filter(([a, b]) => a >= 0 && a < N && b >= 0 && b < N).map(([a, b]) => a * N + b));
    }
  }

  // ---------- правила ----------
  const mark = new Int32Array(CELLS);
  let stamp = 0;
  const q = new Int16Array(CELLS);

  // есть ли у группы камня i хоть одно дыхание
  function hasLiberty(b, i) {
    const col = b[i];
    stamp++;
    let h = 0;
    let t = 0;
    q[t++] = i;
    mark[i] = stamp;
    while (h < t) {
      const x = q[h++];
      for (const y of NB[x]) {
        if (!b[y]) return true;
        if (b[y] === col && mark[y] !== stamp) {
          mark[y] = stamp;
          q[t++] = y;
        }
      }
    }
    return false;
  }

  function removeGroup(b, i, out) {
    const col = b[i];
    let n = 0;
    const st = [i];
    b[i] = 0;
    while (st.length) {
      const x = st.pop();
      n++;
      if (out) out.push(x);
      for (const y of NB[x]) {
        if (b[y] === col) {
          b[y] = 0;
          st.push(y);
        }
      }
    }
    return n;
  }

  // ставит камень; возвращает число снятых камней или −1, если ход невозможен (самоубийство)
  function place(b, i, col, capturedOut) {
    b[i] = col;
    const opp = 3 - col;
    let caps = 0;
    for (const y of NB[i]) if (b[y] === opp && !hasLiberty(b, y)) caps += removeGroup(b, y, capturedOut);
    if (!caps && !hasLiberty(b, i)) {
      b[i] = 0;
      return -1;
    }
    return caps;
  }

  // точка — «глаз» цвета col: все соседи свои и не больше одного чужого угла (на краю — ни одного)
  function isEye(b, i, col) {
    for (const y of NB[i]) if (b[y] !== col) return false;
    let bad = 0;
    for (const y of DIAG[i]) if (b[y] === 3 - col) bad++;
    return DIAG[i].length < 4 ? bad === 0 : bad <= 1;
  }

  // подсчёт по площади: камни + пустые области, окружённые только своими
  function score(b, withMap) {
    const area = [0, 0, 0];
    const owner = withMap ? new Int8Array(CELLS) : null;
    const seen = new Uint8Array(CELLS);
    for (let i = 0; i < CELLS; i++) {
      if (b[i]) {
        area[b[i]]++;
        continue;
      }
      if (seen[i]) continue;
      const region = [];
      const st = [i];
      seen[i] = 1;
      let touch = 0;
      while (st.length) {
        const x = st.pop();
        region.push(x);
        for (const y of NB[x]) {
          if (!b[y]) {
            if (!seen[y]) {
              seen[y] = 1;
              st.push(y);
            }
          } else touch |= b[y];
        }
      }
      if (touch === 1 || touch === 2) {
        area[touch] += region.length;
        if (owner) region.forEach((x) => (owner[x] = touch));
      }
    }
    return { black: area[1], white: area[2] + KOMI, owner };
  }

  const create = () => ({ b: new Int8Array(CELLS), turn: 0, ko: -1, passes: 0, caps: [0, 0], n: 0 });
  const clone = (s) => ({ b: s.b.slice(), turn: s.turn, ko: s.ko, passes: s.passes, caps: s.caps.slice(), n: s.n, last: s.last });

  function legalPoint(s, i) {
    if (s.b[i] || i === s.ko) return false;
    const b = s.b;
    b[i] = s.turn + 1;
    let ok = false;
    for (const y of NB[i]) {
      if (!b[y]) ok = true;
      else if (b[y] === 2 - s.turn && !hasLiberty(b, y)) ok = true;
    }
    if (!ok) ok = hasLiberty(b, i);
    b[i] = 0;
    return ok;
  }

  const legal = (s, m) => s.passes < 2 && Number.isInteger(m) && (m === PASS || (m >= 0 && m < CELLS && legalPoint(s, m)));

  function apply(s, m) {
    s.n++;
    s.last = m;
    s.captured = [];
    if (m === PASS) {
      s.passes++;
      s.ko = -1;
    } else {
      const caps = place(s.b, m, s.turn + 1, s.captured);
      s.caps[s.turn] += caps;
      s.passes = 0;
      // ко: сняли ровно один камень одиночным камнем с единственным дыханием
      s.ko = -1;
      if (caps === 1) {
        const libs = NB[m].filter((y) => !s.b[y]);
        const alone = NB[m].every((y) => s.b[y] !== s.turn + 1);
        if (alone && libs.length === 1) s.ko = libs[0];
      }
    }
    s.turn = 1 - s.turn;
  }

  // ---------- компьютер: UCT + RAVE со случайным доигрыванием ----------

  const tb = new Int8Array(CELLS);
  const first = new Int8Array(CELLS);
  const empties = new Int16Array(CELLS);

  function rollout(s) {
    tb.set(s.b);
    let turn = s.turn;
    let ko = s.ko;
    let passes = s.passes;
    for (let step = 0; step < 220 && passes < 2; step++) {
      const col = turn + 1;
      let n = 0;
      for (let i = 0; i < CELLS; i++) if (!tb[i]) empties[n++] = i;
      let played = -1;
      while (n > 0) {
        const k = Math.floor(Math.random() * n);
        const i = empties[k];
        empties[k] = empties[--n];
        if (i === ko || isEye(tb, i, col)) continue;
        const caps = place(tb, i, col, null);
        if (caps < 0) continue;
        played = i;
        ko = -1;
        if (caps === 1) {
          let libs = 0;
          let lib = -1;
          let alone = true;
          for (const y of NB[i]) {
            if (!tb[y]) {
              libs++;
              lib = y;
            } else if (tb[y] === col) alone = false;
          }
          if (alone && libs === 1) ko = lib;
        }
        break;
      }
      if (played < 0) {
        passes++;
        ko = -1;
      } else {
        passes = 0;
        if (!first[played]) first[played] = col;
      }
      turn = 1 - turn;
    }
    const sc = score(tb);
    return sc.black > sc.white ? 0 : 1;
  }

  function candidates(s) {
    const out = [];
    for (let i = 0; i < CELLS; i++) if (!s.b[i] && !isEye(s.b, i, s.turn + 1) && legalPoint(s, i)) out.push(i);
    return out;
  }

  function think(root, ms) {
    const deadline = performance.now() + ms;
    const K = 1000;
    const mk = (s, move) => ({ s, move, n: 0, w: 0, an: 0, aw: 0, kids: null });
    const top = mk(clone(root), -1);
    let it = 0;
    while ((it & 15) || performance.now() < deadline) {
      it++;
      first.fill(0);
      const path = [top];
      let node = top;
      while (node.kids && node.kids.length) {
        let best = null;
        let bv = -1;
        for (const k of node.kids) {
          const beta = k.an / (k.n + k.an + (k.n * k.an) / K + 1e-9);
          const qv = k.n ? k.w / k.n : 0.5;
          const av = k.an ? k.aw / k.an : 0.5;
          const v = (1 - beta) * qv + beta * av + (k.n ? 0 : 0.3);
          if (v > bv) {
            bv = v;
            best = k;
          }
        }
        node = best;
        path.push(node);
        if (!first[node.move]) first[node.move] = path[path.length - 2].s.turn + 1;
      }
      if (!node.kids && node.s.passes < 2 && (node.n > 0 || node === top)) {
        node.kids = candidates(node.s).map((m) => {
          const c = clone(node.s);
          apply(c, m);
          return mk(c, m);
        });
        if (node.kids.length) {
          const parent = node;
          node = node.kids[Math.floor(Math.random() * node.kids.length)];
          path.push(node);
          if (!first[node.move]) first[node.move] = parent.s.turn + 1;
        }
      }
      const winner = rollout(node.s);
      for (let d = path.length - 1; d >= 0; d--) {
        const nd = path[d];
        nd.n++;
        if (d > 0) nd.w += winner === path[d - 1].s.turn ? 1 : 0;
        if (nd.kids) {
          const mover = nd.s.turn;
          for (const k of nd.kids) {
            if (first[k.move] === mover + 1) {
              k.an++;
              if (winner === mover) k.aw++;
            }
          }
        }
      }
    }
    SG.duel.lastIterations = it;
    if (!top.kids || !top.kids.length) return { move: PASS, rate: 0 };
    let best = top.kids[0];
    for (const k of top.kids) if (k.n > best.n) best = k;
    return { move: best.move, rate: best.w / Math.max(1, best.n) };
  }

  const AI_MS = { easy: 300, normal: 1200, hard: 3000 };

  function ai(s, level) {
    const me = s.turn;
    const sc = score(s.b);
    const ahead = me === 0 ? sc.black > sc.white : sc.white > sc.black;
    // соперник спасовал и мы впереди по текущему счёту — пасуем и заканчиваем
    if (s.passes === 1 && ahead && s.n > 20) return PASS;
    const res = think(s, AI_MS[level]);
    // партия решена и ходить осталось только в свои владения — пасуем
    if (res.move === PASS || (res.rate > 0.95 && ahead && s.n > 40)) return PASS;
    if (level === 'easy' && Math.random() < 0.25) {
      const c = candidates(s);
      if (c.length) return c[Math.floor(Math.random() * c.length)];
    }
    return res.move;
  }

  // ---------- отрисовка ----------

  const svg = document.getElementById('board');
  const passBtn = document.getElementById('pass-btn');
  const infoEl = document.getElementById('go-info');
  const S = 10;
  const P = (k) => 10 + k * S;
  let grid = '';
  for (let k = 0; k < N; k++) grid += `<line x1="${P(0)}" y1="${P(k)}" x2="${P(N - 1)}" y2="${P(k)}"/><line x1="${P(k)}" y1="${P(0)}" x2="${P(k)}" y2="${P(N - 1)}"/>`;
  for (const [r, c] of [[2, 2], [2, 6], [4, 4], [6, 2], [6, 6]]) grid += `<circle class="star" cx="${P(c)}" cy="${P(r)}" r="1"/>`;
  svg.setAttribute('viewBox', `0 0 ${P(N - 1) + 10} ${P(N - 1) + 10}`);
  svg.innerHTML = `<g class="go-grid">${grid}</g><g class="go-hits"></g><g class="go-stones"></g>`;
  const hits = svg.querySelector('.go-hits');
  const stonesG = svg.querySelector('.go-stones');
  let hh = '';
  for (let i = 0; i < CELLS; i++) hh += `<rect data-i="${i}" x="${P(i % N) - S / 2}" y="${P(Math.floor(i / N)) - S / 2}" width="${S}" height="${S}"/>`;
  hits.innerHTML = hh;
  hits.addEventListener('click', (e) => {
    const r = e.target.closest('rect');
    if (r) duel.play(+r.dataset.i);
  });
  passBtn.addEventListener('click', () => duel.play(PASS));

  const duel = SG.duel({
    game: 'go',
    sides: ['Чёрные', 'Белые'],
    create,
    legal,
    apply,
    over(s) {
      if (s.passes < 2) return null;
      const sc = score(s.b);
      const d = sc.black - sc.white;
      return { winner: d > 0 ? 0 : 1, text: `Чёрные ${sc.black} : ${fmt(sc.white)} белые (с коми ${fmt(KOMI)}).` };
    },
    hint: (s) => (s.passes === 1 ? 'соперник спасовал: пас в ответ закончит партию' : ''),
    ai,
    aiDelay: 200,
    sound: (s, m) => (m === PASS ? 'click' : s.captured && s.captured.length ? 'capture' : 'place'),
    render(s, v) {
      let st = '';
      const owner = s.passes >= 2 ? score(s.b, true).owner : null;
      for (let i = 0; i < CELLS; i++) {
        const x = P(i % N);
        const y = P(Math.floor(i / N));
        if (s.b[i]) st += `<circle class="go-stone ${s.b[i] === 1 ? 'b' : 'w'}" cx="${x}" cy="${y}" r="4.6"/>`;
        else if (owner && owner[i]) st += `<rect class="go-terr ${owner[i] === 1 ? 'b' : 'w'}" x="${x - 1.8}" y="${y - 1.8}" width="3.6" height="3.6"/>`;
        if (i === s.last && s.b[i]) st += `<circle class="go-last ${s.b[i] === 1 ? 'b' : 'w'}" cx="${x}" cy="${y}" r="1.8"/>`;
      }
      if (v.canMove && s.ko >= 0) st += `<rect class="go-ko" x="${P(s.ko % N) - 2.5}" y="${P(Math.floor(s.ko / N)) - 2.5}" width="5" height="5"/>`;
      stonesG.innerHTML = st;
      svg.classList.toggle('can', v.canMove);
      svg.classList.toggle('turn-w', s.turn === 1);
      passBtn.disabled = !v.canMove;
      const sc = score(s.b);
      infoEl.textContent = `Взято камней: чёрные ${s.caps[0]}, белые ${s.caps[1]} · Сейчас по площади: ${sc.black} : ${fmt(sc.white)}` + (s.last === PASS && s.passes < 2 ? ' · ' + (s.turn === 1 ? 'Чёрные' : 'Белые') + ' спасовали' : '');
    },
  });
})();
