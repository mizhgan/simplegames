#!/usr/bin/env node
/* Автотесты SimpleGames.

     node tests/run.js                        всё
     node tests/run.js --suite=pages,duel     только выбранные наборы: data, pages, duel, party, rt
     node tests/run.js --games=magnat,uno     только эти игры
     node tests/run.js --jobs=6               сколько вкладок браузера открывать параллельно

   Наборы:
     data   — словарь «Балды» распаковывается, в нём есть обычные слова, список компьютера — подмножество словаря;
     pages  — каждая страница на ПК и телефоне: без ошибок JS и в консоли, без битых файлов,
              без горизонтальной прокрутки на телефоне;
     duel   — игры на двоих (sg/js/duel.js): компьютер играет сам с собой, каждый ход проверяется правилами;
     party  — игры на компанию (sg/js/party.js): боты играют партию целиком;
     rt     — игры в реальном времени (sg/js/rt.js): два компьютерных игрока гоняют физику,
              плюс запуск партии на странице.

   Нужен Playwright: cd tests && npm install && npx playwright install chromium */
'use strict';

const fs = require('fs');
const path = require('path');
const { start, ROOT } = require('./server');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('Не найден playwright. Установите: cd tests && npm install && npx playwright install chromium');
  process.exit(2);
}

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const SUITES = (args.suite || 'data,pages,duel,party,rt').split(',');
const ONLY = args.games ? new Set(args.games.split(',')) : null;
const JOBS = +args.jobs || 4;

const VIEWPORTS = [
  { tag: 'ПК', width: 1280, height: 900 },
  { tag: 'телефон', width: 390, height: 844 },
];

const games = fs
  .readdirSync(path.join(ROOT, 'games'))
  .filter((id) => fs.existsSync(path.join(ROOT, 'games', id, 'meta.json')))
  .filter((id) => !ONLY || ONLY.has(id))
  .sort();

const failures = [];
const notes = [];
const fail = (suite, what, msg) => failures.push(`[${suite}] ${what}: ${msg}`);

// выполняет задачи по очереди в нескольких «потоках»
async function pool(items, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(JOBS, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    })
  );
}

// новая вкладка, которая собирает ошибки страницы
async function openPage(browser, url, viewport = VIEWPORTS[0]) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('ошибка JS: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('консоль: ' + m.text()));
  page.on('response', (r) => r.status() >= 400 && errors.push(r.status() + ' ' + r.url().replace(/^https?:\/\/[^/]+/, '')));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('sg:party-name', '"Тест"');
    } catch (e) {
      /* нет хранилища */
    }
  });
  await page.goto(url, { waitUntil: 'load' });
  return { page, context, errors };
}

// ---------- data ----------

function suiteData() {
  global.window = {};
  require(path.join(ROOT, 'sg/data/balda-dict.js'));
  const digits = '0123456789abcdefghijklmnopqrstuvwxyz';
  const dict = new Set();
  let prev = '';
  window.BALDA_DICT_PACKED.split(' ').forEach((t) => {
    const w = prev.slice(0, digits.indexOf(t[0])) + t.slice(1);
    dict.add(w);
    prev = w;
  });
  if (dict.size < 40000) fail('data', 'словарь', 'слишком мало слов: ' + dict.size);
  for (const w of ['кот', 'дом', 'кино', 'метро', 'кофе', 'часы', 'ножницы', 'сани']) if (!dict.has(w)) fail('data', 'словарь', 'нет слова «' + w + '»');
  const bad = [...dict].filter((w) => !/^[а-я]+$/.test(w));
  if (bad.length) fail('data', 'словарь', 'слова не из строчных русских букв: ' + bad.slice(0, 5).join(', '));
  const outside = window.BALDA_AI.filter((w) => !dict.has(w));
  if (outside.length) fail('data', 'слова компьютера', 'нет в словаре: ' + outside.slice(0, 5).join(', '));
  console.log(`data: словарь ${dict.size} слов, у компьютера ${window.BALDA_AI.length}`);
}

// ---------- pages ----------

