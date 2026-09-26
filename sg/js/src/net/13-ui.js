  // ---------- интерфейс ----------

  // окна игры по сети — общее модальное окно сайта (SG.modal)
  const dialog = (html) => SG.modal(html);
  const closeDialog = () => SG.modal.close();

  async function copy(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        /* ignore */
      }
      ta.remove();
    }
    if (btn) {
      const old = btn.textContent;
      btn.textContent = 'Скопировано ✓';
      setTimeout(() => (btn.textContent = old), 1500);
    }
  }

  function linkBlock(url, label) {
    const share = navigator.share ? '<button class="btn btn-ghost" type="button" data-share>Поделиться</button>' : '';
    return (
      `<label class="net-label">${label}</label>` +
      `<div class="net-link"><input type="text" readonly value="${url.replace(/"/g, '&quot;')}"><button class="btn btn-primary" type="button" data-copy>Скопировать</button>${share}</div>`
    );
  }

  function bindLink(box, url) {
    const input = box.querySelector('.net-link input');
    input.addEventListener('focus', () => input.select());
    box.querySelector('[data-copy]').addEventListener('click', (e) => copy(url, e.currentTarget));
    const sh = box.querySelector('[data-share]');
    if (sh) sh.addEventListener('click', () => navigator.share({ title: document.title, text: 'Сыграем по сети?', url }).catch(() => {}));
  }

