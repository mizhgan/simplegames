  // ---------- сжатие SDP для ручного режима ----------

  async function pack(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let data = bytes;
    if (window.CompressionStream) {
      const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      data = new Uint8Array(await new Response(s).arrayBuffer());
    }
    let bin = '';
    data.forEach((b) => (bin += String.fromCharCode(b)));
    return (window.CompressionStream ? 'z' : 'p') + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function unpack(text) {
    text = text.trim();
    const kind = text[0];
    const b64 = text.slice(1).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    let bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    if (kind === 'z') {
      const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      bytes = new Uint8Array(await new Response(s).arrayBuffer());
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function waitIce(pc) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const done = () => {
        if (pc.iceGatheringState === 'complete') resolve();
      };
      pc.addEventListener('icegatheringstatechange', done);
      setTimeout(resolve, 4000);
    });
  }

