// Atlas Studio controls shared by its sections. Styles: styles/studio.css; the
// icons and buttons are the canvas design's (scripts/design/canvas-kit.js).
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
  const { icon, button } = window.PergamonDesign.canvasKit;
  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
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
