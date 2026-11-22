// Atlas Handbook › Foundations › Colors. Every colour shown is read from the
// live stylesheet: each palette and mode is drawn inside a
// [data-theme-preview][data-mode] element (styles/theme.css), where all base
// and derived roles resolve for that palette without touching the page's own
// theme. Role names and purposes come from scripts/design/colors.js; palette
// names from scripts/theme.js. Nothing here holds a colour value.
(function () {
  'use strict';
  const ns = window.PergamonHandbook = window.PergamonHandbook || {};
  const app = ns.app;
  const meta = window.PergamonDesign && window.PergamonDesign.colors;
  const theme = window.PergamonTheme;
  if (!app || !meta || !theme) return;

  const MODES = ['dark', 'light'];
  const combos = () => theme.PALETTES.flatMap(p => MODES.map(m => ({ palette: p.id, name: p.name, mode: m })));

  // ── Reading colours ───────────────────────────────────────────────────
  // A token's resolved colour inside `scope`: put it on a real property of a
  // probe element and read the computed value back.
  function resolve(scope, token) {
    const probe = document.createElement('span');
    probe.style.cssText = `position:absolute;width:0;height:0;overflow:hidden;background-color:var(${token})`;
    scope.append(probe);
    const v = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return parse(v);
  }
  // "rgb(…)", "rgba(…)" or "color(srgb r g b / a)" → { r, g, b, a } (0–255, 0–1).
  function parse(v) {
    let m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(v);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
    m = /^color\(srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)(?:\s*\/\s*([\d.]+))?\s*\)$/.exec(v);
    if (m) return { r: +m[1] * 255, g: +m[2] * 255, b: +m[3] * 255, a: m[4] === undefined ? 1 : +m[4] };
    return null;
  }
  const hex = c => '#' + [c.r, c.g, c.b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('').toUpperCase();
  const label = c => (!c ? '—' : c.a < 1 ? `${hex(c)} at ${Math.round(c.a * 100)}%` : hex(c));
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  function luminance(c) {
    const ch = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }
  const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  // A hidden preview element for one palette and mode (for reading values).
  function scopeFor(palette, mode, parent) {
    const s = document.createElement('div');
    s.setAttribute('data-theme-preview', palette);
    s.setAttribute('data-mode', mode);
    s.setAttribute('aria-hidden', 'true');
    s.className = 'hbc-probe';
    parent.append(s);
    return s;
  }
  // The pairs in colors.js, measured for one palette and mode.
  function measure(scope) {
    const val = {};
    meta.roles.forEach(r => { val[r.id] = resolve(scope, r.token); });
    return meta.contrast.map(p => {
      const under = p.over ? val[p.over] : null;
      const bg = under ? over(val[p.bg], under) : val[p.bg];
      const fg = val[p.fg].a < 1 ? over(val[p.fg], bg) : val[p.fg];
      const r = ratio(fg, bg);
      return Object.assign({}, p, { ratio: r, pass: r >= (p.kind === 'text' ? 4.5 : 3) });
    });
  }

  function render(view, ctx) {
    const { el, chip } = ctx;
    const now = theme.get();
    const nameOf = id => (theme.PALETTES.find(p => p.id === id) || {}).name || id;
    view.append(ctx.header('Colors',
      'Atlas’s colour system: four palettes, each in dark and light, defined as six base colours from which every other role is worked out. Components use the roles, never the values, so every palette restyles them.',
      [chip('Read-only'), chip(`${theme.PALETTES.length} palettes · dark and light`, 'muted')]));

    const source = el('section', 'hb-note');
    const p = el('p', 'pa-type-body-small');
    p.append('Values live only in ', el('code', 'hb-code', 'styles/theme.css'), '; role names and purposes in ', el('code', 'hb-code', 'scripts/design/colors.js'),
      '. ', el('code', 'hb-code', 'scripts/theme.js'), ` applies the visitor’s choice: guests always see ${nameOf(theme.DEFAULT_PALETTE)}; signed-in visitors choose a palette in Settings; anyone chooses dark, light or system. The choice is kept in this browser. This page is showing ${nameOf(now.activePalette)}, ${now.resolvedMode}; the previews below show each palette on its own without changing it.`);
    source.append(el('h2', 'pa-type-item-title', 'Source of truth'), p);
    view.append(source);

    // ── Palettes ──────────────────────────────────────────────────────
    const pal = el('section', 'hb-section');
    pal.append(el('h2', 'pa-type-section-title-large', 'Palettes'),
      el('p', 'pa-type-body-small hb-muted', 'The six base colours of each palette, in dark and light, drawn with the palette’s own tokens.'));
    const grid = el('div', 'hbc-palettes');
    const swatchSets = [];
    theme.PALETTES.forEach(pdef => {
      const card = el('article', 'hb-card hbc-palette');
      const head = el('div', 'hb-card-head');
      head.append(el('h3', 'pa-type-section-title', pdef.name));
      if (pdef.id === now.activePalette) head.append(chip('In use', 'active'));
      else if (pdef.id === theme.DEFAULT_PALETTE) head.append(chip('Default', 'muted'));
      card.append(head);
      MODES.forEach(mode => {
        const scope = el('div', 'hbc-mini');
        scope.setAttribute('data-theme-preview', pdef.id);
        scope.setAttribute('data-mode', mode);
        const sample = el('div', 'hbc-mini-panel');
        sample.append(el('span', 'hbc-mini-title', mode === 'dark' ? 'Dark' : 'Light'), el('span', 'hbc-mini-text', 'Secondary text'), el('span', 'hbc-mini-button', 'Button'));
        const sw = el('ul', 'hbc-swatches');
        meta.roles.filter(r => r.group === 'base').forEach(r => {
          const li = el('li', 'hbc-swatch');
          const dot = el('span', 'hbc-dot');
          dot.style.background = `var(${r.token})`;
          li.append(dot, el('span', 'hbc-swatch-name', r.name), el('code', 'hbc-swatch-value', ''));
          li.dataset.token = r.token;
          sw.append(li);
        });
        scope.append(sample, sw);
        card.append(scope);
        swatchSets.push(scope);
      });
      grid.append(card);
    });
    pal.append(grid);
    view.append(pal);

    // ── Roles ─────────────────────────────────────────────────────────
    const rolesSec = el('section', 'hb-section');
    rolesSec.append(el('h2', 'pa-type-section-title-large', 'Roles'),
      el('p', 'pa-type-body-small hb-muted', 'Every semantic colour, with its value in the palette and mode chosen here. Choosing here changes only this panel.'));
    const tools = el('div', 'hb-toolbar');
    const radios = (labelText, name, options, value) => {
      const g = el('div', 'hb-segmented');
      g.setAttribute('role', 'radiogroup');
      g.setAttribute('aria-label', labelText);
      options.forEach(([v, l]) => {
        const lab = el('label', 'hb-segment pa-type-tab');
        const input = el('input'); input.type = 'radio'; input.name = name; input.value = v; input.checked = v === value;
        lab.append(input, el('span', '', l));
        g.append(lab);
      });
      return g;
    };
    const palPick = radios('Palette', 'hbc-palette', theme.PALETTES.map(x => [x.id, x.name]), now.activePalette);
    const modePick = radios('Mode', 'hbc-mode', [['dark', 'Dark'], ['light', 'Light']], now.resolvedMode);
    tools.append(palPick, modePick);
    const stage = el('div', 'hbc-stage');
    stage.setAttribute('data-theme-preview', now.activePalette);
    stage.setAttribute('data-mode', now.resolvedMode);

    const list = el('ul', 'hbc-roles');
    meta.roles.forEach(r => {
      const li = el('li', 'hbc-role');
      li.dataset.token = r.token;
      const sw = el('span', 'hbc-role-swatch');
      sw.style.background = `var(${r.token})`;
      const text = el('div', 'hbc-role-text');
      const name = el('div', 'hbc-role-name');
      name.append(el('span', 'pa-type-item-title', r.name), el('code', 'hb-code', r.token), ctx.chip(r.group === 'base' ? 'Base' : 'Derived', r.group === 'base' ? 'active' : 'muted'));
      text.append(name, el('p', 'pa-type-body-small', r.use));
      if (r.from) text.append(el('p', 'pa-type-caption hb-muted', 'From: ' + r.from));
      li.append(sw, text, el('code', 'hbc-role-value', ''));
      list.append(li);
    });

    // Interface examples drawn with the roles (inside the same preview).
    const examples = el('div', 'hbc-examples');
    examples.innerHTML =
      '<div class="hbc-ex-panel">' +
        '<p class="hbc-ex-title">Standard panel</p>' +
        '<p class="hbc-ex-body">Primary text on the surface. <span class="hbc-ex-secondary">Secondary text for supporting detail.</span> <a class="hbc-ex-link" href="#" tabindex="-1">An accent link</a>.</p>' +
        '<div class="hbc-ex-row"><span class="hbc-ex-btn">Primary</span><span class="hbc-ex-btn is-hover">Primary, hover</span><span class="hbc-ex-btn2">Secondary</span><span class="hbc-ex-btn2 is-focus">Focused</span></div>' +
        '<ul class="hbc-ex-list"><li>Row</li><li class="is-hover">Row, hover</li><li class="is-selected">Row, selected</li></ul>' +
        '<div class="hbc-ex-row"><span class="hbc-ex-tab is-selected">Selected tab</span><span class="hbc-ex-tab">Tab</span><span class="hbc-ex-danger">Something went wrong.</span><span class="hbc-ex-success">Saved.</span></div>' +
      '</div>' +
      '<div class="hbc-ex-inset"><p class="hbc-ex-secondary">An inset (page background) inside the panel, and the overlay that dims the page behind dialogs:</p><div class="hbc-ex-overlay"><span>Overlay</span></div></div>';
    examples.querySelectorAll('a').forEach(a => a.addEventListener('click', e => e.preventDefault()));
    stage.append(list, examples);
    rolesSec.append(tools, stage);
    view.append(rolesSec);

    // ── Contrast ──────────────────────────────────────────────────────
    const con = el('section', 'hb-section');
    con.append(el('h2', 'pa-type-section-title-large', 'Contrast'),
      el('p', 'pa-type-body-small hb-muted', 'Measured from the live colours for every palette and mode. Text needs at least 4.5:1 (WCAG AA); outlines, icons and focus at least 3:1. Decorative colours (borders, artwork) carry no requirement.'));
    const wrap = el('div', 'hb-table-wrap');
    wrap.tabIndex = 0;
    const table = el('table', 'hb-table hbc-contrast');
    const thead = el('thead'); const hr = el('tr');
    const th0 = el('th', 'pa-type-label', 'Pair'); th0.scope = 'col'; hr.append(th0);
    combos().forEach(c => { const th = el('th', 'pa-type-label', `${c.name.split(' & ')[1] || c.name} ${c.mode === 'dark' ? '●' : '○'}`); th.scope = 'col'; th.title = `${c.name}, ${c.mode}`; hr.append(th); });
    thead.append(hr);
    const tbody = el('tbody');
    table.append(thead, tbody);
    wrap.append(table);
    con.append(wrap, el('p', 'pa-type-caption hb-muted', '● dark · ○ light. A failing pair is shown here, not silently changed: palette values change only by decision.'));
    view.append(con);

    // ── Exceptions and decisions ──────────────────────────────────────
    const exc = el('section', 'hb-section');
    exc.append(el('h2', 'pa-type-section-title-large', 'Approved exceptions'),
      el('p', 'pa-type-body-small hb-muted', 'Colours that deliberately don’t follow the palette. Each has a reason and an owner.'));
    const ul = el('ul', 'hb-list');
    meta.exceptions.forEach(x => {
      const li = el('li', 'hb-list-row hbc-exception');
      const t = el('div');
      t.append(el('p', 'pa-type-item-title', x.where), el('p', 'pa-type-caption hb-muted', x.colors), el('p', 'pa-type-body-small', x.why));
      li.append(t);
      ul.append(li);
    });
    exc.append(ul);
    const later = el('section', 'hb-note');
    later.append(el('h2', 'pa-type-item-title', 'Not roles (yet)'),
      el('p', 'pa-type-body-small', 'Considered and left out until they can be shared without changing anything: a “strong border” (accent-tinted borders use ten different mixes today), a disabled opacity (0.35 to 0.65 across controls), a separate “selected” colour (selected items use the soft accent with accent text), and shadows (they belong with surfaces, the next foundation).'));
    view.append(exc, later);

    // ── Fill in the live values ───────────────────────────────────────
    const hidden = el('div', 'hbc-probes');
    hidden.setAttribute('aria-hidden', 'true');
    view.append(hidden);
    function fill() {
      if (!view.isConnected) return;
      swatchSets.forEach(scope => scope.querySelectorAll('.hbc-swatch').forEach(li => { li.querySelector('.hbc-swatch-value').textContent = label(resolve(scope, li.dataset.token)); }));
      list.querySelectorAll('.hbc-role').forEach(li => { li.querySelector('.hbc-role-value').textContent = label(resolve(stage, li.dataset.token)); });
      const results = combos().map(c => { const s = scopeFor(c.palette, c.mode, hidden); const m = measure(s); s.remove(); return m; });
      tbody.replaceChildren(...meta.contrast.map((pair, i) => {
        const tr = el('tr');
        const th = el('th', 'pa-type-body-small');
        th.scope = 'row';
        th.append(el('span', '', pair.what), el('span', 'pa-type-caption hb-muted', ` ${meta.role(pair.fg).name} on ${meta.role(pair.bg).name}${pair.over ? ' (over ' + meta.role(pair.over).name.toLowerCase() + ')' : ''} · ${pair.kind === 'text' ? 'text 4.5:1' : 'interface 3:1'}`));
        tr.append(th);
        results.forEach((m, j) => {
          const r = m[i];
          const td = el('td', 'pa-type-body-small hbc-ratio' + (r.pass ? '' : ' is-low'));
          td.dataset.label = `${combos()[j].name}, ${combos()[j].mode}`;
          td.textContent = `${r.ratio.toFixed(1)} ${r.pass ? '✓' : '✗'}`;
          td.title = r.pass ? 'Meets the requirement' : 'Below the requirement';
          tr.append(td);
        });
        return tr;
      }));
      view.dataset.contrast = JSON.stringify(results.map((m, j) => ({ combo: combos()[j], pairs: m.map(r => ({ fg: r.fg, bg: r.bg, ratio: Math.round(r.ratio * 100) / 100, pass: r.pass })) })));
    }
    const pick = () => {
      stage.setAttribute('data-theme-preview', palPick.querySelector('input:checked').value);
      stage.setAttribute('data-mode', modePick.querySelector('input:checked').value);
      list.querySelectorAll('.hbc-role').forEach(li => { li.querySelector('.hbc-role-value').textContent = label(resolve(stage, li.dataset.token)); });
    };
    palPick.addEventListener('change', pick);
    modePick.addEventListener('change', pick);
    requestAnimationFrame(fill);
  }

  app.register('foundations/colors', { render });
  ns.colorsPage = { render, parse, ratio };
})();
