/* Service worker SimpleGames: офлайн-режим. Файл генерируется: python3 tools/build.py */
const VERSION = '%VERSION%';
const CACHE = 'sg-' + VERSION;
const PRECACHE = %PRECACHE%;

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

  // код (скрипты, стили, данные): сначала сеть — иначе после обновления сайта страница
  // получила бы из кеша старый код вперемешку с новым; без сети — из кеша
  if (/\.(js|css|json)$/.test(new URL(request.url).pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => saveCopy(request, response))
        .catch(() => caches.match(request, { ignoreSearch: true }))
    );
    return;
  }

  // остальное (картинки, шрифты, звуки): сразу из кеша, а в фоне обновляем
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      const network = fetch(request)
        .then((response) => saveCopy(request, response))
        .catch(() => cached);
      return cached || network;
    })
  );
});
