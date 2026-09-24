/* SimpleGames — игра по сети через WebRTC.
   Знакомство игроков идёт через публичный сервер PeerJS (только обмен приглашениями),
   дальше ходы передаются напрямую между браузерами. Если сервер недоступен,
   можно соединиться вручную, обменявшись кодами.

   Использование в игре:
     const net = SG.net.setup({
       game: 'tictactoe',
       modeEl: document.getElementById('mode'),  // сюда добавится кнопка «По сети»
       onConnect(role) {},    // 'host' | 'guest' — соединились, можно начинать
       onMessage(msg) {},     // сообщение от соперника (объект)
       onDisconnect() {},     // соединение потеряно или соперник вышел
     });
     net.send({ t: 'move', i: 4 });
     net.active   — идёт сетевая игра
     net.role     — 'host' | 'guest'
     net.info(text) — подпись в полоске «Игра по сети» (например, «вы играете за X»)
     net.leave()  — выйти из сетевой игры
*/
(() => {
  'use strict';

  const PREFIX = 'simplegames-';
  const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
  const ICE = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
    ],
  };
  const SERVER_TIMEOUT = 9000;
  const SCRIPT_URL = document.currentScript ? document.currentScript.src : location.href;

  // библиотеку PeerJS грузим, только когда игрок выбрал игру по сети
  let peerLoading = null;
  function loadPeer() {
    if (window.Peer) return Promise.resolve(true);
    if (!peerLoading) {
      peerLoading = new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = new URL('../vendor/peerjs.min.js', SCRIPT_URL).href;
        s.onload = () => resolve(!!window.Peer);
        s.onerror = () => {
          peerLoading = null;
          resolve(false);
        };
        document.head.appendChild(s);
      });
    }
    return peerLoading;
  }

  const code = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  const baseUrl = () => location.href.split('#')[0];

  // свой сервер PeerJS можно указать в localStorage: sg:peer-server = {"host":"…","port":443,"path":"/","secure":true}
  function peerOptions() {
    const custom = SG.store.get('peer-server', null);
    const opts = { config: ICE, debug: 0 };
    if (custom && custom.host) Object.assign(opts, custom);
    return opts;
  }

  // ---------- сжатие SDP для ручного режима ----------

  async function pack(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let data = bytes;
    if (window.CompressionStream) {
      const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      data = new Uint8Array(await new Response(s).arrayBuffer());
    }
    let bin = '';
    data.forEach((b) => (bin += String.fromCharCode(b)));
    return (window.CompressionStream ? 'z' : 'p') + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function unpack(text) {
    text = text.trim();
    const kind = text[0];
    const b64 = text.slice(1).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    let bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    if (kind === 'z') {
      const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      bytes = new Uint8Array(await new Response(s).arrayBuffer());
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function waitIce(pc) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const done = () => {
        if (pc.iceGatheringState === 'complete') resolve();
      };
      pc.addEventListener('icegatheringstatechange', done);
      setTimeout(resolve, 4000);
    });
  }

  // ---------- интерфейс ----------

  let modal = null;
  function dialog(html) {
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'net-modal';
      modal.innerHTML = '<div class="net-box" role="dialog" aria-modal="true" aria-labelledby="net-title"></div>';
      document.body.appendChild(modal);
    }
    modal.firstChild.innerHTML = html;
    modal.hidden = false;
    return modal.firstChild;
  }
  const closeDialog = () => modal && (modal.hidden = true);

  async function copy(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        /* ignore */
      }
      ta.remove();
    }
    if (btn) {
      const old = btn.textContent;
      btn.textContent = 'Скопировано ✓';
      setTimeout(() => (btn.textContent = old), 1500);
    }
  }

  function linkBlock(url, label) {
    const share = navigator.share ? '<button class="btn btn-ghost" type="button" data-share>Поделиться</button>' : '';
    return (
      `<label class="net-label">${label}</label>` +
      `<div class="net-link"><input type="text" readonly value="${url.replace(/"/g, '&quot;')}"><button class="btn btn-primary" type="button" data-copy>Скопировать</button>${share}</div>`
    );
  }

  function bindLink(box, url) {
    const input = box.querySelector('.net-link input');
    input.addEventListener('focus', () => input.select());
    box.querySelector('[data-copy]').addEventListener('click', (e) => copy(url, e.currentTarget));
    const sh = box.querySelector('[data-share]');
    if (sh) sh.addEventListener('click', () => navigator.share({ title: document.title, text: 'Сыграем по сети?', url }).catch(() => {}));
  }

  // ---------- основной объект ----------

  function setup(opts) {
    const api = {
      active: false,
      role: null,
      send,
      leave,
      info,
    };
    let conn = null; // { send(obj), close() }
    let peer = null;
    let pc = null;
    let pingTimer = 0;
    let lastSeen = 0;
    let bar = null;
    let infoText = '';
    let helloDone = false;

    // кнопка «По сети» в переключателе режимов
    let netBtn = null;
    if (opts.modeEl) {
      netBtn = document.createElement('button');
      netBtn.type = 'button';
      netBtn.className = 'net-mode-btn';
      netBtn.textContent = '🌐 По сети';
      netBtn.addEventListener('click', () => {
        netBtn.blur();
        if (!api.active) host();
      });
      opts.modeEl.appendChild(netBtn);
      // выбор другого режима — выход из сетевой игры
      opts.modeEl.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-value]');
        if (b && api.active) leave();
        if (b) netBtn.classList.remove('active');
      }, true);
    }

    function markMode(on) {
      if (!opts.modeEl) return;
      if (on) opts.modeEl.querySelectorAll('button[data-value]').forEach((b) => b.classList.remove('active'));
      if (netBtn) netBtn.classList.toggle('active', on);
    }

    function renderBar(state) {
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'net-bar';
        const stage = document.querySelector('.game-stage');
        if (stage) stage.insertBefore(bar, stage.firstChild);
      }
      bar.hidden = false;
      bar.dataset.state = state;
      if (state === 'on') {
        bar.innerHTML = '<span class="net-dot"></span><span class="net-text"></span><button class="btn btn-ghost" type="button">Выйти</button>';
        bar.querySelector('.net-text').textContent = 'Игра по сети' + (infoText ? ' · ' + infoText : '');
        bar.querySelector('button').addEventListener('click', () => leave());
      } else {
        bar.innerHTML = '<span class="net-dot"></span><span class="net-text">Соединение с соперником потеряно</span><button class="btn btn-ghost" type="button">Закрыть</button>';
        bar.querySelector('button').addEventListener('click', () => (bar.hidden = true));
      }
    }

    function info(text) {
      infoText = text;
      if (api.active) renderBar('on');
    }

    // ---------- транспорт ----------

    function handle(raw) {
      let msg = raw;
      if (typeof raw === 'string') {
        try {
          msg = JSON.parse(raw);
        } catch (e) {
          return;
        }
      }
      if (!msg || typeof msg !== 'object') return;
      lastSeen = Date.now();
      if (msg.t === '_ping') return;
      if (msg.t === '_bye') return lost(true);
      if (msg.t === '_hello') {
        if (msg.game !== opts.game) {
          dialog('<h2 id="net-title">Другая игра</h2><p>Соперник открыл другую игру. Попросите его перейти по вашей ссылке ещё раз.</p><div class="net-actions"><button class="btn btn-primary" type="button" data-close>Понятно</button></div>')
            .querySelector('[data-close]').addEventListener('click', closeDialog);
          return teardown();
        }
        if (!helloDone) {
          helloDone = true;
          rawSend({ t: '_hello', game: opts.game });
          connected();
        }
        return;
      }
      if (api.active && opts.onMessage) opts.onMessage(msg);
    }

    function rawSend(obj) {
      if (conn) {
        try {
          conn.send(JSON.stringify(obj));
        } catch (e) {
          /* канал закрыт */
        }
      }
    }

    function send(obj) {
      if (api.active) rawSend(obj);
    }

    function attach(c) {
      conn = c;
      lastSeen = Date.now();
      // гость первым здоровается, хозяин отвечает
      if (api.role === 'guest') rawSend({ t: '_hello', game: opts.game });
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        rawSend({ t: '_ping' });
        if (helloDone && Date.now() - lastSeen > 15000) lost(false);
      }, 4000);
    }

    function connected() {
      api.active = true;
      closeDialog();
      markMode(true);
      renderBar('on');
      SG.sound.play('match');
      history.replaceState(null, '', baseUrl());
      if (opts.onConnect) opts.onConnect(api.role);
    }

    function lost(byPeer) {
      const was = api.active;
      teardown();
      if (was) {
        renderBar('off');
        if (bar && byPeer) bar.querySelector('.net-text').textContent = 'Соперник вышел из игры';
        SG.sound.play('error');
        if (opts.onDisconnect) opts.onDisconnect();
      }
    }

    function teardown() {
      clearInterval(pingTimer);
      api.active = false;
      helloDone = false;
      const c = conn;
      conn = null;
      if (c) {
        try {
          c.close();
        } catch (e) {
          /* ignore */
        }
      }
      if (peer) {
        try {
          peer.destroy();
        } catch (e) {
          /* ignore */
        }
        peer = null;
      }
      if (pc) {
        try {
          pc.close();
        } catch (e) {
          /* ignore */
        }
        pc = null;
      }
      markMode(false);
    }

    function leave() {
      if (api.active) rawSend({ t: '_bye' });
      const was = api.active;
      setTimeout(() => {
        teardown();
        if (bar) bar.hidden = true;
        if (was && opts.onDisconnect) opts.onDisconnect(true);
      }, 60);
    }

    const wrapPeerConn = (c) => ({ send: (s) => c.send(s), close: () => c.close() });

    // ---------- хозяин: комната через PeerJS ----------

    async function host() {
      teardown();
      api.role = 'host';
      const room = code();
      const box = dialog(
        '<h2 id="net-title">Игра по сети</h2><p class="net-status">Создаём комнату…</p>' +
          '<div class="net-actions"><button class="btn btn-ghost" type="button" data-cancel>Отмена</button></div>'
      );
      box.querySelector('[data-cancel]').addEventListener('click', cancel);
      if (!(await loadPeer())) return manualHost('Не удалось загрузить модуль связи.');
      if (api.role !== 'host' || (modal && modal.hidden)) return;
      let opened = false;
      const timer = setTimeout(() => !opened && manualHost('Сервер знакомств не отвечает.'), SERVER_TIMEOUT);
      try {
        peer = new window.Peer(PREFIX + room, peerOptions());
      } catch (e) {
        clearTimeout(timer);
        return manualHost('Сервер знакомств недоступен.');
      }
      peer.on('open', () => {
        opened = true;
        clearTimeout(timer);
        const url = baseUrl() + '#join=' + room;
        const b = dialog(
          '<h2 id="net-title">Игра по сети</h2>' +
            linkBlock(url, 'Отправьте другу эту ссылку:') +
            `<p class="net-code">Или продиктуйте код комнаты: <b>${room}</b></p>` +
            '<p class="net-status"><span class="net-spinner"></span>Ждём соперника…</p>' +
            '<details class="net-join"><summary>У меня есть код от друга</summary><div class="net-link"><input type="text" maxlength="6" autocomplete="off" placeholder="Код комнаты" aria-label="Код комнаты"><button class="btn btn-primary" type="button" data-join>Войти</button></div></details>' +
            '<div class="net-actions"><button class="btn btn-ghost" type="button" data-cancel>Отмена</button></div>'
        );
        bindLink(b, url);
        b.querySelector('[data-cancel]').addEventListener('click', cancel);
        const joinInput = b.querySelector('.net-join input');
        const go = () => {
          const v = joinInput.value.trim().toLowerCase();
          if (/^[a-z0-9]{6}$/.test(v) && v !== room) join(v);
          else joinInput.focus();
        };
        b.querySelector('[data-join]').addEventListener('click', go);
        joinInput.addEventListener('keydown', (e) => e.key === 'Enter' && go());
      });
      peer.on('connection', (c) => {
        if (conn) {
          c.on('open', () => c.close());
          return;
        }
        c.on('open', () => attach(wrapPeerConn(c)));
        c.on('data', handle);
        c.on('close', () => lost(false));
        c.on('error', () => lost(false));
      });
      peer.on('error', (err) => {
        if (err.type === 'unavailable-id') return host();
        if (!opened || ['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible'].includes(err.type)) {
          clearTimeout(timer);
          if (!api.active && !opened) manualHost('Сервер знакомств недоступен.');
        }
      });
      peer.on('disconnected', () => {
        // связь с сервером знакомств не нужна после соединения
        if (!api.active && peer && !peer.destroyed) peer.reconnect();
      });
    }

    function cancel() {
      teardown();
      closeDialog();
      history.replaceState(null, '', baseUrl());
    }

    // ---------- гость: вход по коду комнаты ----------

    async function join(room) {
      teardown();
      api.role = 'guest';
      const box = dialog(
        '<h2 id="net-title">Игра по сети</h2><p class="net-status"><span class="net-spinner"></span>Подключаемся к комнате <b>' +
          room +
          '</b>…</p><div class="net-actions"><button class="btn btn-ghost" type="button" data-cancel>Отмена</button></div>'
      );
      box.querySelector('[data-cancel]').addEventListener('click', cancel);
      if (!(await loadPeer())) return fail('Не удалось загрузить модуль связи.');
      if (modal && modal.hidden) return;
      const timer = setTimeout(() => !api.active && fail('Не удалось подключиться. Проверьте ссылку или попробуйте ручной режим.'), SERVER_TIMEOUT + 6000);
      try {
        peer = new window.Peer(peerOptions());
      } catch (e) {
        return fail('Сервер знакомств недоступен.');
      }
      peer.on('open', () => {
        const c = peer.connect(PREFIX + room, { reliable: true });
        c.on('open', () => {
          clearTimeout(timer);
          attach(wrapPeerConn(c));
        });
        c.on('data', handle);
        c.on('close', () => lost(false));
      });
      peer.on('error', (err) => {
        clearTimeout(timer);
        if (err.type === 'peer-unavailable') fail('Комната <b>' + room + '</b> не найдена. Возможно, друг закрыл страницу — попросите новую ссылку.');
        else if (!api.active) fail('Сервер знакомств недоступен. Попросите друга создать игру ещё раз — откроется ручной режим.');
      });
    }

    function fail(text) {
      teardown();
      const b = dialog(
        '<h2 id="net-title">Не получилось подключиться</h2><p>' +
          text +
          '</p><div class="net-actions"><button class="btn btn-primary" type="button" data-close>Закрыть</button></div>'
      );
      b.querySelector('[data-close]').addEventListener('click', cancel);
    }

    // ---------- ручной режим: обмен кодами ----------

    function setupChannel(ch) {
      ch.onopen = () => attach({ send: (s) => ch.send(s), close: () => ch.close() });
      ch.onmessage = (e) => handle(e.data);
      ch.onclose = () => lost(false);
    }

    async function manualHost(reason) {
      if (peer) {
        try {
          peer.destroy();
        } catch (e) {
          /* ignore */
        }
        peer = null;
      }
      api.role = 'host';
      dialog('<h2 id="net-title">Игра по сети</h2><p class="net-status"><span class="net-spinner"></span>Готовим приглашение…</p>');
      try {
        pc = new RTCPeerConnection(ICE);
        pc.onconnectionstatechange = () => pc && pc.connectionState === 'failed' && lost(false);
        setupChannel(pc.createDataChannel('sg'));
        await pc.setLocalDescription(await pc.createOffer());
        await waitIce(pc);
        const packed = await pack({ g: opts.game, s: pc.localDescription.sdp });
        const url = baseUrl() + '#offer=' + packed;
        const b = dialog(
          '<h2 id="net-title">Ручное подключение</h2>' +
            `<p class="net-note">${reason} Соединимся напрямую — нужно обменяться кодами.</p>` +
            linkBlock(url, '1. Отправьте другу эту ссылку:') +
            '<label class="net-label" for="net-answer">2. Друг пришлёт в ответ код — вставьте его сюда:</label>' +
            '<textarea id="net-answer" class="net-textarea" rows="3" placeholder="Код ответа"></textarea>' +
            '<p class="net-error" hidden></p>' +
            '<div class="net-actions"><button class="btn btn-primary" type="button" data-go>Подключить</button><button class="btn btn-ghost" type="button" data-cancel>Отмена</button></div>'
        );
        bindLink(b, url);
        b.querySelector('[data-cancel]').addEventListener('click', cancel);
        b.querySelector('[data-go]').addEventListener('click', async () => {
          const err = b.querySelector('.net-error');
          try {
            const ans = await unpack(b.querySelector('#net-answer').value);
            await pc.setRemoteDescription({ type: 'answer', sdp: ans.s });
            b.querySelector('[data-go]').disabled = true;
            err.hidden = false;
            err.textContent = 'Соединяемся…';
          } catch (e) {
            err.hidden = false;
            err.textContent = 'Код не подходит. Скопируйте его целиком.';
          }
        });
      } catch (e) {
        fail('Этот браузер не поддерживает соединение напрямую.');
      }
    }

    async function manualGuest(packed) {
      teardown();
      api.role = 'guest';
      dialog('<h2 id="net-title">Игра по сети</h2><p class="net-status"><span class="net-spinner"></span>Готовим ответ…</p>');
      try {
        const offer = await unpack(packed);
        if (offer.g !== opts.game) return fail('Ссылка ведёт в другую игру.');
        pc = new RTCPeerConnection(ICE);
        pc.ondatachannel = (e) => setupChannel(e.channel);
        pc.onconnectionstatechange = () => pc && pc.connectionState === 'failed' && lost(false);
        await pc.setRemoteDescription({ type: 'offer', sdp: offer.s });
        await pc.setLocalDescription(await pc.createAnswer());
        await waitIce(pc);
        const answer = await pack({ s: pc.localDescription.sdp });
        const b = dialog(
          '<h2 id="net-title">Ручное подключение</h2>' +
            '<p class="net-note">Отправьте этот код другу, который прислал ссылку, — он вставит его у себя.</p>' +
            '<textarea class="net-textarea" rows="4" readonly></textarea>' +
            '<p class="net-status"><span class="net-spinner"></span>Ждём, пока друг введёт код…</p>' +
            '<div class="net-actions"><button class="btn btn-primary" type="button" data-copy>Скопировать код</button><button class="btn btn-ghost" type="button" data-cancel>Отмена</button></div>'
        );
        const ta = b.querySelector('textarea');
        ta.value = answer;
        ta.addEventListener('focus', () => ta.select());
        b.querySelector('[data-copy]').addEventListener('click', (e) => copy(answer, e.currentTarget));
        b.querySelector('[data-cancel]').addEventListener('click', cancel);
      } catch (e) {
        fail('Ссылка-приглашение повреждена. Попросите друга прислать её ещё раз.');
      }
    }

    window.addEventListener('beforeunload', () => api.active && rawSend({ t: '_bye' }));

    // вход по ссылке-приглашению
    const m = location.hash.match(/^#(join|offer)=(.+)$/);
    if (m) setTimeout(() => (m[1] === 'join' ? join(decodeURIComponent(m[2]).toLowerCase()) : manualGuest(m[2])), 50);

    api.host = host;
    api.join = join;
    return api;
  }

  SG.net = { setup };
})();
