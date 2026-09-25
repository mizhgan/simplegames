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
     net.result('win' | 'lose' | 'draw') — партия закончилась (со своей стороны): растёт счёт серии,
                    появляется кнопка «Реванш». Повторные вызовы до новой партии ({ t: 'new' }) не считаются.
     opts.onRematch() — оба согласились на реванш; вызывается только у хозяина (обычно — «Новая партия»)

   Полоска сетевой игры сама показывает счёт серии и даёт отправить сопернику реакцию (эмодзи или фразу).

   Зрители: по ссылке «#watch=код» можно смотреть партию (кнопка «👁 Зрителям» в полоске и окне приглашения).
   Хозяин пересылает зрителям всё, что происходит. Игра может описать просмотр сама:
     opts.watch = {
       snapshot() { return данные },        // у хозяина: текущая партия для нового зрителя
       onSync(данные) {},                   // у зрителя: показать партию с начала
       onForward(msg, from) {},             // у зрителя: сообщение игры от 'host' или 'guest'
       forward(msg, from) { return true },  // у хозяина: пересылать ли это сообщение зрителям
     }
   Иначе зритель видит «зеркало» экрана хозяина; opts.mirrorMask(клон) прячет в нём секреты хозяина
   (его карты, расстановку и т. п.). Зрителю вызывается opts.onConnect('watcher') только при opts.watch.
   Хозяин может показать комнату в списке открытых игр («Ищу соперника») — список виден в окне
   приглашения у всех, кто открыл ту же игру (нужен свой сервер знакомств с --allow_discovery).
