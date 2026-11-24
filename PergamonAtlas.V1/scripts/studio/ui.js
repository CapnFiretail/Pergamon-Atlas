// Atlas Studio controls shared by its sections. Styles: styles/studio.css.
//
//   PergamonStudio.ui.el(tag, className, text)
//   ui.icon(name)                       a 24px-grid stroked icon
//   ui.button({ label, icon, kind, iconOnly, title })   kind: 'tool' (default) |
//                                       'primary' | 'secondary' | 'danger'
//   ui.segmented(label, [{ value, label }], onChoose)   → { element, set(value) }
//   ui.dialog(host, { title, text, content, actions, wide, focus }) → Promise
//     a modal dialog (the browser's own: focus stays in it, Escape cancels).
//     actions: [{ label, value, kind }]; resolves to the chosen value, or null
//     when cancelled. content may be an element, or (close) => element for a
//     dialog whose content closes it. It lives inside host, so it goes when the
//     section does.
(function () {
  'use strict';
  const ns = window.PergamonStudio = window.PergamonStudio || {};
  const ICONS = {
    add: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    fit: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
    import: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4 20h16"/>',
    export: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 20h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    link: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
  };
  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function icon(name) {
    const s = el('span', 'st-tool-icon');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = `<svg viewBox="0 0 24 24" focusable="false">${ICONS[name] || ''}</svg>`;
    return s;
  }
  function button(o) {
    const b = el('button', `st-button st-button--${o.kind || 'tool'} pa-type-button-small`);
    b.type = 'button';
    if (o.icon) b.append(icon(o.icon));
    b.append(el('span', o.iconOnly ? 'pa-visually-hidden' : 'st-button-label', o.label));
    if (o.iconOnly || o.title) b.title = o.title || o.label;
    return b;
  }
  function segmented(label, options, onChoose) {
    const g = el('div', 'st-segmented');
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', label);
    const buttons = options.map(o => {
      const b = el('button', 'st-segment pa-type-tab', o.label);
      b.type = 'button';
      b.addEventListener('click', () => onChoose(o.value));
      g.append(b);
      return [o.value, b];
    });
    return { element: g, set: v => buttons.forEach(([value, b]) => b.setAttribute('aria-pressed', String(value === v))) };
  }
  let count = 0;
  function dialog(host, o) {
    return new Promise(resolve => {
      const d = el('dialog', 'st-dialog' + (o.wide ? ' st-dialog--wide' : ''));
      const title = el('h2', 'st-dialog-title pa-type-section-title', o.title);
      title.id = 'st-dialog-' + (++count);
      d.setAttribute('aria-labelledby', title.id);
      const box = el('div', 'st-dialog-box');
      let value = null;
      const close = v => { value = v; d.close(); };
      box.append(title);
      (Array.isArray(o.text) ? o.text : o.text ? [o.text] : []).forEach(t => box.append(el('p', 'st-dialog-text pa-type-body-small', t)));
      const content = typeof o.content === 'function' ? o.content(close) : o.content;
      if (content) box.append(content);
      if (o.actions) {
        const row = el('div', 'st-dialog-actions');
        o.actions.forEach(a => {
          const b = button({ label: a.label, kind: a.kind || 'secondary' });
          b.addEventListener('click', () => close(a.value));
          row.append(b);
        });
        box.append(row);
      }
      d.append(box);
      d.addEventListener('keydown', e => e.stopPropagation());          // shortcuts wait
      d.addEventListener('click', e => { if (e.target === d) close(null); });
      d.addEventListener('close', () => { d.remove(); resolve(value); });
      host.append(d);
      d.showModal();
      if (o.focus) { const f = d.querySelector(o.focus); if (f) f.focus(); }
    });
  }

  ns.ui = { el, icon, button, segmented, dialog };
})();
