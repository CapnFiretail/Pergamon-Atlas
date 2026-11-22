// Atlas Handbook › Foundations › Spacing & Surfaces. Every value shown is
// read from the live stylesheets: the tokens' computed values, and the page
// frame's narrow-screen values from layout.css's ≤ 900px rule. Token
// purposes come from scripts/design/surfaces.js. Nothing here holds a value.
(function () {
  'use strict';
  const ns = window.PergamonHandbook = window.PergamonHandbook || {};
  const app = ns.app;
  const meta = window.PergamonDesign && window.PergamonDesign.surfaces;
  const theme = window.PergamonTheme;
  if (!app || !meta || !theme) return;

  // A token's computed value on <html> (lengths resolve to px).
  const value = (token, scope) => getComputedStyle(scope || document.documentElement).getPropertyValue(token).trim();
  // A length token resolved to px through a real property.
  function px(token, scope) {
    const probe = document.createElement('span');
    probe.style.cssText = `position:absolute;visibility:hidden;width:var(${token})`;
    (scope || document.body).append(probe);
    const w = getComputedStyle(probe).width;
    probe.remove();
    return w;
  }
  // Declarations of `token` on :root inside @media rules (narrow-screen values).
  function mediaValues(token) {
    const out = [];
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const r of rules) {
        if (!(r instanceof CSSMediaRule)) continue;
        for (const s of r.cssRules) {
          if (s instanceof CSSStyleRule && s.selectorText === ':root' && s.style.getPropertyValue(token)) {
            out.push({ media: r.conditionText || r.media.mediaText, value: s.style.getPropertyValue(token).trim() });
          }
        }
      }
    }
    return out;
  }
  // "var(--space-6)" → "24px (--space-6)".
  function describe(v) {
    const m = /^var\((--[a-z0-9-]+)\)$/.exec(v);
    return m ? `${value(m[1])} (${m[1]})` : v;
  }

  function render(view, ctx) {
    const { el, chip } = ctx;
    view.append(ctx.header('Spacing & Surfaces',
      'The spacing scale, the page frame, and the surfaces everything sits on: panels, cards, items, controls and dialogs, with their corner radii and elevation.',
      [chip('Read-only'), chip(`${meta.spacing.length} spacing steps · ${meta.radii.length} radii · ${meta.shadows.length} elevations`, 'muted')]));

    const source = el('section', 'hb-note');
    const p = el('p', 'pa-type-body-small');
    p.append('Values live in ', el('code', 'hb-code', 'styles/theme.css'), ' (scale, radii, elevation) and ', el('code', 'hb-code', 'styles/layout.css'),
      ' (page frame); purposes in ', el('code', 'hb-code', 'scripts/design/surfaces.js'), '. Everything below is drawn with the tokens and measured live.');
    source.append(el('h2', 'pa-type-item-title', 'Source of truth'), p);
    view.append(source);

    // ── Spacing scale ─────────────────────────────────────────────────
    const sp = el('section', 'hb-section');
    sp.append(el('h2', 'pa-type-section-title-large', 'Spacing scale'),
      el('p', 'pa-type-body-small hb-muted', 'Steps of 4px. The token number is the multiple of 4: --space-4 is 16px.'));
    const scale = el('ul', 'hbs-scale');
    meta.spacing.forEach(s => {
      const li = el('li', 'hbs-step');
      li.dataset.token = s.token;
      const bar = el('span', 'hbs-bar');
      bar.style.width = `var(${s.token})`;
      const name = el('div', 'hbs-step-name');
      name.append(el('code', 'hb-code', s.token), el('span', 'pa-type-item-title hbs-value', ''));
      li.append(el('span', 'hbs-bar-track', ''), name, el('p', 'pa-type-body-small hb-muted', s.use));
      li.firstChild.append(bar);
      scale.append(li);
    });
    sp.append(scale);
    view.append(sp);

    // ── Page frame ────────────────────────────────────────────────────
    const fr = el('section', 'hb-section');
    fr.append(el('h2', 'pa-type-section-title-large', 'Page frame'),
      el('p', 'pa-type-body-small hb-muted', 'Two inset families: ordinary pages and widget pages. They are deliberately different and are not to be unified.'));
    const diagrams = el('div', 'hbs-frames');
    const frameDiagram = (title, insetBlock, insetInline, widgets) => {
      const card = el('article', 'hb-card hbs-frame-card');
      card.append(el('h3', 'pa-type-item-title', title));
      const page = el('div', 'hbs-frame');
      page.style.padding = `var(${insetBlock}) var(${insetInline})`;
      const content = el('div', 'hbs-frame-content' + (widgets ? ' is-widgets' : ''));
      if (widgets) ['Sidebar', 'Content (70)', 'Context (30)'].forEach(t => content.append(el('span', 'hbs-frame-widget', t)));
      else content.append(el('span', 'hbs-frame-widget', 'Content'));
      page.append(content);
      card.append(page);
      return card;
    };
    diagrams.append(frameDiagram('Ordinary page', '--page-inset-block', '--page-inset-inline', false),
      frameDiagram('Widget page (homepage, Handbook)', '--page-inset-widgets', '--page-inset-widgets', true));
    fr.append(diagrams);
    const wrap = el('div', 'hb-table-wrap'); wrap.tabIndex = 0;
    const table = el('table', 'hb-table hbs-frame-table');
    const head = el('tr');
    ['Token', 'Purpose', 'This window', 'Narrow screens'].forEach(t => { const th = el('th', 'pa-type-label', t); th.scope = 'col'; head.append(th); });
    const thead = el('thead'); thead.append(head);
    const tbody = el('tbody');
    meta.frame.forEach(f => {
      const tr = el('tr'); tr.dataset.token = f.token;
      const th = el('th', 'pa-type-body-small'); th.scope = 'row'; th.append(el('code', 'hb-code', f.token));
      const narrow = mediaValues(f.token).map(m => `${describe(m.value)} at ${m.media}`).join('; ') || 'Same';
      tr.append(th, el('td', 'pa-type-body-small', f.use), el('td', 'pa-type-body-small hbs-now', px(f.token)), el('td', 'pa-type-body-small hbs-narrow', narrow));
      tbody.append(tr);
    });
    table.append(thead, tbody);
    wrap.append(table);
    fr.append(wrap);
    view.append(fr);

    // ── Radii ─────────────────────────────────────────────────────────
    const ra = el('section', 'hb-section');
    ra.append(el('h2', 'pa-type-section-title-large', 'Corner radii'),
      el('p', 'pa-type-body-small hb-muted', 'Larger surfaces have rounder corners, so nested surfaces read as nested.'));
    const radii = el('ul', 'hbs-radii');
    meta.radii.forEach(r => {
      const li = el('li', 'hbs-radius'); li.dataset.token = r.token;
      const sample = el('span', 'hbs-radius-sample'); sample.style.borderRadius = `var(${r.token})`;
      const text = el('div', 'hbs-radius-text');
      const name = el('div', 'hbs-step-name');
      name.append(el('span', 'pa-type-item-title', r.name), el('code', 'hb-code', r.token), el('span', 'pa-type-caption hbs-value', ''));
      text.append(name, el('p', 'pa-type-body-small hb-muted', r.use));
      li.append(sample, text);
      radii.append(li);
    });
    ra.append(radii);
    view.append(ra);

    // ── Surfaces ──────────────────────────────────────────────────────
    const su = el('section', 'hb-section');
    su.append(el('h2', 'pa-type-section-title-large', 'Surfaces'),
      el('p', 'pa-type-body-small hb-muted', 'The recipes every component is built from, nested as they are on the site.'));
    const nest = el('div', 'hbs-nest');
    nest.innerHTML =
      '<div class="hbs-panel" data-surface="panel"><p class="hbs-label">Panel</p>' +
        '<div class="hbs-card" data-surface="card"><p class="hbs-label">Card</p>' +
          '<div class="hbs-items"><span class="hbs-item" data-surface="item">Item</span><span class="hbs-item is-hover">Item, hover</span><span class="hbs-item is-selected">Item, selected</span></div>' +
        '</div>' +
        '<div class="hbs-controls"><span class="hbs-control is-primary" data-surface="control">Primary</span><span class="hbs-control">Secondary</span><span class="hbs-control is-pill">Pill</span></div>' +
      '</div>';
    const recipes = el('ul', 'hb-list');
    meta.surfaces.forEach(s => {
      const li = el('li', 'hb-list-row hbs-recipe'); li.dataset.surface = s.id;
      const t = el('div');
      const name = el('div', 'hbs-step-name');
      name.append(el('span', 'pa-type-item-title', s.name), el('code', 'hb-code', s.radius));
      if (s.shadow) name.append(el('code', 'hb-code', s.shadow));
      t.append(name, el('p', 'pa-type-body-small', s.use), el('p', 'pa-type-caption hb-muted', 'Used by: ' + s.where));
      li.append(t);
      recipes.append(li);
    });
    const surfGrid = el('div', 'hbs-surfaces');
    surfGrid.append(nest, recipes);
    su.append(surfGrid);
    view.append(su);

    // ── Elevation ─────────────────────────────────────────────────────
    const el2 = el('section', 'hb-section');
    el2.append(el('h2', 'pa-type-section-title-large', 'Elevation'),
      el('p', 'pa-type-body-small hb-muted', 'Three levels, lighter in light mode where the same shadow reads much heavier. Shown in the current palette, dark and light.'));
    const modes = el('div', 'hbs-modes');
    const pal = theme.get().activePalette;
    ['dark', 'light'].forEach(mode => {
      const stage = el('div', 'hbs-elevation');
      stage.setAttribute('data-theme-preview', pal);
      stage.setAttribute('data-mode', mode);
      stage.append(el('p', 'hbs-label', mode === 'dark' ? 'Dark' : 'Light'));
      const row = el('div', 'hbs-shadow-row');
      meta.shadows.forEach(s => {
        const box = el('div', 'hbs-shadow'); box.dataset.token = s.token;
        box.style.boxShadow = `var(${s.token})`;
        box.style.borderRadius = s.token === '--shadow-dialog' ? 'var(--radius-dialog)' : 'var(--radius-panel)';
        box.append(el('span', 'hbs-shadow-name', s.name), el('code', 'hbs-shadow-value', ''));
        row.append(box);
      });
      stage.append(row);
      modes.append(stage);
    });
    const uses = el('ul', 'hb-list');
    meta.shadows.forEach(s => {
      const li = el('li', 'hb-list-row');
      const t = el('div');
      const name = el('div', 'hbs-step-name');
      name.append(el('span', 'pa-type-item-title', s.name), el('code', 'hb-code', s.token));
      t.append(name, el('p', 'pa-type-body-small', s.use));
      li.append(t);
      uses.append(li);
    });
    el2.append(modes, uses);
    view.append(el2);

    // ── Not tokens (yet) ──────────────────────────────────────────────
    const later = el('section', 'hb-note');
    later.append(el('h2', 'pa-type-item-title', 'Not tokens (yet)'));
    const ul = el('ul', 'hbs-later');
    meta.notYet.forEach(n => { const li = el('li', 'pa-type-body-small'); li.append(el('strong', '', n.what + ': '), n.why); ul.append(li); });
    later.append(ul);
    view.append(later);

    // ── Live values ───────────────────────────────────────────────────
    function fill() {
      if (!view.isConnected) return;
      scale.querySelectorAll('.hbs-step').forEach(li => { li.querySelector('.hbs-value').textContent = px(li.dataset.token); });
      radii.querySelectorAll('.hbs-radius').forEach(li => { li.querySelector('.hbs-value').textContent = value(li.dataset.token); });
      modes.querySelectorAll('.hbs-shadow').forEach(box => { box.querySelector('.hbs-shadow-value').textContent = value(box.dataset.token, box); });
      tbody.querySelectorAll('tr').forEach(tr => { tr.querySelector('.hbs-now').textContent = px(tr.dataset.token); });
    }
    const onResize = () => fill();
    window.addEventListener('resize', onResize);
    if (ctx.onCleanup) ctx.onCleanup(() => window.removeEventListener('resize', onResize));
    requestAnimationFrame(fill);
  }

  app.register('foundations/spacing', { render });
  ns.spacingPage = { render };
})();
