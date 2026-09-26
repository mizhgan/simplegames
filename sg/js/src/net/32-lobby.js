    // ---------- лобби: открытые комнаты ----------

    function stopLobby() {
      clearTimeout(lobbyTimer);
      lobbyTimer = 0;
      if (lobbyPeer) {
        const p = lobbyPeer;
        lobbyPeer = null;
        try {
          p.destroy();
        } catch (e) {
          /* ignore */
        }
      }
    }

    // отдельная «табличка» на сервере: по ней другие видят, что в этой игре ждут соперника
    function publish(room, on) {
      if (lobbyPeer) {
        const p = lobbyPeer;
        lobbyPeer = null;
        try {
          p.destroy();
        } catch (e) {
          /* ignore */
        }
      }
      if (!on || !window.Peer) return;
      try {
        const p = new window.Peer(LOBBY + opts.game + '-' + room + '-' + Math.floor(Date.now() / 1000).toString(36), peerOptions('own'));
        p.on('connection', (c) => c.close());
        p.on('error', () => {});
        p.on('disconnected', () => lobbyPeer === p && !p.destroyed && p.reconnect());
        lobbyPeer = p;
      } catch (e) {
        /* ignore */
      }
    }

    // раздел «Открытые игры» в окне приглашения
    function lobbyBlock(box, room, onServer) {
      const wrap = box.querySelector('.net-lobby');
      if (!wrap) return;
      const listEl = wrap.querySelector('.net-rooms');
      const chk = wrap.querySelector('input[type=checkbox]');
      chk.checked = !!SG.store.get('net-public', false);
      if (onServer) {
        chk.addEventListener('change', () => {
          SG.store.set('net-public', chk.checked);
          publish(room, chk.checked);
          setTimeout(poll, 700);
        });
        if (chk.checked) publish(room, true);
      } else wrap.querySelector('.net-public').hidden = true;
      const poll = async () => {
        clearTimeout(lobbyTimer);
        if (api.active || !SG.modal.isOpen() || !box.isConnected || !box.contains(listEl)) return;
        const rooms = await lobbyList(opts.game);
        if (api.active || !box.contains(listEl)) return;
        if (!rooms) {
          wrap.hidden = true;
          return;
        }
        wrap.hidden = false;
        const others = rooms.filter((r) => r.room !== room).sort((a, b) => b.since - a.since).slice(0, 8);
        const now = Date.now() / 1000;
        listEl.innerHTML = others.length
          ? others
              .map((r) => {
                const min = r.since ? Math.max(0, Math.round((now - r.since) / 60)) : 0;
                return `<li><span>Комната <b>${r.room}</b><small>${min ? 'ждёт ' + min + ' мин' : 'только что'}</small></span><button class="btn btn-primary" type="button" data-room="${r.room}">Играть</button></li>`;
              })
              .join('')
          : '<li class="empty">Пока никто не ищет соперника. Отметьте галочку — и вашу комнату увидят другие.</li>';
        lobbyTimer = setTimeout(poll, 4000);
      };
      listEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-room]');
        if (b) join(b.dataset.room);
      });
      poll();
    }

