// Editing the Game Library (Admin Mode): everything about it that isn't interface.
// The library is one more versioned document, edited by the shared workspace,
// reviewed and published by the shared dialogs; `content` is what they ask a page's
// scripts/cms/content.js for, answered for the library.
//
//   content            page, fields, names, checks (as content.forPage has)
//   firstLibrary(builtIn, overrides)   a first document to edit: the built-in
//                      records, with what the stored visibility overrides suggest
//   newId(name, docs)  an id for a new game, used in none of the documents
//   idProblem(id, docs), destinationProblem(value, id, doc)   as a sentence, or null
//   restored(version, live, working)   an earlier library to edit, keeping games
//                      added since → { doc } or { problem }
//   identityChanges(before, after)     games whose name and destination both change
//   unlisted(before, after)            games visitors would no longer see listed
//   usesOf(rows)       list_game_uses, by game: { id: [{ page, name, live, draft }] }
//                      (live, draft: how many cards)
//
// No DOM; the browser (window.PergamonCMS.libraryEditing) and Node (module.exports).
(function (root) {
  'use strict';

  const NODE = typeof module !== 'undefined' && module.exports;
  const base = NODE ? require('./content.js') : root.PergamonCMS.content;
  const library = NODE ? require('./library.js') : root.PergamonCMS.library;
  const pages = NODE ? require('./pages.js') : root.PergamonCMS.pages;
  const clone = v => JSON.parse(JSON.stringify(v));
  const LIST = library.LIST;
  const isGame = id => typeof id === 'string' && id.indexOf(LIST + '.') === 0;

  // ── A record's fields ───────────────────────────────────────────────────
  const FIELDS = [
    { key: 'name', label: 'Name', type: 'text', max: 40 },
    { key: 'description', label: 'Description', type: 'textarea', max: 160, optional: true, hint: 'One or two sentences. Cards don’t show it yet.' },
    { key: 'category', label: 'Category', type: 'choice', options: base.CATEGORIES },
    { key: 'destination', label: 'Destination', type: 'destination' },
    { key: 'availability', label: 'Availability', type: 'choice', options: library.AVAILABILITY,
      hint: 'Available and coming soon: listed. Hidden and archived: cards that use the game aren’t shown to visitors. The game’s own page stays reachable either way.' },
    { key: 'art', label: 'Square artwork', type: 'image', fit: 'cover', recommendedWidth: 640, cardType: 'tile', optional: true, parts: [base.ART_PARTS.alt] },
    { key: 'wide', label: 'Wide artwork (optional)', type: 'image', fit: 'cover', recommendedWidth: 1600, cardType: 'feature', optional: true, parts: [base.ART_PARTS.edge, base.ART_PARTS.alt] }
  ];

  const none = () => null, no = () => false;
  const content = {
    page: { id: 'library', name: 'Game Library', noun: 'Game Library', thing: 'game', things: 'games', restoresAsDraft: true },
    LAYOUT: base.LAYOUT, PAGE_SCHEMA: base.PAGE_SCHEMA,
    widgets: { isList: no, hasSaved: no, hasCard: no, get: none },
    ownerOf: none, slotOf: none, isSaved: no, listOf: none, instanceLabel: none,
    layoutChanges: () => [],
    listLabel: id => (id === LIST ? 'Order of the games' : null),
    cardType: id => (isGame(id) ? 'game' : null),
    cardLabel: () => 'Game',
    cardFields: () => FIELDS,
    checkField: base.checkField, artModel: base.artModel, mediaIds: base.mediaIds,
    validateDocument: library.validateDocument
  };

  // ── Documents ───────────────────────────────────────────────────────────
  const empty = () => ({ schema: 1, components: { [LIST]: { order: [] } } });
  function build(order, record) {
    const doc = empty();
    order.forEach(id => { doc.components[LIST].order.push(id); doc.components[library.keyOf(id)] = clone(record(id)); });
    return doc;
  }
  function firstLibrary(builtIn, overrides) {
    const path = p => String(p || '').replace(/\/+$/, '') || '/';
    const said = {};
    (overrides || []).forEach(o => { if (o) said[path(o.path)] = o.visibility; });
    return build(builtIn.order.filter(id => builtIn.games[id]), id => {
      const g = Object.assign({}, builtIn.games[id]);
      delete g.id;
      const v = said[path(g.destination)];
      if (v === 'admin' && library.listed(g.availability)) g.availability = 'hidden';
      if (v === 'public' && g.availability === 'hidden') g.availability = 'available';
      return g;
    });
  }
  function restored(version, live, working) {
    const at = id => [version, live, working].find(d => d && d.components && d.components[library.keyOf(id)]);
    const order = library.order(version);
    [live, working].forEach(d => library.order(d).forEach(id => { if (order.indexOf(id) < 0) order.push(id); }));
    const doc = build(order, id => at(id).components[library.keyOf(id)]);
    if (library.validateDocument(doc)) return { doc: doc };
    const seen = {};
    let twice = null;
    order.forEach(id => { const d = doc.components[library.keyOf(id)].destination; if (seen[d]) twice = twice || [seen[d], id, d]; else seen[d] = id; });
    return { problem: twice ? `“${twice[0]}” and “${twice[1]}” would both lead to ${twice[2]}. Change one of them first.` : 'That version isn’t valid for this version of the site.' };
  }

  // ── Ids and destinations ────────────────────────────────────────────────
  const idsOf = docs => { const all = new Set(); (docs || []).forEach(d => library.order(d).forEach(id => all.add(id))); return all; };
  const newId = (name, docs) => base.newKey(name === undefined || name === '' ? 'game' : name, [...idsOf(docs)]);
  function idProblem(id, docs) {
    if (!library.ID.test(id || '')) return 'Use lower-case letters, digits and hyphens (up to 40), starting with a letter or digit.';
    return idsOf(docs).has(id) ? `“${id}” is another game’s id.` : null;
  }
  function destinationProblem(value, id, doc) {
    if (!library.DESTINATION.test(value || '')) return 'Use a game’s page, such as /games/snake/.';
    const games = library.records(doc);
    const other = Object.keys(games).find(k => k !== id && games[k].destination === value);
    return other ? `${games[other].name} already leads there.` : null;
  }

  // ── What publishing would do ────────────────────────────────────────────
  function identityChanges(before, after) {
    const a = library.records(before), b = library.records(after);
    return Object.keys(b).filter(id => a[id] && a[id].name !== b[id].name && a[id].destination !== b[id].destination)
      .map(id => ({ id: id, before: { name: a[id].name, destination: a[id].destination }, after: { name: b[id].name, destination: b[id].destination } }));
  }
  function unlisted(before, after) {
    const a = library.records(before), b = library.records(after);
    return Object.keys(a).filter(id => library.listed(a[id].availability) && !(b[id] && library.listed(b[id].availability))).map(id => ({ id: id, name: a[id].name }));
  }
  function usesOf(rows) {
    const out = {};
    (Array.isArray(rows) ? rows : []).forEach(r => {
      if (!r || typeof r.game !== 'string') return;
      const list = out[r.game] = out[r.game] || [];
      let at = list.find(x => x.page === r.page);
      if (!at) { const p = pages.get(r.page); list.push(at = { page: r.page, name: p ? p.name : r.page, live: 0, draft: 0 }); }
      at[r.status === 'published' ? 'live' : 'draft'] = Array.isArray(r.cards) ? r.cards.length : 0;
    });
    return out;
  }

  const api = {
    content: content, FIELDS: FIELDS, empty: empty, firstLibrary: firstLibrary, restored: restored, newId: newId, idProblem: idProblem,
    destinationProblem: destinationProblem, identityChanges: identityChanges, unlisted: unlisted, usesOf: usesOf
  };
  root.PergamonCMS = root.PergamonCMS || {};
  root.PergamonCMS.libraryEditing = api;
  if (NODE) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
