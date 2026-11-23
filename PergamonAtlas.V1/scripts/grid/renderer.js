// Atlas Grid renderer (read-only). Places widgets on the grid with CSS Grid;
// styles/grid.css draws the square cells from the container's own width, so
// nothing is measured to lay out.
//
//   const grid = PergamonGrid.renderer(container, {
//     types,          widget types with sizing contracts (widget-types.js)
//     draw: { [type]: { render(placement) → { element, destroy? },
//                       container? } },   a named size container the
//                                         component's CSS expects around it
//     stackBelow,     container width (px) below which the layout is shown
//                     stacked, one widget per row in reading order. 0: never.
//     debug,          true: show the cells (for the Handbook)
//     onState(state, errors)   'grid' | 'stack' | 'invalid'
//   });
//   grid.render(layout)  validate and show; widgets keep their elements
//                        across renders (matched by id and type)
//   grid.state(), grid.errors(), grid.destroy()
//   grid.setExtent(rows | null)  while editing: show at least this many rows
//                        (temporary; never part of the layout)
//   grid.setDebug(on)    show or hide the cells
//   grid.setStackBelow(px)  change the stacking breakpoint (e.g. to
//                        minFitWidth() of the layout being shown)
//   grid.slot(id)        a widget's slot element (for editors)
//   grid.geometry()      { width, cell, row, gutter, columns } at the current
//                        width (row: the layout's fixed rowHeight, or cell)
//
// Presentation never changes the layout: stacking only reorders the view.
// An invalid layout is never corrected or partly shown: it is refused
// (state 'invalid', widgets hidden, errors reported). Above `stackBelow`
// a layout that doesn't fit the width is invalid too, never stacked; give
// the page a `stackBelow` at or above minFitWidth() for its layout.
// Content-neutral: what a widget shows is entirely up to its draw function.
(function () {
  'use strict';
  const G = window.PergamonGrid;
  if (!G) return;

  function renderer(container, opts) {
    opts = opts || {};
    const types = opts.types || {};
    const draw = opts.draw || {};
    let stackBelow = opts.stackBelow || 0;
    const onState = typeof opts.onState === 'function' ? opts.onState : () => {};

    container.classList.add('atlas-grid');
    if (opts.debug) container.setAttribute('data-atlas-debug', '');
    const canvas = document.createElement('div');
    canvas.className = 'atlas-grid-canvas';
    container.append(canvas);

    const slots = new Map();          // id → { type, slot, instance }
    let layout = { widgets: [] }, errors = [], state = null, width = -1, minExtent = 0;

    const gutter = () => {
      const v = parseFloat(getComputedStyle(container).getPropertyValue('--atlas-gap'));
      return Number.isFinite(v) ? v : G.GUTTER;
    };

    function place(slot, w, order) {
      const s = slot.style;
      s.setProperty('--atlas-col', w.col);
      s.setProperty('--atlas-row', w.row);
      s.setProperty('--atlas-cols', w.cols);
      s.setProperty('--atlas-rows', w.rows);
      s.setProperty('--atlas-order', order);
    }

    function reconcile() {
      const keep = new Set();
      const order = new Map(G.stackOrder(layout).map((id, i) => [id, i]));
      for (const w of layout.widgets) {
        keep.add(w.id);
        let entry = slots.get(w.id);
        if (entry && entry.type !== w.type) { remove(w.id); entry = null; }
        if (!entry) {
          const d = draw[w.type];
          const slot = document.createElement('div');
          slot.className = 'atlas-grid-slot';
          slot.dataset.widgetId = w.id;
          slot.dataset.widgetType = w.type;
          if (d && d.container) slot.style.containerName = d.container;
          const instance = d ? d.render({ id: w.id, type: w.type }) : null;
          if (instance && instance.element) slot.append(instance.element);
          canvas.append(slot);
          entry = { type: w.type, slot, instance };
          slots.set(w.id, entry);
        }
        place(entry.slot, w, order.get(w.id));
      }
      for (const id of [...slots.keys()]) if (!keep.has(id)) remove(id);
      sizeCanvas();
    }
    // Rows: the layout's extent, or more while an editor asks for room.
    function sizeCanvas() {
      const rows = Math.max(G.extent(layout), minExtent);
      // Fixed rows (layout.rowHeight) or square ones (the CSS default).
      if (layout.rowHeight) canvas.style.setProperty('--atlas-row-height', layout.rowHeight + 'px');
      else canvas.style.removeProperty('--atlas-row-height');
      canvas.style.setProperty('--atlas-extent', Math.max(rows, 1));
      canvas.toggleAttribute('data-atlas-empty', rows === 0);
    }
    function remove(id) {
      const e = slots.get(id);
      if (e.instance && typeof e.instance.destroy === 'function') e.instance.destroy();
      e.slot.remove();
      slots.delete(id);
    }

    function setState(next, errs) {
      const changed = next !== state || JSON.stringify(errs) !== JSON.stringify(errors);
      state = next; errors = errs;
      container.setAttribute('data-atlas-state', next);
      if (changed) onState(next, errs);
    }
    // Choose the presentation for the current width.
    // Stacked, every widget is the container's width: its height floor is
    // the one for that width (its own breakpoints). With fixed rows a
    // widget's authored height is a real size, so it is at least that and
    // grows with its content, not to the floor (which is for the longest
    // content) — unless its type follows its content when stacked
    // (type.stack === 'content').
    function stackHeights() {
      for (const w of (layout && Array.isArray(layout.widgets) ? layout.widgets : [])) {
        const e = slots.get(w.id), t = types[w.type];
        if (!e || !t) continue;
        let h = G.minHeightAt(t.contract, width);
        if (layout.rowHeight && t.stack !== 'content') h = G.spanSize(w.rows, layout.rowHeight, gutter());
        e.slot.style.setProperty('--atlas-min-height', h + 'px');
      }
    }
    function present() {
      stackHeights();
      const structural = G.validateLayout(layout, types);
      if (structural.length) return setState('invalid', structural);
      if (width < stackBelow) return setState('stack', []);
      const fit = G.checkFit(layout, types, width, { gutter: gutter() });
      setState(fit.length ? 'invalid' : 'grid', fit);
    }
    // The content box: what the cells are calculated from (100cqi).
    function contentWidth() {
      const cs = getComputedStyle(container);
      return container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    }

    const ro = new ResizeObserver(entries => {
      const w = entries[entries.length - 1].contentRect.width;
      if (Math.abs(w - width) < 0.01) return;
      width = w;
      present();
    });

    return {
      render(next) {
        if (width < 0) { width = contentWidth(); ro.observe(container); }
        layout = next;
        const structural = G.validateLayout(next, types);
        // Refused layouts are not drawn at all: the widgets already shown
        // stay as they were, hidden while the state is 'invalid'.
        if (!structural.length) reconcile();
        present();
        return errors.slice();
      },
      state: () => state,
      errors: () => errors.slice(),
      element: () => canvas,
      setStackBelow(px) { stackBelow = px > 0 ? px : 0; if (width >= 0) present(); },
      setExtent(rows) { minExtent = rows > 0 ? Math.floor(rows) : 0; sizeCanvas(); },
      setDebug(on) { container.toggleAttribute('data-atlas-debug', !!on); },
      slot: id => (slots.get(id) || {}).slot || null,
      geometry() {
        const w = contentWidth(), g = gutter();
        const cell = G.cellSize(w, G.COLUMNS, g);
        return { width: w, cell, row: G.rowSize(layout, cell), gutter: g, columns: G.COLUMNS };
      },
      destroy() {
        ro.disconnect();
        for (const id of [...slots.keys()]) remove(id);
        canvas.remove();
        container.classList.remove('atlas-grid');
        container.removeAttribute('data-atlas-state');
        container.removeAttribute('data-atlas-debug');
      }
    };
  }

  window.PergamonGrid.renderer = renderer;
})();
