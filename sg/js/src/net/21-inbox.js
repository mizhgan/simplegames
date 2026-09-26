  // ---------- личный «почтовый ящик»: приглашения от недавних соперников ----------
  // Пока открыта любая страница игры, браузер слушает приглашения на личном адресе у сервера знакомств.
  // Адрес знают только те, с кем вы уже играли по сети.

  const inboxPeerId = (pid) => PREFIX + 'u' + cyrb53('sgu:' + pid);
  let inbox = null;
  let inboxBusy = () => false;

  function startInbox(isBusy) {
    if (isBusy) inboxBusy = isBusy;
    if (inbox || !profile.rivals().length || SG.store.get('inbox-off', false)) return;
    inbox = 'starting';
    setTimeout(async () => {
      if (!(await loadPeer())) {
        inbox = null;
        return;
      }
      let p;
      try {
        p = new window.Peer(inboxPeerId(profile.id()), peerOptions(serverList()[0]));
      } catch (e) {
        inbox = null;
        return;
      }
      inbox = p;
      p.on('connection', (c) => {
        c.on('data', (raw) => {
          let msg;
          try {
            msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
          } catch (e) {
            return;
          }
          if (!msg || msg.t !== 'invite') return;
          const reply = (t) => {
            try {
              c.send(JSON.stringify({ t }));
            } catch (e) {
              /* ignore */
            }
            setTimeout(() => c.close(), 1000);
          };
          const from = profile.clean(msg.from);
          let url;
          try {
            url = new URL(String(msg.url), location.href);
          } catch (e) {
            return reply('no');
          }
          // принимаем только ссылки на этот же сайт с кодом комнаты
          if (!from || url.origin !== location.origin || !/^#(join|party)=[a-z0-9]{6}(-p)?$/.test(url.hash)) return reply('no');
          if (inboxBusy()) return reply('busy');
          showInvite(from, String(msg.title || 'игру').slice(0, 40), url.href, reply);
        });
      });
      p.on('error', (err) => {
        // адрес занят другой вкладкой — она и примет приглашение
        if (err.type === 'unavailable-id' && inbox === p) {
          inbox = null;
          p.destroy();
        }
      });
      p.on('disconnected', () => {
        setTimeout(() => {
          try {
            if (inbox === p && !p.destroyed && p.disconnected) p.reconnect();
          } catch (e) {
            /* ignore */
          }
        }, 5000);
      });
      window.addEventListener('pagehide', () => {
        try {
          p.destroy();
        } catch (e) {
          /* ignore */
        }
      });
    }, 1500);
  }

  function showInvite(from, title, url, reply) {
    if (currentInvite) currentInvite.close();
    let answered = false;
    const answer = (t) => {
      if (answered) return;
      answered = true;
      reply(t);
    };
    currentInvite = SG.toast({
      icon: '🎮',
      title: from.name + ' зовёт вас сыграть',
      text: '«' + title + '»',
      tone: 'success',
      sound: 'match',
      timeout: 60000,
      onTimeout: () => answer('no'),
      actions: [
        {
          label: 'Играть',
          primary: true,
          onClick() {
            answer('ok');
            setTimeout(() => {
              location.href = url;
              // та же страница: смена хэша не перезагружает её
              if (url.split('#')[0] === location.href.split('#')[0]) location.reload();
            }, 300);
          },
        },
        { label: 'Не сейчас', onClick: () => answer('no') },
      ],
    });
  }
  let currentInvite = null;

  // список недавних соперников с кнопкой «Позвать» — в окне приглашения
  function rivalsBlock(box, url, title, getPeer) {
    const list = profile.rivals().slice(0, 6);
    if (!list.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'net-rivals';
    wrap.innerHTML =
      '<p class="net-label">Позвать недавнего соперника</p><ul>' +
      list
        .map(
          (r) =>
            `<li><span>${escH(r.name)}` +
            (r.w + r.l + r.d ? ` <small title="Ваши победы : поражения">${r.w}:${r.l}</small>` : '') +
            (r.title ? ` <small>· ${escH(r.title)}</small>` : '') +
            `</span><button class="btn btn-ghost" type="button" data-invite="${r.id}">Позвать</button></li>`
        )
        .join('') +
      '</ul><p class="net-note">Приглашение придёт, если у друга открыта любая игра на этом сайте.</p>';
    const actions = box.querySelector(':scope > .net-actions');
    if (actions) box.insertBefore(wrap, actions);
    else box.appendChild(wrap);
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-invite]');
      if (!b || b.disabled) return;
      const p = getPeer();
      if (!p || p.destroyed) return;
      b.disabled = true;
      b.textContent = 'Зовём…';
      let c;
      try {
        c = p.connect(inboxPeerId(b.dataset.invite), { reliable: true });
      } catch (err) {
        b.textContent = 'Не вышло';
        return;
      }
      const set = (t, keep) => {
        b.textContent = t;
        if (!keep) setTimeout(() => ((b.disabled = false), (b.textContent = 'Позвать')), 8000);
      };
      const timer = setTimeout(() => {
        set('Не в сети');
        try {
          c.close();
        } catch (err) {
          /* ignore */
        }
      }, 8000);
      c.on('open', () => {
        clearTimeout(timer);
        b.textContent = 'Ждём ответа…';
        c.send(JSON.stringify({ t: 'invite', from: profile.card(''), title, url }));
      });
      c.on('data', (raw) => {
        let msg = raw;
        try {
          msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (err) {
          return;
        }
        if (msg.t === 'ok') set('Идёт! ✓', true);
        else if (msg.t === 'busy') set('Сейчас играет');
        else set('Не сейчас');
      });
    });
  }

  // имя в окне приглашения (для рейтинга и списка соперников)
  function nameField() {
    return `<label class="net-name"><span>Ваше имя</span><input type="text" maxlength="16" autocomplete="nickname" placeholder="Для соперника" value="${escH(profile.name())}"></label>`;
  }
  function bindName(box, onChange) {
    const input = box.querySelector('.net-name input');
    if (!input) return;
    input.addEventListener('change', () => {
      profile.setName(input.value);
      if (onChange) onChange();
    });
  }

  const gameTitle = () => (document.querySelector('.page-head h1, .game-head h1') || {}).textContent || document.title.split(' — ')[0];

