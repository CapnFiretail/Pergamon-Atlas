// "Manage cards" (Admin Mode): the saved Featured / Spotlight cards of a slot,
// or the carousel's cards. Every change goes into the working copy
// (workspace.js), so it is a draft change like any card edit: Save Draft,
// then Publish Changes. Nothing here deletes images or games: deleting a
// card removes it from the document only (older versions keep it, so
// rollback brings it back).
//
//   slot list       the active card first ("shown on the homepage"), then the
//                   saved cards: Make active, Edit, Delete; reorder the saved
//                   ones (drag the handle, or Move up / Move down)
//   carousel list   the cards in carousel order: Edit, Delete, reorder
//   Add card        a new card (saved card, or carousel card at the end),
//                   opened in the card editor; limits from content.LIMITS
//
// Created by admin.js: manage.create({ workspace, content, home, games,
//   cardLabel(id), openEditor(id), onChanged(), returnFocus() })
//   → { open(list), addCarouselCard(), isOpen(), refresh(), destroy() }
(function () {
  'use strict';
  const cms = window.PergamonCMS = window.PergamonCMS || {};
  const ICONS = {
    grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>'
  };
  const svg = (name, cls) => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const STATUS = { unsaved: 'Unsaved changes', draft: 'Saved in draft' };

  function create(env) {
    const { workspace, content } = env;
    const NAMES = {
      'home.featured': { title: 'Featured cards', one: 'featured card' },
      'home.spotlight': { title: 'Spotlight cards', one: 'spotlight card' },
      'home.carousel': { title: 'Carousel cards', one: 'carousel card' }
    };

    const overlay = el('div', 'cms-publish cms-manage');
    overlay.hidden = true;
    const dialog = el('div', 'cms-publish-dialog cms-manage-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const title = el('h2', 'cms-publish-title');
    title.id = 'cms-manage-title';
    dialog.setAttribute('aria-labelledby', title.id);
    const intro = el('p', 'cms-manage-intro');
    intro.id = 'cms-manage-intro';
    dialog.setAttribute('aria-describedby', intro.id);
    const list = el('ul', 'cms-manage-list');
    const status = el('p', 'cms-publish-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const foot = el('div', 'cms-manage-foot');
    const count = el('p', 'cms-manage-count');
    const actions = el('div', 'cms-publish-actions');
    foot.append(count, actions);
    dialog.append(title, intro, list, status, foot);
    overlay.append(dialog);
    document.body.append(overlay);

    let target = null;            // 'home.featured' | 'home.spotlight' | 'home.carousel'
    let confirming = null;        // card id waiting for delete confirmation
    let undo = null;              // { id, label } of the last deletion

    const listId = () => (target === content.CAROUSEL ? content.CAROUSEL : content.savedList(target));
    const keys = () => workspace.order(listId());
    const idOf = key => (target === content.CAROUSEL ? content.CAROUSEL + '.' + key : content.savedId(target, key));
    const limit = () => (target === content.CAROUSEL ? content.LIMITS.carousel : content.LIMITS.saved);

    function setStatus(text, extra) {
      status.replaceChildren(text || '');
      if (extra) status.append(' ', extra);
    }
    function button(label, cls, onClick, aria) {
      const b = el('button', cls, label);
      b.type = 'button';
      if (aria) b.setAttribute('aria-label', aria);
      b.addEventListener('click', onClick);
      return b;
    }
    function iconButton(icon, aria, onClick) {
      const b = el('button', 'cms-manage-icon');
      b.type = 'button';
      b.innerHTML = svg(icon, 'cms-drawer-icon');
      b.setAttribute('aria-label', aria);
      b.addEventListener('click', onClick);
      return b;
    }

    // A small picture of the card's artwork, drawn like the page frames it.
    function thumb(c) {
      const box = el('span', 'cms-manage-thumb');
      box.setAttribute('aria-hidden', 'true');
      const a = c && c.art ? env.home.artModel(c.art) : null;
      if (a && a.src) {
        const img = el('img');
        img.src = a.src;
        img.alt = '';
        img.decoding = 'async';
        if (a.fit === 'height') { box.dataset.fit = 'height'; if (a.base) box.style.background = a.base; }
        else if (a.focus) img.style.objectPosition = a.focus;
        box.append(img);
      } else {
        box.append(el('span', 'cms-manage-thumb-empty', 'No image'));
      }
      return box;
    }

    function row(id, opts) {
      const c = workspace.component(id) || {};
      const li = el('li', 'cms-manage-row');
      li.dataset.id = id;
      if (opts.active) li.dataset.active = 'true';
      const label = env.cardLabel(id);
      const text = el('div', 'cms-manage-text');
      text.append(el('strong', 'cms-manage-name', label));
      const meta = el('span', 'cms-manage-meta');
      if (opts.active) {
        const chip = el('span', 'cms-manage-active', 'Active');
        meta.append(chip, ' Shown on the homepage');
      } else if (target === content.CAROUSEL) {
        const game = env.games.find(g => g.path === c.href);
        meta.append(`${c.category || ''}${game ? ` · ${game.name}` : ''}`);
      } else {
        meta.append('Saved');
      }
      const s = workspace.cardStatus(id);
      if (STATUS[s]) { const st = el('span', 'cms-manage-state', STATUS[s]); st.dataset.status = s; meta.append(st); }
      text.append(meta);

      const tools = el('div', 'cms-manage-tools');
      if (confirming === id) {
        li.dataset.confirm = 'true';
        const ask = el('p', 'cms-manage-ask', `Delete “${label}” from the draft? Its image stays available, and the published homepage keeps it until you publish.`);
        ask.id = `cms-manage-ask-${opts.index}`;
        const yes = button('Delete', 'cms-drawer-primary cms-manage-danger', () => remove(id));
        yes.setAttribute('aria-describedby', ask.id);
        const no = button('Cancel', 'cms-drawer-ghost', () => { confirming = null; draw(id, 'delete'); });
        tools.append(ask, yes, no);
        li.append(el('span', 'cms-manage-grip is-empty'), thumb(c), text, tools);
        return li;
      }
      if (opts.movable) {
        const handle = el('span', 'cms-manage-grip');
        handle.innerHTML = svg('grip', 'cms-drawer-icon');
        handle.title = 'Drag to reorder';
        handle.setAttribute('aria-hidden', 'true');
        handle.addEventListener('pointerdown', e => startDrag(e, li, id));
        li.prepend(handle);
        const n = keys().length;
        const up = iconButton('up', `Move “${label}” up`, () => move(id, opts.index - 1, 'up'));
        const down = iconButton('down', `Move “${label}” down`, () => move(id, opts.index + 1, 'down'));
        up.dataset.move = 'up'; down.dataset.move = 'down';
        up.disabled = opts.index === 0;
        down.disabled = opts.index === n - 1;
        tools.append(up, down);
      } else {
        li.prepend(el('span', 'cms-manage-grip is-empty'));
      }
      if (opts.saved) {
        const make = button('Make active', 'cms-drawer-secondary', () => activate(id), `Make “${label}” the active ${NAMES[target].one}`);
        make.dataset.action = 'activate';
        tools.append(make);
      }
      const edit = button('Edit', 'cms-drawer-secondary', () => { close(false); env.openEditor(id); }, `Edit “${label}”`);
      edit.dataset.action = 'edit';
      tools.append(edit);
      if (!opts.active) {
        const del = button('Delete', 'cms-drawer-ghost cms-manage-delete', () => { confirming = id; draw(id, 'confirm'); }, `Delete “${label}”`);
        del.dataset.action = 'delete';
        tools.append(del);
      }
      li.append(thumb(c), text, tools);
      return li;
    }

    // Redraw the list; focus goes back to `focusId`'s `what` control.
    function draw(focusId, what) {
      if (!target) return;
      const names = NAMES[target];
      title.textContent = names.title;
      const n = keys().length;
      if (target === content.CAROUSEL) {
        intro.textContent = 'The cards visitors see in the Explore More Games carousel, in this order (each category shows its cards in the same order). Changes are part of the draft until you publish.';
        count.textContent = `${n} of ${limit()} cards`;
      } else {
        intro.textContent = `One ${names.one} is shown on the homepage at a time. Saved cards keep their own title, button, link and image, so you can switch back at any time. Changes are part of the draft until you publish.`;
        count.textContent = `${plural(n, 'saved card', 'saved cards')} (up to ${limit()})`;
      }
      list.replaceChildren();
      if (target !== content.CAROUSEL) list.append(row(target, { active: true, index: -1 }));
      keys().forEach((key, index) => list.append(row(idOf(key), { saved: target !== content.CAROUSEL, movable: n > 1, index })));
      if (!n) list.append(el('li', 'cms-manage-empty', target === content.CAROUSEL ? 'No cards: the carousel shows its empty message. Add a card to start.' : 'No saved cards yet.'));
      const full = n >= limit();
      const add = button('Add card', 'cms-drawer-primary', addCard);
      add.dataset.action = 'add';
      add.disabled = full;
      if (full) { add.title = 'Limit reached'; count.textContent += ' · limit reached: delete a card to add another'; }
      actions.replaceChildren(add, button('Done', 'cms-drawer-secondary', () => close(true)));
      // Focus: the same control on the same card, else the dialog's first control.
      let f = null;
      if (focusId) {
        const li = list.querySelector(`[data-id="${CSS.escape(focusId)}"]`);
        if (li) f = what === 'confirm' ? li.querySelector('.cms-manage-danger')
          : what === 'up' || what === 'down' ? li.querySelector(`[data-move="${what}"]:not(:disabled)`) || li.querySelector('[data-move]:not(:disabled)')
          : what ? li.querySelector(`[data-action="${what}"]`) : null;
      }
      (f || (what === 'add' ? add : null) || list.querySelector('button:not(:disabled)') || add).focus();
    }

    // ── Changes (all in the working copy) ────────────────────────────────
    function move(id, index, dir) {
      const label = env.cardLabel(id);
      if (!workspace.moveCard(id, index)) return;
      const n = keys().length;
      const at = keys().indexOf(id.split('.').pop());
      env.onChanged();
      draw(id, dir || 'up');
      setStatus(`Moved “${label}” to position ${at + 1} of ${n}.`);
    }
    // What has focus now, to put it back after a redraw: [card id, control].
    function focused() {
      const a = document.activeElement;
      const li = a && a.closest ? a.closest('.cms-manage-row') : null;
      if (!li || !dialog.contains(li)) return [null, null];
      return [li.dataset.id, a.dataset.move || a.dataset.action || (a.classList.contains('cms-manage-danger') ? 'confirm' : null)];
    }
    function activate(id) {
      const live = workspace.component(target) || {};
      const others = keys().filter(k => k !== id.split('.').pop());
      const outKey = content.newKey(live.title, others);
      const label = env.cardLabel(id);
      if (!workspace.activate(id, outKey)) { setStatus('Couldn’t switch cards. Try again.'); return; }
      env.onChanged();
      draw(target, 'edit');
      setStatus(`“${label}” is now the active ${NAMES[target].one} in your draft; “${live.title}” was saved. Visitors see the change after you save and publish.`);
    }
    function remove(id) {
      const label = env.cardLabel(id);
      const key = id.split('.').pop();
      const kept = { list: listId(), key, component: workspace.component(id), index: keys().indexOf(key) };
      confirming = null;
      if (!workspace.removeCard(id)) return;
      undo = kept;
      env.onChanged();
      draw(null, 'add');
      // Undo puts the card back exactly as it was (with any unsaved edits).
      const back = button('Undo', 'cms-drawer-ghost cms-manage-undo', () => {
        if (!undo || undo !== kept) return;
        undo = null;
        const again = workspace.addCard(kept.list, kept.key, kept.component, kept.index);
        if (!again) { setStatus('Couldn’t bring the card back.'); return; }
        env.onChanged();
        draw(again, 'delete');
        setStatus(`“${label}” is back.`);
      });
      setStatus(`“${label}” was deleted from the draft.`, back);
    }
    function addCard() {
      const taken = keys();
      if (taken.length >= limit()) { setStatus(`You can have up to ${limit()} ${target === content.CAROUSEL ? 'carousel cards' : 'saved cards'}. Delete one to add another.`); return; }
      let id;
      if (target === content.CAROUSEL) id = newCarouselCard();
      else {
        const live = workspace.component(target) || {};
        const name = target === 'home.spotlight' ? 'New spotlight card' : 'New featured card';
        id = workspace.addCard(content.savedList(target), content.newKey(name, taken), { title: name, cta: live.cta || 'Play Now', href: live.href || (env.games[0] && env.games[0].path) });
      }
      if (!id) { setStatus('Couldn’t add a card. Try again.'); return; }
      env.onChanged();
      close(false);
      env.openEditor(id);
    }
    // A new carousel card at the end: the current category (or Arcade), and
    // the first live game not in the carousel yet.
    function newCarouselCard() {
      const taken = workspace.order(content.CAROUSEL);
      if (taken.length >= content.LIMITS.carousel) return null;
      const used = taken.map(k => (workspace.component(content.CAROUSEL + '.' + k) || {}).href);
      const game = env.games.find(g => used.indexOf(g.path) < 0) || env.games[0];
      if (!game) return null;
      const category = env.home.carouselCategory() || 'Arcade';
      return workspace.addCard(content.CAROUSEL, content.newKey(game.name, taken), { title: game.name.slice(0, 40), category: content.CATEGORIES.indexOf(category) >= 0 ? category : 'Arcade', href: game.path });
    }

    // ── Drag to reorder (the handle; keyboard users have Move up / down) ──
    let drag = null;
    function startDrag(e, li, id) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      const handle = e.currentTarget;
      const rows = [...list.querySelectorAll('.cms-manage-row:not([data-active])')];
      drag = { id, li, rows, from: rows.indexOf(li), to: rows.indexOf(li), y: e.clientY, pointer: e.pointerId, handle };
      li.classList.add('is-dragging');
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
      handle.addEventListener('pointermove', onDrag);
      handle.addEventListener('pointerup', endDrag, { once: true });
      handle.addEventListener('pointercancel', endDrag, { once: true });
    }
    function onDrag(e) {
      if (!drag || e.pointerId !== drag.pointer) return;
      const dy = e.clientY - drag.y;
      drag.li.style.transform = `translateY(${dy}px)`;
      // The new position: how many other cards are above the dragged one's middle.
      const mid = drag.li.getBoundingClientRect().top + drag.li.offsetHeight / 2;
      const others = drag.rows.filter(r => r !== drag.li);
      const to = others.filter(r => { const b = r.getBoundingClientRect(); return b.top + b.height / 2 < mid; }).length;
      if (to !== drag.to) {
        drag.to = to;
        // Mark the card it lands next to.
        const near = to > drag.from ? others[to - 1] : others[to];
        drag.rows.forEach(r => r.classList.toggle('is-target', r === near && to !== drag.from));
      }
    }
    function endDrag() {
      if (!drag) return;
      const d = drag;
      d.handle.removeEventListener('pointermove', onDrag);
      d.handle.removeEventListener('pointerup', endDrag);
      d.handle.removeEventListener('pointercancel', endDrag);
      drag = null;
      d.li.style.transform = '';
      d.li.classList.remove('is-dragging');
      d.rows.forEach(r => r.classList.remove('is-target'));
      if (d.to !== d.from) move(d.id, d.to);
    }

    // ── Open / close, keyboard ───────────────────────────────────────────
    let opener = null;
    function open(which, from) {
      if (!NAMES[which]) return;
      target = which;
      overlay.dataset.list = which;
      confirming = null; undo = null;
      opener = from || null;
      overlay.hidden = false;
      document.documentElement.classList.add('cms-publish-open');
      setStatus('');
      draw();
    }
    function close(returnFocus) {
      if (overlay.hidden) return;
      overlay.hidden = true;
      target = null; confirming = null; undo = null;
      document.documentElement.classList.remove('cms-publish-open');
      if (returnFocus) { if (opener && opener.isConnected) opener.focus(); else env.returnFocus(); }
    }
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (confirming) { const id = confirming; confirming = null; draw(id, 'delete'); } else close(true);
      }
      if (e.key === 'Tab') {                                     // focus stays in the dialog
        const all = [...dialog.querySelectorAll('button')].filter(b => !b.disabled && b.offsetParent !== null);
        if (!all.length) { e.preventDefault(); return; }
        const i = all.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); all[all.length - 1].focus(); }
        else if (!e.shiftKey && i === all.length - 1) { e.preventDefault(); all[0].focus(); }
      }
    });
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(true); });

    return {
      open,
      // The carousel's "Add card" tile: add at the end and open the editor.
      addCarouselCard() {
        const id = newCarouselCard();
        if (id) { env.onChanged(); env.openEditor(id); }
        return id;
      },
      isOpen: () => !overlay.hidden,
      refresh: () => { if (!overlay.hidden && !drag) draw(...focused()); },
      destroy() { overlay.remove(); document.documentElement.classList.remove('cms-publish-open'); }
    };
  }

  cms.manage = { create };
})();
