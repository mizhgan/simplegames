  // ---------- профиль игрока: имя, рейтинг, недавние соперники ----------
  // Всё хранится только в этом браузере. Рейтинг Эло считается отдельно для каждой игры:
  // после партии по сети каждый пересчитывает свой, зная рейтинг соперника.

  const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const ELO_START = 1200;
  const MAX_RIVALS = 15;

  const profile = {
    id() {
      let v = SG.store.get('player-id', '');
      if (!/^[a-z0-9]{12}$/.test(v)) {
        v = Array.from({ length: 12 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
        SG.store.set('player-id', v);
      }
      return v;
    },
    name: () => SG.store.get('party-name', '') || '',
    setName(n) {
      n = String(n || '').trim().slice(0, 16);
      if (n) SG.store.set('party-name', n);
    },
    rating(game) {
      const e = SG.store.get('elo', {})[game];
      return e ? e.r : ELO_START;
    },
    ratings: () => SG.store.get('elo', {}),
    card: (game) => ({ id: profile.id(), name: profile.name(), elo: profile.rating(game) }),
    // карточка соперника из сети — проверяем, что это не мусор
    clean(x) {
      if (!x || typeof x !== 'object' || !/^[a-z0-9]{12}$/.test(String(x.id))) return null;
      const elo = Math.round(+x.elo);
      return { id: String(x.id), name: String(x.name || '').trim().slice(0, 16) || 'Соперник', elo: elo > 100 && elo < 4000 ? elo : ELO_START };
    },
    rivals: () => (SG.store.get('rivals', []) || []).filter((r) => r && r.id),
    remember(rival, game, title) {
      if (!rival || rival.id === profile.id()) return;
      const list = profile.rivals().filter((r) => r.id !== rival.id);
      const old = profile.rivals().find((r) => r.id === rival.id) || { w: 0, l: 0, d: 0 };
      list.unshift({ id: rival.id, name: rival.name, at: Date.now(), game, title: title || old.title || '', w: old.w || 0, l: old.l || 0, d: old.d || 0 });
      SG.store.set('rivals', list.slice(0, MAX_RIVALS));
    },
    // итог партии: пересчёт рейтинга и счёта личных встреч; возвращает { before, after }
    record(rival, game, r) {
      const all = SG.store.get('elo', {});
      const me = all[game] || { r: ELO_START, n: 0 };
      const score = r === 'win' ? 1 : r === 'lose' ? 0 : 0.5;
      const exp = 1 / (1 + Math.pow(10, (rival.elo - me.r) / 400));
      const k = me.n < 10 ? 40 : 24;
      const delta = Math.round(k * (score - exp));
      const before = me.r;
      all[game] = { r: Math.max(100, me.r + delta), n: me.n + 1 };
      SG.store.set('elo', all);
      rival.elo -= delta;
      const list = profile.rivals();
      const x = list.find((q) => q.id === rival.id);
      if (x) {
        x[r === 'win' ? 'w' : r === 'lose' ? 'l' : 'd']++;
        x.at = Date.now();
        SG.store.set('rivals', list);
      }
      return { before, after: all[game].r };
    },
  };

