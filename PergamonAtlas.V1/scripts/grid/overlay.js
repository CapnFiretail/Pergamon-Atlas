// Atlas Grid editing overlay: the decorations an editor draws over a grid
// (scripts/grid/renderer.js). Every element is a grid item on the same lines
// as the widgets, so nothing is positioned in pixels and no decoration
// changes a widget's geometry. It only draws; scripts/grid/interaction.js
// decides what is selected and what is previewed.
//
//   const ov = PergamonGrid.overlay(canvas, { label, actions })
//     canvas  the renderer's canvas (grid.element())
//     label   (placement) → accessible name for a widget, e.g. "Hero"
//     actions [{ kind: 'edit' | 'remove', label(placement), shown(placement), run(placement) }]
//             round controls on the selected widget (pointer only: the page
//             offers the same commands to the keyboard; none by default)
//   ov.sync(layout)               a focusable hit area over every widget
//   ov.select(id | null)          outline, eight handles and a size badge
//   ov.preview(placement | null, state)   'valid' | 'invalid' | 'minimum'
//   ov.source(id | null)          mark the widget being edited
//   ov.hit(id), ov.selected(), ov.destroy()
// Styles: styles/grid-editor.css, over the design all editing canvases share
// (styles/canvas-kit.css, scripts/design/canvas-kit.js).
(function () {
  'use strict';
  const NS = window.PergamonGrid = window.PergamonGrid || {};

  const HANDLES = [
    ['top-left', 'Resize from the top-left corner'], ['top', 'Resize from the top edge'], ['top-right', 'Resize from the top-right corner'],
    ['right', 'Resize from the right edge'], ['bottom-right', 'Resize from the bottom-right corner'], ['bottom', 'Resize from the bottom edge'],
    ['bottom-left', 'Resize from the bottom-left corner'], ['left', 'Resize from the left edge']
  ];

  function place(node, w) {
    const s = node.style;
    s.setProperty('--atlas-col', w.col);
    s.setProperty('--atlas-row', w.row);
    s.setProperty('--atlas-cols', w.cols);
    s.setProperty('--atlas-rows', w.rows);
  }
  const size = w => `${w.cols} × ${w.rows}`;
  const where = w => `column ${w.col}, row ${w.row}`;

  function overlay(canvas, opts) {
    opts = opts || {};
    const label = typeof opts.label === 'function' ? opts.label : w => w.type;
    const kit = window.PergamonDesign && window.PergamonDesign.canvasKit;
    const hits = new Map();
    let layout = { widgets: [] }, selectedId = null;

    const selection = document.createElement('div');
    selection.className = 'atlas-edit-item atlas-edit-selection';
    selection.hidden = true;
    const badge = document.createElement('span');
    badge.className = 'atlas-edit-badge ck-tag';
    selection.append(badge);
    for (const [name, text] of HANDLES) {
      const h = document.createElement('span');
      h.className = 'atlas-edit-handle ck-handle';
      h.dataset.handle = name;
      h.setAttribute('role', 'img');
      h.setAttribute('aria-label', text);
      h.title = text;
      selection.append(h);
    }
    const tools = document.createElement('div');
    tools.className = 'atlas-edit-actions';
    // A press here is never a press on the canvas, and focus stays on the widget.
    tools.addEventListener('pointerdown', e => e.stopPropagation());
    tools.addEventListener('mousedown', e => e.preventDefault());
    const actions = (kit && opts.actions || []).map(a => {
      const b = kit.action(a.kind);
      b.tabIndex = -1;
      b.addEventListener('click', () => { const w = layout.widgets.find(x => x.id === selectedId); if (w) a.run(w); });
      tools.append(b);
      return { a, b };
    });
    selection.append(tools);
    const preview = document.createElement('div');
    preview.className = 'atlas-edit-item atlas-edit-preview';
    preview.hidden = true;
    const previewLabel = document.createElement('span');
    previewLabel.className = 'atlas-edit-badge ck-tag';
    preview.append(previewLabel);
    canvas.append(selection, preview);
    canvas.classList.add('atlas-edit-canvas', 'ck-scope');

    function describe(w) {
      return `${label(w)}, ${where(w)}, ${w.cols} by ${w.rows}${w.id === selectedId ? ', selected' : ''}`;
    }
    function drawSelection() {
      const w = layout.widgets.find(x => x.id === selectedId);
      selection.hidden = !w;
      if (!w) return;
      place(selection, w);
      badge.textContent = `${size(w)} · col ${w.col}, row ${w.row}`;
      for (const { a, b } of actions) {
        b.hidden = !a.shown(w);
        b.title = a.label(w);
        b.setAttribute('aria-label', b.title);
      }
    }

    return {
      sync(next) {
        layout = next;
        const keep = new Set();
        for (const w of next.widgets) {
          keep.add(w.id);
          let hit = hits.get(w.id);
          if (!hit) {
            hit = document.createElement('div');
            hit.className = 'atlas-edit-item atlas-edit-hit';
            hit.dataset.widgetId = w.id;
            hit.tabIndex = 0;
            hit.setAttribute('role', 'button');
            hits.set(w.id, hit);
            canvas.insertBefore(hit, selection);
          }
          place(hit, w);
          hit.setAttribute('aria-label', describe(w));
          hit.setAttribute('aria-pressed', String(w.id === selectedId));
        }
        for (const [id, hit] of hits) if (!keep.has(id)) { hit.remove(); hits.delete(id); }
        if (selectedId && !keep.has(selectedId)) selectedId = null;
        drawSelection();
      },
      select(id) {
        selectedId = id && hits.has(id) ? id : null;
        for (const [hid, hit] of hits) {
          hit.classList.toggle('is-selected', hid === selectedId);
          hit.setAttribute('aria-pressed', String(hid === selectedId));
          const w = layout.widgets.find(x => x.id === hid);
          if (w) hit.setAttribute('aria-label', describe(w));
        }
        drawSelection();
      },
      preview(w, state) {
        preview.hidden = !w;
        if (!w) { preview.removeAttribute('data-state'); return; }
        place(preview, w);
        preview.dataset.state = state || 'valid';
        previewLabel.textContent = `${size(w)} · col ${w.col}, row ${w.row}` + (state === 'invalid' ? ' · blocked' : state === 'minimum' ? ' · minimum' : '');
      },
      source(id) { for (const [hid, hit] of hits) hit.classList.toggle('is-source', hid === id); selection.classList.toggle('is-editing', !!id); },
      hit: id => hits.get(id) || null,
      selected: () => selectedId,
      destroy() { for (const hit of hits.values()) hit.remove(); hits.clear(); selection.remove(); preview.remove(); canvas.classList.remove('atlas-edit-canvas', 'ck-scope'); }
    };
  }

  NS.overlay = overlay;
})();
