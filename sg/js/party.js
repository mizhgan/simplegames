/* SimpleGames — каркас игр на компанию (от 3 до 10 человек) по сети, с ботами или на одном устройстве.

   Хозяин комнаты ведёт игру: хранит всё состояние, принимает ходы и рассылает каждому только то,
   что ему положено видеть (свои карты, свою роль). Гости и зрители присылают действия и получают «вид».

     SG.party({
       game: 'mafia', min: 4, max: 10,
       bots: true,                                // можно добавлять ботов (нужен ai)
       botNames: ['…'],                           // имена ботов
       options: { html, read(el), show(opts) },   // настройки хозяина в лобби (необязательно)
       create(players, opts) → state,             // players: [{ id, name, bot }]
       view(state, id) → объект для отрисовки,    // id = -1 — зритель
       act(state, id, action) → true, если ход принят,
       tick(state, now) → true, если что-то поменялось (таймеры; вызывается 4 раза в секунду),
       ai(state, id, level) → действие | null,
       leave(state, id),                          // игрок отключился посреди партии
       chat(state, id, text) → undefined | false (не показывать) | 'другой текст',
       relay(state, id, msg) → true (разослать остальным), // поток данных мимо «вида» (рисунок)
       onRelay(msg, ui),                          // у всех: пришли данные потока
       render(view, ui),                          // ui: { el, me, send(action), relay(msg), players, host, left(sec), mode }
       local: { label, start(ui) },               // свой режим «на одном устройстве» (необязательно)
     });
   Разметка: <div id="party"></div> внутри .game-stage.
*/
(() => {
  'use strict';

  const U = () => SG.net.util;
  const TICK = 250;
  const MAX_WATCHERS = 10;
  const BOT_NAMES = ['Бот Вася', 'Бот Маша', 'Бот Петя', 'Бот Оля', 'Бот Гоша', 'Бот Катя', 'Бот Федя', 'Бот Лиза', 'Бот Сеня'];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function party(cfg) {
    const root = document.getElementById('party');
    const key = (k) => cfg.game + '-' + k;
    let mode = 'idle'; // idle | lobby | play
    let role = null; // host | guest | watcher | solo | local
    let myId = 0;
    let players = []; // { id, name, bot, on, secret }
    let state = null;
    let view = null;
    let viewAt = 0;
    let opts = null;
    let level = SG.store.get(key('diff'), 'normal');
    let room = '';
    let token = '';
    let peer = null;
    let conns = new Map(); // у хозяина: id → { c, send, alive }
    let watchers = [];
    let hostConn = null; // у гостя
    let lastSeen = 0;
    let timer = 0;
    let pingTimer = 0;
    let nextId = 1;
    const botReady = {};
    const chatLog = [];

    // ---------- каркас страницы ----------

    root.className = 'pt';
    root.innerHTML =
      '<div class="pt-setup"></div>' +
      '<div class="pt-lobby" hidden></div>' +
      '<div class="pt-bar" hidden><span class="net-dot"></span><span class="pt-bar-text"></span>' +
      '<button class="btn btn-ghost" type="button" data-again hidden>Новая партия</button>' +
      '<button class="btn btn-ghost" type="button" data-watch hidden>👁 Зрителям</button>' +
      '<button class="btn btn-ghost" type="button" data-voice hidden title="Голосовой чат">🎤 Голос</button>' +
      '<button class="btn btn-ghost" type="button" data-mute hidden title="Выключить микрофон">🔊</button>' +
      '<button class="btn btn-ghost" type="button" data-leave>Выйти</button></div>' +
      '<div class="pt-watchbox" hidden></div>' +
      '<div class="pt-main" hidden><div class="pt-table" id="table"></div>' +
      '<div class="pt-chat"><div class="pt-chat-log" aria-live="polite"></div>' +
      '<form class="pt-chat-form"><input type="text" maxlength="140" placeholder="Сообщение…" aria-label="Сообщение"><button class="btn btn-primary" type="submit">➤</button></form></div></div>';
    const $ = (s) => root.querySelector(s);
    const setupEl = $('.pt-setup');
    const lobbyEl = $('.pt-lobby');
    const barEl = $('.pt-bar');
    const mainEl = $('.pt-main');
    const tableEl = $('.pt-table');
    const chatEl = $('.pt-chat');
    const chatLogEl = $('.pt-chat-log');
    const watchBox = $('.pt-watchbox');

    const myName = () => SG.store.get('party-name', '') || '';
    // первая буква имени для аватарки (эмодзи и символы вне алфавита — как есть)
    const avatarLetter = (name) => (Array.from(String(name).trim())[0] || '?').toUpperCase();
    const myPid = () => U().profile.id();
    const cleanPid = (x) => (/^[a-z0-9]{12}$/.test(String(x)) ? String(x) : '');
    const gameTitle = () => (document.querySelector('.game-head h1') || {}).textContent || document.title.split(' — ')[0];

    // партия с живыми людьми началась — запоминаем их как недавних соперников
    function noteRivals() {
      if (role !== 'host' && role !== 'guest') return;
      const mine = myPid();
      players.forEach((p) => {
        if (p.bot || !p.pid || p.pid === mine) return;
        U().profile.remember({ id: p.pid, name: p.name, elo: 1200 }, cfg.game, gameTitle());
      });
      U().startInbox(() => mode !== 'idle');
    }

    function showSetup() {
      mode = 'idle';
      role = null;
      state = view = null;
      setupEl.hidden = false;
      lobbyEl.hidden = true;
      barEl.hidden = true;
      mainEl.hidden = true;
      watchBox.hidden = true;
      const botsBtn = cfg.bots ? '<button class="btn btn-ghost" type="button" data-solo>🤖 Играть с ботами</button>' : '';
      const localBtn = cfg.local ? `<button class="btn btn-ghost" type="button" data-local>${esc(cfg.local.label)}</button>` : '';
      setupEl.innerHTML =
        `<div class="pt-hero"><span class="pt-hero-ico" aria-hidden="true">👥</span><div><h2>Играть компанией</h2><p>${cfg.min === cfg.max ? cfg.min : 'От ' + cfg.min + ' до ' + cfg.max} игроков · каждый на своём устройстве</p></div></div>` +
        '<label class="pt-name"><span>Ваше имя</span><input type="text" maxlength="16" autocomplete="nickname" placeholder="Например, Аня"></label>' +
        '<div class="pt-start"><button class="btn btn-primary" type="button" data-host>🌐 Создать комнату</button>' +
        botsBtn +
        localBtn +
        '</div>' +
        '<details class="net-join"><summary>У меня есть код от друга</summary><div class="net-link"><input type="text" maxlength="8" autocomplete="off" placeholder="Код комнаты" aria-label="Код комнаты" data-code><button class="btn btn-primary" type="button" data-join>Войти</button></div></details>' +
        '<ol class="pt-steps"><li>Создайте комнату</li><li>Отправьте друзьям ссылку</li><li>Начните, когда все соберутся</li></ol>' +
        (cfg.bots ? '<p class="pt-note">Не хватает людей — добавьте ботов.</p>' : '');
      const nameIn = setupEl.querySelector('.pt-name input');
      nameIn.value = myName();
      const takeName = () => {
        const n = nameIn.value.trim().slice(0, 16);
        if (!n) {
          nameIn.focus();
          nameIn.classList.add('pt-bad');
          setTimeout(() => nameIn.classList.remove('pt-bad'), 800);
          return null;
        }
        SG.store.set('party-name', n);
        return n;
      };
      setupEl.querySelector('[data-host]').addEventListener('click', () => takeName() && hostRoom());
      const sb = setupEl.querySelector('[data-solo]');
      if (sb) sb.addEventListener('click', () => takeName() && solo());
      const lb = setupEl.querySelector('[data-local]');
      if (lb) lb.addEventListener('click', () => startLocal());
      const codeIn = setupEl.querySelector('[data-code]');
      const go = () => {
        const v = codeIn.value.trim().toLowerCase();
        if (!U().parseToken(v)) return codeIn.focus();
        if (takeName()) join(v, false);
      };
      setupEl.querySelector('[data-join]').addEventListener('click', go);
      codeIn.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    }

    // ---------- лобби ----------

    function renderLobby() {
      if (mode !== 'lobby') return;
      setupEl.hidden = true;
      mainEl.hidden = true;
      barEl.hidden = true;
      lobbyEl.hidden = false;
      const isHost = role === 'host' || role === 'solo';
      const humans = players.filter((p) => !p.bot).length;
      const enough = players.length >= cfg.min;
      let html = '';
      if (role === 'host') {
        const url = U().baseUrl() + '#party=' + token;
        html += U().linkBlock(url, 'Отправьте друзьям ссылку:') + `<p class="net-code">Или продиктуйте код комнаты: <b>${token}</b></p><div class="pt-rivals"></div>`;
      }
      if (role === 'solo') html += '<p class="pt-note">Игра с ботами на этом устройстве.</p>';
      html += `<h3 class="pt-h">Игроки · ${players.length} из ${cfg.max}</h3><ul class="pt-players">`;
      html += players
        .map(
          (p, i) =>
            `<li class="${p.id === myId ? 'me' : ''}${p.on === false ? ' off' : ''}"><span class="pt-ava" style="--c:var(--p${(i % 8) + 1})" aria-hidden="true">${p.bot ? '🤖' : esc(avatarLetter(p.name))}${p.id === 0 ? '<i title="Хозяин комнаты">👑</i>' : ''}</span><span class="pt-pname">${esc(p.name)}${p.id === myId ? ' <small>(вы)</small>' : ''}</span>` +
            (isHost && p.id !== myId ? `<button type="button" class="pt-kick" data-kick="${p.id}" aria-label="Убрать">✕</button>` : '') +
            '</li>'
        )
        .join('');
      html += '</ul>';
      if (cfg.options) html += '<div class="pt-options"></div>';
      if (isHost) {
        html += '<div class="pt-start">';
        if (cfg.bots && players.length < cfg.max) {
          html +=
            '<button class="btn btn-ghost" type="button" data-bot>+ Бот</button>' +
            `<div class="seg pt-diff" role="group" aria-label="Сила ботов"><button type="button" data-value="easy">Слабые</button><button type="button" data-value="normal">Средние</button><button type="button" data-value="hard">Сильные</button></div>`;
        }
        html += `<button class="btn btn-primary" type="button" data-start ${enough ? '' : 'disabled'}>Начать игру</button></div>`;
        html += enough ? '' : `<p class="pt-note">Нужно ещё игроков: ${cfg.min - players.length}${cfg.bots ? ' (можно добавить ботов)' : ''}.</p>`;
      } else html += `<p class="net-status"><span class="net-spinner"></span>Ждём, пока хозяин начнёт игру${humans < 2 ? '' : ''}…</p>`;
      html += '<div class="pt-start"><button class="btn btn-ghost" type="button" data-voice hidden>🎤 Голос</button><button class="btn btn-ghost" type="button" data-leave>Выйти</button></div>';
      lobbyEl.innerHTML = html;
      renderVoice();
      if (role === 'host') {
        U().bindLink(lobbyEl, U().baseUrl() + '#party=' + token);
        U().rivalsBlock(lobbyEl.querySelector('.pt-rivals'), U().baseUrl() + '#party=' + token, gameTitle(), () => peer);
      }
      const optEl = lobbyEl.querySelector('.pt-options');
      if (optEl) {
        optEl.innerHTML = cfg.options.html;
        if (opts && cfg.options.show) cfg.options.show(optEl, opts);
        optEl.querySelectorAll('input, select, textarea, button').forEach((x) => (x.disabled = !isHost));
        optEl.classList.toggle('ro', !isHost);
        if (isHost) {
          const upd = () => {
            opts = cfg.options.read(optEl);
            SG.store.set(key('opts'), opts);
            broadcastLobby(true);
          };
          optEl.addEventListener('change', upd);
          optEl.addEventListener('input', upd);
          if (cfg.options.bind) cfg.options.bind(optEl, upd);
        }
      }
      lobbyEl.querySelectorAll('[data-kick]').forEach((b) => b.addEventListener('click', () => kick(+b.dataset.kick)));
      const bb = lobbyEl.querySelector('[data-bot]');
      if (bb) bb.addEventListener('click', addBot);
      const dz = lobbyEl.querySelector('.pt-diff');
      if (dz)
        SG.segmented(dz, level, (v) => {
          level = v;
          SG.store.set(key('diff'), v);
        });
      const st = lobbyEl.querySelector('[data-start]');
      if (st) st.addEventListener('click', startGame);
      lobbyEl.querySelector('[data-leave]').addEventListener('click', leave);
    }

    function addBot() {
      if (players.length >= cfg.max) return;
      const used = new Set(players.map((p) => p.name));
      const names = (cfg.botNames || BOT_NAMES).filter((n) => !used.has(n));
      players.push({ id: nextId++, name: names[0] || 'Бот ' + nextId, bot: true, on: true });
      broadcastLobby();
    }

    function kick(id) {
      const p = players.find((x) => x.id === id);
      if (!p) return;
      players = players.filter((x) => x.id !== id);
      const c = conns.get(id);
      if (c) {
        c.send({ t: '_kicked' });
        setTimeout(() => c.close(), 300);
        conns.delete(id);
      }
      broadcastLobby();
    }

    // ---------- хозяин ----------

    // настройки для гостей (без секретов вроде своего набора вопросов)
    const pubOpts = () => (cfg.options && cfg.options.public ? cfg.options.public(opts) : opts);
    const publicPlayers = () => players.map((p) => ({ id: p.id, name: p.name, bot: !!p.bot, on: p.on !== false, pid: p.pid || '' }));

    function broadcastLobby(keepForm) {
      if (mode === 'lobby' && !keepForm) renderLobby();
      conns.forEach((c) => c.send({ t: '_lobby', players: publicPlayers(), opts: pubOpts(), started: mode === 'play' }));
    }

    function hostRoom(srvIdx) {
      teardown();
      role = 'host';
      myId = 0;
      nextId = 1;
      players = [{ id: 0, name: myName(), on: true, pid: myPid() }];
      opts = cfg.options ? SG.store.get(key('opts'), null) : null;
      const servers = U().serverList();
      const idx = srvIdx || 0;
      const which = servers[idx];
      room = U().code();
      token = U().roomToken(room, which);
      const box = U().dialog('<h2 id="net-title">Комната для компании</h2><p class="net-status"><span class="net-spinner"></span>Создаём комнату…</p><div class="net-actions"><button class="btn btn-ghost" type="button" data-cancel>Отмена</button></div>');
      box.querySelector('[data-cancel]').addEventListener('click', () => {
        teardown();
        U().closeDialog();
        showSetup();
      });
      const fallback = (why) => {
        if (idx + 1 < servers.length) return hostRoom(idx + 1);
        teardown();
        const b = U().dialog(`<h2 id="net-title">Не получилось</h2><p>${why} Проверьте интернет и попробуйте ещё раз.</p><div class="net-actions"><button class="btn btn-primary" type="button" data-close>Понятно</button></div>`);
        b.querySelector('[data-close]').addEventListener('click', () => {
          U().closeDialog();
          showSetup();
        });
      };
      U()
        .loadPeer()
        .then((ok) => {
          if (!ok) return fallback('Не удалось загрузить модуль связи.');
          if (role !== 'host') return;
          let opened = false;
          const t = setTimeout(() => !opened && fallback('Сервер знакомств не отвечает.'), 9000);
          let p;
          try {
            p = new window.Peer(U().roomPeerId(room), U().peerOptions(which));
          } catch (e) {
            clearTimeout(t);
            return fallback('Сервер знакомств недоступен.');
          }
          peer = p;
          p.on('open', () => {
            opened = true;
            clearTimeout(t);
            U().closeDialog();
            mode = 'lobby';
            startTimers();
            renderLobby();
          });
          p.on('connection', (c) => acceptConn(c));
          p.on('call', onCall);
          p.on('error', (err) => {
            if (peer !== p) return;
            if (err.type === 'unavailable-id') return hostRoom(idx);
            if (!opened && ['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible'].includes(err.type)) {
              clearTimeout(t);
              fallback('Сервер знакомств недоступен.');
            }
          });
          p.on('disconnected', () => {
            setTimeout(() => {
              try {
                if (peer === p && !p.destroyed && p.disconnected) p.reconnect();
              } catch (e) {
                /* ignore */
              }
            }, 2000);
          });
        });
    }

    function wrap(c) {
      return {
        c,
        alive: Date.now(),
        send(obj) {
          try {
            c.send(JSON.stringify(obj));
          } catch (e) {
            /* канал закрыт */
          }
        },
        close() {
          try {
            c.close();
          } catch (e) {
            /* ignore */
          }
        },
      };
    }

    function acceptConn(c) {
      const w = wrap(c);
      let id = null;
      let hello = false;
      c.on('open', () => setTimeout(() => !hello && w.close(), 8000));
      c.on('data', (raw) => {
        let msg;
        try {
          msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (e) {
          return;
        }
        if (!msg || typeof msg !== 'object') return;
        w.alive = Date.now();
        if (msg.t === '_hello' && !hello) {
          hello = true;
          if (msg.key !== room) {
            w.send({ t: '_denied' });
            return setTimeout(() => w.close(), 500);
          }
          if (msg.game !== cfg.game) {
            w.send({ t: '_wronggame' });
            return setTimeout(() => w.close(), 500);
          }
          if (msg.watch) {
            if (watchers.length >= MAX_WATCHERS) {
              w.send({ t: '_full' });
              return setTimeout(() => w.close(), 500);
            }
            watchers.push(w);
            w.send({ t: '_welcome', id: -1, watcher: true, players: publicPlayers(), opts: pubOpts(), started: mode === 'play' });
            chatLog.slice(-30).forEach((m) => w.send(m));
            if (mode === 'play') sendView(w, -1);
            return;
          }
          // вернулся тот же игрок (например, телефон перезагрузил страницу) — возвращаем место
          const back = msg.secret && players.find((p) => p.secret === msg.secret && !p.bot);
          if (back) {
            id = back.id;
            const old = conns.get(id);
            if (old && old !== w) old.close();
            conns.set(id, w);
            back.on = true;
            back.name = String(msg.name || back.name).slice(0, 16);
            back.pid = cleanPid(msg.pid);
          } else {
            if (mode === 'play') {
              // игра уже идёт — только смотреть
              watchers.push(w);
              w.send({ t: '_welcome', id: -1, watcher: true, late: true, players: publicPlayers(), opts: pubOpts(), started: true });
              chatLog.slice(-30).forEach((m) => w.send(m));
              sendView(w, -1);
              return;
            }
            if (players.length >= cfg.max) {
              w.send({ t: '_full' });
              return setTimeout(() => w.close(), 500);
            }
            id = nextId++;
            let name = String(msg.name || 'Игрок').trim().slice(0, 16) || 'Игрок';
            if (players.some((p) => p.name === name)) name = name.slice(0, 13) + ' ' + id;
            players.push({ id, name, on: true, secret: String(msg.secret || ''), pid: cleanPid(msg.pid) });
            conns.set(id, w);
          }
          w.send({ t: '_welcome', id, players: publicPlayers(), opts: pubOpts(), started: mode === 'play' });
          chatLog.slice(-30).forEach((m) => w.send(m));
          SG.sound.play('hint');
          broadcastLobby();
          if (mode === 'play') {
            if (cfg.rejoin) cfg.rejoin(state, id);
            broadcastViews();
          }
          return;
        }
        if (!hello) return;
        if (msg.t === '_ping') return;
        if (id === null) return; // зрители только смотрят
        if (msg.t === '_bye') return dropPlayer(id, w);
        if (msg.t === '_voice') return voiceFrom(id, msg);
        if (msg.t === 'act' && mode === 'play') {
          if (cfg.act(state, id, msg.a, Date.now())) afterChange();
        } else if (msg.t === 'chat') chatFrom(id, msg.text);
        else if (msg.t === 'relay' && mode === 'play' && cfg.relay && cfg.relay(state, id, msg.m)) {
          fanout({ t: 'relay', m: msg.m }, id);
          if (cfg.onRelay) cfg.onRelay(msg.m, ui());
        }
      });
      const gone = () => {
        const wi = watchers.indexOf(w);
        if (wi >= 0) watchers.splice(wi, 1);
        if (id !== null && conns.get(id) === w) dropPlayer(id, w);
      };
      c.on('close', gone);
      c.on('error', gone);
    }

    function dropPlayer(id, w) {
      if (conns.get(id) !== w) return;
      conns.delete(id);
      w.close();
      voiceFrom(id, { on: false });
      const p = players.find((x) => x.id === id);
      if (!p) return;
      if (mode === 'lobby') {
        players = players.filter((x) => x.id !== id);
        broadcastLobby();
        return;
      }
      p.on = false;
      sysChat(p.name + ' отключился');
      if (cfg.leave) cfg.leave(state, id);
      broadcastLobby();
      afterChange();
    }

    // сообщение всем (кроме from)
    function fanout(obj, from) {
      conns.forEach((c, id) => id !== from && c.send(obj));
      watchers.forEach((w) => w.send(obj));
    }

    function sendView(w, id) {
      w.send({ t: '_view', v: cfg.view(state, id) });
    }

    function broadcastViews() {
      if (mode !== 'play') return;
      conns.forEach((c, id) => sendView(c, id));
      if (watchers.length) {
        const v = cfg.view(state, -1);
        watchers.forEach((w) => w.send({ t: '_view', v }));
      }
      if (role === 'host' || role === 'solo') gotView(cfg.view(state, myId));
    }

    function afterChange() {
      broadcastViews();
      updateBar();
    }

    function startGame() {
      if (players.length < cfg.min) return;
      if (cfg.options) opts = cfg.options.read(lobbyEl.querySelector('.pt-options'));
      const err = cfg.check && cfg.check(publicPlayers(), opts);
      if (err) {
        const n = lobbyEl.querySelector('.pt-note.err') || lobbyEl.appendChild(Object.assign(document.createElement('p'), { className: 'pt-note err' }));
        n.textContent = err;
        return;
      }
      state = cfg.create(publicPlayers(), opts || {});
      mode = 'play';
      Object.keys(botReady).forEach((k) => delete botReady[k]);
      conns.forEach((c) => c.send({ t: '_start', players: publicPlayers() }));
      noteRivals();
      watchers.forEach((w) => w.send({ t: '_start', players: publicPlayers() }));
      showTable();
      afterChange();
      SG.sound.play('match');
    }

    function againToLobby() {
      if (role !== 'host' && role !== 'solo') return;
      mode = 'lobby';
      state = null;
      // отключившихся убираем
      players = players.filter((p) => p.on !== false);
      conns.forEach((c) => c.send({ t: '_tolobby' }));
      watchers.forEach((w) => w.send({ t: '_tolobby' }));
      broadcastLobby();
      renderLobby();
    }

    function hostTick() {
      if (mode !== 'play' || !state) return;
      const now = Date.now();
      let changed = cfg.tick ? cfg.tick(state, now) : false;
      if (cfg.ai) {
        players.forEach((p) => {
          if (!p.bot && p.on !== false) return;
          if (!p.bot && !cfg.aiForGone) return;
          const a = cfg.ai(state, p.id, level);
          if (a === null || a === undefined) {
            botReady[p.id] = 0;
            return;
          }
          if (!botReady[p.id]) botReady[p.id] = now + (cfg.botDelay ? cfg.botDelay(state, p.id) : 700 + Math.random() * 900);
          else if (now >= botReady[p.id]) {
            botReady[p.id] = 0;
            if (cfg.act(state, p.id, a, now)) changed = true;
          }
        });
      }
      if (changed) afterChange();
      // проверка связи
      conns.forEach((c, id) => {
        c.send({ t: '_ping' });
        if (now - c.alive > 16000) dropPlayer(id, c);
      });
    }

    function startTimers() {
      clearInterval(timer);
      let n = 0;
      timer = setInterval(() => {
        if (role === 'host' || role === 'solo') hostTick();
        if (++n % 16 === 0) {
          if (role === 'guest' || role === 'watcher') {
            sendHost({ t: '_ping' });
            if (Date.now() - lastSeen > 16000) lostHost();
          } else if (role === 'host') watchers.forEach((w) => w.send({ t: '_ping' }));
        }
        if (view && mode === 'play') tickUi();
      }, TICK);
    }

    // ---------- с ботами на одном устройстве ----------

    function solo() {
      teardown();
      role = 'solo';
      myId = 0;
      nextId = 1;
      players = [{ id: 0, name: myName(), on: true, pid: myPid() }];
      opts = cfg.options ? SG.store.get(key('opts'), null) : null;
      const want = Math.max(cfg.min, Math.min(cfg.max, cfg.soloBots ? cfg.soloBots + 1 : 4));
      while (players.length < want) addBot();
      mode = 'lobby';
      startTimers();
      renderLobby();
    }

    function startLocal() {
      teardown();
      role = 'local';
      mode = 'play';
      setupEl.hidden = true;
      lobbyEl.hidden = true;
      mainEl.hidden = false;
      chatEl.hidden = true;
      barEl.hidden = false;
      barEl.querySelector('.pt-bar-text').textContent = cfg.local.label;
      barEl.querySelector('[data-watch]').hidden = true;
      barEl.querySelector('[data-again]').hidden = true;
      cfg.local.start(tableEl, () => showSetup());
    }

    // ---------- гость ----------

    function secretFor(t) {
      const all = SG.store.get('party-seats', {});
      if (!all[t]) {
        all[t] = Math.random().toString(36).slice(2) + Date.now().toString(36);
        // храним только последние комнаты
        const keys = Object.keys(all);
        if (keys.length > 12) delete all[keys[0]];
        SG.store.set('party-seats', all);
      }
      return all[t];
    }

    function join(tok, asWatcher) {
      const parsed = U().parseToken(tok);
      if (!parsed) return;
      teardown();
      role = asWatcher ? 'watcher' : 'guest';
      room = parsed.room;
      token = tok;
      const box = U().dialog(`<h2 id="net-title">${asWatcher ? 'Просмотр игры' : 'Вход в комнату'}</h2><p class="net-status"><span class="net-spinner"></span>Подключаемся к комнате <b>${esc(room)}</b>…</p><div class="net-actions"><button class="btn btn-ghost" type="button" data-cancel>Отмена</button></div>`);
      box.querySelector('[data-cancel]').addEventListener('click', () => {
        teardown();
        U().closeDialog();
        showSetup();
      });
      const status = box.querySelector('.net-status');
      U()
        .loadPeer()
        .then((ok) => {
          if (!ok) return failJoin('Не удалось загрузить модуль связи.');
          const p = new window.Peer(U().peerOptions(parsed.which));
          peer = p;
          p.on('call', onCall);
          let tries = 0;
          let retry = 0;
          let unavailable = 0;
          const giveUp = setTimeout(() => !hostConn && peer === p && failJoin('Хозяин комнаты не отвечает. Попросите его открыть страницу игры и прислать ссылку ещё раз.'), 45000);
          const attempt = () => {
            if (hostConn || peer !== p || p.destroyed) return;
            tries++;
            const c = p.connect(U().roomPeerId(room), { reliable: true });
            let mine = false;
            c.on('open', () => {
              if (hostConn) return c.close();
              mine = true;
              clearTimeout(retry);
              clearTimeout(giveUp);
              hostConn = wrap(c);
              lastSeen = Date.now();
              hostConn.send({ t: '_hello', game: cfg.game, key: room, name: myName() || 'Гость', secret: secretFor(tok), watch: asWatcher ? 1 : 0, pid: myPid() });
            });
            c.on('data', (raw) => mine && fromHost(raw));
            c.on('close', () => mine && lostHost());
            retry = setTimeout(attempt, 12000);
            if (tries > 1) status.innerHTML = '<span class="net-spinner"></span>Хозяин пока не ответил, ждём…';
          };
          p.on('open', attempt);
          p.on('error', (err) => {
            if (peer !== p || hostConn) return;
            if (err.type === 'peer-unavailable') {
              unavailable++;
              if (unavailable >= 2) {
                clearTimeout(giveUp);
                return failJoin('Комната закрыта: хозяин вышел из игры или закрыл страницу. Попросите новую ссылку.');
              }
              clearTimeout(retry);
              retry = setTimeout(attempt, 2500);
            } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
              clearTimeout(giveUp);
              failJoin('Сервер знакомств недоступен. Проверьте интернет.');
            }
          });
        });
    }

    function failJoin(text) {
      const tok = token;
      const w = role === 'watcher';
      teardown();
      const b = U().dialog(`<h2 id="net-title">Не получилось подключиться</h2><p>${text}</p><div class="net-actions"><button class="btn btn-primary" type="button" data-retry>Повторить</button><button class="btn btn-ghost" type="button" data-close>Закрыть</button></div>`);
      b.querySelector('[data-retry]').addEventListener('click', () => join(tok, w));
      b.querySelector('[data-close]').addEventListener('click', () => {
        U().closeDialog();
        history.replaceState(null, '', U().baseUrl());
        showSetup();
      });
    }

    function sendHost(obj) {
      if (hostConn) hostConn.send(obj);
    }

    function fromHost(raw) {
      let msg;
      try {
        msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (e) {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      lastSeen = Date.now();
      switch (msg.t) {
        case '_welcome':
          U().closeDialog();
          // ссылка остаётся в адресе: после перезагрузки страницы игрок вернётся на своё место
          history.replaceState(null, '', U().baseUrl() + (msg.watcher ? '#pwatch=' : '#party=') + token);
          myId = msg.id;
          if (msg.watcher) role = 'watcher';
          players = msg.players || [];
          opts = msg.opts || null;
          mode = msg.started ? 'play' : 'lobby';
          startTimers();
          if (msg.late) addChat({ sys: 1, text: 'Игра уже идёт — вы смотрите как зритель.' });
          if (mode === 'lobby') renderLobby();
          else showTable();
          SG.sound.play('match');
          break;
        case '_lobby':
          players = msg.players || [];
          opts = msg.opts || null;
          if (mode === 'lobby') renderLobby();
          else updateBar();
          break;
        case '_start':
          players = msg.players || players;
          noteRivals();
          mode = 'play';
          showTable();
          SG.sound.play('match');
          break;
        case '_tolobby':
          mode = role === 'watcher' ? 'lobby' : 'lobby';
          view = null;
          renderLobby();
          break;
        case '_view':
          if (mode !== 'play') {
            mode = 'play';
            showTable();
          }
          gotView(msg.v);
          break;
        case 'chat':
          addChat(msg);
          break;
        case '_voicelist':
          gotVoiceList(msg.list);
          break;
        case 'relay':
          if (cfg.onRelay) cfg.onRelay(msg.m, ui());
          break;
        case '_denied':
        case '_wronggame':
        case '_full':
        case '_kicked': {
          const text = { _denied: 'Код комнаты не подошёл.', _wronggame: 'По этой ссылке играют в другую игру.', _full: 'Комната заполнена.', _kicked: 'Хозяин убрал вас из комнаты.' }[msg.t];
          teardown();
          history.replaceState(null, '', U().baseUrl());
          const b = U().dialog(`<h2 id="net-title">Не получилось</h2><p>${text}</p><div class="net-actions"><button class="btn btn-primary" type="button" data-close>Понятно</button></div>`);
          b.querySelector('[data-close]').addEventListener('click', () => {
            U().closeDialog();
            showSetup();
          });
          break;
        }
        case '_bye':
          lostHost(true);
          break;
      }
    }

    function lostHost(voluntary) {
      if (role !== 'guest' && role !== 'watcher') return;
      teardown();
      history.replaceState(null, '', U().baseUrl());
      showSetup();
      const b = U().dialog(`<h2 id="net-title">Игра закончилась</h2><p>${voluntary ? 'Хозяин закрыл комнату.' : 'Связь с хозяином комнаты потеряна.'}</p><div class="net-actions"><button class="btn btn-primary" type="button" data-close>Понятно</button></div>`);
      b.querySelector('[data-close]').addEventListener('click', () => U().closeDialog());
      SG.sound.play('error');
    }

    // ---------- стол ----------

    function showTable() {
      setupEl.hidden = true;
      lobbyEl.hidden = true;
      mainEl.hidden = false;
      barEl.hidden = false;
      chatEl.hidden = role === 'solo' && !cfg.chatSolo;
      renderChat();
      updateBar();
    }

    function updateBar() {
      if (barEl.hidden) return;
      const on = players.filter((p) => !p.bot && p.on !== false).length;
      let text = role === 'solo' ? 'Игра с ботами' : role === 'watcher' ? '👁 Вы зритель · комната ' + room : 'Комната ' + (token || room) + ' · в сети ' + on + ' из ' + players.filter((p) => !p.bot).length;
      if (watchers.length && role === 'host') text += ' · зрителей ' + watchers.length;
      barEl.querySelector('.pt-bar-text').textContent = text;
      barEl.querySelector('[data-watch]').hidden = role !== 'host';
      renderVoice();
      barEl.querySelector('[data-again]').hidden = !((role === 'host' || role === 'solo') && view && view.over);
    }

    barEl.querySelector('[data-leave]').addEventListener('click', leave);
    barEl.querySelector('[data-again]').addEventListener('click', againToLobby);
    barEl.querySelector('[data-watch]').addEventListener('click', () => {
      watchBox.hidden = !watchBox.hidden;
      if (watchBox.hidden) return;
      const url = U().baseUrl() + '#pwatch=' + token;
      watchBox.innerHTML = '<p>Пусть смотрят, как вы играете: зрители видят стол, но не чужие карты и роли.</p>' + U().linkBlock(url, 'Ссылка для зрителей:');
      U().bindLink(watchBox, url);
    });

    function ui() {
      return {
        el: tableEl,
        me: myId,
        role,
        mode: role,
        players,
        host: role === 'host' || role === 'solo',
        watcher: role === 'watcher',
        level,
        send(a) {
          if (role === 'watcher') return;
          if (role === 'host' || role === 'solo') {
            if (cfg.act(state, myId, a, Date.now())) afterChange();
          } else sendHost({ t: 'act', a });
        },
        relay(m) {
          if (role === 'watcher') return;
          if (role === 'host' || role === 'solo') {
            if (cfg.relay && cfg.relay(state, myId, m)) fanout({ t: 'relay', m }, myId);
          } else sendHost({ t: 'relay', m });
        },
        // сколько секунд осталось на таймере вида (с поправкой на время с момента получения)
        left: (sec) => Math.max(0, Math.ceil(sec - (performance.now() - viewAt) / 1000)),
        name: (id) => {
          const p = players.find((x) => x.id === id);
          return p ? p.name : '?';
        },
        chat: (text) => sysChat(text),
        // сообщение в чат от своего имени (например, догадка в «Крокодиле»)
        say(text) {
          if (role === 'watcher' || !String(text).trim()) return;
          if (role === 'host' || role === 'solo') chatFrom(myId, text);
          else sendHost({ t: 'chat', text });
        },
      };
    }

    function gotView(v) {
      view = v;
      viewAt = performance.now();
      cfg.render(view, ui());
      updateBar();
    }

    // раз в четверть секунды — обновить таймеры
    function tickUi() {
      tableEl.querySelectorAll('[data-left]').forEach((el) => {
        const s = ui().left(+el.dataset.left);
        const t = s >= 60 ? SG.formatTime(s) : String(s);
        if (el.textContent !== t) el.textContent = t;
        el.classList.toggle('low', s <= 5);
      });
    }

    // ---------- чат ----------

    function chatFrom(id, text) {
      text = String(text || '').trim().slice(0, 140);
      if (!text) return;
      let shown = text;
      if (cfg.chat && mode === 'play') {
        const r = cfg.chat(state, id, text);
        if (r === false) {
          afterChange();
          return;
        }
        if (typeof r === 'string') shown = r;
        afterChange();
      }
      const p = players.find((x) => x.id === id);
      const m = { t: 'chat', from: id, name: p ? p.name : '?', text: shown };
      pushChat(m);
    }

    function sysChat(text) {
      if (role !== 'host' && role !== 'solo') return;
      pushChat({ t: 'chat', sys: 1, text });
    }

    function pushChat(m) {
      chatLog.push(m);
      if (chatLog.length > 80) chatLog.shift();
      conns.forEach((c) => c.send(m));
      watchers.forEach((w) => w.send(m));
      addChat(m);
    }

    function addChat(m) {
      if (role === 'guest' || role === 'watcher') {
        chatLog.push(m);
        if (chatLog.length > 80) chatLog.shift();
      }
      renderChat();
      if (!m.sys && m.from !== myId) SG.sound.play('tick');
    }

    function renderChat() {
      chatLogEl.innerHTML = chatLog
        .slice(-60)
        .map((m) => (m.sys ? `<p class="sys">${esc(m.text)}</p>` : `<p${m.from === myId ? ' class="mine"' : ''}><b>${esc(m.name)}:</b> ${esc(m.text)}</p>`))
        .join('');
      chatLogEl.scrollTop = chatLogEl.scrollHeight;
    }

    $('.pt-chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('.pt-chat-form input');
      const text = input.value.trim();
      if (!text || role === 'watcher') return;
      input.value = '';
      if (role === 'host' || role === 'solo') chatFrom(myId, text);
      else sendHost({ t: 'chat', text });
    });

    // ---------- голосовой чат ----------
    // Звук идёт напрямую между участниками (каждый с каждым), хозяин лишь рассылает список,
    // кто сейчас в голосовом чате. Микрофон включается только по кнопке.

    const voice = { on: false, muted: false, stream: null, calls: new Map(), members: [] };
    const hostVoice = new Map(); // у хозяина: id игрока → адрес его Peer
    const audios = new Map();

    const voiceAllowed = () => role === 'host' || role === 'guest';

    function renderVoice() {
      root.querySelectorAll('[data-voice]').forEach((b) => {
        b.hidden = !voiceAllowed() || !window.RTCPeerConnection;
        const n = voice.members.length;
        b.textContent = voice.on ? '🎤 В голосе' + (n > 1 ? ' · ' + n : '') : '🎤 Голос' + (n ? ' · ' + n : '');
        b.classList.toggle('on', voice.on);
        b.title = voice.on ? 'Выйти из голосового чата' : 'Голосовой чат: говорить с игроками';
      });
      const m = barEl.querySelector('[data-mute]');
      m.hidden = !voice.on;
      m.textContent = voice.muted ? '🔇' : '🎙';
      m.title = voice.muted ? 'Включить микрофон' : 'Выключить микрофон';
    }

    async function toggleVoice() {
      if (voice.on) return voiceStop();
      if (!voiceAllowed() || !peer) return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        addChat({ sys: 1, text: 'Этот браузер не умеет передавать звук.' });
        return;
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      } catch (e) {
        addChat({ sys: 1, text: 'Нет доступа к микрофону — разрешите его в настройках браузера.' });
        return;
      }
      if (!voiceAllowed() || !peer) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      voice.stream = stream;
      voice.on = true;
      voice.muted = false;
      announce(true);
      renderVoice();
      SG.sound.play('hint');
    }

    function announce(on) {
      const pid = on && peer ? peer.id : '';
      if (role === 'host') voiceFrom(myId, { on, peer: pid });
      else sendHost({ t: '_voice', on, peer: pid });
    }

    // у хозяина: кто-то вошёл в голосовой чат или вышел
    function voiceFrom(id, msg) {
      if (role !== 'host') return;
      const pid = String((msg && msg.peer) || '');
      if (msg && msg.on && pid && pid.length < 100) hostVoice.set(id, pid);
      else if (!hostVoice.has(id)) return;
      else hostVoice.delete(id);
      const list = [...hostVoice].map(([pl, peerId]) => ({ id: pl, peer: peerId }));
      conns.forEach((c) => c.send({ t: '_voicelist', list }));
      gotVoiceList(list);
    }

    function gotVoiceList(list) {
      voice.members = Array.isArray(list) ? list.filter((m) => m && typeof m.peer === 'string') : [];
      if (voice.on && peer) {
        const me = peer.id;
        const want = new Set(voice.members.map((m) => m.peer).filter((x) => x !== me));
        voice.calls.forEach((c, pid) => {
          if (want.has(pid)) return;
          closeCall(pid);
        });
        // звонит тот, у кого адрес «меньше», — чтобы двое не позвонили друг другу одновременно
        want.forEach((pid) => {
          if (voice.calls.has(pid) || me > pid) return;
          try {
            const c = peer.call(pid, voice.stream);
            if (c) wireCall(c, pid);
          } catch (e) {
            /* ignore */
          }
        });
      }
      renderVoice();
    }

    function onCall(call) {
      if (!voice.on || !voice.stream) {
        try {
          call.close();
        } catch (e) {
          /* ignore */
        }
        return;
      }
      if (voice.calls.has(call.peer)) closeCall(call.peer);
      call.answer(voice.stream);
      wireCall(call, call.peer);
    }

    function wireCall(call, pid) {
      voice.calls.set(pid, call);
      call.on('stream', (remote) => {
        let a = audios.get(pid);
        if (!a) {
          a = document.createElement('audio');
          a.autoplay = true;
          a.hidden = true;
          root.appendChild(a);
          audios.set(pid, a);
        }
        a.srcObject = remote;
        a.play().catch(() => {});
      });
      const gone = () => voice.calls.get(pid) === call && closeCall(pid);
      call.on('close', gone);
      call.on('error', gone);
    }

    function closeCall(pid) {
      const c = voice.calls.get(pid);
      voice.calls.delete(pid);
      if (c) {
        try {
          c.close();
        } catch (e) {
          /* ignore */
        }
      }
      const a = audios.get(pid);
      if (a) {
        a.srcObject = null;
        a.remove();
        audios.delete(pid);
      }
    }

    function voiceStop(silent) {
      const was = voice.on;
      voice.on = false;
      voice.muted = false;
      if (voice.stream) voice.stream.getTracks().forEach((t) => t.stop());
      voice.stream = null;
      [...voice.calls.keys()].forEach(closeCall);
      if (was && !silent) announce(false);
      if (silent) {
        voice.members = [];
        hostVoice.clear();
      }
      renderVoice();
    }

    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-voice]')) toggleVoice();
      else if (e.target.closest('[data-mute]') && voice.stream) {
        voice.muted = !voice.muted;
        voice.stream.getAudioTracks().forEach((t) => (t.enabled = !voice.muted));
        renderVoice();
      }
    });

    // ---------- выход ----------

    function teardown() {
      voiceStop(true);
      clearInterval(timer);
      timer = 0;
      conns.forEach((c) => c.close());
      conns = new Map();
      watchers.forEach((w) => w.close());
      watchers = [];
      if (hostConn) hostConn.close();
      hostConn = null;
      if (peer) {
        const p = peer;
        peer = null;
        try {
          p.destroy();
        } catch (e) {
          /* ignore */
        }
      }
      chatLog.length = 0;
      state = view = null;
      mode = 'idle';
      if (cfg.onReset) cfg.onReset();
    }

    function leave() {
      if (role === 'host') {
        conns.forEach((c) => c.send({ t: '_bye' }));
        watchers.forEach((w) => w.send({ t: '_bye' }));
      } else if (hostConn) sendHost({ t: '_bye' });
      setTimeout(() => {
        teardown();
        tableEl.innerHTML = '';
        history.replaceState(null, '', U().baseUrl());
        showSetup();
      }, 80);
    }

    window.addEventListener('pagehide', () => {
      if (role === 'guest') sendHost({ t: '_bye' });
      if (peer) {
        try {
          peer.destroy();
        } catch (e) {
          /* ignore */
        }
      }
    });

    showSetup();
    const m = location.hash.match(/^#(party|pwatch)=([a-z0-9-]+)$/i);
    if (m) {
      const watch = m[1] === 'pwatch';
      if (watch || myName()) setTimeout(() => join(m[2].toLowerCase(), watch), 50);
      else {
        // сначала имя, потом вход
        const nameIn = setupEl.querySelector('.pt-name input');
        setupEl.querySelector('.pt-start').innerHTML = '<button class="btn btn-primary" type="button" data-go>Войти в комнату ' + esc(m[2]) + '</button>';
        setupEl.querySelector('[data-go]').addEventListener('click', () => {
          const n = nameIn.value.trim();
          if (!n) return nameIn.focus();
          SG.store.set('party-name', n.slice(0, 16));
          join(m[2].toLowerCase(), false);
        });
        nameIn.focus();
      }
    }

    const api = {
      get state() {
        return state;
      },
      get view() {
        return view;
      },
      get role() {
        return role;
      },
      get players() {
        return players;
      },
      get mode() {
        return mode;
      },
      ui,
      addBot,
      start: startGame,
      again: againToLobby,
      cfg,
    };
    window.__party = api; // для автотестов
    return api;
  }

  // перемешивание и случайные числа для игр
  party.shuffle = (a) => SG.shuffle(a);
  party.esc = esc;
  SG.party = party;
})();
