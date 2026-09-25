#!/usr/bin/env bash
# Установка своего сервера знакомств PeerJS (peerjs-server) для игры по сети SimpleGames.
#
# Запуск на VPS от root (можно на той же, где стоит coturn):
#   bash install.sh [домен] [порт]
#
#   домен — по умолчанию берётся домен уже выпущенного сертификата Let's Encrypt
#           (например, turn.example.com от deploy/coturn/install.sh), так что новая DNS-запись не нужна;
#   порт  — по умолчанию 8443 (443 занят TURN по TLS).
#
# В конце скрипт напечатает строку для CONFIG.peerServer в sg/js/net.js.
set -euo pipefail

DOMAIN="${1:-}"
PORT="${2:-8443}"
PEER_VERSION="1.0.2"
NODE_VERSION="20.18.0"
APP_DIR=/opt/peerjs
CERT_DIR=/etc/peerjs

if [ "$(id -u)" -ne 0 ]; then
  echo "Запустите скрипт от root (через sudo)." >&2
  exit 1
fi

# ---------- домен и сертификат ----------

if [ -z "$DOMAIN" ]; then
  # берём единственный уже выпущенный сертификат (обычно от установки coturn)
  if [ -d /etc/letsencrypt/live ]; then
    DOMAIN="$(find /etc/letsencrypt/live -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | head -n1)"
  fi
  if [ -z "$DOMAIN" ]; then
    echo "Укажите домен: bash install.sh peer.example.com (его A-запись должна указывать на эту VPS)." >&2
    exit 1
  fi
  echo "==> Используем сертификат домена $DOMAIN"
fi

echo "==> Устанавливаем пакеты"
apt-get update -q
DEBIAN_FRONTEND=noninteractive apt-get install -y -q curl ca-certificates xz-utils

if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  echo "==> Получаем сертификат Let's Encrypt для $DOMAIN (нужен свободный порт 80)"
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q certbot
  if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow 80/tcp >/dev/null; fi
  certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring
fi

# ---------- Node.js ----------

NODE_BIN="$(command -v node || true)"
NODE_MAJOR=0
if [ -n "$NODE_BIN" ]; then
  NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
fi
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "==> Ставим Node.js $NODE_VERSION в /opt/node"
  case "$(uname -m)" in
    x86_64) ARCH=x64 ;;
    aarch64 | arm64) ARCH=arm64 ;;
    *) echo "Неподдерживаемая архитектура: $(uname -m)" >&2; exit 1 ;;
  esac
  TMP="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$ARCH.tar.xz" -o "$TMP/node.tar.xz"
  rm -rf /opt/node
  install -d /opt/node
  tar -xJf "$TMP/node.tar.xz" -C /opt/node --strip-components=1
  rm -rf "$TMP"
  NODE_BIN=/opt/node/bin/node
fi
NPM_BIN="$(dirname "$NODE_BIN")/npm"
echo "    Node.js: $("$NODE_BIN" --version)"

# ---------- peerjs-server ----------

echo "==> Ставим peer@$PEER_VERSION в $APP_DIR"
id peerjs >/dev/null 2>&1 || useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin peerjs
install -d -o peerjs -g peerjs "$APP_DIR"
cd "$APP_DIR"
[ -f package.json ] || printf '{ "name": "simplegames-peerjs", "private": true }\n' > package.json
PATH="$(dirname "$NODE_BIN"):$PATH" "$NPM_BIN" install --omit=dev --no-audit --no-fund "peer@$PEER_VERSION" >/dev/null
chown -R peerjs:peerjs "$APP_DIR"

# сервис работает от пользователя peerjs и не может читать /etc/letsencrypt — копируем сертификат при каждом продлении
HOOK=/etc/letsencrypt/renewal-hooks/deploy/peerjs.sh
cat > "$HOOK" <<EOF
#!/bin/sh
install -d -m 750 -o peerjs -g peerjs $CERT_DIR
install -m 640 -o peerjs -g peerjs /etc/letsencrypt/live/$DOMAIN/fullchain.pem $CERT_DIR/fullchain.pem
install -m 600 -o peerjs -g peerjs /etc/letsencrypt/live/$DOMAIN/privkey.pem $CERT_DIR/privkey.pem
systemctl restart peerjs 2>/dev/null || true
EOF
chmod +x "$HOOK"
"$HOOK"

echo "==> Настраиваем службу peerjs"
cat > /etc/systemd/system/peerjs.service <<EOF
[Unit]
Description=PeerJS server for SimpleGames online play
After=network-online.target
Wants=network-online.target

[Service]
User=peerjs
Group=peerjs
WorkingDirectory=$APP_DIR
ExecStart=$NODE_BIN $APP_DIR/node_modules/peer/dist/bin/peerjs.js --host 0.0.0.0 --port $PORT --path / --sslkey $CERT_DIR/privkey.pem --sslcert $CERT_DIR/fullchain.pem --alive_timeout 60000 --expire_timeout 5000 --concurrent_limit 5000 --allow_discovery
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable peerjs >/dev/null 2>&1 || true
systemctl restart peerjs

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  echo "==> Открываем порт $PORT/tcp в ufw"
  ufw allow "$PORT/tcp" >/dev/null
fi

echo "==> Проверяем"
OK=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 5 "https://$DOMAIN:$PORT/peerjs/id" >/dev/null 2>&1 || curl -fsSk --max-time 5 "https://127.0.0.1:$PORT/peerjs/id" >/dev/null 2>&1; then
    OK=1
    break
  fi
  sleep 1
done
if [ -z "$OK" ]; then
  echo "Сервер не отвечает. Посмотрите журнал: journalctl -u peerjs -n 50" >&2
  exit 1
fi

cat <<EOF

============================================================
Готово! Сервер знакомств работает: https://$DOMAIN:$PORT/

Если у провайдера VPS есть свой файрвол, откройте там порт $PORT/tcp.

Пропишите в sg/js/net.js (CONFIG.peerServer):

  peerServer: { host: '$DOMAIN', port: $PORT, path: '/', secure: true },

Проверка в браузере: https://$DOMAIN:$PORT/peerjs/id — должна вернуться случайная строка.
============================================================
EOF
