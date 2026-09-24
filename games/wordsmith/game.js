/* Слова из слова */
(() => {
  'use strict';

  // ---------- словари ----------

  const DICT = [];
  (() => {
    const digits = '0123456789abcdefghijklmnopqrstuvwxyz';
    let prev = '';
    window.BALDA_DICT_PACKED.split(' ').forEach((token) => {
      const w = prev.slice(0, digits.indexOf(token[0])) + token.slice(1);
      DICT.push(w);
      prev = w;
    });
  })();
  const COMMON = new Set(window.BALDA_AI);
  // исходные слова: частотные, длинные, с достаточным количеством вложенных слов
  const BASES = window.BALDA_AI.filter((w) => w.length >= 8 && new Set(w).size >= 6);

  const $ = (id) => document.getElementById(id);
  const tilesEl = $('tiles');
  const inputEl = $('input');
  const statusEl = $('status');
  const listEl = $('found');

  let base, all, found, picked;

  const counts = (w) => {
    const m = {};
    for (const ch of w) m[ch] = (m[ch] || 0) + 1;
    return m;
  };

  function subwords(b) {
    const have = counts(b);
    return DICT.filter((w) => {
      if (w.length < 3 || w.length >= b.length || w === b) return false;
      const need = {};
      for (const ch of w) {
        need[ch] = (need[ch] || 0) + 1;
        if (need[ch] > (have[ch] || 0)) return false;
      }
      return true;
    });
  }

  // ---------- отрисовка ----------

  function render() {
    tilesEl.innerHTML = [...base]
      .map((ch, i) => `<button type="button" class="ws-tile ${picked.includes(i) ? 'used' : ''}" data-i="${i}">${ch}</button>`)
      .join('');
    inputEl.textContent = picked.map((i) => base[i]).join('').toUpperCase() || ' ';
    const common = all.filter((w) => COMMON.has(w)).length;
    $('count').textContent = found.length + ' / ' + all.length;
    $('score').textContent = found.reduce((s, w) => s + w.length, 0);
    $('goal').textContent = 'Цель — найти хотя бы ' + Math.max(5, Math.ceil(common * 0.6)) + ' слов (в словаре ' + all.length + ', из них ' + common + ' распространённых).';
    const byLen = {};
    found.slice().sort().forEach((w) => (byLen[w.length] = byLen[w.length] || []).push(w));
    listEl.innerHTML = Object.keys(byLen)
      .sort((a, b) => b - a)
      .map((L) => `<div class="ws-group"><b>${L} букв</b>${byLen[L].map((w) => `<span>${w}</span>`).join('')}</div>`)
      .join('');
  }

  // ---------- ввод ----------

  function pick(i) {
    if (picked.includes(i)) return;
    picked.push(i);
    SG.sound.play('key');
    render();
  }

  function backspace() {
    picked.pop();
    render();
  }

  function submit() {
    const w = picked.map((i) => base[i]).join('');
    picked = [];
    let msg;
    if (w.length < 3) msg = 'Нужно хотя бы 3 буквы.';
    else if (found.includes(w)) msg = 'Слово «' + w + '» уже найдено.';
    else if (!all.includes(w)) msg = 'Слова «' + w + '» нет в словаре.';
    if (msg) {
      statusEl.textContent = msg;
      SG.sound.play('error');
      inputEl.classList.remove('shake');
      void inputEl.offsetWidth;
      inputEl.classList.add('shake');
      render();
      return;
    }
    found.push(w);
    statusEl.textContent = '+' + w.length + ' — «' + w + '»';
    SG.sound.play('match');
    SG.store.set('wordsmith-words', SG.store.get('wordsmith-words', 0) + 1);
    const best = SG.store.get('wordsmith-best', 0);
    if (found.length > best) SG.store.set('wordsmith-best', found.length);
    save();
    render();
  }

  function hint() {
    const left = all.filter((w) => !found.includes(w) && COMMON.has(w));
    const pool = left.length ? left : all.filter((w) => !found.includes(w));
    if (!pool.length) return;
    const w = pool[Math.floor(Math.random() * pool.length)];
    statusEl.textContent = 'Подсказка: слово из ' + w.length + ' букв, начинается на «' + w[0].toUpperCase() + '».';
    SG.sound.play('hint');
  }

  function reveal() {
    statusEl.textContent = '';
    listEl.innerHTML += `<div class="ws-group missed"><b>Не найдены</b>${all
      .filter((w) => !found.includes(w))
      .map((w) => `<span>${w}</span>`)
      .join('')}</div>`;
  }

  function save() {
    SG.store.set('wordsmith-state', { base, found });
  }

  function load(b, f) {
    base = b;
    all = subwords(base);
    found = f || [];
    picked = [];
    statusEl.textContent = 'Составляйте слова из букв слова «' + base.toUpperCase() + '».';
    save();
    render();
  }

  function newWord() {
    let b;
    let n = 0;
    do {
      b = BASES[Math.floor(Math.random() * BASES.length)];
      n = subwords(b).length;
    } while (n < 25);
    load(b);
  }

  tilesEl.addEventListener('click', (e) => {
    const t = e.target.closest('.ws-tile');
    if (t) pick(Number(t.dataset.i));
  });
  $('submit-btn').addEventListener('click', submit);
  $('back-btn').addEventListener('click', backspace);
  $('clear-btn').addEventListener('click', () => {
    picked = [];
    render();
  });
  $('hint-btn').addEventListener('click', hint);
  $('reveal-btn').addEventListener('click', reveal);
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newWord();
  });
  $('shuffle-btn').addEventListener('click', () => {
    // перемешиваем буквы для свежего взгляда
    base = SG.shuffle([...base]).join('');
    picked = [];
    save();
    render();
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') return submit();
    if (e.key === 'Backspace') {
      e.preventDefault();
      return backspace();
    }
    const k = e.key.toLowerCase().replace('ё', 'е');
    if (!/^[а-я]$/.test(k)) return;
    // берём первую свободную плитку с такой буквой
    const i = [...base].findIndex((ch, j) => ch === k && !picked.includes(j));
    if (i >= 0) pick(i);
  });

  const saved = SG.store.get('wordsmith-state', null);
  if (saved && saved.base && Array.isArray(saved.found)) load(saved.base, saved.found);
  else newWord();
})();
