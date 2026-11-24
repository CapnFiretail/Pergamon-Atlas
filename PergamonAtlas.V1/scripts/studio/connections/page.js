// Atlas Studio › Workspace › Connections: the page. Wiring only: the canvas
// (scripts/canvas/), the document and its state (document.js, store.js), where
// it is kept (storage.js), the panel and the Node Library.
//
// View looks around and reads; Edit changes the working copy. Nothing is stored
// until Save. Leaving with unsaved changes asks first (a section change, leaving
// the page), and a reload or losing access keeps them for this tab (store.keep).
(function () {
  'use strict';
  const ns = window.PergamonStudio;
  const { el, button, segmented, dialog } = ns.ui;
  const C = ns.connections, D = C.document, CV = window.PergamonCanvas;
  const PATH = 'workspace/connections';
  const MAX_IMPORT = 2 * 1024 * 1024;
  const NARROW = '(max-width: 900px)';

  function render(view, ctx) {
    let mode = 'view', selection = null, panelOpen = false, sayTimer = 0, busy = false, alive = true;

    const head = ctx.header('Connections', 'How the parts of Atlas and its services relate. Descriptive only: nothing is linked to a live service.');
    const frame = el('section', 'stc-frame ck-frame');
    frame.setAttribute('aria-label', 'Connections map');
    const bar = el('div', 'stc-bar ck-bar');
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Connections');
    const stage = el('div', 'stc-stage ck-stage');
    const host = el('div', 'stc-canvas');
    frame.append(bar, stage);
    view.append(head, frame);

    // ── Toolbar ───────────────────────────────────────────────────────────
    const modes = segmented('Mode', [{ value: 'view', label: 'View' }, { value: 'edit', label: 'Edit' }], v => setMode(v));
    const add = button({ label: 'Add Node', icon: 'add', kind: 'primary' });
    const undo = button({ label: 'Undo', icon: 'undo' }), redo = button({ label: 'Redo', icon: 'redo' });
    const status = el('p', 'stc-state ck-state pa-type-caption');
    const importButton = button({ label: 'Import', icon: 'import', title: 'Import a JSON file' });
    const exportButton = button({ label: 'Export', icon: 'export', title: 'Export as a JSON file' });
    const discard = button({ label: 'Discard', kind: 'secondary' });
    const save = button({ label: 'Save', kind: 'primary' });
    const file = el('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.hidden = true;
    const editTools = el('div', 'ck-group'), saveTools = el('div', 'ck-group'), files = el('div', 'ck-group');
    editTools.append(add, undo, redo);
    files.append(importButton, exportButton);
    saveTools.append(discard, save);
    bar.append(modes.element, editTools, el('span', 'ck-spacer'), status, files, saveTools, file);

    // ── Canvas, view controls, panel ──────────────────────────────────────
    const zoomOut = button({ label: 'Zoom out', icon: 'minus', iconOnly: true }), zoomIn = button({ label: 'Zoom in', icon: 'add', iconOnly: true });
    const zoomLevel = el('button', 'ck-button ck-button--tool ck-readout pa-type-button-small');
    zoomLevel.type = 'button';
    const fit = button({ label: 'Fit to view', icon: 'fit', iconOnly: true });
    const zoomBar = el('div', 'stc-zoom ck-float');
    zoomBar.setAttribute('role', 'group');
    zoomBar.setAttribute('aria-label', 'View');
    zoomBar.append(zoomOut, zoomLevel, zoomIn, fit);
    const toast = el('p', 'stc-say pa-type-caption');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    const notice = el('div', 'stc-notice');
    notice.hidden = true;
    const emptyNote = el('p', 'stc-empty pa-type-body-small');
    emptyNote.hidden = true;

    const store = C.store.create({ storage: C.storage.local(), createHistory: window.PergamonGrid.editor.createHistory, seed: C.seed });
    const doc = () => store.document();
    const nodeOf = id => doc().nodes.find(n => n.id === id);
    const edgeOf = id => doc().connections.find(c => c.id === id);
    const nameOf = id => { const n = nodeOf(id); return n ? n.name : ''; };
    const editing = () => mode === 'edit' && !store.blocked();

    const panel = C.inspector({
      document: doc,
      update: (s, patch, key) => store.edit(`${s.kind}:${s.id}:${key}`, s.kind === 'node' ? D.updateNode(doc(), s.id, patch) : D.updateConnection(doc(), s.id, patch)),
      reconnect: (id, end, to) => { store.commit(D.reconnect(doc(), id, end, to)); },
      select: s => { select(s); reveal(s); },
      remove: s => remove(s),
      settle: () => store.settle(),
      close: () => { const s = selection; panelOpen = false; if (!editing()) selection = null; refresh(); cv.focus(s); }
    });
    stage.append(host, zoomBar, toast, emptyNote, notice, panel.element);

    const edgeLabel = e => {
      const arrow = { forward: 'to', backward: 'from', both: 'to and from', none: 'and' }[e.direction];
      return `${e.name ? e.name + ': ' : 'Connection: '}${nameOf(e.source.node)} ${arrow} ${nameOf(e.target.node)}`;
    };
    const cv = CV.renderer(host, {
      label: 'Map of nodes and connections',
      nodeLabel: n => (n.name === n.kind ? n.name : `${n.name}, ${n.kind}`),
      edgeLabel
    });
    const ctl = CV.interaction({
      canvas: cv, editing,
      selection: () => selection,
      select,
      insets: () => insets(),
      move(id, p) { if (store.commit(D.moveNode(doc(), id, p))) say(`Moved ${nameOf(id)}.`); },
      check: (from, to, id) => D.checkConnection(doc(), from, to, id),
      connect(from, to) {
        const r = D.connect(doc(), from, to);
        if (!r.id) return;
        store.commit(r.doc);
        select({ kind: 'edge', id: r.id });
        reveal(selection);
        say(`Connected ${nameOf(from.node)} to ${nameOf(to.node)}. Use the pencil to name it.`);
      },
      reconnect(id, end, to) { if (store.commit(D.reconnect(doc(), id, end, to))) { reveal({ kind: 'edge', id }); say(`Reconnected to ${nameOf(to.node)}.`); } },
      edit(s) { select(s); panelOpen = true; refresh(); reveal(s); panel.focus(); },
      reveal: s => reveal(s),
      remove,
      say
    });

    // ── Drawing ───────────────────────────────────────────────────────────
    const cardOf = n => { const d = C.registry.get(n.type); return { id: n.id, x: n.x, y: n.y, name: n.name, kind: d.name, logo: d.logo }; };
    function refresh() {
      if (!alive) return;
      const d = doc();
      if (selection && !(selection.kind === 'node' ? nodeOf(selection.id) : edgeOf(selection.id))) { selection = null; panelOpen = false; }
      cv.render({ nodes: d.nodes.map(cardOf), edges: d.connections }, { selection, editing: editing() });
      if (selection && (panelOpen || !editing())) panel.show(selection, editing()); else panel.hide();
      frame.classList.toggle('has-panel', panel.isOpen());
      const on = editing(), dirty = store.dirty();
      frame.dataset.mode = on ? 'edit' : 'view';
      modes.set(mode);
      editTools.hidden = saveTools.hidden = importButton.hidden = !on;
      undo.disabled = !store.canUndo();
      redo.disabled = !store.canRedo();
      save.disabled = busy || (!dirty && !store.isExample());
      discard.disabled = busy || !dirty;
      exportButton.disabled = !!store.blocked();
      status.dataset.state = dirty ? 'unsaved' : store.isExample() ? 'example' : 'saved';
      const t = store.savedAt() ? new Date(store.savedAt()) : null;
      const when = t && !isNaN(t) ? t.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
      status.textContent = store.blocked() ? '' : dirty ? 'Unsaved changes' : store.isExample() ? 'Example, not saved yet' : `Saved in this browser${when ? ', ' + when : ''}`;
      emptyNote.hidden = !!store.blocked() || d.nodes.length > 0;
      emptyNote.textContent = on ? 'Nothing here yet. Add Node starts the map.' : 'Nothing here yet. Choose Edit to start the map.';
      drawNotice();
    }
    function drawNotice() {
      const b = store.blocked();
      notice.hidden = !b;
      if (!b || notice.childElementCount) { if (!b) notice.replaceChildren(); return; }
      const copy = button({ label: 'Download the stored copy', kind: 'secondary' }), again = button({ label: 'Start again from the example', kind: 'primary' });
      copy.hidden = !b.raw;
      copy.addEventListener('click', () => download(b.raw, 'atlas-connections-stored.json'));
      again.addEventListener('click', () => { store.reset(); refresh(); fitView(); });
      const row = el('div', 'ck-group');
      row.append(copy, again);
      notice.append(el('h2', 'pa-type-section-title', 'The saved map can’t be opened'), el('p', 'pa-type-body-small', b.errors.join(' ')),
        el('p', 'pa-type-body-small', 'It is left as it is. Starting again replaces it only when you save.'), row);
    }
    function say(text) {
      clearTimeout(sayTimer);
      toast.textContent = text;
      sayTimer = setTimeout(() => { toast.textContent = ''; }, 5000);
    }
    // What the panel covers of the canvas.
    function insets() {
      if (!panel.isOpen()) return {};
      const r = panel.element.getBoundingClientRect();
      return window.matchMedia(NARROW).matches ? { bottom: r.height } : { right: r.width };
    }
    const fitView = () => cv.fit({ insets: insets() });
    const reveal = s => cv.reveal(s, insets());

    // ── Selecting, modes ──────────────────────────────────────────────────
    function select(s) {
      const same = s === selection || (s && selection && s.kind === selection.kind && s.id === selection.id);
      if (same) return;
      if (panel.isOpen() && panel.invalid()) say('The last value couldn’t be used, so it was left out.');
      store.settle();
      selection = s;
      if (!s) panelOpen = false;
      refresh();
    }
    // A field holding a value that can't be used: show it instead of going on.
    function fixFirst() {
      const bad = panel.isOpen() && panel.invalid();
      if (!bad) return false;
      bad.focus();
      say('Correct the marked field first.');
      return true;
    }
    async function setMode(next) {
      if (next === mode || busy) return;
      ctl.cancel();
      if (next === 'view' && (store.dirty() || panel.invalid())) {
        if (!await askUnsaved('Leave Edit?')) { refresh(); return; }
        if (!alive) return;
      }
      mode = next;
      panelOpen = false;
      if (next === 'view') selection = null;
      refresh();
      say(next === 'edit' ? 'Editing. Select a node or connection to change it.' : 'Viewing.');
    }
    // Save, discard or stay. → true when nothing unsaved is left.
    async function askUnsaved(title) {
      const choice = await dialog(frame, {
        title, text: 'The map has unsaved changes.',
        actions: [{ label: 'Keep editing', value: null }, { label: 'Discard changes', value: 'discard', kind: 'danger' }, { label: 'Save', value: 'save', kind: 'primary' }]
      });
      if (!alive || !choice) return false;
      if (choice === 'save') return saveNow();
      store.discard();
      return true;
    }

    // ── Saving ────────────────────────────────────────────────────────────
    async function saveNow() {
      if (busy || fixFirst()) return false;
      busy = true; refresh();
      let r = await store.save();
      if (r.code === 'conflict' && alive) {
        const choice = await dialog(frame, {
          title: 'A newer copy was saved', text: 'Another tab saved this map after you opened it. Replace that copy with yours, or use it and drop your changes?',
          actions: [{ label: 'Cancel', value: null }, { label: 'Use the newer copy', value: 'theirs' }, { label: 'Replace it with mine', value: 'mine', kind: 'danger' }]
        });
        if (choice === 'mine') r = await store.save({ force: true });
        else if (choice === 'theirs') { await store.reload(); r = { ok: true, theirs: true }; }
      }
      busy = false;
      if (!alive) return false;
      refresh();
      say(r.ok ? (r.theirs ? 'Showing the newer copy.' : 'Saved in this browser.')
        : r.code === 'conflict' ? 'Not saved. Your changes are still here.'
        : r.code === 'full' ? 'Not saved: this browser’s storage is full. Export the map to keep it.'
        : 'Not saved: this browser doesn’t allow it. Export the map to keep it.');
      return !!r.ok;
    }
    save.addEventListener('click', saveNow);
    discard.addEventListener('click', async () => {
      const yes = await dialog(frame, { title: 'Discard changes?', text: store.isExample() ? 'The map goes back to the example. Undo brings your changes back while this page is open.' : 'The map goes back to the saved copy. Undo brings your changes back while this page is open.', actions: [{ label: 'Cancel', value: null }, { label: 'Discard changes', value: true, kind: 'danger' }] });
      if (!yes || !alive) return;
      panelOpen = false;
      panel.hide();
      store.discard();
      say('Changes discarded.');
    });

    // ── Changing the map ──────────────────────────────────────────────────
    async function addNode() {
      ctl.cancel();
      const type = await C.library(frame);
      if (!type || !alive) return;
      const s = cv.size(), i = insets(), G = CV.geometry;
      const mid = G.toWorld(cv.view(), { x: (s.w - (i.right || 0)) / 2, y: (s.h - (i.bottom || 0)) / 2 });
      const r = D.addNode(doc(), type, D.freeSpot(doc(), { x: mid.x - G.NODE.w / 2, y: mid.y - G.NODE.h / 2 }));
      if (!r.id) { say(`A map can have up to ${D.LIMITS.nodes} nodes.`); return; }
      store.commit(r.doc);
      select({ kind: 'node', id: r.id });
      reveal(selection);
      cv.focus(selection);
      say(`Added ${nameOf(r.id)}.`);
    }
    async function remove(s) {
      if (s.kind === 'edge') {
        const c = edgeOf(s.id);
        if (!c) return;
        const label = edgeLabel(c);
        store.commit(D.removeConnection(doc(), s.id));
        cv.focus(null);
        say(`Deleted ${label}. Undo brings it back.`);
        return;
      }
      const n = nodeOf(s.id);
      if (!n) return;
      ctl.cancel();
      const cs = D.connectionsOf(doc(), n.id);
      const list = el('ul', 'stc-removing pa-type-body-small');
      cs.forEach(c => list.append(el('li', '', edgeLabel(c))));
      const yes = await dialog(frame, {
        title: `Delete ${n.name}?`,
        text: cs.length ? `Its ${cs.length === 1 ? 'connection is' : `${cs.length} connections are`} deleted with it:` : 'It has no connections.',
        content: cs.length ? list : null,
        actions: [{ label: 'Cancel', value: null }, { label: cs.length ? 'Delete node and connections' : 'Delete node', value: true, kind: 'danger' }]
      });
      if (!alive) return;
      if (!yes) { cv.focus(selection); return; }
      store.commit(D.removeNode(doc(), n.id));
      cv.focus(null);
      say(`Deleted ${n.name}${cs.length ? ` and ${cs.length} ${cs.length === 1 ? 'connection' : 'connections'}` : ''}. Undo brings ${cs.length ? 'them' : 'it'} back.`);
    }
    const step = fn => { ctl.cancel(); if (fn()) say(fn === store.undo ? 'Undone.' : 'Redone.'); };
    add.addEventListener('click', addNode);
    undo.addEventListener('click', () => step(store.undo));
    redo.addEventListener('click', () => step(store.redo));

    // ── Files ─────────────────────────────────────────────────────────────
    function download(text, name) {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = el('a');
      a.href = url; a.download = name;
      frame.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    exportButton.addEventListener('click', () => {
      const d = new Date(), day = [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, '0')).join('-');
      download(D.serialize(doc()), `atlas-connections-${day}.json`);
      say(store.dirty() ? 'Exported, with the unsaved changes.' : 'Exported.');
    });
    importButton.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      let r;
      try { r = f.size > MAX_IMPORT ? { errors: ['The file is larger than 2 MB.'] } : D.parse(await f.text()); } catch (e) { r = { errors: ['The file couldn’t be read.'] }; }
      if (!alive) return;
      if (r.errors) {
        const list = el('ul', 'stc-removing pa-type-body-small');
        r.errors.forEach(t => list.append(el('li', '', t)));
        await dialog(frame, { title: 'Not imported', text: 'Nothing changed.', content: list, actions: [{ label: 'Close', value: null, kind: 'primary' }] });
        return;
      }
      const n = r.document;
      const yes = await dialog(frame, {
        title: 'Replace the map?', text: `“${f.name}” has ${n.nodes.length} ${n.nodes.length === 1 ? 'node' : 'nodes'} and ${n.connections.length} ${n.connections.length === 1 ? 'connection' : 'connections'}. It replaces what is on the canvas; nothing is saved until you choose Save, and Undo goes back.`,
        actions: [{ label: 'Cancel', value: null }, { label: 'Replace', value: true, kind: 'primary' }]
      });
      if (!yes || !alive) return;
      select(null);
      store.commit(n);
      fitView();
      say('Imported. Save to keep it.');
    });

    // ── View controls, keyboard ───────────────────────────────────────────
    zoomIn.addEventListener('click', () => cv.zoom(1.25));
    zoomOut.addEventListener('click', () => cv.zoom(0.8));
    zoomLevel.addEventListener('click', () => cv.zoom(1 / cv.view().z));
    fit.addEventListener('click', fitView);
    cv.onView(v => { const t = `${Math.round(v.z * 100)}%`; zoomLevel.textContent = t; zoomLevel.setAttribute('aria-label', `Zoom ${t}. Reset to 100%`); });
    cv.setView(cv.view());

    const typing = t => !!t && !!t.closest && !!t.closest('input, textarea, select');
    function onKey(e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || !editing() || frame.querySelector('dialog[open]')) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); if (!save.disabled) saveNow(); }
      else if ((k === 'z' || k === 'y') && !typing(e.target)) { e.preventDefault(); step(k === 'y' || e.shiftKey ? store.redo : store.undo); }
    }
    panel.element.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); panelOpen = false; const s = selection; if (!editing()) selection = null; refresh(); cv.focus(s); } });

    // ── Leaving with unsaved changes ──────────────────────────────────────
    const unsaved = () => editing() && (store.dirty() || !!panel.invalid());
    const onUnload = e => { if (unsaved()) { e.preventDefault(); e.returnValue = ''; } };
    const onHide = () => store.keep();
    document.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onHide);
    ctx.onLeave({ blocked: unsaved, ask: () => askUnsaved('Leave Connections?') });
    ctx.onCleanup(() => {
      alive = false;
      clearTimeout(sayTimer);
      store.keep();                            // losing access mid-edit loses nothing
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('pagehide', onHide);
      if (ro) ro.disconnect();
      ctl.destroy(); cv.destroy(); store.destroy();
      C.current = null;
    });

    // ── Start ─────────────────────────────────────────────────────────────
    // Fit once the canvas has a size; after that the view is the reader's.
    let loaded = false, fitted = false;
    const firstFit = () => { if (loaded && !fitted && cv.size().w && cv.size().h) { fitted = true; fitView(); } };
    const ro = new ResizeObserver(firstFit);
    ro.observe(host);
    store.onChange(refresh);
    refresh();
    store.load().then(r => {
      if (!alive) return;
      loaded = true;
      if (r.state === 'restored') { mode = 'edit'; say(store.newer() ? 'Your unsaved changes are back. A newer copy was saved since.' : 'Your unsaved changes are back.'); }
      refresh();
      firstFit();
    });
    C.current = { store, canvas: cv };
  }

  C.page = { render, wide: true };
  ns.app.register(PATH, C.page);
})();
