/* Эрудит: составляйте слова на поле 15×15 (русский «скрэббл» для двоих) */
(() => {
  'use strict';

  const N = 15;
  const CENTER = 7 * N + 7;
  const RACK = 7;
  const BINGO = 15; // за все 7 фишек за ход
  // буква: [количество, очки]
  const TILES = {
    а: [10, 1], б: [3, 3], в: [5, 2], г: [3, 3], д: [5, 2], е: [9, 1], ж: [2, 5], з: [2, 5], и: [8, 1], й: [4, 2], к: [6, 2],
    л: [4, 2], м: [5, 2], н: [8, 1], о: [10, 1], п: [6, 2], р: [6, 2], с: [6, 2], т: [5, 2], у: [3, 3], ф: [1, 10], х: [2, 5],
    ц: [1, 10], ч: [2, 5], ш: [1, 10], щ: [1, 10], ъ: [1, 10], ы: [2, 5], ь: [2, 5], э: [1, 10], ю: [1, 10], я: [3, 3],
  };
  const VAL = (ch) => TILES[ch][1];

  // премиальные клетки: W3/W2 — слово ×3/×2, L3/L2 — буква ×3/×2
  const BONUS = new Array(N * N).fill('');
  const put = (kind, list) => list.forEach(([r, c]) => (BONUS[r * N + c] = kind));
  put('W3', [[0, 0], [0, 7], [0, 14], [7, 0], [7, 14], [14, 0], [14, 7], [14, 14]]);
  put('W2', [[1, 1], [2, 2], [3, 3], [4, 4], [1, 13], [2, 12], [3, 11], [4, 10], [13, 1], [12, 2], [11, 3], [10, 4], [13, 13], [12, 12], [11, 11], [10, 10], [7, 7]]);
  put('L3', [[1, 5], [1, 9], [5, 1], [5, 5], [5, 9], [5, 13], [9, 1], [9, 5], [9, 9], [9, 13], [13, 5], [13, 9]]);
  put('L2', [[0, 3], [0, 11], [2, 6], [2, 8], [3, 0], [3, 7], [3, 14], [6, 2], [6, 6], [6, 8], [6, 12], [7, 3], [7, 11], [8, 2], [8, 6], [8, 8], [8, 12], [11, 0], [11, 7], [11, 14], [12, 6], [12, 8], [14, 3], [14, 11]]);
  const BONUS_TEXT = { W3: 'СЛОВО ×3', W2: 'СЛОВО ×2', L3: 'БУКВА ×3', L2: 'БУКВА ×2' };

  // ---------- словарь ----------
  const DICT = new Set(['ад', 'ар', 'ас', 'до', 'еж', 'ил', 'ля', 'ми', 'ом', 'ре', 'си', 'ус', 'уж', 'ум', 'фа', 'юг', 'яд', 'як', 'ют', 'ор']);
  (() => {
    const digits = '0123456789abcdefghijklmnopqrstuvwxyz';
    let prev = '';
    window.BALDA_DICT_PACKED.split(' ').forEach((token) => {
      const w = prev.slice(0, digits.indexOf(token[0])) + token.slice(1);
      DICT.add(w);
      prev = w;
    });
  })();
  const AI_WORDS = window.BALDA_AI.concat([...DICT].filter((w) => w.length === 2)).filter((w) => /^[а-я]+$/.test(w) && w.length <= N);

  // ---------- правила ----------

  // генератор случайных чисел хранится в состоянии, чтобы обмен фишек у обоих игроков по сети совпадал
  function rand(s) {
    s.rnd = (s.rnd + 0x6d2b79f5) >>> 0;
    let t = s.rnd;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(s, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand(s) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function create(seed) {
    const bag = [];
    for (const ch in TILES) for (let k = 0; k < TILES[ch][0]; k++) bag.push(ch);
    const s = { board: new Array(N * N).fill(''), bag, racks: [[], []], scores: [0, 0], turn: 0, passes: 0, rnd: seed >>> 0, log: [] };
    shuffle(s, s.bag);
    for (const side of [0, 1]) draw(s, side);
    return s;
  }

  function draw(s, side) {
    while (s.racks[side].length < RACK && s.bag.length) s.racks[side].push(s.bag.pop());
  }

  const rcOf = (i) => [Math.floor(i / N), i % N];

  // читает слово через клетку i в направлении d (1 — вправо, N — вниз) с учётом новых фишек
  function wordAt(board, extra, i, d) {
    const get = (x) => extra.get(x) || board[x];
    const [r, c] = rcOf(i);
    const inLine = (x) => (d === 1 ? Math.floor(x / N) === r : x % N === c) && x >= 0 && x < N * N;
    let start = i;
    while (inLine(start - d) && get(start - d)) start -= d;
    const cells = [];
    for (let x = start; inLine(x) && get(x); x += d) cells.push(x);
    return { cells, word: cells.map(get).join('') };
  }

  // проверка и подсчёт хода; tiles — [[клетка, буква], …]
  function evaluate(s, tiles) {
    if (!tiles.length) return { error: 'Выложите фишки на поле' };
    const extra = new Map();
    for (const [i, ch] of tiles) {
      if (!Number.isInteger(i) || i < 0 || i >= N * N || s.board[i] || extra.has(i) || !TILES[ch]) return { error: 'Так ходить нельзя' };
      extra.set(i, ch);
    }
    const rows = new Set(tiles.map(([i]) => Math.floor(i / N)));
    const cols = new Set(tiles.map(([i]) => i % N));
    if (rows.size > 1 && cols.size > 1) return { error: 'Фишки должны стоять в одну линию' };
    const empty = s.board.every((x) => !x);
    let dir = rows.size === 1 && cols.size > 1 ? 1 : cols.size === 1 && rows.size > 1 ? N : 0;
    if (!dir) {
      // одна фишка: направление, в котором получается слово длиннее
      const h = wordAt(s.board, extra, tiles[0][0], 1);
      const v = wordAt(s.board, extra, tiles[0][0], N);
      dir = h.cells.length >= v.cells.length ? 1 : N;
    }
    const main = wordAt(s.board, extra, tiles[0][0], dir);
    // все новые фишки должны войти в одно слово без пропусков
    for (const [i] of tiles) if (!main.cells.includes(i)) return { error: 'Между фишками не должно быть пустых клеток' };
    if (main.cells.length < 2) return { error: 'Слово должно быть не короче двух букв' };
    const words = [main];
    for (const [i] of tiles) {
      const cross = wordAt(s.board, extra, i, dir === 1 ? N : 1);
      if (cross.cells.length > 1) words.push(cross);
    }
    if (empty) {
      if (!extra.has(CENTER)) return { error: 'Первое слово должно пройти через центральную звезду' };
    } else if (words.length === 1 && main.cells.every((x) => extra.has(x))) return { error: 'Слово должно касаться уже выложенных фишек' };
    const bad = words.filter((w) => !DICT.has(w.word));
    if (bad.length) return { error: 'Нет в словаре: ' + bad.map((w) => w.word.toUpperCase()).join(', '), words };
    let total = 0;
    for (const w of words) {
      let sum = 0;
      let mul = 1;
      for (const x of w.cells) {
        let v = VAL(extra.get(x) || s.board[x]);
        if (extra.has(x)) {
          if (BONUS[x] === 'L2') v *= 2;
          if (BONUS[x] === 'L3') v *= 3;
          if (BONUS[x] === 'W2') mul *= 2;
          if (BONUS[x] === 'W3') mul *= 3;
        }
        sum += v;
      }
      w.score = sum * mul;
      total += w.score;
    }
    if (tiles.length === RACK) total += BINGO;
    return { score: total, words };
  }

  function hasTiles(rack, letters) {
    const r = rack.slice();
    for (const ch of letters) {
      const k = r.indexOf(ch);
      if (k < 0) return false;
      r.splice(k, 1);
    }
    return true;
  }

  function legal(s, m) {
    if (!m || s.over) return false;
    const rack = s.racks[s.turn];
    if (m.pass) return true;
    if (Array.isArray(m.swap)) return m.swap.length > 0 && s.bag.length >= RACK && hasTiles(rack, m.swap);
    if (!Array.isArray(m.tiles)) return false;
    if (!hasTiles(rack, m.tiles.map((t) => t[1]))) return false;
    return !evaluate(s, m.tiles).error;
  }

  const rackValue = (rack) => rack.reduce((a, ch) => a + VAL(ch), 0);

  function apply(s, m) {
    const me = s.turn;
    const rack = s.racks[me];
    s.lastTiles = [];
    if (m.pass) {
      s.passes++;
      s.log.unshift({ side: me, text: 'пас' });
    } else if (m.swap) {
      for (const ch of m.swap) rack.splice(rack.indexOf(ch), 1);
      s.bag.push(...m.swap);
      shuffle(s, s.bag);
      draw(s, me);
      s.passes++;
      s.log.unshift({ side: me, text: 'обмен ' + m.swap.length + ' фишек' });
    } else {
      const res = evaluate(s, m.tiles);
      for (const [i, ch] of m.tiles) {
        s.board[i] = ch;
        rack.splice(rack.indexOf(ch), 1);
      }
      s.scores[me] += res.score;
      s.lastTiles = m.tiles.map((t) => t[0]);
      s.passes = 0;
      s.log.unshift({ side: me, text: res.words.map((w) => w.word.toUpperCase()).join(', ') + ' +' + res.score });
      draw(s, me);
      if (!rack.length && !s.bag.length) {
        // закончил первым — забирает очки за фишки соперника
        const left = rackValue(s.racks[1 - me]);
        s.scores[me] += left;
        s.scores[1 - me] -= left;
        s.over = true;
      }
    }
    if (s.passes >= 4) {
      for (const side of [0, 1]) s.scores[side] -= rackValue(s.racks[side]);
      s.over = true;
    }
    s.turn = 1 - me;
  }

  // ---------- компьютер ----------

  function findMoves(s, words) {
    const me = s.turn;
    const rack = s.racks[me];
    const have = {};
    rack.forEach((ch) => (have[ch] = (have[ch] || 0) + 1));
    const empty = s.board.every((x) => !x);
    const out = [];
    const seen = new Set();
    for (const dir of [1, N]) {
      for (let line = 0; line < N; line++) {
        const cellAt = (k) => (dir === 1 ? line * N + k : k * N + line);
        const L = [];
        let lineHas = false;
        for (let k = 0; k < N; k++) {
          L.push(s.board[cellAt(k)]);
          if (L[k]) lineHas = true;
        }
        // рядом ли с линией есть фишки (иначе ход по ней может быть только первым)
        let near = lineHas;
        if (!near) {
          for (let k = 0; k < N && !near; k++) {
            for (const d of [-1, 1]) {
              const l2 = line + d;
              if (l2 < 0 || l2 >= N) continue;
              if (s.board[dir === 1 ? l2 * N + k : k * N + l2]) near = true;
            }
          }
        }
        if (!near && !(empty && line === 7)) continue;
        for (const w of words) {
          const len = w.length;
          for (let st = 0; st + len <= N; st++) {
            if (st > 0 && L[st - 1]) continue;
            if (st + len < N && L[st + len]) continue;
            const need = {};
            let ok = true;
            let placed = 0;
            let old = 0;
            for (let k = 0; k < len; k++) {
              const ch = w[k];
              const cur = L[st + k];
              if (cur) {
                if (cur !== ch) {
                  ok = false;
                  break;
                }
                old++;
              } else {
                need[ch] = (need[ch] || 0) + 1;
                if (need[ch] > (have[ch] || 0)) {
                  ok = false;
                  break;
                }
                placed++;
              }
            }
            if (!ok || !placed) continue;
            const tiles = [];
            for (let k = 0; k < len; k++) if (!L[st + k]) tiles.push([cellAt(st + k), w[k]]);
            const key = tiles.map((t) => t.join(':')).join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            const res = evaluate(s, tiles);
            if (!res.error) out.push({ tiles, score: res.score });
          }
        }
      }
    }
    return out;
  }

  function ai(s, level) {
    const words = level === 'easy' ? AI_WORDS.filter((w) => w.length <= 6) : AI_WORDS;
    const found = findMoves(s, words);
    if (!found.length) {
      if (s.bag.length >= RACK) {
        // меняем «неудобные» дорогие буквы
        const swap = s.racks[s.turn].filter((ch) => VAL(ch) >= 5 || ch === 'ъ' || ch === 'ь' || ch === 'ы');
        return { swap: swap.length ? swap : s.racks[s.turn].slice(0, 3) };
      }
      return { pass: 1 };
    }
    found.sort((a, b) => b.score - a.score);
    let pick;
    if (level === 'hard') pick = found[0];
    else if (level === 'normal') pick = found[Math.floor(Math.random() * Math.min(4, found.length))];
    else pick = found[Math.floor(found.length * (0.4 + Math.random() * 0.6))] || found[found.length - 1];
    return { tiles: pick.tiles };
  }

  // ---------- интерфейс ----------

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const rackEl = $('rack');
  const previewEl = $('preview');
  const bagEl = $('bag-count');
  const logEl = $('log');
  const curtainEl = $('curtain');
  const playBtn = $('play-btn');
  const recallBtn = $('recall-btn');
  const swapBtn = $('swap-btn');
  const passBtn = $('pass-btn');

  const cells = [];
  for (let i = 0; i < N * N; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'er-cell';
    b.addEventListener('click', () => clickCell(i));
    boardEl.appendChild(b);
    cells.push(b);
  }

  // черновик хода: клетка → индекс фишки на подставке
  let pending = new Map();
  let selected = -1; // выбранная фишка подставки
  let swapMode = false;
  let swapSel = new Set();
  let cursor = -1; // клетка для набора с клавиатуры
  let cursorDir = 1;
  let revealed = -1; // в игре вдвоём: чья подставка открыта

  const myRackSide = (v) => (v.mode === 'pvp' ? duel.state.turn : v.me);

  function resetDraft() {
    pending = new Map();
    selected = -1;
    swapMode = false;
    swapSel = new Set();
  }

  function draftTiles() {
    const rack = duel.state.racks[myRackSide(duel.view())];
    return [...pending].map(([cell, k]) => [cell, rack[k]]);
  }

  function clickCell(i) {
    const s = duel.state;
    if (!duel.canMove() || swapMode) return;
    if (pending.has(i)) {
      pending.delete(i);
      SG.sound.play('slide');
      return render();
    }
    if (s.board[i]) return;
    if (selected >= 0) {
      pending.set(i, selected);
      selected = -1;
      SG.sound.play('place');
      cursor = -1;
      return render();
    }
    // пустая клетка без выбранной фишки — ставим курсор для набора с клавиатуры
    if (cursor === i) cursorDir = cursorDir === 1 ? N : 1;
    else {
      cursor = i;
      cursorDir = 1;
    }
    render();
  }

  function clickRack(k) {
    if (!duel.canMove()) return;
    if (swapMode) {
      if (swapSel.has(k)) swapSel.delete(k);
      else swapSel.add(k);
      return render();
    }
    if ([...pending.values()].includes(k)) {
      for (const [cell, kk] of pending) if (kk === k) pending.delete(cell);
      return render();
    }
    selected = selected === k ? -1 : k;
    SG.sound.play('click');
    render();
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !duel.canMove()) return;
    const s = duel.state;
    const key = e.key.toLowerCase().replace('ё', 'е');
    if (e.key === 'Enter' && pending.size) {
      e.preventDefault();
      return playBtn.click();
    }
    if (e.key === 'Escape') {
      resetDraft();
      cursor = -1;
      return render();
    }
    if (cursor < 0) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      // убираем последнюю выставленную фишку перед курсором
      let x = cursor - cursorDir;
      while (x >= 0 && s.board[x]) x -= cursorDir;
      if (x >= 0 && pending.has(x)) {
        pending.delete(x);
        cursor = x;
        render();
      }
      return;
    }
    if (!TILES[key]) return;
    const rack = s.racks[myRackSide(duel.view())];
    const used = new Set(pending.values());
    const k = rack.findIndex((ch, idx) => ch === key && !used.has(idx));
    if (k < 0 || s.board[cursor] || pending.has(cursor)) return;
    pending.set(cursor, k);
    SG.sound.play('key');
    // курсор идёт дальше, перепрыгивая уже выложенные буквы
    let nx = cursor + cursorDir;
    const [r0, c0] = rcOf(cursor);
    while (nx < N * N && (cursorDir === 1 ? Math.floor(nx / N) === r0 : nx % N === c0) && (s.board[nx] || pending.has(nx))) nx += cursorDir;
    cursor = nx < N * N && (cursorDir === 1 ? Math.floor(nx / N) === r0 : nx % N === c0) ? nx : -1;
    void c0;
    render();
  });

  playBtn.addEventListener('click', () => {
    if (swapMode) {
      const rack = duel.state.racks[myRackSide(duel.view())];
      const letters = [...swapSel].map((k) => rack[k]);
      if (!letters.length) return;
      resetDraft();
      duel.play({ swap: letters });
      return;
    }
    const tiles = draftTiles();
    const res = evaluate(duel.state, tiles);
    if (res.error) {
      SG.sound.play('error');
      previewEl.textContent = res.error;
      previewEl.className = 'er-preview bad';
      return;
    }
    resetDraft();
    cursor = -1;
    duel.play({ tiles });
  });
  recallBtn.addEventListener('click', () => {
    resetDraft();
    render();
  });
  swapBtn.addEventListener('click', () => {
    if (!duel.canMove()) return;
    if (duel.state.bag.length < RACK) {
      previewEl.textContent = 'Менять фишки можно, пока в мешке не меньше семи';
      previewEl.className = 'er-preview bad';
      return;
    }
    const on = !swapMode;
    resetDraft();
    swapMode = on;
    render();
  });
  passBtn.addEventListener('click', () => {
    resetDraft();
    duel.play({ pass: 1 });
  });
  curtainEl.querySelector('button').addEventListener('click', () => {
    revealed = duel.state.turn;
    render();
  });

  function render() {
    duel.render();
  }

  const duel = SG.duel({
    game: 'erudit',
    sides: ['Игрок 1', 'Игрок 2'],
    create,
    legal,
    apply,
    over(s) {
      if (!s.over) return null;
      const [a, b] = s.scores;
      return { winner: a === b ? null : a > b ? 0 : 1, text: 'Счёт ' + Math.max(a, b) + ':' + Math.min(a, b) + '.' };
    },
    hint(s, v) {
      if (swapMode) return 'выберите фишки для обмена и нажмите «Обменять»';
      return pending.size ? '' : 'выберите фишку, затем клетку (или клетку и набирайте буквы)';
    },
    ai,
    aiDelay: 500,
    sound: (s, m) => (m.tiles ? 'coin' : 'card'),
    onNew() {
      resetDraft();
      cursor = -1;
      revealed = -1;
    },
    render(s, v) {
      if (!v.canMove) {
        resetDraft();
        cursor = -1;
      }
      const side = myRackSide(v);
      const hidden = v.mode === 'pvp' && revealed !== s.turn && !v.over;
      const rack = s.racks[side];
      const draft = new Map([...pending].map(([cell, k]) => [cell, rack[k]]));
      for (let i = 0; i < N * N; i++) {
        const el = cells[i];
        const ch = s.board[i] || draft.get(i);
        let cls = 'er-cell';
        if (ch) {
          cls += ' tile' + (draft.has(i) ? ' draft' : '') + (s.lastTiles && s.lastTiles.includes(i) ? ' last' : '');
          el.innerHTML = `${ch.toUpperCase()}<small>${VAL(ch)}</small>`;
        } else {
          if (BONUS[i]) cls += ' b-' + BONUS[i];
          el.innerHTML = i === CENTER ? '★' : BONUS[i] ? `<span>${BONUS_TEXT[BONUS[i]]}</span>` : '';
        }
        if (i === cursor && !ch) cls += ' cursor' + (cursorDir === N ? ' down' : '');
        el.className = cls;
      }
      // подставка
      rackEl.innerHTML = '';
      const inDraft = new Set(pending.values());
      rack.forEach((ch, k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'er-tile' + (k === selected ? ' sel' : '') + (inDraft.has(k) ? ' used' : '') + (swapSel.has(k) ? ' swap' : '');
        b.innerHTML = hidden ? '' : `${ch.toUpperCase()}<small>${VAL(ch)}</small>`;
        b.disabled = hidden || !v.canMove;
        b.addEventListener('click', () => clickRack(k));
        rackEl.appendChild(b);
      });
      curtainEl.hidden = !hidden;
      if (hidden) curtainEl.querySelector('span').textContent = 'Ход: ' + (s.turn ? 'игрок 2' : 'игрок 1') + '. Соперник, отвернитесь!';
      // предпросмотр хода
      const tiles = [...draft];
      if (swapMode) {
        previewEl.textContent = 'Обмен: выбрано ' + swapSel.size;
        previewEl.className = 'er-preview';
      } else if (tiles.length && v.canMove) {
        const res = evaluate(s, tiles);
        previewEl.textContent = res.error ? res.error : res.words.map((w) => w.word.toUpperCase()).join(', ') + ' — ' + res.score + ' оч.';
        previewEl.className = 'er-preview ' + (res.error ? 'bad' : 'ok');
      } else {
        previewEl.textContent = '';
        previewEl.className = 'er-preview';
      }
      playBtn.textContent = swapMode ? 'Обменять' : 'Сделать ход';
      playBtn.disabled = !v.canMove || hidden || (swapMode ? !swapSel.size : !pending.size);
      recallBtn.disabled = !v.canMove || (!pending.size && !swapMode);
      swapBtn.disabled = !v.canMove || hidden;
      swapBtn.classList.toggle('active', swapMode);
      passBtn.disabled = !v.canMove || hidden;
      bagEl.textContent = s.bag.length;
      const name = (x) => (v.mode === 'pvp' ? (x ? 'Игрок 2' : 'Игрок 1') : x === v.me ? 'Вы' : v.mode === 'ai' ? 'Компьютер' : 'Соперник');
      $('pts-0').textContent = s.scores[0];
      $('pts-1').textContent = s.scores[1];
      $('pts-label-0').textContent = name(0);
      $('pts-label-1').textContent = name(1);
      logEl.innerHTML = s.log
        .slice(0, 12)
        .map((x) => `<li><b>${name(x.side)}:</b> ${x.text}</li>`)
        .join('');
    },
  });
  window.__erudit = { evaluate, findMoves };
})();
