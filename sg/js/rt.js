/* SimpleGames — каркас игр для двоих в реальном времени: против компьютера, вдвоём за одной клавиатурой и по сети.

   По сети физику считает хозяин: гость присылает свои нажатия, хозяин 30 раз в секунду рассылает
   состояние игры. Так у обоих всегда одна и та же картина, а задержка сказывается только на управлении гостя.

     SG.rt({
       game: 'tron', W: 640, H: 400,          // логический размер поля
       create(level) { return state },        // новая партия (обычный объект, его можно передать по сети)
       step(state, inputs, dt, fx) {},        // шаг 1/60 с; inputs[0|1] = { u, d, l, r, f, px, py }; fx('звук')
       ai(state, side, level) { return input },
       draw(g, state, view) {},               // view: { me, mode, flip, colors, W, H }
       over(state) { return null | { winner: 0 | 1 | null, text } },
       hud(state, view) { return 'строка состояния' },
       pointer: 'y' | 'xy',                   // указатель задаёт px/py (ракетка, бита)
       pad: true,                             // экранный джойстик на телефоне
       keys: { KeyQ: 'w' }, buttons: [{ k: 'w', label: '🔄' }], // доп. действия: клавиши и кнопки на экране
       flipGuest: true,                       // у гостя поле повёрнуто на 180° (своя сторона снизу)
       shared: true,                          // пошаговая игра: вдвоём за одним экраном управление общее
       snapshot(state), restore(snap, prev),  // сжатие состояния для сети (по умолчанию — целиком)
     });
   Разметка: canvas#board, #overlay (#overlay-title, #overlay-text, #start-btn), #mode, #difficulty, #status.
*/
(() => {
  'use strict';

  const DT = 1 / 60;
  const SEND_EVERY = 2; // кадров между снимками для гостя (30 в секунду)
  const COUNTDOWN = 2.4;

  // клавиши: в игре вдвоём левый игрок — WASD и пробел, правый — стрелки и Enter
  const KEYS = [
    { KeyW: 'u', KeyS: 'd', KeyA: 'l', KeyD: 'r', Space: 'f', KeyF: 'f' },
    { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r', Enter: 'f', NumpadEnter: 'f', ShiftRight: 'f', Slash: 'f', Numpad0: 'f' },
  ];
  const blank = () => ({ u: false, d: false, l: false, r: false, f: false, px: null, py: null });

  function rt(cfg) {
    const $ = (id) => document.getElementById(id);
    const canvas = $('board');
    const g = canvas.getContext('2d');
    const overlay = $('overlay');
    const statusEl = $('status');
    const diffEl = $('difficulty');
    const W = cfg.W;
    const H = cfg.H;
    const key = (k) => cfg.game + '-' + k;

    const modes = [...$('mode').querySelectorAll('button[data-value]')].map((b) => b.dataset.value);
    let mode = SG.store.get(key('mode'), modes[0]);
    if (!modes.includes(mode)) mode = modes[0];
    let level = SG.store.get(key('diff'), 'normal');
    let state = cfg.create(level);
    let phase = 'idle'; // idle | count | run | over
    let countdown = 0;
    let result = null;
    let colors = {};
    let acc = 0;
    let last = performance.now();
    let frame = 0;
    const pressed = new Set();
    const padState = [blank(), blank()];
    const pointers = new Map();
    const ptr = [null, null];
    let remoteInput = blank();
    let fxQueue = [];
    const wins = [0, 0];

    const me = () => (mode === 'net' ? (net.role === 'guest' ? 1 : 0) : mode === 'ai' ? 0 : null);
    const flip = () => mode === 'net' && net.role === 'guest' && !!cfg.flipGuest;
    const isGuest = () => mode === 'net' && net.role === 'guest';

    function readColors() {
      const c = SG.colors;
      colors = { bg: c.boardBg, line: c.boardLine, cell: c.boardCell, text: c.text, muted: c.muted, accent: c.accent, accent2: c.accent2, accent3: c.accent3, success: c.success, danger: c.danger, warning: c.warning, players: c.players };
    }

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(((w * H) / W) * dpr);
      draw();
    }

    // ---------- ввод ----------

    function localInput(side) {
      const inp = blank();
      const split = mode === 'pvp' && !cfg.shared;
      const maps = split ? [KEYS[side]] : KEYS;
      for (const m of maps) for (const code in m) if (pressed.has(code)) inp[m[code]] = true;
      const p = padState[split ? side : 0];
      for (const k in p) if (p[k] && k !== 'px' && k !== 'py') inp[k] = true;
      if (cfg.keys) for (const code in cfg.keys) if (pressed.has(code)) inp[cfg.keys[code]] = true;
      const pt = ptr[split ? side : 0];
      if (pt) {
        inp.px = pt.x;
        inp.py = pt.y;
      }
      // у гостя поле повёрнуто: «вверх» на его экране — вниз по полю
      if (flip()) [inp.u, inp.d, inp.l, inp.r] = [inp.d, inp.u, inp.r, inp.l];
      return inp;
    }

    document.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, textarea')) return;
      const known = KEYS[0][e.code] || KEYS[1][e.code] || (cfg.keys && cfg.keys[e.code]);
      if (known) {
        pressed.add(e.code);
        if (phase === 'run' || phase === 'count' || e.code.startsWith('Arrow')) e.preventDefault();
      }
      if ((e.code === 'Space' || e.code === 'Enter') && (phase === 'idle' || phase === 'over') && overlay && !overlay.hidden) {
        e.preventDefault();
        startClick();
      }
    });
    document.addEventListener('keyup', (e) => pressed.delete(e.code));
    window.addEventListener('blur', () => pressed.clear());

    // указатель: координаты поля (у гостя с повёрнутым полем — пересчитываем)
    function toField(e) {
      const r = canvas.getBoundingClientRect();
      let x = ((e.clientX - r.left) / r.width) * W;
      let y = ((e.clientY - r.top) / r.height) * H;
      if (flip()) {
        x = W - x;
        y = H - y;
      }
      return { x, y };
    }
    function sideOfPoint(pt) {
      if (mode !== 'pvp' || cfg.shared) return 0;
      // вдвоём: у каждого своя половина поля
      return cfg.pointer === 'y' ? (pt.x > W / 2 ? 1 : 0) : pt.y < H / 2 ? 1 : 0;
    }
    function applyPointers() {
      ptr[0] = ptr[1] = null;
      pointers.forEach((pt) => (ptr[sideOfPoint(pt)] = pt));
    }
    if (cfg.pointer) {
      canvas.style.touchAction = 'none';
      canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, toField(e));
        applyPointers();
      });
      canvas.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'mouse' && (mode !== 'pvp' || cfg.shared) && !pointers.has(e.pointerId)) {
          // мышью можно водить и без нажатия
          ptr[0] = toField(e);
          return;
        }
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, toField(e));
        applyPointers();
      });
      const up = (e) => {
        pointers.delete(e.pointerId);
        applyPointers();
      };
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && !pointers.size && (ptr[0] = null));
    }

    // экранный джойстик для телефонов
    const pads = [];
    if (cfg.pad) {
      const wrap = document.createElement('div');
      wrap.className = 'rt-pads';
      for (let side = 0; side < 2; side++) {
        const pad = document.createElement('div');
        pad.className = 'rt-pad side-' + side;
        pad.innerHTML =
          '<span class="rt-pad-name"></span><div class="rt-dpad">' +
          ['u:▲', 'l:◀', 'r:▶', 'd:▼'].map((x) => `<button type="button" data-k="${x[0]}" aria-label="${x.slice(2)}">${x.slice(2)}</button>`).join('') +
          '</div>' +
          (cfg.buttons || []).map((b) => `<button type="button" class="rt-fire rt-extra" data-k="${b.k}">${b.label}</button>`).join('') +
          (cfg.fireLabel ? `<button type="button" class="rt-fire" data-k="f">${cfg.fireLabel}</button>` : '');
        pad.querySelectorAll('[data-k]').forEach((b) => {
          const k = b.dataset.k;
          const on = (e) => {
            e.preventDefault();
            padState[side][k] = true;
            b.classList.add('on');
          };
          const off = () => {
            padState[side][k] = false;
            b.classList.remove('on');
          };
          b.addEventListener('pointerdown', on);
          b.addEventListener('pointerup', off);
          b.addEventListener('pointercancel', off);
          b.addEventListener('pointerleave', off);
          b.addEventListener('contextmenu', (e) => e.preventDefault());
        });
        wrap.appendChild(pad);
        pads.push(pad);
      }
      canvas.closest('.stage-wrap').after(wrap);
    }
    function renderPads() {
      pads.forEach((p, side) => {
        const split = mode === 'pvp' && !cfg.shared;
        p.hidden = mode === 'watch' || (side === 1 && !split);
        p.querySelector('.rt-pad-name').textContent = split ? (side ? 'Игрок 2' : 'Игрок 1') : '';
      });
    }

    // ---------- цикл ----------

    function fx(name) {
      SG.sound.play(name);
      if (mode === 'net' && net.role === 'host') fxQueue.push(name);
    }

    function tick() {
      const inputs = [null, null];
      for (const side of [0, 1]) {
        if (mode === 'ai' && side === 1) inputs[1] = cfg.ai(state, 1, level);
        else if (mode === 'net') inputs[side] = side === 0 ? localInput(0) : remoteInput;
        else inputs[side] = localInput(side);
      }
      cfg.step(state, inputs, DT, fx);
      const res = cfg.over(state);
      if (res) finish(res);
    }

    function loop(t) {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      if (!isGuest() && mode !== 'watch' && !document.hidden) {
        if (phase === 'count') {
          countdown -= dt;
          if (countdown <= 0) phase = 'run';
        } else if (phase === 'run') {
          acc += dt;
          let n = 0;
          while (acc >= DT && n < 5 && phase === 'run') {
            tick();
            acc -= DT;
            n++;
          }
          if (n === 5) acc = 0;
        }
        if (mode === 'net' && net.active && net.role === 'host' && ++frame % SEND_EVERY === 0) sendState();
      }
      if (isGuest() && net.active && phase !== 'over') {
        // гость шлёт свои нажатия, когда они меняются (и раз в 200 мс на всякий случай)
        const inp = localInput(1);
        const s = JSON.stringify(inp);
        if (s !== lastSent || t - lastSentAt > 200) {
          net.send({ t: 'in', i: inp });
          lastSent = s;
          lastSentAt = t;
        }
      }
      draw();
      requestAnimationFrame(loop);
    }
    let lastSent = '';
    let lastSentAt = 0;

    function draw() {
      const k = canvas.width / W;
      g.setTransform(k, 0, 0, k, 0, 0);
      if (flip()) g.setTransform(-k, 0, 0, -k, canvas.width, canvas.height);
      cfg.draw(g, state, view());
      g.setTransform(k, 0, 0, k, 0, 0);
      if (phase === 'count') {
        g.fillStyle = colors.text;
        g.globalAlpha = 0.85;
        g.font = '900 ' + Math.round(H / 4) + 'px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(Math.max(1, Math.ceil(countdown - 0.4))), W / 2, H / 2);
        g.globalAlpha = 1;
      }
      if (cfg.hud && statusEl) {
        const text = mode === 'net' && !net.active ? 'Нет соединения с соперником' : cfg.hud(state, view());
        if (statusEl.textContent !== text) statusEl.textContent = text;
      }
    }

    const view = () => ({ me: me(), mode, flip: flip(), colors, W, H, level, phase });

    // ---------- партия ----------

    function start() {
      state = cfg.create(level);
      result = null;
      phase = 'count';
      countdown = COUNTDOWN;
      acc = 0;
      if (overlay) overlay.hidden = true;
      if (mode === 'net' && net.role === 'host') {
        net.send({ t: 'new' });
        sendState(true);
      }
    }

    function startClick() {
      if (mode === 'watch') return;
      if (mode === 'net') {
        if (!net.active) return;
        if (net.role === 'guest') {
          net.send({ t: 'startreq' });
          if (overlay) $('overlay-text').textContent = 'Ждём хозяина игры…';
          return;
        }
      }
      start();
    }

    function finish(res) {
      phase = 'over';
      result = res;
      const w = res.winner;
      const mine = me();
      let title;
      if (w === null || w === undefined) title = 'Ничья 🤝';
      else if (mode === 'pvp' || mode === 'watch') title = 'Победил игрок ' + (w + 1) + '! 🎉';
      else if (w === mine) title = 'Вы победили! 🎉';
      else title = mode === 'ai' ? 'Компьютер победил 🤖' : 'Соперник победил';
      if (w !== null && w !== undefined) wins[w]++;
      if ((mode === 'ai' || mode === 'net') && w === mine) SG.store.set(key('wins'), SG.store.get(key('wins'), 0) + 1);
      if (mode === 'net') net.result(w === null || w === undefined ? 'draw' : w === mine ? 'win' : 'lose');
      SG.sound.play(w === null || w === undefined ? 'draw' : (mode === 'ai' || mode === 'net') && w !== mine ? 'lose' : 'win');
      if (overlay) {
        $('overlay-title').textContent = title;
        $('overlay-text').textContent = res.text || '';
        $('start-btn').textContent = 'Ещё раз';
        $('start-btn').hidden = mode === 'watch';
        overlay.hidden = false;
      }
      if (mode === 'net' && net.role === 'host') sendState(true);
    }

    function showIdle() {
      phase = 'idle';
      state = cfg.create(level);
      if (overlay) {
        $('overlay-title').textContent = cfg.title || document.querySelector('h1').textContent;
        $('overlay-text').textContent =
          mode === 'watch' ? 'Вы зритель. Ждём, пока игроки начнут партию.' : mode === 'net' && net.role === 'guest' ? 'Нажмите «Играть» — хозяин игры начнёт партию.' : cfg.intro || '';
        $('start-btn').textContent = 'Играть';
        $('start-btn').hidden = mode === 'watch';
        overlay.hidden = false;
      }
    }

    // ---------- сеть ----------

    // у гостя и зрителя: картина от хозяина
    function applySnapshot(msg) {
      state = cfg.restore ? cfg.restore(msg.s, state) : msg.s;
      (msg.fx || []).forEach((n) => SG.sound.play(n));
      if (msg.p === 'over' && phase !== 'over' && msg.r) finish(msg.r);
      else if (msg.p !== 'over') {
        if (phase === 'over' || phase === 'idle') {
          result = null;
          if (overlay) overlay.hidden = true;
        }
        phase = msg.p;
        countdown = msg.c;
      }
    }

    function sendState(force) {
      if (!net.active) return;
      if (!force && phase === 'idle') return;
      const snap = cfg.snapshot ? cfg.snapshot(state) : state;
      net.send({ t: 'st', s: snap, p: phase, c: +countdown.toFixed(2), fx: fxQueue, r: result });
      fxQueue = [];
    }

    const net = SG.net.setup({
      game: cfg.game,
      modeEl: $('mode'),
      onRematch: () => start(),
      // зрители получают те же снимки, что и гость
      watch: {
        forward: (m, from) => from === 'host' && m.t === 'st',
        snapshot: () => ({ t: 'st', s: cfg.snapshot ? cfg.snapshot(state, true) : state, p: phase, c: +countdown.toFixed(2), fx: [], r: result }),
        onSync: (d) => applySnapshot(d),
        onForward: (m) => applySnapshot(m),
      },
      onConnect(role) {
        if (role === 'watcher') {
          mode = 'watch';
          if (diffEl) diffEl.style.display = 'none';
          renderPads();
          showIdle();
          resize();
          return;
        }
        mode = 'net';
        if (diffEl) diffEl.style.display = 'none';
        net.info(role === 'host' ? 'вы — ' + cfg.sides[0].toLowerCase() : 'вы — ' + cfg.sides[1].toLowerCase());
        renderPads();
        remoteInput = blank();
        showIdle();
        resize();
      },
      onMessage(msg) {
        if (net.role === 'host') {
          if (msg.t === 'in' && msg.i) remoteInput = Object.assign(blank(), msg.i);
          else if (msg.t === 'startreq' && (phase === 'idle' || phase === 'over')) start();
          return;
        }
        if (msg.t === 'st') applySnapshot(msg);
      },
      onDisconnect(voluntary) {
        if (mode !== 'net' && mode !== 'watch') return;
        if (voluntary) {
          mode = modes.includes('pvp') ? 'pvp' : modes[0];
          modeSeg.set(mode);
          if (diffEl) diffEl.style.display = mode === 'ai' ? '' : 'none';
          renderPads();
          showIdle();
          resize();
        } else if (phase !== 'over') {
          phase = 'over';
          if (overlay) {
            $('overlay-title').textContent = 'Соединение потеряно';
            $('overlay-text').textContent = 'Соперник отключился.';
            $('start-btn').textContent = 'Ещё раз';
            overlay.hidden = false;
          }
        }
      },
    });

    const modeSeg = SG.segmented($('mode'), mode, (v) => {
      mode = v;
      SG.store.set(key('mode'), v);
      if (diffEl) diffEl.style.display = mode === 'ai' ? '' : 'none';
      renderPads();
      showIdle();
      resize();
    });
    if (diffEl) {
      SG.segmented(diffEl, level, (v) => {
        level = v;
        SG.store.set(key('diff'), v);
      });
      diffEl.style.display = mode === 'ai' ? '' : 'none';
    }
    if ($('start-btn')) $('start-btn').addEventListener('click', (e) => {
      e.currentTarget.blur();
      startClick();
    });
    document.addEventListener('sg:themechange', readColors);
    window.addEventListener('resize', resize);

    readColors();
    renderPads();
    showIdle();
    resize();
    requestAnimationFrame(loop);

    const api = {
      get state() {
        return state;
      },
      get phase() {
        return phase;
      },
      get mode() {
        return mode;
      },
      net,
      cfg,
      start: startClick,
      wins,
    };
    window.__rt = api; // для автотестов
    return api;
  }

  SG.rt = rt;
})();
