/* SimpleGames — общие утилиты: тема, хранилище рекордов, свайпы. */
(() => {
  'use strict';

  const THEME_KEY = 'sg-theme';
  const root = document.documentElement;

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

  window.SG = { store, cssVar, currentTheme, formatTime, onSwipe, segmented, shuffle };

  const ready = () => {
    initThemeToggle();
    initBestBadges();
    document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
