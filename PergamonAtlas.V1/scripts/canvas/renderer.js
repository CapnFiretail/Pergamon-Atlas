// Node canvas renderer: draws nodes and the curves between them on a dotted
// canvas, at a view (pan and zoom). It only draws: interaction.js turns input
// into calls, and the page owns the document. It knows nothing about what the
// nodes are.
//
//   const cv = PergamonCanvas.renderer(host, { label, nodeLabel(node), edgeLabel(edge) })
//   cv.render({ nodes, edges }, state)
//     nodes  [{ id, x, y, name, kind, logo }]   logo: trusted SVG / <img> markup
//     edges  [{ id, source: { node, port }, target: { node, port }, name,
//               direction: 'forward' | 'backward' | 'both' | 'none' }]
//     state  { selection: { kind: 'node' | 'edge', id } | null, editing }
//   cv.preview(p)   while a gesture is active; null ends it. Never changes the model:
//     { type: 'move', id, x, y }
//     { type: 'connect', from: { node, port }, to: { x, y, port? }, target: id?, valid, edge? }
//   cv.view(), cv.setView(v), cv.fit({ insets }), cv.zoom(factor, point?)
//   cv.reveal(selection, insets)   pan just enough to show it and its controls
//   cv.onView(fn), cv.size(), cv.local(event) (pixels in the canvas), cv.element()
//   cv.focus(selection), cv.destroy()
//
// What the pointer is over is marked with data-cv: node, port, edge, edge-end,
// edit, remove. Controls keep their on-screen size at every zoom (--cv-px).
// Styles: styles/canvas.css.
(function () {
  'use strict';
  const NS = window.PergamonCanvas = window.PergamonCanvas || {};
  const G = NS.geometry;
  if (!G) return;

  const SVG = 'http://www.w3.org/2000/svg';
  const ICONS = {
    edit: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    remove: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'
  };
  const PORT_NAMES = { top: 'top', right: 'right', bottom: 'bottom', left: 'left' };
  function el(tag, cls, data) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    Object.assign(n.dataset, data);
    if (tag === 'button') n.type = 'button';
    return n;
  }
  function svg(tag, cls, data) {
    const n = document.createElementNS(SVG, tag);
    if (cls) n.setAttribute('class', cls);
    Object.assign(n.dataset, data);
    return n;
  }
  function action(kind, data) {
    const b = el('button', 'cv-action cv-action--' + kind, Object.assign({ cv: kind }, data));
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[kind]}</svg>`;
    return b;
  }
  const place = (n, x, y) => { n.style.transform = `translate(${x}px, ${y}px)`; };

  function renderer(host, o = {}) {
    const nodeLabel = o.nodeLabel || (n => n.name);
    const edgeLabel = o.edgeLabel || (e => e.name || 'Connection');
    const box = el('div', 'cv');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', o.label || 'Canvas');
    box.tabIndex = 0;
    const world = el('div', 'cv-world');
    const lines = svg('svg', 'cv-lines');
    const labels = el('div', 'cv-layer');
    const cards = el('div', 'cv-layer');
    const tools = el('div', 'cv-layer');
    const overlay = svg('svg', 'cv-lines cv-lines--over');
    const ghost = svg('path', 'cv-ghost');
    overlay.append(ghost);
    // Decorations only: the curves are announced by their own controls.
    overlay.setAttribute('aria-hidden', 'true');
    world.append(lines, labels, cards, overlay, tools);
    box.append(world);
    host.append(box);

    let model = { nodes: [], edges: [] }, state = { selection: null, editing: false };
    let view = { x: 0, y: 0, z: 1 }, draft = null;
    const viewers = [];
    const nodeEls = new Map(), edgeEls = new Map();

    // ── The selected connection's controls: ends to drag, and actions ─────
    const edgeTools = el('div', 'cv-edge-tools');
    const edgeEdit = action('edit'), edgeRemove = action('remove');
    edgeTools.append(edgeEdit, edgeRemove);
    const ends = { source: el('button', 'cv-end', { cv: 'edge-end', end: 'source' }), target: el('button', 'cv-end', { cv: 'edge-end', end: 'target' }) };
    tools.append(ends.source, ends.target, edgeTools);

    function makeNode(id) {
      const n = el('div', 'cv-node', { id });
      const body = el('button', 'cv-node-body', { cv: 'node', id });
      const logo = el('span', 'cv-node-logo');
      logo.setAttribute('aria-hidden', 'true');
      const name = el('span', 'cv-node-name');
      body.append(logo, name);
      const acts = el('div', 'cv-node-actions');
      const edit = action('edit', { id }), remove = action('remove', { id });
      acts.append(edit, remove);
      const ports = G.PORTS.map(p => el('button', 'cv-port', { cv: 'port', id, port: p }));
      n.append(body, ...ports, acts);
      cards.append(n);
      return { root: n, body, logo, name, edit, remove, ports, markup: null };
    }
    function makeEdge(id) {
      const g = svg('g', 'cv-edge', { id });
      const line = svg('path', 'cv-edge-line');
      const heads = [svg('polygon', 'cv-edge-head'), svg('polygon', 'cv-edge-head')];
      const hit = svg('path', 'cv-edge-hit', { cv: 'edge', id });
      hit.setAttribute('tabindex', '0');
      hit.setAttribute('role', 'button');
      g.append(line, ...heads, hit);
      lines.append(g);
      const label = el('span', 'cv-edge-label', { cv: 'edge', id });
      label.setAttribute('aria-hidden', 'true');
      labels.append(label);
      return { root: g, line, heads, hit, label };
    }
    // Keep elements by id (focus survives a redraw); drop what is gone.
    function sync(map, items, make, drop) {
      const ids = new Set(items.map(i => i.id));
      [...map.keys()].forEach(id => { if (!ids.has(id)) { drop(map.get(id)); map.delete(id); } });
      items.forEach(i => { if (!map.has(i.id)) map.set(i.id, make(i.id)); });
    }
    const at = n => (draft && draft.type === 'move' && draft.id === n.id ? { id: n.id, x: draft.x, y: draft.y } : n);
    const nodeAt = id => { const n = model.nodes.find(x => x.id === id); return n ? at(n) : null; };
    const isSelected = (kind, id) => !!state.selection && state.selection.kind === kind && state.selection.id === id;

    function drawNode(n) {
      const e = nodeEls.get(n.id), p = at(n), on = isSelected('node', n.id);
      place(e.root, p.x, p.y);
      e.root.classList.toggle('is-selected', on);
      e.root.classList.toggle('is-moving', !!draft && draft.type === 'move' && draft.id === n.id);
      e.root.classList.toggle('is-target', !!draft && draft.type === 'connect' && draft.target === n.id && draft.valid);
      e.root.classList.toggle('is-refused', !!draft && draft.type === 'connect' && draft.target === n.id && !draft.valid);
      e.body.setAttribute('aria-pressed', String(on));
      if (e.markup !== n.logo) { e.markup = n.logo; e.logo.innerHTML = n.logo; }
      if (e.name.textContent !== n.name) e.name.textContent = n.name;
      e.body.setAttribute('aria-label', nodeLabel(n));
      e.edit.setAttribute('aria-label', `Edit ${n.name}`);
      e.remove.setAttribute('aria-label', `Delete ${n.name}`);
      e.ports.forEach(b => b.setAttribute('aria-label', `${n.name}, ${PORT_NAMES[b.dataset.port]} port`));
    }
    function ending(edge, end) {
      const n = nodeAt(edge[end].node);
      return n && { point: G.portPoint(n, edge[end].port), port: edge[end].port };
    }
    // The line stops at an arrowhead's base, so it never shows past the tip.
    const back = (e, yes) => (yes ? { x: e.point.x + G.OUT[e.port][0] * 9, y: e.point.y + G.OUT[e.port][1] * 9 } : e.point);
    function drawEdge(edge) {
      const e = edgeEls.get(edge.id), a = ending(edge, 'source'), b = ending(edge, 'target');
      const hidden = !a || !b;
      e.root.toggleAttribute('hidden', hidden);
      e.label.hidden = hidden || !edge.name;
      if (hidden) return;
      const toB = edge.direction === 'forward' || edge.direction === 'both', toA = edge.direction === 'backward' || edge.direction === 'both';
      const c = G.curve(back(a, toA), a.port, back(b, toB), b.port);
      e.line.setAttribute('d', c.d);
      e.hit.setAttribute('d', c.d);
      e.hit.setAttribute('aria-label', edgeLabel(edge));
      const on = isSelected('edge', edge.id);
      e.hit.setAttribute('aria-pressed', String(on));
      e.root.classList.toggle('is-selected', on);
      e.label.classList.toggle('is-selected', on);
      e.root.classList.toggle('is-source', !!draft && draft.type === 'connect' && draft.edge === edge.id);
      [[toA, a], [toB, b]].forEach(([show, end], i) => {
        e.heads[i].toggleAttribute('hidden', !show);
        if (show) e.heads[i].setAttribute('points', G.arrow(end.point, end.port));
      });
      e.label.textContent = edge.name;
      place(e.label, c.mid.x, c.mid.y);
      if (on) {
        place(edgeTools, c.mid.x, c.mid.y);
        ['source', 'target'].forEach(end => {
          const x = end === 'source' ? a : b, o = G.OUT[x.port];
          place(ends[end], x.point.x, x.point.y);
          ends[end].style.setProperty('--cv-ox', o[0]);
          ends[end].style.setProperty('--cv-oy', o[1]);
        });
      }
    }
    function drawTools() {
      const sel = state.selection;
      const edge = sel && sel.kind === 'edge' ? model.edges.find(e => e.id === sel.id) : null;
      const show = !!edge && state.editing && !(draft && draft.type === 'connect');
      [edgeTools, ends.source, ends.target].forEach(n => { n.hidden = !show; });
      if (!edge) return;
      const named = edgeLabel(edge);
      edgeTools.classList.toggle('has-label', !!edge.name);
      [edgeEdit, edgeRemove].forEach(b => { b.dataset.edge = edge.id; });
      edgeEdit.setAttribute('aria-label', `Edit connection: ${named}`);
      edgeRemove.setAttribute('aria-label', `Delete connection: ${named}`);
      ['source', 'target'].forEach(end => { ends[end].dataset.edge = edge.id; ends[end].setAttribute('aria-label', `Reconnect the ${end} of: ${named}`); });
    }
    function drawGhost() {
      const on = !!draft && draft.type === 'connect';
      box.classList.toggle('is-connecting', on);
      box.classList.toggle('is-moving', !!draft && draft.type === 'move');
      ghost.toggleAttribute('hidden', !on || !draft.to);
      if (!on || !draft.to) return;
      const n = nodeAt(draft.from.node);
      if (!n) return;
      ghost.setAttribute('d', G.curve(G.portPoint(n, draft.from.port), draft.from.port, draft.to, draft.to.port || null).d);
      ghost.classList.toggle('is-refused', draft.valid === false);
      ghost.classList.toggle('is-snapped', !!draft.target && draft.valid);
    }

    function draw() {
      box.classList.toggle('is-editing', !!state.editing);
      model.nodes.forEach(drawNode);
      model.edges.forEach(drawEdge);
      drawTools();
      drawGhost();
    }
    function render(next, s) {
      model = next;
      if (s) state = s;
      sync(nodeEls, model.nodes, makeNode, e => e.root.remove());
      sync(edgeEls, model.edges, makeEdge, e => { e.root.remove(); e.label.remove(); });
      draw();
    }
    function preview(p) {
      draft = p;
      draw();
    }

    // ── View ──────────────────────────────────────────────────────────────
    const size = () => ({ w: box.clientWidth, h: box.clientHeight });
    function setView(v) {
      view = { x: v.x, y: v.y, z: v.z };
      world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
      const s = box.style, dot = G.DOT * view.z * (view.z < 0.5 ? 2 : 1);       // dots never crowd
      s.setProperty('--cv-scale', view.z);
      s.setProperty('--cv-dot', dot + 'px');
      s.setProperty('--cv-dx', view.x - dot / 2 + 'px');                        // a dot on the origin
      s.setProperty('--cv-dy', view.y - dot / 2 + 'px');
      viewers.forEach(fn => fn(view));
    }
    const zoom = (factor, p) => { const z = size(); setView(G.zoomAt(view, view.z * factor, p || { x: z.w / 2, y: z.h / 2 })); };
    const fit = (f = {}) => setView(G.fit(G.bounds(model.nodes), size(), { insets: f.insets, padding: f.padding }));
    // A node with its actions, or the middle of a connection, where its actions are.
    function reveal(sel, insets) {
      const n = sel && sel.kind === 'node' ? nodeAt(sel.id) : null;
      const e = sel && sel.kind === 'edge' ? model.edges.find(x => x.id === sel.id) : null;
      const ea = e && ending(e, 'source'), eb = e && ending(e, 'target');
      if (!n && !(ea && eb)) return;
      const mid = n ? null : G.curve(ea.point, ea.port, eb.point, eb.port).mid;
      const i = Object.assign({ top: 0, right: 0, bottom: 0, left: 0 }, insets), z = size(), above = 64, m = n ? 24 : 48;
      const a = G.toScreen(view, n || mid), b = G.toScreen(view, n ? { x: n.x + G.NODE.w, y: n.y + G.NODE.h } : mid);
      let dx = 0, dy = 0;
      if (b.x + m > z.w - i.right) dx = z.w - i.right - m - b.x;
      if (a.x + dx - m < i.left) dx = i.left + m - a.x;
      if (b.y + m > z.h - i.bottom) dy = z.h - i.bottom - m - b.y;
      if (a.y + dy - above < i.top) dy = i.top + above - a.y;
      if (dx || dy) setView({ x: view.x + dx, y: view.y + dy, z: view.z });
    }
    function local(e) {
      const r = box.getBoundingClientRect();
      return { x: e.clientX - r.left - box.clientLeft, y: e.clientY - r.top - box.clientTop };
    }

    // The browser scrolls a clipped box to a focused control inside it; the
    // view does the moving here, so undo that.
    box.addEventListener('scroll', () => { box.scrollLeft = 0; box.scrollTop = 0; });

    setView(view);
    return {
      render, preview, setView, fit, zoom, reveal, size, local,
      view: () => view,
      onView: fn => { viewers.push(fn); },
      element: () => box,
      model: () => model,
      previewing: () => draft,
      focus(sel) {
        const e = sel && (sel.kind === 'node' ? nodeEls.get(sel.id) : edgeEls.get(sel.id));
        (e ? e.body || e.hit : box).focus({ preventScroll: true });
      },
      destroy() { box.remove(); nodeEls.clear(); edgeEls.clear(); }
    };
  }

  NS.renderer = renderer;
})();
