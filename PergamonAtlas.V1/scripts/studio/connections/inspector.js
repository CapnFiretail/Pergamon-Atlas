// Connections: the panel beside the canvas. Read-only details in View, the
// properties in Edit, for the selected node or connection. Fields come from
// registry.js (NODE_FIELDS and a service's own, CONNECTION_FIELDS); a value that
// doesn't pass its check stays in its field with the reason, out of the document.
//
//   const panel = inspector({ document(), update(selection, patch), reconnect(id,
//     end, to), select(selection), remove(selection), settle(), close() });
//   panel.element, panel.show(selection, editing), panel.refresh(), panel.hide()
//   panel.focus()      the first field
//   panel.invalid()    a field holding an unusable value, or null
(function () {
  'use strict';
  const ns = window.PergamonStudio;
  const { el, icon, button } = ns.ui;
  const C = ns.connections, D = C.document, PORTS = window.PergamonCanvas.geometry.PORTS;
  const title = s => s.charAt(0).toUpperCase() + s.slice(1);

  function inspector(o) {
    const root = el('aside', 'stc-panel');
    root.setAttribute('aria-label', 'Details');
    root.hidden = true;
    let sel = null, editing = false, shownKey = null, controls = [], count = 0, redrawList = null;

    const nodeOf = id => o.document().nodes.find(n => n.id === id);
    const edgeOf = id => o.document().connections.find(c => c.id === id);
    const item = () => (sel ? (sel.kind === 'node' ? nodeOf(sel.id) : edgeOf(sel.id)) : null);
    const nameOf = id => { const n = nodeOf(id); return n ? n.name : ''; };
    function directionText(c, d) {
      const a = nameOf(c.source.node), b = nameOf(c.target.node);
      return d === 'forward' ? `${a} → ${b}` : d === 'backward' ? `${b} → ${a}` : d === 'both' ? `${a} ↔ ${b}` : 'No direction';
    }

    // ── Parts ─────────────────────────────────────────────────────────────
    function head(x) {
      const h = el('header', 'stc-panel-head');
      const text = el('div', 'stc-panel-heading');
      let name;
      if (sel.kind === 'node') {
        const def = C.registry.get(x.type);
        const logo = el('span', 'stc-logo');
        logo.innerHTML = def.logo;
        h.append(logo);
        text.append(el('p', 'stc-eyebrow pa-type-label', def.name));
        name = el('h2', 'stc-panel-title pa-type-section-title', x.name);
        controls.push({ refresh: n => { name.textContent = n.name; } });
      } else {
        text.append(el('p', 'stc-eyebrow pa-type-label', 'Connection'));
        name = el('h2', 'stc-panel-title pa-type-section-title');
        controls.push({ refresh: c => { name.textContent = c.name || directionText(c, 'forward'); } });
      }
      text.append(name);
      const close = button({ label: 'Close', icon: 'close', iconOnly: true });
      close.addEventListener('click', o.close);
      h.append(text, close);
      return h;
    }
    function field(f, label, control) {
      const row = el('div', 'st-field');
      const id = `stc-f-${++count}`;
      const top = el('label', 'st-field-label', label);
      top.htmlFor = id;
      control.id = id;
      const error = el('p', 'st-field-error');
      error.id = id + '-e';
      error.hidden = true;
      error.setAttribute('role', 'alert');
      row.append(top, control);
      const describe = [error.id];
      if (f.hint) { const h = el('p', 'st-field-hint', f.hint); h.id = id + '-h'; describe.push(h.id); row.append(h); }
      row.append(error);
      control.setAttribute('aria-describedby', describe.join(' '));
      return { row, error };
    }
    function input(f, read, write) {
      const c = el(f.kind === 'multiline' ? 'textarea' : f.kind === 'choice' ? 'select' : 'input', 'st-input');
      if (f.kind === 'multiline') c.rows = f.max > 500 ? 4 : 3;
      if (f.kind === 'text') c.type = 'text';
      if (f.kind === 'url') { c.type = 'text'; c.inputMode = 'url'; c.spellcheck = false; }
      if (f.max) c.maxLength = f.max;
      c.autocomplete = 'off';
      const { row, error } = field(f, f.label, c);
      const ctl = { control: c, bad: false, refresh: null };
      const mark = why => {
        ctl.bad = !!why;
        error.textContent = why;
        error.hidden = !why;
        c.setAttribute('aria-invalid', String(!!why));
      };
      ctl.refresh = x => {
        if (f.kind === 'choice' && sel.kind === 'edge') {
          const names = f.options.map(v => directionText(x, v));
          if (c.dataset.names !== names.join('|')) {
            c.dataset.names = names.join('|');
            c.replaceChildren(...f.options.map((v, i) => { const op = el('option', '', names[i]); op.value = v; return op; }));
          }
        }
        // While a value can't be used, the field keeps it.
        if (!ctl.bad && c.value !== read(x)) c.value = read(x);
      };
      const typed = () => {
        const why = D.checkField(f, c.value);
        mark(why);
        if (!why) write(c.value);
      };
      c.addEventListener(f.kind === 'choice' ? 'change' : 'input', typed);
      c.addEventListener('blur', () => {
        o.settle();
        // A required field left empty goes back to what it was.
        if (ctl.bad && f.required && !c.value.trim()) { mark(''); const x = item(); if (x) c.value = read(x); }
      });
      controls.push(ctl);
      return row;
    }
    function endpoint(c, end) {
      const wrap = el('div', 'stc-ends');
      const make = (label, options) => {
        const s = el('select', 'st-input');
        options().forEach(([v, t]) => { const op = el('option', '', t); op.value = v; s.append(op); });
        const { row, error } = field({}, label, s);
        wrap.append(row);
        return { s, error };
      };
      const name = end === 'source' ? 'From' : 'To';
      const node = make(name, () => o.document().nodes.map(n => [n.id, n.name]));
      const port = make(`${name}: port`, () => PORTS.map(p => [p, title(p)]));
      const apply = () => {
        const x = item();
        if (!x) return;
        const other = end === 'source' ? x.target : x.source, to = { node: node.s.value, port: port.s.value };
        const why = D.checkConnection(o.document(), other, to, x.id);
        node.error.textContent = why;
        node.error.hidden = !why;
        if (why) refreshEnd(x); else o.reconnect(x.id, end, to);
      };
      const refreshEnd = x => { node.s.value = x[end].node; port.s.value = x[end].port; };
      node.s.addEventListener('change', apply);
      port.s.addEventListener('change', apply);
      controls.push({ refresh: refreshEnd });
      return wrap;
    }
    // A node's connections, each opening it.
    function related() {
      const box = el('section', 'stc-related');
      const h = el('h3', 'pa-type-label stc-muted', 'Connections');
      const list = el('ul');
      box.append(h, list);
      redrawList = n => {
        const cs = D.connectionsOf(o.document(), n.id);
        list.replaceChildren(...(cs.length ? cs.map(c => {
          const li = el('li');
          const b = el('button', 'stc-related-item pa-type-body-small', (c.name ? c.name + ': ' : '') + directionText(c, c.direction === 'none' ? 'forward' : c.direction).replace('→', c.direction === 'none' ? '–' : '→'));
          b.type = 'button';
          b.addEventListener('click', () => o.select({ kind: 'edge', id: c.id }));
          li.append(b);
          return li;
        }) : [el('li', 'stc-muted pa-type-body-small', 'None yet.')]));
      };
      controls.push({ refresh: redrawList });
      return box;
    }
    function details(x) {
      const dl = el('dl', 'stc-details');
      const add = (label, read) => {
        const dt = el('dt', 'pa-type-label stc-muted', label), dd = el('dd', 'pa-type-body-small');
        dl.append(dt, dd);
        controls.push({ refresh: y => { const v = read(y); dt.hidden = dd.hidden = !v; dd.replaceChildren(v || ''); } });
      };
      if (sel.kind === 'node') {
        const def = C.registry.get(x.type);
        add('Description', n => n.description);
        add('Resource', n => {
          if (!n.url) return null;
          const a = el('a', 'stc-link', n.url);
          a.href = n.url;
          if (!n.url.startsWith('/')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; a.append(icon('link'), el('span', 'pa-visually-hidden', ' (opens in a new tab)')); }
          return a;
        });
        add('Notes', n => n.notes);
        def.fields.forEach(f => add(f.label, n => n.props[f.key]));
      } else {
        add('Direction', c => directionText(c, c.direction));
        add('Description', c => c.description);
        add('Notes', c => c.notes);
      }
      return dl;
    }

    function build(x) {
      controls = [];
      redrawList = null;
      const body = el('div', 'stc-panel-body');
      if (!editing) {
        body.append(details(x));
        if (sel.kind === 'node') body.append(related());
      } else {
        const form = el('form', 'stc-form');
        form.noValidate = true;
        form.addEventListener('submit', e => e.preventDefault());
        const current = sel;
        if (sel.kind === 'node') {
          C.NODE_FIELDS.forEach(f => form.append(input(f, n => n[f.key], v => o.update(current, { [f.key]: v }, f.key))));
          C.registry.get(x.type).fields.forEach(f => form.append(input(f, n => n.props[f.key], v => o.update(current, { props: { [f.key]: v } }, 'props.' + f.key))));
        } else {
          form.append(input(C.CONNECTION_FIELDS[0], c => c.name, v => o.update(current, { name: v }, 'name')), endpoint(x, 'source'), endpoint(x, 'target'));
          C.CONNECTION_FIELDS.slice(1).forEach(f => form.append(input(f, c => c[f.key], v => o.update(current, { [f.key]: v }, f.key))));
        }
        body.append(form);
        if (sel.kind === 'node') body.append(related());
        const remove = button({ label: sel.kind === 'node' ? 'Delete node…' : 'Delete connection', kind: 'danger' });
        remove.addEventListener('click', () => o.remove(current));
        body.append(remove);
      }
      root.replaceChildren(head(x), body);
    }

    function refresh() {
      if (!sel) return;
      const x = item();
      if (!x) return hide();
      // Rebuilt for something else, or when the choice of nodes changes.
      const key = [sel.kind, sel.id, editing, sel.kind === 'edge' ? o.document().nodes.map(n => n.id + n.name).join() : ''].join('|');
      if (key !== shownKey) { shownKey = key; build(x); root.scrollTop = 0; }
      controls.forEach(c => c.refresh(x));
    }
    function show(selection, edit) {
      sel = selection;
      editing = edit;
      root.hidden = false;
      refresh();
    }
    function hide() {
      sel = null; shownKey = null; controls = [];
      root.hidden = true;
      root.replaceChildren();
    }
    return {
      element: root, show, hide, refresh,
      isOpen: () => !root.hidden,
      focus() { const f = root.querySelector('.st-input'); if (f) { f.focus(); if (f.select) f.select(); } },
      invalid: () => { const c = controls.find(x => x.bad); return c ? c.control : null; }
    };
  }

  C.inspector = inspector;
})();
