// Converting a page's cards from their own details of a game to references to its
// record (docs/cms/ARCHITECTURE.md §13): what it would change, and the result. An
// administrator starts it, sees every difference and decides card by card
// (convert-dialog.js); nothing here saves or publishes.
//
//   plan(doc, { content, records, live })
//     → [{ id, type, saved, game, before, after, differences, picture, slot }]
//     a card that has its own details each, in the page's order; `game` null: its link leads to no game of
//     the library, so it stays as it is
//     before, after   what it shows now and would show (content.shownCard)
//     differences     [{ what, before, after }] a visitor would see or hear, or that
//                     would be lost
//     picture         'same' · 'other' (two pictures) · 'gained' (the card has none) ·
//                     'lost' (the game has none) · 'none'
//     slot            the record's artwork its kind of card shows ('art' or 'wide')
//     fills           the record has nothing there: the card's picture could be put in it
//     live            paths of the games an own-details list card is shown for
//   suggested(card)   'convert' when nothing differs; 'picture' when all that differs is a
//                     picture the record has no place taken for; otherwise 'keep'
//   apply(doc, { content, records, choices, live })   choices: { id: 'keep' | 'convert' |
//     'picture' }, 'picture' also putting the card's picture, as it is framed, in the record
//     → { doc, artwork: { game: { slot: art } }, converted, kept, problem }
//       doc is schema 2 (the same regions, instances, order and ids); a problem: nothing
//       else is returned
// No DOM; the browser (window.PergamonCMS.convert) and Node (module.exports).
(function (root) {
  'use strict';

  const clone = v => JSON.parse(JSON.stringify(v));
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  const same = (a, b) => canon(a) === canon(b);
  const path = p => String(p || '').replace(/\/+$/, '') + '/';
  const source = a => (a && a.source ? canon(a.source) : '');
  const listed = g => g.availability === 'available' || g.availability === 'coming-soon';
  const AVAILABILITY = { available: 'available', 'coming-soon': 'coming soon', hidden: 'hidden', archived: 'archived' };

  // The reference that takes a card's place: its button label and style stay; its framing
  // too, unless the record frames the same picture the same way.
  function reference(card, record, type, content) {
    const out = { game: record.id };
    if (type !== 'tile') { out.cta = card.cta; if (card.style !== undefined) out.style = clone(card.style); }
    const art = content.artFor(record, type);
    if (card.art && source(card.art) === source(art) && !same(content.cropOf(card.art), content.cropOf(art))) out.crop = clone(content.cropOf(card.art));
    return out;
  }

  function plan(doc, env) {
    const { content, records } = env;
    const d = content.upgradeDocument(doc), out = [];
    if (!d) return out;
    const live = (env.live || []).map(path);
    // Each widget's card, its saved cards, or its list's cards.
    const ids = [].concat(...content.instancesOf(d).map(i => {
      const key = content.instanceKey(i.id), list = k => ((d.components[k] || {}).order || []).map(x => k + '.' + x);
      return content.widgets.isList(i.type) ? list(key) : [key].concat(list(content.savedList(key)));
    }));
    ids.forEach(id => {
      const type = content.cardType(id, d), c = d.components[id];
      if (!type || type === 'heading' || !c || typeof c !== 'object' || content.isRef(c) || typeof c.href !== 'string') return;
      const record = Object.keys(records).map(k => records[k]).find(g => g.destination === path(c.href)) || null;
      const card = { id: id, type: type, saved: content.isSaved(id, d), game: record ? record.id : null, before: content.shownCard(c, type, records), after: null, differences: [], picture: 'none', slot: type === 'tile' ? 'art' : 'wide', fills: false };
      out.push(card);
      if (!record) return;
      card.after = content.shownCard(reference(c, record, type, content), type, records);
      const note = (what, before, after) => card.differences.push({ what: what, before: before, after: after });
      if (c.title !== record.name) note('Name', c.title, record.name);
      if (type === 'tile' && c.category !== record.category) note('Category', c.category, record.category);
      if (c.description !== undefined && c.description !== record.description) note('Description', c.description, record.description || 'none');
      const art = content.artFor(record, type);
      const b = source(c.art), a = source(art);
      card.picture = !b && !a ? 'none' : b === a ? 'same' : !b ? 'gained' : !a ? 'lost' : 'other';
      card.fills = !!b && !record[card.slot];
      if (card.picture === 'other') note('Picture', 'this card’s', 'the game’s');
      if (card.picture === 'gained') note('Picture', 'none', 'the game’s');
      if (card.picture === 'lost') note('Picture', 'this card’s', 'none');
      if (card.picture === 'same' && (c.art.alt || '') !== (art.alt || '')) note('Image description', c.art.alt || 'none', art.alt || 'none');
      const playable = content.widgets.playable(content.ownerOf(id, d).type);
      const shown = type !== 'tile' || live.indexOf(path(c.href)) >= 0;
      const will = listed(record) && !(playable && record.availability === 'coming-soon');
      if (shown !== will) note('Shown to visitors', shown ? 'yes' : 'no', will ? `yes (${AVAILABILITY[record.availability]})` : `no (${AVAILABILITY[record.availability]})`);
    });
    return out;
  }

  const onlyPicture = card => card.differences.every(d => d.what === 'Picture');
  function suggested(card) {
    if (!card.game) return 'keep';
    if (!card.differences.length) return 'convert';
    return onlyPicture(card) && card.fills ? 'picture' : 'keep';
  }
  // 'picture' means something only for a picture the record doesn't show.
  const offers = card => (!card.game ? ['keep'] : ['keep', 'convert'].concat(card.picture === 'other' || card.picture === 'lost' ? ['picture'] : []));

  function apply(doc, env) {
    const { content, records } = env;
    const cards = plan(doc, env), artwork = {}, next = clone(content.upgradeDocument(doc));
    const chosen = card => { const c = env.choices[card.id]; return offers(card).indexOf(c) >= 0 ? c : 'keep'; };
    for (const card of cards) {
      if (chosen(card) !== 'picture') continue;
      const art = next.components[card.id].art, slots = artwork[card.game] = artwork[card.game] || {};
      if (slots[card.slot] && source(slots[card.slot]) !== source(art)) return { problem: `Two cards would give “${records[card.game].name}” different pictures. Choose one of them.` };
      if (!slots[card.slot]) slots[card.slot] = clone(art);
    }
    // With the records as they will be, so every card is framed against the right picture.
    const after = {};
    Object.keys(records).forEach(id => { after[id] = Object.assign({}, records[id], artwork[id]); });
    let converted = 0;
    cards.forEach(card => {
      if (chosen(card) === 'keep') return;
      next.components[card.id] = reference(next.components[card.id], after[card.game], card.type, content);
      converted++;
    });
    return { doc: next, artwork: artwork, converted: converted, kept: cards.length - converted };
  }

  const api = { plan: plan, suggested: suggested, offers: offers, apply: apply };
  root.PergamonCMS = root.PergamonCMS || {};
  root.PergamonCMS.convert = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
