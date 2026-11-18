// The card editing drawer (CMS milestone M4). One editor for every card:
// the fields come from content.cardFields(id) (the declarative schema in
// scripts/cms/content.js), the values from the workspace's working copy
// (scripts/cms/workspace.js). Typing updates the working copy, which Admin
// view draws at once; nothing leaves the browser until Save Draft.
//
// Created by scripts/cms/admin.js, which owns Admin Mode and the views:
//   const drawer = PergamonCMS.drawer.create({ workspace, content, games,
//     cardLabel(id), onEdit(id), onForbidden(), whenLoaded() });
//   drawer.open(id)        (asks first if the open card has unsaved changes)
//   drawer.requestClose()  (likewise)  · drawer.hide() / show() for previews
//   drawer.isOpen(), drawer.current(), drawer.refresh(), drawer.destroy()
(function () {
  'use strict';
  const cms = window.PergamonCMS = window.PergamonCMS || {};

  const ICONS = {
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/>'
  };
  const svg = (name, cls) => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  let uidCount = 0;
  const uid = p => `${p}-${++uidCount}`;
  const time = iso => { const d = iso ? new Date(iso) : new Date(); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };

  const STATUS = {
    unsaved: { text: 'Unsaved changes', hint: 'Only in this browser until you save a draft.' },
    draft: { text: 'Saved in draft', hint: 'Saved for administrators; visitors still see the published card.' },
    published: { text: 'Published', hint: 'This card matches what visitors see.' }
  };

  function create(env) {
    const { workspace, content } = env;
    const OTHER = '__other__';

    // ── Frame ────────────────────────────────────────────────────────────
    const drawer = el('aside', 'cms-drawer');
    drawer.id = 'cms-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'false');
    drawer.hidden = true;
    const titleId = uid('cms-drawer-title');
    drawer.setAttribute('aria-labelledby', titleId);

    const head = el('header', 'cms-drawer-head');
    const headText = el('div', 'cms-drawer-heading');
    const eyebrow = el('p', 'cms-drawer-eyebrow');
    const title = el('h2', 'cms-drawer-title'); title.id = titleId;
    const status = el('p', 'cms-drawer-status');
    headText.append(eyebrow, title, status);
    const closeButton = el('button', 'cms-drawer-close');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close editor');
    closeButton.innerHTML = svg('close', 'cms-drawer-icon');
    head.append(headText, closeButton);

    const body = el('div', 'cms-drawer-body');
    const form = el('form', 'cms-drawer-form');
    form.noValidate = true;
    const loading = el('p', 'cms-drawer-loading', 'Loading the saved draft…');
    loading.setAttribute('role', 'status');
    const others = el('p', 'cms-drawer-others');
    body.append(loading, form, others);

    const conflictBox = el('div', 'cms-drawer-conflict');
    conflictBox.setAttribute('role', 'alertdialog');
    conflictBox.hidden = true;

    const foot = el('footer', 'cms-drawer-foot');
    const feedback = el('p', 'cms-drawer-feedback');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    const actions = el('div', 'cms-drawer-actions');
    const discardButton = el('button', 'cms-drawer-secondary', 'Discard Changes');
    discardButton.type = 'button';
    const saveButton = el('button', 'cms-drawer-primary', 'Save Draft');
    saveButton.type = 'submit';
    saveButton.setAttribute('form', uid('cms-drawer-form'));
    form.id = saveButton.getAttribute('form');
    actions.append(discardButton, saveButton);
    foot.append(feedback, actions, el('p', 'cms-drawer-note', 'Drafts are private to administrators. Publishing comes in a later update.'));

    // Confirmation for leaving a card with unsaved changes.
    const prompt = el('div', 'cms-drawer-prompt');
    prompt.setAttribute('role', 'alertdialog');
    prompt.setAttribute('aria-modal', 'true');
    prompt.hidden = true;
    const promptTitle = el('h3', 'cms-drawer-prompt-title'); promptTitle.id = uid('cms-prompt-title');
    const promptText = el('p', 'cms-drawer-prompt-text'); promptText.id = uid('cms-prompt-text');
    prompt.setAttribute('aria-labelledby', promptTitle.id);
    prompt.setAttribute('aria-describedby', promptText.id);
    const promptActions = el('div', 'cms-drawer-prompt-actions');
    const promptButtons = {};
    [['save', 'Save Draft', 'cms-drawer-primary'], ['discard', 'Discard', 'cms-drawer-secondary'], ['cancel', 'Cancel', 'cms-drawer-ghost']].forEach(([key, label, cls]) => {
      const b = el('button', cls, label); b.type = 'button'; b.dataset.choice = key;
      promptButtons[key] = b; promptActions.append(b);
    });
    prompt.append(promptTitle, promptText, promptActions);

    drawer.append(head, body, conflictBox, foot, prompt);
    document.body.append(drawer);

    // ── State ────────────────────────────────────────────────────────────
    let current = null;           // card id being edited
    let fields = [];              // [{ field, input, error, counter, other? }]
    let errors = {};              // field key → message
    let saving = false;
    let hidden = false;           // hidden by a User/Guest preview
    let pending = null;           // resolve function of an open prompt

    const label = id => env.cardLabel(id);
    const typeLabel = id => ({ feature: 'Featured card', spotlight: 'Spotlight card', tile: 'Carousel card' })[content.cardType(id)] || 'Card';

    function setFeedback(text, kind) {
      feedback.textContent = text || '';
      feedback.dataset.kind = kind || '';
    }

    // ── Fields ───────────────────────────────────────────────────────────
    function buildForm(id) {
      dropImages();
      form.replaceChildren();
      fields = []; errors = {};
      const component = workspace.component(id) || {};
      content.cardFields(id, component).forEach(field => {
        if (field.type === 'image') {
          // The image slot has its own editor (scripts/cms/image-editor.js).
          if (!cms.imageEditor || !env.images) return;
          const image = cms.imageEditor.create({
            field, cardId: id, workspace, content, images: env.images, store: env.imageStore, home: env.home,
            commit: cardId => { env.onEdit(cardId); if (cardId === current) update(); },
            setProblem: (key, problem) => { if (problem) errors[key] = problem; else delete errors[key]; update(); },
            busyChanged: () => update(),
            onForbidden: () => env.onForbidden()
          });
          form.append(image.element);
          fields.push({ field, image });
          return;
        }
        const wrap = el('div', 'cms-field');
        const inputId = uid('cms-field');
        const errorId = uid('cms-field-error');
        const lab = el('label', 'cms-field-label', field.label); lab.htmlFor = inputId;
        const error = el('p', 'cms-field-error'); error.id = errorId; error.hidden = true;
        const row = { field, error };
        let input;
        if (field.type === 'choice') {
          input = el('select', 'cms-field-input');
          field.options.forEach(o => { const opt = el('option', '', o); opt.value = o; input.append(opt); });
        } else if (field.type === 'link') {
          input = el('select', 'cms-field-input');
          const group = el('optgroup'); group.label = 'Games';
          env.games.forEach(g => { const opt = el('option', '', g.name); opt.value = g.path; group.append(opt); });
          input.append(group);
          if (!field.gamesOnly) {
            const opt = el('option', '', 'Other site page…'); opt.value = OTHER; input.append(opt);
            const otherId = uid('cms-field-other');
            const other = el('input', 'cms-field-input cms-field-other');
            other.type = 'text'; other.id = otherId; other.spellcheck = false;
            other.setAttribute('autocomplete', 'off');
            other.setAttribute('aria-label', `${field.label}: site path`);
            other.setAttribute('aria-describedby', errorId);
            other.placeholder = '/games/';
            row.other = other;
          }
        } else {
          input = el(field.type === 'textarea' ? 'textarea' : 'input', 'cms-field-input');
          if (field.type !== 'textarea') input.type = 'text';
          input.maxLength = field.max;
          input.setAttribute('autocomplete', 'off');
          const counter = el('span', 'cms-field-count');
          counter.setAttribute('aria-hidden', 'true');
          row.counter = counter;
          lab.append(counter);
        }
        input.id = inputId;
        input.name = field.key;
        input.setAttribute('aria-describedby', errorId);
        row.input = input;
        wrap.append(lab, input);
        if (row.other) wrap.append(row.other);
        if (field.type === 'link') wrap.append(el('p', 'cms-field-hint', field.gamesOnly ? 'Carousel cards link to a game.' : 'A game, or another page on this site.'));
        wrap.append(error);
        form.append(wrap);
        fields.push(row);

        const onInput = () => apply(row);
        input.addEventListener(field.type === 'choice' || field.type === 'link' ? 'change' : 'input', onInput);
        if (row.other) row.other.addEventListener('input', onInput);
        const tidy = () => { if (row.counter || row.other) { const t = (row.other && input.value === OTHER ? row.other : input); if (t.value !== t.value.trim()) t.value = t.value.trim(); } };
        input.addEventListener('blur', tidy);
        if (row.other) row.other.addEventListener('blur', tidy);
      });
      fill();
    }

    // Working copy → inputs (skips the field being typed in).
    function fill() {
      const component = workspace.component(current) || {};
      fields.forEach(row => {
        if (row.image) { row.image.refresh(); return; }
        const value = typeof component[row.field.key] === 'string' ? component[row.field.key] : '';
        if (row.field.type === 'link') {
          const known = env.games.some(g => g.path === value);
          if (document.activeElement !== row.input) row.input.value = known || !row.other ? value : OTHER;
          if (row.other) {
            row.other.hidden = row.input.value !== OTHER;
            if (document.activeElement !== row.other && row.input.value === OTHER && !errors[row.field.key]) row.other.value = value;
          }
        } else if (document.activeElement !== row.input && !errors[row.field.key]) {
          row.input.value = value;
        }
        if (row.counter) row.counter.textContent = `${row.input.value.trim().length} / ${row.field.max}`;
      });
    }

    function readValue(row) {
      if (row.field.type === 'link' && row.other) {
        row.other.hidden = row.input.value !== OTHER;
        return (row.input.value === OTHER ? row.other.value : row.input.value).trim();
      }
      return row.input.value.trim();
    }

    // One field changed: check it; valid values go straight into the working copy.
    function apply(row) {
      const value = readValue(row);
      if (row.counter) row.counter.textContent = `${value.length} / ${row.field.max}`;
      const problem = content.checkField(row.field, value);
      showError(row, problem);
      if (!problem) {
        workspace.setField(current, row.field.key, value);
        env.onEdit(current);
      }
      if (feedback.dataset.kind === 'success' || feedback.dataset.kind === 'error') setFeedback('');
      update();
    }

    function showError(row, problem) {
      if (row.image) { if (!problem) row.image.clearProblems(); return; }
      if (problem) errors[row.field.key] = problem; else delete errors[row.field.key];
      row.error.textContent = problem || '';
      row.error.hidden = !problem;
      [row.input, row.other].filter(Boolean).forEach(i => { if (problem) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid'); });
    }

    // ── Status, buttons ──────────────────────────────────────────────────
    function update() {
      if (!current) return;
      const loaded = workspace.isLoaded();
      loading.hidden = loaded;
      form.hidden = !loaded;
      eyebrow.textContent = typeLabel(current);
      title.textContent = label(current);
      const s = loaded ? workspace.cardStatus(current) : 'published';
      status.textContent = loaded ? STATUS[s].text : '';
      status.title = loaded ? STATUS[s].hint : '';
      status.dataset.status = loaded ? s : '';
      const unsaved = loaded ? workspace.unsavedCards() : [];
      const elsewhere = unsaved.filter(id => id !== current);
      others.textContent = elsewhere.length ? `Also unsaved: ${elsewhere.map(label).join(', ')}. Save Draft saves every card.` : '';
      others.hidden = !elsewhere.length;
      const hasErrors = Object.keys(errors).length > 0;
      const uploading = uploadingNow();
      discardButton.disabled = saving || uploading || !loaded || (s !== 'unsaved' && !hasErrors);
      saveButton.disabled = saving || uploading || !loaded || hasErrors || !unsaved.length;
      saveButton.textContent = saving ? 'Saving…' : 'Save Draft';
      drawer.setAttribute('aria-busy', String(saving));
    }

    const uploadingNow = () => fields.some(r => r.image && r.image.busy());
    function dropImages() { fields.forEach(r => { if (r.image) r.image.destroy(); }); }

    // ── Save, conflicts ──────────────────────────────────────────────────
    async function save() {
      if (saving || uploadingNow()) return false;
      if (Object.keys(errors).length) { setFeedback('Fix the highlighted fields first.', 'error'); return false; }
      saving = true; update();
      setFeedback('Saving draft…', 'busy');
      let result;
      try { result = await workspace.save(); }
      catch (e) { result = { error: { code: 'network', message: String(e && e.message) } }; }
      saving = false;
      const ok = handleResult(result);
      update(); env.onEdit(current);
      return ok;
    }

    function handleResult(result) {
      if (result.ok) { setFeedback(`Draft saved at ${time()}.`, 'success'); return true; }
      if (result.conflict) {
        if (result.conflict.error) { setFeedback(errorText(result.conflict.error), 'error'); return false; }
        showConflict(result.conflict);
        setFeedback('Not saved: the draft changed since you started.', 'error');
        return false;
      }
      setFeedback(errorText(result.error), 'error');
      if (result.error && result.error.code === 'PT422') markServerError(result.error.message);
      if (result.error && result.error.code === 'PT403') env.onForbidden();
      return false;
    }

    function errorText(err) {
      if (!err) return 'Something went wrong. Your changes are still here.';
      if (err.code === 'PT403') return 'Your account can no longer save drafts. Your changes are still here in this browser.';
      if (err.code === 'PT422') return `The server didn’t accept this: ${err.message}`;
      if (err.code === 'invalid') return err.message;
      return 'Couldn’t reach the server. Your changes are still here; try again.';
    }

    // "home.featured.href: …" → show it on that field too.
    function markServerError(message) {
      const m = /^([a-z0-9.-]+)\.([a-z]+): (.+)$/.exec(message || '');
      if (!m || m[1] !== current) return;
      const row = fields.find(r => r.field.key === m[2]);
      if (row) showError(row, m[3].charAt(0).toUpperCase() + m[3].slice(1) + '.');
    }

    function showConflict(info) {
      conflictBox.replaceChildren();
      const when = info.latestDraft ? ` at ${time(info.latestDraft.savedAt)}` : '';
      const h = el('h3', 'cms-drawer-conflict-title');
      h.innerHTML = svg('alert', 'cms-drawer-icon');
      h.append(el('span', '', info.latestDraft ? `Another administrator saved a draft${when}` : 'The draft changed since you started'));
      conflictBox.append(h);
      conflictBox.append(el('p', '', 'Nothing was saved, and your edits are still here. Saving over their draft would lose their work, so choose how to continue.'));
      if (info.overlap.length) {
        conflictBox.append(el('p', 'cms-drawer-conflict-overlap', `You both changed: ${info.overlap.map(label).join(', ')}. Combining keeps your version of ${info.overlap.length === 1 ? 'this card' : 'these cards'}.`));
      }
      const row = el('div', 'cms-drawer-prompt-actions');
      const combine = el('button', 'cms-drawer-primary', info.overlap.length ? 'Keep my version and save' : 'Combine and save');
      const theirs = el('button', 'cms-drawer-secondary', 'Use their draft');
      const cancel = el('button', 'cms-drawer-ghost', 'Not now');
      [combine, theirs, cancel].forEach(b => { b.type = 'button'; row.append(b); });
      conflictBox.append(row);
      conflictBox.hidden = false;
      combine.addEventListener('click', async () => {
        conflictBox.hidden = true;
        saving = true; update(); setFeedback('Combining and saving…', 'busy');
        let result;
        try { result = await workspace.combine(info); }
        catch (e) { result = { error: { code: 'network' } }; }
        saving = false;
        fill();
        handleResult(result);
        update(); env.onEdit(current);
      });
      theirs.addEventListener('click', () => {
        if (theirs.dataset.confirm !== '1') {
          theirs.dataset.confirm = '1';
          theirs.textContent = `Discard my edits to ${info.mine.length} card${info.mine.length === 1 ? '' : 's'}`;
          return;
        }
        conflictBox.hidden = true;
        workspace.adopt(info);
        fields.forEach(r => showError(r, null));
        fill(); update(); env.onEdit(current);
        setFeedback('Showing their draft. Your edits were discarded.', 'success');
      });
      cancel.addEventListener('click', () => { conflictBox.hidden = true; setFeedback('Not saved. Your edits are still here.', 'error'); saveButton.focus(); });
      combine.focus();
    }

    // ── Prompt: Save Draft / Discard / Cancel ────────────────────────────
    function ask(id) {
      return new Promise(resolve => {
        promptTitle.textContent = `Save changes to “${label(id)}”?`;
        promptText.textContent = 'This card has unsaved changes.';
        promptButtons.save.disabled = Object.keys(errors).length > 0;
        prompt.hidden = false;
        drawer.classList.add('has-prompt');
        pending = choice => {
          pending = null;
          prompt.hidden = true;
          drawer.classList.remove('has-prompt');
          resolve(choice);
        };
        (promptButtons.save.disabled ? promptButtons.discard : promptButtons.save).focus();
      });
    }
    Object.values(promptButtons).forEach(b => b.addEventListener('click', () => pending && pending(b.dataset.choice)));
    prompt.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); if (pending) pending('cancel'); }
      if (e.key === 'Tab') {                      // keep focus inside the prompt
        const list = Object.values(promptButtons).filter(b => !b.disabled);
        const i = list.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); list[list.length - 1].focus(); }
        else if (!e.shiftKey && i === list.length - 1) { e.preventDefault(); list[0].focus(); }
      }
    });

    // Leave the current card: true when it's fine to go on.
    async function leave() {
      if (!current || !workspace.isLoaded()) return true;
      if (uploadingNow()) { setFeedback('Wait for the image upload to finish.', 'busy'); return false; }
      const dirty = workspace.cardStatus(current) === 'unsaved' || Object.keys(errors).length > 0;
      if (!dirty) return true;
      const choice = await ask(current);
      if (choice === 'save') return save();
      if (choice === 'discard') { discard(); return true; }
      return false;
    }

    function discard() {
      workspace.discardCard(current);
      fields.forEach(r => showError(r, null));
      fill(); update(); env.onEdit(current);
      setFeedback('Changes discarded.', '');
    }

    // ── Open / close ─────────────────────────────────────────────────────
    async function open(id) {
      if (pending) return;
      if (current === id && !drawer.hidden) { focusFirst(); return; }
      if (current && current !== id && !drawer.hidden && !(await leave())) return;
      current = id;
      conflictBox.hidden = true;
      setFeedback('');
      hidden = false;
      drawer.hidden = false;
      document.documentElement.setAttribute('data-cms-drawer', 'open');
      update();
      env.onOpen(id);
      if (!workspace.isLoaded()) {
        loading.replaceChildren('Loading the saved draft…');
        loading.dataset.kind = '';
        try { await env.whenLoaded(); }
        catch (e) {
          if (current !== id) return;
          const retry = el('button', 'cms-drawer-secondary', 'Try again');
          retry.type = 'button';
          retry.addEventListener('click', () => { const again = current; current = null; open(again); });
          loading.replaceChildren('Couldn’t load the saved draft. Nothing has changed. ', retry);
          loading.dataset.kind = 'error';
          retry.focus();
          return;
        }
        if (current !== id) return;
      }
      buildForm(id);
      update();
      focusFirst();
    }
    function focusFirst() { const f = fields[0]; if (f) f.input.focus(); }

    async function requestClose() {
      if (pending || drawer.hidden) return;
      if (!(await leave())) return;
      close();
    }
    function close() {
      const id = current;
      current = null;
      drawer.hidden = true;
      document.documentElement.removeAttribute('data-cms-drawer');
      dropImages();
      form.replaceChildren(); fields = []; errors = {};
      env.onClose(id);
    }

    // Previews hide the drawer without touching the edits; show() brings it back.
    function hide() {
      if (!current || drawer.hidden) return;
      if (pending) pending('cancel');
      hidden = true;
      drawer.hidden = true;
      document.documentElement.removeAttribute('data-cms-drawer');
    }
    function show() {
      if (!current || !hidden) return;
      hidden = false;
      drawer.hidden = false;
      document.documentElement.setAttribute('data-cms-drawer', 'open');
      fill(); update();
      env.onOpen(current);
    }

    closeButton.addEventListener('click', requestClose);
    discardButton.addEventListener('click', discard);
    form.addEventListener('submit', e => { e.preventDefault(); save(); });
    drawer.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !pending) { e.stopPropagation(); requestClose(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!saveButton.disabled) save(); }
    });

    return {
      open, requestClose, close, hide, show,
      isOpen: () => !!current && !drawer.hidden,
      current: () => current,
      refresh: () => { if (current && fields.length) fill(); update(); },
      busy: () => saving || !!pending || uploadingNow(),
      destroy() { if (pending) pending('cancel'); dropImages(); drawer.remove(); document.documentElement.removeAttribute('data-cms-drawer'); }
    };
  }

  cms.drawer = { create };
})();
