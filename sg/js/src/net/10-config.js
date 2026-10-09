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

  // Сайт открыт из локальной сети (http://192.168.1.10/games/, http://имя-компьютера/ и т. п.) —
  // сервер знакомств и STUN/TURN ищем на том же компьютере (установка: deploy/peerjs-lan).
  // STUN/TURN там нужен: браузеры прячут свой адрес в сети за именем «….local», которое в локалке
  // находится не всегда, а через STUN браузер узнаёт настоящий адрес. Интернет для этого не нужен.
  const LAN_PORT = 9000;
  const LAN_TURN_PORT = 3478;
  const LAN = (() => {
    const h = location.hostname;
    if (/^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(h)) return true;
    // имя компьютера без точки или домашние зоны
    return !!h && !h.includes(':') && (!h.includes('.') || /\.(local|lan|home|internal|home\.arpa)$/.test(h));
  })();
  // что посоветовать, если сервер знакомств не ответил
  const serverHint = () => (LAN ? 'Проверьте, что на компьютере с сайтом запущен сервер знакомств (порт ' + LAN_PORT + ').' : 'Проверьте интернет.');
  if (LAN) {
    CONFIG.peerServer = { host: location.hostname, port: LAN_PORT, path: '/', secure: location.protocol === 'https:' };
    const turnHost = location.hostname + ':' + LAN_TURN_PORT;
    CONFIG.iceServers = [
      { urls: 'stun:' + turnHost },
      // логин и пароль — как в deploy/peerjs-lan/server.js
      { urls: 'turn:' + turnHost, username: 'simplegames', credential: 'simplegames' },
    ];
  }

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

