#!/usr/bin/env python3
"""Собирает sw.js — service worker для офлайн-режима.

Запускайте после добавления или изменения файлов сайта:
    python3 tools/build-sw.py

Скрипт перечисляет все файлы сайта (кроме служебных) для предварительного кеширования
и вычисляет версию по их содержимому: при любом изменении браузеры скачают свежий кеш.
"""
import hashlib
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', 'tools', 'deploy', 'node_modules', '.github'}
SKIP_FILES = {'sw.js', 'README.md', '.htaccess', 'robots.txt', '.gitignore', '404.html'}
EXTS = {'.html', '.css', '.js', '.svg', '.png', '.webmanifest', '.json'}

files = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
    for name in sorted(filenames):
        rel = os.path.relpath(os.path.join(dirpath, name), ROOT).replace(os.sep, '/')
        if name in SKIP_FILES or os.path.splitext(name)[1] not in EXTS:
            continue
        files.append(rel)

digest = hashlib.sha256()
for rel in files:
    digest.update(rel.encode())
    with open(os.path.join(ROOT, rel), 'rb') as fh:
        digest.update(fh.read())
version = digest.hexdigest()[:12]

# корень сайта кешируем и как «./» — так открывается установленное приложение
precache = ['./'] + files

template = '''/* Service worker SimpleGames: офлайн-режим. Файл генерируется: python3 tools/build-sw.py */
const VERSION = '%s';
const CACHE = 'sg-' + VERSION;
const PRECACHE = %s;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sg-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function saveCopy(request, response) {
  if (response && response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // страницы: сначала сеть (чтобы видеть обновления), без сети — из кеша
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => saveCopy(request, response))
        .catch(() =>
          caches
            .match(request, { ignoreSearch: true })
            .then((cached) => cached || caches.match(new URL('index.html', self.registration.scope).href))
        )
    );
    return;
  }

  // остальное: сразу из кеша, а в фоне обновляем
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      const network = fetch(request)
        .then((response) => saveCopy(request, response))
        .catch(() => cached);
      return cached || network;
    })
  );
});
'''

with open(os.path.join(ROOT, 'sw.js'), 'w', encoding='utf-8') as fh:
    fh.write(template % (version, json.dumps(precache, ensure_ascii=False, indent=2).replace('\n', '\n')))
print('sw.js: %d файлов, версия %s' % (len(precache), version))