async function suitePages(browser, base) {
  const pages = [...(ONLY ? [] : ['index.html', 'achievements.html', '404.html']), ...games.map((id) => `games/${id}/index.html`)];
  const jobs = [];
  pages.forEach((p) => VIEWPORTS.forEach((v) => jobs.push([p, v])));
  let done = 0;
  await pool(jobs, async ([p, v]) => {
    const { page, context, errors } = await openPage(browser, base + p, v);
    await page.waitForTimeout(400);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    // у 404.html пути от корня сайта, а сама она по адресу /404.html отдаётся с кодом 200 — ошибки 404 там только от проверки
    errors.forEach((e) => fail('pages', `${p} (${v.tag})`, e));
    if (wide > 1) fail('pages', `${p} (${v.tag})`, `горизонтальная прокрутка: страница шире экрана на ${wide}px`);
    await context.close();
    done++;
  });
  console.log(`pages: проверено ${done} страниц (${pages.length} × ${VIEWPORTS.length} экрана)`);
}

// ---------- duel ----------

async function suiteDuel(browser, base) {
  let played = 0;
  await pool(games, async (id) => {
    const { page, context, errors } = await openPage(browser, `${base}games/${id}/index.html`);
    const has = await page.evaluate(() => !!window.__duel);
    if (!has) return context.close();
    const r = await page.evaluate(async () => {
      const c = window.__duel.cfg;
      const res = { moves: 0, over: null, error: null };
      const t0 = Date.now();
      try {
        const s = c.create(12345);
        while (res.moves < 400 && Date.now() - t0 < 25000) {
          const o = c.over(s);
          if (o) {
            res.over = o.text || 'конец';
            break;
          }
          const m = await c.ai(s, 'easy', s.turn);
          if (m === null || m === undefined) {
            res.error = 'компьютер не нашёл хода в незаконченной партии';
            break;
          }
          if (c.legal && !c.legal(s, m)) {
            res.error = 'компьютер сделал недопустимый ход: ' + JSON.stringify(m).slice(0, 80);
            break;
          }
          c.apply(s, m);
          res.moves++;
        }
      } catch (e) {
        res.error = 'исключение: ' + (e && e.stack ? e.stack.split('\n').slice(0, 2).join(' ') : e);
      }
      return res;
    });
    errors.forEach((e) => fail('duel', id, e));
    if (r.error) fail('duel', id, r.error + ` (после ${r.moves} ходов)`);
    else if (!r.over) notes.push(`duel ${id}: партия не закончилась за ${r.moves} ходов (это не ошибка)`);
    played++;
    await context.close();
  });
  console.log(`duel: сыграно ${played} игр`);
}

// ---------- party ----------

async function suiteParty(browser, base) {
  let played = 0;
  await pool(games, async (id) => {
    const { page, context, errors } = await openPage(browser, `${base}games/${id}/index.html`);
    const has = await page.evaluate(() => !!window.__party);
    if (!has) return context.close();
    const r = await page.evaluate(() => {
      const c = window.__party.cfg;
      if (!c.ai) return { skip: 'нет ботов' };
      const n = Math.max(c.min || 2, Math.min(c.max || 4, 4));
      const players = Array.from({ length: n }, (_, i) => ({ id: i, name: 'Бот ' + i, bot: true }));
      const res = { steps: 0, acts: 0, over: false, error: null };
      try {
        const s = c.create(players, c.options ? c.options.read(document.createElement('div')) : {});
        let now = Date.now();
        while (res.steps < 20000) {
          res.steps++;
          now += 250;
          if (c.tick) c.tick(s, now);
          for (const p of players) {
            const a = c.ai(s, p.id, 'normal');
            if (a !== null && a !== undefined && c.act(s, p.id, a, now)) res.acts++;
          }
          // вид для каждого игрока должен строиться без ошибок
          if (res.steps % 50 === 0) players.forEach((p) => c.view(s, p.id));
          if (c.view(s, -1).over) {
            res.over = true;
            break;
          }
        }
      } catch (e) {
        res.error = 'исключение: ' + (e && e.stack ? e.stack.split('\n').slice(0, 2).join(' ') : e);
      }
      return res;
    });
    errors.forEach((e) => fail('party', id, e));
    await context.close();
    // партия с ботами на экране телефона: стол виден только после старта, поэтому проверяем его отдельно
    if (!r.skip) {
      const m = await openPage(browser, `${base}games/${id}/index.html`, VIEWPORTS[1]);
      const solo = await m.page.$('[data-solo]');
      if (solo) {
        await solo.click();
        await m.page.waitForTimeout(300);
        const go = await m.page.$('[data-start]');
        if (go && (await go.isEnabled())) await go.click();
        await m.page.waitForTimeout(3000);
        const mode = await m.page.evaluate(() => window.__party.mode);
        if (mode !== 'play') fail('party', `${id} (телефон)`, `партия с ботами не началась, режим «${mode}»`);
        const wide = await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (wide > 1) fail('party', `${id} (телефон)`, `горизонтальная прокрутка во время партии: шире экрана на ${wide}px`);
      } else notes.push(`party ${id}: нет кнопки игры с ботами`);
      m.errors.forEach((e) => fail('party', `${id} (телефон)`, e));
      await m.context.close();
    }
    if (r.skip) notes.push(`party ${id}: ${r.skip} — только проверка страницы`);
    else if (r.error) fail('party', id, r.error + ` (шаг ${r.steps})`);
    else if (!r.over) fail('party', id, `боты не доиграли партию за ${r.steps} шагов (${r.acts} действий)`);
    played++;
  });
  console.log(`party: проверено ${played} игр`);
}

