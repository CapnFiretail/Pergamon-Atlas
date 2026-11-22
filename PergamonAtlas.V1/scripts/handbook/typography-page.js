// Handbook › Foundations › Typography (H1, read-only).
//
// Every sample on this page is drawn by the site's own stylesheet: it carries
// the role's .pa-type-* class from styles/typography.css (generated from the
// registry). The values shown are read back from the live page, never
// copied: "declared" is the token as the stylesheet sets it right now (at
// this width), "rendered" is what the browser computed for the sample. The
// registry (scripts/design/typography.js) supplies only the description:
// intended use, restrictions, status and where the site uses each role. If the
// stylesheet and the registry disagree, the role shows a warning.
//
// The phone preview is this page's specimen view inside a 390px-wide iframe,
// so viewport breakpoints apply exactly as on a phone.
(function () {
  'use strict';
  const typo = window.PergamonDesign && window.PergamonDesign.typography;
  const app = window.PergamonHandbook && window.PergamonHandbook.app;
  if (!typo || !app) return;
  const { registry } = typo;

  const KIND = { role: 'Global role', variant: 'Variant', exception: 'Approved exception' };
  const ADOPTION = {
    adopted: ['Connected', 'active', 'Uses the role’s tokens, so a change to the role reaches it.'],
    equivalent: ['Equivalent', 'active', 'Same declared values; not yet linked to the tokens.'],
    pending: ['Pending', 'warn', 'Differs today; normalisation awaits approval.'],
    legacy: ['Legacy', 'muted', 'Legacy page styling; migration not started.']
  };
  const PROP_LABEL = { family: 'Family', size: 'Size', weight: 'Weight', leading: 'Line height', tracking: 'Tracking', transform: 'Case' };
  const GENERIC = ['serif', 'sans-serif', 'monospace', 'system-ui', '-apple-system', 'cursive', 'fantasy'];

  // ── Reading the live stylesheet ───────────────────────────────────────
  const rootStyle = () => getComputedStyle(document.documentElement);
  const declared = (role, prop) => (typo.value(role, prop) === 'inherit' ? 'inherit' : rootStyle().getPropertyValue(typo.token(role.id, prop)).trim());
  // What the registry expects the token to hold at this viewport width.
  function expected(role, prop) {
    // The browser resolves var() inside custom properties: the family token
    // reads back as the family's stack.
    if (prop === 'family') return rootStyle().getPropertyValue(registry.families[role.family].token).trim();
    if (prop !== 'size') return typo.value(role, prop);
    let v = role.size;
    for (const s of role.responsive || []) if (s.type === 'media' && window.matchMedia(s.query).matches) v = s.size;
    return v;
  }
  const normal = v => String(v).replace(/\s+/g, '').toLowerCase();
  function drift(role) {
    return typo.PROPS.filter(p => typo.value(role, p) !== 'inherit' && normal(declared(role, p)) !== normal(expected(role, p)));
  }
  function rendered(sample) {
    const cs = getComputedStyle(sample);
    const px = v => (/px$/.test(v) ? Math.round(parseFloat(v) * 10) / 10 + 'px' : v);
    return { size: px(cs.fontSize), weight: cs.fontWeight, leading: px(cs.lineHeight), tracking: cs.letterSpacing === 'normal' ? 'normal' : px(cs.letterSpacing), transform: cs.textTransform, family: cs.fontFamily };
  }

  // ── Fonts: which font in a stack this device draws with ──────────────
  const strip = n => n.replace(/^["']|["']$/g, '');
  const canvas = document.createElement('canvas').getContext('2d');
  function width(font) { canvas.font = font; return canvas.measureText('mmmmmmmmmmlli WWW 0123 Qq&@').width; }
  function availability(name) {
    const fam = strip(name);
    if (GENERIC.includes(fam)) return { state: 'generic', label: 'System default' };
    const faces = [...document.fonts].filter(f => strip(f.family) === fam);
    if (faces.length) return faces.some(f => f.status === 'loaded') ? { state: 'web', label: 'Web font, loaded' } : { state: 'missing', label: 'Web font, not loaded' };
    // A local font changes the width against both generic baselines.
    const installed = ['monospace', 'serif'].every(base => width(`72px "${fam}", ${base}`) !== width(`72px ${base}`));
    return installed ? { state: 'local', label: 'Installed on this device' } : { state: 'missing', label: 'Not on this device' };
  }
  const renderingWith = stack => { for (const n of stack) { const a = availability(n); if (a.state !== 'missing') return { name: strip(n), a }; } return null; };

  // ── Shared drawing ────────────────────────────────────────────────────
  function sampleBox(role, ctx, text) {
    const p = role.preview || {};
    const box = ctx.el('div', 'hb-sample' + (p.surface ? ' hb-sample--' + p.surface : ''));
    if (p.container) {
      // Container-sized roles (cqi) are previewed in a container of the width
      // they are designed for; a named container also applies its steps.
      box.style.containerType = 'inline-size';
      if (p.container !== 'inline') box.style.containerName = p.container;
      box.style.maxWidth = (p.width || 600) + 'px';
    }
    const t = ctx.el('p', 'pa-type-' + role.id + ' hb-sample-text', text || p.text || role.name);
    box.append(t);
    return { box, text: t };
  }
  function valuesList(role, sample, ctx) {
    const dl = ctx.el('dl', 'hb-values');
    const r = rendered(sample);
    for (const p of typo.PROPS) {
      const d = declared(role, p);
      let shown = d;
      if (p === 'family') shown = `${registry.families[role.family].label} (${registry.families[role.family].token})`;
      const row = ctx.el('div', 'hb-value');
      const dd = ctx.el('dd');
      dd.append(ctx.el('code', 'hb-code', shown));
      if (p === 'size' || p === 'leading' || p === 'tracking') if (r[p] !== d && d !== 'normal' && d !== 'inherit') dd.append(ctx.el('span', 'pa-type-caption hb-muted', ' → ' + r[p]));
      if (p === 'size' && d === 'inherit') dd.append(ctx.el('span', 'pa-type-caption hb-muted', ' (from its context)'));
      row.append(ctx.el('dt', 'pa-type-caption hb-muted', PROP_LABEL[p]), dd);
      dl.append(row);
    }
    if (role.numeric) {
      const row = ctx.el('div', 'hb-value');
      const dd = ctx.el('dd'); dd.append(ctx.el('code', 'hb-code', rootStyle().getPropertyValue(typo.token(role.id, 'numeric')).trim()));
      row.append(ctx.el('dt', 'pa-type-caption hb-muted', 'Figures'), dd);
      dl.append(row);
    }
    return dl;
  }

  // ── Families ──────────────────────────────────────────────────────────
  function familyCard(id, f, ctx) {
    const card = ctx.el('article', 'hb-card hb-family');
    const head = ctx.el('div', 'hb-card-head');
    head.append(ctx.el('h3', 'pa-type-section-title', f.label), ctx.chip(f.status === 'legacy' ? 'Legacy' : 'Configured: ' + f.configured, f.status === 'legacy' ? 'muted' : 'active'));
    const spec = ctx.el('div', 'hb-specimen');
    spec.style.fontFamily = `var(${f.token})`;
    for (const w of f.weights) {
      const line = ctx.el('p', 'hb-specimen-line');
      line.style.fontWeight = String(w);
      line.append(ctx.el('span', 'hb-specimen-weight pa-type-caption hb-muted', String(w)), ctx.el('span', 'hb-specimen-text', 'Sphinx of black quartz, judge my vow 0123456789'));
      spec.append(line);
    }
    const now = renderingWith(f.stack);
    const meta = ctx.el('dl', 'hb-values');
    const add = (label, value, code) => { const row = ctx.el('div', 'hb-value'); const dd = ctx.el('dd'); dd.append(code ? ctx.el('code', 'hb-code', value) : ctx.el('span', 'pa-type-body-small', value)); row.append(ctx.el('dt', 'pa-type-caption hb-muted', label), dd); meta.append(row); };
    add('Token', f.token, true);
    add('This device renders', now ? `${now.name} — ${now.a.label.toLowerCase()}` : 'Unknown');
    add('Loading', f.loading);
    const stack = ctx.el('ol', 'hb-stack');
    stack.setAttribute('aria-label', f.label + ' font stack, in order');
    for (const n of f.stack) {
      const a = availability(n);
      const li = ctx.el('li', 'hb-stack-font is-' + a.state + (now && strip(n) === now.name ? ' is-current' : ''));
      li.append(ctx.el('span', 'pa-type-body-small', strip(n)), ctx.el('span', 'pa-type-caption hb-muted', a.label));
      stack.append(li);
    }
    card.append(head, spec, meta, ctx.el('h4', 'pa-type-label hb-muted', 'Fallback order'), stack, ctx.el('p', 'pa-type-caption hb-muted', f.note));
    return card;
  }

  // ── One role ──────────────────────────────────────────────────────────
  function roleEntry(role, ctx) {
    const art = ctx.el('article', 'hb-role');
    art.id = 'role-' + role.id;
    const head = ctx.el('header', 'hb-role-head');
    const title = ctx.el('div', 'hb-role-title');
    title.append(ctx.el('h3', 'pa-type-item-title', role.name), ctx.el('code', 'hb-code', '.pa-type-' + role.id));
    const chips = ctx.el('div', 'hb-chips');
    chips.append(ctx.chip(KIND[role.kind], role.kind === 'exception' ? 'warn' : role.kind === 'variant' ? 'muted' : 'active'));
    if (role.of) chips.append(ctx.chip('of ' + (typo.role(role.of) || {}).name, 'muted'));
    if (role.status === 'legacy') chips.append(ctx.chip('Legacy · migration pending', 'warn'));
    head.append(title, chips);

    const s = sampleBox(role, ctx);
    const body = ctx.el('div', 'hb-role-body');
    // Filled by _refresh() once the sample is on the page (computed styles
    // need an attached element), and again on resize or theme change.
    const values = ctx.el('dl', 'hb-values');
    const about = ctx.el('div', 'hb-role-about');
    about.append(ctx.el('p', 'pa-type-body-small', role.use));
    if (role.restrictions && role.restrictions.length) {
      const ul = ctx.el('ul', 'hb-rules');
      role.restrictions.forEach(t => ul.append(ctx.el('li', 'pa-type-body-small hb-muted', t)));
      about.append(ul);
    }
    if (role.inherits && role.inherits.length) about.append(ctx.el('p', 'pa-type-caption hb-muted', `Inherits ${role.inherits.map(p => PROP_LABEL[p].toLowerCase()).join(', ')} from ${(typo.role(role.of) || {}).name}, so changes to it reach this variant.`));
    const resp = (role.responsive || []).map(x => x.type === 'note' ? x.text : `${x.type === 'container' ? 'In the ' + x.container + ' container at ' : 'At '}${x.query.replace(/[()]/g, '')}: ${x.size}.`);
    if (resp.length) { const p = ctx.el('p', 'pa-type-caption hb-muted'); p.textContent = 'Responsive: ' + resp.join(' '); about.append(p); }
    body.append(values, about);

    const uses = ctx.el('details', 'hb-uses');
    const counts = {};
    (role.adoption || []).forEach(a => { counts[a.status] = (counts[a.status] || 0) + 1; });
    const sum = ctx.el('summary', 'pa-type-body-small');
    sum.textContent = `Where the site uses it (${(role.adoption || []).length})`;
    const sumChips = ctx.el('span', 'hb-chips');
    Object.keys(ADOPTION).filter(k => counts[k]).forEach(k => sumChips.append(ctx.chip(counts[k] + ' ' + ADOPTION[k][0].toLowerCase(), ADOPTION[k][1])));
    sum.append(sumChips);
    const ul = ctx.el('ul', 'hb-adoption');
    for (const a of role.adoption || []) {
      const li = ctx.el('li', 'hb-adoption-row');
      const where = ctx.el('div', 'hb-adoption-where');
      where.append(ctx.el('code', 'hb-code', a.selector), ctx.el('span', 'pa-type-caption hb-muted', a.file));
      const what = ctx.el('div', 'hb-adoption-what');
      const st = ADOPTION[a.status];
      what.append(ctx.chip(st[0], st[1]));
      const diff = Object.entries(a.current || {}).map(([k, v]) => `${PROP_LABEL[k].toLowerCase()} ${v}`).join(', ');
      if (diff) what.append(ctx.el('span', 'pa-type-caption', 'Today: ' + diff));
      if (a.note) what.append(ctx.el('span', 'pa-type-caption hb-muted', a.note));
      li.append(where, what);
      ul.append(li);
    }
    uses.append(sum, ul);

    const off = drift(role);
    art.append(head);
    if (off.length) {
      const warn = ctx.el('p', 'hb-alert pa-type-body-small');
      warn.setAttribute('role', 'status');
      warn.textContent = `The stylesheet differs from the registry for ${off.map(p => PROP_LABEL[p].toLowerCase()).join(', ')}. Run node tools/build-typography.mjs.`;
      art.append(warn);
    }
    art.append(s.box, body, uses);
    let current = values;
    art._refresh = () => { const fresh = valuesList(role, s.text, ctx); current.replaceWith(fresh); current = fresh; };
    return art;
  }

  // ── The page ──────────────────────────────────────────────────────────
  function render(view, ctx) {
    const roles = registry.roles;
    const count = k => roles.filter(r => r.kind === k).length;
    view.append(ctx.header('Typography',
      'Atlas’s semantic type roles: what each one is for, how it looks right now and where the site uses it. Every sample below is drawn by the live stylesheet.',
      [ctx.chip('Read-only'), ctx.chip('Editing planned', 'muted')]));

    const stats = ctx.el('ul', 'hb-stats');
    const adoption = roles.flatMap(r => r.adoption || []);
    [[count('role'), 'Global roles'], [count('variant'), 'Variants'], [count('exception'), 'Approved exceptions'],
     [adoption.filter(a => a.status === 'adopted').length, 'Connected styles'],
     [adoption.filter(a => a.status !== 'adopted').length, 'Not yet connected']].forEach(([n, label]) => {
      const li = ctx.el('li', 'hb-stat');
      li.append(ctx.el('span', 'pa-type-section-title-large pa-type-numeric', String(n)), ctx.el('span', 'pa-type-caption hb-muted', label));
      stats.append(li);
    });
    view.append(stats);

    const source = ctx.el('section', 'hb-note');
    source.append(ctx.el('h2', 'pa-type-item-title', 'Source of truth'));
    const p = ctx.el('p', 'pa-type-body-small');
    p.append('Roles are defined once in ', ctx.el('code', 'hb-code', 'scripts/design/typography.js'), '. ',
      ctx.el('code', 'hb-code', 'tools/build-typography.mjs'), ' writes them to ', ctx.el('code', 'hb-code', 'styles/typography.css'),
      ' as tokens (--type-<role>-<property>) and classes (.pa-type-<role>), and tests check both the stylesheet and every “where it’s used” entry against the CSS. The site’s header, sidebar and homepage widgets use the tokens in their own CSS (“Connected”), so changing a role here restyles them; other pages still have their own values (“Equivalent”, “Pending”, “Legacy”).');
    source.append(p);
    view.append(source);

    // Families
    const fam = ctx.el('section', 'hb-section');
    fam.setAttribute('aria-labelledby', 'hb-families');
    const fh = ctx.el('h2', 'pa-type-section-title-large', 'Font families'); fh.id = 'hb-families';
    fam.append(fh, ctx.el('p', 'pa-type-body-small hb-muted', 'The display and interface families are configured defaults, set in styles/theme.css; changing them is planned for a later phase. What a device shows depends on the fallback order below.'));
    const grid = ctx.el('div', 'hb-family-grid');
    const famCards = () => Object.entries(registry.families).map(([id, f]) => familyCard(id, f, ctx));
    famCards().forEach(c => grid.append(c));
    fam.append(grid);
    view.append(fam);
    // Web fonts may finish loading after the first draw: redraw the cards then.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (grid.isConnected) grid.replaceChildren(...famCards()); });

    // Scale
    const scale = ctx.el('section', 'hb-section');
    scale.setAttribute('aria-labelledby', 'hb-scale');
    const sh = ctx.el('h2', 'pa-type-section-title-large', 'Type roles'); sh.id = 'hb-scale';
    const tools = ctx.el('div', 'hb-toolbar');
    const filter = ctx.el('div', 'hb-segmented');
    filter.setAttribute('role', 'radiogroup');
    filter.setAttribute('aria-label', 'Show');
    const preview = ctx.el('div', 'hb-segmented');
    preview.setAttribute('role', 'radiogroup');
    preview.setAttribute('aria-label', 'Preview width');
    const radio = (group, name, value, label, checked) => {
      const l = ctx.el('label', 'hb-segment pa-type-tab');
      const i = ctx.el('input'); i.type = 'radio'; i.name = name; i.value = value; i.checked = !!checked;
      l.append(i, ctx.el('span', '', label));
      group.append(l);
      return i;
    };
    [['all', 'All'], ['role', 'Global'], ['variant', 'Variants'], ['exception', 'Exceptions']].forEach(([v, l], i) => radio(filter, 'hb-kind', v, l, i === 0));
    [['desktop', 'This width'], ['phone', 'Phone (390px)']].forEach(([v, l], i) => radio(preview, 'hb-width', v, l, i === 0));
    tools.append(filter, preview);
    scale.append(sh, ctx.el('p', 'pa-type-body-small hb-muted', 'Declared values come from the stylesheet at the current width; an arrow shows what the browser rendered for the sample. Text colour isn’t part of a role: it follows the theme.'), tools);

    const list = ctx.el('div', 'hb-roles');
    const entries = roles.map(r => { const e = roleEntry(r, ctx); list.append(e); return { r, e }; });
    const phone = ctx.el('div', 'hb-phone');
    phone.hidden = true;
    scale.append(list, phone);
    view.append(scale);

    filter.addEventListener('change', e => {
      entries.forEach(({ r, e: node }) => { node.hidden = !(e.target.value === 'all' || r.kind === e.target.value); });
    });
    preview.addEventListener('change', e => {
      const isPhone = e.target.value === 'phone';
      list.hidden = isPhone; phone.hidden = !isPhone;
      filter.querySelectorAll('input').forEach(i => { i.disabled = isPhone; });
      if (isPhone && !phone.firstChild) {
        const f = ctx.el('iframe', 'hb-phone-frame');
        f.title = 'Type roles at phone width (390 pixels)';
        f.src = '/handbook/?view=specimen#/foundations/typography';
        f.width = '392';
        phone.append(f, ctx.el('p', 'pa-type-caption hb-muted', 'The same roles in a 390px-wide frame, so phone breakpoints apply exactly as on a phone.'));
      }
    });

    // Exceptions and pending normalisation
    const exc = ctx.el('section', 'hb-section');
    exc.setAttribute('aria-labelledby', 'hb-exceptions');
    const eh = ctx.el('h2', 'pa-type-section-title-large', 'Exceptions and pending normalisation'); eh.id = 'hb-exceptions';
    exc.append(eh);
    const exList = ctx.el('ul', 'hb-list');
    roles.filter(r => r.kind === 'exception').forEach(r => {
      const li = ctx.el('li', 'hb-list-row');
      const a = ctx.el('a', 'pa-type-item-title', r.name); a.href = '#role-' + r.id;
      a.addEventListener('click', e => { e.preventDefault(); const t = document.getElementById('role-' + r.id); if (t) { t.scrollIntoView({ block: 'start' }); t.querySelector('h3').setAttribute('tabindex', '-1'); t.querySelector('h3').focus({ preventScroll: true }); } });
      li.append(a, ctx.el('span', 'pa-type-caption hb-muted', r.use));
      exList.append(li);
    });
    registry.glyphExceptions.forEach(g => {
      const li = ctx.el('li', 'hb-list-row');
      li.append(ctx.el('span', 'pa-type-item-title', 'Game glyphs'), ctx.el('span', 'pa-type-caption hb-muted', `${g.where}. ${g.note}`));
      exList.append(li);
    });
    exc.append(ctx.el('h3', 'pa-type-label hb-muted', 'Approved exceptions'), exList);
    const pend = ctx.el('ul', 'hb-list');
    roles.forEach(r => (r.adoption || []).filter(a => a.status === 'pending' || a.status === 'legacy').forEach(a => {
      const li = ctx.el('li', 'hb-list-row');
      const where = ctx.el('span', 'hb-adoption-where');
      where.append(ctx.el('code', 'hb-code', a.selector), ctx.el('span', 'pa-type-caption hb-muted', a.file));
      const diff = Object.entries(a.current || {}).map(([k, v]) => `${PROP_LABEL[k].toLowerCase()} ${v}`).join(', ');
      li.append(where, ctx.el('span', 'pa-type-caption', `${r.name}${diff ? ' · today: ' + diff : ''}`), ctx.chip(ADOPTION[a.status][0], ADOPTION[a.status][1]));
      pend.append(li);
    }));
    exc.append(ctx.el('h3', 'pa-type-label hb-muted', 'Awaiting migration'), pend,
      ctx.el('p', 'pa-type-caption hb-muted', 'Game pages keep their legacy typography in this phase; their migration and the normalisations above each need approval.'));
    view.append(exc);

    // Keep the readouts true to the current width and theme.
    let t = 0;
    // (PergamonTheme has no way to unsubscribe, so a page that is gone ignores it.)
    const refresh = () => { clearTimeout(t); t = setTimeout(() => { if (list.isConnected) entries.forEach(({ e }) => e._refresh()); }, 120); };
    requestAnimationFrame(() => entries.forEach(({ e }) => e._refresh()));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
    window.addEventListener('resize', refresh);
    const theme = window.PergamonTheme;
    if (theme && theme.onChange) theme.onChange(refresh);
    ctx.onCleanup(() => window.removeEventListener('resize', refresh));
  }

  // The phone frame: just the roles, at the frame's own width.
  function specimen(view, ctx) {
    view.append(ctx.el('p', 'pa-type-label hb-muted', 'Type roles · ' + window.innerWidth + 'px'));
    registry.roles.forEach(r => {
      const row = ctx.el('section', 'hb-spec');
      const s = sampleBox(r, ctx);
      row.append(ctx.el('p', 'pa-type-caption hb-muted', r.name), s.box);
      const line = ctx.el('p', 'pa-type-caption hb-muted');
      row.append(line);
      view.append(row);
      const show = () => { const x = rendered(s.text); line.textContent = `${x.size} / ${x.leading} · ${x.weight}${x.tracking !== 'normal' ? ' · ' + x.tracking : ''}`; };
      requestAnimationFrame(show);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(show);
    });
  }

  app.register('foundations/typography', { render, specimen });
  window.PergamonHandbook.typographyPage = { render, specimen };
})();
