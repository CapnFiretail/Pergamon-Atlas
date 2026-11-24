// What a Studio section offers around its store (store.js): save with conflicts
// and refusals, discard, leaving with unsaved changes, export and import, the
// status text, the notice while the stored copy can't be opened, and the offer to
// move a copy this browser saved before documents were shared. The section keeps
// its own toolbar, drawing and wording of what changed.
//
//   const flow = PergamonStudio.documentFlow({
//     host             where dialogs open; goes when the section does
//     store, model     model: the store's (parse, serialize)
//     place            the storage's name: 'staging'
//     noun             'map': what the document is called
//     seedName         'example': what is shown before anything is saved
//     fileName         'atlas-connections': exports are <fileName>-<date>.json
//     describe(doc)    '9 nodes and 8 connections', for the import question
//     replaces         'what is on the canvas', for the same
//     ready()          false stops a save (a field to correct first)
//     alive(), refresh(), say(text) })
//   await flow.save() → saved?         await flow.confirmDiscard() → discard?
//   await flow.askUnsaved(title)       → true when nothing unsaved is left
//   flow.export()                      flow.file: a hidden input to place;
//   flow.import({ before, after })       asks, then replaces the working copy
//   flow.busy(), flow.status() → { state, text } for .ck-state
//   flow.notice(element, after)        draws or clears the notice: loading, no
//                                      answer, unreadable. after(): opened again
//   flow.earlier(element)              draws or clears the browser’s own copy:
//                                      move it, download it, remove it
//   flow.guard(ctx, { unsaved, title }) → stop()   section changes, leaving the
//                                      page, and keeping work for this tab
(function () {
  'use strict';
  const ns = window.PergamonStudio;
  const { el, button, dialog } = ns.ui;
  const MAX_IMPORT = 2 * 1024 * 1024;

  function documentFlow(o) {
    const { host, store, model, noun, place } = o;
    let busy = false, saving = null, failed = '', notice = null, offer = '';
    const file = el('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.hidden = true;

    const FAILED = {
      unavailable: `no answer from ${place}`,
      denied: 'this account isn’t signed in as an administrator',
      missing: `the ${place} database isn’t set up for it`,
      refused: `the ${place} database refused it`
    };
    function save() {
      if (busy || !o.ready()) return Promise.resolve(false);
      saving = attempt().finally(() => { saving = null; });
      return saving;
    }
    async function attempt() {
      const done = text => { busy = false; if (o.alive()) { o.refresh(); o.say(text); } };
      busy = true; failed = ''; o.refresh();
      let r = await store.save();
      if (r.code === 'conflict' && o.alive()) {
        // A copy nothing saved is behind isn't put in place of one somebody saved.
        const first = store.first();
        const choice = await dialog(host, {
          title: first ? `A ${noun} was saved first` : 'A newer copy was saved',
          text: first ? `Somebody saved this ${noun} in ${place} before you. Yours isn’t stored there and doesn’t replace it. Use the saved copy and drop yours, or go back and export yours first?`
            : `Another administrator or tab saved this ${noun} after you opened it. Replace that copy with yours, or use it and drop your changes?`,
          actions: [{ label: first ? 'Go back' : 'Cancel', value: null }, { label: first ? 'Use the saved copy' : 'Use the newer copy', value: 'theirs' }]
            .concat(first ? [] : [{ label: 'Replace it with mine', value: 'mine', kind: 'danger' }])
        });
        if (choice === 'mine') r = await store.save({ force: true });
        else if (choice === 'theirs') {
          if ((await store.reload()).state === 'unavailable') { done(`The newer copy can’t be loaded: ${FAILED.unavailable}. Your changes are still here.`); return false; }
          done('Showing the newer copy.');
          return true;
        }
      }
      if (r.ok) { done(`Saved in ${place}.`); return true; }
      if (r.code === 'conflict') { done('Not saved. Your changes are still here.'); return false; }
      failed = FAILED[r.code] || FAILED.unavailable;
      done(`Not saved: ${failed}${r.code === 'refused' && r.message ? ` (${r.message.slice(0, 160)})` : ''}. Your changes are still here; Export keeps a copy.`);
      if (r.code === 'denied' && ns.access) ns.access.recheck();      // and the work is kept for this tab
      return false;
    }
    async function confirmDiscard() {
      const yes = await dialog(host, {
        title: 'Discard changes?', text: `The ${noun} goes back to the ${store.start() === 'browser' ? 'copy in this browser' : store.isExample() ? o.seedName : 'saved copy'}. Undo brings your changes back while this page is open.`,
        actions: [{ label: 'Cancel', value: null }, { label: 'Discard changes', value: true, kind: 'danger' }]
      });
      return !!yes && o.alive();
    }
    // Save, discard or stay.
    async function askUnsaved(title) {
      if (saving) { await saving; if (!o.alive()) return false; if (!store.dirty()) return true; }
      const choice = await dialog(host, {
        title, text: `The ${noun} has unsaved changes.`,
        actions: [{ label: 'Keep editing', value: null }, { label: 'Discard changes', value: 'discard', kind: 'danger' }, { label: 'Save', value: 'save', kind: 'primary' }]
      });
      if (!o.alive() || !choice) return false;
      if (choice === 'save') return save();
      store.discard();
      return true;
    }

    // ── Files ─────────────────────────────────────────────────────────────
    function download(text, name) {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = el('a');
      a.href = url; a.download = name;
      host.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function exportFile() {
      const d = new Date(), day = [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, '0')).join('-');
      download(model.serialize(store.document()), `${o.fileName}-${day}.json`);
      o.say(store.dirty() ? 'Exported, with the unsaved changes.' : 'Exported.');
    }
    let steps = {};
    file.addEventListener('change', async () => {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      let r;
      try { r = f.size > MAX_IMPORT ? { errors: ['The file is larger than 2 MB.'] } : model.parse(await f.text()); } catch (e) { r = { errors: ['The file couldn’t be read.'] }; }
      if (!o.alive()) return;
      if (r.errors) {
        const list = el('ul', 'st-dialog-list pa-type-body-small');
        r.errors.forEach(t => list.append(el('li', '', t)));
        await dialog(host, { title: 'Not imported', text: 'Nothing changed.', content: list, actions: [{ label: 'Close', value: null, kind: 'primary' }] });
        return;
      }
      const yes = await dialog(host, {
        title: `Replace the ${noun}?`, text: `“${f.name}” has ${o.describe(r.document)}. It replaces ${o.replaces}; nothing is saved until you choose Save, and Undo goes back.`,
        actions: [{ label: 'Cancel', value: null }, { label: 'Replace', value: true, kind: 'primary' }]
      });
      if (!yes || !o.alive()) return;
      if (steps.before) steps.before();
      store.commit(r.document);
      if (steps.after) steps.after();
      o.say('Imported. Save to keep it.');
    });

    // ── Where things stand ────────────────────────────────────────────────
    function status() {
      const t = store.savedAt() ? new Date(store.savedAt()) : null;
      const when = t && !isNaN(t) ? t.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
      if (store.blocked()) return { state: 'saved', text: '' };
      if (busy) return { state: 'unsaved', text: 'Saving…' };
      if (failed && (store.dirty() || store.isExample())) return { state: 'unsaved', text: `Not saved: ${failed}` };
      if (store.dirty()) return { state: 'unsaved', text: 'Unsaved changes' };
      if (store.start() === 'browser') return { state: 'example', text: `In this browser only, not in ${place} yet` };
      if (store.isExample()) return { state: 'example', text: `${o.seedName.charAt(0).toUpperCase() + o.seedName.slice(1)}, not saved yet` };
      return { state: 'saved', text: `Saved in ${place}${when ? ', ' + when : ''}` };
    }
    function drawNotice(box, after) {
      const b = store.blocked();
      box.hidden = !b;
      if (!b) { box.replaceChildren(); notice = null; return; }
      if (notice === b) return;
      notice = b;
      const say = t => el('p', 'pa-type-body-small', t), row = el('div', 'ck-group');
      if (b.code === 'loading') { box.replaceChildren(say(`Loading the ${noun} from ${place}…`)); return; }
      if (b.code === 'unavailable') {
        const again = button({ label: 'Try again', kind: 'primary' }), kept = store.kept();
        again.addEventListener('click', async () => { await store.load(); if (!o.alive()) return; o.refresh(); if (!store.blocked() && after) after(); });
        if (kept) {
          const mine = button({ label: 'Download your unsaved changes', kind: 'secondary' });
          mine.addEventListener('click', () => download(model.serialize(kept.document), `${o.fileName}-unsaved.json`));
          row.append(mine);
        }
        row.append(again);
        box.replaceChildren(el('h2', 'pa-type-section-title', `The ${noun} can’t be loaded`),
          say({ denied: 'The database didn’t accept this account. Sign in again as an administrator.', missing: `The ${place} database isn’t set up for it yet.` }[b.why] || `There is no answer from ${place}.`),
          say('Nothing has changed, there or in this browser.' + (kept ? ' Your unsaved changes are kept for this tab.' : '')), row);
        if (b.why === 'denied' && ns.access) ns.access.recheck();
        return;
      }
      const copy = button({ label: 'Download the stored copy', kind: 'secondary' }), again = button({ label: `Start again from the ${o.seedName}`, kind: 'primary' });
      copy.hidden = !b.raw;
      copy.addEventListener('click', () => download(b.raw, `${o.fileName}-stored.json`));
      again.addEventListener('click', () => { store.reset(); o.refresh(); if (after) after(); });
      row.append(copy, again);
      box.replaceChildren(el('h2', 'pa-type-section-title', `The saved ${noun} can’t be opened`), say(b.errors.join(' ')),
        say('It is left as it is. Starting again replaces it only when you save.'), row);
    }

    // ── The copy this browser saved before ────────────────────────────────
    function drawEarlier(box) {
      const c = store.blocked() ? null : store.earlier();
      const key = !c || (c.mark === 'kept' && store.start() !== 'browser') ? '' : [store.start(), c.same, c.mark, busy, c.raw.length, c.savedAt].join('|');
      box.hidden = !key;
      if (key === offer) return;
      offer = key;
      if (!key) { box.replaceChildren(); return; }
      const t = c.savedAt ? new Date(c.savedAt) : null;
      const what = `This browser has a copy of its own${t && !isNaN(t) ? ', saved ' + t.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''}${c.document ? `: ${o.describe(c.document)}` : ''}.`;
      const row = el('div', 'ck-group');
      const act = (label, kind, fn) => { const x = button({ label, kind }); x.disabled = busy; x.addEventListener('click', fn); row.append(x); };
      const save = () => download(c.document ? model.serialize(c.document) : c.raw, `${o.fileName}-browser.json`);
      let why;
      if (store.start() === 'browser') {
        why = `Nothing is saved in ${place} yet, so it is shown here. Moving it there shares it with every administrator; the copy in this browser stays.`;
        act('Download', 'secondary', save);
        act(`Move to ${place}`, 'primary', () => flow.save());
      } else {
        why = !c.document ? 'It can’t be read, and is left as it is.'
          : c.same ? `It is the same as the one saved in ${place}.`
          : c.mark === 'moved' ? `It was moved to ${place}, which has changed since.`
          : `It was never moved, and differs from the one saved in ${place}, which is what you see. To use it instead, download it and import it.`;
        act('Keep and hide', 'secondary', () => { store.markEarlier('kept'); o.refresh(); });
        act('Download', 'secondary', save);
        act('Remove from this browser', 'danger', () => removeEarlier(c));
      }
      const text = el('div', 'st-earlier-text');
      text.append(el('p', 'pa-type-item-title', what), el('p', 'pa-type-body-small', why));
      box.replaceChildren(text, row);
    }
    async function removeEarlier(c) {
      const safe = c.same || c.mark === 'moved';
      const yes = await dialog(host, {
        title: 'Remove this browser’s copy?',
        text: safe ? `What is saved in ${place} stays as it is.` : `It was never moved to ${place}: unless you downloaded it, this is the only copy. What is saved in ${place} stays as it is.`,
        actions: [{ label: 'Cancel', value: null }, { label: 'Remove', value: true, kind: 'danger' }]
      });
      if (!yes || !o.alive()) return;
      const r = await store.removeEarlier();
      if (!o.alive()) return;
      o.refresh();
      o.say(r === 'removed' ? 'Removed from this browser.' : r === 'changed' ? 'Not removed: it has changed since.' : `Not removed: what is saved in ${place} can’t be checked now.`);
    }

    // ── Leaving ───────────────────────────────────────────────────────────
    function guard(ctx, g) {
      const onUnload = e => { if (g.unsaved() || (store.blocked() && store.kept())) { e.preventDefault(); e.returnValue = ''; } };
      const onHide = () => store.keep();
      window.addEventListener('beforeunload', onUnload);
      window.addEventListener('pagehide', onHide);
      ctx.onLeave({ blocked: g.unsaved, ask: () => askUnsaved(g.title) });
      return () => {
        store.keep();                          // losing access mid-edit loses nothing
        window.removeEventListener('beforeunload', onUnload);
        window.removeEventListener('pagehide', onHide);
      };
    }

    const flow = {
      save, confirmDiscard, askUnsaved, file, status, guard, notice: drawNotice, earlier: drawEarlier, export: exportFile,
      import(s) { steps = s || {}; file.click(); },
      busy: () => busy
    };
    return flow;
  }

  ns.documentFlow = documentFlow;
})();
