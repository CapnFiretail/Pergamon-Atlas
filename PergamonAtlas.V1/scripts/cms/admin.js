// Admin Mode for the homepage (CMS milestones M3–M6).
//
// Loaded after auth.js. Builds nothing, and loads the editor (workspace.js,
// images.js, drawer.js, image-editor.js, publish.js, publish-dialog.js,
// styles/cms-admin.css), only after the
// server confirms the signed-in account is an administrator (rpc is_admin(),
// the same check every CMS write function runs). Stored state
// (sessionStorage) and the supabase-js session are only ever read after that
// answer, so altering them in the browser can't show the controls; and the
// controls can't do anything the CMS functions would refuse.
//
//   header button   opens the Admin Mode panel (only for verified admins)
//   panel           Admin Mode on/off, "View as" Admin / User / Guest, the
//                   published / draft / unsaved state, Publish Changes
//                   (the saved draft; publish-dialog.js and publish.js)
//   Admin view      the working copy (workspace.js) drawn on the page, with a
//                   frame and pencil on every supported card, found through
//                   PergamonHome.cardIds() / element(id) (no game names here);
//                   a pencil opens the card editing drawer (drawer.js)
//   images          the working copy's uploaded images: private drafts are
//                   shown to the administrator through short-lived signed
//                   URLs (images.js), only ever in Admin view
//   User / Guest    no editing controls, published content; Guest also shows
//                   the guest appearance (PergamonTheme.previewSignedIn).
//                   Unsaved edits stay in the working copy for Admin view.
//   collections     "Manage cards" on the Featured / Spotlight cards and the
//                   carousel, and the carousel's "Add card" tile (manage.js);
//                   a saved card being edited is previewed in its slot
//   history         Version History and Restore in the panel (history.js)
(function () {
  'use strict';
  const cms = window.PergamonCMS || {};
  const auth = window.PergamonAuth;
  const home = window.PergamonHome;
  const root = document.getElementById('home');
  // Only where the homepage reads the CMS (staging previews and development).
  if (!cms.loader || !cms.loader.enabled || !cms.content || !auth || !home || !root || !window.PergamonSupabaseClient) return;

  const PAGE = 'home';
  const STATE_KEY = 'pa-cms-admin';
  const VIEWS = { admin: 'Admin', user: 'User', guest: 'Guest' };
  const TYPE_LABELS = { feature: 'Featured card', spotlight: 'Spotlight card', tile: 'Carousel card' };
  const STATUS_LABELS = { unsaved: 'unsaved changes', draft: 'saved in draft' };
  const LIST_LABELS = { 'home.carousel': 'Carousel order', 'home.featured.saved': 'Saved featured cards order', 'home.spotlight.saved': 'Saved spotlight cards order' };
  const MANAGE_LABELS = { 'home.featured': 'featured cards', 'home.spotlight': 'spotlight cards', 'home.carousel': 'carousel cards' };
  const ICONS = {
    admin: '<path d="M12 3 5 6v5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
    pencil: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    stack: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
  };
  const svg = (name, cls) => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const time = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };

  let verified = false;
  let check = 0;                       // latest verification; older answers are ignored
  let state = { active: false, view: 'admin' };
  let ui = null;                       // header button, panel, preview bar, drawer (once verified)
  let observer = null;
  let workspace = null;
  let loading = null;                  // workspace.load() in flight
  let drawnKey = null;                 // what Admin Mode last drew (null: the loader's page)
  let imageStore = null;               // uploaded images (images.js createStore)
  let renewTimer = 0;                  // keeps signed preview URLs fresh
  let publisher = null;                // the Publish Changes dialog
  let manager = null;                  // Manage cards (manage.js)
  let history = null;                  // Version History (history.js)
  let addTile = null;                  // the carousel's "Add card" tile (Admin view)
  let previewId = null;                // saved card shown in its slot while edited

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
  function loadScript(src, ready) {
    if (ready()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = el('script');
      s.src = src;
      s.dataset.cmsAdmin = '';
      s.onload = () => (ready() ? resolve() : reject(new Error(src)));
      s.onerror = () => { s.remove(); reject(new Error(src)); };
      document.head.append(s);
    });
  }

  function mount() {
    verified = true;
    state = readState();
    Promise.all([
      loadStyles(),
      loadScript('/scripts/cms/workspace.js', () => !!cms.workspace),
      loadScript('/scripts/cms/images.js', () => !!cms.images),
      loadScript('/scripts/cms/drawer.js', () => !!cms.drawer),
      loadScript('/scripts/cms/image-editor.js', () => !!cms.imageEditor),
      loadScript('/scripts/cms/publish.js', () => !!cms.publish),
      loadScript('/scripts/cms/publish-dialog.js', () => !!cms.publishDialog),
      loadScript('/scripts/cms/manage.js', () => !!cms.manage),
      loadScript('/scripts/cms/history.js', () => !!cms.history)
    ]).then(() => {
      if (!verified || ui) return;
      start();
    }, () => { verified = false; console.info('Pergamon CMS: Admin Mode could not load its editor.'); });
  }

  function start() {
    workspace = cms.workspace.create({
      page: PAGE,
      scope: window.PERGAMON_SUPABASE_URL || '',
      storage: (() => { try { return window.sessionStorage; } catch (e) { return null; } })(),
      validate: cms.content.validateDocument,
      fallbackDoc: window.PergamonHomeContent && window.PergamonHomeContent.document,
      api: { getDraft: page => auth.getCmsDraft(page), saveDraft: (page, doc, expected) => auth.saveCmsDraft(page, doc, expected) }
    });
    workspace.onChange(() => { if (ui) { updateStatus(); decorate(); ui.drawer.refresh(); if (manager) manager.refresh(); } });
    imageStore = cms.images.createStore({
      base: window.PERGAMON_SUPABASE_URL || '',
      api: {
        reserve: (mime, bytes) => auth.createCmsMediaUpload(mime, bytes),
        upload: (path, file, mime) => auth.uploadCmsDraftMedia(path, file, mime),
        describe: ids => auth.getCmsMedia(ids),
        sign: (paths, seconds) => auth.signCmsDraftMedia(paths, seconds)
      },
      head: file => file.slice(0, 16).arrayBuffer().then(b => new Uint8Array(b)),
      decode: file => createImageBitmap(file).then(b => { const size = { width: b.width, height: b.height }; b.close(); return size; })
    });
    imageStore.onChange(() => { if (ui) { draw(); ui.drawer.refresh(); } });
    renewTimer = setInterval(resolveImages, 5 * 60 * 1000);
    ui = buildInterface();
    apply();
  }

  function unmount() {
    verified = false;
    state = { active: false, view: 'admin' };
    undecorate();
    if (home.holdMotion) home.holdMotion(false);
    if (publisher) { publisher.destroy(); publisher = null; }
    if (manager) { manager.destroy(); manager = null; }
    if (history) { history.destroy(); history = null; }
    addTile = null;
    if (ui) { ui.drawer.destroy(); ui.button.remove(); ui.panel.remove(); ui.bar.remove(); ui = null; }
    if (workspace) workspace.clearLocal();      // a signed-out browser keeps no edits
    workspace = null; loading = null; imageStore = null;
    clearInterval(renewTimer);
    if (window.PergamonTheme && window.PergamonTheme.previewSignedIn) window.PergamonTheme.previewSignedIn(null);
    cms.loader.hold(false);
    if (drawnKey !== null) drawPublished();
    drawnKey = null;
    document.documentElement.removeAttribute('data-cms-admin');
  }

  // Load published + draft once per sign-in (retried after a failure).
  function ensureLoaded() {
    if (!workspace) return Promise.reject(new Error('signed out'));
    if (workspace.isLoaded()) return Promise.resolve();
    if (!loading) {
      const ws = workspace;
      loading = ws.load().then(r => {
        if (r && r.error) { loading = null; if (r.error.code === 'PT403') verify(); throw new Error(r.error.message); }
      }, e => { loading = null; throw e; });
    }
    return loading;
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
    // First in the header's actions, after the Handbook's book icon if it is there.
    const book = actions && actions.querySelector('.pa-handbook-link');
    if (book) book.after(button); else if (actions) actions.prepend(button);

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

    // Published / saved draft / unsaved, at a glance.
    const stateList = el('ul', 'cms-admin-state');
    stateList.setAttribute('aria-label', 'Homepage content');
    const stateRows = {};
    [['published', 'Published'], ['draft', 'Saved draft'], ['unsaved', 'Unsaved']].forEach(([key, name]) => {
      const li = el('li', 'cms-admin-state-row');
      li.dataset.state = key;
      const value = el('span', 'cms-admin-state-value');
      li.append(el('span', 'cms-admin-state-dot'), el('span', 'cms-admin-state-name', name), value);
      stateRows[key] = value;
      stateList.append(li);
    });

    const publish = el('button', 'cms-admin-publish', 'Publish Changes');
    publish.type = 'button';
    publish.disabled = true;
    publish.setAttribute('aria-describedby', 'cms-admin-publish-note');
    const publishNote = el('p', 'cms-admin-note');
    publishNote.id = 'cms-admin-publish-note';

    const historyButton = el('button', 'cms-admin-history', 'Version History');
    historyButton.type = 'button';
    historyButton.disabled = true;

    panel.append(head, views, stateList, publish, publishNote, historyButton);
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

    const drawer = cms.drawer.create({
      workspace,
      content: cms.content,
      images: cms.images,
      imageStore,
      home,
      games: liveGames(),
      cardLabel: id => cardTitle(id),
      whenLoaded: ensureLoaded,
      onEdit: id => { draw(); home.reveal(id); decorate(); },
      onOpen: id => {
        draw();
        // A saved card is edited where it would appear: shown in its slot.
        setPreview(cms.content.isSaved(id) ? id : null);
        home.reveal(id);
        decorate();
        setEditing(id);
        requestAnimationFrame(() => requestAnimationFrame(() => bringIntoView(id)));
      },
      onClose: id => {
        setEditing(null);
        setPreview(null);
        // The page widens again and the carousel may redraw its tiles: focus
        // the card's pencil once that has happened (for a saved card, its
        // slot's Manage cards button, which lists it).
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (id) home.reveal(id);
          decorate();
          const slot = cms.content.isSaved(id) ? cms.content.slotOf(id) : null;
          const target = slot
            ? root.querySelector(`.cms-manage-button[data-cms-manage="${CSS.escape(slot)}"]`)
            : root.querySelector(`.cms-edit-pencil[data-cms-edit="${CSS.escape(id || '')}"]`) ||
              (cms.content.listOf(id) === cms.content.CAROUSEL ? root.querySelector('.cms-manage-button[data-cms-manage="home.carousel"]') : null);
          if (target) target.focus();
        }));
      },
      onForbidden: () => verify()
    });

    publisher = cms.publishDialog.create({
      workspace,
      content: cms.content,
      publish: cms.publish,
      cardLabel: id => cardTitle(id),
      api: {
        getDraft: page => auth.getCmsDraft(page),
        describe: ids => auth.getCmsMedia(ids),
        // A 401 means the function couldn't confirm the session: refresh it and try once more.
        prepare: id => auth.prepareCmsMedia(id).then(functionResult).then(r => (r.error && r.error.status === 401
          ? window.PergamonSupabaseClient.auth.refreshSession().then(() => auth.prepareCmsMedia(id)).then(functionResult)
          : r)),
        publish: (page, draftId, expected) => auth.publishCmsDraft(page, draftId, expected)
      },
      onPublished: () => {
        // The new live version: this browser's cache and every view follow it.
        cms.loader.refresh().catch(() => {}).then(() => { if (ui) { draw(); decorate(); updateStatus(); ui.drawer.refresh(); } });
      },
      onChanged: () => { if (ui) { draw(); decorate(); updateStatus(); ui.drawer.refresh(); } },
      onForbidden: () => verify(),
      returnFocus: () => { if (ui) ui.button.focus(); }
    });
    publish.addEventListener('click', () => {
      if (publish.disabled || !publisher) return;
      if (ui && ui.drawer.isOpen() && ui.drawer.busy()) return;
      setPanel(false);
      publisher.open();
    });

    manager = cms.manage.create({
      workspace,
      content: cms.content,
      home,
      games: liveGames(),
      cardLabel: id => cardTitle(id),
      openEditor: id => drawer.open(id),
      onChanged: () => { if (ui) { draw(); decorate(); updateStatus(); ui.drawer.refresh(); } },
      returnFocus: () => { if (ui) ui.button.focus(); }
    });

    history = cms.history.create({
      workspace,
      content: cms.content,
      publish: cms.publish,
      images: cms.images,
      api: {
        list: (page, limit) => auth.listCmsVersions(page, limit),
        restore: (page, id, expected) => auth.restoreCmsVersion(page, id, expected)
      },
      // The restored version is live: this browser's cache, the workspace's
      // published version and every view follow it (local edits are kept).
      onRestored: () => {
        Promise.all([cms.loader.refresh().catch(() => {}), workspace.load().catch(() => {})])
          .then(() => { if (ui) { draw(); decorate(); updateStatus(); ui.drawer.refresh(); } });
      },
      onForbidden: () => verify(),
      returnFocus: () => { if (ui) ui.button.focus(); }
    });
    historyButton.addEventListener('click', () => {
      if (historyButton.disabled || !history) return;
      if (ui && ui.drawer.isOpen() && ui.drawer.busy()) return;
      setPanel(false);
      history.open();
    });

    button.addEventListener('click', () => setPanel(panel.hidden));
    toggle.addEventListener('click', () => setActive(!state.active));

    return { button, panel, toggle, viewButtons, stateRows, bar, barText, drawer, publish, publishNote, historyButton };
  }

  // A saved card shown in its slot (null: the active cards), in Admin view only.
  function setPreview(id) {
    if (previewId === id) return;
    previewId = id && home.previewSaved ? (home.previewSaved(id) ? id : null) : null;
    if (!previewId && home.previewSaved) home.previewSaved(null);
    root.querySelectorAll('.cms-preview-badge').forEach(n => n.remove());
    if (previewId) {
      const host = home.element(previewId);
      if (host) {
        const badge = el('span', 'cms-preview-badge', 'Preview: saved card, not active');
        host.append(badge);
      }
    }
  }

  // publish-media's answer (supabase-js functions.invoke) → { ok } | { error: { status, code, message } }.
  async function functionResult(r) {
    if (r && !r.error) return { ok: true };
    const res = r && r.error && r.error.context;
    let body = null;
    try { body = res && typeof res.json === 'function' ? await res.json() : null; } catch (e) {}
    return { error: { status: res && res.status, code: (body && body.error) || '', message: (body && body.message) || 'The image service didn’t answer.' } };
  }

  // Games a card may link to: live entries of /data/entries.js.
  function liveGames() {
    const games = (window.atlasEntries && window.atlasEntries.games) || [];
    return games
      .filter(e => e && e.path && !e.archived && e.visibility === 'public' && e.status !== 'coming-soon')
      .map(e => ({ path: String(e.path).replace(/\/+$/, '') + '/', name: e.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function setPanel(open) {
    if (!ui) return;
    ui.panel.hidden = !open;
    ui.button.setAttribute('aria-expanded', String(open));
    if (open) {
      const top = ui.button.getBoundingClientRect().bottom + 10;
      ui.panel.style.top = `${Math.round(top)}px`;
      updateStatus();
      ui.toggle.focus();
      // Another administrator may have saved or published since: ask the
      // server again (local edits are kept), so the states and Publish
      // Changes are current.
      if (workspace && workspace.isLoaded() && !ui.drawer.busy() && !(publisher && publisher.isOpen())) {
        workspace.load().then(() => { if (ui) { draw(); decorate(); updateStatus(); } }, () => {});
      }
    }
  }

  function onKey(event) {
    if (event.key !== 'Escape') return;
    if (ui && !ui.panel.hidden) { setPanel(false); ui.button.focus(); }
  }
  function onPointer(event) {
    const t = event.target;
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

  // Reflect state everywhere: panel, header button, preview bar, page, cards, drawer, appearance.
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
    // While Admin Mode is on it decides what the page shows; the loader only records updates.
    cms.loader.hold(state.active);
    // Cards stay still while they can be edited (pencils sit on the real cards).
    if (home.holdMotion) home.holdMotion(editing);
    if (editing) {
      ensureLoaded().then(() => { if (ui && state.active && state.view === 'admin') { draw(); decorate(); updateStatus(); } }).catch(() => updateStatus());
      draw();
      decorate();
      ui.drawer.show();
    } else {
      ui.drawer.hide();
      undecorate();
      if (state.active || drawnKey !== null) drawPublished();
      // After a publish this browser may not have the new version's public images yet.
      const pub = workspace && workspace.isLoaded() ? workspace.published() : null;
      const live = cms.loader.published();
      if (state.active && pub && (!live || live.version !== pub.id)) {
        cms.loader.refresh().then(() => { if (ui && state.active && state.view !== 'admin') { drawnKey = null; drawPublished(); } }, () => {});
      }
    }
    updateStatus();
  }

  // ── What the page shows ───────────────────────────────────────────────
  function publishedView() {
    const live = cms.loader.published();                       // { version, doc, media } from the public API
    const server = workspace && workspace.isLoaded() ? workspace.published() : null;
    const media = live ? live.media : {};
    if (server) return { doc: server.doc, media };
    if (live) return { doc: live.doc, media };
    return { doc: window.PergamonHomeContent.document, media: {} };
  }
  function render(doc, media) {
    const key = cms.workspace.canon(doc) + cms.workspace.canon(media);
    if (key === drawnKey) return;
    if (home.render(doc, { media })) drawnKey = key;
  }
  function drawPublished() { const p = publishedView(); render(p.doc, p.media); }
  // Admin view: the working copy (once loaded), with its private draft
  // images; otherwise the published content (published images only).
  function draw() {
    if (state.active && state.view === 'admin' && workspace && workspace.isLoaded()) {
      render(workspace.working(), Object.assign({}, imageStore ? imageStore.map() : {}, publishedView().media));
      resolveImages();
    } else {
      drawPublished();
    }
  }
  // Look up images the working copy uses that aren't known yet (or whose
  // preview URL is about to expire); the store redraws when they arrive.
  function resolveImages() {
    if (!imageStore || !workspace || !workspace.isLoaded() || !(state.active && state.view === 'admin')) return;
    const known = cms.loader.published();
    const ids = cms.content.mediaIds(workspace.working()).filter(id => !(known && known.media && known.media[id]));
    imageStore.resolve(ids).then(r => { if (r && r.error && r.error.code === 'PT403') verify(); });
  }

  function updateStatus() {
    if (!ui) return;
    const loaded = workspace && workspace.isLoaded();
    const pub = loaded ? workspace.published() : null;
    const draft = loaded ? workspace.draft() : null;
    const unsaved = loaded ? workspace.unsavedCards() : [];
    const unsavedCards = unsaved.filter(id => cms.content.cardType(id)).length;
    const live = cms.loader.published();
    ui.stateRows.published.textContent = pub ? `Version ${pub.id}` : live ? `Version ${live.version}` : 'Built-in content';
    ui.stateRows.draft.textContent = !loaded ? (loading ? 'Loading…' : '—') : draft ? `Saved at ${time(draft.savedAt)}` : 'None';
    ui.stateRows.unsaved.textContent = !loaded ? '—' : unsavedCards ? `${unsavedCards} card${unsavedCards === 1 ? '' : 's'}` : unsaved.length ? 'Card order' : 'None';
    ui.historyButton.disabled = !state.active;
    ui.stateRows.unsaved.parentElement.dataset.on = String(unsaved.length > 0);
    ui.stateRows.draft.parentElement.dataset.on = String(!!draft);
    ui.button.classList.toggle('has-unsaved', unsaved.length > 0);
    // Publish Changes: the saved draft, for verified admins with Admin Mode on.
    const canPublish = state.active && loaded && !!draft && !(publisher && publisher.isOpen());
    ui.publish.disabled = !canPublish;
    ui.publishNote.textContent = !state.active ? 'Turn on Admin Mode to publish.'
      : !loaded ? 'Loading the saved draft…'
      : !draft ? 'Nothing to publish yet: use Save Draft in the card editor first.'
      : unsaved.length ? 'Publishes the saved draft. Unsaved changes are not included; you’ll be asked about them.'
      : 'Publishes the saved draft for every visitor. You’ll see a summary first.';
  }

  // ── Card indicators ───────────────────────────────────────────────────
  // A component's name in lists and messages: its title; a deleted card's
  // last saved title; a list's name.
  function cardTitle(id) {
    if (LIST_LABELS[id]) return LIST_LABELS[id];
    const loaded = workspace && workspace.isLoaded();
    const c = loaded ? workspace.component(id) : null;
    if (c && c.title) return c.title;
    const saved = loaded ? workspace.savedComponent(id) : null;
    if (saved && saved.title) return `${saved.title} (deleted)`;
    const m = home.model();
    const all = [m.featured, m.spotlight].concat(m.carousel || [], ...Object.values(m.saved || {}));
    const item = all.filter(Boolean).find(x => x.id === id);
    return (item && item.title) || id;
  }

  function decorate() {
    if (!(state.active && state.view === 'admin')) return;
    const editingId = ui && ui.drawer.isOpen() ? ui.drawer.current() : null;
    const loaded = workspace && workspace.isLoaded();
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
        pencil.setAttribute('aria-controls', 'cms-drawer');
        pencil.innerHTML = svg('pencil', 'cms-edit-icon') + '<span class="cms-edit-badge" aria-hidden="true"></span>';
        pencil.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          if (ui) ui.drawer.open(pencil.dataset.cmsEdit);
        });
        host.append(frame, pencil);
      }
      pencil.dataset.cmsEdit = id;
      const status = loaded ? workspace.cardStatus(id) : 'published';
      if (pencil.dataset.status !== status) pencil.dataset.status = status;
      host.classList.toggle('cms-editing', id === editingId);
      const expanded = String(id === editingId);
      if (pencil.getAttribute('aria-expanded') !== expanded) pencil.setAttribute('aria-expanded', expanded);
      const label = `Edit ${TYPE_LABELS[type].toLowerCase()}: ${cardTitle(id)}${STATUS_LABELS[status] ? ` (${STATUS_LABELS[status]})` : ''}`;
      if (pencil.getAttribute('aria-label') !== label) pencil.setAttribute('aria-label', label);
      // Featured / Spotlight: Manage cards beside the pencil.
      if (cms.content.slotOf(id) === id) manageButton(host, id, pencil);
    });
    const carousel = root.querySelector('.home-carousel');
    if (carousel) manageButton(carousel, cms.content.CAROUSEL, null);
    // The carousel's "Add card" tile follows the cards while Admin view holds the row.
    if (!addTile) {
      addTile = el('div', 'cms-add-tile-item');
      const b = el('button', 'cms-add-tile');
      b.type = 'button';
      b.innerHTML = svg('plus', 'cms-add-icon');
      b.append(el('span', 'cms-add-label', 'Add card'), el('span', 'cms-add-note'));
      b.addEventListener('click', () => {
        if (!ui || !workspace || !workspace.isLoaded() || !manager) return;
        manager.addCarouselCard();
      });
      addTile.append(b);
      if (home.setCarouselTail) home.setCarouselTail(addTile);
    }
    const n = loaded ? workspace.order(cms.content.CAROUSEL).length : 0;
    const full = n >= cms.content.LIMITS.carousel;
    const addButton = addTile.firstChild;
    addButton.disabled = !loaded || full;
    addButton.lastChild.textContent = full ? `Limit of ${cms.content.LIMITS.carousel} cards reached` : '';
    const addLabel = full ? `Add carousel card (limit of ${cms.content.LIMITS.carousel} reached)` : 'Add carousel card';
    if (addButton.getAttribute('aria-label') !== addLabel) addButton.setAttribute('aria-label', addLabel);
    // Carousel redraws (filters, sections, content) replace tiles: decorate whatever appears.
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

  // "Manage cards" for a slot or the carousel (beside the pencil, or on the
  // carousel's corner): placed absolutely, so no box changes size.
  function manageButton(host, which, after) {
    let b = host.querySelector(':scope > .cms-manage-button');
    if (!b) {
      b = el('button', 'cms-manage-button');
      b.type = 'button';
      b.dataset.cmsManage = which;
      b.setAttribute('aria-haspopup', 'dialog');
      b.innerHTML = svg('stack', 'cms-edit-icon');
      b.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (!ui || !manager) return;
        const open = () => manager.open(which, b);
        if (!workspace.isLoaded()) ensureLoaded().then(open, () => {});
        else open();
      });
      host.classList.add('cms-manageable');
      if (after) after.after(b); else host.append(b);
    }
    const loaded = workspace && workspace.isLoaded();
    const n = loaded ? workspace.order(which === cms.content.CAROUSEL ? which : cms.content.savedList(which)).length : null;
    const label = `Manage ${MANAGE_LABELS[which]}` + (n === null ? '' : which === cms.content.CAROUSEL ? ` (${n})` : ` (${n} saved)`);
    if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
  }

  function undecorate() {
    if (observer) { observer.disconnect(); observer = null; }
    setPreview(null);
    if (addTile && home.setCarouselTail) home.setCarouselTail(null);
    addTile = null;
    root.querySelectorAll('.cms-edit-pencil, .cms-edit-frame, .cms-manage-button').forEach(n => n.remove());
    root.querySelectorAll('.cms-editable, .cms-editing, .cms-manageable').forEach(n => n.classList.remove('cms-editable', 'cms-editing', 'cms-manageable'));
  }

  function setEditing(id) {
    root.querySelectorAll('.cms-editing').forEach(n => n.classList.remove('cms-editing'));
    decorate();
    if (!id) root.querySelectorAll('.cms-edit-pencil[aria-expanded="true"]').forEach(p => p.setAttribute('aria-expanded', 'false'));
  }

  // Keep the card being edited in sight beside (or above) the drawer.
  function bringIntoView(id) {
    const card = home.element(id);
    if (!card) return;
    const r = card.getBoundingClientRect();
    const header = document.querySelector('.pa-header');
    const top = header ? header.getBoundingClientRect().bottom : 0;
    const drawerEl = document.getElementById('cms-drawer');
    const sheet = drawerEl && getComputedStyle(drawerEl).getPropertyValue('--cms-sheet') === '1';
    const bottom = sheet ? drawerEl.getBoundingClientRect().top : window.innerHeight;
    if (r.top >= top + 8 && r.bottom <= bottom - 8) return;
    window.scrollTo({ top: Math.max(0, window.scrollY + r.top - top - 12), behavior: 'auto' });
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
