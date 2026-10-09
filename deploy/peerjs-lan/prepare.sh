#!/usr/bin/env bash
# Сборка комплекта сервера знакомств PeerJS для локальной сети БЕЗ интернета.
#
# Запустите на любом Linux-компьютере С интернетом (root не нужен):
#   bash prepare.sh [x64|arm64]
#
#   x64   — обычный компьютер (по умолчанию), arm64 — Raspberry Pi 4/5 и т. п. с 64-битной системой.
#
# Получится архив peerjs-lan-<arch>.tar.gz: в нём Node.js, сервер знакомств PeerJS, STUN/TURN (node-turn) и install.sh.
# Перенесите его (например, на флешке) на компьютер в локальной сети, где лежит сайт, и там:
#   tar -xzf peerjs-lan-x64.tar.gz && cd peerjs-lan && sudo bash install.sh
set -euo pipefail

ARCH="${1:-x64}"
case "$ARCH" in
  x64 | arm64) ;;
  *) echo "Архитектура: x64 или arm64" >&2; exit 1 ;;
esac
NODE_VERSION="20.18.0"
PEER_VERSION="1.0.2"
TURN_VERSION="0.0.6"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
OUT="$WORK/peerjs-lan"
trap 'rm -rf "$WORK"' EXIT

echo "==> Скачиваем Node.js $NODE_VERSION ($ARCH)"
mkdir -p "$OUT/node" "$OUT/app"
curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$ARCH.tar.xz" | tar -xJ -C "$OUT/node" --strip-components=1

echo "==> Ставим peer@$PEER_VERSION и node-turn@$TURN_VERSION"
# npm и node берём из скачанного архива; на машине сборки нужна та же архитектура, иначе ставим через свой npm
NPM="$OUT/node/bin/npm"
if ! "$OUT/node/bin/node" --version >/dev/null 2>&1; then
  NPM="$(command -v npm || true)"
  if [ -z "$NPM" ]; then
    echo "Скачанный Node.js не запускается на этой машине (другая архитектура), а своего npm нет." >&2
    echo "Соберите комплект на компьютере той же архитектуры или установите npm." >&2
    exit 1
  fi
fi
printf '{ "name": "simplegames-peerjs-lan", "private": true }\n' > "$OUT/app/package.json"
(cd "$OUT/app" && PATH="$OUT/node/bin:$PATH" "$NPM" install --omit=dev --no-audit --no-fund "peer@$PEER_VERSION" "node-turn@$TURN_VERSION" >/dev/null)
cp "$HERE/server.js" "$OUT/app/server.js"

cp "$HERE/install.sh" "$HERE/README.md" "$OUT/"
tar -czf "$HERE/peerjs-lan-$ARCH.tar.gz" -C "$WORK" peerjs-lan
echo
echo "Готово: $HERE/peerjs-lan-$ARCH.tar.gz ($(du -h "$HERE/peerjs-lan-$ARCH.tar.gz" | cut -f1))"
echo "Перенесите архив на компьютер с сайтом и выполните там:"
echo "  tar -xzf peerjs-lan-$ARCH.tar.gz && cd peerjs-lan && sudo bash install.sh"
