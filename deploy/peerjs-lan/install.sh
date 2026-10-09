#!/usr/bin/env bash
# Установка сервера знакомств PeerJS и STUN/TURN для игры по сети в локальной сети без интернета.
#
# Запускать от root на компьютере, где лежит сайт (Apache, nginx — неважно):
#   sudo bash install.sh
#
# Порты: 9000/tcp — сервер знакомств, 3478/udp — STUN/TURN, 49160–49200/udp — пересылка TURN.
# Именно их сайт ищет сам, когда открыт по адресу из локальной сети (http://192.168.1.10/games/ и т. п.).
#
# Node.js и серверы берутся из этой же папки (архив от prepare.sh). Если их тут нет,
# а интернет есть — скрипт скачает их сам. Повторный запуск обновляет установку.
set -euo pipefail

PORT=9000
TURN_PORT=3478
NODE_VERSION="20.18.0"
PEER_VERSION="1.0.2"
TURN_VERSION="0.0.6"
APP_DIR=/opt/peerjs-lan
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Запустите скрипт от root (через sudo)." >&2
  exit 1
fi
if ! command -v systemctl >/dev/null; then
  echo "Нужен Linux с systemd." >&2
  exit 1
fi

echo "==> Копируем Node.js и серверы в $APP_DIR"
install -d "$APP_DIR"
if [ -x "$HERE/node/bin/node" ] && [ -d "$HERE/app/node_modules/peer" ] && [ -d "$HERE/app/node_modules/node-turn" ]; then
  rm -rf "$APP_DIR/node" "$APP_DIR/app"
  cp -a "$HERE/node" "$HERE/app" "$APP_DIR/"
else
  echo "    В папке нет готового комплекта — скачиваем (нужен интернет)"
  case "$(uname -m)" in
    x86_64) ARCH=x64 ;;
    aarch64 | arm64) ARCH=arm64 ;;
    *) echo "Неподдерживаемая архитектура: $(uname -m)" >&2; exit 1 ;;
  esac
  rm -rf "$APP_DIR/node" "$APP_DIR/app"
  install -d "$APP_DIR/node" "$APP_DIR/app"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$ARCH.tar.xz" | tar -xJ -C "$APP_DIR/node" --strip-components=1
  printf '{ "name": "simplegames-peerjs-lan", "private": true }\n' > "$APP_DIR/app/package.json"
  (cd "$APP_DIR/app" && PATH="$APP_DIR/node/bin:$PATH" "$APP_DIR/node/bin/npm" install --omit=dev --no-audit --no-fund "peer@$PEER_VERSION" "node-turn@$TURN_VERSION" >/dev/null)
fi
# скрипт запуска лежит рядом с install.sh (в архиве — ещё и в app/)
[ -f "$HERE/server.js" ] && cp "$HERE/server.js" "$APP_DIR/app/server.js"
if [ ! -f "$APP_DIR/app/server.js" ]; then
  echo "Не найден server.js — запускайте install.sh из папки deploy/peerjs-lan или из распакованного архива." >&2
  exit 1
fi
if ! "$APP_DIR/node/bin/node" --version >/dev/null 2>&1; then
  echo "Node.js из комплекта не запускается на этом компьютере — соберите комплект для $(uname -m) (bash prepare.sh arm64 / x64)." >&2
  exit 1
fi
echo "    Node.js: $("$APP_DIR/node/bin/node" --version)"

id peerjs >/dev/null 2>&1 || useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin peerjs
chown -R peerjs:peerjs "$APP_DIR"

echo "==> Настраиваем службу peerjs-lan"
cat > /etc/systemd/system/peerjs-lan.service <<UNIT
[Unit]
Description=PeerJS + STUN/TURN for SimpleGames (local network)
After=network-online.target
Wants=network-online.target

[Service]
User=peerjs
Group=peerjs
WorkingDirectory=$APP_DIR/app
Environment=PEER_PORT=$PORT TURN_PORT=$TURN_PORT
ExecStart=$APP_DIR/node/bin/node $APP_DIR/app/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable peerjs-lan >/dev/null 2>&1 || true
systemctl restart peerjs-lan

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  echo "==> Открываем порты в ufw"
  ufw allow "$PORT/tcp" >/dev/null
  ufw allow "$TURN_PORT/udp" >/dev/null
  ufw allow 49160:49200/udp >/dev/null
elif command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
  echo "==> Открываем порты в firewalld"
  firewall-cmd --permanent --add-port="$PORT/tcp" --add-port="$TURN_PORT/udp" --add-port=49160-49200/udp >/dev/null && firewall-cmd --reload >/dev/null
fi

echo "==> Проверяем"
OK=""
for _ in $(seq 1 15); do
  if "$APP_DIR/node/bin/node" -e "require('http').get('http://127.0.0.1:$PORT/peerjs/id',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"; then
    OK=1
    break
  fi
  sleep 1
done
if [ -z "$OK" ]; then
  echo "Сервер не отвечает. Посмотрите журнал: journalctl -u peerjs-lan -n 50" >&2
  exit 1
fi

IPS="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.' || true)"
echo
echo "============================================================"
echo "Готово! Сервер знакомств работает на порту $PORT, STUN/TURN — на $TURN_PORT/udp."
echo
echo "Откройте сайт с других устройств по адресу этого компьютера, например:"
for ip in $IPS; do echo "  http://$ip/games/"; done
echo
echo "Игра по сети подключится к серверу сама — ничего настраивать на сайте не нужно."
echo "Проверка: http://<адрес>:$PORT/peerjs/id — должна вернуться случайная строка."
echo
echo "Если IP-адрес этого компьютера поменяется, перезапустите службу: systemctl restart peerjs-lan"
echo "============================================================"
