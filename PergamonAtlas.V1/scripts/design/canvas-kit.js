// Canvas design: the elements every Atlas editing canvas builds (buttons, the
// round actions on a selected item, icons). Appearance only; the rest of the
// design is styles/canvas-kit.css. Used by both editing engines' decorations
// and by the pages around them; it knows none of them.
//
//   PergamonDesign.canvasKit.icon(name)    a 24px-grid stroked icon
//   .button({ label, icon, kind, iconOnly, title })   kind: 'tool' (default) |
//                                          'primary' | 'secondary' | 'danger'
//   .action(kind)                          kind: 'edit' | 'remove'
(function () {
  'use strict';
  const NS = window.PergamonDesign = window.PergamonDesign || {};
  const ICONS = {
    add: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    fit: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
    grid: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/>',
    reset: '<path d="M4 4v5h5"/><path d="M4.6 14a8 8 0 1 0 1.2-7.4L4 9"/>',
    edit: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    remove: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    import: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4 20h16"/>',
    export: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 20h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    link: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
  };
  const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
  function icon(name) {
    const s = document.createElement('span');
    s.className = 'ck-icon';
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = svg(name);
    return s;
  }
  function button(o) {
    const b = document.createElement('button'), label = document.createElement('span');
    b.type = 'button';
    b.className = `ck-button ck-button--${o.kind || 'tool'} pa-type-button-small`;
    if (o.icon) b.append(icon(o.icon));
    label.className = o.iconOnly ? 'pa-visually-hidden' : 'ck-button-label';
    label.textContent = o.label;
    b.append(label);
    if (o.iconOnly || o.title) b.title = o.title || o.label;
    return b;
  }
  function action(kind) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ck-action ck-action--' + kind;
    b.innerHTML = svg(kind);
    return b;
  }
  NS.canvasKit = { icon, button, action };
})();
