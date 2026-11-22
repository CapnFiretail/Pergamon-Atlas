// "Site Navigation" (Admin Mode): the sidebar's links on every regular page.
//
// Site-wide configuration, stored as the component `site.sidebar` of the
// homepage CMS document so it shares the homepage's draft, Publish Changes,
// Version History and Restore (no second publishing system). Every change
// goes into the working copy (workspace.js), so Admin view shows it on the
// homepage's own sidebar at once; Save Draft here (or in any card editor)
// saves it, and visitors see it only after Publish Changes. The server
// (cms_check_nav, migration 0013) checks every label, icon and destination.
// Hiding or removing a link never restricts the page it points to.
//
//   links        grouped like the sidebar; select one to edit it; show / hide
//   properties   label, icon, destination (the site's pages or a live game),
//                visible, move up / down (across groups), remove (with undo)
//   preview      the sidebar as visitors will see it, drawn by the site's own
//                sidebar code (PergamonLayout.siteNavigation.html)
//
// Created by admin.js: siteNav.create({ workspace, layout, games, onChanged(),
//   onForbidden(), returnFocus() }) → { open(from), isOpen(), refresh(), destroy() }
(function () {
  'use strict';
  const cms = window.PergamonCMS = window.PergamonCMS || {};
  const ID = 'site.sidebar';
  const ICONS = {
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.5 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
  };
  const svg = (paths, cls) => `<svg class="${cls || 'cms-edit-icon'}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
  const ICON_NAMES = { home: 'Home', games: 'Games', suggestions: 'Speech bubble', achievements: 'Trophy', leaderboards: 'Chart', updates: 'Document', settings: 'Gear', account: 'Person' };
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const clone = v => JSON.parse(JSON.stringify(v));
  let uidCount = 0;
  const uid = p => `${p}-${++uidCount}`;

  function create(env) {
    const { workspace, layout } = env;
    const nav = layout.siteNavigation;
    const LIMITS = nav.limits;

    // ── Frame (the publish dialog's, like Manage cards) ──────────────────
    const overlay = el('div', 'cms-publish cms-nav');
    overlay.hidden = true;
    const dialog = el('div', 'cms-publish-dialog cms-nav-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const head = el('header', 'cms-nav-head');
    const eyebrow = el('p', 'cms-drawer-eyebrow', 'Admin Mode · Whole website');
    const title = el('h2', 'cms-publish-title', 'Site Navigation');
    title.id = uid('cms-nav-title');
    dialog.setAttribute('aria-labelledby', title.id);
    const state = el('p', 'cms-drawer-status');
    head.append(eyebrow, title, state);
    const intro = el('p', 'cms-manage-intro');
    intro.id = uid('cms-nav-intro');
    intro.textContent = 'The sidebar links on every page of the website (the Handbook keeps its own). Changes are part of the homepage draft: Save Draft, then Publish Changes in the Admin Mode panel. Version History includes them. Hiding a link doesn’t restrict access to its page.';
    dialog.setAttribute('aria-describedby', intro.id);

    const body = el('div', 'cms-nav-body');
    const listCol = el('section', 'cms-nav-col cms-nav-links');
    listCol.setAttribute('aria-label', 'Links');
    const propsCol = el('section', 'cms-nav-col cms-nav-props');
    propsCol.setAttribute('aria-label', 'Selected link');
    const previewCol = el('section', 'cms-nav-col cms-nav-preview');
    previewCol.setAttribute('aria-label', 'Preview');
    body.append(listCol, propsCol, previewCol);

    const status = el('p', 'cms-publish-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const actions = el('div', 'cms-publish-actions');
    dialog.append(head, intro, body, status, actions);
    overlay.append(dialog);
    document.body.append(overlay);

    let draft = null;            // the navigation being edited (may be briefly invalid while typing)
    let selected = null;         // item id
    let undo = null;             // { item, section, index, label } after a removal
    let saving = false;
    let conflictInfo = null;
    let opener = null;
    let lastCommitted = null;    // the working copy's site.sidebar as this editor last left it

    const current = () => workspace.component(ID);
    const fromWorkspace = () => clone(current() || nav.builtIn());
    const items = () => draft.sections.flatMap((s, si) => s.items.map((it, ii) => ({ it, si, ii })));
    const find = id => items().find(x => x.it.id === id) || null;
    const total = () => items().length;
    function setStatus(text, kind) { status.textContent = text || ''; if (kind) status.dataset.kind = kind; else delete status.dataset.kind; }

    // A label's problem, or null.
    function labelProblem(v) {
      if (!v.trim()) return 'Enter a label.';
      if (v.length > LIMITS.label) return `Use at most ${LIMITS.label} characters (now ${v.length}).`;
      if (/[<>]/.test(v)) return 'The characters < and > aren’t allowed.';
      if (/[\u0000-\u001f\u007f]/.test(v)) return 'Remove line breaks and other control characters.';
      return null;
    }
    // Into the working copy when the whole navigation is valid; until then
    // the page keeps the last valid version.
    function commit() {
      const clean = clone(draft);
      clean.sections.forEach(s => s.items.forEach(it => { it.label = it.label.trim(); }));
      if (!nav.valid(clean)) return false;
      lastCommitted = JSON.stringify(clean);
      workspace.setComponent(ID, clean);
      env.onChanged();
      return true;
    }
    function newId(label) {
      const taken = new Set(items().map(x => x.it.id));
      const base = String(label || 'link').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 34) || 'link';
      let id = base, n = 2;
      while (taken.has(id)) id = `${base}-${n++}`;
      return id;
    }
    // Destinations: the site's pages, then each live game.
    const destinations = () => nav.pages.concat((env.games || []).map(g => ({ href: g.path, label: 'Game: ' + g.name })));
    const destLabel = href => (destinations().find(d => d.href === href) || { label: href }).label;

    // ── Drawing ──────────────────────────────────────────────────────────
    function iconSvg(name) { return svg(nav.iconSvg(name), 'cms-nav-icon'); }
    function drawState() {
      const s = workspace.isLoaded() ? workspace.cardStatus(ID) : 'published';
      const pub = workspace.isLoaded() ? workspace.published() : null;
      const live = pub && pub.doc && pub.doc.components && pub.doc.components[ID];
      state.textContent = s === 'unsaved' ? 'Unsaved changes: only in this browser until you save a draft.'
        : s === 'draft' ? 'Saved in draft: visitors still see the published navigation.'
        : live ? 'Published: this is what every visitor sees.' : 'Built-in links: nothing has been published yet.';
      state.dataset.status = s;
    }

    function drawList() {
      listCol.replaceChildren();
      listCol.append(el('h3', 'cms-nav-col-title', 'Links'));
      const n = total();
      draft.sections.forEach((s, si) => {
        const group = el('div', 'cms-nav-group');
        group.append(el('p', 'cms-admin-label', draft.sections.length > 1 ? `Group ${si + 1}` : 'Links'));
        const ul = el('ul', 'cms-nav-list');
        s.items.forEach(it => {
          const li = el('li', 'cms-nav-row' + (it.id === selected ? ' is-selected' : '') + (it.visible ? '' : ' is-hidden'));
          const pick = el('button', 'cms-nav-pick');
          pick.type = 'button';
          pick.dataset.item = it.id;
          pick.setAttribute('aria-pressed', String(it.id === selected));
          pick.innerHTML = iconSvg(it.icon);
          const text = el('span', 'cms-nav-pick-text');
          text.append(el('span', 'cms-nav-pick-label', it.label.trim() || '(no label)'), el('span', 'cms-nav-pick-meta', destLabel(it.href) + (it.visible ? '' : ' · hidden')));
          pick.append(text);
          pick.addEventListener('click', () => { selected = it.id; drawAll(); focusSel('[data-field="label"]'); });
          const eye = el('button', 'cms-manage-icon cms-nav-eye');
          eye.type = 'button';
          eye.dataset.eye = it.id;
          eye.setAttribute('aria-label', (it.visible ? 'Hide ' : 'Show ') + (it.label || 'link'));
          eye.setAttribute('aria-pressed', String(!it.visible));
          eye.innerHTML = svg(it.visible ? ICONS.eye : ICONS.eyeOff);
          eye.addEventListener('click', () => { it.visible = !it.visible; selected = it.id; change(`“${it.label}” is ${it.visible ? 'shown' : 'hidden'} in your draft.`); focusSel(`[data-eye="${CSS.escape(it.id)}"]`); });
          li.append(pick, eye);
          ul.append(li);
        });
        group.append(ul);
        listCol.append(group);
      });
      const tools = el('div', 'cms-nav-list-tools');
      const add = el('button', 'cms-drawer-secondary cms-nav-add');
      add.type = 'button';
      add.innerHTML = svg(ICONS.plus);
      add.append(' Add link');
      const sel = selected ? find(selected) : null;
      const targetGroup = sel ? sel.si : draft.sections.length - 1;
      add.disabled = n >= LIMITS.total || draft.sections[targetGroup].items.length >= LIMITS.perSection;
      add.addEventListener('click', () => addItem(targetGroup));
      const addGroup = el('button', 'cms-drawer-ghost cms-nav-add-group', 'Add group');
      addGroup.type = 'button';
      addGroup.disabled = n >= LIMITS.total || draft.sections.length >= LIMITS.sections;
      addGroup.addEventListener('click', () => addItem(draft.sections.length));
      tools.append(add, addGroup, el('p', 'cms-manage-count', `${n} of ${LIMITS.total} links`));
      listCol.append(tools);
    }

    function field(label, control, hint, error) {
      const wrap = el('div', 'cms-field');
      const id = uid('cms-nav-field');
      control.id = id;
      const l = el('label', 'cms-field-label', label);
      l.htmlFor = id;
      wrap.append(l, control);
      if (hint) { const h = el('p', 'cms-field-hint', hint); h.id = id + '-hint'; control.setAttribute('aria-describedby', h.id); wrap.append(h); }
      if (error) { const e = el('p', 'cms-field-error'); e.id = id + '-error'; e.setAttribute('aria-live', 'polite'); wrap.append(e); }
      return wrap;
    }

    function drawProps() {
      propsCol.replaceChildren();
      const sel = selected ? find(selected) : null;
      if (!sel) { propsCol.append(el('h3', 'cms-nav-col-title', 'Link'), el('p', 'cms-manage-empty', 'Select a link to edit it.')); return; }
      const it = sel.it;
      propsCol.append(el('h3', 'cms-nav-col-title', 'Link properties'));

      // Label
      const input = el('input', 'cms-field-input');
      input.type = 'text';
      input.value = it.label;
      input.maxLength = LIMITS.label + 8;
      input.dataset.field = 'label';
      const labelField = field('Label', input, `Up to ${LIMITS.label} characters.`, true);
      const err = labelField.querySelector('.cms-field-error');
      input.addEventListener('input', () => {
        it.label = input.value;
        const problem = labelProblem(input.value);
        err.textContent = problem || '';
        input.setAttribute('aria-invalid', String(!!problem));
        const row = listCol.querySelector(`[data-item="${CSS.escape(it.id)}"] .cms-nav-pick-label`);
        if (row) row.textContent = input.value.trim() || '(no label)';
        if (!problem) { commit(); drawPreview(); drawState(); setStatus(''); }
        else setStatus('Fix the label to update the preview; until then the last valid version is kept.');
        drawActions();
      });

      // Icon
      const icons = el('div', 'cms-nav-icons');
      icons.setAttribute('role', 'radiogroup');
      icons.setAttribute('aria-label', 'Icon');
      nav.icons.forEach(name => {
        const b = el('button', 'cms-nav-icon-choice');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(it.icon === name));
        b.setAttribute('aria-label', ICON_NAMES[name] || name);
        b.dataset.tip = ICON_NAMES[name] || name;
        b.tabIndex = it.icon === name ? 0 : -1;
        b.dataset.icon = name;
        b.innerHTML = iconSvg(name);
        b.addEventListener('click', () => { it.icon = name; change(''); focusSel(`[data-icon="${name}"]`); });
        icons.append(b);
      });
      icons.addEventListener('keydown', e => {
        const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
        if (!keys[e.key]) return;
        e.preventDefault();
        const i = (nav.icons.indexOf(it.icon) + keys[e.key] + nav.icons.length) % nav.icons.length;
        it.icon = nav.icons[i];
        change('');
        focusSel(`[data-icon="${it.icon}"]`);
      });
      const iconField = el('div', 'cms-field');
      iconField.append(el('p', 'cms-field-label', 'Icon'), icons);

      // Destination
      const select = el('select', 'cms-field-input');
      select.dataset.field = 'href';
      const known = destinations();
      if (!known.some(d => d.href === it.href)) known.push({ href: it.href, label: it.href + ' (no longer available)' });
      known.forEach(d => { const o = el('option', '', d.label); o.value = d.href; o.selected = d.href === it.href; select.append(o); });
      select.addEventListener('change', () => { it.href = select.value; change(''); focusSel('[data-field="href"]'); });
      const destField = field('Destination', select, 'The site’s own pages and live games only. A page’s own access rules always apply.');

      // Visible
      const vis = el('label', 'cms-nav-visible');
      const check = el('input');
      check.type = 'checkbox';
      check.checked = it.visible;
      check.dataset.field = 'visible';
      check.setAttribute('role', 'switch');
      vis.append(check, el('span', 'cms-nav-switch'), el('span', '', 'Visible in the sidebar'));
      check.addEventListener('change', () => { it.visible = check.checked; change(`“${it.label}” is ${it.visible ? 'shown' : 'hidden'} in your draft.`); focusSel('[data-field="visible"]'); });

      // Order and removal
      const order = el('div', 'cms-nav-order');
      const flat = items();
      const pos = flat.findIndex(x => x.it.id === it.id);
      const mk = (label, iconName, on, fn, key) => {
        const b = el('button', 'cms-drawer-secondary cms-nav-move');
        b.type = 'button'; b.dataset.move = key;
        b.innerHTML = svg(ICONS[iconName]);
        b.append(' ' + label);
        b.disabled = !on;
        b.addEventListener('click', fn);
        return b;
      };
      order.append(
        mk('Move up', 'up', pos > 0 || sel.ii > 0, () => move(it.id, -1), 'up'),
        mk('Move down', 'down', pos < flat.length - 1 || sel.ii < draft.sections[sel.si].items.length - 1, () => move(it.id, 1), 'down')
      );
      const remove = el('button', 'cms-drawer-ghost cms-nav-remove', 'Remove link');
      remove.type = 'button';
      remove.disabled = total() <= 1;
      remove.addEventListener('click', () => removeItem(it.id));

      propsCol.append(labelField, iconField, destField, vis, order, remove);
    }

    function drawPreview() {
      previewCol.replaceChildren();
      previewCol.append(el('h3', 'cms-nav-col-title', 'Preview'));
      const shown = clone(draft);
      shown.sections.forEach(s => s.items.forEach(it => { if (!it.label.trim()) it.label = '(no label)'; }));
      const aside = el('aside', 'pa-sidebar pa-sidebar--preview');
      const inner = el('nav', 'pa-sidebar-nav');
      inner.setAttribute('aria-label', 'Preview of the site sidebar');
      const sel = selected ? find(selected) : null;
      inner.innerHTML = nav.html(shown, { current: sel && sel.it.visible ? sel.it.href : null });
      inner.querySelectorAll('a').forEach(a => { a.tabIndex = -1; a.addEventListener('click', e => e.preventDefault()); });
      aside.append(inner);
      const hidden = items().filter(x => !x.it.visible).length;
      previewCol.append(aside, el('p', 'cms-field-hint', hidden ? `${hidden} hidden link${hidden === 1 ? ' isn’t' : 's aren’t'} shown. ` + 'The homepage’s sidebar behind this window shows your draft too.' : 'The homepage’s sidebar behind this window shows your draft too.'));
    }

    function drawActions() {
      actions.replaceChildren();
      const s = workspace.isLoaded() ? workspace.cardStatus(ID) : 'published';
      if (conflictInfo) {
        const keep = el('button', 'cms-drawer-primary', 'Keep my navigation and save');
        keep.type = 'button';
        keep.addEventListener('click', () => resolve(true));
        const theirs = el('button', 'cms-drawer-secondary', 'Use the newer draft');
        theirs.type = 'button';
        theirs.addEventListener('click', () => resolve(false));
        actions.append(theirs, keep);
        return;
      }
      if (undo) {
        const u = el('button', 'cms-drawer-ghost cms-manage-undo', `Undo remove “${undo.label}”`);
        u.type = 'button';
        u.addEventListener('click', restoreRemoved);
        actions.append(u);
      }
      if (s === 'unsaved') {
        const discard = el('button', 'cms-drawer-ghost', 'Discard navigation changes');
        discard.type = 'button';
        discard.addEventListener('click', () => {
          workspace.discardCard(ID);
          draft = fromWorkspace(); undo = null;
          if (!find(selected)) selected = items()[0].it.id;
          env.onChanged(); drawAll(); setStatus('Back to the saved navigation.');
        });
        actions.append(discard);
      }
      const save = el('button', 'cms-drawer-primary', saving ? 'Saving…' : 'Save Draft');
      save.type = 'button';
      save.disabled = saving || !workspace.isLoaded() || workspace.unsavedCards().length === 0 || !nav.valid(draft);
      save.addEventListener('click', saveDraft);
      const done = el('button', 'cms-drawer-secondary', 'Done');
      done.type = 'button';
      done.addEventListener('click', () => close(true));
      actions.append(done, save);
    }

    function drawAll() { drawState(); drawList(); drawProps(); drawPreview(); drawActions(); }
    function focusSel(sel) { requestAnimationFrame(() => { const n = dialog.querySelector(sel); if (n) n.focus(); }); }

    // ── Edits ────────────────────────────────────────────────────────────
    function change(message) {
      undo = message === null ? undo : null;
      if (!commit()) setStatus('Some links need attention before the preview can update.', 'error');
      else setStatus(message || '');
      drawAll();
    }
    function addItem(groupIndex) {
      if (total() >= LIMITS.total) return;
      const used = new Set(items().map(x => x.it.href));
      const free = nav.pages.find(p => !used.has(p.href)) || nav.pages[0];
      const item = { id: newId(free.label), label: free.label, icon: nav.icons.indexOf(free.href.replace(/\//g, '')) >= 0 ? free.href.replace(/\//g, '') : 'home', href: free.href, visible: true };
      if (groupIndex >= draft.sections.length) draft.sections.push({ items: [item] });
      else draft.sections[groupIndex].items.push(item);
      selected = item.id;
      change(`Added “${item.label}”. Choose its label, icon and destination.`);
      focusSel('[data-field="label"]');
    }
    // One step up or down; at a group's edge the link moves into the next group.
    function move(id, dir) {
      const sel = find(id);
      if (!sel) return;
      const group = draft.sections[sel.si].items;
      const to = sel.ii + dir;
      group.splice(sel.ii, 1);
      if (to >= 0 && to <= group.length) group.splice(to, 0, sel.it);
      else {
        const next = sel.si + dir;
        if (next < 0 || next >= draft.sections.length) { group.splice(sel.ii, 0, sel.it); return; }
        if (dir < 0) draft.sections[next].items.push(sel.it); else draft.sections[next].items.unshift(sel.it);
      }
      draft.sections = draft.sections.filter(s => s.items.length);
      change(`Moved “${sel.it.label}” ${dir < 0 ? 'up' : 'down'}.`);
      focusSel(`[data-move="${dir < 0 ? 'up' : 'down'}"]:not(:disabled), [data-move]:not(:disabled)`);
    }
    function removeItem(id) {
      const sel = find(id);
      if (!sel || total() <= 1) return;
      draft.sections[sel.si].items.splice(sel.ii, 1);
      const groupGone = !draft.sections[sel.si].items.length;
      draft.sections = draft.sections.filter(s => s.items.length);
      const next = items()[Math.min(items().length - 1, items().findIndex(x => x.si === sel.si) >= 0 ? items().findIndex(x => x.si === sel.si) : 0)];
      selected = next ? next.it.id : null;
      change(null);
      undo = { item: sel.it, section: sel.si, index: sel.ii, newGroup: groupGone, label: sel.it.label };
      setStatus(`Removed “${sel.it.label}” from your draft.`);
      drawActions();
      focusSel('.cms-manage-undo');
    }
    function restoreRemoved() {
      if (!undo) return;
      const u = undo; undo = null;
      if (u.newGroup) draft.sections.splice(Math.min(u.section, draft.sections.length), 0, { items: [u.item] });
      else draft.sections[Math.min(u.section, draft.sections.length - 1)].items.splice(u.index, 0, u.item);
      selected = u.item.id;
      change(`“${u.label}” is back.`);
      focusSel('[data-field="label"]');
    }

    // ── Saving (the whole working copy, like the card editor) ────────────
    async function saveDraft() {
      if (saving || !commit()) return;
      saving = true; drawActions(); setStatus('Saving…');
      let r;
      try { r = await workspace.save(); } catch (e) { r = { error: { message: String(e && e.message) } }; }
      saving = false;
      if (r && r.ok) { setStatus('Draft saved. Publish it from the Admin Mode panel when you’re ready; it goes live for every page.'); }
      else if (r && r.conflict) {
        if (r.conflict.error) setStatus('Another administrator saved a newer draft, and it couldn’t be loaded. Try again.', 'error');
        else { conflictInfo = r.conflict; setStatus('Another administrator saved a newer draft. Keep your changes on top of it, or use theirs?', 'error'); }
      } else {
        const e = (r && r.error) || {};
        if (e.code === 'PT403') { setStatus('Your account can no longer save drafts. Your changes are still here in this browser.', 'error'); env.onForbidden(); }
        else setStatus(`The draft wasn’t saved: ${e.message || 'unknown error'}. Your changes are still here.`, 'error');
      }
      env.onChanged();
      drawAll();
    }
    async function resolve(keepMine) {
      const info = conflictInfo; conflictInfo = null;
      if (!keepMine) { workspace.adopt(info); draft = fromWorkspace(); env.onChanged(); drawAll(); setStatus('Showing the newer draft.'); return; }
      saving = true; drawActions();
      let r;
      try { r = await workspace.combine(info); } catch (e) { r = { error: { message: String(e && e.message) } }; }
      saving = false;
      draft = fromWorkspace();
      setStatus(r && r.ok ? 'Saved on top of the newer draft.' : 'The draft wasn’t saved. Your changes are still here.', r && r.ok ? '' : 'error');
      env.onChanged(); drawAll();
    }

    // ── Open / close, keyboard ───────────────────────────────────────────
    function open(from) {
      opener = from || null;
      draft = fromWorkspace();
      lastCommitted = JSON.stringify(current() || null);
      selected = items()[0].it.id;
      undo = null; conflictInfo = null;
      overlay.hidden = false;
      document.documentElement.classList.add('cms-publish-open');
      setStatus('');
      drawAll();
      focusSel('.cms-nav-pick');
    }
    function close(returnFocus) {
      if (overlay.hidden) return;
      overlay.hidden = true;
      undo = null; conflictInfo = null;
      document.documentElement.classList.remove('cms-publish-open');
      if (returnFocus) { if (opener && opener.isConnected) opener.focus(); else env.returnFocus(); }
    }
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(true); }
      if (e.key === 'Tab') {                                     // focus stays in the dialog
        const all = [...dialog.querySelectorAll('button, input, select')].filter(b => !b.disabled && b.offsetParent !== null && b.tabIndex !== -1);
        if (!all.length) { e.preventDefault(); return; }
        const i = all.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); all[all.length - 1].focus(); }
        else if (!e.shiftKey && i === all.length - 1) { e.preventDefault(); all[0].focus(); }
      }
    });
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(true); });

    return {
      open,
      isOpen: () => !overlay.hidden,
      // The working copy changed elsewhere (a save, a restore, another editor).
      refresh() {
        if (overlay.hidden || saving) return;
        const w = JSON.stringify(current() || null);
        if (w !== lastCommitted) {
          // Changed from outside this editor: start again from the working copy.
          lastCommitted = w;
          draft = fromWorkspace();
          if (!find(selected)) selected = items()[0].it.id;
          drawAll();
        } else { drawState(); drawActions(); }
      },
      destroy() { overlay.remove(); document.documentElement.classList.remove('cms-publish-open'); }
    };
  }

  cms.siteNav = { create, ID };
})();