*/
(() => {
  'use strict';

  // ---------- настройки (владелец сайта может поменять) ----------
  const CONFIG = {
    // свой сервер знакомств PeerJS (deploy/peerjs/install.sh); null — только бесплатный публичный 0.peerjs.com.
    // Если свой не отвечает, комната создаётся на публичном, а к коду в ссылке добавляется «-p».
    peerServer: { host: 'turn.catin.org', port: 8443, path: '/', secure: true },
    // STUN помогает узнать внешний адрес, TURN пересылает трафик, когда напрямую соединиться нельзя
    // (частый случай в мобильном интернете). Для надёжной игры добавьте сюда свой TURN-сервер
    // (готовый конфиг coturn — deploy/coturn/turnserver.conf):
    // { urls: ['turn:turn.example.com:3478', 'turn:turn.example.com:3478?transport=tcp'], username: 'simplegames', credential: '…' }
    iceServers: [
      // свой TURN сайта (deploy/coturn/install.sh)
      {
        urls: ['turn:turn.catin.org:3478', 'turn:turn.catin.org:3478?transport=tcp', 'turns:turn.catin.org:443?transport=tcp'],
        username: 'simplegames',
        credential: '813dbec1a287257ce1ee7cbc5c26fd94',
      },
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
    ],
  };

  const PREFIX = 'simplegames-';
  const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
  // для проверки своего TURN без правки файла: localStorage['sg:ice-servers'] = '[{"urls":"turn:…","username":"…","credential":"…"}]',
  // а localStorage['sg:ice-policy'] = '"relay"' заставит ходить только через TURN
  const ICE = (() => {
    const cfg = { iceServers: CONFIG.iceServers };
    const custom = SG.store.get('ice-servers', null);
    if (Array.isArray(custom) && custom.length) cfg.iceServers = custom;
    if (SG.store.get('ice-policy', null) === 'relay') cfg.iceTransportPolicy = 'relay';
    return cfg;
  })();
  const SERVER_TIMEOUT = 9000;
  const JOIN_TIMEOUT = 45000; // гость ждёт, пока хозяин вернётся на страницу
  const RETRY_EVERY = 15000;
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

  // В комнату войти можно, только зная её код: на сервере комната записана под хэшем кода,
  // а гость называет сам код при знакомстве. Поэтому список комнат на сервере не раскрывает приглашения.
  function cyrb53(str) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
  }
  const roomPeerId = (room) => PREFIX + 'r' + cyrb53('sg:' + room);
  const LOBBY = 'sglobby-';

  const code = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  const baseUrl = () => location.href.split('#')[0];

  // свой сервер PeerJS можно указать в localStorage: sg:peer-server = {"host":"…","port":443,"path":"/","secure":true}
  // серверы знакомств по порядку: свой (если настроен), затем публичный 0.peerjs.com как запасной
  const ownServer = () => SG.store.get('peer-server', null) || CONFIG.peerServer;
  const serverList = () => (ownServer() && ownServer().host ? ['own', 'public'] : ['public']);

  function peerOptions(which) {
    const opts = { config: ICE, debug: 0 };
    const srv = which === 'own' ? ownServer() : SG.store.get('peer-server-public', null);
    if (srv && srv.host) Object.assign(opts, srv);
    return opts;
  }

  // код комнаты в ссылке: «abc123» — на основном сервере, «abc123-p» — на запасном публичном
  const roomToken = (room, which) => room + (which === 'public' && serverList()[0] === 'own' ? '-p' : '');
  function parseToken(token) {
    const m = String(token || '').toLowerCase().match(/^([a-z0-9]{6})(-p)?$/);
    if (!m) return null;
    return { room: m[1], which: m[2] ? 'public' : serverList()[0] };
  }

  // список открытых комнат этой игры на своём сервере (null — сервер не отдаёт список)
  async function lobbyList(game) {
    const srv = ownServer();
    if (!srv || !srv.host) return null;
    const port = srv.port || (srv.secure ? 443 : 80);
    const path = (srv.path || '/').replace(/\/?$/, '/');
    const url = (srv.secure ? 'https://' : 'http://') + srv.host + ':' + port + path + (srv.key || 'peerjs') + '/peers';
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 5000);
      const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (!res.ok) return null;
      const ids = await res.json();
      if (!Array.isArray(ids)) return null;
      const pre = LOBBY + game + '-';
      return ids
        .filter((id) => typeof id === 'string' && id.startsWith(pre))
        .map((id) => {
          const [room, ts] = id.slice(pre.length).split('-');
          return { room, since: parseInt(ts, 36) || 0 };
        })
        .filter((r) => /^[a-z0-9]{6}$/.test(r.room));
    } catch (e) {
      return null;
    }
  }

  const MAX_WATCHERS = 10;
  const REACTIONS = ['👍', '😂', '😮', '😢', '🤝', '🔥', 'Хороший ход!', 'Ой!', 'Ещё партию?', 'Спасибо за игру!'];

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

  // ---------- диагностика соединения ----------

  // следит за RTCPeerConnection попыток и запоминает, до какого этапа дошли
  const newDiag = () => ({ server: false, answered: false, states: [], local: new Set(), remote: new Set(), pcs: [] });

  function watchPc(pc, diag, onChange) {
    if (!pc || pc.__sgWatched) return;
    pc.__sgWatched = true;
    diag.pcs.push(pc);
    const upd = () => {
      const st = pc.iceConnectionState;
      if (st !== 'new' && diag.states[diag.states.length - 1] !== st) diag.states.push(st);
      if (pc.remoteDescription) diag.answered = true;
      if (onChange) onChange(diag, st);
    };
    pc.addEventListener('iceconnectionstatechange', upd);
    pc.addEventListener('signalingstatechange', upd);
    pc.addEventListener('icecandidate', (e) => {
      const m = e.candidate && e.candidate.candidate.match(/ typ (host|srflx|prflx|relay)/);
      if (m) diag.local.add(m[1]);
    });
  }

  // типы адресов из SDP (в ручном режиме все кандидаты лежат прямо в описании)
  function sdpTypes(sdp, set) {
    (sdp || '').replace(/a=candidate:.* typ (host|srflx|prflx|relay)/g, (_, t) => set.add(t));
  }

  // досчитываем адреса друга по статистике соединений
  async function collectStats(diag) {
    for (const pc of diag.pcs) {
      try {
        const stats = await pc.getStats();
        stats.forEach((r) => {
          if (r.type === 'remote-candidate' && r.candidateType) diag.remote.add(r.candidateType);
          if (r.type === 'local-candidate' && r.candidateType) diag.local.add(r.candidateType);
        });
      } catch (e) {
        /* соединение уже закрыто */
      }
      if (pc.remoteDescription) sdpTypes(pc.remoteDescription.sdp, diag.remote);
      if (pc.localDescription) sdpTypes(pc.localDescription.sdp, diag.local);
    }
  }

  const TYPE_NAMES = { host: 'локальный', srflx: 'внешний', prflx: 'внешний', relay: 'TURN' };
  const typeList = (set) => [...new Set([...set].map((t) => TYPE_NAMES[t]))].join(', ') || 'нет';

  function diagText(diag) {
    const yes = '✓';
    const no = '✗';
    const relay = diag.local.has('relay') || diag.remote.has('relay');
    return (
      'Сервер знакомств ' + (diag.server ? yes : no) +
      ' · друг ответил ' + (diag.answered ? yes : no) +
      ' · проверка связи: ' + (diag.states.length ? diag.states.join(' → ') : 'не началась') +
      ' · ваши адреса: ' + typeList(diag.local) +
      ' · адреса друга: ' + typeList(diag.remote) +
      ' · ретранслятор TURN: ' + (relay ? 'есть' : 'недоступен')
    );
  }

  const NO_DIRECT =
    'Браузеры обменялись адресами, но не смогли достучаться друг до друга. Так бывает, когда кто-то из игроков в мобильном интернете или за «строгим» роутером, а ретранслятор (TURN) недоступен. Попробуйте обоим подключиться к Wi-Fi (лучше к одной сети) — надёжно проблему решает свой TURN-сервер у владельца сайта.';

  // ---------- основной объект ----------

  function setup(opts) {
    const api = {
      active: false,
      role: null,
      send,
      leave,
      info,
      result,
    };
    let conn = null; // { send(obj), close() }
    let peer = null;
    let pc = null;
    let pingTimer = 0;
    let lastSeen = 0;
    let bar = null;
    let infoText = '';
    let helloDone = false;
    let pendingClose = null; // закрыть подключение хозяина, которое ещё не поздоровалось
    let myRoom = ''; // код комнаты хозяина (гость должен его назвать)
    let joinKey = ''; // код комнаты, куда входит гость
    let lobbyPeer = null;
    let lobbyTimer = 0;
    const series = { me: 0, them: 0, draw: 0 };
    let resultLocked = false;
    let finishedGame = false;
    let rematchMine = false;
    let rematchTheirs = false;
    let myToken = ''; // код комнаты для ссылок (у хозяина и гостя)
    const watchers = []; // у хозяина: подключённые зрители { c, send }
    let watcherCount = 0; // сколько зрителей (видят и игроки, и зрители)
    let watchPing = 0;
    let mirrorObs = null;
    let mirrorTimer = 0;
    let lastMirror = '';
    const WHO = { host: 'Игрок 1', guest: 'Игрок 2', watcher: 'Зритель' };

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
        bar.innerHTML =
          '<span class="net-dot"></span><span class="net-text"></span><span class="net-score" hidden></span>' +
          '<button class="btn btn-ghost net-rematch" type="button" hidden>Реванш</button>' +
          '<button class="btn btn-ghost net-watch-btn" type="button" title="Ссылка для зрителей" hidden>👁 <span></span></button>' +
          '<button class="btn btn-ghost net-react-btn" type="button" aria-label="Реакция" title="Реакция">😊</button>' +
          '<button class="btn btn-ghost" type="button" data-leave>Выйти</button>' +
          '<div class="net-react" hidden>' +
          REACTIONS.map((r, i) => `<button type="button" data-r="${i}"${r.length > 2 ? ' class="phrase"' : ''}>${r}</button>`).join('') +
          '</div>' +
          '<div class="net-watch" hidden><p>Пусть смотрят, как вы играете: отправьте эту ссылку — зрители увидят партию, но ходить не смогут.</p>' +
          '<div class="net-link"><input type="text" readonly aria-label="Ссылка для зрителей"><button class="btn btn-primary" type="button" data-copy>Скопировать</button>' +
          (navigator.share ? '<button class="btn btn-ghost" type="button" data-share>Поделиться</button>' : '') +
          '</div></div>';
        bar.querySelector('[data-leave]').addEventListener('click', () => leave());
        const wbox = bar.querySelector('.net-watch');
        bar.querySelector('.net-watch-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          wbox.hidden = !wbox.hidden;
          const url = watchUrl();
          const input = wbox.querySelector('input');
          input.value = url;
          if (!wbox.hidden) input.select();
        });
        wbox.querySelector('[data-copy]').addEventListener('click', (e) => copy(watchUrl(), e.currentTarget));
        const sh = wbox.querySelector('[data-share]');
        if (sh) sh.addEventListener('click', () => navigator.share({ title: document.title, text: 'Смотри, как мы играем!', url: watchUrl() }).catch(() => {}));
        const picker = bar.querySelector('.net-react');
        bar.querySelector('.net-react-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          picker.hidden = !picker.hidden;
        });
        picker.addEventListener('click', (e) => {
          const b = e.target.closest('[data-r]');
          if (!b) return;
          picker.hidden = true;
          const v = +b.dataset.r;
          rawSend({ t: '_react', v });
          if (api.role === 'host') toWatchers({ t: '_react', v, who: 'host' });
          bubble(REACTIONS[v], true);
        });
        bar.querySelector('.net-rematch').addEventListener('click', () => {
          if (rematchMine) return;
          rematchMine = true;
          rawSend({ t: '_rematch' });
          checkRematch();
        });
        updateBar();
      } else {
        bar.innerHTML = '<span class="net-dot"></span><span class="net-text">Соединение с соперником потеряно</span><button class="btn btn-ghost" type="button">Закрыть</button>';
        bar.querySelector('button').addEventListener('click', () => (bar.hidden = true));
      }
    }

    document.addEventListener('click', (e) => {
      const picker = bar && bar.querySelector('.net-react');
      if (picker && !picker.hidden && !e.target.closest('.net-react')) picker.hidden = true;
      const wbox = bar && bar.querySelector('.net-watch');
      if (wbox && !wbox.hidden && !e.target.closest('.net-watch')) wbox.hidden = true;
    });

    const watchUrl = () => baseUrl() + '#watch=' + myToken;

    function updateBar() {
      if (!bar || bar.dataset.state !== 'on') return;
      const watching = api.role === 'watcher';
      bar.classList.toggle('watching', watching);
      bar.querySelector('.net-text').textContent = watching
        ? '👁 Вы зритель' + (opts.watch ? '' : ' · видите экран игрока 1')
        : 'Игра по сети' + (infoText ? ' · ' + infoText : '');
      const sc = bar.querySelector('.net-score');
      const played = series.me + series.them + series.draw;
      sc.hidden = !played;
      sc.textContent = 'Счёт ' + series.me + ':' + series.them;
      sc.title = watching
        ? 'Игрок 1 — ' + series.me + ', игрок 2 — ' + series.them
        : 'Вы — ' + series.me + ', соперник — ' + series.them + (series.draw ? ', ничьих — ' + series.draw : '');
      const wb = bar.querySelector('.net-watch-btn');
      wb.hidden = !myToken;
      wb.querySelector('span').textContent = watcherCount ? watcherCount : 'Зрителям';
      wb.title = watcherCount ? 'Зрителей: ' + watcherCount + '. Ссылка для зрителей' : 'Ссылка для зрителей';
      const rb = bar.querySelector('.net-rematch');
      rb.hidden = watching || !(finishedGame && opts.onRematch);
      rb.disabled = rematchMine;
      rb.classList.toggle('pulse', rematchTheirs && !rematchMine);
      rb.textContent = rematchMine ? 'Ждём ответа…' : rematchTheirs ? 'Реванш? Да!' : 'Реванш';
    }

    // всплывающая реакция над полем
    function bubble(text, mine, who) {
      if (!bar) return;
      const el = document.createElement('div');
      el.className = 'net-bubble' + (mine ? ' mine' : '') + (who === 'watcher' ? ' watcher' : '');
      const from = mine ? 'Вы' : api.role === 'watcher' || who === 'watcher' ? WHO[who] || 'Соперник' : 'Соперник';
      el.textContent = from + ': ' + text;
      bar.appendChild(el);
      if (!mine) SG.sound.play('hint');
      setTimeout(() => el.classList.add('out'), 2600);
      setTimeout(() => el.remove(), 3100);
    }

    function result(r) {
      if (!api.active || resultLocked || api.role === 'watcher') return;
      resultLocked = true;
      finishedGame = true;
      SG.store.set('net-results', SG.store.get('net-results', 0) + 1);
      if (r === 'win') series.me++;
      else if (r === 'lose') series.them++;
      else series.draw++;
      updateBar();
      if (api.role === 'host') toWatchers({ t: '_wseries', s: series });
    }

    // началась новая партия — сбрасываем итог и предложения реванша
    function newGameSeen() {
      resultLocked = false;
      finishedGame = false;
      rematchMine = rematchTheirs = false;
      updateBar();
    }

    function checkRematch() {
      if (rematchMine && rematchTheirs) {
        rematchMine = rematchTheirs = false;
        if (api.role === 'host' && opts.onRematch) opts.onRematch();
      }
      updateBar();
    }

    function info(text) {
      infoText = text;
      updateBar();
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
      if (msg.t === '_react') {
        if (!api.active || !REACTIONS[msg.v]) return;
        const who = api.role === 'host' ? 'guest' : msg.who || 'host';
        bubble(REACTIONS[msg.v], false, who);
        if (api.role === 'host') toWatchers({ t: '_react', v: msg.v, who: 'guest' });
        return;
      }
      if (msg.t === '_watchers') {
        watcherCount = msg.n | 0;
        updateBar();
        return;
      }
      if (api.role === 'watcher' && handleAsWatcher(msg)) return;
      if (msg.t === '_rematch') {
        if (!api.active) return;
        rematchTheirs = true;
        checkRematch();
        return;
      }
      if (msg.t === '_denied') {
        teardown();
        dialog('<h2 id="net-title">Не та комната</h2><p>Код комнаты не подошёл. Попросите друга прислать ссылку ещё раз.</p><div class="net-actions"><button class="btn btn-primary" type="button" data-close>Понятно</button></div>')
          .querySelector('[data-close]').addEventListener('click', cancel);
        return;
      }
      if (msg.t === '_hello') {
        // в комнату на сервере знакомств пускаем только знающих код (в ручном режиме код не нужен)
        if (!helloDone && api.role === 'host' && myRoom && msg.key !== myRoom) {
          rawSend({ t: '_denied' });
          const c = conn;
          setTimeout(() => c && c.close(), 800);
          return;
        }
        if (msg.game !== opts.game) {
          dialog('<h2 id="net-title">Другая игра</h2><p>Соперник открыл другую игру. Попросите его перейти по вашей ссылке ещё раз.</p><div class="net-actions"><button class="btn btn-primary" type="button" data-close>Понятно</button></div>')
            .querySelector('[data-close]').addEventListener('click', closeDialog);
          return teardown();
        }
        if (!helloDone) {
          helloDone = true;
          rawSend({ t: '_hello', game: opts.game, key: joinKey });
          connected();
        }
        return;
      }
      if (msg.t === 'new') newGameSeen();
      if (api.role === 'host' && api.active) forwardToWatchers(msg, 'guest');
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
      if (!api.active || api.role === 'watcher') return;
      if (obj && obj.t === 'new') newGameSeen();
      rawSend(obj);
      if (api.role === 'host') forwardToWatchers(obj, 'host');
    }

    function attach(c) {
      conn = c;
      lastSeen = Date.now();
      // гость первым здоровается, хозяин отвечает
      if (api.role === 'guest') rawSend({ t: '_hello', game: opts.game, key: joinKey });
      if (api.role === 'watcher') rawSend({ t: '_hello', game: opts.game, key: joinKey, watch: 1 });
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        rawSend({ t: '_ping' });
        if (helloDone && Date.now() - lastSeen > 15000) lost(false);
      }, 4000);
    }

    function connected() {
      api.active = true;
      stopLobby();
      series.me = series.them = series.draw = 0;
      resultLocked = finishedGame = rematchMine = rematchTheirs = false;
      closeDialog();
      markMode(true);
      renderBar('on');
      SG.sound.play('match');
      history.replaceState(null, '', baseUrl());
      if (opts.onConnect) opts.onConnect(api.role);
      // партия началась — зрители, пришедшие заранее, получают её с начала
      if (api.role === 'host') {
        watchers.forEach(syncWatcher);
        sendCount();
        if (!opts.watch && watchers.length) startMirror();
      }
    }

    function lost(byPeer) {
      const was = api.active;
      const watcher = api.role === 'watcher';
      teardown();
      if (was) {
        renderBar('off');
        if (bar && watcher) bar.querySelector('.net-text').textContent = 'Трансляция закончилась: игроки вышли';
        else if (bar && byPeer) bar.querySelector('.net-text').textContent = 'Соперник вышел из игры';
        SG.sound.play('error');
        if (opts.onDisconnect) opts.onDisconnect();
      }
    }

    function teardown() {
      clearInterval(pingTimer);
      stopLobby();
      closeWatchers();
      stopMirror();
      document.body.classList.remove('sg-watching');
      const mirror = document.querySelector('.net-mirror');
      if (mirror) mirror.remove();
      watcherCount = 0;
      myRoom = '';
      myToken = '';
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
        // сначала отпускаем ссылку: при destroy() PeerJS шлёт «disconnected», и обработчик не должен переподключаться
        const p = peer;
        peer = null;
        try {
          p.destroy();
        } catch (e) {
          /* ignore */
        }
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

    // ---------- лобби: открытые комнаты ----------

    function stopLobby() {
      clearTimeout(lobbyTimer);
      lobbyTimer = 0;
      if (lobbyPeer) {
        const p = lobbyPeer;
        lobbyPeer = null;
        try {
          p.destroy();
        } catch (e) {
          /* ignore */
        }
      }
    }

    // отдельная «табличка» на сервере: по ней другие видят, что в этой игре ждут соперника
    function publish(room, on) {
      if (lobbyPeer) {
        const p = lobbyPeer;
        lobbyPeer = null;
        try {
          p.destroy();
        } catch (e) {
          /* ignore */
        }
      }
      if (!on || !window.Peer) return;
      try {
        const p = new window.Peer(LOBBY + opts.game + '-' + room + '-' + Math.floor(Date.now() / 1000).toString(36), peerOptions('own'));
        p.on('connection', (c) => c.close());
        p.on('error', () => {});
        p.on('disconnected', () => lobbyPeer === p && !p.destroyed && p.reconnect());
        lobbyPeer = p;
      } catch (e) {
        /* ignore */
      }
    }

    // раздел «Открытые игры» в окне приглашения
    function lobbyBlock(box, room, onServer) {
      const wrap = box.querySelector('.net-lobby');
      if (!wrap) return;
      const listEl = wrap.querySelector('.net-rooms');
      const chk = wrap.querySelector('input[type=checkbox]');
      chk.checked = !!SG.store.get('net-public', false);
      if (onServer) {
        chk.addEventListener('change', () => {
          SG.store.set('net-public', chk.checked);
          publish(room, chk.checked);
          setTimeout(poll, 700);
        });
        if (chk.checked) publish(room, true);
      } else wrap.querySelector('.net-public').hidden = true;
      const poll = async () => {
        clearTimeout(lobbyTimer);
        if (api.active || !modal || modal.hidden || !box.isConnected || !box.contains(listEl)) return;
        const rooms = await lobbyList(opts.game);
        if (api.active || !box.contains(listEl)) return;
        if (!rooms) {
          wrap.hidden = true;
          return;
        }
        wrap.hidden = false;
        const others = rooms.filter((r) => r.room !== room).sort((a, b) => b.since - a.since).slice(0, 8);
        const now = Date.now() / 1000;
        listEl.innerHTML = others.length
          ? others
              .map((r) => {
                const min = r.since ? Math.max(0, Math.round((now - r.since) / 60)) : 0;
                return `<li><span>Комната <b>${r.room}</b><small>${min ? 'ждёт ' + min + ' мин' : 'только что'}</small></span><button class="btn btn-primary" type="button" data-room="${r.room}">Играть</button></li>`;
              })
              .join('')
          : '<li class="empty">Пока никто не ищет соперника. Отметьте галочку — и вашу комнату увидят другие.</li>';
        lobbyTimer = setTimeout(poll, 4000);
      };
      listEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-room]');
        if (b) join(b.dataset.room);
      });
      poll();
    }

    // ---------- зрители ----------

    function toWatchers(obj) {
      if (!watchers.length) return;
      const s = JSON.stringify(obj);
      watchers.forEach((w) => {
        try {
          w.c.send(s);
        } catch (e) {
          /* канал закрыт */
        }
      });
    }

    function forwardToWatchers(msg, from) {
      if (!watchers.length || !opts.watch) return;
      if (opts.watch.forward && !opts.watch.forward(msg, from)) return;
      toWatchers({ t: '_fw', from, m: msg });
    }

    function sendCount() {
      watcherCount = watchers.length;
      rawSend({ t: '_watchers', n: watcherCount });
      toWatchers({ t: '_watchers', n: watcherCount });
      updateBar();
    }

    // новому зрителю — текущая партия
    function syncWatcher(w) {
      const one = (obj) => {
        try {
          w.c.send(JSON.stringify(obj));
        } catch (e) {
          /* ignore */
        }
      };
      one({ t: '_wseries', s: series });
      one({ t: '_watchers', n: watchers.length });
      if (!api.active) return one({ t: '_wwait' });
      if (opts.watch) one({ t: '_sync', d: opts.watch.snapshot() });
      else {
        const m = mirrorPayload();
        if (m) one(m);
      }
    }

    // у хозяина: зритель подключился по ссылке #watch=
    function acceptWatcher(c) {
      let joined = false;
      const w = { c };
      c.on('data', (raw) => {
        let msg;
        try {
          msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (e) {
          return;
        }
        if (!msg) return;
        if (!joined) {
          if (msg.t !== '_hello' || !msg.watch) return;
          if ((myRoom && msg.key !== myRoom) || msg.game !== opts.game) {
            c.send(JSON.stringify({ t: '_denied' }));
            return setTimeout(() => c.close(), 800);
          }
          if (watchers.length >= MAX_WATCHERS) {
            c.send(JSON.stringify({ t: '_wfull' }));
            return setTimeout(() => c.close(), 1500);
          }
          joined = true;
          watchers.push(w);
          c.send(JSON.stringify({ t: '_whello', game: opts.game, mode: opts.watch ? 'watch' : 'mirror' }));
          syncWatcher(w);
          sendCount();
          if (!opts.watch && api.active) startMirror();
          if (!watchPing) {
            watchPing = setInterval(() => toWatchers({ t: '_ping' }), 4000);
          }
          return;
        }
        if (msg.t === '_react' && REACTIONS[msg.v]) {
          bubble(REACTIONS[msg.v], false, 'watcher');
          rawSend({ t: '_react', v: msg.v, who: 'watcher' });
          watchers.forEach((o) => o !== w && o.c.send(JSON.stringify({ t: '_react', v: msg.v, who: 'watcher' })));
        }
      });
      const gone = () => {
        const i = watchers.indexOf(w);
        if (i < 0) return;
        watchers.splice(i, 1);
        sendCount();
        if (!watchers.length) stopMirror();
      };
      c.on('close', gone);
      c.on('error', gone);
    }

    function closeWatchers() {
      clearInterval(watchPing);
      watchPing = 0;
      const list = watchers.splice(0);
      list.forEach((w) => {
        try {
          w.c.send(JSON.stringify({ t: '_bye' }));
        } catch (e) {
          /* ignore */
        }
        setTimeout(() => {
          try {
            w.c.close();
          } catch (e) {
            /* ignore */
          }
        }, 100);
      });
    }

    // ---------- «зеркало» экрана хозяина для игр без своего режима просмотра ----------

    function mirrorPayload() {
      const stage = document.querySelector('.game-stage');
      if (!stage) return null;
      const clone = stage.cloneNode(true);
      clone.querySelectorAll('.net-bar, .net-mirror, #mode, #difficulty, .rt-pads').forEach((el) => el.remove());
      clone.querySelectorAll('.game-controls').forEach((el) => !el.textContent.trim() && el.remove());
      // холсты передаём картинками
      const src = stage.querySelectorAll('canvas');
      clone.querySelectorAll('canvas').forEach((cv, i) => {
        const img = document.createElement('img');
        img.className = cv.className;
        img.setAttribute('style', cv.getAttribute('style') || '');
        img.alt = '';
        try {
          img.src = src[i].toDataURL('image/jpeg', 0.7);
        } catch (e) {
          /* ignore */
        }
        cv.replaceWith(img);
      });
      if (opts.mirrorMask) opts.mirrorMask(clone);
      neutralize(clone);
      const stats = document.querySelector('.game-head .stats');
      let statsHtml = '';
      if (stats) {
        const sc = stats.cloneNode(true);
        neutralize(sc);
        statsHtml = sc.innerHTML;
      }
      return { t: '_mirror', h: clone.innerHTML, s: statsHtml };
    }

    // подписи с точки зрения хозяина («Ваш ход», «Соперник») зрителю переводим в «игрок 1 / игрок 2»
    const W = '(^|[^А-Яа-яЁё])';
    const MIRROR_WORDS = [
      [/Ваш ход/g, 'Ходит игрок 1'], [/Ход соперника…?/g, 'Ходит игрок 2'], [/Соперник думает…?/g, 'Думает игрок 2'],
      [/Вы победили/g, 'Игрок 1 победил'], [/Вы проиграли/g, 'Игрок 1 проиграл'], [/Вы остались/g, 'Игрок 1 остался'],
      [/Ваш флот/g, 'Флот игрока 1'], [/Ваши карты/g, 'Карты игрока 1'], [/Противник/g, 'Игрок 2'],
      [new RegExp(W + 'Вы(?![А-Яа-яЁё])', 'g'), '$1Игрок 1'], [new RegExp(W + 'вы(?![А-Яа-яЁё])', 'g'), '$1игрок 1'],
      [/у вас/g, 'у игрока 1'], [/Вам(?![А-Яа-яЁё])/g, 'Игроку 1'], [/Соперн\./g, 'Игр. 2'],
      [/Соперника/g, 'Игрока 2'], [/соперника/g, 'игрока 2'], [/Соперник/g, 'Игрок 2'], [/соперник/g, 'игрок 2'],
    ];
    function neutralize(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((n) => {
        const t = MIRROR_WORDS.reduce((x, [re, to]) => x.replace(re, to), n.nodeValue);
        if (t !== n.nodeValue) n.nodeValue = t;
      });
    }

    function pushMirror() {
      mirrorTimer = 0;
      if (!watchers.length || !api.active) return;
      const m = mirrorPayload();
      if (!m) return;
      const key = m.h + m.s;
      if (key === lastMirror) return;
      lastMirror = key;
      toWatchers(m);
    }

    function startMirror() {
      if (mirrorObs || opts.watch) return;
      const stage = document.querySelector('.game-stage');
      if (!stage) return;
      const schedule = () => {
        if (!mirrorTimer) mirrorTimer = setTimeout(pushMirror, 200);
      };
      mirrorObs = new MutationObserver(schedule);
      mirrorObs.observe(stage, { subtree: true, childList: true, attributes: true, characterData: true });
      const stats = document.querySelector('.game-head .stats');
      if (stats) mirrorObs.observe(stats, { subtree: true, childList: true, characterData: true });
      // холсты меняются без событий DOM — обновляем их раз в полсекунды
      if (stage.querySelector('canvas')) mirrorObs.canvasTimer = setInterval(schedule, 500);
      lastMirror = '';
      schedule();
    }

    function stopMirror() {
      if (mirrorObs) {
        clearInterval(mirrorObs.canvasTimer);
        mirrorObs.disconnect();
      }
      mirrorObs = null;
      clearTimeout(mirrorTimer);
      mirrorTimer = 0;
    }

    // у зрителя: служебные сообщения трансляции
    function handleAsWatcher(msg) {
      if (msg.t === '_whello') {
        if (msg.game !== opts.game) return true;
        if (!helloDone) {
          helloDone = true;
          api.active = true;
          closeDialog();
          markMode(true);
          renderBar('on');
          SG.sound.play('match');
          history.replaceState(null, '', baseUrl());
          if (msg.mode === 'watch' && opts.watch && opts.onConnect) opts.onConnect('watcher');
          if (msg.mode === 'mirror') document.body.classList.add('sg-watching');
        }
        return true;
      }
      if (msg.t === '_wfull') {
        teardown();
        dialog('<h2 id="net-title">Зрительный зал полон</h2><p>У этой партии уже ' + MAX_WATCHERS + ' зрителей. Попробуйте зайти чуть позже.</p><div class="net-actions"><button class="btn btn-primary" type="button" data-close>Понятно</button></div>')
          .querySelector('[data-close]').addEventListener('click', cancel);
        return true;
      }
      if (msg.t === '_wseries') {
        const x = msg.s || {};
        series.me = x.me | 0;
        series.them = x.them | 0;
        series.draw = x.draw | 0;
        updateBar();
        return true;
      }
      if (msg.t === '_wwait') {
        showMirrorNote('Игроки ещё не начали — трансляция начнётся, как только соперник подключится.');
        return true;
      }
      if (msg.t === '_mirror') {
        renderMirror(msg);
        return true;
      }
      if (msg.t === '_sync') {
        showMirrorNote('');
        if (opts.watch) opts.watch.onSync(msg.d);
        return true;
      }
      if (msg.t === '_fw') {
        if (msg.m && msg.m.t === 'new') newGameSeen();
        if (opts.watch && msg.m) opts.watch.onForward(msg.m, msg.from);
        return true;
      }
      return false;
    }

    function mirrorBox() {
      let box = document.querySelector('.net-mirror');
      if (!box) {
        box = document.createElement('div');
        box.className = 'net-mirror';
        // в конец сцены: элементы с теми же id у самой игры остаются первыми в документе
        const stage = document.querySelector('.game-stage');
        if (stage) stage.appendChild(box);
      }
      return box;
    }

    function showMirrorNote(text) {
      let note = document.querySelector('.net-watch-note');
      if (!text) {
        if (note) note.remove();
        return;
      }
      if (!note) {
        note = document.createElement('p');
        note.className = 'net-watch-note';
        if (bar) bar.after(note);
      }
      note.textContent = text;
    }

    function renderMirror(msg) {
      showMirrorNote('');
      document.body.classList.add('sg-watching');
      mirrorBox().innerHTML = msg.h;
      const stats = document.querySelector('.game-head .stats');
      if (stats && msg.s) stats.innerHTML = msg.s;
    }

    // ---------- хозяин: комната через PeerJS ----------

    async function host(srvIdx) {
      teardown();
      api.role = 'host';
      const servers = serverList();
      const idx = srvIdx || 0;
      const which = servers[idx];
      // свой сервер не ответил — пробуем следующий, и только потом ручной режим
      const fallback = (reason) => (idx + 1 < servers.length ? host(idx + 1) : manualHost(reason));
      const room = code();
      const box = dialog(
        '<h2 id="net-title">Игра по сети</h2><p class="net-status">Создаём комнату…</p>' +
          '<div class="net-actions"><button class="btn btn-ghost" type="button" data-cancel>Отмена</button></div>'
      );
      box.querySelector('[data-cancel]').addEventListener('click', cancel);
      if (!(await loadPeer())) return manualHost('Не удалось загрузить модуль связи.');
      if (api.role !== 'host' || (modal && modal.hidden)) return;
      let opened = false;
      const timer = setTimeout(() => !opened && fallback('Сервер знакомств не отвечает.'), SERVER_TIMEOUT);
      try {
        peer = new window.Peer(roomPeerId(room), peerOptions(which));
      } catch (e) {
        clearTimeout(timer);
        return fallback('Сервер знакомств недоступен.');
      }
      const myPeer = peer;
      const token = roomToken(room, which);
      myRoom = room;
      myToken = token;
      peer.on('open', () => {
        opened = true;
        clearTimeout(timer);
        const url = baseUrl() + '#join=' + token;
        const b = dialog(
          '<h2 id="net-title">Игра по сети</h2>' +
            linkBlock(url, 'Отправьте другу эту ссылку:') +
            `<p class="net-code">Или продиктуйте код комнаты: <b>${token}</b></p>` +
            '<p class="net-status"><span class="net-spinner"></span>Ждём соперника…</p>' +
            '<p class="net-note">Отправив ссылку, вернитесь на эту страницу: пока она свёрнута, браузер может её «усыпить».</p>' +
            `<details class="net-join"><summary>Ссылка для зрителей</summary><p class="net-note">По ней можно смотреть партию, не играя.</p><div class="net-link"><input type="text" readonly value="${baseUrl()}#watch=${token}" aria-label="Ссылка для зрителей"><button class="btn btn-ghost" type="button" data-wcopy>Скопировать</button></div></details>` +
            '<details class="net-join"><summary>У меня есть код от друга</summary><div class="net-link"><input type="text" maxlength="8" autocomplete="off" placeholder="Код комнаты" aria-label="Код комнаты"><button class="btn btn-primary" type="button" data-join>Войти</button></div></details>' +
            '<div class="net-lobby" hidden><label class="net-public"><input type="checkbox"> Ищу соперника — показать мою комнату всем</label>' +
            '<p class="net-label">Открытые игры</p><ul class="net-rooms"></ul></div>' +
            '<div class="net-actions"><button class="btn btn-ghost" type="button" data-manual>Ручной режим</button><button class="btn btn-ghost" type="button" data-cancel>Отмена</button></div>'
        );
        bindLink(b, url);
        b.querySelector('[data-wcopy]').addEventListener('click', (e) => copy(baseUrl() + '#watch=' + token, e.currentTarget));
        b.querySelector('[data-cancel]').addEventListener('click', cancel);
        b.querySelector('[data-manual]').addEventListener('click', () => manualHost('Соединимся без сервера знакомств.'));
        const joinInput = b.querySelector('.net-join input');
        const go = () => {
          const v = joinInput.value.trim().toLowerCase();
          if (parseToken(v) && v !== token) join(v);
          else joinInput.focus();
        };
        b.querySelector('[data-join]').addEventListener('click', go);
        joinInput.addEventListener('keydown', (e) => e.key === 'Enter' && go());
        lobbyBlock(b, room, which === 'own');
      });
      peer.on('connection', (c) => {
        if (c.metadata && c.metadata.watch) return acceptWatcher(c);
        // прежняя попытка так и не поздоровалась (друг закрыл вкладку посреди соединения) — уступаем место новой
        if (conn && !helloDone && pendingClose) pendingClose();
        if (conn) {
          // комната уже занята — прямо говорим об этом опоздавшему, а не молча закрываем
          c.on('open', () => {
            try {
              c.send(JSON.stringify({ t: '_busy' }));
            } catch (e) {
              /* ignore */
            }
            setTimeout(() => c.close(), 1500);
          });
          return;
        }
        let mine = false;
        const status = modal && modal.querySelector('.net-status');
        if (status) status.innerHTML = '<span class="net-spinner"></span>Друг подключается…';
        const diag = newDiag();
        diag.server = true;
        diag.answered = true;
        watchPc(c.peerConnection, diag, async (d, st) => {
          if (conn || !status) return;
          if (st === 'checking') status.innerHTML = '<span class="net-spinner"></span>Друг подключается, проверяем прямую связь…';
          if (st === 'failed') {
            await collectStats(d);
            status.innerHTML = NO_DIRECT + '<br><small class="net-diag">' + diagText(d) + '</small>';
          }
        });
        c.on('open', () => {
          mine = true;
          attach(wrapPeerConn(c));
          pendingClose = () => {
            pendingClose = null;
            try {
              c.close();
            } catch (e) {
              /* ignore */
            }
            dropped();
          };
          // гость здоровается сразу; молчание — значит, попытка оборвалась
          setTimeout(() => mine && !helloDone && pendingClose && pendingClose(), 6000);
        });
        c.on('data', (x) => mine && handle(x));
        // оборвавшаяся попытка до начала игры не должна закрывать комнату — ждём следующую
        const dropped = () => {
          if (!mine) return;
          mine = false;
          if (api.active) return lost(false);
          conn = null;
          clearInterval(pingTimer);
          if (status) status.innerHTML = '<span class="net-spinner"></span>Ждём соперника…';
        };
        c.on('close', dropped);
        c.on('error', dropped);
      });
      peer.on('error', (err) => {
        if (peer !== myPeer) return;
        if (err.type === 'unavailable-id') return host(idx);
        if (!opened || ['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible'].includes(err.type)) {
          clearTimeout(timer);
          if (!api.active && !opened) fallback('Сервер знакомств недоступен.');
        }
      });
      peer.on('disconnected', () => {
        // связь с сервером знакомств держим и во время игры — через неё приходят зрители
        if (peer === myPeer && !myPeer.destroyed) {
          setTimeout(() => {
            try {
              if (peer === myPeer && !myPeer.destroyed && myPeer.disconnected) myPeer.reconnect();
            } catch (e) {
              /* ignore */
            }
          }, api.active ? 3000 : 0);
        }
      });
    }

    // вкладку свернули (например, чтобы отправить ссылку) и вернулись — восстанавливаем связь с сервером
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && peer && !peer.destroyed && peer.disconnected && (!api.active || api.role === 'host')) {
        try {
          peer.reconnect();
        } catch (e) {
          /* ignore */
        }
      }
    });

    function cancel() {
      teardown();
      closeDialog();
      history.replaceState(null, '', baseUrl());
    }

    // ---------- гость: вход по коду комнаты ----------

    async function join(token, asWatcher) {
      const parsed = parseToken(token);
      if (!parsed) return fail('Неверный код комнаты.');
      const room = parsed.room;
      token = String(token).toLowerCase();
      teardown();
      api.role = asWatcher ? 'watcher' : 'guest';
      joinKey = room;
      myToken = token;
      const box = dialog(
        '<h2 id="net-title">' + (asWatcher ? 'Просмотр игры' : 'Игра по сети') + '</h2><p class="net-status"><span class="net-spinner"></span>Подключаемся к комнате <b>' +
          room +
          '</b>…</p><p class="net-note" hidden></p><div class="net-actions"><button class="btn btn-ghost" type="button" data-cancel>Отмена</button></div>'
      );
      box.querySelector('[data-cancel]').addEventListener('click', cancel);
      const statusEl = box.querySelector('.net-status');
      const noteEl = box.querySelector('.net-note');
      const setStatus = (html) => (statusEl.innerHTML = '<span class="net-spinner"></span>' + html);
      if (!(await loadPeer())) return fail('Не удалось загрузить модуль связи.', token);
      if (modal && modal.hidden) return;

      const diag = newDiag();
      const myPeer = new window.Peer(peerOptions(parsed.which));
      peer = myPeer;
      let retryTimer = 0;
      let hintTimer = 0;
      let unavailable = 0;
      let attempts = [];
      const stop = () => {
        clearTimeout(retryTimer);
        clearTimeout(hintTimer);
        clearTimeout(giveUp);
      };
      const giveUp = setTimeout(async () => {
        if (api.active || peer !== myPeer) return;
        stop();
        await collectStats(diag);
        let why;
        if (!diag.server) why = 'Не удалось связаться с сервером знакомств. Проверьте интернет или попросите друга включить «Ручной режим» в окне приглашения.';
        else if (!diag.answered) why = 'Друг не отвечает: похоже, он закрыл окно приглашения или страницу игры (или она свёрнута). Попросите его открыть страницу или прислать новую ссылку — и нажмите «Повторить».';
        else why = NO_DIRECT;
        fail(why + '<br><small class="net-diag">' + diagText(diag) + '</small>', token);
      }, JOIN_TIMEOUT);

      // попытка соединения; если долго нет ответа — пробуем ещё раз (хозяин мог вернуться на страницу)
      const attempt = () => {
        if (api.active || peer !== myPeer || myPeer.destroyed) return;
        if (myPeer.disconnected) {
          try {
            myPeer.reconnect();
          } catch (e) {
            /* ignore */
          }
        }
        // зависшие без ответа попытки закрываем, чтобы не держать ретранслятор
        attempts = attempts.filter((a) => {
          const pc = a.peerConnection;
          const stuck = !pc || !pc.remoteDescription || pc.iceConnectionState === 'failed';
          if (stuck) {
            try {
              a.close();
            } catch (e) {
              /* ignore */
            }
          }
          return !stuck;
        });
        const c = myPeer.connect(roomPeerId(room), asWatcher ? { reliable: true, metadata: { watch: 1 } } : { reliable: true });
        attempts.push(c);
        let mine = false;
        watchPc(c.peerConnection, diag, (d, st) => {
          if (conn) return;
          if (st === 'checking') setStatus('Друг найден, проверяем прямую связь…');
          else if (d.answered && st !== 'failed') setStatus('Друг найден, устанавливаем соединение…');
        });
        c.on('open', () => {
          if (conn) return c.close();
          mine = true;
          clearTimeout(retryTimer);
          // остальные попытки больше не нужны
          attempts.forEach((a) => a !== c && a.close());
          attempts = [c];
          attach(wrapPeerConn(c));
        });
        c.on('data', (x) => {
          if (!mine) return;
          let msg = x;
          try {
            if (typeof x === 'string') msg = JSON.parse(x);
          } catch (e) {
            /* ignore */
          }
          if (msg && msg.t === '_busy' && !api.active) {
            stop();
            return busy(room);
          }
          handle(x);
        });
        c.on('close', () => {
          if (!mine) return;
          mine = false;
          if (api.active) return lost(false);
          // канал закрылся до начала игры — пробуем снова
          conn = null;
          clearInterval(pingTimer);
          clearTimeout(retryTimer);
          retryTimer = setTimeout(attempt, 1000);
        });
        retryTimer = setTimeout(attempt, RETRY_EVERY);
      };

      myPeer.on('open', () => {
        diag.server = true;
        setStatus('Ищем друга в комнате <b>' + room + '</b>…');
        attempt();
        hintTimer = setTimeout(() => {
          if (api.active) return;
          noteEl.hidden = false;
          noteEl.textContent = 'Друг пока не ответил. Если он отправлял ссылку с телефона, попросите его вернуться на страницу игры — мы подождём.';
        }, 8000);
      });
      myPeer.on('error', (err) => {
        if (api.active || peer !== myPeer) return;
        if (err.type === 'peer-unavailable') {
          // комнаты на сервере нет: хозяин закрыл приглашение или страницу. Один раз перепроверяем —
          // вдруг он как раз переподключается к серверу, — и сразу говорим как есть
          unavailable++;
          if (unavailable >= 2) {
            stop();
            fail('Приглашение больше не действует: друг закрыл окно ожидания или страницу игры. Попросите у него новую ссылку.', token);
          } else {
            setStatus('Комната не отвечает, проверяем ещё раз…');
            clearTimeout(retryTimer);
            retryTimer = setTimeout(attempt, 2500);
          }
          return;
        }
        if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type) && !diag.server) {
          stop();
          fail('Сервер знакомств недоступен. Попросите друга нажать «Ручной режим» в окне приглашения и прислать новую ссылку.', token);
        }
      });
      myPeer.on('disconnected', () => {
        if (!api.active && peer === myPeer && !myPeer.destroyed) {
          try {
            myPeer.reconnect();
          } catch (e) {
            /* ignore */
          }
        }
      });
    }

    // в комнате уже идёт игра — ссылку открыл кто-то ещё из чата
    function busy(room) {
      teardown();
      const b = dialog(
        '<h2 id="net-title">Комната уже занята</h2><p>В комнате <b>' +
          room +
          '</b> уже играют двое — вы опоздали. Создайте свою игру и отправьте ссылку тому, с кем хотите сыграть.</p>' +
          '<div class="net-actions"><button class="btn btn-primary" type="button" data-host>Создать свою игру</button>' +
          '<button class="btn btn-ghost" type="button" data-close>Закрыть</button></div>'
      );
      b.querySelector('[data-close]').addEventListener('click', cancel);
      b.querySelector('[data-host]').addEventListener('click', () => {
        history.replaceState(null, '', baseUrl());
        host();
      });
      SG.sound.play('error');
    }

    function fail(text, room) {
      lastJoinWatch = api.role === 'watcher';
      teardown();
      const b = dialog(
        '<h2 id="net-title">Не получилось подключиться</h2><p>' +
          text +
          '</p><div class="net-actions">' +
          (room ? '<button class="btn btn-primary" type="button" data-retry>Повторить</button>' : '') +
          '<button class="btn btn-ghost" type="button" data-close>Закрыть</button></div>'
      );
      b.querySelector('[data-close]').addEventListener('click', cancel);
      const r = b.querySelector('[data-retry]');
      if (r) r.addEventListener('click', () => join(room, api.role === 'watcher' || lastJoinWatch));
    }
    let lastJoinWatch = false;

    // ---------- ручной режим: обмен кодами ----------

    function setupChannel(ch) {
      ch.onopen = () => attach({ send: (s) => ch.send(s), close: () => ch.close() });
      ch.onmessage = (e) => handle(e.data);
      ch.onclose = () => lost(false);
    }

    // ручной режим: следим за соединением и честно сообщаем, если оно не удалось
    function watchManual(p, diag) {
      watchPc(p, diag, (d, st) => {
        if (api.active || pc !== p) return;
        if (st === 'failed') manualFailed(p, diag);
        else if (st === 'checking' && modal) {
          const el = modal.querySelector('.net-error, .net-status');
          if (el) el.innerHTML = (el.classList.contains('net-status') ? '<span class="net-spinner"></span>' : '') + 'Друг ввёл код, проверяем прямую связь…';
        }
      });
      p.addEventListener('connectionstatechange', () => {
        if (p.connectionState === 'failed' && api.active) lost(false);
      });
    }

    async function manualFailed(p, diag) {
      if (api.active || pc !== p) return;
      await collectStats(diag);
      if (api.active || pc !== p) return;
      fail(NO_DIRECT + '<br><small class="net-diag">' + diagText(diag).replace('Сервер знакомств ✗ · ', 'Ручной режим · ') + '</small>');
    }

    async function manualHost(reason) {
      if (peer) {
        // сначала отпускаем ссылку: при destroy() PeerJS шлёт «disconnected», и обработчик не должен переподключаться
        const p = peer;
        peer = null;
        try {
          p.destroy();
        } catch (e) {
          /* ignore */
        }
      }
      api.role = 'host';
      stopLobby();
      myRoom = '';
      dialog('<h2 id="net-title">Игра по сети</h2><p class="net-status"><span class="net-spinner"></span>Готовим приглашение…</p>');
      try {
        pc = new RTCPeerConnection(ICE);
        const myPc = pc;
        const diag = newDiag();
        diag.answered = false;
        watchManual(myPc, diag);
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
            // без ответа за 30 секунд считаем, что напрямую не достучаться
            setTimeout(() => pc === myPc && !api.active && manualFailed(myPc, diag), 30000);
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
        const diag = newDiag();
        diag.answered = true;
        watchManual(pc, diag);
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
    // уходя со страницы, сразу снимаем комнату с сервера — иначе гость ждал бы, пока сервер заметит пропажу
    window.addEventListener('pagehide', () => {
      stopLobby();
      if (peer && !peer.destroyed) {
        const p = peer;
        peer = null;
        try {
          p.destroy();
        } catch (e) {
          /* ignore */
        }
      }
    });

    // вход по ссылке-приглашению
    const m = location.hash.match(/^#(join|offer|watch)=(.+)$/);
    if (m) setTimeout(() => (m[1] === 'offer' ? manualGuest(m[2]) : join(decodeURIComponent(m[2]), m[1] === 'watch')), 50);

    api.host = host;
    api.join = join;
    api.series = series;
    api.watchUrl = () => (myToken ? watchUrl() : '');
    return api;
  }

  // общие части для игр на компанию (sg/js/party.js)
  const util = { loadPeer, peerOptions, serverList, roomToken, parseToken, roomPeerId, code, baseUrl, dialog, closeDialog, linkBlock, bindLink, copy, REACTIONS };
  SG.net = { setup, ice: ICE, config: CONFIG, util };
})();
