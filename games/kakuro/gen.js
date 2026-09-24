/* Генератор какуро с проверкой единственности решения */
(() => {
  'use strict';

  const bit = (d) => 1 << d;
  const popcount = (m) => {
    let n = 0;
    while (m) {
      m &= m - 1;
      n++;
    }
    return n;
  };

  // COMBOS[k][s] — маски наборов из k разных цифр 1..9 с суммой s
  const COMBOS = Array.from({ length: 10 }, () => Array.from({ length: 46 }, () => []));
  for (let m = 0; m < 1 << 10; m += 2) {
    let s = 0;
    for (let d = 1; d <= 9; d++) if (m & bit(d)) s += d;
    COMBOS[popcount(m)][s].push(m);
  }

  // ---------- раскладка ----------

  function layout(R, C, maxRun) {
    for (let tries = 0; tries < 500; tries++) {
      const white = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => r > 0 && c > 0));
      const setBlack = (r, c) => {
        white[r][c] = false;
        white[R - r][C - c] = false; // симметрия (без нулевой строки/столбца)
      };
      const blacks = Math.floor((R - 1) * (C - 1) * (0.2 + Math.random() * 0.08));
      for (let k = 0; k < blacks / 2; k++) {
        const r = 1 + Math.floor(Math.random() * (R - 1));
        const c = 1 + Math.floor(Math.random() * (C - 1));
        setBlack(r, c);
      }
      // режем слишком длинные серии и убираем одиночки
      for (let pass = 0; pass < 6; pass++) {
        let changed = false;
        const runs = (horiz) => {
          const out = [];
          for (let a = 1; a < (horiz ? R : C); a++) {
            let b = 1;
            while (b < (horiz ? C : R)) {
              const w = (x) => (horiz ? white[a][x] : white[x][a]);
              if (!w(b)) {
                b++;
                continue;
              }
              const start = b;
              while (b < (horiz ? C : R) && w(b)) b++;
              out.push({ horiz, a, start, len: b - start });
            }
          }
          return out;
        };
        for (const run of [...runs(true), ...runs(false)]) {
          const cellAt = (k) => (run.horiz ? [run.a, run.start + k] : [run.start + k, run.a]);
          if (run.len === 1) {
            const [r, c] = cellAt(0);
            setBlack(r, c);
            changed = true;
          } else if (run.len > maxRun) {
            const k = 2 + Math.floor(Math.random() * (run.len - 4));
            const [r, c] = cellAt(Math.min(k, run.len - 3));
            setBlack(r, c);
            changed = true;
          }
        }
        if (!changed) break;
      }
      // проверка: все серии 2..maxRun, белые клетки связны, их достаточно
      let ok = true;
      const cells = [];
      for (let r = 1; r < R; r++)
        for (let c = 1; c < C; c++) {
          if (!white[r][c]) continue;
          cells.push([r, c]);
          const h = (white[r][c - 1] || (c + 1 < C && white[r][c + 1]));
          const v = (white[r - 1][c] || (r + 1 < R && white[r + 1][c]));
          if (!h || !v) ok = false;
        }
      if (!ok || cells.length < (R - 1) * (C - 1) * 0.55) continue;
      // пустые строки и столбцы — зря потраченное место
      let empty = false;
      for (let r = 1; r < R; r++) if (!white[r].some(Boolean)) empty = true;
      for (let c = 1; c < C; c++) if (!white.some((row) => row[c])) empty = true;
      if (empty) continue;
      const seen = new Set([cells[0].join()]);
      const st = [cells[0]];
      while (st.length) {
        const [r, c] = st.pop();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr > 0 && rr < R && cc > 0 && cc < C && white[rr][cc] && !seen.has(rr + ',' + cc)) {
            seen.add(rr + ',' + cc);
            st.push([rr, cc]);
          }
        }
      }
      if (seen.size !== cells.length) continue;
      // проверяем длины серий ещё раз
      let bad = false;
      for (let r = 1; r < R && !bad; r++) {
        let len = 0;
        for (let c = 1; c <= C; c++) {
          if (c < C && white[r][c]) len++;
          else {
            if (len === 1 || len > maxRun) bad = true;
            len = 0;
          }
        }
      }
      for (let c = 1; c < C && !bad; c++) {
        let len = 0;
        for (let r = 1; r <= R; r++) {
          if (r < R && white[r][c]) len++;
          else {
            if (len === 1 || len > maxRun) bad = true;
            len = 0;
          }
        }
      }
      if (!bad) return white;
    }
    return null;
  }

  // ---------- серии ----------

  function buildRuns(white, R, C) {
    const runs = [];
    const cellRuns = {};
    const add = (cells, clue, horiz) => {
      const id = runs.length;
      runs.push({ cells, clue, horiz });
      cells.forEach((i) => (cellRuns[i] = cellRuns[i] || []).push(id));
    };
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++) {
        if (white[r][c]) continue;
        if (c + 1 < C && white[r][c + 1]) {
          const cells = [];
          for (let x = c + 1; x < C && white[r][x]; x++) cells.push(r * C + x);
          add(cells, r * C + c, true);
        }
        if (r + 1 < R && white[r + 1][c]) {
          const cells = [];
          for (let y = r + 1; y < R && white[y][c]; y++) cells.push(y * C + c);
          add(cells, r * C + c, false);
        }
      }
    return { runs, cellRuns };
  }

  // ---------- заполнение цифрами ----------

  function fill(runs, cellRuns, cells) {
    runs.forEach((r) => (r.bias = Math.random() < 0.5 ? -1 : 1));
    const val = {};
    const order = cells.slice();
    let nodes = 0;
    const rec = (k) => {
      if (++nodes > 20000) return false;
      if (k === order.length) return true;
      const i = order[k];
      let used = 0;
      cellRuns[i].forEach((id) => runs[id].cells.forEach((j) => val[j] && (used |= bit(val[j]))));
      // склоняем серии к «крайним» суммам — у них мало вариантов разложения
      const pref = cellRuns[i].reduce((a, id) => a + runs[id].bias, 0);
      const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
        .filter((d) => !(used & bit(d)))
        .map((d) => [d, pref * (d - 5) + Math.random() * 4])
        .sort((a, b) => b[1] - a[1])
        .map((x) => x[0]);
      for (const d of digits) {
        val[i] = d;
        if (rec(k + 1)) return true;
      }
      delete val[i];
      return false;
    };
    return rec(0) ? val : null;
  }

  // ---------- решатель: ищет до двух решений ----------

  function solve(runs, cellRuns, cells, fixed, budget) {
    const val = Object.assign({}, fixed);
    const sols = [];
    let nodes = 0;
    const allowed = (i) => {
      let mask = 0x3fe;
      for (const id of cellRuns[i]) {
        const run = runs[id];
        let used = 0;
        let s = run.sum;
        let free = 0;
        for (const j of run.cells) {
          if (val[j]) {
            used |= bit(val[j]);
            s -= val[j];
          } else free++;
        }
        let m = 0;
        if (s > 0 && s <= 45) for (const cm of COMBOS[free][s]) if (!(cm & used)) m |= cm;
        mask &= m;
        if (!mask) return 0;
      }
      return mask;
    };
    const rec = () => {
      if (sols.length >= 2 || ++nodes > budget) return;
      let best = -1;
      let bestMask = 0;
      let bestN = 99;
      for (const i of cells) {
        if (val[i]) continue;
        const m = allowed(i);
        const n = popcount(m);
        if (n === 0) return;
        if (n < bestN) {
          bestN = n;
          best = i;
          bestMask = m;
          if (n === 1) break;
        }
      }
      if (best < 0) {
        sols.push(Object.assign({}, val));
        return;
      }
      for (let d = 1; d <= 9; d++) {
        if (!(bestMask & bit(d))) continue;
        val[best] = d;
        rec();
        if (sols.length >= 2 || nodes > budget) break;
      }
      delete val[best];
    };
    rec();
    return nodes > budget ? null : sols;
  }

  function generate(R, C, maxRun) {
    for (let t = 0; t < 100; t++) {
      const white = layout(R, C, maxRun);
      if (!white) continue;
      const { runs, cellRuns } = buildRuns(white, R, C);
      const cells = [];
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (white[r][c]) cells.push(r * C + c);
      const val = fill(runs, cellRuns, cells);
      if (!val) continue;
      runs.forEach((run) => (run.sum = run.cells.reduce((s, i) => s + val[i], 0)));
      // пока решений больше одного — открываем цифру в клетке, где решения расходятся
      const fixed = {};
      const maxGivens = Math.ceil(cells.length * 0.12);
      let ok = false;
      for (let g = 0; g <= maxGivens; g++) {
        const sols = solve(runs, cellRuns, cells, fixed, 15000);
        let pick;
        if (!sols) {
          const free = cells.filter((i) => !fixed[i]);
          pick = free[Math.floor(Math.random() * free.length)];
        } else if (sols.length === 1) {
          ok = true;
          break;
        } else {
          const diff = cells.filter((i) => sols[0][i] !== sols[1][i]);
          pick = diff[Math.floor(Math.random() * diff.length)];
        }
        fixed[pick] = val[pick];
      }
      if (!ok) continue;
      return {
        R,
        C,
        white: cells,
        solution: cells.map((i) => val[i]),
        givens: cells.filter((i) => fixed[i]),
        runs: runs.map((r) => ({ clue: r.clue, horiz: r.horiz, cells: r.cells, sum: r.sum })),
      };
    }
    return null;
  }

  window.KakuroGen = { generate };
})();
