#!/usr/bin/env bash
# Установка TURN-сервера coturn для игры по сети SimpleGames.
#
# Запуск на чистой VPS (Ubuntu 22.04+/Debian 12+), от root:
#   bash install.sh turn.example.com you@example.com
#
#   turn.example.com — домен, A-запись которого уже указывает на IP этой VPS (нужен для TLS на порту 443);
#   you@example.com  — почта для Let's Encrypt (необязательно).
# Без домена (bash install.sh) сервер заработает только на порту 3478, без TLS.
#
# В конце скрипт напечатает строку, которую нужно добавить в CONFIG.iceServers в sg/js/net.js.
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
USER_NAME="simplegames"
MIN_PORT=49160
MAX_PORT=49250

if [ "$(id -u)" -ne 0 ]; then
  echo "Запустите скрипт от root (через sudo)." >&2
  exit 1
fi

echo "==> Устанавливаем пакеты"
apt-get update -q
DEBIAN_FRONTEND=noninteractive apt-get install -y -q coturn curl openssl

# внешний IP можно задать вручную: PUBLIC_IP=1.2.3.4 bash install.sh ...
PUBLIC_IP="${PUBLIC_IP:-}"
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP="$(curl -fsS4 --max-time 10 https://api.ipify.org || curl -fsS4 --max-time 10 https://ifconfig.me || true)"
fi
if [ -z "$PUBLIC_IP" ]; then
  echo "Не удалось определить внешний IP. Укажите его вручную: PUBLIC_IP=1.2.3.4 bash install.sh ..." >&2
  exit 1
fi
echo "    внешний IP: $PUBLIC_IP"

# Многие облака дают VPS внутренний адрес, а внешний висит на шлюзе (NAT).
# Тогда coturn должен знать оба: external-ip=ВНЕШНИЙ/ВНУТРЕННИЙ.
LOCAL_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") print $(i + 1)}' | head -n1)"
EXTERNAL="$PUBLIC_IP"
if [ -n "$LOCAL_IP" ] && [ "$LOCAL_IP" != "$PUBLIC_IP" ]; then
  EXTERNAL="$PUBLIC_IP/$LOCAL_IP"
  echo "    VPS за NAT хостера: внутренний адрес $LOCAL_IP — пропишем external-ip=$EXTERNAL"
fi

# пароль сохраняем, чтобы повторный запуск скрипта не ломал уже настроенный сайт
PASS_FILE=/etc/coturn/simplegames.pass
install -d -m 755 /etc/coturn
if [ -s "$PASS_FILE" ]; then
  PASS="$(cat "$PASS_FILE")"
else
  PASS="$(openssl rand -hex 16)"
  umask 077
  printf '%s' "$PASS" > "$PASS_FILE"
fi

TLS_CONF=""
if [ -n "$DOMAIN" ]; then
  echo "==> Получаем сертификат Let's Encrypt для $DOMAIN (нужен свободный порт 80)"
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q certbot
  if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow 80/tcp >/dev/null; fi
  if [ -n "$EMAIL" ]; then
    certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --keep-until-expiring
  else
    certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring
  fi

  # coturn работает от пользователя turnserver и не может читать /etc/letsencrypt — копируем сертификат при каждом продлении
  HOOK=/etc/letsencrypt/renewal-hooks/deploy/coturn.sh
  cat > "$HOOK" <<EOF
#!/bin/sh
install -d -m 750 -o turnserver -g turnserver /etc/coturn/certs
install -m 640 -o turnserver -g turnserver /etc/letsencrypt/live/$DOMAIN/fullchain.pem /etc/coturn/certs/fullchain.pem
install -m 600 -o turnserver -g turnserver /etc/letsencrypt/live/$DOMAIN/privkey.pem /etc/coturn/certs/privkey.pem
systemctl restart coturn 2>/dev/null || true
EOF
  chmod +x "$HOOK"
  "$HOOK"

  TLS_CONF="tls-listening-port=443
cert=/etc/coturn/certs/fullchain.pem
pkey=/etc/coturn/certs/privkey.pem"

  # порт 443 меньше 1024 — разрешаем службе его занять
  install -d /etc/systemd/system/coturn.service.d
  cat > /etc/systemd/system/coturn.service.d/simplegames.conf <<'EOF'
[Service]
AmbientCapabilities=CAP_NET_BIND_SERVICE
EOF
  systemctl daemon-reload
fi

REALM="${DOMAIN:-$PUBLIC_IP}"

echo "==> Пишем /etc/turnserver.conf"
[ -f /etc/turnserver.conf ] && [ ! -f /etc/turnserver.conf.orig ] && cp /etc/turnserver.conf /etc/turnserver.conf.orig
cat > /etc/turnserver.conf <<EOF
# TURN-сервер для игры по сети SimpleGames (создан deploy/coturn/install.sh)
listening-port=3478
$TLS_CONF
external-ip=$EXTERNAL
min-port=$MIN_PORT
max-port=$MAX_PORT

lt-cred-mech
user=$USER_NAME:$PASS
realm=$REALM

fingerprint
no-cli
no-multicast-peers
no-tlsv1
no-tlsv1_1
log-file=syslog

# игре нужно мало трафика — ограничиваем, чтобы сервер не использовали для другого
# все игроки заходят под одним логином, поэтому ограничиваем общее число сессий, а не на пользователя
total-quota=500
user-quota=0
max-bps=64000
stale-nonce=600

# никакой пересылки во внутренние сети
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.0.0.0-192.0.0.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=198.18.0.0-198.19.255.255
denied-peer-ip=::1
denied-peer-ip=fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
denied-peer-ip=fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff
EOF
chmod 640 /etc/turnserver.conf
chown root:turnserver /etc/turnserver.conf

# в старых пакетах служба включается этим флагом
if [ -f /etc/default/coturn ]; then
  sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
fi

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  echo "==> Открываем порты в ufw"
  ufw allow 3478/udp >/dev/null
  ufw allow 3478/tcp >/dev/null
  [ -n "$DOMAIN" ] && ufw allow 443/tcp >/dev/null
  ufw allow "$MIN_PORT:$MAX_PORT/udp" >/dev/null
fi

echo "==> Запускаем coturn"
systemctl enable coturn >/dev/null 2>&1 || true
systemctl restart coturn
sleep 2
if ! systemctl is-active --quiet coturn; then
  echo "coturn не запустился. Посмотрите журнал: journalctl -u coturn -n 50" >&2
  exit 1
fi
ss -lntup 2>/dev/null | grep -E "turnserver" | sed 's/^/    /' || true

HOST="${DOMAIN:-$PUBLIC_IP}"
URLS="'turn:$HOST:3478', 'turn:$HOST:3478?transport=tcp'"
[ -n "$DOMAIN" ] && URLS="$URLS, 'turns:$DOMAIN:443?transport=tcp'"

cat <<EOF

============================================================
Готово! TURN-сервер работает.

Если у провайдера VPS есть свой файрвол (Security Groups и т. п.),
откройте там: 3478/udp, 3478/tcp$( [ -n "$DOMAIN" ] && printf ', 443/tcp, 80/tcp' ), $MIN_PORT-$MAX_PORT/udp.

Добавьте в CONFIG.iceServers в sg/js/net.js строку:

  { urls: [$URLS], username: '$USER_NAME', credential: '$PASS' },

Проверка: откройте на сайте страницу turn-test.html — она соединит два браузерных
канала только через этот TURN и покажет, на каком шаге сбой, если он есть.
============================================================
EOF
