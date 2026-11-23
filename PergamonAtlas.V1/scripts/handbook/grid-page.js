// Atlas Handbook › Foundations › Atlas Grid. Every demonstration is drawn by
// the real grid renderer (scripts/grid/renderer.js) from layouts validated
// by the real engine (scripts/grid/atlas-grid.js); sizing contracts come from
// scripts/grid/widget-types.js; the real widgets are the component library's.
// The demonstration layouts are frozen: neither rendering nor stacking can
// change them. The cell overlay is shown only here (the renderer's debug view).
(function () {
  'use strict';
  const ns = window.PergamonHandbook = window.PergamonHandbook || {};
  const app = ns.app;
  const G = window.PergamonGrid;
  const C = window.PergamonComponents;
  if (!app || !G || !G.renderer || !G.widgetTypes) return;
  const { types: TYPES, reference, frameRegions, limitations } = G.widgetTypes;

  const freeze = o => { Object.values(o).forEach(v => { if (v && typeof v === 'object') freeze(v); }); return Object.freeze(o); };
  const W = (id, col, row, cols, rows, type = 'block') => ({ id, type, col, row, cols, rows });

  // Demonstration blocks: a plain widget type of the page's own (any size from
  // 2 × 1 cells; no content floor).
  const DEMO_TYPES = { block: { placeable: true, contract: { minCols: 2, minRows: 1, defaultCols: 4, defaultRows: 2, minWidth: 1, minHeight: 1 } } };
  const STACK_BELOW = 600;

  const demos = freeze({
    spans: { widgets: [W('a', 1, 1, 6, 4), W('b', 7, 1, 4, 2), W('c', 7, 3, 4, 2), W('d', 12, 1, 5, 3), W('e', 18, 1, 3, 6), W('f', 1, 5, 10, 2)] },
    growth: { widgets: [W('top', 1, 1, 8, 3), W('middle', 11, 5, 6, 2), W('low', 3, 14, 10, 2)] },
    real: { widgets: [W('hero', 1, 1, 12, 6, 'feature-hero'), W('spotlight', 13, 1, 8, 4, 'feature-spotlight'), W('carousel', 1, 8, 20, 6, 'carousel')] }
  });
  const withoutLowest = freeze({ widgets: demos.growth.widgets.filter(w => w.id !== 'low') });

  // Draw a demonstration block, labelled with its own placement.
  const blockDraw = layoutOf => ({
    render: p => {
      const w = layoutOf().widgets.find(x => x.id === p.id);
      const e = document.createElement('div');
      e.className = 'hbg-block';
      e.innerHTML = '<span class="hbg-block-id"></span><span class="hbg-block-pos"></span>';
      e.firstChild.textContent = p.id;
      e.lastChild.textContent = `col ${w.col} · row ${w.row} · ${w.cols} × ${w.rows}`;
      return { element: e };
    }
  });

  const px = n => `${Math.round(n * 10) / 10}px`;

  // A contract's content minimums in words: the width, and the height floor
  // for each of the widget's own width bands.
  function floors(c) {
    const bands = c.minHeightBands || [];
    if (!bands.length) return `${c.minWidth}px wide · ${c.minHeight}px tall`;
    let prev = 0;
    const parts = bands.map(b => { const t = `${b.minHeight}px tall ${prev ? `from ${prev + 1} ` : 'up '}to ${b.maxWidth}px wide`; prev = b.maxWidth; return t; });
    return `${c.minWidth}px wide · ${parts.join(', ')}, ${c.minHeight}px wider`;
  }

  // How the Handbook draws the real widget types on a grid (the renderer's
  // draw config), with the component library's sample content. Shared with
  // the Layout Lab. `car.current` receives the carousel, which its page
  // starts (and holds still) once it is in the page.
  function componentDraw(car) {
    const ex = ns.componentExamples || {};
    if (!C || !ex.hero) return null;
    return {
      'feature-hero': { container: 'upper', render: () => { const b = C.featureBanner({ variant: 'hero' }); b.apply(ex.hero[0].content); return { element: b.element }; } },
      'feature-spotlight': { container: 'upper', render: () => { const b = C.featureBanner({ variant: 'banner' }); b.apply(ex.banner[0].content); return { element: b.element }; } },
      'carousel': { render: () => {
        const items = ex.cards.map((d, i) => ({ key: 'c' + i, label: d.title, facet: d.facet, element: C.contentCard(d).element }));
        const c = C.carousel({ sections: [Object.assign({}, ex.carousel, { items })] });
        car.current = c;
        return { element: c.element };
      } }
    };
  }

  function render(view, ctx) {
    const { el, chip } = ctx;
    const cleanups = [];
    ctx.onCleanup && ctx.onCleanup(() => cleanups.forEach(f => f()));

    view.append(ctx.header('Atlas Grid',
      'The layout foundation for Atlas pages: a 20-column grid of square cells that widgets snap to. It is invisible on the site; the cells are drawn here to show how it works.',
      [chip('Read-only'), chip('Foundation: no page uses it yet', 'muted')]));

    const source = el('section', 'hb-note');
    const sp = el('p', 'pa-type-body-small');
    sp.append('Geometry and validation: ', el('code', 'hb-code', 'scripts/grid/atlas-grid.js'), '; widget sizes: ', el('code', 'hb-code', 'scripts/grid/widget-types.js'),
      '; drawing: ', el('code', 'hb-code', 'scripts/grid/renderer.js'), ' and ', el('code', 'hb-code', 'styles/grid.css'), '. Every example below is drawn by that renderer.');
    source.append(el('h2', 'pa-type-item-title', 'Source of truth'), sp);
    view.append(source);

    // A demonstration: a renderer in a frame, with a caption line.
    function demo(layout, opts) {
      const frame = el('div', 'hbg-frame' + (opts.narrow ? ' hbg-frame--narrow' : ''));
      const host = el('div', 'hbg-host');
      frame.append(host);
      const status = el('p', 'pa-type-caption hb-muted hbg-status');
      status.setAttribute('aria-live', 'polite');
      let current = layout;
      const grid = G.renderer(host, {
        types: opts.types || DEMO_TYPES,
        draw: opts.draw || { block: blockDraw(() => current) },
        stackBelow: opts.stackBelow === undefined ? STACK_BELOW : opts.stackBelow,
        debug: true,
        onState: (state, errors) => { frame.dataset.state = state; describe(); if (opts.onState) opts.onState(state, errors); }
      });
      function describe() {
        const w = host.clientWidth, cell = G.cellSize(w);
        const n = G.extent(current);
        const state = grid.state();
        status.textContent = state === 'stack'
          ? `Stacked: this frame is ${px(w)} wide, below the ${STACK_BELOW}px breakpoint. Reading order: ${G.readingOrder(current).join(', ')}. The layout itself is unchanged.`
          : state === 'invalid' ? `Refused: ${grid.errors().map(e => e.message).join(' ')}`
            : `Container ${px(w)} · cell ${px(cell)} · gutter 16px · canvas ${n} rows, ${px(G.canvasHeight(current, cell))} tall.`;
      }
      const ro = new ResizeObserver(describe);
      ro.observe(host);
      cleanups.push(() => { ro.disconnect(); grid.destroy(); });
      return { frame, status, grid, show(next) { current = next; grid.render(next); describe(); }, layout: () => current };
    }

    // ── Geometry ─────────────────────────────────────────────────────────
    const geo = el('section', 'hb-section');
    geo.append(el('h2', 'pa-type-section-title-large', 'Cells, gutters and coordinates'));
    const facts = el('dl', 'hbg-facts');
    [['Columns', `${G.COLUMNS}, always, on the desktop grid`],
      ['Cells', 'Square: a row is exactly as tall as a column is wide'],
      ['Gutter', [`${G.GUTTER}px between neighbouring cells, across and down (`, el('code', 'hb-code', '--layout-gutter'), '); no extra margin around widgets']],
      ['Cell size', 'cell = (W − 19 × 16) / 20 for a container W pixels wide'],
      ['A widget', 'width = cols × cell + (cols − 1) × 16; height the same with rows'],
      ['Coordinates', 'col and row start at 1 (top left), the same numbers as CSS Grid lines; spans are whole cells']]
      .forEach(([k, v]) => { const dd = el('dd', 'pa-type-body-small'); dd.append(...[].concat(v)); facts.append(el('dt', 'pa-type-label', k), dd); });
    const spans = demo(demos.spans, {});
    geo.append(facts, el('p', 'pa-type-body-small hb-muted', 'Six widgets with different spans and heights. The cells between them stay empty: nothing is moved up or stretched to fill them.'), spans.frame, spans.status);
    view.append(geo);

    // ── Canvas growth ────────────────────────────────────────────────────
    const gr = el('section', 'hb-section');
    gr.append(el('h2', 'pa-type-section-title-large', 'Empty space and canvas height'),
      el('p', 'pa-type-body-small hb-muted', 'There is no fixed number of rows. The canvas ends after the lowest occupied row, so it grows when a widget sits lower and shrinks when the lowest one goes. Empty rows between widgets are kept, never closed up.'));
    const toggle = el('div', 'hb-segmented');
    toggle.setAttribute('role', 'radiogroup');
    toggle.setAttribute('aria-label', 'Layout');
    [['full', 'All three widgets'], ['without', 'Lowest widget removed']].forEach(([v, l], i) => {
      const lab = el('label', 'hb-segment pa-type-tab');
      const input = el('input'); input.type = 'radio'; input.name = 'hbg-growth'; input.value = v; input.checked = i === 0;
      lab.append(input, el('span', '', l));
      toggle.append(lab);
    });
    const growth = demo(demos.growth, {});
    const growthTools = el('div', 'hb-toolbar');
    growthTools.append(toggle);
    toggle.addEventListener('change', () => growth.show(toggle.querySelector('input:checked').value === 'full' ? demos.growth : withoutLowest));
    gr.append(growthTools, growth.frame, growth.status,
      el('p', 'pa-type-caption hb-muted', 'Rows 4 and 7–13 are empty on purpose. A future editor may offer temporary rows below the canvas while dragging; they never become part of the layout.'));
    view.append(gr);

    // ── Stacked presentation ─────────────────────────────────────────────
    const st = el('section', 'hb-section');
    st.append(el('h2', 'pa-type-section-title-large', 'Narrow screens: stacked'),
      el('p', 'pa-type-body-small hb-muted', `Twenty columns stop working well on narrow screens (at 304px they have no room at all). Because height floors change at widgets' breakpoints, a layout can fit at one width and not at a slightly wider one; minFitWidth() gives the width from which it fits at every wider width, and pages stack below it (the Layout Lab does exactly that). Below a breakpoint each page sets (${STACK_BELOW}px here) the same layout is shown one widget per row, top to bottom and left to right. Only the presentation changes; the authored positions are kept for wider screens.`));
    const stacked = demo(demos.spans, { narrow: true });
    st.append(stacked.frame, stacked.status,
      el('p', 'pa-type-caption hb-muted', 'Above the breakpoint a layout that doesn’t fit the width is refused, never quietly stacked: see Validation.'));
    view.append(st);

    // ── Widget sizes ─────────────────────────────────────────────────────
    const sz = el('section', 'hb-section');
    sz.append(el('h2', 'pa-type-section-title-large', 'Widget sizes'),
      el('p', 'pa-type-body-small hb-muted', `Every widget type has a sizing contract: a minimum and a default size in cells, and a content minimum in pixels. The height a widget's content needs can change at the widget's own breakpoints (a carousel whose tabs move onto their own row is taller), so the height floor is given for each of those width ranges and checked for the width the widget actually has. Cells change size with the container, so the pixel minimum is checked at the actual width as well. Minimum cells are set on the reference grid (${reference.width}px: ${reference.note.toLowerCase()}). Defaults are only the starting size of a newly added widget.`));
    const wrap = el('div', 'hb-table-wrap'); wrap.tabIndex = 0;
    const table = el('table', 'hb-table hbg-contracts');
    const hr = el('tr');
    ['Widget', 'Minimum', 'Default', 'Content minimum', 'At this page’s width'].forEach(t => { const th = el('th', 'pa-type-label', t); th.scope = 'col'; hr.append(th); });
    const thead = el('thead'); thead.append(hr);
    const tbody = el('tbody');
    Object.entries(TYPES).forEach(([id, t]) => {
      const c = t.contract, tr = el('tr'); tr.dataset.type = id;
      const th = el('th', 'pa-type-body-small'); th.scope = 'row';
      const name = el('div', 'hbg-type-name');
      name.append(el('span', 'pa-type-item-title', t.name), el('code', 'hb-code', id), chip(t.placeable ? 'Placeable' : 'Not placeable yet', t.placeable ? 'active' : 'muted'));
      th.append(name, el('p', 'pa-type-caption hb-muted', t.measured), el('p', 'pa-type-caption hb-muted', t.responsive));
      tr.append(th, el('td', 'pa-type-body-small hbg-num', `${c.minCols} × ${c.minRows}`), el('td', 'pa-type-body-small hbg-num', `${c.defaultCols} × ${c.defaultRows}`),
        el('td', 'pa-type-body-small hbg-floors', floors(c)), el('td', 'pa-type-body-small hbg-num hbg-now', ''));
      tbody.append(tr);
    });
    table.append(thead, tbody); wrap.append(table);
    const sidebar = el('p', 'pa-type-body-small hbg-frame-region');
    sidebar.append(el('strong', '', frameRegions.sidebar.name + ': '), 'a frame region, not a widget. ' + frameRegions.sidebar.behaviour + ' Width: ' + frameRegions.sidebar.width + '.');
    sz.append(wrap, el('p', 'pa-type-caption hb-muted', 'Cells × rows. “At this page’s width”: the smallest span that meets the content minimum in the grid above, which changes as the window is resized.'), sidebar);
    view.append(sz);

    // ── Real widgets on the reference grid ───────────────────────────────
    const rw = el('section', 'hb-section');
    rw.append(el('h2', 'pa-type-section-title-large', 'Real widgets on the grid'),
      el('p', 'pa-type-body-small hb-muted', `The Hero, Spotlight and Carousel from the component library, placed on the reference grid (${reference.width}px, scaled to fit this page). Row 7 is left empty on purpose.`));
    const scaleBox = el('div', 'hbg-scale');
    const refBox = el('div', 'hbg-reference');
    refBox.style.width = reference.width + 'px';
    scaleBox.append(refBox);
    const car = { current: null };
    const realDraw = componentDraw(car);
    const realStatus = el('p', 'pa-type-caption hb-muted hbg-status');
    if (realDraw) {
      const realGrid = G.renderer(refBox, { types: TYPES, draw: realDraw, debug: true });
      realGrid.render(demos.real);
      const need = G.minFitWidth(demos.real, TYPES);
      const fitNow = () => {
        const s = Math.min(1, scaleBox.clientWidth / reference.width);
        refBox.style.transform = `scale(${s})`;
        scaleBox.style.height = (refBox.offsetHeight * s) + 'px';
        const here = spans.frame.querySelector('.hbg-host').clientWidth;
        const fits = G.checkFit(demos.real, TYPES, here);
        realStatus.textContent = `State: ${realGrid.state()}. This layout needs a container at least ${px(need)} wide (its widgets’ content minimums). ` +
          (fits.length ? `The grid above is ${px(here)} wide, so there it would be refused: ${fits[0].message}` : `It would also fit the grid above (${px(here)}).`);
      };
      const ro = new ResizeObserver(fitNow);
      ro.observe(scaleBox);
      cleanups.push(() => { ro.disconnect(); realGrid.destroy(); });
      // The carousel measures itself, so it starts once it is in the page.
      requestAnimationFrame(() => { if (car.current && refBox.isConnected) { car.current.start(); car.current.hold(true); } fitNow(); });
    }
    rw.append(scaleBox, realStatus);
    view.append(rw);

    // ── Validation ───────────────────────────────────────────────────────
    const va = el('section', 'hb-section');
    va.append(el('h2', 'pa-type-section-title-large', 'Validation'),
      el('p', 'pa-type-body-small hb-muted', 'Layouts are checked before anything is drawn, and never corrected: an invalid layout is refused with errors that name the widgets and the rule, so a future editor can explain why a change isn’t allowed. Touching edges and empty cells are fine. Each result below is the engine’s own answer.'));
    const cases = [
      ['Overlapping widgets', { widgets: [W('a', 1, 1, 6, 3), W('b', 5, 2, 4, 3)] }, DEMO_TYPES],
      ['Touching edges (valid)', { widgets: [W('a', 1, 1, 6, 3), W('b', 7, 1, 4, 3), W('c', 1, 4, 6, 1)] }, DEMO_TYPES],
      ['Past the last column', { widgets: [W('a', 17, 1, 6, 2)] }, DEMO_TYPES],
      ['Fractional span', { widgets: [W('a', 1, 1, 2.5, 2)] }, DEMO_TYPES],
      ['Duplicate id', { widgets: [W('a', 1, 1, 4, 2), W('a', 1, 4, 4, 2)] }, DEMO_TYPES],
      ['Below a type’s minimum cells', { widgets: [W('hero', 1, 1, 5, 6, 'feature-hero')] }, TYPES],
      ['A type that can’t be placed yet', { widgets: [W('card', 1, 1, 3, 4, 'content-card')] }, TYPES],
      ['Unknown type', { widgets: [W('x', 1, 1, 4, 2, 'poster')] }, TYPES]
    ];
    const vwrap = el('div', 'hb-table-wrap'); vwrap.tabIndex = 0;
    const vt = el('table', 'hb-table hbg-validation');
    const vh = el('tr');
    ['Case', 'Layout', 'Result'].forEach(t => { const th = el('th', 'pa-type-label', t); th.scope = 'col'; vh.append(th); });
    const vthead = el('thead'); vthead.append(vh);
    const vbody = el('tbody');
    cases.forEach(([name, layout, types]) => {
      const errs = G.validateLayout(layout, types);
      const tr = el('tr'); tr.dataset.result = errs.map(e => e.code).join(' ') || 'valid';
      const th = el('th', 'pa-type-body-small'); th.scope = 'row'; th.textContent = name;
      const lay = el('td', 'pa-type-caption');
      lay.append(el('code', 'hb-code hbg-json', layout.widgets.map(w => `${w.id} ${w.type} @${w.col},${w.row} ${w.cols}×${w.rows}`).join('; ')));
      const res = el('td', 'pa-type-body-small');
      if (!errs.length) res.append(chip('Valid', 'active'));
      errs.forEach(e => { const p = el('p', 'hbg-error'); p.append(el('code', 'hb-code', e.code), ' ' + e.message); res.append(p); });
      tr.append(th, lay, res);
      vbody.append(tr);
    });
    // A width check: the same real layout at a narrower container.
    const narrowFit = G.checkFit({ widgets: [W('hero', 1, 1, 7, 6, 'feature-hero')] }, TYPES, 1000);
    const tr = el('tr'); tr.dataset.result = narrowFit.map(e => e.code).join(' ');
    const th = el('th', 'pa-type-body-small'); th.scope = 'row'; th.textContent = 'Too small for its content at this width';
    const res = el('td', 'pa-type-body-small');
    narrowFit.forEach(e => { const p = el('p', 'hbg-error'); p.append(el('code', 'hb-code', e.code), ' ' + e.message); res.append(p); });
    const lay = el('td', 'pa-type-caption'); lay.append(el('code', 'hb-code hbg-json', 'hero feature-hero @1,1 7×6, in a 1000px container'));
    tr.append(th, lay, res); vbody.append(tr);
    vt.append(vthead, vbody); vwrap.append(vt);
    const refused = demo(freeze({ widgets: [W('a', 1, 1, 6, 3), W('b', 5, 2, 4, 3)] }), { stackBelow: 0 });
    va.append(vwrap, el('p', 'pa-type-body-small hb-muted', 'The renderer given the overlapping layout: it is refused, and nothing is drawn rather than something wrong.'), refused.frame, refused.status);
    view.append(va);

    // ── Limits ───────────────────────────────────────────────────────────
    const lim = el('section', 'hb-note');
    lim.append(el('h2', 'pa-type-item-title', 'Known limits'));
    const ul = el('ul', 'hbs-later');
    const items = limitations.concat([
      { what: 'Narrow screens', why: 'The 20-column grid has no room at 304px and is impractical well before that; pages show layouts stacked below their breakpoint. Separately authored narrow layouts may come later.' },
      { what: 'The homepage', why: 'Not on the grid yet. Its fixed banner heights don’t fall on square rows, its 70/30 split differs from 14/6 columns by 0.4 of a gutter (6.4px), and its sidebar keeps its own fixed-width track. Moving it is H5.3.' }
    ]);
    items.forEach(n => { const li = el('li', 'pa-type-body-small'); li.append(el('strong', '', n.what + ': '), n.why); ul.append(li); });
    lim.append(ul);
    view.append(lim);

    // Show the demonstrations, then keep the "at this width" column live.
    spans.show(demos.spans);
    growth.show(demos.growth);
    stacked.show(demos.spans);
    refused.show(refused.layout());
    function nowColumn() {
      const w = spans.frame.querySelector('.hbg-host').clientWidth, cell = G.cellSize(w);
      tbody.querySelectorAll('tr').forEach(tr => {
        const c = TYPES[tr.dataset.type].contract;
        const cols = Math.max(c.minCols, G.cellsFor(c.minWidth, cell)), rows = Math.max(c.minRows, G.cellsFor(G.minHeightAt(c, G.spanSize(cols, cell)), cell));
        tr.querySelector('.hbg-now').textContent = cell <= 0 ? '—' : cols > G.COLUMNS ? `Doesn’t fit (${px(w)} grid)` : `${cols} × ${rows}`;
      });
    }
    const ro = new ResizeObserver(nowColumn);
    ro.observe(spans.frame);
    cleanups.push(() => ro.disconnect());
  }

  app.register('foundations/grid', { render });
  ns.gridPage = { render, demos, withoutLowest, componentDraw };
})();
