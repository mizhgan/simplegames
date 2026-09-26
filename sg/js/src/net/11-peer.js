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

