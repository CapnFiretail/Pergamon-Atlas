// Layout Mode (Admin Mode, H5.3): a page's widgets selected, moved,
// resized, added and removed on the page itself. Everything about the grid is
// the shared editing code the Handbook's Layout Lab uses: proposals and
// checks (scripts/grid/editor.js), pointer and keyboard (interaction.js) and
// decorations (overlay.js), one of each per region, over the page's own
// renderers (PergamonPage.regions()). Everything about the document is the
// workspace's (scripts/cms/workspace.js): every change goes into the working
// copy as one undoable step, shared with content edits, and becomes a draft
// with Save Draft like them. Content is edited with the same drawer and
// Manage cards as in Content mode, for the selected widget.
//
// Region boundaries are fixed: a widget stays in its region, and a new one
// goes into the region chosen in the toolbar.
//
// Workspace (windows over 900px): the page is laid out at desktop size (the
// window's own width, at least that of a 1280px window) and drawn scaled to
// fit beside a column on the right, which holds the inspector and, over it,
// the card editor: nothing covers a widget and opening the editor never
// restacks the page. Only a transform and a fixed width on the page's element (variables
// set here, rules in styles/cms-admin.css): the renderers lay out as always
// and the controllers already work in screen coordinates. Long pages shrink
// to MIN_SCALE, then scroll. At 900px and narrower nothing is editable.
// The canvas's look (dots behind the page, floating controls at the bottom
// left, round actions on the selected widget) is the shared canvas design,
// styles/canvas-kit.css; what the actions do is the inspector's own commands.
//
// Which widths a layout must fit: the engine accepts a change only if it
// fits at env.width and at every wider width. Here env.width is the region's
// width in a 1280px window with the sidebar expanded (so ordinary laptops
// keep the grid), or the region's current width if that is narrower; a
// layout that already needs more keeps its own threshold. Narrower screens
// show the region stacked, in its stack order ("Order on phones").
//
// Created by admin.js (after is_admin): layoutMode.create({ workspace,
//   content, view, games, openEditor(id), openManager(widget, from),
//   undo(), redo(), done(), onChanged(), onForbidden() })
//   → { start(), stop(), refresh(), focus(instance), isOn(), dragging(), destroy() }
(function () {
  'use strict';
  const cms = window.PergamonCMS = window.PergamonCMS || {};
  const G = window.PergamonGrid;
  if (!G || !G.editor || !G.overlay || !G.interaction || !G.widgetTypes) return;
  const kit = window.PergamonDesign && window.PergamonDesign.canvasKit;
  if (!kit) return;
  const E = G.editor, TYPES = G.widgetTypes.types;

  // The content width of a 1280px window: less its scrollbar and the page's
  // insets; beside the expanded sidebar, less that and the gutter.
  const FULL = 1280 - 15 - 48, BESIDE = FULL - 220 - G.GUTTER;
  const INSET = 24;                   // around the canvas (--page-inset-widgets)
  const FLOAT = 48;                   // the floating controls' room below the page
  const MIN_PAGE = 1280 - 2 * INSET;  // the narrowest page drawn on the canvas
  const MIN_SCALE = 0.6;              // a tall page scrolls rather than shrink further

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  let uidCount = 0;
  const uid = p => `${p}-${++uidCount}`;

  function create(env) {
    const { workspace, content, view } = env;
    const WIDGETS = content.widgets;
    const bound = new Map();          // region id → { region, grid, overlay, ctl }
    let on = false;
    let selected = null;              // { region, id }
    let showCells = true;
    let saving = false;
    let conflict = null;              // a save conflict waiting for a choice

    // ── Toolbar ──────────────────────────────────────────────────────────
    const bar = el('section', 'cms-layout-bar');
    bar.setAttribute('aria-label', 'Layout Mode');
    bar.hidden = true;
    function button(text, onClick, cls) {
      const b = el('button', cls || 'cms-layout-tool ck-button', text);
      b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    }
    function iconButton(text, icon, onClick, title) {
      const b = kit.button({ label: text, icon, iconOnly: true, title });
      b.addEventListener('click', onClick);
      return b;
    }
    function select(label, className) {
      const s = el('select', 'cms-layout-select ' + className);
      s.id = uid('cms-layout-select');
      const l = el('label', 'cms-layout-label', label);
      l.htmlFor = s.id;
      return [l, s];
    }
    const section = (title, key, ...nodes) => {
      const s = el('div', 'cms-layout-section'), h = el('h2', 'cms-admin-label', title);
      s.dataset.section = key;
      s.append(h, ...nodes);
      return s;
    };
    const name = el('strong', 'cms-layout-name');
    const details = el('span', 'cms-layout-details');
    const info = el('p', 'cms-layout-info');
    info.append(name, details);
    const editButton = button('Edit card', () => { if (selected) env.openEditor(content.instanceKey(selected.id)); });
    const manageButton = button('Manage cards', () => { if (selected) env.openManager(content.instanceKey(selected.id), manageButton); });
    const earlier = button('Earlier on phones', () => restack(-1));
    const later = button('Later on phones', () => restack(1));
    const removeButton = button('Remove widget', remove, 'cms-layout-tool cms-layout-remove ck-button ck-button--danger');
    const [typeLabel, typeSelect] = select('Type', 'cms-layout-type');
    content.WIDGET_TYPES.forEach(t => { const o = el('option', '', content.WIDGET_NAMES[t]); o.value = t; typeSelect.append(o); });
    const [regionLabel, regionSelect] = select('Area', 'cms-layout-region');
    const addButton = button('Add widget', add);
    const undoButton = iconButton('Undo', 'undo', () => env.undo());
    const redoButton = iconButton('Redo', 'redo', () => env.redo());
    const cellsButton = iconButton('Grid', 'grid', () => { showCells = !showCells; bound.forEach(b => b.grid.setDebug(showCells)); update(); }, 'Show the grid cells');
    cellsButton.setAttribute('aria-label', 'Show the grid cells');
    const discardButton = button('Discard layout changes', () => {
      if (!workspace.discardLayout()) return;
      env.onChanged();
      say('The layout is back as last saved. Undo brings your changes back.');
      undoButton.focus();
    });
    const saveButton = button('Save Draft', save, 'cms-drawer-primary');
    const doneButton = button('Done', () => env.done(), 'cms-drawer-secondary');
    const keepButton = button('Keep my changes and save', () => resolve(true), 'cms-drawer-primary');
    const theirsButton = button('Use the newer draft', () => resolve(false), 'cms-drawer-secondary');
    const addGroup = el('div', 'cms-layout-group');
    addGroup.append(typeLabel, typeSelect, regionLabel, regionSelect, addButton);
    const widgetGroup = el('div', 'cms-layout-group');
    widgetGroup.append(editButton, manageButton, earlier, later, removeButton);
    const historyGroup = el('div', 'cms-layout-float ck-float');
    const zoom = el('span', 'cms-layout-zoom ck-readout pa-type-button-small');
    historyGroup.append(undoButton, redoButton, cellsButton, zoom);
    const saveGroup = el('div', 'cms-layout-group cms-layout-save');
    saveGroup.append(discardButton, theirsButton, keepButton, saveButton, doneButton);
    const notice = el('p', 'cms-layout-notice');
    const status = el('p', 'cms-layout-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    bar.append(
      section('Selected widget', 'widget', info, widgetGroup),
      section('Add a widget', 'add', addGroup),
      section('Canvas', 'canvas', historyGroup),
      section('Draft', 'draft', saveGroup),
      notice, status
    );
    document.body.append(bar);
    function say(text, kind) { status.textContent = text || ''; status.dataset.kind = kind || ''; }

    // ── Names ────────────────────────────────────────────────────────────
    const label = w => content.instanceLabel(w.id, w.type);
    const short = r => content.regionLabel(r).split(',')[0];
    const widgetOf = s => { const r = s && workspace.region(s.region); return (r && r.widgets.find(w => w.id === s.id)) || null; };

    // On the selected widget: the inspector's commands, at hand.
    const hasCard = w => WIDGETS.hasCard(w.type), hasCards = w => WIDGETS.hasContent(w.type);
    const actions = [
      { kind: 'edit', label: w => (hasCard(w) ? 'Edit card' : 'Manage cards'), shown: hasCards, run: w => (hasCard(w) ? editButton : manageButton).click() },
      { kind: 'remove', label: () => 'Remove widget', shown: () => true, run: () => removeButton.click() }
    ];

    // ── The grids ────────────────────────────────────────────────────────
    function envFor(id) {
      const b = bound.get(id), layout = workspace.region(id);
      const live = b.grid.geometry().width, need = G.minFitWidth(layout, TYPES);
      const floor = Math.min(live, layout.frame === 'sidebar' ? BESIDE : FULL);
      return { types: TYPES, width: Math.max(floor, Number.isFinite(need) ? need : 0) };
    }
    const editable = id => { const b = bound.get(id); return on && wide() && !!b && b.grid.state() === 'grid'; };

    // ── The workspace ────────────────────────────────────────────────────
    const page = view.root, html = document.documentElement, stage = page.closest('.pa-main');
    const wide = () => window.innerWidth > 900;
    const dragging = () => [...bound.values()].some(b => !!b.ctl.active());
    let scale = 1;
    function fit() {
      if (!on || !wide()) { unfit(); return; }
      const header = document.querySelector('.pa-header');
      const top = header ? header.offsetHeight : 0;
      const room = html.clientWidth;
      const width = Math.max(MIN_PAGE, room - 2 * INSET);
      html.style.setProperty('--cms-layout-top', top + 'px');
      page.style.setProperty('--cms-canvas-width', width + 'px');
      const height = page.offsetHeight;
      const across = room - bar.offsetWidth - 2 * INSET;
      // Never rescaled under the pointer: the drop does that.
      if (!dragging()) scale = Math.min(1, across / width, Math.max(MIN_SCALE, (window.innerHeight - top - 2 * INSET - FLOAT) / height));
      page.style.setProperty('--atlas-scale', scale);
      const left = Math.max(0, (across - width * scale) / 2), dot = 24 * scale;
      page.style.setProperty('--cms-canvas-left', left + 'px');
      page.style.setProperty('--cms-canvas-below', (scale - 1) * height + 'px');
      zoom.textContent = `${Math.round(scale * 100)}%`;
      // The dots scale with the page, with one on its corner.
      stage.classList.add('ck-scope', 'ck-surface');
      stage.style.setProperty('--ck-dot', dot + 'px');
      stage.style.setProperty('--ck-dx', INSET + left - dot / 2 + 'px');
      stage.style.setProperty('--ck-dy', INSET - dot / 2 + 'px');
    }
    function unfit() {
      scale = 1;
      html.style.removeProperty('--cms-layout-top');
      ['--cms-canvas-width', '--atlas-scale', '--cms-canvas-left', '--cms-canvas-below'].forEach(p => page.style.removeProperty(p));
      stage.classList.remove('ck-scope', 'ck-surface');
      ['--ck-dot', '--ck-dx', '--ck-dy'].forEach(p => stage.style.removeProperty(p));
      zoom.textContent = '';
    }
    function bind() {
      const now = view.regions();
      for (const [id, b] of bound) if (!now.some(r => r.id === id && r.grid === b.grid)) unbind(id);
      now.forEach(region => {
        if (bound.has(region.id)) return;
        const id = region.id, grid = region.grid;
        const overlay = G.overlay(grid.element(), { label, actions });
        const b = { region, grid, overlay, ctl: null };
        bound.set(id, b);
        b.ctl = G.interaction({
          grid, overlay,
          env: () => envFor(id),
          layout: () => workspace.region(id) || { id, widgets: [] },
          commit: layout => { if (workspace.setRegion(layout)) env.onChanged(); else refresh(); },
          enabled: () => editable(id),
          scrollInsets: () => {
            const h = document.querySelector('.pa-header');
            return { top: h ? Math.max(0, h.getBoundingClientRect().bottom) : 0, bottom: 0 };
          },
          onChange: e => changed(id, e)
        });
        grid.setDebug(showCells);
        sizes.observe(region.host);
      });
    }
    function unbind(id) {
      const b = bound.get(id);
      if (!b) return;
      bound.delete(id);
      b.ctl.destroy();
      b.overlay.destroy();
      b.grid.setDebug(false);
      b.grid.setExtent(null);
      b.region.host.removeAttribute('data-cms-empty');
      sizes.unobserve(b.region.host);
      if (selected && selected.region === id) selected = null;
    }

    // ── What the controllers report ──────────────────────────────────────
    function changed(region, e) {
      if (e.type === 'select') {
        if (e.id) {
          selected = { region, id: e.id };
          bound.forEach((b, id) => { if (id !== region) b.ctl.select(null); });
          regionSelect.value = region;
        } else if (selected && selected.region === region) selected = null;
        update();
        return;
      }
      const layout = workspace.region(region);
      const w = layout && layout.widgets.find(x => x.id === e.id);
      if (e.type === 'preview') { update(e.proposal.widget); return; }
      if (w && e.type === 'commit') say(`${e.kind === 'resize' ? 'Resized' : 'Moved'} ${label(w)}: column ${w.col}, row ${w.row}, ${w.cols} × ${w.rows}.`);
      else if (w && e.type === 'reject') say(refusal(layout, w, e), 'error');
      else if (e.type === 'cancel' && e.reason === 'cancelled') say('Cancelled. Nothing changed.');
      fit();
      update();
    }
    function refusal(layout, w, e) {
      if (e.reason === 'unchanged') return `${label(w)} can’t go further that way.`;
      const err = (e.errors || [])[0];
      const other = err && err.code === 'overlap' ? layout.widgets.find(x => err.widgets.indexOf(x.id) >= 0 && x.id !== w.id) : null;
      if (other) return `Not allowed: ${label(w)} would overlap ${label(other)}. Nothing changed.`;
      if (err && /min|fit/.test(err.code)) return `Not allowed: ${label(w)} would be too small for its content on a 1280px screen. Nothing changed.`;
      return 'Not allowed there. Nothing changed.';
    }

    // ── Widgets ──────────────────────────────────────────────────────────
    function add() {
      const type = typeSelect.value, region = workspace.region(regionSelect.value);
      if (!region || !editable(region.id)) return;
      const id = content.newInstanceId(type, ...workspace.docs());
      const p = E.proposeAdd(region, { id, type }, envFor(region.id));
      if (!p || !p.valid || !workspace.addInstance(p.layout, id, content.starterContent(type, env.games[0]))) {
        say(`There is no room for another ${content.WIDGET_NAMES[type]} here. Nothing changed.`, 'error');
        return;
      }
      env.onChanged();
      pick(region.id, id);
      say(`Added ${label({ id, type })} to the ${short(region).toLowerCase()}, column ${p.widget.col}, row ${p.widget.row}. ${WIDGETS.isList(type) ? WIDGETS.get(type).hint : !WIDGETS.hasCard(type) ? '' : 'Use Edit card to set what it shows.'}`);
    }
    // Removing is one undoable step, so it needs no confirmation.
    function remove() {
      const w = widgetOf(selected);
      if (!w) return;
      const region = workspace.region(selected.region);
      const p = E.proposeRemove(region, w.id, envFor(region.id));
      if (!workspace.removeInstance(p.layout, w.id)) { say(`${label(w)} couldn’t be removed.`, 'error'); return; }
      env.onChanged();
      say(`Removed ${label(w)}${hasCards(w) ? ' and its cards' : ''} from your draft. Undo brings it back.`);
      undoButton.focus();
    }
    // Earlier or later in the region's order on narrow screens.
    function restack(step) {
      const w = widgetOf(selected);
      if (!w) return;
      const region = workspace.region(selected.region);
      const p = E.proposeStack(region, w.id, step, envFor(region.id));
      if (!p.changed || !workspace.setRegion(p.layout)) return;
      env.onChanged();
      say(`${label(w)} is now ${G.stackOrder(p.layout).indexOf(w.id) + 1} of ${region.widgets.length} in the ${short(region).toLowerCase()} on phones.`);
    }
    function pick(region, id) {
      const b = bound.get(region);
      if (!b) return;
      b.ctl.select(id);
      const hit = b.overlay.hit(id);
      if (hit) { hit.focus({ preventScroll: true }); hit.scrollIntoView({ block: 'nearest' }); }
    }

    // ── Saving (the whole working copy, like the card editor) ────────────
    async function save() {
      if (saving) return;
      saving = true; update(); say('Saving draft…');
      let r;
      try { r = await workspace.save(); } catch (e) { r = { error: { code: 'network' } }; }
      saving = false;
      outcome(r, 'Draft saved. Publish it with Publish Changes in the Admin Mode panel.');
    }
    function outcome(r, done) {
      conflict = null;
      if (r.ok) say(done, 'success');
      else if (r.conflict && !r.conflict.error) {
        conflict = r.conflict;
        const both = conflict.overlap.length ? ' You both changed some of the same things; keeping yours replaces their version of those.' : '';
        say(`Not saved: another administrator saved a newer draft.${both} Keep your changes on top of it, or use theirs?`, 'error');
      } else {
        const e = r.error || (r.conflict && r.conflict.error) || {};
        say(e.code === 'PT403' ? 'Your account can no longer save drafts. Your changes are still here in this browser.'
          : e.code === 'PT422' ? `The server didn’t accept this: ${e.message}`
          : e.code === 'invalid' || e.code === 'layout' ? e.message
          : 'Couldn’t reach the server. Your changes are still here; try again.', 'error');
        if (e.code === 'PT403') env.onForbidden();
      }
      env.onChanged();
      update();
      if (conflict) keepButton.focus();
    }
    async function resolve(mine) {
      const c = conflict;
      conflict = null;
      if (!c) return;
      if (!mine) { workspace.adopt(c); env.onChanged(); say('Showing the newer draft. Your changes were discarded.'); update(); return; }
      saving = true; update(); say('Saving…');
      let r;
      try { r = await workspace.combine(c); } catch (e) { r = { error: { code: 'network' } }; }
      saving = false;
      outcome(r, 'Saved on top of the newer draft.');
    }

    // ── State on screen ──────────────────────────────────────────────────
    function update(preview) {
      if (!on) return;
      const regions = workspace.regions();
      // Regions to add to (kept when unchanged, so an open menu stays open).
      if ([...regionSelect.options].map(o => o.value).join() !== regions.map(r => r.id).join()) {
        regionSelect.replaceChildren(...regions.map(r => { const o = el('option', '', content.regionLabel(r)); o.value = r.id; return o; }));
      }
      const s = selected && bound.get(selected.region);
      const w = widgetOf(selected);
      const shown = preview || w;
      const ready = !!w && editable(selected.region);
      name.textContent = w ? label(w) : 'Nothing selected';
      if (shown && s) {
        const g = s.grid.geometry(), r = G.rect(shown, g.cell, g.gutter, g.row);
        details.textContent = `column ${shown.col}, row ${shown.row} · ${shown.cols} × ${shown.rows} cells` + (s.grid.state() === 'grid' ? ` · ${Math.round(r.width)} × ${Math.round(r.height)}px` : '');
      } else details.textContent = 'Click a widget, or Tab to it. Arrows move it, Shift + arrows resize it.';
      const region = w && regions.find(r => r.id === selected.region);
      const order = region ? G.stackOrder(region) : [];
      editButton.disabled = !w || !hasCard(w);
      manageButton.disabled = !w || !hasCards(w);
      earlier.disabled = !ready || order.indexOf(w.id) === 0;
      later.disabled = !ready || order.indexOf(w.id) === order.length - 1;
      removeButton.disabled = !ready;
      const count = content.instancesOf(workspace.working()).length, full = count >= content.PAGE_LIMITS.widgets;
      addButton.disabled = full || !editable(regionSelect.value);
      addButton.title = full ? `A page has at most ${content.PAGE_LIMITS.widgets} widgets.` : '';
      undoButton.disabled = !workspace.canUndo();
      redoButton.disabled = !workspace.canRedo();
      cellsButton.setAttribute('aria-pressed', String(showCells));
      const unsaved = workspace.unsavedCards();
      discardButton.hidden = !!conflict || unsaved.indexOf(content.LAYOUT) < 0;
      saveButton.disabled = saving || !unsaved.length;
      saveButton.textContent = saving ? 'Saving…' : 'Save Draft';
      saveButton.hidden = doneButton.hidden = !!conflict;
      keepButton.hidden = theirsButton.hidden = !conflict;
      const paused = regions.filter(r => bound.has(r.id) && !editable(r.id));
      // Nothing on the page can be arranged: only say so, and leave the rest.
      bar.toggleAttribute('data-paused', paused.length === regions.length);
      notice.hidden = !paused.length;
      notice.textContent = !paused.length ? '' : !wide() ? 'The page can be arranged in windows wider than 900px. This one shows it as narrow screens do.'
        : paused.map(r => `The ${short(r).toLowerCase()} is stacked: its grid needs ${Math.ceil(G.minFitWidth(r, TYPES))}px, and has ${Math.round(bound.get(r.id).grid.geometry().width)}px here.`).join(' ') + ' Collapse the sidebar or widen the window to arrange it.';
      bound.forEach((b, id) => {
        const r = regions.find(x => x.id === id);
        b.region.host.toggleAttribute('data-cms-empty', !!r && !r.widgets.length);
      });
    }
    // After the page was drawn again (any change, anywhere).
    function refresh() {
      if (!on) return;
      if (conflict && !workspace.unsavedCards().length) conflict = null;
      bind();
      bound.forEach(b => b.ctl.refresh());
      fit();
      update();
    }

    // The numbers follow the window (the drawer, the sidebar, a resize).
    let frame = 0;
    const resized = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (on) { fit(); update(); } }); };
    const sizes = new ResizeObserver(resized);

    function start() {
      if (on) { refresh(); return; }
      on = true;
      bar.hidden = false;
      say('');
      sizes.observe(page);
      window.addEventListener('resize', resized);
      view.onRegionState = region => {
        const b = bound.get(region.id);
        if (b && b.grid.state() !== 'grid') b.ctl.cancel();
        update();
      };
      refresh();
    }
    function stop() {
      if (!on) return;
      on = false;
      view.onRegionState = null;
      [...bound.keys()].forEach(unbind);
      sizes.unobserve(page);
      window.removeEventListener('resize', resized);
      unfit();
      selected = null; conflict = null;
      bar.hidden = true;
    }

    return {
      start, stop, refresh,
      isOn: () => on,
      dragging,
      selected: () => (selected ? selected.id : null),
      // Back to a widget after its card editor closes.
      focus(id) { const i = content.instancesOf(workspace.working()).find(x => x.id === id); if (on && i) pick(i.region, id); },
      destroy() { stop(); sizes.disconnect(); bar.remove(); }
    };
  }

  cms.layoutMode = { create, FULL, BESIDE };
})();
