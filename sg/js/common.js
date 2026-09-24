/* SimpleGames — общие утилиты: тема, хранилище рекордов, свайпы. */
(() => {
  'use strict';

  const THEME_KEY = 'sg-theme';
  const root = document.documentElement;
  // адрес этого скрипта: от него считаем корень сайта (сайт может лежать и в подпапке)
  const SCRIPT_URL = document.currentScript ? document.currentScript.src : location.href;

  // Безопасная обёртка над localStorage: в приватном режиме он может быть недоступен.
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem('sg:' + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('sg:' + key, JSON.stringify(value));
      } catch (e) {
        /* хранилище недоступно — просто не сохраняем */
      }
    },
    remove(key) {
      try {
        localStorage.removeItem('sg:' + key);
      } catch (e) {
        /* ignore */
      }
    },
  };

  const cssVar = (name) => getComputedStyle(root).getPropertyValue(name).trim();

  const currentTheme = () =>
    root.dataset.theme ||
    (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

  const notifyTheme = () => document.dispatchEvent(new CustomEvent('sg:themechange'));

  const SUN =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  function initThemeToggle() {
    const btn = document.querySelector('[data-theme-toggle]');
    if (!btn) return;
    const render = () => {
      const dark = currentTheme() === 'dark';
      btn.innerHTML = dark ? SUN : MOON;
      btn.setAttribute('aria-label', dark ? 'Светлая тема' : 'Тёмная тема');
      btn.title = dark ? 'Светлая тема' : 'Тёмная тема';
    };
    render();
    btn.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {
        /* ignore */
      }
      render();
      notifyTheme();
    });
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (!root.dataset.theme) {
        render();
        notifyTheme();
      }
    });
  }

  // Рекорды на карточках главной страницы.
  function initBestBadges() {
    document.querySelectorAll('[data-best]').forEach((el) => {
      const value = store.get(el.dataset.best, null);
      if (value === null || value === 0) return;
      const shown = el.dataset.bestFormat === 'time' ? formatTime(value) : value;
      el.textContent = (el.dataset.bestLabel || 'Рекорд') + ': ' + shown + (el.dataset.bestSuffix || '');
    });
  }

  function formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }

  // Определение свайпа на элементе. cb получает 'up' | 'down' | 'left' | 'right'.
  function onSwipe(el, cb, threshold = 24) {
    let sx = null;
    let sy = null;
    el.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 1) return;
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
      },
      { passive: true }
    );
    el.addEventListener(
      'touchend',
      (e) => {
        if (sx === null) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - sx;
        const dy = t.clientY - sy;
        sx = sy = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
        if (Math.abs(dx) > Math.abs(dy)) cb(dx > 0 ? 'right' : 'left');
        else cb(dy > 0 ? 'down' : 'up');
      },
      { passive: true }
    );
  }

  // Сегментированный переключатель: [data-value] кнопки внутри .seg.
  function segmented(el, value, onChange) {
    const buttons = [...el.querySelectorAll('button[data-value]')];
    const set = (v) => buttons.forEach((b) => b.classList.toggle('active', b.dataset.value === v));
    set(value);
    buttons.forEach((b) =>
      b.addEventListener('click', () => {
        set(b.dataset.value);
        b.blur();
        onChange(b.dataset.value);
      })
    );
    return { set };
  }

  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // ---------- Звуки: синтезируются через Web Audio API, без аудиофайлов ----------

  const sound = (() => {
    let ctx = null;
    let master = null;
    let noiseBuf = null;
    let enabled = store.get('sound', false); // по умолчанию звук выключен
    const listeners = [];

    function ensure() {
      if (!enabled) return null;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.22;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    const semis = (base, n = 0) => base * Math.pow(2, n / 12);

    function tone({ freq = 440, to = 0, type = 'sine', dur = 0.1, vol = 0.5, delay = 0, attack = 0.005 }) {
      const t0 = ctx.currentTime + delay;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t0 + dur + 0.03);
    }

    function noise({ dur = 0.15, vol = 0.4, delay = 0, filter = 1500, q = 0.7 }) {
      if (!noiseBuf) {
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      const t0 = ctx.currentTime + delay;
      const src = ctx.createBufferSource();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      src.buffer = noiseBuf;
      f.type = 'lowpass';
      f.frequency.value = filter;
      f.Q.value = q;
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.03);
    }

    const arp = (notes, { type = 'triangle', step = 0.09, dur = 0.16, vol = 0.4 } = {}) =>
      notes.forEach((f, i) => tone({ freq: f, type, dur, vol, delay: i * step }));

    // p — сдвиг высоты в полутонах (например, для комбо)
    const PRESETS = {
      click: () => tone({ freq: 760, type: 'triangle', dur: 0.04, vol: 0.35 }),
      key: () => tone({ freq: 560, type: 'triangle', dur: 0.035, vol: 0.25 }),
      move: () => tone({ freq: 320, to: 230, dur: 0.07, vol: 0.35 }),
      slide: () => tone({ freq: 420, to: 300, type: 'triangle', dur: 0.06, vol: 0.3 }),
      tick: () => tone({ freq: 1100, type: 'square', dur: 0.018, vol: 0.08 }),
      rotate: () => tone({ freq: 620, to: 880, type: 'triangle', dur: 0.05, vol: 0.25 }),
      place: (p = 0) => tone({ freq: semis(440, p), type: 'triangle', dur: 0.09, vol: 0.45 }),
      drop: () => {
        tone({ freq: 220, to: 80, dur: 0.14, vol: 0.6 });
        noise({ dur: 0.05, vol: 0.15, filter: 2500 });
      },
      merge: (p = 0) => tone({ freq: semis(520, p), to: semis(780, p), dur: 0.09, vol: 0.4 }),
      eat: () => {
        tone({ freq: 880, type: 'square', dur: 0.05, vol: 0.15 });
        tone({ freq: 1320, type: 'square', dur: 0.08, vol: 0.15, delay: 0.05 });
      },
      coin: () => {
        tone({ freq: 988, type: 'square', dur: 0.06, vol: 0.14 });
        tone({ freq: 1319, type: 'square', dur: 0.14, vol: 0.14, delay: 0.06 });
      },
      flip: () => noise({ dur: 0.06, vol: 0.3, filter: 3200 }),
      card: () => noise({ dur: 0.045, vol: 0.28, filter: 4500, q: 1.5 }),
      match: () => arp([659, 988], { type: 'sine', step: 0.08, vol: 0.35 }),
      error: () => {
        tone({ freq: 196, type: 'sawtooth', dur: 0.12, vol: 0.14 });
        tone({ freq: 147, type: 'sawtooth', dur: 0.16, vol: 0.14, delay: 0.09 });
      },
      flag: () => tone({ freq: 1000, to: 1500, type: 'triangle', dur: 0.07, vol: 0.28 }),
      reveal: () => tone({ freq: 480, to: 960, dur: 0.12, vol: 0.3 }),
      explode: () => {
        noise({ dur: 0.7, vol: 0.9, filter: 700 });
        tone({ freq: 140, to: 35, dur: 0.5, vol: 0.6 });
      },
      bounce: () => tone({ freq: 460, type: 'square', dur: 0.035, vol: 0.14 }),
      brick: (p = 0) => tone({ freq: semis(660, p), type: 'square', dur: 0.05, vol: 0.14 }),
      line: (n = 1) => arp([523, 659, 784, 1047, 1319].slice(0, Math.min(5, n + 1)), { type: 'square', step: 0.06, vol: 0.14 }),
      jump: () => tone({ freq: 380, to: 820, type: 'square', dur: 0.11, vol: 0.13 }),
      flap: () => tone({ freq: 520, to: 760, dur: 0.07, vol: 0.28 }),
      hit: () => {
        noise({ dur: 0.22, vol: 0.55, filter: 1300 });
        tone({ freq: 220, to: 60, type: 'square', dur: 0.25, vol: 0.14 });
      },
      capture: () => {
        tone({ freq: 330, type: 'triangle', dur: 0.08, vol: 0.4 });
        tone({ freq: 660, to: 990, dur: 0.1, vol: 0.3, delay: 0.06 });
      },
      hint: () => arp([1047, 1319, 1568], { type: 'sine', step: 0.05, dur: 0.12, vol: 0.25 }),
      level: () => arp([523, 784, 1047], { type: 'square', step: 0.08, vol: 0.14 }),
      win: () => arp([523, 659, 784, 1047, 1319], { step: 0.1, dur: 0.22, vol: 0.4 }),
      lose: () => arp([392, 330, 262, 196], { type: 'triangle', step: 0.14, dur: 0.24, vol: 0.35 }),
      draw: () => arp([440, 440], { type: 'triangle', step: 0.15, vol: 0.3 }),
    };

    function play(name, arg) {
      if (!enabled || !PRESETS[name]) return;
      if (!ensure()) return;
      try {
        PRESETS[name](arg);
      } catch (e) {
        /* звук — не критичная часть игры */
      }
    }

    function setEnabled(v) {
      enabled = v;
      store.set('sound', v);
      if (v) play('click');
      listeners.forEach((fn) => fn(v));
    }

    // браузеры разрешают звук только после действия пользователя
    const unlock = () => {
      if (enabled) ensure();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    return {
      play,
      get enabled() {
        return enabled;
      },
      toggle: () => setEnabled(!enabled),
      onChange: (fn) => listeners.push(fn),
    };
  })();

  const SOUND_ON =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  const SOUND_OFF =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>';

  // Кнопка звука добавляется в шапку автоматически, рядом с переключателем темы
  function initSoundToggle() {
    const nav = document.querySelector('.header-nav');
    if (!nav) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn';
    btn.dataset.soundToggle = '';
    const render = (on) => {
      btn.innerHTML = on ? SOUND_ON : SOUND_OFF;
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', on ? 'Выключить звук' : 'Включить звук');
      btn.title = on ? 'Звук включён' : 'Звук выключен';
    };
    render(sound.enabled);
    sound.onChange(render);
    btn.addEventListener('click', () => {
      sound.toggle();
      btn.blur();
    });
    nav.insertBefore(btn, nav.firstChild);
  }

  window.SG = { store, cssVar, currentTheme, formatTime, onSwipe, segmented, shuffle, sound };

  // ---------- офлайн-режим и установка как приложения ----------

  function initOffline() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    const swUrl = new URL('../../sw.js', SCRIPT_URL);
    const scope = new URL('../../', SCRIPT_URL).pathname;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(swUrl.href, { scope }).catch(() => {
        /* без офлайн-режима сайт работает как обычно */
      });
    });

    const installBtn = document.querySelector('[data-install]');
    if (!installBtn) return;
    let deferred = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      installBtn.hidden = false;
    });
    installBtn.addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice.catch(() => null);
      deferred = null;
      installBtn.hidden = true;
    });
    window.addEventListener('appinstalled', () => (installBtn.hidden = true));
  }

  const ready = () => {
    initOffline();
    initSoundToggle();
    initThemeToggle();
    initBestBadges();
    document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
