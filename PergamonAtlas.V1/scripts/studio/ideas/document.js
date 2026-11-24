// Ideas: the document (pure; also runs in Node). Plain JSON, versioned, with no
// interface state. A collection of possibilities: nothing in it is a plan, a
// task or permission to build anything, whatever its status says.
//
//   { format: 'pergamon-atlas.ideas', version: 1,
//     ideas: [{ id, title, description, category, status, added, notes }] }
//   id          fixed once the idea exists, never reused
//   category    one of CATEGORIES; status: one of STATUSES (by value)
//   added       'YYYY-MM-DD', fixed
//
//   KEY         where a browser kept it before it was shared (storage.js)
//   CATEGORIES, STATUSES: [{ value, label }]. A value is never renamed or
//               reused: saved documents refer to it
//   FIELDS      what can be edited
//   parse(value) → { document } | { errors: [text] }   JSON text or an object:
//     checked completely, unknown properties dropped, older versions migrated
//   serialize(doc)               the JSON that is stored and exported
//   checkField(field, value) → '' | why the value can't be used
//   find(doc, { text, category, status }) → the matching ideas, in order; every
//     word must appear somewhere in the idea
// Operations return a new document and never change their input; each returns
// the same document when there is nothing to do:
//   add(doc, patch, today) → { doc, id }   first in the list
//   update(doc, id, patch), remove(doc, id)
//   same(a, b), freeze(doc), empty()
(function (root) {
  'use strict';
  const FORMAT = 'pergamon-atlas.ideas', VERSION = 1, KEY = 'pa-studio-ideas';
  const LIMITS = Object.freeze({ ideas: 2000 });
  const CATEGORIES = [
    { value: 'vision', label: 'Long-term vision' },
    { value: 'studio', label: 'Atlas Studio' },
    { value: 'workflow', label: 'Claude Code and development workflow' },
    { value: 'handbook', label: 'Handbook and design system' },
    { value: 'content', label: 'Admin Mode and content management' },
    { value: 'site', label: 'Public website and games' },
    { value: 'technical', label: 'Deferred technical improvements' }
  ];
  const STATUSES = [
    { value: 'captured', label: 'Captured' },
    { value: 'exploring', label: 'Exploring' },
    { value: 'planned', label: 'Planned' },
    { value: 'completed', label: 'Completed' }
  ];
  const FIELDS = [
    { key: 'title', label: 'Title', kind: 'text', required: true, max: 120 },
    { key: 'description', label: 'Description', kind: 'multiline', max: 600 },
    { key: 'category', label: 'Category', kind: 'choice', options: CATEGORIES },
    { key: 'status', label: 'Status', kind: 'choice', options: STATUSES },
    { key: 'notes', label: 'Notes', kind: 'multiline', max: 4000 }
  ];
  const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
  const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

  function checkField(f, value) {
    if (typeof value !== 'string') return `${f.label} must be text.`;
    if (f.kind === 'choice') return f.options.some(o => o.value === value) ? '' : `Choose a ${f.label.toLowerCase()}.`;
    if (f.required && !value.trim()) return `Enter a ${f.label.toLowerCase()}.`;
    if (value.length > f.max) return `${f.label} can have up to ${f.max} characters.`;
    return '';
  }
  function isDay(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(v + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === v;
  }

  // ── Building and reading ──────────────────────────────────────────────────
  const empty = () => ({ format: FORMAT, version: VERSION, ideas: [] });
  function freeze(doc) {
    const deep = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v).forEach(deep); Object.freeze(v); } return v; };
    return deep(doc);
  }
  const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
  const serialize = doc => JSON.stringify(doc, null, 2) + '\n';

  // version → the next one. Add an entry with each new version.
  const MIGRATIONS = {};

  function parse(value) {
    let raw = value;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { return { errors: ['This isn’t valid JSON.'] }; } }
    if (!isObject(raw) || raw.format !== FORMAT) return { errors: ['This isn’t an Atlas Ideas document.'] };
    if (!Number.isInteger(raw.version) || raw.version < 1) return { errors: ['The document has no usable version.'] };
    if (raw.version > VERSION) return { errors: [`This document is version ${raw.version}; this Studio reads up to version ${VERSION}.`] };
    while (raw.version < VERSION) { const up = MIGRATIONS[raw.version]; if (!up) return { errors: [`Version ${raw.version} can’t be read.`] }; raw = up(raw); }
    if (!Array.isArray(raw.ideas)) return { errors: ['The document has no list of ideas.'] };
    if (raw.ideas.length > LIMITS.ideas) return { errors: [`Too many ideas: up to ${LIMITS.ideas}.`] };

    const errors = [], ids = new Set();
    const fail = t => { if (errors.length < 8) errors.push(t); };
    const ideas = raw.ideas.map((x, i) => {
      const what = `Idea ${i + 1}`;
      if (!isObject(x)) { fail(`${what} isn’t an object.`); return null; }
      if (typeof x.id !== 'string' || !ID.test(x.id)) { fail(`${what} has no usable id.`); return null; }
      if (ids.has(x.id)) { fail(`The id “${x.id}” is used twice.`); return null; }
      ids.add(x.id);
      if (!isDay(x.added)) fail(`${what} (${x.id}) has no usable date added.`);
      const v = {};
      FIELDS.forEach(f => {
        v[f.key] = x[f.key] === undefined && f.kind === 'multiline' ? '' : x[f.key];
        const why = checkField(f, v[f.key]);
        if (why) fail(`${what} (${x.id}): ${why}`);
      });
      return { id: x.id, title: v.title, description: v.description, category: v.category, status: v.status, added: x.added, notes: v.notes };
    });
    if (errors.length) return { errors };
    return { document: { format: FORMAT, version: VERSION, ideas } };
  }

  // ── Operations ────────────────────────────────────────────────────────────
  let counter = 0;
  // Unique in the document, and never an id it had before.
  function newId(doc) {
    let id;
    do { id = `idea-${Date.now().toString(36)}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 6)}`; } while (doc.ideas.some(x => x.id === id));
    return id;
  }
  // Only known properties, and only values that pass their checks.
  function patched(idea, patch) {
    const out = Object.assign({}, idea);
    FIELDS.forEach(f => { if (patch[f.key] !== undefined && !checkField(f, patch[f.key])) out[f.key] = patch[f.key]; });
    return out;
  }
  function add(doc, patch, today) {
    if (doc.ideas.length >= LIMITS.ideas || !isDay(today)) return { doc, id: null };
    const id = newId(doc);
    const idea = patched({ id, title: 'New idea', description: '', category: CATEGORIES[0].value, status: STATUSES[0].value, added: today, notes: '' }, patch || {});
    return { doc: Object.assign({}, doc, { ideas: [idea].concat(doc.ideas) }), id };
  }
  function update(doc, id, patch) {
    let changed = false;
    const ideas = doc.ideas.map(x => { if (x.id !== id) return x; const y = patched(x, patch); changed = !same(x, y); return y; });
    return changed ? Object.assign({}, doc, { ideas }) : doc;
  }
  const remove = (doc, id) => (doc.ideas.some(x => x.id === id) ? Object.assign({}, doc, { ideas: doc.ideas.filter(x => x.id !== id) }) : doc);

  const labelOf = (list, value) => { const o = list.find(x => x.value === value); return o ? o.label : ''; };
  const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function find(doc, q) {
    const words = fold(q.text || '').split(/\s+/).filter(Boolean);
    return doc.ideas.filter(x => {
      if ((q.category && x.category !== q.category) || (q.status && x.status !== q.status)) return false;
      if (!words.length) return true;
      const all = fold([x.title, x.description, x.notes, labelOf(CATEGORIES, x.category), labelOf(STATUSES, x.status)].join('\n'));
      return words.every(w => all.includes(w));
    });
  }

  const api = { FORMAT, VERSION, KEY, LIMITS, CATEGORIES, STATUSES, FIELDS, empty, freeze, same, serialize, parse, checkField, add, update, remove, find, labelOf };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PergamonStudio.ideas = root.PergamonStudio.ideas || {}; root.PergamonStudio.ideas.document = api; }
})(typeof window !== 'undefined' ? window : globalThis);
