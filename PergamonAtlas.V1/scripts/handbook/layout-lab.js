// Atlas Handbook › Foundations › Layout Lab: move and resize real widgets on
// the Atlas Grid. Everything here is Handbook wiring: the grid is drawn by
// scripts/grid/renderer.js, input handled by scripts/grid/interaction.js,
// decorations by scripts/grid/overlay.js, and every change proposed,
// validated and recorded by scripts/grid/editor.js. The look of the canvas is
// the shared canvas design (styles/canvas-kit.css). Nothing is saved:
// reloading restores the starting layout.
//
// Lab policy (not the engine's): changes are validated at the grid's live
// width, and accepted only if the layout also fits at every wider width
// (the engine's rule). The layout is edited from its own fitting width
// (minFitWidth) up; when the window is narrower than that it is shown
// stacked and read-only, and nothing in it changes.
(function () {
  'use strict';
  const ns = window.PergamonHandbook = window.PergamonHandbook || {};
  const app = ns.app;
  const G = window.PergamonGrid;
  if (!app || !G || !G.renderer || !G.editor || !G.overlay || !G.interaction || !G.widgetTypes) return;
  const kit = window.PergamonDesign && window.PergamonDesign.canvasKit;
  if (!kit) return;
  const E = G.editor;
  const { types: TYPES } = G.widgetTypes;

  const W = (id, type, col, row, cols, rows) => ({ id, type, col, row, cols, rows });
  // Different widths and heights, gaps across and down, room to rearrange,
  // and widgets below the first group. The Carousel has the fewest rows its
  // content needs on the Handbook's usual grid (about 1122px wide): 7. The Card
  // grid grows, so it is last.
  const INITIAL = E.freezeLayout({ widgets: [
    W('heading', 'page-heading', 1, 1, 20, 4),
    W('hero', 'feature-hero', 1, 6, 10, 9),
    W('spotlight', 'feature-spotlight', 12, 6, 9, 5),
    W('carousel', 'carousel', 1, 17, 20, 7),
    W('grid', 'card-grid', 1, 25, 20, 6)
  ] });
  const fitsFrom = layout => G.minFitWidth(layout, TYPES);
  const NAMES = { heading: 'Page heading', grid: 'Card grid', hero: 'Hero', spotlight: 'Spotlight', carousel: 'Carousel' };
  const nameOf = w => NAMES[w.id] || TYPES[w.type].name;
  const px = n => `${Math.round(n)}px`;

  function render(view, ctx) {
    const { el, chip } = ctx;
    view.append(ctx.header('Layout Lab',
      'Arrange real widgets on the Atlas Grid: drag to move, drag a handle to resize. Widgets snap to whole cells, never overlap, and never get smaller than their content needs.',
      [chip('Interactive'), chip('Nothing is saved', 'muted')]));

    const help = el('section', 'hb-note');
    const hp = el('p', 'pa-type-body-small');
    hp.append('Sizes are checked at the grid’s current width, using each widget’s content needs at the width it has; a change is accepted only if the layout also works on every wider screen. When the window is too narrow for the layout it is shown stacked until there is room. Keyboard: Tab to a widget, arrow keys move it one cell, Shift + arrow keys resize it, Escape cancels or deselects. Reloading the page restores the starting layout.');
    help.append(el('h2', 'pa-type-item-title', 'How it works'), hp);
    view.append(help);

    // ── Toolbar ──────────────────────────────────────────────────────────
    const toolbar = el('div', 'ck-bar');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Layout Lab');
    const group = (...nodes) => { const g = el('div', 'ck-group'); g.append(...nodes); return g; };
    const button = (text, icon, label) => { const b = kit.button({ label: text, icon }); b.setAttribute('aria-label', label); return b; };
    const undo = button('Undo', 'undo', 'Undo the last change');
    const redo = button('Redo', 'redo', 'Redo the change');
    const reset = button('Reset', 'reset', 'Reset to the starting layout');
    const stateNote = el('p', 'ck-state pa-type-caption');
    toolbar.append(group(undo, redo, reset), el('span', 'ck-spacer'), stateNote);
    const gridToggle = kit.button({ label: 'Grid', icon: 'grid', iconOnly: true, title: 'Show the grid cells' });
    gridToggle.setAttribute('aria-label', 'Show the grid cells');
    gridToggle.setAttribute('aria-pressed', 'true');
    const widthNote = el('span', 'ck-readout hbl-width pa-type-button-small');
    const float = el('div', 'ck-float');
    float.setAttribute('role', 'group');
    float.setAttribute('aria-label', 'Canvas');
    float.append(gridToggle, widthNote);

    // ── Workspace ────────────────────────────────────────────────────────
    const frame = el('div', 'hbl-workspace ck-frame');
    frame.dataset.mode = 'edit';
    const stage = el('div', 'hbl-stage ck-stage ck-scope ck-surface');
    const host = el('div', 'hbl-host');
    const notice = el('p', 'pa-type-body-small hbl-notice');
    notice.hidden = true;

    stage.append(notice, host, float);
    frame.append(toolbar, stage);

    // ── Inspector ────────────────────────────────────────────────────────
    const inspector = el('dl', 'hbl-inspector');
    const field = (label) => { const dt = el('dt', 'pa-type-label', label), dd = el('dd', 'pa-type-body-small'); inspector.append(dt, dd); return dd; };
    const selDd = field('Selected'), sizeDd = field('Size'), gridDd = field('Grid');
    const status = el('p', 'pa-type-caption hb-muted hbl-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    frame.append(inspector, status);
    view.append(frame);

    // ── Wiring ───────────────────────────────────────────────────────────
    const history = E.createHistory(INITIAL);
    const car = { current: null };
    const draw = ns.gridPage && ns.gridPage.componentDraw ? ns.gridPage.componentDraw(car) : null;
    let state = null, ctl = null;
    const grid = G.renderer(host, {
      types: TYPES, draw: draw || {}, stackBelow: fitsFrom(INITIAL), debug: true,
      onState: s => { state = s; notice.hidden = s !== 'stack'; describeNotice(); frame.dataset.state = s; if (s !== 'grid' && ctl) ctl.cancel(); refreshInspector(); }
    });
    const overlay = G.overlay(grid.element(), { label: nameOf });
    // Validate at the live width.
    const env = () => ({ types: TYPES, width: grid.geometry().width });
    ctl = G.interaction({
      grid, overlay, env,
      layout: () => history.present(),
      commit: layout => { history.commit(layout); show(); },
      enabled: () => state === 'grid',
      // The site header is sticky: scrolling up starts below it.
      scrollInsets: () => { const h = document.querySelector('.pa-header'); return { top: h ? Math.max(0, h.getBoundingClientRect().bottom) : 0, bottom: 0 }; },
      onChange: onChange
    });

    function show() {
      // Stacked below the width this layout needs; editable from there up.
      grid.setStackBelow(fitsFrom(history.present()));
      describeNotice();
      grid.render(history.present());
      ctl.refresh();
      undo.disabled = !history.canUndo();
      redo.disabled = !history.canRedo();
      reset.disabled = E.sameLayout(history.present(), history.original());
      stateNote.dataset.state = reset.disabled ? 'example' : 'unsaved';
      stateNote.textContent = reset.disabled ? 'Starting layout' : 'Changed, not saved';
      refreshInspector();
    }
    function describeNotice() {
      notice.textContent = `This layout needs a grid at least ${Math.ceil(fitsFrom(history.present()))}px wide; this one is ${px(grid.geometry().width)}. It is shown stacked until there is room (widen the window or collapse the sidebar); nothing in it changes.`;
    }
    function refreshInspector(preview) {
      const g = grid.geometry();
      const layout = history.present();
      widthNote.textContent = px(g.width);
      const active = ctl && ctl.active();
      const rows = Math.max(G.extent(layout), Number(getComputedStyle(grid.element()).getPropertyValue('--atlas-extent')) || 0);
      gridDd.textContent = `${px(g.width)} wide · cells ${Math.round(g.cell * 10) / 10}px · ${G.COLUMNS} columns · ${G.extent(layout)} rows` + (active ? ` (showing ${rows} while editing)` : '') + ` · this layout fits from ${Math.ceil(fitsFrom(layout))}px`;
      const id = ctl && ctl.selected();
      const w = (preview && preview.widget) || (id && layout.widgets.find(x => x.id === id));
      if (!w) { selDd.textContent = 'Nothing selected: click a widget.'; sizeDd.textContent = '—'; return; }
      const r = G.rect(w, g.cell, g.gutter);
      const c = TYPES[w.type].contract, min = E.minCells(c, env(), w.cols);
      selDd.textContent = `${nameOf(w)} · column ${w.col}, row ${w.row}`;
      sizeDd.textContent = min ? `${w.cols} × ${w.rows} cells · ${px(r.width)} × ${px(r.height)} here · at this width: at least ${min.cols} columns, and ${min.rows} rows at ${w.cols} columns (content needs ${c.minWidth}px wide, ${G.minHeightAt(c, r.width)}px tall at ${px(r.width)})` : `${w.cols} × ${w.rows} cells`;
    }
    function onChange(e) {
      const layout = history.present();
      const w = layout.widgets.find(x => x.id === e.id);
      const name = w ? nameOf(w) : '';
      if (e.type === 'preview') { refreshInspector(e.proposal); return; }
      if (e.type === 'select') { refreshInspector(); return; }
      if (e.type === 'commit') status.textContent = `${e.kind === 'resize' ? 'Resized' : 'Moved'} ${name}: column ${w.col}, row ${w.row}, ${w.cols} × ${w.rows}.`;
      else if (e.type === 'reject') {
        const err = (e.errors || [])[0];
        const other = err && err.code === 'overlap' ? err.widgets.find(x => x !== e.id) : null;
        status.textContent = e.reason === 'unchanged' ? `${name} can’t go further that way.` : other ? `Not allowed: ${name} would overlap ${nameOf(layout.widgets.find(x => x.id === other))}. Nothing changed.` : err && err.code === 'below-growing' ? `Not allowed: ${nameOf(layout.widgets.find(x => x.id === err.detail.growing))} grows with its content, so nothing can go below it for now. Nothing changed.` : `Not allowed: ${err ? err.message : 'invalid placement'} Nothing changed.`;
      } else if (e.type === 'cancel' && e.reason === 'cancelled') status.textContent = 'Cancelled. Nothing changed.';
      refreshInspector();
    }

    undo.addEventListener('click', () => { if (history.undo()) { show(); status.textContent = 'Undone.'; } });
    redo.addEventListener('click', () => { if (history.redo()) { show(); status.textContent = 'Redone.'; } });
    reset.addEventListener('click', () => { if (history.reset()) { show(); status.textContent = 'Reset to the starting layout. Undo brings your changes back.'; } });
    gridToggle.addEventListener('click', () => {
      const on = gridToggle.getAttribute('aria-pressed') !== 'true';
      gridToggle.setAttribute('aria-pressed', String(on));
      grid.setDebug(on);
    });

    const ro = new ResizeObserver(() => refreshInspector());
    ro.observe(host);
    if (ctx.onCleanup) ctx.onCleanup(() => { ro.disconnect(); ctl.destroy(); overlay.destroy(); grid.destroy(); });
    show();
    // The carousel measures itself, so it starts once it is in the page, and
    // is held still: nothing in a widget moves while it is being edited.
    requestAnimationFrame(() => { if (car.current && host.isConnected) { car.current.start(); car.current.hold(true); } refreshInspector(); });

    ns.layoutLab.current = { grid, overlay, ctl, history, env, show };
  }

  app.register('foundations/lab', { render });
  ns.layoutLab = { render, initial: INITIAL, current: null };
})();
