// Сервер знакомств PeerJS и STUN/TURN для игры по сети в локальной сети (ставится install.sh).
//
// STUN/TURN нужен потому, что Chrome и Firefox прячут адрес устройства в сети за случайным
// именем «….local», а найти его в локалке получается не всегда. Через STUN браузер узнаёт
// свой настоящий адрес, а если напрямую не соединиться (например, в гостевом Wi-Fi с изоляцией
// устройств), TURN пересылает ходы через этот компьютер.
'use strict';
const { PeerServer } = require('peer');
const Turn = require('node-turn');

const PEER_PORT = Number(process.env.PEER_PORT) || 9000;
const TURN_PORT = Number(process.env.TURN_PORT) || 3478;
// те же логин и пароль прописаны в сайте (sg/js/src/net/10-config.js) — сервер виден только в локальной сети
const TURN_USER = 'simplegames';
const TURN_PASS = 'simplegames';

PeerServer(
  { host: '0.0.0.0', port: PEER_PORT, path: '/', allow_discovery: true, alive_timeout: 60000, expire_timeout: 5000, concurrent_limit: 5000 },
  () => console.log('Сервер знакомств PeerJS: порт ' + PEER_PORT)
);

// адрес для пересылки node-turn берёт из сетевого интерфейса, на который пришёл запрос
const turn = new Turn({
  listeningPort: TURN_PORT,
  minPort: 49160,
  maxPort: 49200,
  authMech: 'long-term',
  realm: 'simplegames',
  credentials: { [TURN_USER]: TURN_PASS },
  debugLevel: 'ERROR',
});
turn.start();
console.log('STUN/TURN: порт ' + TURN_PORT + '/udp, пересылка 49160–49200/udp');

process.on('uncaughtException', (e) => console.error('Ошибка: ' + (e && e.stack ? e.stack : e)));
