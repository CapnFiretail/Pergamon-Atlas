// Connections: the Node Library, a searchable dialog of the service definitions
// (registry.js). Resolves to the chosen type, or null.
//   PergamonStudio.connections.library(host) → Promise<type | null>
(function () {
  'use strict';
  const ns = window.PergamonStudio;
  const { el, icon, dialog } = ns.ui;
  const { registry } = ns.connections;

  function library(host) {
    return dialog(host, {
      title: 'Add a node', wide: true, focus: 'input', actions: [{ label: 'Cancel', value: null }],
      content(close) {
        const box = el('div', 'stc-library');
        const field = el('label', 'stc-search');
        const input = el('input', 'st-input');
        input.type = 'search';
        input.placeholder = 'Search services';
        input.autocomplete = 'off';
        field.append(el('span', 'pa-visually-hidden', 'Search services'), icon('search'), input);
        const list = el('ul', 'stc-library-list');
        const none = el('p', 'stc-library-none pa-type-body-small', 'No service matches that. Custom nodes aren’t available yet.');
        const status = el('p', 'pa-visually-hidden');
        status.setAttribute('role', 'status');
        const items = registry.list().map(d => {
          const li = el('li');
          const b = el('button', 'stc-library-item');
          b.type = 'button';
          const logo = el('span', 'stc-logo');
          logo.innerHTML = d.logo;
          const text = el('span', 'stc-library-text');
          text.append(el('span', 'pa-type-item-title', d.name), el('span', 'stc-muted pa-type-caption', `${d.category} · ${d.summary}`));
          b.append(logo, text);
          b.addEventListener('click', () => close(d.type));
          li.append(b);
          list.append(li);
          return { type: d.type, li, b };
        });
        const shown = () => items.filter(i => !i.li.hidden);
        function filter() {
          const found = new Set(registry.search(input.value).map(d => d.type));
          items.forEach(i => { i.li.hidden = !found.has(i.type); });
          none.hidden = found.size > 0;
          if (input.value) status.textContent = `${found.size} ${found.size === 1 ? 'service' : 'services'}`;
        }
        input.addEventListener('input', filter);
        box.addEventListener('keydown', e => {
          const all = shown(), at = all.findIndex(i => i.b === document.activeElement);
          if (e.key === 'Enter' && e.target === input && all.length) { e.preventDefault(); close(all[0].type); }
          else if (e.key === 'ArrowDown' && all.length) { e.preventDefault(); all[Math.min(all.length - 1, at + 1)].b.focus(); }
          else if (e.key === 'ArrowUp' && at >= 0) { e.preventDefault(); (at ? all[at - 1].b : input).focus(); }
        });
        filter();
        box.append(field, list, none, status);
        return box;
      }
    });
  }

  ns.connections.library = library;
})();
