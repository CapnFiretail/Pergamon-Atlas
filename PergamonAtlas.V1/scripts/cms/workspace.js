// The card editor's three states for one page (CMS milestone M4):
//
//   published   the live version (what visitors see)          from get_draft
//   draft       the saved draft, if any (private to admins)   from get_draft / save_draft
//   working     this browser's unsaved copy                   sessionStorage only
//
// `working` starts as the draft (or the published version when there is no
// draft) and is what Admin view draws; it never leaves the browser until Save
// Draft. Saving sends the whole document with the draft id it was based on;
// if another administrator saved in between, the server refuses (PT409) and
// nothing is overwritten: save() reports the conflict, the local edits stay,
// and combine() can re-apply them card by card onto the newer draft once the
// administrator confirms (cards both people changed are listed first).
//
// Content and layout are one document with one history: undo() and redo()
// step through both (cards, lists, Site Navigation, widgets added, moved,
// resized or removed), in the order they were made. Typing in one field is
// one step. The history lives in this page only; it starts over when the
// document is replaced from the server (a newer draft, a combine).
//
// A schema-1 document stays schema 1 until its layout changes; the first
// layout change makes it schema 2 (content.upgradeDocument), and a layout
// back at the built-in one on a schema-1 base is schema 1 again.
//
// No DOM here: works in the browser (window.PergamonCMS.workspace) and in
// Node (module.exports) for tests. `api` wraps the RPCs; `storage` is
// sessionStorage-like; `content` is scripts/cms/content.js (layout editing
// needs it); `createHistory` the grid editor's (undo needs it);
// `starter(type)` the content a new widget of that type starts with.
(function (root) {
  'use strict';

  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  // Key-order-independent comparison of JSON values.
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  const same = (a, b) => canon(a) === canon(b);
  const comp = (doc, id) => (doc && doc.components ? doc.components[id] : undefined);

  // Ordered collections: each list widget's cards and each card widget's saved cards.
  // A card's list is its id without the last segment (home.carousel.snake →
  // home.carousel), its key the last segment; the list component holds
  // { order: [keys] }. A saved list with no cards is left out of the document.
  // (LISTS: the homepage's schema-1 lists, when no `content` says what there is.)
  const LISTS = ['home.carousel', 'home.featured.saved', 'home.spotlight.saved'];
  const LAYOUT = 'page.layout';                 // content.LAYOUT: the layout, among changed ids
  const isSavedList = list => /^[a-z][a-z0-9-]*\.[^.]+\.saved$/.test(list);
  const listOf = id => (typeof id === 'string' && id.lastIndexOf('.') > 0 ? id.slice(0, id.lastIndexOf('.')) : '');
  const keyOf = id => id.slice(id.lastIndexOf('.') + 1);
  const orderIn = (doc, list) => { const c = comp(doc, list); return c && Array.isArray(c.order) ? c.order : []; };
  function setOrder(doc, list, order) {
    if (!order.length && isSavedList(list)) delete doc.components[list];
    else doc.components[list] = Object.assign({}, comp(doc, list), { order: order });
  }
  // Every list names exactly its cards: ids without a card are dropped,
  // cards missing from the list are appended (after a combine, say).
  function tidy(doc, lists) {
    (lists || LISTS).forEach(list => {
      const members = Object.keys(doc.components).filter(k => listOf(k) === list).map(keyOf);
      if (!members.length && comp(doc, list) === undefined) return;
      const order = orderIn(doc, list).filter((k, i, all) => members.indexOf(k) >= 0 && all.indexOf(k) === i);
      members.forEach(k => { if (order.indexOf(k) < 0) order.push(k); });
      setOrder(doc, list, order);
    });
    return doc;
  }

  // Error code of a failed RPC (PostgREST passes our PTnnn codes through).
  function errorInfo(error) {
    if (!error) return null;
    return { code: error.code || '', message: String(error.message || 'Unknown error') };
  }

  function create(opts) {
    const page = opts.page;
    const api = opts.api;                 // { getDraft(page), saveDraft(page, doc, expectedId) } → { data, error }
    const storage = opts.storage || null;
    const key = 'pa-cms-working:' + (opts.scope || '') + ':' + page;
    const validate = opts.validate || (() => true);
    const listeners = [];

    let published = null;                 // { id, doc } | null
    let draft = null;                     // { id, doc, savedAt } | null
    let base = null;                      // { draftId, doc }: what `working` was started from
    let working = null;                   // document (never changed in place)
    let loaded = false;
    const content = opts.content || null;
    let history = null;                   // past and future working documents
    let lastStep = null;                  // { key, at }: the last edit, if typing can extend it
    const now = opts.now || Date.now;
    const TYPING_MS = 1500;

    // The lists a document has; its regions (schema 1: the built-in ones, for layout work).
    const listsOf = doc => (content ? content.listsOf(doc) : LISTS);
    const isList = id => listsOf(working).indexOf(id) >= 0;
    const regionsOf = doc => (content ? content.regionsOf(doc) : (doc && doc.regions) || null);
    const page2 = doc => !!(doc && doc.regions);
    const instanceKey = id => content.instanceKey(id);
    // Ids whose content differs between two documents (LAYOUT: the layout).
    const changedIds = (a, b) => Object.keys(Object.assign({}, a.components, b.components)).filter(id => !same(comp(a, id), comp(b, id)))
      .concat((page2(a) || page2(b)) && !same(regionsOf(a), regionsOf(b)) ? [LAYOUT] : []);

    // ── Editing ───────────────────────────────────────────────────────────
    // Every edit: change(a copy of the working document), one step in the
    // history. change may return false to leave everything as it is. Edits
    // with the same `key` in quick succession are one step (typing).
    function edit(change, key) {
      if (!working) return false;
      const next = clone(working);
      if (change(next) === false) return false;
      const at = now();
      const extend = !!key && !!lastStep && lastStep.key === key && at - lastStep.at < TYPING_MS;
      lastStep = key ? { key: key, at: at } : null;
      if (!same(next, working) && history) { if (extend) history.amend(next); else history.commit(next); }
      working = next;
      persist(); emit();
      return true;
    }
    // The working document was replaced, not edited: nothing to undo into.
    function replace(doc) {
      working = clone(doc);
      lastStep = null;
      history = opts.createHistory ? opts.createHistory(working, { same: same, freeze: clone }) : null;
    }
    function step(doc) {
      if (!doc) return false;
      working = clone(doc);
      lastStep = null;
      persist(); emit();
      return true;
    }
    const undo = () => step(history && history.undo());
    const redo = () => step(history && history.redo());

    // ── Layout ────────────────────────────────────────────────────────────
    // A layout change: the copy becomes schema 2, and back to schema 1 when
    // the result is the built-in layout and the saved document is schema 1. A
    // document the page couldn't show is never kept.
    function editLayout(change) {
      if (!content) return false;
      return edit(next => {
        if (!toPage(next) || change(next) === false) return false;
        settle(next, base && base.doc);
        return validate(next);
      });
    }
    function toPage(doc) {
      if (page2(doc)) return true;
      const up = content.upgradeDocument(doc);
      if (!up) return false;
      doc.schema = up.schema; doc.regions = clone(up.regions);
      return true;
    }
    function settle(doc, baseDoc) {
      if (content && page2(doc) && baseDoc && !page2(baseDoc) && same(doc.regions, content.builtInRegions())) { doc.schema = content.SCHEMA; delete doc.regions; }
    }
    // One region's layout as edited on the grid (scripts/grid/editor.js).
    function putRegion(doc, layout) {
      const i = doc.regions.findIndex(r => r.id === layout.id);
      if (i < 0) return false;
      doc.regions[i] = clone(layout);
    }
    const ownedBy = (key, id) => key === instanceKey(id) || key.indexOf(instanceKey(id) + '.') === 0;
    function dropContent(doc, id) { Object.keys(doc.components).forEach(k => { if (ownedBy(k, id)) delete doc.components[k]; }); }
    const setRegion = layout => editLayout(doc => putRegion(doc, layout));
    // A new instance: its region's new layout and its own content (if any).
    const addInstance = (layout, id, component) => editLayout(doc => {
      if (Object.keys(doc.components).some(k => ownedBy(k, id))) return false;
      if (component !== undefined) doc.components[instanceKey(id)] = clone(component);
      return putRegion(doc, layout);
    });
    // Remove an instance and everything that is its own (cards, saved cards).
    const removeInstance = (layout, id) => editLayout(doc => { dropContent(doc, id); return putRegion(doc, layout); });
    // The layout as last saved, with today's content: widgets added since are
    // removed, removed ones come back with their saved content.
    const discardLayout = () => editLayout(doc => {
      const was = new Set(content.instancesOf(doc).map(i => i.id));
      doc.regions = clone(regionsOf(base.doc));
      const is = new Set(content.instancesOf(doc).map(i => i.id));
      was.forEach(id => { if (!is.has(id)) dropContent(doc, id); });
      is.forEach(id => { if (!was.has(id)) Object.keys(base.doc.components).filter(k => ownedBy(k, id)).forEach(k => { doc.components[k] = clone(comp(base.doc, k)); }); });
    });

    const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) {} });
    function persist() {
      if (!storage) return;
      try {
        if (working && base && !same(working, base.doc)) storage.setItem(key, JSON.stringify({ base: base, working: working }));
        else storage.removeItem(key);
      } catch (e) {}
    }
    function restore() {
      if (!storage) return null;
      try {
        const s = JSON.parse(storage.getItem(key) || 'null');
        if (s && s.base && validate(s.base.doc) && validate(s.working) && (s.base.draftId === null || Number.isInteger(s.base.draftId))) return s;
      } catch (e) {}
      return null;
    }

    // Load published + draft from the server; keep (or restore) local edits.
    async function load() {
      const res = await api.getDraft(page);
      if (res.error) return { error: errorInfo(res.error) };
      const d = res.data || {};
      published = d.published && validate(d.published.content) ? { id: d.published.id, doc: d.published.content } : null;
      draft = d.draft && validate(d.draft.content) ? { id: d.draft.id, doc: d.draft.content, savedAt: d.draft.created_at, basedOn: d.draft.based_on_published_id } : null;
      const start = draft ? { draftId: draft.id, doc: draft.doc } : { draftId: null, doc: published ? published.doc : clone(opts.fallbackDoc) };
      if (!working) {
        const saved = restore();
        if (saved) { base = saved.base; replace(saved.working); }
        else { base = { draftId: start.draftId, doc: clone(start.doc) }; replace(start.doc); }
      } else if (same(working, base.doc)) {
        // No local edits: follow the server (the history stays if it has the same document).
        base = { draftId: start.draftId, doc: clone(start.doc) };
        if (!same(working, start.doc)) replace(start.doc);
      }
      loaded = true;
      persist();
      emit();
      return { ok: true };
    }

    // Edits. `value` is already cleaned by the caller (trimmed text, or an
    // object such as art); undefined removes the field.
    function setField(cardId, field, value) {
      const c = comp(working, cardId);
      if (!c || same(c[field], value) && (value !== undefined || !(field in c))) return;
      edit(doc => {
        if (value === undefined) delete doc.components[cardId][field];
        else doc.components[cardId][field] = clone(value);
      }, typeof value === 'string' ? cardId + '|' + field : null);
    }
    // A whole component at once (site-wide settings such as site.sidebar,
    // which belong to no list); undefined removes it.
    function setComponent(id, value) {
      if (!working || same(comp(working, id), value)) return;
      edit(doc => {
        if (value === undefined) delete doc.components[id];
        else doc.components[id] = clone(value);
      }, id);
    }
    // Back to the saved state: an edited card gets its content back, a card
    // added here is removed, a deleted card returns to its place, a list
    // gets its saved order back (keeping cards added or deleted since). A
    // new widget's own card goes back to what the widget started with.
    function discardCard(cardId) {
      if (!working || !base) return;
      if (cardId === LAYOUT) { discardLayout(); return; }
      const original = comp(base.doc, cardId);
      const list = listOf(cardId);
      const owner = content ? content.ownerOf(cardId, working) : null;
      if (content && !owner && content.isInstanceKey(cardId)) return;      // its widget is gone
      edit(doc => {
        if (isList(cardId)) {
          if (original === undefined && isSavedList(cardId)) delete doc.components[cardId];
          else doc.components[cardId] = original === undefined ? { order: [] } : clone(original);
          tidy(doc, listsOf(doc));
        } else if (original === undefined) {
          if (comp(doc, cardId) === undefined) return false;
          if (owner && owner.part === '') {
            if (!opts.starter) return false;
            doc.components[cardId] = clone(opts.starter(owner.type));
            return;
          }
          delete doc.components[cardId];
          if (isList(list)) tidy(doc, listsOf(doc));
        } else {
          doc.components[cardId] = clone(original);
          if (isList(list) && orderIn(doc, list).indexOf(keyOf(cardId)) < 0) {
            const order = orderIn(doc, list).slice();
            const at = orderIn(base.doc, list).indexOf(keyOf(cardId));
            order.splice(at < 0 ? order.length : Math.min(at, order.length), 0, keyOf(cardId));
            setOrder(doc, list, order);
          }
        }
      });
    }

    // ── Collections: add, remove, move, make active ───────────────────────
    // Add a card to a list (at `index`, default the end) → its id, or null
    // when the key is taken. Limits are the caller's (content.LIMITS); the
    // server enforces them too.
    function addCard(list, key, component, index) {
      if (!working || !isList(list)) return null;
      const id = list + '.' + key;
      if (comp(working, id) !== undefined) return null;
      const order = orderIn(working, list).slice();
      order.splice(index === undefined ? order.length : Math.max(0, Math.min(index, order.length)), 0, key);
      edit(doc => { doc.components[id] = clone(component); setOrder(doc, list, order); });
      return id;
    }
    // Remove a card from its list (an active card can't be removed).
    function removeCard(cardId) {
      const list = listOf(cardId);
      if (!working || !isList(list) || comp(working, cardId) === undefined) return false;
      return edit(doc => {
        delete doc.components[cardId];
        setOrder(doc, list, orderIn(doc, list).filter(k => k !== keyOf(cardId)));
      });
    }
    // Move a card to position `index` in its list.
    function moveCard(cardId, index) {
      const list = listOf(cardId);
      if (!working || !isList(list)) return false;
      const order = orderIn(working, list).slice();
      const from = order.indexOf(keyOf(cardId));
      const to = Math.max(0, Math.min(index, order.length - 1));
      if (from < 0 || from === to) return false;
      order.splice(to, 0, order.splice(from, 1)[0]);
      return edit(doc => setOrder(doc, list, order));
    }
    // A saved card becomes its slot's active card; the active card takes its
    // place in the saved list under `outgoingKey`. Nothing is lost.
    function activate(savedCardId, outgoingKey) {
      const list = listOf(savedCardId);
      const slot = list.replace(/\.saved$/, '');
      if (!working || list === slot || !isList(list)) return false;
      const chosen = comp(working, savedCardId), live = comp(working, slot);
      if (chosen === undefined || live === undefined) return false;
      const order = orderIn(working, list).slice();
      const at = order.indexOf(keyOf(savedCardId));
      if (order.indexOf(outgoingKey) >= 0 && outgoingKey !== keyOf(savedCardId)) return false;
      order[at] = outgoingKey;
      return edit(doc => {
        delete doc.components[savedCardId];
        doc.components[slot] = clone(chosen);
        doc.components[list + '.' + outgoingKey] = clone(live);
        setOrder(doc, list, order);
      });
    }
    function discardAll() {
      if (!base) return;
      edit(doc => { Object.keys(doc).forEach(k => delete doc[k]); Object.assign(doc, clone(base.doc)); });
    }

    // Component ids whose working content differs from what it was started
    // from: edited, added and deleted cards, reordered lists, the layout.
    function unsavedCards() {
      if (!working || !base) return [];
      return changedIds(working, base.doc);
    }
    // 'unsaved' (local edits) · 'draft' (saved draft differs from live) · 'published'.
    function cardStatus(cardId) {
      if (!working || !base) return 'published';
      const part = doc => (cardId === LAYOUT ? (doc ? regionsOf(doc) : null) : comp(doc, cardId));
      if (!same(part(working), part(base.doc))) return 'unsaved';
      if (base.draftId !== null && !same(part(base.doc), part(published && published.doc))) return 'draft';
      return 'published';
    }

    // Save the whole working copy as the new draft.
    // → { ok } | { conflict } | { error: { code, message } }
    async function save() {
      if (!working || !base) return { error: { code: 'not-loaded', message: 'The editor hasn’t loaded yet.' } };
      if (!validate(working)) return { error: { code: 'invalid', message: 'Some fields need attention before saving.' } };
      const doc = clone(working);
      const res = await api.saveDraft(page, doc, base.draftId);
      if (res.error) {
        const err = errorInfo(res.error);
        if (err.code === 'PT409') return { conflict: await conflict() };
        // A server without 0014 doesn't know the layout part of the document.
        if (err.code === 'PT422' && page2(doc) && /unsupported field "regions"|schema: must be 1/.test(err.message)) {
          return { error: { code: 'layout', message: 'This server can’t store page layouts yet (migration 0014). Nothing was saved; undo the layout changes to save the content alone.' } };
        }
        return { error: err };
      }
      const id = res.data && res.data.draft_id;
      draft = { id: id, doc: clone(doc), savedAt: new Date().toISOString(), basedOn: draft ? draft.basedOn : (published ? published.id : null) };
      base = { draftId: id, doc: clone(doc) };   // edits typed while saving stay unsaved
      persist(); emit();
      return { ok: true, draftId: id };
    }

    // What changed on the server, relative to this browser's edits.
    async function conflict() {
      const res = await api.getDraft(page);
      if (res.error) return { error: errorInfo(res.error) };
      const d = res.data || {};
      const latestPublished = d.published && validate(d.published.content) ? { id: d.published.id, doc: d.published.content } : null;
      const latestDraft = d.draft && validate(d.draft.content) ? { id: d.draft.id, doc: d.draft.content, savedAt: d.draft.created_at } : null;
      const latest = latestDraft ? { draftId: latestDraft.id, doc: latestDraft.doc } : { draftId: null, doc: latestPublished ? latestPublished.doc : clone(opts.fallbackDoc) };
      const mine = unsavedCards();
      const theirs = changedIds(latest.doc, base.doc);
      return {
        latest: latest, latestDraft: latestDraft, latestPublished: latestPublished,
        mine: mine,
        overlap: mine.filter(id => theirs.indexOf(id) >= 0),   // cards both changed
        missing: mine.filter(id => id !== LAYOUT && comp(latest.doc, id) === undefined)
      };
    }

    // Re-apply this browser's changes on top of the newer server state
    // (after the administrator confirmed), then save against it. Each
    // changed component takes this browser's version (added, edited or
    // deleted); lists are then tidied, so their cards added there stay and
    // cards deleted there don't come back unless edited here. Layouts are
    // combined widget by widget (this browser's placement where both changed
    // one); if the result doesn't fit together nothing changes here and
    // { error } says so.
    async function combine(info) {
      const next = clone(info.latest.doc);
      info.mine.forEach(id => {
        if (id === LAYOUT) return;
        const mineNow = comp(working, id);
        if (mineNow === undefined) delete next.components[id];
        else next.components[id] = clone(mineNow);
      });
      if (content && (page2(next) || page2(working)) && !combineLayout(next, info)) {
        return { error: { code: 'layout', message: 'Your layout and theirs don’t fit together. Nothing was changed; use their draft, or note your changes and make them again on it.' } };
      }
      tidy(next, listsOf(next));
      published = info.latestPublished; draft = info.latestDraft;
      base = { draftId: info.latest.draftId, doc: clone(info.latest.doc) };
      replace(next);
      persist(); emit();
      return save();
    }
    // next: their document with this browser's components on top.
    function combineLayout(next, info) {
      const theirs = regionsOf(info.latest.doc), mine = regionsOf(working), was = regionsOf(base.doc);
      toPage(next);
      const find = (regions, id) => { for (const r of regions) for (const w of r.widgets) if (w.id === id) return { region: r.id, widget: w }; return null; };
      const ids = [];
      [theirs, mine].forEach(rs => rs.forEach(r => r.widgets.forEach(w => { if (ids.indexOf(w.id) < 0) ids.push(w.id); })));
      next.regions.forEach(r => { r.widgets = []; });
      // Two new widgets given the same id in two browsers are two widgets.
      if (ids.some(id => !find(was, id) && find(mine, id) && find(theirs, id))) return false;
      ids.forEach(id => {
        const b = find(was, id), m = find(mine, id), t = find(theirs, id);
        // Its placement or (if they removed it) its content changed here: kept as here.
        const changed = !same(m, b) || (!t && !!m && info.mine.some(k => ownedBy(k, id)));
        const keep = changed ? m : t;
        const r = keep && next.regions.find(x => x.id === keep.region);
        if (r) r.widgets.push(clone(keep.widget));
        if (r && keep === m && !t) Object.keys(working.components).filter(k => ownedBy(k, id)).forEach(k => { next.components[k] = clone(comp(working, k)); });
      });
      next.regions.forEach(r => {
        const stackOf = rs => (rs.find(x => x.id === r.id) || {}).stack;
        const s = same(stackOf(mine), stackOf(was)) ? stackOf(theirs) : stackOf(mine);
        if (!s) { delete r.stack; return; }
        const here = r.widgets.map(w => w.id);
        r.stack = s.filter(id => here.indexOf(id) >= 0);
        here.forEach(id => { if (r.stack.indexOf(id) < 0) r.stack.push(id); });
      });
      // Content of widgets that are gone goes with them; a widget kept without
      // its content gets it back.
      Object.keys(next.components).forEach(k => { if (content.isInstanceKey(k) && !content.ownerOf(k, next)) delete next.components[k]; });
      content.instancesOf(next).forEach(i => {
        const k = instanceKey(i.id), c = [comp(working, k), comp(info.latest.doc, k), comp(base.doc, k)].find(x => x !== undefined);
        if (next.components[k] === undefined && c !== undefined) next.components[k] = clone(c);
      });
      settle(next, info.latest.doc);
      const check = clone(next);
      tidy(check, listsOf(check));
      return validate(check);
    }
    // Drop this browser's edits and take the newer server state.
    function adopt(info) {
      published = info.latestPublished; draft = info.latestDraft;
      base = { draftId: info.latest.draftId, doc: clone(info.latest.doc) };
      replace(info.latest.doc);
      persist(); emit();
    }

    // The saved draft went live as `version` (publish.js): it is now the
    // published version and there is no draft. Unsaved edits made on top of
    // it stay unsaved (they were not part of the publish).
    function markPublished(version) {
      if (!draft) return;
      published = { id: version, doc: clone(draft.doc) };
      if (base && base.draftId === draft.id) base = { draftId: null, doc: clone(draft.doc) };
      draft = null;
      persist(); emit();
    }

    function clearLocal() {
      if (storage) { try { storage.removeItem(key); } catch (e) {} }
      working = null; base = null; loaded = false; history = null; lastStep = null;
    }

    return {
      load, setField, setComponent, discardCard, discardAll, unsavedCards, cardStatus, save, combine, adopt, markPublished, clearLocal,
      addCard, removeCard, moveCard, activate,
      undo, redo,
      canUndo: () => !!history && history.canUndo(),
      canRedo: () => !!history && history.canRedo(),
      setRegion, addInstance, removeInstance, discardLayout,
      // The working layout's regions (schema 1: the built-in ones).
      regions: () => clone(working ? regionsOf(working) : []) || [],
      region: id => clone((working && regionsOf(working) || []).find(r => r.id === id)),
      // The documents known here, the one being edited first (what an id
      // means: content.cardType(id, ...docs())).
      docs: () => [working, base && base.doc, published && published.doc].filter(Boolean),
      order: list => orderIn(working, list).slice(),
      isLoaded: () => loaded,
      working: () => working,
      component: id => comp(working, id),
      // The card as last saved (the draft, or the published version without one).
      savedComponent: id => clone(comp(base && base.doc, id)),
      published: () => published,
      draft: () => draft,
      basedOnDraft: () => (base ? base.draftId : null),
      onChange: fn => listeners.push(fn)
    };
  }

  const api = { create: create, canon: canon, same: same };
  root.PergamonCMS = root.PergamonCMS || {};
  root.PergamonCMS.workspace = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
