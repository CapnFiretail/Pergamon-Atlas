// "Game Library" (Admin Mode): every game's own details, in one place, for the
// cards that refer to it on any page (docs/cms/ARCHITECTURE.md §13). One versioned
// document of its own: its draft, publishing, history and conflicts are the shared
// workspace's and dialogs' (workspace.js, publish-dialog.js, history.js), with
// library-editing.js in place of a page's content.js.
//
//   games        in order, with their state; add one (with an id that never changes)
//   details      name, description, category, destination, availability; square and
//                wide artwork with their default framing; where the game is used
//   leaving      a game that was published is archived, never removed; one that
//                wasn't may be removed, after naming the pages that use it
//   first one    nothing is made by itself: "Start with the built-in games" fills the
//                working copy, which is saved and published like any edit
//
// Created by admin.js: gameLibrary.create({ api, scope, storage, createHistory,
//   images, imageStore, publish, builtIn, artModel(art), localUses(), onChanged(),
//   onPublished(), onForbidden(), returnFocus() })
//   api   getDraft, saveDraft, discardDraft, uses, overrides, list, describe,
//         prepare, publish
//   → { ensure(), isLoaded(), records(), published(), mediaIds(), status(), notices(doc),
//       setArtwork(artwork), open(game, from), isOpen(), refresh(), clearLocal(), destroy() }
//   records()     the working copy's, by id, each `unpublished` where visitors don't
//                 have it so; published(): what visitors have (hidden ones left out)
//   setArtwork({ game: { art?, wide? } })   in the working copy, as one step → done or not
//   notices(doc)  what publishing a page's document must be told about its games
(function () {
  'use strict';
  const cms = window.PergamonCMS = window.PergamonCMS || {};
  const library = cms.library, editing = cms.libraryEditing;
  if (!library || !editing) return;
  const LIST = library.LIST, keyOf = library.keyOf;
  const ICONS = {
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
  };
  const svg = name => `<svg class="cms-edit-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  let uidCount = 0;
  const uid = p => `${p}-${++uidCount}`;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const AVAILABILITY = Object.fromEntries(library.AVAILABILITY.map(a => [a.value, a.label]));
  // The cards the artwork is framed on: a tile, and a Featured card as large as the
  // homepage's on a 1440-pixel screen, or stacked on a 390-pixel one.
  const FEATURE = {
    desktop: { width: 946, height: 260, minHeight: 0, compact: false, stacked: false, frame: 'sidebar', here: false, note: 'Featured card, as on a 1440-pixel screen' },
    phone: { width: 358, height: null, minHeight: 320, compact: true, stacked: true, frame: 'sidebar', here: false, note: 'Featured card, as on a 390-pixel screen' }
  };

  function create(env) {
    const same = cms.workspace.same;
    const ws = cms.workspace.create({
      page: 'library', scope: env.scope, storage: env.storage, validate: library.validateDocument, fallbackDoc: editing.empty(),
      lists: [LIST], createHistory: env.createHistory,
      api: { getDraft: env.api.getDraft, saveDraft: env.api.saveDraft }
    });
    ws.onChange(() => { memo = null; env.onChanged(); refresh(); });

    // ── Loading, and what others ask of it ───────────────────────────────
    let loading = null, memo = null;
    function ensure() {
      if (ws.isLoaded()) return Promise.resolve();
      if (!loading) {
        loading = ws.load().then(r => { if (r && r.error) { if (r.error.code === 'PT403') env.onForbidden(); throw new Error(r.error.message); } })
          .finally(() => { loading = null; });
      }
      return loading;
    }
    const liveDoc = () => { const p = ws.published(); return p ? p.doc : null; };
    function records() {
      if (!ws.isLoaded()) return {};
      if (memo) return memo;
      const live = library.records(liveDoc()), now = library.records(ws.working());
      Object.keys(now).forEach(id => { if (!same(now[id], live[id])) now[id].unpublished = true; });
      return (memo = now);
    }
    function published() {
      const all = library.records(liveDoc()), out = {};
      Object.keys(all).forEach(id => { if (library.listed(all[id].availability)) out[id] = all[id]; });
      return out;
    }
    const nameOf = id => { const r = records()[id] || library.records(liveDoc())[id]; return r ? r.name : id; };
    const mediaIds = () => (ws.isLoaded() ? cms.content.mediaIds(ws.working()) : []);
    // 'empty' (nothing saved yet) · 'unsaved' · 'draft' · 'published', '' before it is loaded.
    const status = () => (!ws.isLoaded() ? '' : ws.unstored() && !ws.unsavedCards().length ? 'empty' : ws.unsavedCards().length ? 'unsaved' : ws.draft() ? 'draft' : 'published');
    const names = ids => ids.map(id => `“${nameOf(id)}”`).join(', ');

    function setArtwork(artwork) {
      const doc = JSON.parse(JSON.stringify(ws.working()));
      const ids = Object.keys(artwork);
      if (!ids.every(id => doc.components[keyOf(id)])) return false;
      ids.forEach(id => Object.assign(doc.components[keyOf(id)], artwork[id]));
      return ws.setDocument(doc);
    }
    // For a page about to be published. Asked of the server, as it is now.
    async function notices(doc) {
      const refs = cms.content.gameRefs(doc), out = [];
      if (!refs.length) return out;
      const r = await ws.load();
      if (r && r.error) throw new Error(r.error.message);
      const live = library.records(liveDoc()), now = records();
      const action = { label: 'Open Game Library', run: () => open(missing[0] || refs[0]) };
      const missing = refs.filter(id => !live[id]);
      if (missing.length) out.push({ block: true, action, lines: [`Not in the published Game Library: ${names(missing)}. Publish the Game Library first, or choose other games for these cards.`, 'Nothing is lost: the draft is kept as it is.'] });
      const hidden = refs.filter(id => live[id] && !library.listed(live[id].availability));
      if (hidden.length) out.push({ lines: [`Visitors won’t see the cards for ${names(hidden)}: ${hidden.length === 1 ? 'it is' : 'they are'} hidden or archived in the Game Library.`] });
      const soon = [].concat(...cms.content.instancesOf(doc).filter(i => cms.content.widgets.playable(i.type)).map(i => { const key = cms.content.instanceKey(i.id); return ((doc.components[key] || {}).order || []).map(k => (doc.components[key + '.' + k] || {}).game); })).filter((id, n, all) => live[id] && live[id].availability === 'coming-soon' && all.indexOf(id) === n);
      if (soon.length) out.push({ lines: [`Coming soon, so not shown in a carousel: ${names(soon)}.`] });
      const changed = refs.filter(id => live[id] && now[id] && now[id].unpublished);
      if (changed.length) out.push({ lines: [`${names(changed)}: the Game Library has changes that aren’t published. Publishing this page shows the published details.`] });
      return out;
    }
    // For the library itself about to be published.
    async function ownNotices(server) {
      const before = server.published && server.published.content, after = server.draft.content, out = [];
      await loadUses();
      editing.identityChanges(before, after).forEach(c => out.push({
        lines: [
          `“${c.before.name}” (${c.id}) changes both its name and its destination:`,
          `Name: ${c.before.name} → ${c.after.name}. Destination: ${c.before.destination} → ${c.after.destination}.`,
          usedText(c.id) ? `Every card that uses it shows the new one: ${usedText(c.id)}.` : 'No page uses it.',
          'If this is another game, give it an id of its own instead.'
        ],
        confirm: `${c.after.name} is the same game: publish the change`
      }));
      const soon = editing.postponed(before, after).filter(g => usedText(g.id));
      if (soon.length) out.push({ lines: soon.map(g => `“${g.name}” becomes coming soon: it leaves any carousel it is in, and stays where every game is listed (${usedText(g.id)}).`) });
      const gone = editing.unlisted(before, after);
      if (gone.length) out.push({ lines: gone.map(g => `“${g.name}” is no longer listed${usedText(g.id) ? `: its cards disappear for visitors (${usedText(g.id)})` : ''}. Its own page stays reachable.`) });
      return out;
    }

    // ── Where games are used ─────────────────────────────────────────────
    let uses = null;              // by game, or null: not known
    async function loadUses() {
      const r = await env.api.uses().catch(e => ({ error: e }));
      uses = r.error ? null : editing.usesOf(r.data);
      if (r.error && r.error.code === 'PT403') env.onForbidden();
    }
    function useLines(id) {
      const lines = ((uses || {})[id] || []).map(u => `${u.name}: ${[u.live ? `${plural(u.live, 'card', 'cards')} live` : '', u.draft ? `${u.draft} in the draft` : ''].filter(Boolean).join(', ')}`);
      const here = env.localUses(id);
      if (here) lines.push(here);
      return lines;
    }
    const usedText = id => useLines(id).join('; ');

    // ── Frame (the publish dialog's, as Site Navigation) ─────────────────
    const overlay = el('div', 'cms-publish cms-library');
    overlay.hidden = true;
    const dialog = el('div', 'cms-publish-dialog cms-library-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const head = el('header', 'cms-nav-head');
    const title = el('h2', 'cms-publish-title', 'Game Library');
    title.id = uid('cms-library-title');
    dialog.setAttribute('aria-labelledby', title.id);
    const state = el('p', 'cms-drawer-status');
    head.append(el('p', 'cms-drawer-eyebrow', 'Admin Mode · Whole website'), title, state);
    const intro = el('p', 'cms-manage-intro', 'Every game’s own details, shared by all cards that refer to it. The library is saved and published by itself; a page’s draft and history never change it.');
    intro.id = uid('cms-library-intro');
    dialog.setAttribute('aria-describedby', intro.id);
    const body = el('div', 'cms-library-body');
    const listCol = el('section', 'cms-nav-col cms-library-list');
    listCol.setAttribute('aria-label', 'Games');
    const detailCol = el('section', 'cms-nav-col cms-library-detail');
    detailCol.setAttribute('aria-label', 'Selected game');
    body.append(listCol, detailCol);
    const ask = el('div', 'cms-publish-warning cms-library-ask');
    ask.setAttribute('role', 'alertdialog');
    ask.hidden = true;
    const statusLine = el('p', 'cms-publish-status');
    statusLine.setAttribute('role', 'status');
    statusLine.setAttribute('aria-live', 'polite');
    const foot = el('div', 'cms-library-foot');
    const tools = el('div', 'cms-library-tools'), actions = el('div', 'cms-publish-actions');
    foot.append(tools, actions);
    dialog.append(head, intro, body, ask, statusLine, foot);
    overlay.append(dialog);
    document.body.append(overlay);

    let selected = null;          // game id
    let adding = null;            // the form of a game being added
    let saving = false;
    let conflict = null;          // a save conflict waiting for a choice
    let opener = null;
    let failed = null;            // why it couldn't be loaded

    function say(text, kind) { statusLine.textContent = text || ''; statusLine.dataset.kind = kind || ''; }
    function button(text, cls, onClick) {
      const b = el('button', cls, text);
      b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    }
    const isOpen = () => !overlay.hidden;
    const working = () => ws.working();
    const order = () => library.order(working());
    const record = id => ws.component(keyOf(id));
    const isLive = id => !!library.records(liveDoc())[id];
    const focusSel = sel => requestAnimationFrame(() => { const n = dialog.querySelector(sel); if (n) n.focus(); });

    // ── The details form (fields.js) ─────────────────────────────────────
    const form = el('form', 'cms-library-form');
    form.noValidate = true;
    form.addEventListener('submit', e => e.preventDefault());
    const view = {
      artModel: env.artModel,
      cardSize: (id, layout, room, field) => (field.cardType === 'feature' ? FEATURE[layout] : null),
      previewArt: () => true,
      sample(key, field) {
        const C = window.PergamonComponents, g = ws.component(key);
        if (!g) return null;
        if (field.cardType === 'feature') {
          const b = C.featureBanner({ variant: 'hero' });
          b.apply({ title: g.name, actionLabel: 'Play Now', href: g.destination, art: env.artModel(g[field.key]) });
          return { element: b.element, art: a => b.applyArt(env.artModel(a)) };
        }
        const card = C.contentCard({ title: g.name, meta: g.category, href: g.destination, art: env.artModel(g[field.key]) });
        return { element: card.element, art: a => card.setArt(env.artModel(a)) };
      }
    };
    const fields = cms.fields.create({
      form, workspace: ws, content: editing.content, view, images: env.images, imageStore: env.imageStore, games: [],
      place: field => {
        const cls = field.type === 'image' ? 'cms-library-art' : 'cms-library-fields';
        let box = form.querySelector('.' + cls);
        if (!box) { box = el('div', cls); form.append(box); }
        return box;
      },
      destinations: key => {
        const id = library.idOf(key), all = library.records(working()), now = all[id] ? all[id].destination : '';
        const taken = new Set(Object.keys(all).filter(k => k !== id).map(k => all[k].destination));
        return destinations().filter(d => !taken.has(d.path) || d.path === now);
      },
      check: (field, value, key) => (field.type === 'destination' ? editing.destinationProblem(value, library.idOf(key), working()) : null),
      onEdit: () => {},
      changed: () => { drawState(); drawActions(); },
      onForbidden: () => env.onForbidden()
    });
    // The game pages this build has.
    const destinations = () => env.builtIn.order.map(id => env.builtIn.games[id]).map(g => ({ path: g.destination, name: `${g.destination}` }));

    // ── Drawing ──────────────────────────────────────────────────────────
    const LABELS = { unsaved: 'Unsaved changes', draft: 'Saved in draft' };
    function drawState() {
      if (!ws.isLoaded()) { state.textContent = failed ? 'Not loaded' : 'Loading…'; state.dataset.status = ''; return; }
      const s = status(), pub = ws.published();
      state.textContent = s === 'unsaved' ? 'Unsaved changes: only in this browser until you save a draft.'
        : s === 'draft' ? 'Saved in draft: visitors still see the published library.'
        : pub ? `Published: version ${pub.id}.` : 'Nothing saved yet: pages show the built-in games.';
      state.dataset.status = s;
    }
    function gameMeta(id) {
      const g = record(id);
      return [g.category, AVAILABILITY[g.availability]].join(' · ');
    }
    function thumb(art) {
      const box = el('span', 'cms-manage-thumb');
      box.setAttribute('aria-hidden', 'true');
      const a = art ? env.artModel(art) : null;
      if (a && a.src) { const img = el('img'); img.src = a.src; img.alt = ''; img.decoding = 'async'; if (a.focus) img.style.objectPosition = a.focus; box.append(img); }
      else box.append(el('span', 'cms-manage-thumb-empty', 'No image'));
      return box;
    }
    function drawList() {
      const top = listCol.scrollTop;
      listCol.replaceChildren(el('h3', 'cms-nav-col-title', 'Games'));
      if (!ws.isLoaded()) {
        listCol.append(el('p', 'cms-manage-empty', failed || 'Loading the saved library…'));
        if (failed) listCol.append(button('Try again', 'cms-drawer-secondary', load));
        return;
      }
      const ids = order();
      if (!ids.length) {
        listCol.append(el('p', 'cms-manage-empty', 'No games yet.'));
        if (ws.unstored()) listCol.append(button(`Start with the built-in games (${env.builtIn.order.length})`, 'cms-drawer-secondary cms-library-start', start));
      }
      const ul = el('ul', 'cms-nav-list');
      ids.forEach(id => {
        const g = record(id), s = ws.cardStatus(keyOf(id));
        const li = el('li', 'cms-nav-row cms-library-row' + (id === selected && !adding ? ' is-selected' : '') + (library.listed(g.availability) ? '' : ' is-hidden'));
        const pick = el('button', 'cms-nav-pick');
        pick.type = 'button';
        pick.dataset.game = id;
        pick.setAttribute('aria-pressed', String(id === selected && !adding));
        const text = el('span', 'cms-nav-pick-text');
        text.append(el('span', 'cms-nav-pick-label', g.name), el('span', 'cms-nav-pick-meta', gameMeta(id)));
        pick.append(thumb(g.art), text);
        if (LABELS[s]) { const dot = el('span', 'cms-library-dot'); dot.dataset.status = s; dot.title = LABELS[s]; pick.append(dot, el('span', 'pa-visually-hidden', LABELS[s])); }
        pick.addEventListener('click', () => choose(id));
        li.append(pick);
        ul.append(li);
      });
      const add = button('', 'cms-drawer-secondary cms-nav-add', startAdding);
      add.innerHTML = svg('plus');
      add.append(' Add game');
      add.disabled = ids.length >= library.LIMIT;
      const bar = el('div', 'cms-nav-list-tools');
      bar.append(add, el('p', 'cms-manage-count', `${ids.length} of ${library.LIMIT} games`));
      listCol.append(ul, bar);
      listCol.scrollTop = top;
    }

    // Everything about the selected game that isn't a field.
    const about = el('div', 'cms-library-about');
    function drawAbout() {
      about.replaceChildren();
      if (!selected || adding) return;
      const g = record(selected), ids = order(), at = ids.indexOf(selected), live = isLive(selected);
      const used = el('div', 'cms-library-uses');
      used.append(el('h4', 'cms-admin-label', 'Used on'));
      const lines = uses === null ? ['Couldn’t be asked. Reopen the library to try again.'] : useLines(selected);
      const ul = el('ul', 'cms-history-changes');
      (lines.length ? lines : ['No page’s cards refer to it.']).forEach(t => ul.append(el('li', '', t)));
      used.append(ul);
      const row = el('div', 'cms-nav-order');
      const move = (label, icon, to, key) => {
        const b = button('', 'cms-drawer-secondary cms-nav-move', () => { ws.moveCard(keyOf(selected), to); say(`Moved “${g.name}” to position ${to + 1} of ${ids.length}.`); focusSel(`[data-move="${key}"]:not(:disabled), [data-move]:not(:disabled)`); });
        b.dataset.move = key;
        b.innerHTML = svg(icon);
        b.append(' ' + label);
        b.disabled = to < 0 || to >= ids.length;
        return b;
      };
      row.append(move('Move up', 'up', at - 1, 'up'), move('Move down', 'down', at + 1, 'down'));
      if (ws.cardStatus(keyOf(selected)) === 'unsaved' && ws.savedComponent(keyOf(selected))) {
        row.append(button('Discard its changes', 'cms-drawer-ghost', () => { ws.discardCard(keyOf(selected)); fields.forget(); fields.fill(); say(`“${nameOf(selected)}” is back as last saved. Undo brings your changes back.`); }));
      }
      if (live && g.availability !== 'archived') row.append(button('Archive game', 'cms-drawer-ghost cms-nav-remove', () => { ws.setField(keyOf(selected), 'availability', 'archived'); fields.fill(); say(`“${g.name}” is archived in your draft. Its id and history are kept, and you can make it available again.`); }));
      if (!live) row.append(button('Remove game…', 'cms-drawer-ghost cms-nav-remove', () => remove(selected)));
      about.append(used, row);
      if (live) about.append(el('p', 'cms-field-hint', 'A game that has been published is archived, never removed.'));
    }
    let built = null;             // the game the form was built for
    function drawDetail() {
      if (adding) return;
      if (!selected || !record(selected)) {
        built = null;
        fields.clear();
        detailCol.replaceChildren(el('h3', 'cms-nav-col-title', 'Game'), el('p', 'cms-manage-empty', ws.isLoaded() && order().length ? 'Select a game to edit it.' : 'Games appear here.'));
        return;
      }
      if (built !== selected) {
        built = selected;
        const h = el('div', 'cms-library-head');
        const idChip = el('code', 'cms-library-id', selected);
        h.append(el('h3', 'cms-nav-col-title', 'Game details'), el('span', 'cms-field-hint', 'Id'), idChip);
        detailCol.replaceChildren(h, form, about);
        fields.build(keyOf(selected));
        detailCol.scrollTop = 0;
      } else fields.fill();
      drawAbout();
    }

    function drawActions() {
      tools.replaceChildren(); actions.replaceChildren();
      if (!ws.isLoaded()) { actions.append(button('Close', 'cms-drawer-secondary', () => close(true))); return; }
      if (conflict) {
        actions.append(button('Use the newer draft', 'cms-drawer-secondary', () => resolve(false)), button('Keep my changes and save', 'cms-drawer-primary cms-library-keep', () => resolve(true)));
        return;
      }
      const unsaved = ws.unsavedCards(), bad = fields.hasErrors() || fields.busy();
      const undo = button('Undo', 'cms-drawer-ghost', () => step('undo')), redo = button('Redo', 'cms-drawer-ghost', () => step('redo'));
      undo.disabled = !ws.canUndo(); redo.disabled = !ws.canRedo();
      const history = button('Version History', 'cms-drawer-ghost', () => { hide(); historyDialog.open(); });
      tools.append(undo, redo, history);
      if (unsaved.length) tools.append(button('Discard changes', 'cms-drawer-ghost', discardChanges));
      else if (ws.draft()) tools.append(button('Discard draft…', 'cms-drawer-ghost', discardDraft));
      const save = button(saving ? 'Saving…' : 'Save Draft', 'cms-drawer-primary cms-library-save', saveDraft);
      save.disabled = saving || bad || !unsaved.length;
      const publish = button('Publish…', 'cms-drawer-secondary cms-library-publish', () => { hide(); publishDialog.open(); });
      publish.disabled = saving || bad || (!ws.draft() && !unsaved.length);
      actions.append(button('Done', 'cms-drawer-secondary', () => close(true)), publish, save);
    }
    function drawAll() { drawState(); drawList(); drawDetail(); drawActions(); }
    // (Focus stays where it was when the list is drawn again.)
    function redraw() {
      const a = document.activeElement, game = a && listCol.contains(a) ? a.dataset.game : null;
      drawAll();
      if (game) { const n = listCol.querySelector(`[data-game="${CSS.escape(game)}"]`); if (n) n.focus(); }
    }
    let queued = false;
    function refresh() {
      if (!isOpen() || queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (!isOpen()) return;
        if (conflict && !ws.unsavedCards().length) conflict = null;
        if (selected && ws.isLoaded() && !record(selected)) selected = order()[0] || null;
        redraw();
      });
    }

    // ── Edits ────────────────────────────────────────────────────────────
    function choose(id) {
      closeAsk();
      adding = null;
      built = selected === id && detailCol.contains(form) ? built : null;
      selected = id;
      say('');
      redraw();
    }
    function step(which) {
      if (!ws[which]()) return;
      fields.forget();
      built = null;
      if (selected && !record(selected)) selected = order()[0] || null;
      redraw();
    }
    async function start() {
      say('Reading the visibility settings stored for the built-in games…');
      const r = await env.api.overrides().catch(e => ({ error: e }));
      const doc = editing.firstLibrary(env.builtIn, r.error ? [] : r.data);
      if (!ws.setDocument(doc)) { say('The built-in games couldn’t be added.', 'error'); return; }
      const hidden = order().filter(id => !library.listed(record(id).availability));
      selected = order()[0];
      redraw();
      say(`Added ${plural(order().length, 'game', 'games')} as unsaved changes${hidden.length ? `; hidden, as set before: ${names(hidden)}` : ''}${r.error ? '. The stored visibility settings couldn’t be read: check each game’s availability' : ''}. Nothing is saved or published until you do.`, r.error ? 'error' : '');
      focusSel('.cms-nav-pick');
    }

    // A new game: its id is chosen once.
    function startAdding() {
      closeAsk();
      adding = el('form', 'cms-drawer-form cms-library-new');
      adding.noValidate = true;
      const docs = () => ws.docs();
      const field = (label, hint) => {
        const wrap = el('div', 'cms-field'), input = el('input', 'cms-field-input'), error = el('p', 'cms-field-error');
        const id = uid('cms-library-new');
        input.type = 'text'; input.id = id; input.setAttribute('autocomplete', 'off'); input.spellcheck = false;
        error.id = id + '-error'; error.hidden = true;
        input.setAttribute('aria-describedby', error.id);
        const lab = el('label', 'cms-field-label', label); lab.htmlFor = id;
        wrap.append(lab, input, el('p', 'cms-field-hint', hint), error);
        adding.append(wrap);
        return { input, set(p) { error.textContent = p || ''; error.hidden = !p; if (p) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); return !!p; } };
      };
      adding.append(el('h3', 'cms-nav-col-title', 'New game'));
      const name = field('Name', 'What visitors see. You can change it at any time.');
      const gid = field('Id', 'How cards refer to this game. It can’t be changed later, and belongs to this game only.');
      const dest = field('Destination', 'The game’s page, such as /games/snake/. The page must exist.');
      name.input.maxLength = 40; gid.input.maxLength = 40;
      const free = destinations().map(d => d.path).find(p => !Object.values(library.records(working())).some(g => g.destination === p));
      if (free) dest.input.value = free;
      let typed = false;
      gid.input.addEventListener('input', () => { typed = true; });
      name.input.addEventListener('input', () => { if (!typed) gid.input.value = name.input.value.trim() ? editing.newId(name.input.value, docs()) : ''; });
      const row = el('div', 'cms-nav-order');
      const make = el('button', 'cms-drawer-primary', 'Add game'); make.type = 'submit';
      row.append(make, button('Cancel', 'cms-drawer-ghost', () => { adding = null; built = null; redraw(); focusSel('.cms-nav-add'); }));
      adding.append(row);
      adding.addEventListener('submit', e => {
        e.preventDefault();
        const g = { name: name.input.value.trim(), category: cms.content.CATEGORIES[1], destination: dest.input.value.trim(), availability: 'hidden' };
        const id = gid.input.value.trim();
        const bad = [name.set(cms.content.checkField({ label: 'Name', type: 'text', max: 40 }, g.name)), gid.set(editing.idProblem(id, docs())), dest.set(editing.destinationProblem(g.destination, null, working()))];
        if (bad.some(Boolean)) { say('Fix the highlighted fields first.', 'error'); return; }
        if (!ws.addCard(LIST, id, g)) { say('The game couldn’t be added.', 'error'); return; }
        adding = null; built = null; selected = id;
        redraw();
        say(`Added “${g.name}”, hidden until you change its availability.`);
        focusSel('.cms-library-form [name="description"]');
      });
      built = null;
      fields.clear();
      detailCol.replaceChildren(adding);
      drawList();
      name.input.focus();
    }

    // Something that would leave cards without their game: the pages are named first.
    function closeAsk() { ask.hidden = true; ask.replaceChildren(); }
    function confirm(lines, label, go) {
      ask.replaceChildren(...lines.map(t => el('p', '', t)));
      const row = el('div', 'cms-nav-order');
      const yes = button(label, 'cms-drawer-primary cms-manage-danger', () => { closeAsk(); go(); });
      row.append(yes, button('Cancel', 'cms-drawer-ghost', () => { closeAsk(); drawActions(); focusSel('.cms-nav-pick[aria-pressed="true"]'); }));
      ask.append(row);
      ask.hidden = false;
      yes.focus();
    }
    const usedLines = ids => ids.filter(id => usedText(id)).map(id => `“${nameOf(id)}” is used on: ${usedText(id)}. Those cards stay in place, marked “Not in the Game Library”, until another game is chosen.`);
    async function remove(id) {
      const name = nameOf(id);
      await loadUses();
      confirm([`Remove “${name}” from your draft? It was never published. Undo brings it back.`].concat(uses === null ? ['Where it is used couldn’t be asked.'] : usedLines([id])), 'Remove game', () => {
        const at = order().indexOf(id);
        ws.removeCard(keyOf(id));
        built = null;
        selected = order()[Math.min(at, order().length - 1)] || null;
        redraw();
        say(`Removed “${name}” from your draft.`);
        focusSel('.cms-nav-pick');
      });
    }
    const gone = (from, to) => { const keep = library.records(to); return library.order(from).filter(id => !keep[id]); };
    async function discardChanges() {
      await loadUses();
      const saved = ws.draft() ? ws.draft().doc : liveDoc() || editing.empty();
      const go = () => { ws.discardAll(); fields.forget(); built = null; redraw(); say('Back as last saved. Undo brings your changes back.'); };
      const lines = usedLines(gone(working(), saved));
      if (lines.length) confirm(['Discard your unsaved changes?'].concat(lines), 'Discard changes', go); else go();
    }
    async function discardDraft() {
      await loadUses();
      const d = ws.draft();
      const lines = ['Discard the saved draft? Visitors see the published library either way. This can’t be undone here.'].concat(usedLines(gone(d.doc, liveDoc())));
      if (uses === null) lines.push('Where its games are used couldn’t be asked.');
      confirm(lines, 'Discard draft', async () => {
        say('Discarding the draft…');
        const r = await env.api.discardDraft('library', d.id).catch(e => ({ error: e }));
        if (r.error) {
          if (r.error.code === 'PT403') env.onForbidden();
          say(r.error.code === 'PT409' ? 'Not discarded: another administrator changed the draft. Reopen the library to see it.' : `Not discarded: ${r.error.message || 'the server didn’t answer'}.`, 'error');
          return;
        }
        await ws.load();
        built = null;
        redraw();
        say('The draft was discarded.');
      });
    }

    // ── Saving, conflicts ────────────────────────────────────────────────
    async function saveDraft() {
      if (saving || fields.hasErrors()) return;
      saving = true; drawActions(); say('Saving…');
      let r;
      try { r = await ws.save(); } catch (e) { r = { error: { code: 'network' } }; }
      saving = false;
      outcome(r, 'Draft saved. Pages can use its games in their drafts; visitors see it when you publish the library.');
    }
    function outcome(r, done) {
      conflict = null;
      if (r.ok) say(done, 'success');
      else if (r.conflict && !r.conflict.error) {
        conflict = r.conflict;
        const both = conflict.overlap.filter(id => id !== LIST).map(library.idOf);
        say(`Not saved: another administrator saved a newer draft.${both.length ? ` You both changed ${names(both)}; keeping yours replaces their version of ${both.length === 1 ? 'it' : 'them'}.` : ''} Keep your changes on top of it, or use theirs?`, 'error');
      } else {
        const e = r.error || (r.conflict && r.conflict.error) || {};
        say(e.code === 'PT403' ? 'Your account can no longer save drafts. Your changes are still here in this browser.'
          : e.code === 'PT422' ? `The server didn’t accept this: ${e.message}. Your changes are still here.`
          : e.code === 'PT404' ? 'This database doesn’t have the Game Library yet. Your changes are still here in this browser.'
          : e.code === 'invalid' ? 'Some games need attention before saving.'
          : 'Couldn’t reach the server. Your changes are still here; try again.', 'error');
        if (e.code === 'PT403') env.onForbidden();
      }
      built = null;
      loadUses().then(refresh);
      redraw();
      if (conflict) focusSel('.cms-library-keep');
    }
    async function resolve(mine) {
      const c = conflict;
      conflict = null;
      if (!mine) { ws.adopt(c); fields.forget(); built = null; redraw(); say('Showing the newer draft. Your changes were discarded.'); return; }
      saving = true; drawActions(); say('Saving…');
      let r;
      try { r = await ws.combine(c); } catch (e) { r = { error: { code: 'network' } }; }
      saving = false;
      outcome(r, 'Saved on top of the newer draft.');
    }

    // ── Publishing and history: the shared dialogs, over this one ────────
    const label = key => (key === LIST ? 'Order of the games' : nameOf(library.idOf(key)));
    const publishDialog = cms.publishDialog.create({
      workspace: ws, content: editing.content, publish: env.publish, cardLabel: label,
      notices: ownNotices,
      api: { getDraft: env.api.getDraft, describe: env.api.describe, prepare: env.api.prepare, publish: env.api.publish },
      onPublished: () => env.onPublished(),
      onChanged: () => env.onChanged(),
      onForbidden: () => env.onForbidden(),
      returnFocus: () => show()
    });
    const historyDialog = cms.history.create({
      workspace: ws, content: editing.content, publish: env.publish, images: env.images,
      api: { list: env.api.list },
      openVersion(v) {
        const r = editing.restored(v.content, liveDoc(), working());
        if (r.problem) return r;
        ws.setDocument(r.doc);
        selected = order()[0] || null;
        say(`Version ${v.id} is open as unsaved changes. Save Draft keeps it; Publish makes it live.`);
        return {};
      },
      onRestored: () => {},
      onForbidden: () => env.onForbidden(),
      returnFocus: () => show()
    });

    // ── Open / close, keyboard ───────────────────────────────────────────
    function show() {
      overlay.hidden = false;
      document.documentElement.classList.add('cms-publish-open');
      built = null;
      redraw();
      focusSel('.cms-nav-pick[aria-pressed="true"], .cms-library-start, .cms-nav-add, .cms-publish-actions button');
    }
    function hide() {
      closeAsk();
      overlay.hidden = true;
      document.documentElement.classList.remove('cms-publish-open');
    }
    function load() {
      failed = null;
      drawAll();
      const game = selected;
      return Promise.all([ws.isLoaded() ? ws.load() : ensure(), loadUses()]).then(() => {
        if (!isOpen()) return;
        selected = game && record(game) ? game : order()[0] || null;
        if (game && !record(game)) say(`“${game}” isn’t in the Game Library. Choose another game for its cards, or add it here with that id.`);
        redraw();
        focusSel('.cms-nav-pick[aria-pressed="true"], .cms-library-start, .cms-nav-add');
      }, e => {
        failed = `The Game Library couldn’t be loaded (${(e && e.message) || 'no answer'}). Nothing has changed.`;
        if (isOpen()) redraw();
      });
    }
    function open(game, from) {
      opener = from || null;
      adding = null; conflict = null;
      selected = game || selected;
      say('');
      overlay.hidden = false;
      document.documentElement.classList.add('cms-publish-open');
      built = null;
      load();
    }
    function close(returnFocus) {
      if (!isOpen() || saving || fields.busy()) return;
      if (fields.hasErrors()) say('');
      adding = null; built = null;
      fields.clear();
      hide();
      if (returnFocus) { if (opener && opener.isConnected && opener.offsetParent !== null) opener.focus(); else env.returnFocus(); }
    }
    const typing = t => !!t && !!t.closest && !!t.closest('input:not([type="checkbox"]):not([type="range"]), textarea, select');
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); if (!ask.hidden) { closeAsk(); drawActions(); } else close(true); }
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.altKey && ws.isLoaded()) {
        if (k === 's') { e.preventDefault(); if (ws.unsavedCards().length) saveDraft(); }
        if ((k === 'z' || k === 'y') && !typing(e.target)) { e.preventDefault(); e.stopPropagation(); step(k === 'y' || e.shiftKey ? 'redo' : 'undo'); }
      }
      if (e.key === 'Tab') {                                     // focus stays in the dialog
        const all = [...dialog.querySelectorAll('button, input, select, textarea, [tabindex="0"]')].filter(b => !b.disabled && b.offsetParent !== null && b.tabIndex !== -1);
        if (!all.length) { e.preventDefault(); return; }
        const i = all.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); all[all.length - 1].focus(); }
        else if (!e.shiftKey && i === all.length - 1) { e.preventDefault(); all[0].focus(); }
      }
    });
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(true); });

    return {
      ensure, records, published, mediaIds, status, notices, nameOf, setArtwork, open, isOpen, refresh,
      isLoaded: () => ws.isLoaded(),
      reload: () => ws.load(),
      clearLocal: () => ws.clearLocal(),
      destroy() { fields.clear(); publishDialog.destroy(); historyDialog.destroy(); overlay.remove(); document.documentElement.classList.remove('cms-publish-open'); }
    };
  }

  cms.gameLibrary = { create };
})();