// ---------- rt ----------

async function suiteRt(browser, base) {
  let played = 0;
  await pool(games, async (id) => {
    const { page, context, errors } = await openPage(browser, `${base}games/${id}/index.html`);
    const has = await page.evaluate(() => !!window.__rt);
    if (!has) return context.close();
    const r = await page.evaluate(() => {
      const c = window.__rt.cfg;
      const blank = { u: false, d: false, l: false, r: false, f: false, px: null, py: null };
      const res = { steps: 0, over: null, error: null };
      try {
        const s = c.create('normal');
        // до 3 минут игрового времени
        while (res.steps < 60 * 180) {
          const inputs = [0, 1].map((side) => Object.assign({}, blank, c.ai ? c.ai(s, side, 'normal') || {} : {}));
          c.step(s, inputs, 1 / 60, () => {});
          res.steps++;
          const o = c.over(s);
          if (o) {
            res.over = o.text || 'конец';
            break;
          }
        }
      } catch (e) {
        res.error = 'исключение: ' + (e && e.stack ? e.stack.split('\n').slice(0, 2).join(' ') : e);
      }
      return res;
    });
    if (r.error) fail('rt', id, r.error + ` (кадр ${r.steps})`);
    else if (!r.over) notes.push(`rt ${id}: за 3 минуты игрового времени партия не закончилась (это не ошибка)`);
    // запуск партии на странице: отсчёт и пара секунд игры без ошибок
    const btn = await page.$('#start-btn');
    if (btn && (await btn.isVisible())) {
      await btn.click();
      await page.waitForTimeout(4000);
      const phase = await page.evaluate(() => window.__rt.phase);
      if (!['run', 'count', 'over'].includes(phase)) notes.push(`rt ${id}: после «Старт» фаза «${phase}»`);
    }
    errors.forEach((e) => fail('rt', id, e));
    played++;
    await context.close();
  });
  console.log(`rt: проверено ${played} игр`);
}

// ---------- запуск ----------

(async () => {
  const t0 = Date.now();
  const server = await start();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  try {
    if (SUITES.includes('data')) suiteData();
    if (SUITES.includes('pages')) await suitePages(browser, base);
    if (SUITES.includes('duel')) await suiteDuel(browser, base);
    if (SUITES.includes('party')) await suiteParty(browser, base);
    if (SUITES.includes('rt')) await suiteRt(browser, base);
  } finally {
    await browser.close();
    server.close();
  }
  if (notes.length) console.log('\nЗаметки:\n  ' + notes.join('\n  '));
  const secs = Math.round((Date.now() - t0) / 1000);
  if (failures.length) {
    console.log(`\n✗ Ошибок: ${failures.length} (${secs} с)\n  ` + failures.join('\n  '));
    process.exit(1);
  }
  console.log(`\n✓ Всё в порядке (${secs} с)`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
