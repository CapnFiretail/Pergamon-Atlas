// Version History (Admin Mode): the page's published versions, newest
// first, with what each one changed, and Restore for earlier ones.
//
// Restoring uses the server's rollback (rpc rollback, 0008): the chosen
// version's content is published again as a NEW version, immediately, for
// every visitor. History is never rewritten: the version that was live stays
// in the list and can itself be restored. The saved draft and this browser's
// unsaved edits are not touched (the dialog says so before restoring).
//
// Created by admin.js: history.create({ workspace, content, publish, images,
//   api: { list(page, limit), restore(page, versionId, expectedLiveId) },
//   cardLabel(id), onRestored(result), onForbidden(), returnFocus() })
//   → { open(), isOpen(), busy(), destroy() }
(function () {
  'use strict';
  const cms = window.PergamonCMS = window.PergamonCMS || {};
  const LIMIT = 20;
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const when = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const time = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function create(env) {
    const PAGE = env.content.page;
    const overlay = el('div', 'cms-publish cms-history');
    overlay.hidden = true;
    const dialog = el('div', 'cms-publish-dialog cms-history-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const title = el('h2', 'cms-publish-title');
    title.id = 'cms-history-title';
    dialog.setAttribute('aria-labelledby', title.id);
    const body = el('div', 'cms-publish-body');
    body.id = 'cms-history-body';
    dialog.setAttribute('aria-describedby', body.id);
    const status = el('p', 'cms-publish-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const actions = el('div', 'cms-publish-actions');
    dialog.append(title, body, status, actions);
    overlay.append(dialog);
    document.body.append(overlay);

    let versions = [];
    let busy = false;
    let step = null;
    let asking = null;            // version id on the confirm step

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

    // What a version changed compared with the one it replaced (when that
    // one is in the list too).
    function changes(v) {
      const prev = versions.find(x => x.id === v.previous_version_id);
      if (!v.previous_version_id) return { lines: ['First published version.'] };
      if (!prev) return { lines: ['Changes compared with older versions aren’t shown.'] };
      const s = env.publish.summarize(prev.content, v.content, env.content, env.images);
      const lines = s.cards.map(c => `${c.typeLabel} “${c.title}”: ${c.changes.join(', ')}`).concat(s.layout.map(c => `Layout, ${c.label}: ${c.changes.join(', ')}`), s.other.map(o => `${o} changed`));
      return { lines: lines.length ? lines : ['No content changes.'] };
    }

    async function load() {
      busy = true;
      show('loading', 'Version History', [para('Loading published versions…')], [button('Close', 'ghost', close)]);
      let res;
      try { res = await env.api.list(PAGE.id, LIMIT); } catch (e) { res = { error: { message: String(e && e.message) } }; }
      busy = false;
      if (step !== 'loading') return;
      if (res.error) {
        if (res.error.code === 'PT403') env.onForbidden();
        return show('failed', 'Version History', [para('Couldn’t load the version history. Nothing has changed; check your connection and try again.', 'cms-publish-error')],
          [button('Try again', 'primary', load), button('Close', 'ghost', close)]);
      }
      versions = Array.isArray(res.data) ? res.data : [];
      list();
    }

    function list(focusId) {
      if (!versions.length) {
        return show('list', 'Version History', [para(`Nothing has been published yet: visitors see the built-in ${PAGE.noun}.`)], [button('Close', 'secondary', close)]);
      }
      const ul = el('ul', 'cms-history-list');
      let focus = null;
      versions.forEach(v => {
        const li = el('li', 'cms-history-row');
        li.dataset.version = String(v.id);
        const head = el('div', 'cms-history-head');
        const name = el('strong', 'cms-history-name', `Version ${v.id}`);
        head.append(name);
        if (v.status === 'published') head.append(el('span', 'cms-manage-active', 'Live'));
        li.append(head);
        const meta = [when(v.published_at), v.published_by ? `by ${v.published_by}` : ''].filter(Boolean).join(' · ');
        li.append(el('p', 'cms-history-meta', meta + (v.restored_from ? ` · restored from version ${v.restored_from}` : '')));
        const c = changes(v);
        const what = el('ul', 'cms-history-changes');
        c.lines.slice(0, 5).forEach(t => what.append(el('li', '', t)));
        if (c.lines.length > 5) what.append(el('li', '', `and ${plural(c.lines.length - 5, 'more change', 'more changes')}`));
        li.append(what);
        if (v.status === 'archived') {
          const b = button('Restore…', 'secondary', () => confirm(v));
          b.setAttribute('aria-label', `Restore version ${v.id}`);
          li.append(b);
          if (focusId === v.id) focus = b;
        }
        ul.append(li);
      });
      const live = versions.find(v => v.status === 'published');
      const intro = para(`Every publish and restore is kept here${live ? `; version ${live.id} is live now` : ''}. Restoring an earlier version publishes it again as a new version. Showing the ${plural(versions.length, 'latest version', 'latest versions')}.`);
      // Start at the top of the list (the dialog itself), or back on the version just reviewed.
      show('list', 'Version History', [intro, ul], [button('Close', 'secondary', close)], focus || dialog);
      if (!focus) dialog.scrollTop = 0;
    }

    function confirm(v) {
      asking = v.id;
      // A layout saved for other widget sizes wouldn't be shown: never make it live.
      if (v.content && v.content.schema === env.content.PAGE_SCHEMA && !env.content.validateDocument(v.content)) {
        return show('failed', 'Not restored', [para(`Version ${v.id}’s layout isn’t valid for this version of the site, so visitors would not see it.`, 'cms-publish-error'), para(`Nothing changed: the live ${PAGE.noun} is as it was.`)],
          [button('Back to history', 'primary', () => list(v.id)), button('Close', 'ghost', close)]);
      }
      const live = versions.find(x => x.status === 'published');
      const loaded = env.workspace.isLoaded();
      const unsaved = loaded ? env.workspace.unsavedCards() : [];
      const draft = loaded ? env.workspace.draft() : null;
      const nodes = [
        para(`Restoring publishes version ${v.id} (from ${when(v.published_at)}) right away. Every visitor sees it on their next page load; nothing is scheduled or held back.`),
        para(`It is added as a new version${live ? `, replacing version ${live.id}` : ''}. Nothing is deleted: version ${live ? live.id : v.id} stays in the history and can be restored later.`)
      ];
      if (live) {
        const s = env.publish.summarize(live.content, v.content, env.content, env.images);
        if (!s.empty) {
          const ul = el('ul', 'cms-publish-list cms-publish-changes');
          s.cards.slice(0, 8).forEach(c => {
            const li = el('li');
            li.append(el('strong', '', c.title), el('span', 'cms-publish-type', ` · ${c.typeLabel}`), el('span', 'cms-publish-what', c.changes.join(', ')));
            ul.append(li);
          });
          s.layout.slice(0, 8).forEach(c => {
            const li = el('li');
            li.append(el('strong', '', c.label), el('span', 'cms-publish-type', ' · Layout'), el('span', 'cms-publish-what', c.changes.join(', ')));
            ul.append(li);
          });
          nodes.push(para('Compared with the live version:'), ul);
          s.other.forEach(o => nodes.push(para(`${o} changes.`)));
        } else {
          nodes.push(para('Its content is the same as the live version.', 'cms-publish-note'));
        }
      }
      if (draft || unsaved.length) {
        const box = el('div', 'cms-publish-warning');
        if (draft) box.append(para(`There is a saved draft (saved at ${time(draft.savedAt)}). Restoring doesn’t change it, but publishing that draft later would replace the restored version: review it first.`));
        if (unsaved.length) box.append(para(`You have unsaved changes (${plural(unsaved.length, 'change', 'changes')}) in this browser. They stay here, unsaved, and are not part of the restore.`));
        nodes.push(box);
      }
      const go = button(`Restore version ${v.id}`, 'primary', () => restore(v, live));
      show('confirm', `Restore version ${v.id}?`, nodes, [go, button('Cancel', 'ghost', () => list(v.id))], go);
    }

    async function restore(v, live) {
      if (busy) return;
      busy = true;
      actions.querySelectorAll('button').forEach(b => { b.disabled = true; });
      dialog.setAttribute('aria-busy', 'true');
      setStatus('Restoring…', 'busy');
      let res;
      try { res = await env.api.restore(PAGE.id, v.id, live ? live.id : null); } catch (e) { res = { error: { message: String(e && e.message) } }; }
      busy = false;
      dialog.removeAttribute('aria-busy');
      if (res.error) {
        const code = res.error.code;
        if (code === 'PT403') env.onForbidden();
        if (code === 'PT409') {
          return show('stale', 'Not restored: something changed', [para('Another administrator published or restored a version in the meantime. Nothing was restored.'), para('Review the latest history and try again.')],
            [button('Review again', 'primary', load), button('Close', 'ghost', close)]);
        }
        return show('failed', 'Not restored', [para(code === 'PT422' ? `The server didn’t accept version ${v.id}: ${res.error.message}` : `Restoring failed: ${res.error.message || 'the server didn’t answer'}.`, 'cms-publish-error'), para(`Nothing changed: the live ${PAGE.noun} is as it was.`)],
          [button('Back to history', 'primary', () => list(v.id)), button('Close', 'ghost', close)]);
      }
      const r = res.data || {};
      env.onRestored(r);
      show('done', 'Restored', [para(`Version ${r.version} is live: the content of version ${v.id}. Visitors see it on their next visit; open pages update when reloaded.`)],
        [button('Back to history', 'secondary', load), button('Done', 'primary', close)]);
    }

    function open() {
      if (!overlay.hidden) return;
      overlay.hidden = false;
      document.documentElement.classList.add('cms-publish-open');
      load();
    }
    function close() {
      if (busy && step !== 'loading') return;
      step = null; busy = false;
      overlay.hidden = true;
      document.documentElement.classList.remove('cms-publish-open');
      env.returnFocus();
    }
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); if (step === 'confirm' && !busy) list(asking); else close(); }
      if (e.key === 'Tab') {
        const all = [...dialog.querySelectorAll('button')].filter(b => !b.disabled && b.offsetParent !== null);
        if (!all.length) { e.preventDefault(); return; }
        const i = all.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); all[all.length - 1].focus(); }
        else if (!e.shiftKey && i === all.length - 1) { e.preventDefault(); all[0].focus(); }
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

  cms.history = { create };
})();
