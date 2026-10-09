#!/usr/bin/env bash
# Установка сервера знакомств PeerJS для игры по сети в локальной сети без интернета.
#
# Запускать от root на компьютере, где лежит сайт (Apache, nginx — неважно):
#   sudo bash install.sh [порт]
#
# Порт по умолчанию 9000 — именно его сайт ищет сам, когда открыт по адресу из локальной сети
# (http://192.168.1.10/games/ и т. п.). Другой порт придётся прописать в sg/js/net.js (LAN_PORT).
#
# Node.js и peerjs-server берутся из этой же папки (архив от prepare.sh). Если их тут нет,
# а интернет есть — скрипт скачает их сам.
set -euo pipefail

PORT="${1:-9000}"
NODE_VERSION="20.18.0"
PEER_VERSION="1.0.2"
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

echo "==> Копируем Node.js и peerjs-server в $APP_DIR"
install -d "$APP_DIR"
if [ -x "$HERE/node/bin/node" ] && [ -d "$HERE/app/node_modules/peer" ]; then
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
  (cd "$APP_DIR/app" && PATH="$APP_DIR/node/bin:$PATH" "$APP_DIR/node/bin/npm" install --omit=dev --no-audit --no-fund "peer@$PEER_VERSION" >/dev/null)
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
Description=PeerJS server for SimpleGames (local network)
After=network.target

[Service]
User=peerjs
Group=peerjs
WorkingDirectory=$APP_DIR/app
ExecStart=$APP_DIR/node/bin/node $APP_DIR/app/node_modules/peer/dist/bin/peerjs.js --host 0.0.0.0 --port $PORT --path / --alive_timeout 60000 --expire_timeout 5000 --concurrent_limit 5000 --allow_discovery
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
  echo "==> Открываем порт $PORT/tcp в ufw"
  ufw allow "$PORT/tcp" >/dev/null
elif command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
  echo "==> Открываем порт $PORT/tcp в firewalld"
  firewall-cmd --permanent --add-port="$PORT/tcp" >/dev/null && firewall-cmd --reload >/dev/null
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
echo "Готово! Сервер знакомств работает на порту $PORT."
echo
echo "Откройте сайт с других устройств по адресу этого компьютера, например:"
for ip in $IPS; do echo "  http://$ip/games/"; done
echo
echo "Игра по сети подключится к серверу сама — ничего настраивать на сайте не нужно."
echo "Проверка: http://<адрес>:$PORT/peerjs/id — должна вернуться случайная строка."
if [ "$PORT" != 9000 ]; then
  echo
  echo "Порт не 9000: поменяйте LAN_PORT в sg/js/net.js на $PORT."
fi
echo "============================================================"
