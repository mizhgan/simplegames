/* Турнир: компания играет матчи один на один в любой из игр сайта — олимпийская сетка или круговой турнир */
(() => {
  'use strict';

  const esc = SG.party.esc;
  // игры, где есть партия вдвоём по сети
  const GAMES = [["uttt", "Ultimate крестики-нолики"], ["abalone", "Абалон"], ["artillery", "Артиллерия"], ["airhockey", "Аэрохоккей"], ["balda", "Балда"], ["billiards", "Бильярд"], ["blokus", "Блокус"], ["bomber", "Бомбермен-дуэль"], ["bulls", "Быки и коровы"], ["hangduel", "Виселица вдвоём"], ["dogfight", "Воздушный бой"], ["hex", "Гекс"], ["go", "Го 9×9"], ["gomoku", "Гомоку"], ["racing", "Гонки"], ["cities", "Города"], ["domino", "Домино"], ["durak", "Дурак"], ["wordduel", "Дуэль в Вордли"], ["snakeduel", "Змейки-дуэль"], ["quarto", "Кватро"], ["ur", "Королевская игра Ура"], ["backgammon", "Короткие нарды"], ["tictactoe", "Крестики-нолики"], ["crossduel", "Кросс-ворд батл"], ["curling", "Кёрлинг"], ["blindmaze", "Лабиринт вслепую"], ["lotto", "Лото"], ["mancala", "Манкала"], ["mill", "Мельница"], ["minigolf", "Мини-гольф"], ["soccer", "Мини-футбол"], ["battleship", "Морской бой"], ["nardy", "Нарды"], ["pingpong", "Настольный теннис"], ["pentago", "Пентаго"], ["pinball", "Пинбол-дуэль"], ["yahtzee", "Покер на костях"], ["holdem", "Покер: холдем"], ["pong", "Понг"], ["war", "Пьяница"], ["reaction", "Реакция"], ["reversi", "Реверси"], ["pig", "Свинья"], ["seka", "Сека"], ["wordrace", "Слова из слова: дуэль"], ["stratego", "Стратего"], ["sumo", "Сумо"], ["tankduel", "Танчики вдвоём"], ["tetrisduel", "Тетрис-баттл"], ["dots", "Точки и квадраты"], ["capture", "Точки: захват"], ["tron", "Трон"], ["thousand", "Тысяча"], ["ugolki", "Уголки"], ["hasami", "Хасами-сёги"], ["worms", "Червячки"], ["connect4", "Четыре в ряд"], ["chess", "Шахматы"], ["checkers", "Шашки"], ["erudit", "Эрудит"]];
  const TITLE = Object.fromEntries(GAMES);
  const newRoom = () => SG.net.util.code();

  // ---------- сетка ----------

  function match(s, round, a, b) {
    const m = { i: s.matches.length, round, a, b, room: newRoom(), res: null, rep: {} };
    if (b === null) m.res = { w: a, bye: true };
    s.matches.push(m);
    return m;
  }

  // круговой: метод «карусели», каждый с каждым
  function roundRobin(s, ids) {
    const list = ids.slice();
    if (list.length % 2) list.push(null);
    const n = list.length;
    for (let r = 0; r < n - 1; r++) {
      for (let k = 0; k < n / 2; k++) {
        const a = list[k];
        const b = list[n - 1 - k];
        if (a !== null && b !== null) match(s, r + 1, a, b);
      }
      list.splice(1, 0, list.pop());
    }
  }

  function create(players, opts) {
    const game = TITLE[opts.game] ? opts.game : 'tictactoe';
    const s = { game, title: TITLE[game], format: opts.format === 'round' ? 'round' : 'olympic', names: {}, ids: SG.shuffle(players.map((p) => p.id)), matches: [], round: 1, over: false, champ: null };
    players.forEach((p) => (s.names[p.id] = p.name));
    if (s.format === 'round') roundRobin(s, s.ids);
    else olympicRound(s, s.ids);
    return s;
  }

  function olympicRound(s, ids) {
    for (let k = 0; k < ids.length; k += 2) match(s, s.round, ids[k], k + 1 < ids.length ? ids[k + 1] : null);
    advance(s);
  }

  function points(s) {
    const p = {};
    s.ids.forEach((id) => (p[id] = { pts: 0, w: 0, d: 0, l: 0, n: 0 }));
    s.matches.forEach((m) => {
      if (!m.res || m.b === null) return;
      [m.a, m.b].forEach((id) => {
        p[id].n++;
        if (m.res.w === null) {
          p[id].pts += 0.5;
          p[id].d++;
        } else if (m.res.w === id) {
          p[id].pts += 1;
          p[id].w++;
        } else p[id].l++;
      });
    });
    return p;
  }

  function advance(s) {
    if (s.format === 'round') {
      if (s.matches.every((m) => m.res)) {
        const p = points(s);
        const best = Math.max(...s.ids.map((id) => p[id].pts));
        s.champ = s.ids.filter((id) => p[id].pts === best);
        s.over = true;
      }
      return;
    }
    const cur = s.matches.filter((m) => m.round === s.round);
    if (!cur.every((m) => m.res)) return;
    const winners = cur.map((m) => m.res.w);
    if (winners.length === 1) {
      s.champ = [winners[0]];
      s.over = true;
      return;
    }
    s.round++;
    olympicRound(s, winners);
  }

  function settle(s, m, w) {
    if (m.res) return false;
    // в олимпийской сетке ничья — переигровка в новой комнате
    if (w === null && s.format === 'olympic') {
      m.room = newRoom();
      m.rep = {};
      m.replays = (m.replays || 0) + 1;
      return true;
    }
    m.res = { w };
    advance(s);
    return true;
  }

  function act(s, id, a) {
    if (!a || s.over) return false;
    const m = s.matches[a.m];
    if (!m || m.res) return false;
    if (a.report && (id === m.a || id === m.b) && ['win', 'lose', 'draw'].includes(a.report)) {
      const other = id === m.a ? m.b : m.a;
      const w = a.report === 'draw' ? null : a.report === 'win' ? id : other;
      m.rep[id] = w === null ? 'draw' : w;
      // соперник уже сообщил другой итог — пусть рассудит хозяин
      const theirs = m.rep[other];
      if (theirs !== undefined && theirs !== m.rep[id]) {
        m.dispute = true;
        return true;
      }
      m.dispute = false;
      return settle(s, m, w);
    }
    // хозяин комнаты — судья: может засчитать итог или переиграть
    if (a.judge !== undefined && id === 0) {
      if (a.judge === 'replay') {
        m.room = newRoom();
        m.rep = {};
        m.dispute = false;
        return true;
      }
      const w = a.judge === 'draw' ? null : a.judge === 'a' ? m.a : a.judge === 'b' ? m.b : undefined;
      if (w === undefined) return false;
      m.dispute = false;
      return settle(s, m, w);
    }
    return false;
  }

  // ушедший игрок проигрывает свои несыгранные матчи
  function leave(s, id) {
    s.matches.forEach((m) => {
      if (!m.res && (m.a === id || m.b === id)) {
        m.res = { w: m.a === id ? m.b : m.a, tech: true };
      }
    });
    advance(s);
  }

  const view = (s) => s;

  // ---------- итог матча приходит из вкладки с игрой ----------

  let cur = { view: null, ui: null };
  const seen = new Set();
  function onReport(msg) {
    const { view: v, ui } = cur;
    if (!v || !ui || !msg || typeof msg.room !== 'string') return;
    const key = msg.room + ':' + msg.at;
    if (seen.has(key)) return;
    seen.add(key);
    const m = v.matches.find((x) => x.room === msg.room && !x.res && (x.a === ui.me || x.b === ui.me));
    if (!m || msg.game !== v.game) return;
    ui.send({ m: m.i, report: msg.r });
    SG.sound.play('coin');
  }
  try {
    const ch = new BroadcastChannel('sg-tour');
    ch.onmessage = (e) => onReport(e.data);
  } catch (e) {
    /* старый браузер — остаётся событие хранилища */
  }
  window.addEventListener('storage', (e) => {
    if (e.key !== 'sg:tour-report' || !e.newValue) return;
    try {
      onReport(JSON.parse(e.newValue));
    } catch (err) {
      /* ignore */
    }
  });

  // ---------- отрисовка ----------

  function render(v, ui) {
    cur = { view: v, ui };
    const nm = (id) => (id === null ? '—' : esc(v.names[id] || '?'));
    const mine = v.matches.filter((m) => !m.res && (m.a === ui.me || m.b === ui.me));
    let html = `<div class="tr"><p class="tr-head">🏆 Турнир по игре <b>${esc(v.title)}</b> · ${v.format === 'round' ? 'круговой' : 'олимпийская система'}</p>`;
    if (v.over) {
      html += `<div class="tr-champ">${v.champ.length > 1 ? 'Победители' : 'Победитель'}: <b>${v.champ.map(nm).join(', ')}</b> 🎉</div>`;
    } else if (!ui.watcher) {
      if (mine.length) {
        html += '<div class="tr-mine"><h3>Ваши матчи</h3>';
        mine.forEach((m) => {
          const other = m.a === ui.me ? m.b : m.a;
          const url = '../' + v.game + '/index.html#t' + (m.a === ui.me ? 'host' : 'join') + '=' + m.room;
          html +=
            `<div class="tr-match"><span>против <b>${nm(other)}</b>${m.replays ? ' · переигровка' : ''}${m.dispute ? ' · <span class="tr-bad">итоги не совпали — решает хозяин</span>' : ''}</span>` +
            `<a class="btn btn-primary" href="${url}" target="_blank" rel="noopener">▶ Играть</a>` +
            `<span class="tr-rep">Итог: <button class="btn btn-ghost" type="button" data-rep="win" data-m="${m.i}">Я выиграл</button><button class="btn btn-ghost" type="button" data-rep="lose" data-m="${m.i}">Я проиграл</button>` +
            (v.format === 'round' ? `<button class="btn btn-ghost" type="button" data-rep="draw" data-m="${m.i}">Ничья</button>` : '') +
            '</span></div>';
        });
        html += '<p class="tr-note">Матч откроется в новой вкладке, соперник подключится сам. Итог партии засчитается автоматически; если нет — отметьте его кнопкой.</p></div>';
      } else html += '<p class="tr-note">Ждём, пока доиграют остальные матчи…</p>';
    }
    if (v.format === 'round') {
      const p = points(v);
      const order = v.ids.slice().sort((a, b) => p[b].pts - p[a].pts || p[b].w - p[a].w);
      html += '<table class="tr-table"><thead><tr><th>Игрок</th><th>Очки</th><th>В</th><th>Н</th><th>П</th><th>Сыграно</th></tr></thead><tbody>';
      order.forEach((id) => {
        html += `<tr${id === ui.me ? ' class="me"' : ''}><td>${nm(id)}</td><td><b>${p[id].pts}</b></td><td>${p[id].w}</td><td>${p[id].d}</td><td>${p[id].l}</td><td>${p[id].n} из ${v.ids.length - 1}</td></tr>`;
      });
      html += '</tbody></table>';
    }
    // сетка / список матчей по турам
    const rounds = [...new Set(v.matches.map((m) => m.round))];
    html += '<div class="tr-bracket">';
    rounds.forEach((r) => {
      const ms = v.matches.filter((m) => m.round === r);
      const label = v.format === 'olympic' && ms.length === 1 && ms[0].b !== null ? 'Финал' : 'Тур ' + r;
      html += `<div class="tr-col"><h4>${label}</h4>`;
      ms.forEach((m) => {
        const cls = (id) => (m.res && m.res.w === id ? ' class="win"' : m.res && id !== null && m.res.w !== null ? ' class="lose"' : '');
        html += `<div class="tr-card${m.res ? ' done' : ''}${m.a === ui.me || m.b === ui.me ? ' mine' : ''}"><div${cls(m.a)}>${nm(m.a)}</div><div${cls(m.b)}>${m.b === null ? '<i>проходит дальше</i>' : nm(m.b)}</div>`;
        if (m.res && m.res.w === null) html += '<small>ничья</small>';
        if (m.res && m.res.tech) html += '<small>техническая победа</small>';
        if (!m.res && ui.host && m.b !== null)
          html += `<div class="tr-judge"><button type="button" data-j="a" data-m="${m.i}" title="Засчитать победу">✓ ${nm(m.a)}</button><button type="button" data-j="b" data-m="${m.i}" title="Засчитать победу">✓ ${nm(m.b)}</button>` + (v.format === 'round' ? `<button type="button" data-j="draw" data-m="${m.i}">½</button>` : '') + `<button type="button" data-j="replay" data-m="${m.i}" title="Переиграть в новой комнате">↻</button></div>`;
        html += '</div>';
      });
      html += '</div>';
    });
    html += '</div></div>';
    ui.el.innerHTML = html;
    ui.el.querySelectorAll('[data-rep]').forEach((b) => b.addEventListener('click', () => ui.send({ m: +b.dataset.m, report: b.dataset.rep })));
    ui.el.querySelectorAll('[data-j]').forEach((b) => b.addEventListener('click', () => ui.send({ m: +b.dataset.m, judge: b.dataset.j })));
  }

  const opt = GAMES.map(([id, t]) => `<option value="${id}">${esc(t)}</option>`).join('');
  SG.party({
    game: 'tournament',
    min: 3,
    max: 8,
    bots: false,
    options: {
      html: `<label>Игра <select data-game>${opt}</select></label><label>Формат <select data-format><option value="olympic">Олимпийская система (на выбывание)</option><option value="round">Круговой (каждый с каждым)</option></select></label>`,
      read: (el) => ({ game: el.querySelector('[data-game]').value, format: el.querySelector('[data-format]').value }),
      show(el, o) {
        if (o && TITLE[o.game]) el.querySelector('[data-game]').value = o.game;
        if (o && o.format) el.querySelector('[data-format]').value = o.format;
      },
    },
    create,
    view,
    act,
    leave,
    render,
  });
})();
