// Game records as the site receives and keeps them: the Game Library's document
// (docs/cms/ARCHITECTURE.md §13) and the records that arrive with a page.
//
//   Record = { name, category, destination, availability, description?,
//              art?, wide? }      stored under 'library.games.<id>'; read here
//                                 with its id (data/entries.js has the same shape)
//   availability   'available' | 'coming-soon' | 'hidden' | 'archived'
//   art, wide      square and wide artwork, each with its default framing
//
//   received(raw, ids)   what get_published_content sends with a page
//                        ({ version, games }) → { version, games }, or null when it
//                        isn't valid or lacks a game the page refers to
//   records(doc)         a library document's records, by id
//   order(doc)           their ids, in order
//   validateDocument(doc)
//   listed(availability) whether visitors may see such a game in a list
//
// The server's rules are 0016's cms_validate_library; these mirror them.
// No DOM; the browser (window.PergamonCMS.library) and Node (module.exports).
(function (root) {
  'use strict';

  const NODE = typeof module !== 'undefined' && module.exports;
  const content = NODE ? require('./content.js') : root.PergamonCMS.content;

  const LIST = 'library.games';
  const LIMIT = 64;
  const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
  const DESTINATION = /^\/games\/[a-z0-9-]+\/$/;
  const AVAILABILITY = [
    { value: 'available', label: 'Available' },
    { value: 'coming-soon', label: 'Coming soon' },
    { value: 'hidden', label: 'Hidden' },
    { value: 'archived', label: 'Archived' }
  ];
  const FIELDS = ['name', 'category', 'destination', 'availability', 'description', 'art', 'wide'];
  const keyOf = id => LIST + '.' + id;
  const idOf = key => key.slice(LIST.length + 1);
  const listed = availability => availability === 'available' || availability === 'coming-soon';
  const text = (v, max) => typeof v === 'string' && !!v.trim() && v.length <= max && !/[<>]/.test(v);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function validRecord(g) {
    return !!g && typeof g === 'object' && !Array.isArray(g) && Object.keys(g).every(k => FIELDS.indexOf(k) >= 0) &&
      text(g.name, 40) && content.CATEGORIES.indexOf(g.category) >= 0 &&
      AVAILABILITY.some(a => a.value === g.availability) &&
      typeof g.destination === 'string' && DESTINATION.test(g.destination) &&
      (g.description === undefined || text(g.description, 160)) &&
      content.validArt(g.art) && content.validArt(g.wide);
  }
  const withId = (id, g) => Object.assign({ id: id }, g);

  function validateDocument(doc) {
    if (!doc || typeof doc !== 'object' || doc.schema !== 1 || Object.keys(doc).some(k => k !== 'schema' && k !== 'components')) return false;
    const comps = doc.components, list = comps && typeof comps === 'object' && !Array.isArray(comps) ? comps[LIST] : null;
    if (!list || !Array.isArray(list.order) || list.order.length > LIMIT || new Set(list.order).size !== list.order.length) return false;
    const destinations = new Set();
    if (!list.order.every(id => {
      const g = typeof id === 'string' && ID.test(id) ? comps[keyOf(id)] : null;
      if (!validRecord(g) || destinations.has(g.destination)) return false;
      destinations.add(g.destination);
      return true;
    })) return false;
    return Object.keys(comps).every(k => k === LIST || (k.indexOf(LIST + '.') === 0 && list.order.indexOf(idOf(k)) >= 0));
  }

  const order = doc => { const l = doc && doc.components && doc.components[LIST]; return l && Array.isArray(l.order) ? l.order.slice() : []; };
  function records(doc) {
    const out = {};
    order(doc).forEach(id => { const g = doc.components[keyOf(id)]; if (g) out[id] = withId(id, g); });
    return out;
  }

  function received(raw, ids) {
    if (raw === undefined || raw === null) return (ids || []).length ? null : { version: null, games: {} };
    if (typeof raw !== 'object' || !raw.games || typeof raw.games !== 'object' || Array.isArray(raw.games)) return null;
    if (raw.version !== null && !Number.isInteger(raw.version)) return null;
    const games = {};
    for (const id of Object.keys(raw.games)) {
      if (!ID.test(id) || !validRecord(raw.games[id]) || !listed(raw.games[id].availability)) return null;
      games[id] = withId(id, raw.games[id]);
    }
    return (ids || []).every(id => own(games, id)) ? { version: raw.version, games: games } : null;
  }

  const api = {
    LIST: LIST, LIMIT: LIMIT, ID: ID, DESTINATION: DESTINATION, AVAILABILITY: AVAILABILITY,
    keyOf: keyOf, idOf: idOf, listed: listed, validRecord: validRecord, validateDocument: validateDocument,
    order: order, records: records, received: received
  };
  root.PergamonCMS = root.PergamonCMS || {};
  root.PergamonCMS.library = api;
  if (NODE) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
