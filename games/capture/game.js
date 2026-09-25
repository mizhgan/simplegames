/* Точки (захват): ставьте точки и окружайте точки соперника */
(() => {
  'use strict';

  const N = 16; // точек по стороне
  const CELLS = N * N;
  const LIMIT = 200; // ходов на партию (по 100 каждому)
  const NB4 = [];
  const NB8 = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const n4 = [];
      const n8 = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          n8.push(ny * N + nx);
          if (!dx || !dy) n4.push(ny * N + nx);
        }
      }
      NB4.push(n4);
      NB8.push(n8);
    }
  }
  const border = (i) => i % N === 0 || i % N === N - 1 || i < N || i >= CELLS - N;

  // dot: −1 пусто, 0/1 — чья точка; owner: −1 или кто захватил клетку (площадь)
  const create = () => ({ dot: new Array(CELLS).fill(-1), owner: new Array(CELLS).fill(-1), score: [0, 0], turn: 0, n: 0 });
  const clone = (s) => ({ dot: s.dot.slice(), owner: s.owner.slice(), score: s.score.slice(), turn: s.turn, n: s.n, last: s.last });

  // захваты игрока p: области, отрезанные его точками от края, с живыми точками соперника внутри
  function captures(s, p) {
    const wall = (i) => s.dot[i] === p && (s.owner[i] === -1 || s.owner[i] === p);
    const seen = new Uint8Array(CELLS);
    const stack = [];
    for (let i = 0; i < CELLS; i++) {
      if (border(i) && !wall(i) && !seen[i]) {
        seen[i] = 1;
        stack.push(i);
      }
    }
    while (stack.length) {
      const i = stack.pop();
      for (const j of NB4[i]) {
        if (!seen[j] && !wall(j)) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    let got = 0;
    const done = new Uint8Array(CELLS);
    for (let i = 0; i < CELLS; i++) {
      if (seen[i] || done[i] || wall(i)) continue;
      // замкнутая область
      const region = [];
      const st = [i];
      done[i] = 1;
      while (st.length) {
        const k = st.pop();
        region.push(k);
        for (const j of NB4[k]) {
          if (!done[j] && !seen[j] && !wall(j)) {
            done[j] = 1;
            st.push(j);
          }
        }
      }
      const enemies = region.filter((k) => s.dot[k] === 1 - p && s.owner[k] !== p);
      if (!enemies.length) continue;
      for (const k of region) {
        if (s.owner[k] !== p) {
          if (s.dot[k] === 1 - p && s.owner[k] === -1) got++;
          // своя захваченная раньше точка возвращается в игру
          if (s.dot[k] === p && s.owner[k] === 1 - p) s.score[1 - p]--;
          s.owner[k] = p;
        }
      }
    }
    s.score[p] += got;
    return got;
  }

  const free = (s, i) => s.dot[i] === -1 && s.owner[i] === -1;

  function apply(s, i) {
    const me = s.turn;
    s.dot[i] = me;
    s.last = i;
    s.n++;
    s.gained = captures(s, me);
    // точка, поставленная в уже окружённую соперником область, сразу захватывается
    if (!s.gained) captures(s, 1 - me);
    s.turn = 1 - me;
  }

  const legal = (s, i) => Number.isInteger(i) && i >= 0 && i < CELLS && free(s, i) && !isOver(s);
  const isOver = (s) => s.n >= LIMIT || !s.dot.some((d, i) => d === -1 && s.owner[i] === -1);

  // ---------- компьютер ----------

  function candidates(s) {
    const out = new Set();
    let any = false;
    for (let i = 0; i < CELLS; i++) {
      if (s.dot[i] === -1) continue;
      any = true;
      for (const j of NB8[i]) {
        if (free(s, j)) out.add(j);
        for (const k of NB8[j]) if (free(s, k)) out.add(k);
      }
    }
    if (!any) return [((N >> 1) - 1) * N + (N >> 1) - 1 + Math.floor(Math.random() * 2)];
    return [...out];
  }

  function scoreMove(s, i, me) {
    const c = clone(s);
    c.turn = me;
    apply(c, i);
    let v = (c.score[me] - s.score[me]) * 100 - (c.score[1 - me] - s.score[1 - me]) * 100;
    // соседство со своими и с чужими точками — строим стены
    for (const j of NB8[i]) {
      if (s.dot[j] === me) v += 2;
      if (s.dot[j] === 1 - me) v += 3;
    }
    // не у самого края
    const x = i % N;
    const y = Math.floor(i / N);
    if (x === 0 || y === 0 || x === N - 1 || y === N - 1) v -= 4;
    return v + Math.random();
  }

  function ai(s, level) {
    const me = s.turn;
    const cand = candidates(s);
    if (level === 'easy' && Math.random() < 0.4) return cand[Math.floor(Math.random() * cand.length)];
    // угрозы соперника: где он захватит, если сходит туда
    const threat = new Map();
    if (level !== 'easy') {
      for (const j of cand) {
        const c = clone(s);
        c.turn = 1 - me;
        apply(c, j);
        const loss = c.score[1 - me] - s.score[1 - me];
        if (loss > 0) threat.set(j, loss);
      }
    }
    let scored = cand.map((i) => [i, scoreMove(s, i, me) + (threat.get(i) || 0) * 90]);
    scored.sort((a, b) => b[1] - a[1]);
    if (level === 'hard') {
      // проверяем лучшие ходы на ответ соперника
      scored = scored.slice(0, 10).map(([i, v]) => {
        const c = clone(s);
        c.turn = me;
        apply(c, i);
        let worst = 0;
        for (const j of candidates(c).slice(0, 60)) {
          const d = clone(c);
          d.turn = 1 - me;
          apply(d, j);
          worst = Math.max(worst, d.score[1 - me] - c.score[1 - me]);
        }
        return [i, v - worst * 80];
      });
      scored.sort((a, b) => b[1] - a[1]);
    }
    return scored[0][0];
  }

  // ---------- отрисовка ----------

  const svg = document.getElementById('board');
  const G = 24;
  const P = (k) => 14 + k * G;
  const SIZE = P(N - 1) + 14;
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  let grid = '';
  for (let k = 0; k < N; k++) grid += `<line x1="${P(0)}" y1="${P(k)}" x2="${P(N - 1)}" y2="${P(k)}"/><line x1="${P(k)}" y1="${P(0)}" x2="${P(k)}" y2="${P(N - 1)}"/>`;
  svg.innerHTML = `<g class="cp-area"></g><g class="cp-grid">${grid}</g><g class="cp-links"></g><g class="cp-dots"></g><g class="cp-hits"></g>`;
  const areaG = svg.querySelector('.cp-area');
  const linksG = svg.querySelector('.cp-links');
  const dotsG = svg.querySelector('.cp-dots');
  const hits = svg.querySelector('.cp-hits');
  let hh = '';
  for (let i = 0; i < CELLS; i++) hh += `<circle data-i="${i}" cx="${P(i % N)}" cy="${P(Math.floor(i / N))}" r="11"/>`;
  hits.innerHTML = hh;
  hits.addEventListener('click', (e) => {
    const c = e.target.closest('circle');
    if (c) duel.play(+c.dataset.i);
  });

  const duel = SG.duel({
    game: 'capture',
    sides: ['Синие', 'Красные'],
    create,
    legal,
    apply,
    over(s) {
      if (!isOver(s)) return null;
      const [a, b] = s.score;
      return { winner: a === b ? null : a > b ? 0 : 1, text: 'Захвачено точек: ' + a + ' : ' + b + '.' };
    },
    hint: (s) => 'окружите точки соперника',
    ai,
    aiDelay: 300,
    sound: (s) => (s.gained ? 'capture' : 'place'),
    render(s, v) {
      let area = '';
      for (let i = 0; i < CELLS; i++) {
        if (s.owner[i] < 0) continue;
        area += `<rect class="own-${s.owner[i]}" x="${P(i % N) - G / 2}" y="${P(Math.floor(i / N)) - G / 2}" width="${G}" height="${G}"/>`;
      }
      areaG.innerHTML = area;
      // контур: отрезки между соседними живыми точками, по одну сторону которых захваченная область, по другую — нет
      const alive = (k, p) => s.dot[k] === p && s.owner[k] !== 1 - p;
      const inside = (k, p) => s.owner[k] === p && s.dot[k] !== p;
      let links = '';
      for (let i = 0; i < CELLS; i++) {
        const p = s.dot[i];
        if (p < 0 || !alive(i, p)) continue;
        for (const j of NB8[i]) {
          if (j < i || !alive(j, p)) continue;
          const sides = NB8[i].filter((k) => k !== j && NB8[j].includes(k));
          if (sides.some((k) => inside(k, p)) && sides.some((k) => !inside(k, p) && !alive(k, p))) {
            links += `<line class="l-${p}" x1="${P(i % N)}" y1="${P(Math.floor(i / N))}" x2="${P(j % N)}" y2="${P(Math.floor(j / N))}"/>`;
          }
        }
      }
      linksG.innerHTML = links;
      let dots = '';
      for (let i = 0; i < CELLS; i++) {
        const p = s.dot[i];
        if (p < 0) continue;
        const dead = s.owner[i] === 1 - p;
        dots += `<circle class="d-${p}${dead ? ' dead' : ''}${i === s.last ? ' last' : ''}" cx="${P(i % N)}" cy="${P(Math.floor(i / N))}" r="${i === s.last ? 7 : 6}"/>`;
      }
      dotsG.innerHTML = dots;
      svg.classList.toggle('can', v.canMove);
      svg.classList.toggle('turn-1', s.turn === 1);
      document.getElementById('cp-info').textContent = 'Захвачено: синие ' + s.score[0] + ', красные ' + s.score[1] + ' · ходов осталось ' + Math.max(0, LIMIT - s.n);
    },
  });
})();
