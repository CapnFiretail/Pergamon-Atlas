// The card editing drawer (CMS milestone M4). One editor for every card:
// its fields are scripts/cms/fields.js (from the declarative schema in
// scripts/cms/content.js), the values the workspace's working copy
// (scripts/cms/workspace.js). Typing updates the working copy, which Admin
// view draws at once; nothing leaves the browser until Save Draft.
//
// Created by scripts/cms/admin.js, which owns Admin Mode and the views:
//   const drawer = PergamonCMS.drawer.create({ workspace, content, games,
//     records(), openLibrary(game, from), removeCard(id), cardLabel(id),
//     onEdit(id), onForbidden(), whenLoaded() });
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
    foot.append(feedback, actions, el('p', 'cms-drawer-note', 'Drafts are private to administrators until published with Publish Changes in the Admin Mode panel.'));

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
    let saving = false;
    let hidden = false;           // hidden by a User/Guest preview
    let pending = null;           // resolve function of an open prompt

    const label = id => env.cardLabel(id);
    const typeLabel = id => {
      const docs = workspace.docs();
      const t = content.cardLabel(id, ...docs);
      const name = content.isSaved(id, ...docs) ? `Saved ${t.toLowerCase()} (not active)` : t;
      // A widget added to the page: say which one.
      const o = content.ownerOf(id, ...docs);
      return o && !content.ownerOf(id) ? `${name} · ${content.instanceLabel(o.instance, o.type)}` : name;
    };

    function setFeedback(text, kind) {
      feedback.textContent = text || '';
      feedback.dataset.kind = kind || '';
    }

    // ── Fields (scripts/cms/fields.js) ───────────────────────────────────
    const fields = cms.fields.create({
      form, workspace, content, view: env.view, images: env.images, imageStore: env.imageStore,
      games: env.games, records: env.records, openLibrary: env.openLibrary, removeCard: env.removeCard,
      onEdit: id => env.onEdit(id),
      changed(typed) {
        if (typed && (feedback.dataset.kind === 'success' || feedback.dataset.kind === 'error')) setFeedback('');
        update();
      },
      onForbidden: () => env.onForbidden()
    });

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
      const hasErrors = fields.hasErrors();
      const uploading = fields.busy();
      discardButton.disabled = saving || uploading || !loaded || (s !== 'unsaved' && !hasErrors);
      saveButton.disabled = saving || uploading || !loaded || hasErrors || !unsaved.length;
      saveButton.textContent = saving ? 'Saving…' : 'Save Draft';
      drawer.setAttribute('aria-busy', String(saving));
    }

    // ── Save, conflicts ──────────────────────────────────────────────────
    async function save() {
      if (saving || fields.busy()) return false;
      if (fields.hasErrors()) { setFeedback('Fix the highlighted fields first.', 'error'); return false; }
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
      if (err.code === 'invalid' || err.code === 'layout' || err.code === 'games') return err.message;
      return 'Couldn’t reach the server. Your changes are still here; try again.';
    }

    // "home.featured.href: …" → show it on that field too.
    function markServerError(message) {
      const m = /^([a-z0-9.-]+)\.([a-z]+): (.+)$/.exec(message || '');
      if (!m || m[1] !== current) return;
      fields.mark(m[2], m[3].charAt(0).toUpperCase() + m[3].slice(1) + '.');
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
        fields.fill();
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
        fields.forget();
        fields.fill(); update(); env.onEdit(current);
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
        promptButtons.save.disabled = fields.hasErrors();
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
    let leaving = false;
    async function leave() {
      if (!current || !workspace.isLoaded()) return true;
      if (workspace.component(current) === undefined) return true;     // deleted meanwhile
      if (fields.busy()) { setFeedback('Wait for the image upload to finish.', 'busy'); return false; }
      const dirty = workspace.cardStatus(current) === 'unsaved' || fields.hasErrors();
      if (!dirty) return true;
      const choice = await ask(current);
      if (choice === 'save') return save();
      if (choice === 'discard') { leaving = true; try { discard(); } finally { leaving = false; } return true; }
      return false;
    }

    function discard() {
      workspace.discardCard(current);
      fields.forget();
      fields.fill(); update(); env.onEdit(current);
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
      fields.build(id);
      update();
      focusFirst();
    }
    const focusFirst = () => fields.focusFirst();

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
      fields.clear();
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
      fields.fill(); update();
      env.onOpen(current);
    }

    closeButton.addEventListener('click', requestClose);
    // Discarding a card that was added and never saved removes it: nothing left to edit.
    discardButton.addEventListener('click', () => {
      discard();
      if (current && workspace.component(current) === undefined) close();
    });
    form.addEventListener('submit', e => { e.preventDefault(); save(); });
    drawer.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !pending) { e.stopPropagation(); requestClose(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!saveButton.disabled) save(); }
    });

    return {
      open, requestClose, close, hide, show,
      isOpen: () => !!current && !drawer.hidden,
      current: () => current,
      refresh: () => {
        // The card was deleted (Manage cards) while open here: nothing left to edit.
        if (current && !drawer.hidden && !leaving && !saving && workspace.isLoaded() && workspace.component(current) === undefined) { close(); return; }
        if (current) fields.fill();
        update();
      },
      busy: () => saving || !!pending || fields.busy(),
      destroy() { if (pending) pending('cancel'); fields.clear(); drawer.remove(); document.documentElement.removeAttribute('data-cms-drawer'); }
    };
  }

  cms.drawer = { create };
})();
