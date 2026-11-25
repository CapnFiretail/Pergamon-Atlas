// The administrator controls of the shared header: Atlas Studio, Atlas Handbook
// and Admin Mode, in that order, before the header's own actions. The single
// source of them, on every page: the shared header (scripts/layout.js) loads this
// file, and styles/admin-header.css, only after the server has confirmed an
// administrator (scripts/admin-access.js); a sign-out removes them at once.
// Visitors never download either.
//
// Studio and Handbook are links. Admin Mode follows the page: where the page has
// an editor (scripts/cms/admin.js, which says so through
// PergamonAdmin.provideEditor) the control is the editor's; anywhere else, while
// it loads, or if it couldn't, it says so and does nothing.
//
//   PergamonAdminHeader.sampleHtml(state)  the controls' markup, for the Handbook:
//                                          'ready' | 'on' | 'unavailable'
(function () {
  'use strict';
  const access = window.PergamonAdmin;
  if (!access || window.PergamonAdminHeader) return;
  const ICONS = {
    studio: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
    handbook: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 7.5h6"/>',
    admin: '<path d="M12 3 5 6v5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6z"/><path d="m9 12 2 2 4-4"/>'
  };
  const LINKS = [{ id: 'studio', href: '/studio/', label: 'Atlas Studio' }, { id: 'handbook', href: '/handbook/', label: 'Atlas Handbook' }];
  const STATES = {
    none: { label: 'Admin Mode: not available on this page', note: 'This page can’t be edited in Admin Mode yet.' },
    loading: { label: 'Admin Mode: loading', note: 'Admin Mode is loading.' },
    failed: { label: 'Admin Mode: couldn’t load', note: 'Admin Mode couldn’t load. Reload the page to try again.' },
    ready: { label: 'Admin Mode' }
  };
  const svg = name => `<svg class="pa-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  const ADMIN_INNER = svg('admin') + '<span class="pa-admin-dot" aria-hidden="true"></span>';
  const here = window.location.pathname.replace(/\/?$/, '/');

  let nodes = [];                      // the controls in the header now
  let note = null;

  function link(l) {
    const a = document.createElement('a');
    a.className = `pa-icon-button pa-admin-control pa-${l.id}-link`;
    a.href = l.href;
    a.setAttribute('aria-label', l.label);
    a.dataset.tip = l.label;
    if (here === l.href) a.setAttribute('aria-current', 'page');
    a.innerHTML = svg(l.id);
    return a;
  }
  // The Admin Mode control, as the page's editor (or its absence) has it. Once the
  // editor is ready it names the control itself (on or off, and the view).
  function showState(button) {
    const key = access.editor() || 'none', state = STATES[key];
    button.dataset.state = key;
    if (key === 'ready') {
      button.removeAttribute('aria-disabled');
      closeNote();
      if ('named' in button.dataset) return;
    } else button.setAttribute('aria-disabled', 'true');
    button.setAttribute('aria-label', state.label);
    button.dataset.tip = state.label;
  }
  function adminButton() {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'cms-admin-button';
    b.className = 'pa-icon-button pa-admin-control cms-admin-button';
    b.innerHTML = ADMIN_INNER;
    b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled') !== 'true') return;
      if (note) closeNote(); else openNote(b);
    });
    return b;
  }

  // Why the control does nothing: also for touch, where there are no tooltips.
  function openNote(button) {
    note = document.createElement('p');
    note.className = 'pa-admin-note';
    note.setAttribute('role', 'status');
    note.textContent = STATES[button.dataset.state].note;
    const r = button.getBoundingClientRect();
    note.style.top = `${Math.round(r.bottom + 10)}px`;
    document.body.append(note);
    const left = Math.round(r.left + r.width / 2 - note.offsetWidth / 2);
    note.style.left = `${Math.max(12, Math.min(left, document.documentElement.clientWidth - note.offsetWidth - 12))}px`;
  }
  function closeNote() { if (note) { note.remove(); note = null; } }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNote(); });
  document.addEventListener('pointerdown', e => { if (note && !note.contains(e.target) && !e.target.closest('#cms-admin-button')) closeNote(); }, true);
  window.addEventListener('resize', closeNote);

  function show() {
    const actions = document.querySelector('.pa-header .pa-actions');
    if (!actions || nodes.length) return;
    const button = adminButton();
    nodes = LINKS.map(link).concat(button);
    actions.prepend(...nodes);
    actions.setAttribute('data-admin', '');
    showState(button);
    access.setAdminButton(button);
  }
  function hide() {
    closeNote();
    access.setAdminButton(null);
    nodes.forEach(n => n.remove());
    nodes = [];
    document.querySelectorAll('.pa-actions[data-admin]').forEach(n => n.removeAttribute('data-admin'));
  }
  access.onChange(ok => (ok ? show() : hide()));
  access.onEditor(() => { if (nodes.length) showState(nodes[nodes.length - 1]); });

  window.PergamonAdminHeader = {
    sampleHtml(state) {
      const s = state === 'unavailable' ? STATES.none : STATES.ready;
      return LINKS.map(l => `<a class="pa-icon-button pa-admin-control" role="img" aria-label="${l.label}">${svg(l.id)}</a>`).join('') +
        `<span class="pa-icon-button pa-admin-control cms-admin-button${state === 'on' ? ' is-active' : ''}" role="img" aria-label="${s.label}"${state === 'unavailable' ? ' aria-disabled="true"' : ''}>${ADMIN_INNER}</span>`;
    }
  };
  if (access.isAdmin()) show();
})();
