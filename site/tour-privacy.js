// External players are mounted only after the visitor chooses to connect.
function tourProvider(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return new Map([['my.matterport.com','Matterport'], ['player.vimeo.com','Vimeo'],
      ['www.youtube-nocookie.com','YouTube']]).get(u.hostname) || null;
  } catch { return null; }
}
function privateEmbedUrl(value) {
  if (!tourProvider(value)) return null;
  const u = new URL(value);
  if (u.hostname === 'player.vimeo.com') u.searchParams.set('dnt', '1');
  return u.href;
}
function mountTourGate(container, {url, title, onLoaded = () => {}}) {
  const source = privateEmbedUrl(url), provider = tourProvider(url);
  let timer, disposed = false;
  const clear = () => { clearTimeout(timer); container.replaceChildren(); };
  const button = (label, fn) => { const b = document.createElement('button'); b.type = 'button';
    b.className = 'btn tour-gate-button'; b.textContent = label; b.addEventListener('click', fn);
    b.addEventListener('focus', () => {
      const win = container.ownerDocument.defaultView;
      win.requestAnimationFrame(() => {
        if (!b.isConnected || container.ownerDocument.activeElement !== b) return;
        const bar = container.ownerDocument.querySelector('.mbar');
        if (!bar) return;
        const r = b.getBoundingClientRect(), m = bar.getBoundingClientRect();
        if (m.width && m.height && r.bottom > m.top && r.top < m.bottom && r.right > m.left && r.left < m.right)
          win.scrollBy(0, r.bottom - m.top + 12);
      });
    });
    return b; };
  const externalLink = () => {
    try { const u = new URL(url); if (u.protocol !== 'https:' || u.username || u.password) return null;
      const a = document.createElement('a'); a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = 'Open tour on provider website'; return a;
    } catch { return null; }
  };
  const poster = (focus = false) => {
    if (disposed) return;
    clear();
    const panel = document.createElement('div'); panel.className = 'tour-gate';
    const message = document.createElement('p');
    message.textContent = `Loading this tour connects to ${provider || 'the provider'}, which receives your IP address and may use its own storage.`;
    panel.append(message);
    if (source) { const load = button(`Load ${provider} tour`, loadPlayer); panel.append(load); if (focus) requestAnimationFrame(() => load.focus()); }
    else { const link = externalLink(); if (link) panel.append(link); }
    container.append(panel);
  };
  function showError(message) {
    const error = document.createElement('div'); error.className = 'tour-gate-error'; error.setAttribute('role', 'alert');
    const text = document.createElement('p'); text.textContent = message; error.append(text);
    error.append(button('Try again', () => { clear(); loadPlayer(); }));
    error.append(button('Unload tour', () => poster(true)));
    const link = externalLink(); if (link) error.append(link); container.append(error);
  }
  function loadPlayer() {
    if (disposed || !source || container.querySelector('iframe')) return;
    clear();
    if (!container.ownerDocument.defaultView.navigator.onLine) {
      showError('You appear to be offline. The tour needs a connection.'); return;
    }
    const frame = document.createElement('iframe'); frame.src = source; frame.title = `3D tour: ${title}`;
    frame.allow = 'fullscreen; xr-spatial-tracking'; frame.allowFullscreen = true;
    const unload = button('Unload tour', () => poster(true)); unload.classList.add('tour-gate-unload');
    container.append(frame, unload); frame.focus(); onLoaded();
    frame.addEventListener('load', () => { clearTimeout(timer); container.querySelector('.tour-gate-error')?.remove(); }, {once:true});
    timer = setTimeout(() => {
      if (disposed || !frame.isConnected) return;
      showError('The tour is taking longer than usual to load.');
    }, 20000);
  }
  poster();
  return () => { disposed = true; clear(); };
}
if (typeof module !== 'undefined') module.exports = {tourProvider, privateEmbedUrl, mountTourGate};
