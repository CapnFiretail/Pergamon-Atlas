// "Publish Changes" (CMS milestone M6): the confirmation dialog and its steps.
//
//   checking   reads the saved draft and the live version from the server
//              (what is published is exactly what the server holds, never
//              this browser's working copy)
//   unsaved    this browser has edits that aren't in the saved draft: save
//              them first, or publish the saved draft without them (they
//              stay here, unsaved)
//   review     what will change, card by card, and how many images become
//              public; a draft started before the current live version, or a notice
//              that asks for one, needs an extra confirmation
//   publishing images are prepared, then the draft is published (publish.js)
//   done / failed / stale   the outcome, with what to do next
//
// Created by admin.js: publishDialog.create({ workspace, content, publish,
//   api: { getDraft, describe, prepare, publish }, cardLabel(id), nameOf(game id),
//   notices({ draft, published }) → Promise<[{ lines, confirm?, block?,
//     action?: { label, run } }]>   what to say in the review: `confirm` must be
//     ticked to go on, `block` can't be published as it is
//   onPublished(result), onChanged(), onForbidden(), returnFocus() })
//   → { open(), isOpen(), destroy() }
(function () {
  'use strict';
  const cms = window.PergamonCMS = window.PergamonCMS || {};
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const time = iso => { const d = iso ? new Date(iso) : new Date(); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function create(env) {
    const { workspace, content } = env;
    const PAGE = content.page, ONE = PAGE.thing || 'card', MANY = PAGE.things || 'cards';

    const overlay = el('div', 'cms-publish');
    overlay.hidden = true;
    const dialog = el('div', 'cms-publish-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const title = el('h2', 'cms-publish-title');
    title.id = 'cms-publish-title';
    dialog.setAttribute('aria-labelledby', title.id);
    const body = el('div', 'cms-publish-body');
    body.id = 'cms-publish-body';
    dialog.setAttribute('aria-describedby', body.id);
    const status = el('p', 'cms-publish-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const actions = el('div', 'cms-publish-actions');
    dialog.append(title, body, status, actions);
    overlay.append(dialog);
    document.body.append(overlay);

    let step = null;
    let busy = false;
    let server = null;            // { draft, published } as read for this review

    function button(label, kind, onClick) {
      const b = el('button', kind === 'primary' ? 'cms-drawer-primary' : kind === 'ghost' ? 'cms-drawer-ghost' : 'cms-drawer-secondary', label);
      b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    }
    function show(name, heading, nodes, buttons, focus) {
      step = name;
      dialog.dataset.step = name;
      title.textContent = heading;
      body.replaceChildren(...nodes);
      actions.replaceChildren(...buttons);
      setStatus('');
      const target = focus || buttons.find(b => !b.disabled) || dialog;
      if (target === dialog) dialog.tabIndex = -1;
      target.focus();
    }
    function setStatus(text, kind) { status.textContent = text || ''; status.dataset.kind = kind || ''; }
    const para = (text, cls) => el('p', cls || '', text);

    // ── Steps ────────────────────────────────────────────────────────────
    async function check() {
      busy = true;
      show('checking', 'Publish Changes', [para('Checking the saved draft…')], [button('Cancel', 'ghost', close)]);
      let res;
      try { res = await env.api.getDraft(PAGE.id); } catch (e) { res = { error: { message: String(e && e.message) } }; }
      busy = false;
      if (step !== 'checking') return;
      if (res.error) {
        if (res.error.code === 'PT403') env.onForbidden();
        return failed('Couldn’t read the saved draft.', [`The live ${PAGE.noun} hasn’t changed. Check your connection and try again.`]);
      }
      const d = res.data || {};
      server = { draft: d.draft || null, published: d.published || null };
      const unsaved = workspace.isLoaded() ? workspace.unsavedCards() : [];
      if (!server.draft && !server.published && !unsaved.length && workspace.isLoaded() && workspace.unstored()) {
        const go = button('Save it as a draft', 'primary', async () => {
          busy = true; go.disabled = true; setStatus('Saving draft…', 'busy');
          let r;
          try { r = await workspace.save(); } catch (e) { r = { error: { code: 'network' } }; }
          busy = false;
          env.onChanged();
          if (r.ok) return check();
          go.disabled = false;
          setStatus(saveProblem(r), 'error');
        });
        return show('unstored', 'Nothing has been saved yet', [para(`Visitors see the built-in ${PAGE.noun}. Saving it as a draft, unchanged, lets you review and publish it.`)], [go, button('Cancel', 'ghost', close)]);
      }
      if (!server.draft) {
        return show('nothing', 'Nothing to publish', [
          para('There is no saved draft. Publishing makes the saved draft public.'),
          unsaved.length ? para(`You have unsaved changes on ${plural(unsaved.length, ONE, MANY)}. Use Save Draft ${PAGE.thing ? '' : 'in the card editor '}first.`) : para(`Edit a ${ONE} and use Save Draft first.`)
        ], [button('Close', 'secondary', close)]);
      }
      // This browser's edits are based on an older draft: another administrator saved since.
      if (workspace.basedOnDraft() !== server.draft.id) {
        if (!unsaved.length) {
          await workspace.load();
          env.onChanged();
        } else {
          return show('outdated', 'The saved draft has changed', [
            para(`Another administrator saved a newer draft at ${time(server.draft.created_at)}, after you started editing.`),
            para(`Save your changes ${PAGE.thing ? '' : 'from the card editor '}first (you’ll be asked how to combine them with theirs), then publish.`)
          ], [button('Close', 'secondary', close)]);
        }
      }
      if (unsaved.length) return unsavedStep(unsaved);
      review(false);
    }

    const saveProblem = r => (r.error && (r.error.code === 'layout' || r.error.code === 'games') ? r.error.message : r.error && r.error.code === 'PT422' ? `The server didn’t accept the draft: ${r.error.message}` : 'Couldn’t save the draft. Your changes are still here; try again.');

    function unsavedStep(unsaved) {
      const list = el('ul', 'cms-publish-list');
      unsaved.forEach(id => list.append(el('li', '', env.cardLabel(id))));
      const saveFirst = button('Save Draft and continue', 'primary', async () => {
        busy = true; saveFirst.disabled = without.disabled = true;
        setStatus('Saving draft…', 'busy');
        let r;
        try { r = await workspace.save(); } catch (e) { r = { error: { code: 'network' } }; }
        busy = false;
        env.onChanged();
        if (r.ok) return check();
        if (r.conflict) {
          return show('outdated', 'The saved draft has changed', [
            para('Not saved: another administrator saved a newer draft. Nothing was published.'),
            para(PAGE.thing ? 'Use Save Draft to combine your changes with theirs, then publish.' : 'Open a card with unsaved changes and use Save Draft there to combine your changes with theirs, then publish.')
          ], [button('Close', 'secondary', close)]);
        }
        saveFirst.disabled = without.disabled = false;
        setStatus(saveProblem(r), 'error');
      });
      const without = button('Publish saved draft only', 'secondary', () => review(true));
      show('unsaved', 'You have unsaved changes', [
        para(`These ${unsaved.every(id => content.cardType(id, ...workspace.docs())) ? plural(unsaved.length, `${ONE} has`, `${MANY} have`) : plural(unsaved.length, 'item has', 'items have')} changes that aren’t in the saved draft, so they would not be published:`),
        list,
        para('Save them into the draft first, or publish the saved draft without them (they stay here, unsaved).')
      ], [saveFirst, without, button('Cancel', 'ghost', close)]);
    }

    function layoutList(layout) {
      const list = el('ul', 'cms-publish-list cms-publish-changes cms-publish-layout');
      layout.forEach(c => {
        const li = el('li');
        li.append(el('strong', '', c.label), el('span', 'cms-publish-type', ''), el('span', 'cms-publish-what', c.changes.join(', ')));
        list.append(li);
      });
      return list;
    }

    async function review(excluding) {
      // The server checks structure; the sizes widgets need are checked here.
      if (!content.validateDocument(server.draft.content)) {
        return show('invalid', 'This draft can’t be published', [
          para('The saved draft’s layout or content isn’t valid for this version of the site, so it would not be shown to visitors.', 'cms-publish-error'),
          para('Nothing was published. Correct it in Admin Mode, save the draft again, and publish.')
        ], [button('Close', 'secondary', close)]);
      }
      let notices = [];
      if (env.notices) {
        busy = true;
        show('checking', 'Publish Changes', [para('Checking the saved draft…')], [button('Cancel', 'ghost', close)]);
        try { notices = await env.notices(server); } catch (e) { notices = null; }
        busy = false;
        if (step !== 'checking') return;
        if (!notices) return failed('Couldn’t check what this draft uses.', [`The live ${PAGE.noun} hasn’t changed. Check your connection and try again.`]);
      }
      const summary = env.publish.summarize(server.published && server.published.content, server.draft.content, content, cms.images, env.nameOf);
      const nodes = [para(`The draft saved at ${time(server.draft.created_at)} will replace the live ${PAGE.noun}${server.published ? ` (version ${server.published.id})` : ''}. Guests and signed-in visitors see it right away.`)];
      const confirms = [];
      const confirmBox = text => {
        const label = el('label', 'cms-publish-confirm'), box = el('input');
        box.type = 'checkbox';
        confirms.push(box);
        label.append(box, el('span', '', text));
        return label;
      };
      if (summary.empty) nodes.push(para('The saved draft matches what is live: there is nothing to publish.', 'cms-publish-note'));
      if (summary.cards.length) {
        const list = el('ul', 'cms-publish-list cms-publish-changes');
        summary.cards.forEach(c => {
          const li = el('li');
          li.append(el('strong', '', c.title), el('span', 'cms-publish-type', ` · ${c.typeLabel}`), el('span', 'cms-publish-what', c.changes.join(', ')));
          list.append(li);
        });
        nodes.push(list);
      }
      if (summary.layout.length) nodes.push(para('Layout:'), layoutList(summary.layout));
      summary.other.forEach(o => nodes.push(para(o + ' changed.')));
      if (summary.newImages.length) nodes.push(para(`${plural(summary.newImages.length, 'uploaded image', 'uploaded images')} will become public. Images that aren’t in the draft stay private.`, 'cms-publish-note'));
      if (excluding) nodes.push(para(`Your unsaved changes (${plural(workspace.unsavedCards().length, ONE, MANY)}) are not included and stay in this browser.`, 'cms-publish-note'));
      notices.forEach(n => {
        const box = el('div', n.block || n.confirm ? 'cms-publish-warning' : 'cms-publish-info');
        n.lines.forEach(t => box.append(para(t)));
        if (n.confirm) box.append(confirmBox(n.confirm));
        if (n.action) box.append(button(n.action.label, 'secondary', () => { close(); n.action.run(); }));
        nodes.push(box);
      });
      const livePub = server.published ? server.published.id : null;
      const stale = server.draft.based_on_published_id !== livePub && livePub !== null;
      if (stale) {
        const box = el('div', 'cms-publish-warning');
        box.append(para(`This draft was started from version ${server.draft.based_on_published_id || 'none'}, but version ${livePub} is live now (it was published or restored after the draft was started). Publishing replaces version ${livePub} with this draft, including any changes made in version ${livePub}.`));
        box.append(confirmBox(`Replace version ${livePub} anyway`));
        nodes.push(box);
      }
      const go = button('Publish now', 'primary', () => publishNow(summary));
      const blocked = notices.some(n => n.block);
      const ready = () => { go.disabled = summary.empty || blocked || confirms.some(c => !c.checked); };
      confirms.forEach(c => c.addEventListener('change', ready));
      ready();
      show('review', summary.empty ? 'Nothing to publish' : blocked ? 'Not ready to publish' : 'Publish these changes?', nodes, [go, button('Cancel', 'ghost', close)], summary.empty || blocked ? null : (confirms[0] || go));
    }

    async function publishNow(summary) {
      if (busy) return;                                          // one publish at a time
      busy = true;
      actions.querySelectorAll('button').forEach(b => { b.disabled = true; });
      dialog.setAttribute('aria-busy', 'true');
      setStatus('Publishing…', 'busy');
      const draftId = server.draft.id;
      let result;
      try {
        result = await env.publish.run({
          api: env.api, page: PAGE.id, draftId,
          expectedPublishedId: server.published ? server.published.id : null,
          mediaIds: content.mediaIds(server.draft.content),
          onStep: s => setStatus(s.step === 'images' ? `Preparing image ${s.done + 1} of ${s.total}…` : 'Publishing…', 'busy')
        });
      } catch (e) { result = { error: { stage: 'publish', message: String(e && e.message) } }; }
      busy = false;
      dialog.removeAttribute('aria-busy');
      if (result.ok) {
        const d = workspace.draft();
        if (d && d.id === draftId) workspace.markPublished(result.version);
        else await workspace.load();
        env.onPublished(result);
        const n = summary.cards.length;
        return show('done', 'Published', [
          para(`Version ${result.version} is live (${plural(n, ONE, MANY)} changed${summary.newImages.length ? `, ${plural(summary.newImages.length, 'image', 'images')} made public` : ''}). Visitors see it on their next visit; open pages update when reloaded.`)
        ], [button('Done', 'primary', close)]);
      }
      if (result.stale) {
        await workspace.load().catch(() => {});
        env.onChanged();
        return show('stale', 'Not published: something changed', [
          para('Another administrator published, restored a version or saved a newer draft while you were reviewing. Nothing was published, and your draft is kept.'),
          para('Review the latest state and publish again.')
        ], [button('Review again', 'primary', check), button('Close', 'ghost', close)]);
      }
      const e = result.error || {};
      if (e.code === 'PT403' || e.status === 403) env.onForbidden();
      const what = e.stage === 'images'
        ? `An image couldn’t be prepared for publishing (${e.prepared} of ${e.total} ready): ${e.message}`
        : `Publishing failed: ${e.message}`;
      failed(what, [`Nothing was published: the live ${PAGE.noun} is unchanged and your saved draft is kept. Try again; images that are already prepared are skipped.`, 'If it keeps failing, keep the draft and try later, or replace the image.']);
    }

    // Try again starts over from the server's current state.
    function failed(what, help) {
      show('failed', 'Not published', [para(what, 'cms-publish-error')].concat(help.map(t => para(t))),
        [button('Try again', 'primary', check), button('Close', 'ghost', close)]);
    }

    // ── Open / close, keyboard ───────────────────────────────────────────
    function open() {
      if (!overlay.hidden) return;
      overlay.hidden = false;
      document.documentElement.classList.add('cms-publish-open');
      check();
    }
    function close() {
      if (busy && step !== 'checking') return;                   // not while publishing or saving
      step = null; busy = false;
      overlay.hidden = true;
      document.documentElement.classList.remove('cms-publish-open');
      env.returnFocus();
    }
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key === 'Tab') {                                     // focus stays in the dialog
        const list = [...dialog.querySelectorAll('button, input')].filter(b => !b.disabled && b.offsetParent !== null);
        if (!list.length) { e.preventDefault(); return; }
        const i = list.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); list[list.length - 1].focus(); }
        else if (!e.shiftKey && i === list.length - 1) { e.preventDefault(); list[0].focus(); }
      }
    });
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });

    return {
      open,
      isOpen: () => !overlay.hidden,
      busy: () => busy,
      destroy() { overlay.remove(); document.documentElement.classList.remove('cms-publish-open'); }
    };
  }

  cms.publishDialog = { create };
})();
