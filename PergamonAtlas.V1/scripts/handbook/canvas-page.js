// Atlas Handbook › Foundations › Node Canvas: the canvas conventions, with an
// example drawn and edited by the real code (scripts/canvas/). Nothing is saved,
// and the sample nodes belong to this page: what Atlas Studio puts on a canvas
// is documented in docs/design/STUDIO.md.
(function () {
  'use strict';
  const ns = window.PergamonHandbook = window.PergamonHandbook || {};
  const app = ns.app;
  const CV = window.PergamonCanvas;
  if (!app || !CV || !CV.renderer || !CV.interaction) return;
  const G = CV.geometry;

  const SITE_DIR = 'PergamonAtlas.V1/';     // the site's folder in the repository
  const shape = d => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const SAMPLE = () => ({
    nodes: [
      { id: 'a', x: 0, y: 0, name: 'First node', kind: 'Sample', logo: shape('<circle cx="12" cy="12" r="8"/>') },
      { id: 'b', x: 312, y: 0, name: 'A node with a longer name', kind: 'Sample', logo: shape('<rect x="4" y="4" width="16" height="16" rx="3"/>') },
      { id: 'c', x: 312, y: 168, name: 'Third node', kind: 'Sample', logo: shape('<path d="m12 4 9 16H3z"/>') }
    ],
    edges: [
      { id: 'ab', source: { node: 'a', port: 'right' }, target: { node: 'b', port: 'left' }, name: 'Forward', direction: 'forward' },
      { id: 'ac', source: { node: 'a', port: 'bottom' }, target: { node: 'c', port: 'left' }, name: 'Both ways', direction: 'both' },
      { id: 'bc', source: { node: 'b', port: 'bottom' }, target: { node: 'c', port: 'top' }, name: '', direction: 'none' }
    ]
  });

  // [part, how it looks and behaves, where it is]
  const PARTS = [
    ['Canvas', `Page background with a dot every ${G.DOT} units; nodes snap to half of that (${G.STEP}). Dots never crowd: they thin out below 50%.`, ['styles/canvas.css', 'scripts/canvas/renderer.js']],
    ['Node', `A ${G.NODE.w} × ${G.NODE.h} panel (surface, 1px border, panel radius, raised shadow): a 28px logo and the name in the Item title role, up to two lines. A logo may bring its own colour.`, ['styles/canvas.css', 'scripts/canvas/renderer.js']],
    ['Connection', 'A 2px curve that leaves each port square to its edge, with an arrowhead per direction and its name in a pill at the middle. Selected: the accent, 3px.', ['scripts/canvas/geometry.js', 'styles/canvas.css']],
    ['Ports', 'Four per node, at the middle of each edge. Shown on the selected node while editing, and on every node while a connection is being made.', ['scripts/canvas/renderer.js']],
    ['Pencil and delete', 'Admin Mode’s round pencil and, in the danger colour, delete: above a selected node, and at the middle of a selected connection. They keep their size on screen at every zoom.', ['styles/canvas.css']],
    ['Reconnect handles', 'Square handles just outside the ports of a selected connection; drag one to another node or port.', ['scripts/canvas/interaction.js']],
    ['Feedback', 'Accent dashes while connecting, solid when caught by a port; the danger colour when the ends can’t be joined. Nothing changes until release, and Escape cancels.', ['scripts/canvas/interaction.js']],
    ['Undo and redo', 'The Atlas Grid editor’s generic history; each gesture is one step, and typing in one field is one step.', ['scripts/grid/editor.js']],
    ['Toolbar, dialogs, fields', 'Buttons, the View / Edit control, inputs and the modal dialog (surface, dialog radius and shadow, above the overlay). Used by Atlas Studio; candidates for the Elements page.', ['scripts/studio/ui.js', 'styles/studio.css']]
  ];
  const CONTROLS = [
    ['Pan', 'Drag empty canvas, the middle button, a wheel or trackpad scroll; one finger by touch; arrow keys when nothing is selected.'],
    ['Zoom', `Ctrl or ⌘ with the wheel, a pinch, the controls, + and −; 0 fits. ${Math.round(G.ZOOM.min * 100)}% to ${Math.round(G.ZOOM.max * 100)}%. Fitting never enlarges past 100%.`],
    ['Select', 'Press a node or a line; Tab and Enter by keyboard. Escape deselects.'],
    ['Move', 'Drag a node (by touch, select it first). Arrow keys move one step, Shift + arrows five.'],
    ['Connect', 'Drag a port to a node or port; or press a port, then choose (also by keyboard).'],
    ['Delete', 'Only with the delete control. Delete and Backspace do nothing, as in Layout Mode.'],
    ['View and Edit', 'Two modes. Viewing selects and reads; every change needs Edit.']
  ];

  function render(view, ctx) {
    const { el, chip } = ctx;
    view.append(ctx.header('Node Canvas',
      'A pannable, zoomable canvas of nodes joined by curves, for maps of how things relate. Content-neutral, as the Atlas Grid is: the page that uses it owns the document.',
      [chip('Interactive'), chip('Nothing is saved', 'muted'), chip('Used by Atlas Studio', 'active')]));

    // ── Example ──────────────────────────────────────────────────────────
    const toolbar = el('div', 'hb-toolbar hbl-toolbar');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Example canvas');
    const tool = (text, label) => { const b = el('button', 'hbl-tool pa-type-tab', text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); return b; };
    const group = (...nodes) => { const g = el('div', 'hb-segmented'); g.append(...nodes); return g; };
    const viewMode = tool('View'), editMode = tool('Edit'), fit = tool('Fit', 'Fit to view'), reset = tool('Reset', 'Reset the example');
    toolbar.append(group(viewMode, editMode), group(fit, reset));
    const host = el('div', 'hbc-canvas');
    const status = el('p', 'pa-type-caption hb-muted hbl-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    view.append(toolbar, host, status);

    let doc = SAMPLE(), selection = null, editing = true, count = 0;
    const nameOf = id => (doc.nodes.find(n => n.id === id) || {}).name;
    const cv = CV.renderer(host, { label: 'Example canvas', edgeLabel: e => `${e.name || 'Connection'}: ${nameOf(e.source.node)} and ${nameOf(e.target.node)}` });
    const say = t => { status.textContent = t; };
    function draw() {
      const has = selection && (selection.kind === 'node' ? doc.nodes : doc.edges).some(x => x.id === selection.id);
      if (!has) selection = null;
      cv.render(doc, { selection, editing });
      viewMode.setAttribute('aria-pressed', String(!editing));
      editMode.setAttribute('aria-pressed', String(editing));
    }
    const ctl = CV.interaction({
      canvas: cv,
      editing: () => editing,
      selection: () => selection,
      select: s => { selection = s; draw(); },
      move: (id, p) => { doc = { nodes: doc.nodes.map(n => (n.id === id ? Object.assign({}, n, p) : n)), edges: doc.edges }; draw(); },
      check: (a, b) => (a.node === b.node ? 'A node can’t be connected to itself.' : ''),
      connect: (a, b) => { const id = 'new-' + (++count); doc = { nodes: doc.nodes, edges: doc.edges.concat({ id, source: a, target: b, name: '', direction: 'forward' }) }; selection = { kind: 'edge', id }; draw(); },
      reconnect: (id, end, to) => { doc = { nodes: doc.nodes, edges: doc.edges.map(e => (e.id === id ? Object.assign({}, e, { [end]: to }) : e)) }; draw(); },
      edit: () => say('The page using the canvas opens its own editor here.'),
      remove: s => {
        doc = s.kind === 'edge' ? { nodes: doc.nodes, edges: doc.edges.filter(e => e.id !== s.id) }
          : { nodes: doc.nodes.filter(n => n.id !== s.id), edges: doc.edges.filter(e => e.source.node !== s.id && e.target.node !== s.id) };
        draw();
        say('Deleted in this example. A page asks first.');
      },
      say
    });
    const mode = on => { ctl.cancel(); editing = on; draw(); };
    viewMode.addEventListener('click', () => mode(false));
    editMode.addEventListener('click', () => mode(true));
    fit.addEventListener('click', () => cv.fit());
    reset.addEventListener('click', () => { ctl.cancel(); doc = SAMPLE(); selection = { kind: 'node', id: 'a' }; draw(); cv.fit(); say('Reset.'); });
    selection = { kind: 'node', id: 'a' };
    draw();
    let fitted = false;
    const ro = new ResizeObserver(() => { if (!fitted && cv.size().w) { fitted = true; cv.fit(); } });
    ro.observe(host);
    ctx.onCleanup(() => { ro.disconnect(); ctl.destroy(); cv.destroy(); });

    // ── Parts, controls, use ─────────────────────────────────────────────
    function facts(title, rows) {
      const sec = el('section', 'hb-section');
      const dl = el('dl', 'hb-facts');
      rows.forEach(([k, text, files]) => {
        const row = el('div', 'hb-fact');
        const dd = el('dd', 'pa-type-body-small');
        dd.append(text);
        (files || []).forEach(f => dd.append(' ', el('code', 'hb-code', SITE_DIR + f)));
        row.append(el('dt', 'pa-type-label hb-muted', k), dd);
        dl.append(row);
      });
      sec.append(el('h2', 'pa-type-section-title', title), dl);
      view.append(sec);
    }
    facts('Elements and their source', PARTS);
    facts('Controls', CONTROLS);
    facts('Using it', [
      ['Renderer', 'Draws a model and a view; knows nothing about what the nodes are. Its header is the API.', ['scripts/canvas/renderer.js']],
      ['Interaction', 'Turns input into the page’s callbacks; changes only the view and the preview.', ['scripts/canvas/interaction.js']],
      ['Geometry', 'Ports, curves, fitting and zoom as plain functions; also runs in Node.', ['scripts/canvas/geometry.js']],
      ['Where used', 'Atlas Studio › Connections (docs/design/STUDIO.md).', ['scripts/studio/connections/page.js']]
    ]);
  }

  app.register('foundations/canvas', { render });
  ns.canvasPage = { render };
})();
