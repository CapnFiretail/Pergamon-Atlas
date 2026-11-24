// Connections: the document (pure; also runs in Node). Plain JSON, versioned,
// with no interface state (selection, pan and zoom stay out of it).
//
//   { format: 'pergamon-atlas.connections', version: 1,
//     nodes:       [{ id, type, x, y, name, description, url, notes, props }],
//     connections: [{ id, source: { node, port }, target: { node, port },
//                     name, description, direction, notes }] }
//   type        a registry definition; fixed once the node exists
//   props       service-specific values (registry `fields`); {} until there are any
//   direction   'forward' (source to target) | 'backward' | 'both' | 'none'
//
// Connections describe a relationship; nothing is connected to anything.
//
//   KEY         where a browser kept it before it was shared (storage.js)
//   parse(value) → { document } | { errors: [text] }   JSON text or an object:
//     checked completely, unknown properties dropped, older versions migrated
//   serialize(doc)               the JSON that is stored and exported
//   checkField(field, value) → '' | why the value can't be used
//   checkConnection(doc, from, to, ignoreId) → '' | why not
// Operations return a new document and never change their input; each returns
// the same document when there is nothing to do:
//   addNode(doc, type, { x, y }) → { doc, id }      moveNode(doc, id, { x, y })
//   updateNode(doc, id, patch)                      removeNode(doc, id)  (and its connections)
//   connect(doc, source, target) → { doc, id }      reconnect(doc, id, end, to)
//   updateConnection(doc, id, patch)                removeConnection(doc, id)
//   connectionsOf(doc, nodeId), freeSpot(doc, { x, y }), same(a, b), freeze(doc), empty()
(function (root) {
  'use strict';
  const inNode = typeof module === 'object' && module.exports;
  const G = inNode ? require('../../canvas/geometry.js') : root.PergamonCanvas.geometry;
  const R = inNode ? require('./registry.js') : root.PergamonStudio.connections;
  const { registry, NODE_FIELDS, CONNECTION_FIELDS } = R;

  const FORMAT = 'pergamon-atlas.connections', VERSION = 1, KEY = 'pa-studio-connections';
  const LIMITS = Object.freeze({ nodes: 200, connections: 600, reach: 100000 });
  const DIRECTIONS = ['forward', 'backward', 'both', 'none'];
  const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
  const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

  // ── Field checks ──────────────────────────────────────────────────────────
  function checkUrl(v) {
    if (/[\s\u0000-\u001f<>"\\]/.test(v)) return 'An address can’t contain spaces or quotes.';
    if (/^\/(?!\/)/.test(v)) return '';
    let u;
    try { u = new URL(v); } catch (e) { return 'Enter a full address such as https://example.com, or a page starting with /.'; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'Use an https:// or http:// address, or a page starting with /.';
    if (u.username || u.password) return 'Remove the sign-in details from the address.';
    return '';
  }
  function checkField(f, value) {
    if (typeof value !== 'string') return `${f.label} must be text.`;
    if (f.kind === 'choice') return f.options.includes(value) ? '' : `Choose a ${f.label.toLowerCase()}.`;
    if (f.required && !value.trim()) return `Enter a ${f.label.toLowerCase()}.`;
    if (f.max && value.length > f.max) return `${f.label} can have up to ${f.max} characters.`;
    if (f.kind === 'url' && value) return checkUrl(value);
    return '';
  }

  // ── Building and reading ──────────────────────────────────────────────────
  const empty = () => ({ format: FORMAT, version: VERSION, nodes: [], connections: [] });
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
    if (!isObject(raw) || raw.format !== FORMAT) return { errors: ['This isn’t an Atlas Connections document.'] };
    if (!Number.isInteger(raw.version) || raw.version < 1) return { errors: ['The document has no usable version.'] };
    if (raw.version > VERSION) return { errors: [`This document is version ${raw.version}; this Studio reads up to version ${VERSION}.`] };
    while (raw.version < VERSION) { const up = MIGRATIONS[raw.version]; if (!up) return { errors: [`Version ${raw.version} can’t be read.`] }; raw = up(raw); }

    const errors = [], ids = new Set();
    const fail = t => { if (errors.length < 8) errors.push(t); };
    const takeId = (id, what) => {
      if (typeof id !== 'string' || !ID.test(id)) { fail(`${what} has no usable id.`); return false; }
      if (ids.has(id)) { fail(`The id “${id}” is used twice.`); return false; }
      ids.add(id);
      return true;
    };
    const list = (key, max) => {
      if (!Array.isArray(raw[key])) { fail(`The document has no list of ${key}.`); return []; }
      if (raw[key].length > max) { fail(`Too many ${key}: up to ${max}.`); return []; }
      return raw[key];
    };
    function fields(defs, item, what) {
      const out = {};
      defs.forEach(f => {
        const v = item[f.key] === undefined ? (f.kind === 'choice' ? f.options[0] : '') : item[f.key];
        const why = checkField(f, v);
        if (why) fail(`${what}: ${why}`);
        out[f.key] = v;
      });
      return out;
    }

    const nodes = list('nodes', LIMITS.nodes).map((n, i) => {
      const what = `Node ${i + 1}`;
      if (!isObject(n)) { fail(`${what} isn’t an object.`); return null; }
      if (!takeId(n.id, what)) return null;
      const def = registry.get(n.type);
      if (!def) { fail(`${what} (${n.id}) has an unknown service type: ${String(n.type).slice(0, 40)}.`); return null; }
      if (![n.x, n.y].every(v => Number.isFinite(v) && Math.abs(v) <= LIMITS.reach)) { fail(`${what} (${n.id}) has no usable position.`); return null; }
      return Object.assign({ id: n.id, type: n.type, x: n.x, y: n.y }, fields(NODE_FIELDS, n, what), { props: fields(def.fields, isObject(n.props) ? n.props : {}, what) });
    });
    const nodeIds = new Set(nodes.filter(Boolean).map(n => n.id));
    const pairs = new Set();
    const connections = list('connections', LIMITS.connections).map((c, i) => {
      const what = `Connection ${i + 1}`;
      if (!isObject(c)) { fail(`${what} isn’t an object.`); return null; }
      if (!takeId(c.id, what)) return null;
      const end = e => (isObject(c[e]) && nodeIds.has(c[e].node) && G.PORTS.includes(c[e].port) ? { node: c[e].node, port: c[e].port } : null);
      const source = end('source'), target = end('target');
      if (!source || !target) { fail(`${what} (${c.id}) doesn’t join two of the document’s nodes.`); return null; }
      if (source.node === target.node) { fail(`${what} (${c.id}) joins a node to itself.`); return null; }
      const key = pairKey(source, target);
      if (pairs.has(key)) { fail(`${what} (${c.id}) repeats another connection’s ports.`); return null; }
      pairs.add(key);
      return Object.assign({ id: c.id, source, target }, fields(CONNECTION_FIELDS, c, what));
    });
    if (errors.length) return { errors };
    return { document: { format: FORMAT, version: VERSION, nodes, connections } };
  }

  // ── Operations ────────────────────────────────────────────────────────────
  let counter = 0;
  // Unique in the document, and never an id it had before.
  function newId(prefix, doc) {
    const taken = id => doc.nodes.some(n => n.id === id) || doc.connections.some(c => c.id === id);
    let id;
    do { id = `${prefix}-${Date.now().toString(36)}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 6)}`; } while (taken(id));
    return id;
  }
  const replace = (doc, key, id, fn) => {
    let changed = false;
    const next = doc[key].map(x => { if (x.id !== id) return x; const y = fn(x); changed = !same(x, y); return changed ? y : x; });
    return changed ? Object.assign({}, doc, { [key]: next }) : doc;
  };
  // Only known properties, and only values that pass their checks.
  function patched(defs, item, patch) {
    const out = Object.assign({}, item);
    defs.forEach(f => { if (patch[f.key] !== undefined && !checkField(f, patch[f.key])) out[f.key] = patch[f.key]; });
    return out;
  }
  const overlaps = (doc, p) => doc.nodes.some(n => Math.abs(n.x - p.x) < G.NODE.w + G.DOT && Math.abs(n.y - p.y) < G.NODE.h + G.DOT);
  // The nearest place to p where a node covers no other, in rings around it.
  function freeSpot(doc, p) {
    const at = { x: G.snap(p.x), y: G.snap(p.y) };
    const sx = G.NODE.w + 2 * G.DOT, sy = G.NODE.h + 2 * G.DOT;
    for (let r = 0; r < 40; r++) {
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const q = { x: at.x + j * sx, y: at.y + i * sy };
        if (!overlaps(doc, q)) return q;
      }
    }
    return at;
  }
  function addNode(doc, type, at) {
    const def = registry.get(type);
    if (!def || doc.nodes.length >= LIMITS.nodes) return { doc, id: null };
    // A second instance of a type starts with a name of its own.
    const names = new Set(doc.nodes.map(n => n.name));
    let name = def.name;
    for (let i = 2; names.has(name); i++) name = `${def.name} ${i}`;
    const props = {};
    def.fields.forEach(f => { props[f.key] = f.kind === 'choice' ? f.options[0] : ''; });
    const id = newId('n', doc);
    const node = { id, type, x: G.snap(at.x), y: G.snap(at.y), name, description: '', url: def.url, notes: '', props };
    return { doc: Object.assign({}, doc, { nodes: doc.nodes.concat(node) }), id };
  }
  const held = n => Math.max(-LIMITS.reach, Math.min(LIMITS.reach, n));
  const moveNode = (doc, id, p) => replace(doc, 'nodes', id, n => Object.assign({}, n, { x: held(p.x), y: held(p.y) }));
  // id, type and position are not editable properties.
  function updateNode(doc, id, patch) {
    return replace(doc, 'nodes', id, n => {
      const next = patched(NODE_FIELDS, n, patch), def = registry.get(n.type);
      if (patch.props && def) next.props = patched(def.fields, n.props, patch.props);
      return next;
    });
  }
  const connectionsOf = (doc, id) => doc.connections.filter(c => c.source.node === id || c.target.node === id);
  function removeNode(doc, id) {
    if (!doc.nodes.some(n => n.id === id)) return doc;
    return Object.assign({}, doc, { nodes: doc.nodes.filter(n => n.id !== id), connections: doc.connections.filter(c => c.source.node !== id && c.target.node !== id) });
  }
  const pairKey = (a, b) => [`${a.node}/${a.port}`, `${b.node}/${b.port}`].sort().join(' ');
  function checkConnection(doc, a, b, ignoreId) {
    const ok = e => e && doc.nodes.some(n => n.id === e.node) && G.PORTS.includes(e.port);
    if (!ok(a) || !ok(b)) return 'Choose a node to connect to.';
    if (a.node === b.node) return 'A node can’t be connected to itself.';
    const key = pairKey(a, b);
    if (doc.connections.some(c => c.id !== ignoreId && pairKey(c.source, c.target) === key)) return 'These two ports are already connected.';
    if (!ignoreId && doc.connections.length >= LIMITS.connections) return `A document can have up to ${LIMITS.connections} connections.`;
    return '';
  }
  function connect(doc, source, target) {
    if (checkConnection(doc, source, target)) return { doc, id: null };
    const id = newId('c', doc);
    const c = { id, source: { node: source.node, port: source.port }, target: { node: target.node, port: target.port }, name: '', description: '', direction: 'forward', notes: '' };
    return { doc: Object.assign({}, doc, { connections: doc.connections.concat(c) }), id };
  }
  function reconnect(doc, id, end, to) {
    const c = doc.connections.find(x => x.id === id);
    if (!c || (end !== 'source' && end !== 'target')) return doc;
    if (checkConnection(doc, end === 'source' ? c.target : c.source, to, id)) return doc;
    return replace(doc, 'connections', id, x => Object.assign({}, x, { [end]: { node: to.node, port: to.port } }));
  }
  const updateConnection = (doc, id, patch) => replace(doc, 'connections', id, c => patched(CONNECTION_FIELDS, c, patch));
  const removeConnection = (doc, id) => (doc.connections.some(c => c.id === id) ? Object.assign({}, doc, { connections: doc.connections.filter(c => c.id !== id) }) : doc);

  const api = { FORMAT, VERSION, KEY, LIMITS, DIRECTIONS, empty, freeze, same, serialize, parse, checkField, checkConnection, addNode, moveNode, updateNode, removeNode, connect, reconnect, updateConnection, removeConnection, connectionsOf, freeSpot };
  if (inNode) module.exports = api;
  else root.PergamonStudio.connections.document = api;
})(typeof window !== 'undefined' ? window : globalThis);
