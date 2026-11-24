// Automatic refresh, added to every page by the local development server
// (tools/dev-server.mjs); never part of the site.
//
// When files this page uses change: stylesheets are swapped in place, anything
// else reloads the page. Unsaved work is never discarded silently: while the
// page has any, a notice offers the reload instead, and the choice is the
// user's. Work counts as unsaved when
//   - something on the page would block leaving it (`beforeunload`: Connections,
//     and any editor added later that does the same),
//   - Admin Mode is on, or a dialog is open,
//   - the Layout Lab's layout has been changed,
//   - a field holds text typed since the page loaded.
// A reload also waits for a drag to end. Only a visible tab listens (a browser
// allows few connections to one host); a hidden one catches up when shown. A
// page inside a frame leaves it to the page around it.
(function () {
  'use strict';
  if (window.top !== window || !window.EventSource) return;
  let since = document.currentScript ? document.currentScript.dataset.since : '';
  let source = null, bar = null, held = false, timer = 0;
  const typed = new Set();
  try { performance.setResourceTimingBufferSize(2000); } catch (e) {}

  document.addEventListener('input', e => { if (e.isTrusted && e.target.type !== 'range') typed.add(e.target); }, true);
  ['pointerdown', 'pointerup', 'pointercancel'].forEach(t => window.addEventListener(t, () => { held = t === 'pointerdown'; }, true));
  window.addEventListener('blur', () => { held = false; });

  function typedText() {
    return [...typed].some(n => {
      if (!n.isConnected) { typed.delete(n); return false; }
      if (n.type === 'checkbox' || n.type === 'radio') return n.checked !== n.defaultChecked;
      return n.isContentEditable || ('value' in n && n.value !== '');
    });
  }
  function unsaved() {
    if (!window.dispatchEvent(new Event('beforeunload', { cancelable: true }))) return true;
    const admin = document.documentElement.dataset.cmsAdmin;
    if (admin && admin !== 'off') return true;
    if (document.querySelector('dialog[open]')) return true;
    const lab = window.PergamonHandbook && window.PergamonHandbook.layoutLab && window.PergamonHandbook.layoutLab.current;
    if (lab && location.hash.indexOf('/lab') > 0 && (lab.history.canUndo() || lab.history.canRedo())) return true;
    return typedText();
  }

  // ── What this page uses ───────────────────────────────────────────────
  const pathOf = href => { try { const u = new URL(href, location.href); return u.origin === location.origin ? decodeURIComponent(u.pathname) : ''; } catch (e) { return ''; } };
  function used() {
    const page = pathOf(location.href);
    const out = new Set([page.endsWith('/') ? page + 'index.html' : page]);
    performance.getEntriesByType('resource').forEach(r => out.add(pathOf(r.name)));
    return out;
  }
  // The same address again, so code looking for this link still finds it.
  function swap(link) {
    const next = link.cloneNode();
    next.addEventListener('load', () => link.remove());
    next.addEventListener('error', () => next.remove());
    link.after(next);
  }

  function reload() {
    clearTimeout(timer);
    if (held) { timer = setTimeout(reload, 400); return; }
    if (unsaved()) { notice(); return; }
    location.reload();
  }
  function changed(paths) {
    const mine = used();
    let full = false;
    paths.filter(p => mine.has(p)).forEach(p => {
      const links = p.endsWith('.css') ? [...document.querySelectorAll('link[rel="stylesheet"]')].filter(l => pathOf(l.href) === p) : [];
      if (links.length) links.forEach(swap); else full = true;
    });
    if (full) reload();
  }

  // Styled property by property: a style block would break the site's own policy.
  function notice() {
    if (bar && bar.isConnected) return;
    const make = (tag, text, css) => { const n = document.createElement(tag); n.textContent = text; Object.assign(n.style, css); return n; };
    const button = (text, primary, fn) => {
      const b = make('button', text, { padding: '6px 14px', border: '1px solid var(--color-border, #888)', borderRadius: 'var(--radius-md, 8px)', font: 'inherit', cursor: 'pointer',
        background: primary ? 'var(--color-accent, #246)' : 'transparent', color: primary ? 'var(--color-on-accent, #fff)' : 'inherit' });
      b.type = 'button';
      b.addEventListener('click', fn);
      return b;
    };
    bar = make('div', '', { position: 'fixed', left: '50%', bottom: '16px', transform: 'translateX(-50%)', zIndex: '2147483000', boxSizing: 'border-box', width: 'max-content', maxWidth: 'calc(100vw - 32px)',
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', padding: '10px 14px', border: '1px solid var(--color-accent, #246)', borderRadius: 'var(--radius-panel, 12px)',
      background: 'var(--color-surface, #fff)', color: 'var(--color-text-primary, #111)', boxShadow: 'var(--shadow-popover, 0 6px 24px #0006)', font: '600 14px/1.4 var(--font-ui, sans-serif)' });
    bar.setAttribute('role', 'status');
    bar.dataset.devReload = '';
    bar.append(make('span', 'Local files changed. Not refreshed: this page may have unsaved work.', {}),
      button('Reload', true, () => location.reload()), button('Later', false, () => bar.remove()));
    document.body.append(bar);
  }

  // ── Listening ─────────────────────────────────────────────────────────
  const stop = () => { if (source) { source.close(); source = null; } };
  function listen() {
    if (document.hidden) { stop(); return; }
    if (source) return;
    source = new EventSource('/__dev/changes?since=' + encodeURIComponent(since));
    source.onmessage = e => {
      since = e.lastEventId || since;
      let paths = [];
      try { paths = JSON.parse(e.data); } catch (err) {}
      if (paths.length) changed(paths);
    };
  }
  document.addEventListener('visibilitychange', listen);
  window.addEventListener('pageshow', listen);
  window.addEventListener('pagehide', stop);
  listen();
})();
