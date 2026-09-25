/* Морской бой */
(() => {
  'use strict';

  const N = 10;
  const FLEET = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
  const LETTERS = 'АБВГДЕЖЗИК';
  // Состояние клетки глазами стреляющего
  const UNKNOWN = 0;
  const MISS = 1;
  const HIT = 2;
  const SUNK = 3;

  const $ = (id) => document.getElementById(id);
  const myEl = $('my-board');
  const enemyEl = $('enemy-board');
  const statusEl = $('status');
  const setupEl = $('setup');

  let difficulty = SG.store.get('battleship-diff', 'normal');
  let phase; // setup | player | enemy | over
  let me, enemy; // { ships: [{cells, hits}], at: Map(cell → ship), shots: Array(N*N) }
  let shots = 0;
  let hits = 0;
  let aiTimer = 0;
  // сетевая игра: свой флот знаем только мы, результат выстрела сообщает соперник
  let mode = 'ai';
  let pending = false; // ждём ответа на свой выстрел
  let meReady = false;
  let oppReady = false;
  let iStart = true; // кто стреляет первым в сетевой партии
  // «Салво»: залп из стольких выстрелов, сколько у стреляющего осталось кораблей
  let rules = SG.store.get('battleship-rules', 'classic');
  let aim = [];

  const idx = (r, c) => r * N + c;
  const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;

  function around(i, diag = true) {
    const r = Math.floor(i / N);
    const c = i % N;
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if ((!dr && !dc) || (!diag && dr && dc)) continue;
        if (inside(r + dr, c + dc)) out.push(idx(r + dr, c + dc));
      }
    }
    return out;
  }

  // ---------- расстановка ----------

  function randomFleet() {
    for (;;) {
      const at = new Map();
      const ships = [];
      let ok = true;
      for (const len of FLEET) {
        let placed = false;
        for (let attempt = 0; attempt < 300 && !placed; attempt++) {
          const vert = Math.random() < 0.5;
          const r = Math.floor(Math.random() * (vert ? N - len + 1 : N));
          const c = Math.floor(Math.random() * (vert ? N : N - len + 1));
          const shipCells = Array.from({ length: len }, (_, k) => (vert ? idx(r + k, c) : idx(r, c + k)));
          // корабли не касаются друг друга даже углами
          if (shipCells.some((i) => at.has(i) || around(i).some((n) => at.has(n)))) continue;
          const ship = { cells: shipCells, hits: 0 };
          shipCells.forEach((i) => at.set(i, ship));
          ships.push(ship);
          placed = true;
        }
        if (!placed) {
          ok = false;
          break;
        }
      }
      if (ok) return { ships, at, shots: Array(N * N).fill(UNKNOWN) };
    }
  }

  // ---------- выстрел ----------

  // Возвращает 'miss' | 'hit' | 'sunk'
  function fire(target, i) {
    const ship = target.at.get(i);
    if (!ship) {
      target.shots[i] = MISS;
      return 'miss';
    }
    target.shots[i] = HIT;
    ship.hits++;
    if (ship.hits < ship.cells.length) return 'hit';
    ship.cells.forEach((c) => (target.shots[c] = SUNK));
    // клетки вокруг потопленного корабля заведомо пусты
    ship.cells.forEach((c) => around(c).forEach((n) => target.shots[n] === UNKNOWN && (target.shots[n] = MISS)));
    return 'sunk';
  }

  const fleetLeft = (side) => side.ships.filter((s) => s.hits < s.cells.length).length;
  const allSunk = (side) => fleetLeft(side) === 0;

  // ---------- ИИ ----------

  function aiKnowledge() {
    const k = me.shots.slice();
    // по диагонали от попадания кораблей быть не может
    k.forEach((v, i) => {
      if (v !== HIT) return;
      const r = Math.floor(i / N);
      const c = i % N;
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        if (inside(r + dr, c + dc) && k[idx(r + dr, c + dc)] === UNKNOWN) k[idx(r + dr, c + dc)] = MISS;
      }
    });
    return k;
  }

  function remainingLengths() {
    return me.ships.filter((s) => s.hits < s.cells.length).map((s) => s.cells.length);
  }

  function aiChoose(exclude = []) {
    const k = aiKnowledge();
    exclude.forEach((i) => (k[i] = MISS));
    const unknown = [];
    k.forEach((v, i) => v === UNKNOWN && unknown.push(i));
    const hitsOpen = [];
    k.forEach((v, i) => v === HIT && hitsOpen.push(i));
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    if (difficulty === 'easy') return pick(unknown);

    if (difficulty === 'normal') {
      if (hitsOpen.length) {
        // добиваем раненый корабль: продолжаем линию или пробуем соседей
        let cand = [];
        if (hitsOpen.length > 1) {
          const vert = hitsOpen[0] % N === hitsOpen[1] % N;
          const sorted = hitsOpen.slice().sort((a, b) => a - b);
          const step = vert ? N : 1;
          const ends = [sorted[0] - step, sorted[sorted.length - 1] + step];
          cand = ends.filter((i) => i >= 0 && i < N * N && k[i] === UNKNOWN && (vert || Math.floor(i / N) === Math.floor(sorted[0] / N)));
        }
        if (!cand.length) hitsOpen.forEach((h) => around(h, false).forEach((n) => k[n] === UNKNOWN && cand.push(n)));
        if (cand.length) return pick(cand);
      }
      // поиск по «шахматке»: самый маленький из оставшихся кораблей не проскочит
      const minLen = Math.min(...remainingLengths());
      const parity = unknown.filter((i) => (Math.floor(i / N) + (i % N)) % Math.max(2, minLen) === 0);
      return pick(parity.length ? parity : unknown);
    }

    // hard: карта вероятностей — сколько способов поставить оставшиеся корабли через клетку
    const heat = Array(N * N).fill(0);
    for (const len of remainingLengths()) {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          for (const vert of [false, true]) {
            if (vert ? r + len > N : c + len > N) continue;
            const cellsP = Array.from({ length: len }, (_, t) => (vert ? idx(r + t, c) : idx(r, c + t)));
            if (cellsP.some((i) => k[i] === MISS || k[i] === SUNK)) continue;
            const covered = cellsP.filter((i) => k[i] === HIT).length;
            if (hitsOpen.length && !covered) continue;
            const w = hitsOpen.length ? 1 + covered * 20 : 1;
            cellsP.forEach((i) => k[i] === UNKNOWN && (heat[i] += w));
          }
        }
      }
    }
    let best = -1;
    let bestCells = [];
    unknown.forEach((i) => {
      if (heat[i] > best) {
        best = heat[i];
        bestCells = [i];
      } else if (heat[i] === best) bestCells.push(i);
    });
    return pick(bestCells.length ? bestCells : unknown);
  }

  // ---------- отрисовка ----------

  function buildGrid(el, onClick) {
    el.innerHTML = '';
    const corner = document.createElement('span');
    corner.className = 'bs-label';
    el.appendChild(corner);
    for (let c = 0; c < N; c++) {
      const l = document.createElement('span');
      l.className = 'bs-label';
      l.textContent = LETTERS[c];
      el.appendChild(l);
    }
    const cellsOut = [];
    for (let r = 0; r < N; r++) {
      const l = document.createElement('span');
      l.className = 'bs-label';
      l.textContent = r + 1;
      el.appendChild(l);
      for (let c = 0; c < N; c++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'bs-cell';
        b.setAttribute('aria-label', LETTERS[c] + (r + 1));
        if (onClick) b.addEventListener('click', () => onClick(idx(r, c)));
        el.appendChild(b);
        cellsOut.push(b);
      }
    }
    return cellsOut;
  }

  const myCells = buildGrid(myEl, null);
  const enemyCells = buildGrid(enemyEl, playerShoot);

  function paint(cellsArr, side, showShips) {
    cellsArr.forEach((el, i) => {
      const s = side.shots[i];
      const ship = side.at.get(i);
      el.className = 'bs-cell';
      if (showShips && ship) el.classList.add('ship');
      if (s === MISS) el.classList.add('miss');
      if (s === HIT) el.classList.add('hit');
      if (s === SUNK) el.classList.add('sunk');
      if (side === enemy && aim.includes(i)) el.classList.add('aim');
      el.disabled = !(side === enemy && phase === 'player' && s === UNKNOWN && !pending);
    });
  }

  function render() {
    paint(myCells, me, true);
    paint(enemyCells, enemy, phase === 'over');
    $('my-left').textContent = fleetLeft(me);
    $('enemy-left').textContent = mode === 'net' ? FLEET.length - (enemy.sunk || 0) : fleetLeft(enemy);
    $('shots').textContent = shots;
    $('accuracy').textContent = shots ? Math.round((hits / shots) * 100) + '%' : '—';
    enemyEl.classList.toggle('active', phase === 'player');
    myEl.classList.toggle('active', phase === 'enemy');
    setupEl.hidden = phase !== 'setup';
    $('surrender-btn').hidden = phase !== 'player' && phase !== 'enemy';
    const salvoOn = rules === 'salvo' && phase === 'player' && !pending;
    $('salvo-btn').hidden = !salvoOn;
    if (salvoOn) {
      $('salvo-btn').textContent = 'Огонь! (' + aim.length + '/' + salvoSize() + ')';
      $('salvo-btn').disabled = !aim.length;
    }
  }

  // сколько выстрелов в нашем залпе: по числу своих уцелевших кораблей, но не больше свободных клеток
  function salvoSize() {
    return Math.min(fleetLeft(me), enemy.shots.filter((v) => v === UNKNOWN).length);
  }

  function flash(cellsArr, i, cls) {
    const el = cellsArr[i];
    el.classList.add(cls);
  }

  // ---------- ход ----------

  function playerShoot(i) {
    if (phase !== 'player' || enemy.shots[i] !== UNKNOWN || pending) return;
    if (rules === 'salvo') {
      const k = aim.indexOf(i);
      if (k >= 0) aim.splice(k, 1);
      else if (aim.length < salvoSize()) aim.push(i);
      else {
        aim.shift();
        aim.push(i);
      }
      SG.sound.play('click');
      render();
      return;
    }
    if (mode === 'net') {
      if (!net.active) return;
      pending = true;
      net.send({ t: 'shot', i });
      render();
      return;
    }
    shotResult(i, fire(enemy, i));
  }

  // результат своего выстрела: у компьютера считаем сами, по сети — присылает соперник
  function shotResult(i, res) {
    shots++;
    if (res !== 'miss') hits++;
    render();
    flash(enemyCells, i, 'boom');
    if (res === 'miss') {
      SG.sound.play('drop');
      phase = 'enemy';
      statusEl.textContent = 'Мимо. Стреляет противник…';
      render();
      if (mode === 'ai') aiTimer = setTimeout(aiShoot, 750);
    } else if (res === 'hit') {
      SG.sound.play('hit');
      statusEl.textContent = 'Попадание! Стреляйте ещё.';
    } else {
      SG.sound.play('explode');
      if (mode === 'net' ? enemy.sunk >= FLEET.length : allSunk(enemy)) return finish(true);
      statusEl.textContent = 'Корабль потоплен! Стреляйте ещё.';
    }
  }

  function aiShoot() {
    if (phase !== 'enemy' || mode !== 'ai') return;
    if (rules === 'salvo') {
      const n = Math.min(fleetLeft(enemy), me.shots.filter((v) => v === UNKNOWN).length);
      const list = [];
      for (let t = 0; t < n; t++) list.push(aiChoose(list));
      return incomingSalvo(list);
    }
    incoming(aiChoose());
  }

  // ---------- залпы («Салво») ----------

  function fireSalvo() {
    if (phase !== 'player' || pending || !aim.length) return;
    const list = aim.slice();
    aim = [];
    if (mode === 'net') {
      if (!net.active) return;
      pending = true;
      net.send({ t: 'salvo', cells: list });
      render();
      return;
    }
    salvoResult(list.map((i) => ({ i, res: fire(enemy, i) })));
  }

  function salvoResult(results) {
    shots += results.length;
    hits += results.filter((r) => r.res !== 'miss').length;
    const sunk = results.filter((r) => r.res === 'sunk').length;
    const hit = results.filter((r) => r.res === 'hit').length;
    render();
    results.forEach((r) => flash(enemyCells, r.i, 'boom'));
    SG.sound.play(sunk ? 'explode' : hit ? 'hit' : 'drop');
    if (mode === 'net' ? enemy.sunk >= FLEET.length : allSunk(enemy)) return finish(true);
    phase = 'enemy';
    statusEl.textContent = salvoText(results.length, hit, sunk, 'Ваш залп') + ' Залп противника…';
    render();
    if (mode === 'ai') aiTimer = setTimeout(aiShoot, 900);
  }

  function salvoText(n, hit, sunk, who) {
    const parts = [];
    if (hit) parts.push('попаданий: ' + hit);
    if (sunk) parts.push('потоплено: ' + sunk);
    return who + ' (' + n + '): ' + (parts.length ? parts.join(', ') : 'все мимо') + '.';
  }

  function incomingSalvo(list) {
    const results = list.map((i) => {
      const res = fire(me, i);
      return { i, res, cells: res === 'sunk' ? me.at.get(i).cells : null };
    });
    if (mode === 'net') net.send({ t: 'sresult', results });
    render();
    results.forEach((r) => flash(myCells, r.i, 'boom'));
    const sunk = results.filter((r) => r.res === 'sunk').length;
    const hit = results.filter((r) => r.res === 'hit').length;
    SG.sound.play(sunk ? 'explode' : hit ? 'hit' : 'drop');
    if (allSunk(me)) return finish(false);
    phase = 'player';
    aim = [];
    statusEl.textContent = salvoText(results.length, hit, sunk, 'Залп противника') + ' Ваш залп: отметьте ' + salvoSize() + ' кл.';
    render();
  }

  // выстрел по нашему флоту (компьютера или соперника по сети)
  function incoming(i) {
    const res = fire(me, i);
    if (mode === 'net') {
      const ship = me.at.get(i);
      net.send({ t: 'result', i, res, cells: res === 'sunk' ? ship.cells : null });
    }
    render();
    flash(myCells, i, 'boom');
    const where = LETTERS[i % N] + (Math.floor(i / N) + 1);
    if (res === 'miss') {
      SG.sound.play('drop');
      phase = 'player';
      statusEl.textContent = 'Противник промахнулся (' + where + '). Ваш выстрел!';
      render();
      return;
    }
    SG.sound.play(res === 'hit' ? 'hit' : 'explode');
    if (res === 'sunk' && allSunk(me)) return finish(false);
    statusEl.textContent = (res === 'hit' ? 'Противник попал в ' : 'Противник потопил корабль в ') + where + '…';
    if (mode === 'ai') aiTimer = setTimeout(aiShoot, 850);
  }

  function finish(won) {
    phase = 'over';
    pending = false;
    clearTimeout(aiTimer);
    // показываем сопернику свою расстановку
    if (mode === 'net') net.send({ t: 'fleet', ships: me.ships.map((sh) => sh.cells) });
    if (won) {
      SG.store.set('battleship-wins', SG.store.get('battleship-wins', 0) + 1);
      const best = SG.store.get('battleship-best', null);
      if (best === null || shots < best) SG.store.set('battleship-best', shots);
    }
    SG.sound.play(won ? 'win' : 'lose');
    if (mode === 'net') net.result(won ? 'win' : 'lose');
    statusEl.textContent = won
      ? 'Победа! Флот противника уничтожен за ' + shots + ' выстрелов 🎉'
      : 'Поражение: ваш флот потоплен. Корабли противника показаны на поле.';
    render();
    $('restart-row').hidden = false;
  }

  function newGame() {
    clearTimeout(aiTimer);
    me = randomFleet();
    enemy = mode === 'net' ? { ships: [], at: new Map(), shots: Array(N * N).fill(UNKNOWN), sunk: 0 } : randomFleet();
    shots = 0;
    hits = 0;
    pending = false;
    meReady = false;
    oppReady = false;
    aim = [];
    phase = 'setup';
    $('start-btn').disabled = false;
    $('shuffle-btn').disabled = false;
    statusEl.textContent = 'Расставьте флот: нажмите «Перемешать», пока расстановка не понравится.';
    $('restart-row').hidden = true;
    render();
  }

  $('shuffle-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    me = randomFleet();
    SG.sound.play('slide');
    render();
  });
  $('start-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    SG.sound.play('click');
    if (mode === 'net') {
      if (!net.active) return;
      meReady = true;
      $('start-btn').disabled = true;
      $('shuffle-btn').disabled = true;
      net.send({ t: 'ready' });
      return tryStart();
    }
    phase = 'player';
    statusEl.textContent = rules === 'salvo' ? 'Ваш залп: отметьте ' + salvoSize() + ' клеток и нажмите «Огонь!».' : 'Ваш выстрел — кликните по полю противника.';
    render();
  });
  $('salvo-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    fireSalvo();
  });
  $('surrender-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (mode === 'net') net.send({ t: 'surrender' });
    finish(false);
  });
  $('again-btn').addEventListener('click', () => {
    if (mode === 'net') {
      if (!net.active) return;
      net.send({ t: 'new' });
      iStart = !iStart;
    }
    newGame();
  });

  // ---------- игра по сети ----------

  function tryStart() {
    if (!meReady) {
      statusEl.textContent = 'Соперник уже готов. Расставьте флот и нажмите «В бой!».';
      return;
    }
    if (!oppReady) {
      statusEl.textContent = 'Ждём, пока соперник расставит флот…';
      return;
    }
    phase = iStart ? 'player' : 'enemy';
    statusEl.textContent = iStart ? 'Бой! Ваш ' + (rules === 'salvo' ? 'залп' : 'выстрел') + ' первый.' : 'Бой! Первым стреляет соперник…';
    render();
  }

  const net = SG.net.setup({
    game: 'battleship',
    // зрителям не показываем расстановку хозяина (попадания видны)
    mirrorMask: (el) => el.querySelectorAll('#my-board .ship').forEach((c) => c.classList.remove('ship')),
    onRematch: () => $('again-btn').click(),
    modeEl: $('mode'),
    onConnect(role) {
      mode = 'net';
      iStart = role === 'host';
      $('difficulty').style.display = 'none';
      net.info('флот соперника скрыт, пока идёт бой');
      // правила выбирает хозяин комнаты
      rulesEl.style.display = role === 'host' ? '' : 'none';
      if (role === 'host') net.send({ t: 'rules', v: rules });
      newGame();
    },
    onMessage(msg) {
      if (msg.t === 'new') {
        iStart = !iStart;
        newGame();
      } else if (msg.t === 'rules' && (msg.v === 'classic' || msg.v === 'salvo')) {
        rules = msg.v;
        rulesSeg.set(rules);
        render();
      } else if (msg.t === 'salvo' && rules === 'salvo' && phase === 'enemy' && Array.isArray(msg.cells)) {
        const list = [...new Set(msg.cells)].filter((i) => Number.isInteger(i) && me.shots[i] === UNKNOWN);
        if (list.length && list.length <= FLEET.length - enemy.sunk) incomingSalvo(list);
      } else if (msg.t === 'sresult' && pending && Array.isArray(msg.results)) {
        pending = false;
        const results = msg.results.filter((r) => r && Number.isInteger(r.i));
        results.forEach(({ i, res, cells }) => {
          if (res === 'miss') enemy.shots[i] = MISS;
          else if (res === 'hit') enemy.shots[i] = HIT;
          else if (res === 'sunk' && Array.isArray(cells)) {
            enemy.sunk++;
            cells.forEach((c) => (enemy.shots[c] = SUNK));
          }
        });
        results.forEach(({ res, cells }) => res === 'sunk' && Array.isArray(cells) && cells.forEach((c) => around(c).forEach((n) => enemy.shots[n] === UNKNOWN && (enemy.shots[n] = MISS))));
        salvoResult(results);
      } else if (msg.t === 'ready' && phase === 'setup') {
        oppReady = true;
        tryStart();
      } else if (msg.t === 'shot' && phase === 'enemy' && Number.isInteger(msg.i) && me.shots[msg.i] === UNKNOWN) {
        incoming(msg.i);
      } else if (msg.t === 'result' && pending && Number.isInteger(msg.i)) {
        pending = false;
        const i = msg.i;
        if (msg.res === 'miss') enemy.shots[i] = MISS;
        else if (msg.res === 'hit') enemy.shots[i] = HIT;
        else if (msg.res === 'sunk' && Array.isArray(msg.cells)) {
          enemy.sunk++;
          msg.cells.forEach((c) => (enemy.shots[c] = SUNK));
          msg.cells.forEach((c) => around(c).forEach((n) => enemy.shots[n] === UNKNOWN && (enemy.shots[n] = MISS)));
        }
        shotResult(i, msg.res);
      } else if (msg.t === 'surrender' && phase !== 'over' && phase !== 'setup') {
        finish(true);
        statusEl.textContent = 'Соперник сдался — победа! 🎉';
      } else if (msg.t === 'fleet' && Array.isArray(msg.ships)) {
        // открываем расстановку соперника после боя
        msg.ships.forEach((cells) => {
          const ship = { cells, hits: 0 };
          cells.forEach((c) => enemy.at.set(c, ship));
        });
        render();
      }
    },
    onDisconnect(voluntary) {
      if (mode !== 'net') return;
      if (voluntary) {
        mode = 'ai';
        modeSeg.set('ai');
        $('difficulty').style.display = '';
        rulesEl.style.display = '';
        newGame();
      } else {
        pending = false;
        if (phase !== 'over') phase = 'over';
        render();
        statusEl.textContent = 'Нет соединения с соперником';
      }
    },
  });

  const modeSeg = SG.segmented($('mode'), 'ai', () => {
    if (mode !== 'ai') {
      mode = 'ai';
      $('difficulty').style.display = '';
      rulesEl.style.display = '';
      newGame();
    }
  });

  const rulesEl = $('rules');
  const rulesSeg = SG.segmented(rulesEl, rules, (v) => {
    rules = v;
    SG.store.set('battleship-rules', v);
    if (mode === 'net' && net.active) net.send({ t: 'rules', v });
    if (phase === 'setup') {
      aim = [];
      render();
    }
  });

  SG.segmented($('difficulty'), difficulty, (v) => {
    difficulty = v;
    SG.store.set('battleship-diff', v);
  });

  newGame();
})();
