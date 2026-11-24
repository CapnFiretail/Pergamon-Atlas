// Atlas Studio › Workspace › Ideas: the page. A searchable collection, grouped
// by category, of what Atlas might become. Wiring only: the document
// (document.js) and its state, storage and actions (the Studio's store.js,
// storage.js, document-flow.js, as in Connections).
//
// Edit opens an idea in its place in the list; what is typed goes straight to
// the working copy, and nothing is stored until Save. While an idea is open it
// stays where it is, whatever the search, the filters or its new category say.
(function () {
  'use strict';
  const ns = window.PergamonStudio;
  const { el, icon, button, dialog } = ns.ui;
  const I = ns.ideas, D = I.document;
  const PATH = 'workspace/ideas';

  const today = () => { const d = new Date(); return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, '0')).join('-'); };
  const day = v => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString([], { dateStyle: 'medium' }); };
  const count = n => `${n} ${n === 1 ? 'idea' : 'ideas'}`;
  const choices = (select, list) => select.append(...list.map(o => { const op = el('option', '', o.label); op.value = o.value; return op; }));

  function render(view, ctx) {
    const query = { text: '', category: '', status: '' };
    let open = null, sayTimer = 0, alive = true;    // open: { id, category, editor }

    const page = el('section', 'sti');
    page.setAttribute('aria-label', 'Ideas');
    view.append(ctx.header('Ideas', 'Visions, feature ideas and deferred improvements. A collection to return to, not a roadmap: nothing here is scheduled or approved, whatever its status.'), page);

    // ── Toolbar ───────────────────────────────────────────────────────────
    const tools = el('div', 'sti-tools'), bar = el('div', 'sti-bar ck-bar'), filters = el('div', 'sti-filters');
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Ideas');
    const addButton = button({ label: 'Add Idea', icon: 'add', kind: 'primary' });
    const undo = button({ label: 'Undo', icon: 'undo' }), redo = button({ label: 'Redo', icon: 'redo' });
    const status = el('p', 'ck-state sti-state pa-type-caption');
    const importButton = button({ label: 'Import', icon: 'import', title: 'Import a JSON file' });
    const exportButton = button({ label: 'Export', icon: 'export', title: 'Export as a JSON file' });
    const discard = button({ label: 'Discard', kind: 'secondary' }), save = button({ label: 'Save', kind: 'primary' });
    const editTools = el('div', 'ck-group'), files = el('div', 'ck-group'), saveTools = el('div', 'ck-group');
    editTools.append(addButton, undo, redo);
    files.append(importButton, exportButton);
    saveTools.append(discard, save);
    bar.append(editTools, el('span', 'ck-spacer'), status, files, saveTools);

    const searchField = el('label', 'st-search');
    const search = el('input', 'st-input');
    search.type = 'search';
    search.placeholder = 'Search ideas';
    search.autocomplete = 'off';
    searchField.append(el('span', 'pa-visually-hidden', 'Search ideas'), icon('search'), search);
    function filter(label, all, list) {
      const s = el('select', 'st-input');
      s.setAttribute('aria-label', label);
      choices(s, [{ value: '', label: all }].concat(list));
      return s;
    }
    const byCategory = filter('Category', 'All categories', D.CATEGORIES), byStatus = filter('Status', 'All statuses', D.STATUSES);
    const clear = button({ label: 'Clear', kind: 'secondary', title: 'Clear the search and filters' });
    filters.append(searchField, byCategory, byStatus, clear);
    tools.append(bar, filters);

    const found = el('p', 'sti-found pa-type-caption');
    found.setAttribute('role', 'status');
    const list = el('div', 'sti-list');
    const none = el('p', 'sti-none pa-type-body-small');
    const notice = el('div', 'sti-notice');
    notice.hidden = true;
    const toast = el('p', 'sti-say pa-type-caption');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    const earlier = el('div', 'st-earlier');
    earlier.hidden = true;
    page.append(tools, earlier, notice, found, list, none, toast);

    // ── State ─────────────────────────────────────────────────────────────
    const storage = ns.storage.server({ kind: 'ideas', key: D.KEY });
    const store = ns.store.create({ model: D, storage, browser: ns.storage.browser({ key: D.KEY }), createHistory: window.PergamonGrid.editor.createHistory, seed: I.seed });
    const doc = () => store.document();
    const ideaOf = id => doc().ideas.find(x => x.id === id);
    const invalid = () => (open ? open.editor.invalid() : null);
    const flow = ns.documentFlow({
      host: page, store, model: D, place: storage.name, noun: 'collection', seedName: 'starting collection', fileName: 'atlas-ideas', replaces: 'the whole collection',
      describe: d => count(d.ideas.length), ready: () => !fixFirst(), alive: () => alive, refresh, say
    });
    bar.append(flow.file);

    function say(text) {
      clearTimeout(sayTimer);
      toast.textContent = text;
      sayTimer = setTimeout(() => { toast.textContent = ''; }, 5000);
    }
    // A field holding a value that can't be used: show it instead of going on.
    function fixFirst() {
      const bad = invalid();
      if (!bad) return false;
      bad.focus();
      say('Correct the marked field first.');
      return true;
    }

    // ── One idea ──────────────────────────────────────────────────────────
    function card(x) {
      const a = el('article', 'sti-idea');
      const head = el('div', 'sti-idea-head');
      const title = el('h3', 'sti-idea-title pa-type-item-title', x.title);
      const chip = ctx.chip(D.labelOf(D.STATUSES, x.status));
      chip.dataset.status = x.status;
      head.append(title, chip);
      const foot = el('div', 'sti-idea-foot');
      const edit = button({ label: `Edit ${x.title}`, icon: 'edit', iconOnly: true, title: 'Edit' });
      const del = button({ label: `Delete ${x.title}`, icon: 'remove', iconOnly: true, title: 'Delete', kind: 'danger' });
      edit.dataset.edit = x.id;
      edit.addEventListener('click', () => openIdea(x.id));
      del.addEventListener('click', () => removeIdea(x.id));
      const when = el('time', 'pa-type-caption', `Added ${day(x.added)}`);
      when.dateTime = x.added;
      foot.append(when, edit, del);
      a.append(head);
      if (x.description) a.append(el('p', 'sti-text pa-type-body-small', x.description));
      if (x.notes) {
        const n = el('div', 'sti-notes');
        n.append(el('p', 'sti-notes-label pa-type-label', 'Notes'), el('p', 'sti-text pa-type-body-small', x.notes));
        a.append(n);
      }
      a.append(foot);
      return a;
    }
    let fields = 0;
    function editor(id) {
      const form = el('form', 'sti-idea sti-editor');
      form.noValidate = true;
      form.setAttribute('aria-label', 'Edit idea');
      form.addEventListener('submit', e => { e.preventDefault(); closeIdea(); });
      const controls = D.FIELDS.map(f => {
        const c = el(f.kind === 'multiline' ? 'textarea' : f.kind === 'choice' ? 'select' : 'input', 'st-input');
        if (f.kind === 'multiline') c.rows = f.max > 1000 ? 4 : 3;
        if (f.kind === 'text') c.type = 'text';
        if (f.kind === 'choice') choices(c, f.options); else { c.maxLength = f.max; c.autocomplete = 'off'; }
        const row = el('div', 'st-field sti-field sti-field--' + f.key), label = el('label', 'st-field-label', f.label), error = el('p', 'st-field-error');
        c.id = label.htmlFor = `sti-f-${++fields}`;
        error.id = c.id + '-e';
        error.hidden = true;
        error.setAttribute('role', 'alert');
        c.setAttribute('aria-describedby', error.id);
        row.append(label, c, error);
        form.append(row);
        const ctl = { control: c, bad: false, refresh(x) { if (!ctl.bad && c.value !== x[f.key]) c.value = x[f.key]; } };
        const mark = why => {
          ctl.bad = !!why;
          error.textContent = why;
          error.hidden = !why;
          c.setAttribute('aria-invalid', String(!!why));
        };
        c.addEventListener(f.kind === 'choice' ? 'change' : 'input', () => {
          const why = D.checkField(f, c.value);
          mark(why);
          if (!why) store.edit(`${id}:${f.key}`, D.update(doc(), id, { [f.key]: c.value }));
        });
        c.addEventListener('blur', () => {
          store.settle();
          // A required field left empty goes back to what it was.
          if (ctl.bad && f.required && !c.value.trim()) { mark(''); const x = ideaOf(id); if (x) c.value = x[f.key]; }
        });
        return ctl;
      });
      const foot = el('div', 'sti-idea-foot');
      const when = el('span', 'pa-type-caption', `Added ${day(ideaOf(id).added)}`);
      const del = button({ label: 'Delete idea…', kind: 'danger' }), done = button({ label: 'Done', kind: 'secondary' });
      del.addEventListener('click', () => removeIdea(id));
      done.addEventListener('click', closeIdea);
      foot.append(when, del, done);
      form.append(foot);
      form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeIdea(); } });
      return {
        element: form,
        refresh: x => controls.forEach(c => c.refresh(x)),
        focus() { controls[0].control.focus(); controls[0].control.select(); },
        invalid: () => { const c = controls.find(x => x.bad); return c ? c.control : null; }
      };
    }

    // ── Drawing ───────────────────────────────────────────────────────────
    // Cards are kept while their idea is unchanged, and the list while its
    // order is: typing in the open idea moves nothing.
    const cards = new Map();           // id → { idea, element }
    let drawn = null;
    function cardOf(x) {
      const c = cards.get(x.id);
      if (c && c.idea === x) return c.element;
      const element = card(x);
      if (c && c.element.isConnected) c.element.replaceWith(element);
      cards.set(x.id, { idea: x, element });
      return element;
    }
    function refresh() {
      if (!alive) return;
      const all = doc().ideas;
      if (open && !ideaOf(open.id)) open = null;
      const matches = new Set(D.find(doc(), query).map(x => x.id));
      const shown = all.filter(x => matches.has(x.id) || (open && x.id === open.id));
      const placed = x => (open && x.id === open.id ? open.category : x.category);
      const groups = D.CATEGORIES.map(c => ({ c, ideas: shown.filter(x => placed(x) === c.value) })).filter(g => g.ideas.length);
      const order = JSON.stringify([open && open.id, groups.map(g => [g.c.value, g.ideas.map(x => x.id)])]);
      if (open) open.editor.refresh(ideaOf(open.id));
      const element = x => (open && x.id === open.id ? open.editor.element : cardOf(x));
      const elements = groups.map(g => g.ideas.map(element));
      if (order !== drawn) {
        drawn = order;
        list.replaceChildren(...groups.map((g, i) => {
          const s = el('section', 'sti-group'), h = el('h2', 'sti-group-title pa-type-section-title', g.c.label), ul = el('ul', 'sti-cards');
          h.append(el('span', 'sti-count pa-type-caption', String(g.ideas.length)));
          elements[i].forEach(n => { const li = el('li'); if (open && n === open.editor.element) li.className = 'is-open'; li.append(n); ul.append(li); });
          s.append(h, ul);
          return s;
        }));
      }
      [...cards.keys()].forEach(id => { if (!ideaOf(id)) cards.delete(id); });

      const blocked = !!store.blocked(), stands = flow.status(), filtered = !!(query.text.trim() || query.category || query.status);
      status.dataset.state = stands.state;
      status.textContent = stands.text;
      undo.disabled = !store.canUndo();
      redo.disabled = !store.canRedo();
      save.disabled = flow.busy() || (!store.dirty() && !store.isExample());
      discard.disabled = flow.busy() || !store.dirty();
      addButton.disabled = importButton.disabled = exportButton.disabled = blocked;
      filters.hidden = found.hidden = list.hidden = blocked;
      clear.disabled = !filtered;
      const n = `${filtered ? `${matches.size} of ` : ''}${count(all.length)}`;
      if (found.textContent !== n) found.textContent = n;
      none.hidden = blocked || shown.length > 0;
      none.textContent = all.length ? 'No idea matches that. Clear the search and filters to see them all.' : 'No ideas yet. Add Idea starts the collection.';
      flow.notice(notice);
      flow.earlier(earlier);
    }
    const focusCard = id => { const b = list.querySelector(`[data-edit="${id}"]`); (b || search).focus({ preventScroll: true }); if (b) b.closest('li').scrollIntoView({ block: 'nearest' }); };

    // ── Changing the collection ───────────────────────────────────────────
    function openIdea(id) {
      if (open && (open.id === id || fixFirst())) return;
      store.settle();
      const x = ideaOf(id);
      if (!x) return;
      open = { id, category: x.category, editor: editor(id) };
      refresh();
      open.editor.element.scrollIntoView({ block: 'nearest' });
      open.editor.focus();
    }
    function closeIdea() {
      if (!open || fixFirst()) return;
      const { id } = open;
      store.settle();
      open = null;
      refresh();
      focusCard(id);
    }
    addButton.addEventListener('click', () => {
      if (fixFirst()) return;
      const r = D.add(doc(), { category: query.category || D.CATEGORIES[0].value, status: query.status || D.STATUSES[0].value }, today());
      if (!r.id) { say(`The collection can have up to ${D.LIMITS.ideas} ideas.`); return; }
      store.commit(r.doc);
      openIdea(r.id);
      say('Added. Save to keep it.');
    });
    async function removeIdea(id) {
      const x = ideaOf(id);
      if (!x) return;
      const yes = await dialog(page, {
        title: `Delete ${x.title}?`, text: 'It leaves the collection. Nothing is saved until you choose Save, and Undo brings it back while this page is open.',
        actions: [{ label: 'Cancel', value: null }, { label: 'Delete idea', value: true, kind: 'danger' }]
      });
      if (!alive || !yes) return;
      const buttons = [...list.querySelectorAll('[data-edit]')].map(b => b.dataset.edit).filter(i => i !== id);
      const before = doc().ideas.findIndex(i => i.id === id);
      const next = doc().ideas.slice(before + 1).find(i => buttons.includes(i.id)) || { id: buttons[buttons.length - 1] };
      if (open && open.id === id) open = null;
      store.commit(D.remove(doc(), id));
      focusCard(next.id);
      say(`Deleted ${x.title}. Undo brings it back.`);
    }
    const step = fn => { if (fn()) say(fn === store.undo ? 'Undone.' : 'Redone.'); };
    undo.addEventListener('click', () => step(store.undo));
    redo.addEventListener('click', () => step(store.redo));
    save.addEventListener('click', flow.save);
    discard.addEventListener('click', async () => {
      if (!await flow.confirmDiscard()) return;
      open = null;
      store.discard();
      say('Changes discarded.');
    });
    exportButton.addEventListener('click', flow.export);
    importButton.addEventListener('click', () => flow.import({ before: () => { open = null; } }));

    // ── Finding ───────────────────────────────────────────────────────────
    search.addEventListener('input', () => { query.text = search.value; refresh(); });
    byCategory.addEventListener('change', () => { query.category = byCategory.value; refresh(); });
    byStatus.addEventListener('change', () => { query.status = byStatus.value; refresh(); });
    clear.addEventListener('click', () => {
      Object.assign(query, { text: '', category: '', status: '' });
      search.value = byCategory.value = byStatus.value = '';
      refresh();
      search.focus();
    });

    const typing = t => !!t && !!t.closest && !!t.closest('input, textarea, select');
    function onKey(e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || page.querySelector('dialog[open]')) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); if (!save.disabled) flow.save(); }
      else if ((k === 'z' || k === 'y') && !typing(e.target)) { e.preventDefault(); step(k === 'y' || e.shiftKey ? store.redo : store.undo); }
    }
    document.addEventListener('keydown', onKey);
    const unguard = flow.guard(ctx, { unsaved: () => store.dirty() || !!invalid(), title: 'Leave Ideas?' });
    ctx.onCleanup(() => {
      alive = false;
      clearTimeout(sayTimer);
      unguard();
      document.removeEventListener('keydown', onKey);
      store.destroy();
      I.current = null;
    });

    store.onChange(refresh);
    refresh();
    store.load().then(r => {
      if (!alive) return;
      if (r.state === 'restored') say(store.newer() ? 'Your unsaved changes are back. A newer copy was saved since.' : 'Your unsaved changes are back.');
      refresh();
    });
    I.current = { store };
  }

  I.page = { render };
  ns.app.register(PATH, I.page);
})();
