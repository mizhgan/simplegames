    // ---------- зрители ----------

    function toWatchers(obj) {
      if (!watchers.length) return;
      const s = JSON.stringify(obj);
      watchers.forEach((w) => {
        try {
          w.c.send(s);
        } catch (e) {
          /* канал закрыт */
        }
      });
    }

    function forwardToWatchers(msg, from) {
      if (!watchers.length || !opts.watch) return;
      if (opts.watch.forward && !opts.watch.forward(msg, from)) return;
      toWatchers({ t: '_fw', from, m: msg });
    }

    function sendCount() {
      watcherCount = watchers.length;
      rawSend({ t: '_watchers', n: watcherCount });
      toWatchers({ t: '_watchers', n: watcherCount });
      updateBar();
    }

    // новому зрителю — текущая партия
    function syncWatcher(w) {
      const one = (obj) => {
        try {
          w.c.send(JSON.stringify(obj));
        } catch (e) {
          /* ignore */
        }
      };
      one({ t: '_wseries', s: series });
      one({ t: '_watchers', n: watchers.length });
      if (!api.active) return one({ t: '_wwait' });
      if (opts.watch) one({ t: '_sync', d: opts.watch.snapshot() });
      else {
        const m = mirrorPayload();
        if (m) one(m);
      }
    }

    // у хозяина: зритель подключился по ссылке #watch=
    function acceptWatcher(c) {
      let joined = false;
      const w = { c };
      c.on('data', (raw) => {
        let msg;
        try {
          msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (e) {
          return;
        }
        if (!msg) return;
        if (!joined) {
          if (msg.t !== '_hello' || !msg.watch) return;
          if ((myRoom && msg.key !== myRoom) || msg.game !== opts.game) {
            c.send(JSON.stringify({ t: '_denied' }));
            return setTimeout(() => c.close(), 800);
          }
          if (watchers.length >= MAX_WATCHERS) {
            c.send(JSON.stringify({ t: '_wfull' }));
            return setTimeout(() => c.close(), 1500);
          }
          joined = true;
          watchers.push(w);
          c.send(JSON.stringify({ t: '_whello', game: opts.game, mode: opts.watch ? 'watch' : 'mirror' }));
          syncWatcher(w);
          sendCount();
          if (!opts.watch && api.active) startMirror();
          if (!watchPing) {
            watchPing = setInterval(() => toWatchers({ t: '_ping' }), 4000);
          }
          return;
        }
        if (msg.t === '_react' && REACTIONS[msg.v]) {
          bubble(REACTIONS[msg.v], false, 'watcher');
          rawSend({ t: '_react', v: msg.v, who: 'watcher' });
          watchers.forEach((o) => o !== w && o.c.send(JSON.stringify({ t: '_react', v: msg.v, who: 'watcher' })));
        }
      });
      const gone = () => {
        const i = watchers.indexOf(w);
        if (i < 0) return;
        watchers.splice(i, 1);
        sendCount();
        if (!watchers.length) stopMirror();
      };
      c.on('close', gone);
      c.on('error', gone);
    }

    function closeWatchers() {
      clearInterval(watchPing);
      watchPing = 0;
      const list = watchers.splice(0);
      list.forEach((w) => {
        try {
          w.c.send(JSON.stringify({ t: '_bye' }));
        } catch (e) {
          /* ignore */
        }
        setTimeout(() => {
          try {
            w.c.close();
          } catch (e) {
            /* ignore */
          }
        }, 100);
      });
    }

