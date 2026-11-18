// Admin Mode for the homepage (CMS milestone M3).
//
// Loaded after auth.js. Builds nothing until the server confirms the
// signed-in account is an administrator (rpc is_admin(), the same check
// every CMS write function runs). Stored state (sessionStorage) and the
// supabase-js session are only ever read after that answer, so altering
// them in the browser can't show the controls; and the controls themselves
// can't do anything the CMS functions would refuse.
//
//   header button   opens the Admin Mode panel (only for verified admins)
//   panel           Admin Mode on/off, "View as" Admin / User / Guest,
//                   Publish Changes (disabled until editing exists)
//   Admin view      a frame and pencil on every supported card, found through
//                   PergamonHome.cardIds() / element(id) (no game names here)
//   User / Guest    no editing controls, published content; Guest also shows
//                   the guest appearance (PergamonTheme.previewSignedIn)
//
// Pencils open an informational note for now; the card editor comes later
// (its working copy will live here, so switching views keeps it).
(function () {
  'use strict';
  const cms = window.PergamonCMS || {};
  const auth = window.PergamonAuth;
  const home = window.PergamonHome;
  const root = document.getElementById('home');
  // Only where the homepage reads the CMS (staging previews and development).
  if (!cms.loader || !cms.loader.enabled || !cms.content || !auth || !home || !root || !window.PergamonSupabaseClient) return;

  const STATE_KEY = 'pa-cms-admin';
  const VIEWS = { admin: 'Admin', user: 'User', guest: 'Guest' };
  const TYPE_LABELS = { feature: 'Featured card', spotlight: 'Spotlight card', tile: 'Carousel card' };
  const ICONS = {
    admin: '<path d="M12 3 5 6v5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
    pencil: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>'
  };
  const svg = (name, cls) => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  let verified = false;
  let check = 0;                       // latest verification; older answers are ignored
  let state = { active: false, view: 'admin' };
  let ui = null;                       // header button, panel, preview bar (once verified)
  let observer = null;
  let note = null;                     // the pencil's placeholder note

  // ── Server verification ───────────────────────────────────────────────
  async function isAdmin() {
    const res = await auth.getSession();
    if (!res || !res.data || !res.data.session) return false;
    const answer = await auth.isCmsAdmin();
    return !answer.error && answer.data === true;
  }

  function verify() {
    const id = ++check;
    return isAdmin().catch(() => false).then(ok => {
      if (id !== check) return verified;
      if (ok && !verified) mount();
      else if (!ok && verified) unmount();
      return ok;
    });
  }

  function readState() {
    try {
      const s = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null');
      if (s && typeof s.active === 'boolean' && VIEWS[s.view]) return { active: s.active, view: s.view };
    } catch (e) {}
    return { active: false, view: 'admin' };
  }
  function saveState() { try { sessionStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {} }

  // ── Interface (built only after verification) ─────────────────────────
  function loadStyles() {
    if (document.querySelector('link[data-cms-admin]')) return Promise.resolve();
    return new Promise(resolve => {
      const link = el('link');
      link.rel = 'stylesheet';
      link.href = '/styles/cms-admin.css';
      link.dataset.cmsAdmin = '';
      link.onload = link.onerror = () => resolve();
      document.head.append(link);
    });
  }

  function mount() {
    verified = true;
    state = readState();
    loadStyles().then(() => {
      if (!verified || ui) return;
      ui = buildInterface();
      apply();
    });
  }

  function unmount() {
    verified = false;
    state = { active: false, view: 'admin' };
    closeNote();
    undecorate();
    if (window.PergamonTheme && window.PergamonTheme.previewSignedIn) window.PergamonTheme.previewSignedIn(null);
    if (ui) { ui.button.remove(); ui.panel.remove(); ui.bar.remove(); ui = null; }
    document.documentElement.removeAttribute('data-cms-admin');
  }

  function buildInterface() {
    const actions = document.querySelector('.pa-header .pa-actions');
    const button = el('button', 'pa-icon-button cms-admin-button');
    button.type = 'button';
    button.id = 'cms-admin-button';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'cms-admin-panel');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = svg('admin', 'pa-icon') + '<span class="cms-admin-dot" aria-hidden="true"></span>';
    if (actions) actions.prepend(button);

    const panel = el('div', 'cms-admin-panel');
    panel.id = 'cms-admin-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'cms-admin-title');
    panel.hidden = true;

    const head = el('div', 'cms-admin-head');
    const heading = el('div', 'cms-admin-heading');
    const title = el('h2', 'cms-admin-title', 'Admin Mode'); title.id = 'cms-admin-title';
    heading.append(title, el('p', 'cms-admin-sub', 'Verified administrator · homepage cards'));
    const toggle = el('button', 'cms-admin-switch');
    toggle.type = 'button';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-labelledby', 'cms-admin-title');
    toggle.append(el('span', 'cms-admin-switch-knob'));
    head.append(heading, toggle);

    const views = el('div', 'cms-admin-views');
    views.setAttribute('role', 'group');
    views.setAttribute('aria-labelledby', 'cms-admin-views-label');
    const viewLabel = el('p', 'cms-admin-label', 'View as'); viewLabel.id = 'cms-admin-views-label';
    const viewButtons = {};
    const segment = el('div', 'cms-admin-segment');
    Object.keys(VIEWS).forEach(view => {
      const b = el('button', 'cms-admin-view', VIEWS[view]);
      b.type = 'button';
      b.dataset.view = view;
      b.addEventListener('click', () => setView(view));
      viewButtons[view] = b;
      segment.append(b);
    });
    views.append(viewLabel, segment);

    const publish = el('button', 'cms-admin-publish', 'Publish Changes');
    publish.type = 'button';
    publish.disabled = true;
    publish.setAttribute('aria-describedby', 'cms-admin-publish-note');
    const publishNote = el('p', 'cms-admin-note', 'Nothing to publish. Card editing isn’t available yet.');
    publishNote.id = 'cms-admin-publish-note';

    panel.append(head, views, publish, publishNote);
    document.body.append(panel);

    // Shown while previewing as a user or guest: no editing controls, a way back.
    const bar = el('div', 'cms-admin-bar');
    bar.setAttribute('role', 'status');
    bar.hidden = true;
    const barText = el('span', 'cms-admin-bar-text');
    const back = el('button', 'cms-admin-bar-back', 'Back to Admin View');
    back.type = 'button';
    back.addEventListener('click', () => setView('admin'));
    bar.append(barText, back);
    document.body.append(bar);

    button.addEventListener('click', () => setPanel(panel.hidden));
    toggle.addEventListener('click', () => setActive(!state.active));

    return { button, panel, toggle, viewButtons, bar, barText };
  }

  function setPanel(open) {
    if (!ui) return;
    ui.panel.hidden = !open;
    ui.button.setAttribute('aria-expanded', String(open));
    if (open) {
      const top = ui.button.getBoundingClientRect().bottom + 10;
      ui.panel.style.top = `${Math.round(top)}px`;
      ui.toggle.focus();
    }
  }

  function onKey(event) {
    if (event.key !== 'Escape') return;
    if (note) { closeNote(true); return; }
    if (ui && !ui.panel.hidden) { setPanel(false); ui.button.focus(); }
  }
  function onPointer(event) {
    const t = event.target;
    if (note && !note.box.contains(t) && !note.pencil.contains(t)) closeNote();
    if (ui && !ui.panel.hidden && !ui.panel.contains(t) && !ui.button.contains(t)) setPanel(false);
  }

  // Turning Admin Mode on asks the server again first.
  function setActive(on) {
    if (!on) { state = { active: false, view: 'admin' }; saveState(); apply(); return; }
    ui.toggle.disabled = true;
    verify().then(ok => {
      if (!ui) return;
      ui.toggle.disabled = false;
      if (!ok) return;
      state = { active: true, view: state.view };
      saveState(); apply();
    });
  }

  function setView(view) {
    if (!state.active || !VIEWS[view]) return;
    state = { active: true, view };
    saveState(); apply();
  }

  // Reflect state everywhere: panel, header button, preview bar, cards, appearance.
  function apply() {
    if (!ui) return;
    const editing = state.active && state.view === 'admin';
    document.documentElement.setAttribute('data-cms-admin', state.active ? state.view : 'off');
    ui.toggle.setAttribute('aria-checked', String(state.active));
    ui.button.classList.toggle('is-active', state.active);
    const label = state.active ? `Admin Mode: on, ${VIEWS[state.view]} view` : 'Admin Mode: off';
    ui.button.setAttribute('aria-label', label);
    ui.button.setAttribute('data-tip', label);
    Object.keys(ui.viewButtons).forEach(view => {
      const b = ui.viewButtons[view];
      b.setAttribute('aria-pressed', String(state.view === view));
      b.disabled = !state.active;
    });
    ui.bar.hidden = !(state.active && state.view !== 'admin');
    ui.barText.textContent = `Previewing as ${VIEWS[state.view]}`;
    if (window.PergamonTheme && window.PergamonTheme.previewSignedIn) {
      window.PergamonTheme.previewSignedIn(state.active && state.view === 'guest' ? false : null);
    }
    // The page shows published content in every view until the editor adds a working copy.
    if (editing) decorate(); else undecorate();
  }

  // ── Card indicators ───────────────────────────────────────────────────
  function cardTitle(id) {
    const m = home.model();
    const all = [m.featured, m.spotlight].concat(m.carousel || []).filter(Boolean);
    const item = all.find(c => c.id === id);
    return (item && item.title) || id;
  }

  function decorate() {
    home.cardIds().forEach(id => {
      const type = cms.content.cardType(id);
      const card = home.element(id);
      if (!type || !TYPE_LABELS[type] || !card) return;
      // Controls sit beside a link, never inside it, so the card still navigates.
      const host = card.matches('a') ? card.parentElement : card;
      if (!host) return;
      let pencil = host.querySelector(':scope > .cms-edit-pencil');
      if (!pencil) {
        host.classList.add('cms-editable');
        const frame = el('span', 'cms-edit-frame');
        frame.setAttribute('aria-hidden', 'true');
        pencil = el('button', 'cms-edit-pencil');
        pencil.type = 'button';
        pencil.innerHTML = svg('pencil', 'cms-edit-icon');
        pencil.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          openNote(pencil);
        });
        host.append(frame, pencil);
      }
      pencil.dataset.cmsEdit = id;
      const label = `Edit ${TYPE_LABELS[type].toLowerCase()}: ${cardTitle(id)}`;
      if (pencil.getAttribute('aria-label') !== label) pencil.setAttribute('aria-label', label);
    });
    // Carousel pages and redraws replace tiles: decorate whatever appears.
    if (!observer) {
      let queued = false;
      observer = new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; if (observer) decorate(); });
      });
      observer.observe(root, { childList: true, subtree: true });
    }
  }

  function undecorate() {
    if (observer) { observer.disconnect(); observer = null; }
    closeNote();
    root.querySelectorAll('.cms-edit-pencil, .cms-edit-frame').forEach(n => n.remove());
    root.querySelectorAll('.cms-editable').forEach(n => n.classList.remove('cms-editable'));
  }

  // ── Pencil placeholder ────────────────────────────────────────────────
  function openNote(pencil) {
    const id = pencil.dataset.cmsEdit;
    if (note && note.pencil === pencil) { closeNote(true); return; }
    closeNote();
    const type = cms.content.cardType(id);
    const box = el('div', 'cms-edit-note');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-labelledby', 'cms-edit-note-title');
    const head = el('div', 'cms-edit-note-head');
    const title = el('h2', 'cms-edit-note-title', `Edit “${cardTitle(id)}”`); title.id = 'cms-edit-note-title';
    const close = el('button', 'cms-edit-note-close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.innerHTML = svg('close', 'cms-edit-icon');
    close.addEventListener('click', () => closeNote(true));
    head.append(title, close);
    box.append(head,
      el('p', 'cms-edit-note-text', 'The card editor isn’t available yet. This is where you’ll change this card’s text, link and artwork.'),
      el('p', 'cms-edit-note-meta', `${TYPE_LABELS[type]} · ${id}`));
    document.body.append(box);
    // Below the pencil (above it near the bottom), kept inside the window.
    const r = pencil.getBoundingClientRect();
    const w = box.offsetWidth, h = box.offsetHeight;
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w));
    const below = r.bottom + 8 + h <= window.innerHeight - 12;
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(below ? r.bottom + 8 : Math.max(12, r.top - 8 - h))}px`;
    pencil.setAttribute('aria-expanded', 'true');
    note = { box, pencil };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    close.focus();
  }
  function onScroll() { closeNote(); }
  function closeNote(restoreFocus) {
    if (!note) return;
    const { box, pencil } = note;
    note = null;
    box.remove();
    pencil.setAttribute('aria-expanded', 'false');
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    if (restoreFocus && pencil.isConnected) pencil.focus();
  }

  // ── Start, and follow sign-in / sign-out ──────────────────────────────
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onPointer, true);
  verify();
  try {
    auth.onAuthStateChange(event => {
      if (event === 'TOKEN_REFRESHED') return;
      // Outside the auth callback: supabase-js must not be re-entered from it.
      setTimeout(verify, 0);
    });
  } catch (e) {}
})();
