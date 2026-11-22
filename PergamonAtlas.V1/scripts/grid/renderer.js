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
    const stackBelow = opts.stackBelow || 0;
    const onState = typeof opts.onState === 'function' ? opts.onState : () => {};

    container.classList.add('atlas-grid');
    if (opts.debug) container.setAttribute('data-atlas-debug', '');
    const canvas = document.createElement('div');
    canvas.className = 'atlas-grid-canvas';
    container.append(canvas);

    const slots = new Map();          // id → { type, slot, instance }
    let layout = { widgets: [] }, errors = [], state = null, width = -1;

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
      s.setProperty('--atlas-min-height', types[w.type].contract.minHeight + 'px');
    }

    function reconcile() {
      const keep = new Set();
      const order = new Map(G.readingOrder(layout).map((id, i) => [id, i]));
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
      const rows = G.extent(layout);
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
    function present() {
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
