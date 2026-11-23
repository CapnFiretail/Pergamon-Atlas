// Atlas Grid interaction controller: pointer and keyboard editing of a grid
// drawn by scripts/grid/renderer.js, with decorations from
// scripts/grid/overlay.js. Every change goes through the editing engine
// (scripts/grid/editor.js); this file only turns input into its calls.
//
//   const ctl = PergamonGrid.interaction({
//     grid, overlay,
//     env:     () => ({ types, width, … })   the validation environment (the
//                                             caller's policy, e.g. a minimum width)
//     layout:  () => committed layout
//     commit:  layout => …                    record it and re-render, then ctl.refresh()
//     enabled: () => boolean                  false: input is ignored (e.g. stacked)
//     scrollInsets: () => ({ top, bottom })   px of the window covered by fixed or
//                                             sticky bars (default none); automatic
//                                             scrolling starts inside the rest
//     onChange: event => …                    { type: 'select' | 'preview' | 'commit' |
//                                             'reject' | 'cancel', id, proposal?, reason? }
//   });
//   ctl.refresh()   after every render: hit areas and inert content
//   ctl.select(id), ctl.selected(), ctl.cancel(), ctl.active(), ctl.destroy()
//
// Mouse and pen: pressing a widget selects it and dragging (past a few
// pixels) moves it. Touch: tap to select (a touch released without moving),
// then drag; unselected widgets
// keep normal scrolling (their touch-action allows panning; a selected
// widget's and its handles' don't, set before any gesture starts).
// Positions come from the canvas's on-screen rectangle at every event, so
// page scrolling, automatic scrolling and CSS scaling are all accounted for.
// Keyboard (focus a widget): arrows move one cell, Shift + arrows resize
// from the right and bottom edges, Escape cancels or deselects. Delete and
// Backspace do nothing. Widget content is made inert while editing: its
// links and buttons can't be clicked or focused.
(function () {
  'use strict';
  const NS = window.PergamonGrid = window.PergamonGrid || {};
  const E = NS.editor;
  if (!E) return;

  const DRAG_START = 4;        // px of movement before a press becomes a drag
  const HOLD = 0.65;           // hysteresis: a snap changes only past 65% of a cell
  const EDGE = 64;             // px from the window's top or bottom that scrolls
  const SPARE_ROWS = 2;        // rows shown below the pointer while dragging

  function interaction(o) {
    const { grid, overlay } = o;
    const canvas = grid.element();
    const host = canvas.parentElement;
    const enabled = typeof o.enabled === 'function' ? o.enabled : () => true;
    const emit = typeof o.onChange === 'function' ? o.onChange : () => {};
    const insets = typeof o.scrollInsets === 'function' ? o.scrollInsets : () => ({ top: 0, bottom: 0 });
    let selected = null, press = null, tap = null, gesture = null, frame = 0, suppressClick = false;

    // ── Geometry from the screen ────────────────────────────────────────────
    function local(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      const scale = canvas.offsetWidth ? r.width / canvas.offsetWidth : 1;
      const g = grid.geometry();
      return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale, pitch: g.cell + g.gutter, gutter: g.gutter };
    }
    // Snap a position (in cells from the grid's start) to a whole cell,
    // holding the previous one until the pointer is well past the midpoint.
    function snap(f, prev) {
      const n = Math.round(f);
      return prev !== undefined && n !== prev && Math.abs(f - prev) < HOLD ? prev : n;
    }
    const widget = id => o.layout().widgets.find(w => w.id === id);

    // ── Selection ───────────────────────────────────────────────────────────
    function select(id) {
      if (id === selected) return;
      selected = id;
      overlay.select(id);
      emit({ type: 'select', id });
    }

    // ── Gestures ────────────────────────────────────────────────────────────
    // p: where the gesture started, in canvas coordinates (from local()).
    function begin(kind, id, handle, e, p) {
      const w = widget(id);
      const g = { pitch: p.pitch, gutter: p.gutter };
      const edges = { left: (w.col - 1) * g.pitch, right: (w.col + w.cols - 1) * g.pitch - g.gutter, top: (w.row - 1) * g.pitch, bottom: (w.row + w.rows - 1) * g.pitch - g.gutter };
      gesture = {
        kind, id, handle, tx: E.beginGesture(o.layout(), { kind, id, handle, env: o.env() }),
        // Where the pointer held the widget (move) or each edge (resize).
        grab: kind === 'move' ? { x: p.x - edges.left, y: p.y - edges.top } : { left: p.x - edges.left, right: p.x - edges.right, top: p.y - edges.top, bottom: p.y - edges.bottom },
        snapped: {}, client: { x: e.clientX, y: e.clientY }, pointerId: e.pointerId, proposal: null
      };
      canvas.classList.add('is-editing', kind === 'move' ? 'is-moving' : 'is-resizing');
      if (handle) canvas.dataset.handle = handle;
      overlay.source(id);
      update();
      frame = requestAnimationFrame(tick);
    }
    function update() {
      const gs = gesture, p = local(gs.client.x, gs.client.y);
      let target;
      if (gs.kind === 'move') {
        gs.snapped.col = snap((p.x - gs.grab.x) / p.pitch, gs.snapped.col);
        gs.snapped.row = snap((p.y - gs.grab.y) / p.pitch, gs.snapped.row);
        target = { col: gs.snapped.col + 1, row: gs.snapped.row + 1 };
      } else {
        target = {};
        for (const edge of E.HANDLES[gs.handle]) {
          const px = p[edge === 'left' || edge === 'right' ? 'x' : 'y'] - gs.grab[edge];
          // Start edges sit on a cell's start; end edges one gutter before the next.
          const f = edge === 'left' || edge === 'top' ? px / p.pitch : (px + p.gutter) / p.pitch;
          gs.snapped[edge] = snap(f, gs.snapped[edge]);
          target[edge] = gs.snapped[edge] + 1;
        }
      }
      const proposal = gs.tx.update(target);
      gs.proposal = proposal;
      const minimum = Object.values(proposal.clamped).includes('minimum');
      overlay.preview(proposal.widget, !proposal.valid ? 'invalid' : minimum ? 'minimum' : 'valid');
      const pointerRow = Math.floor(Math.max(0, p.y) / p.pitch) + 1;
      grid.setExtent(E.editingExtent(o.layout(), proposal, { pointerRow, spare: SPARE_ROWS }));
      emit({ type: 'preview', id: gs.id, proposal });
    }
    // Scroll gently while the pointer is near the window's top or bottom, and
    // re-read positions afterwards (the canvas moved under the pointer).
    function tick() {
      if (!gesture) return;
      const y = gesture.client.y, inset = insets();
      const top = (inset.top || 0) + EDGE, bottom = window.innerHeight - (inset.bottom || 0) - EDGE;
      let dy = 0;
      if (y > bottom) dy = Math.min(18, Math.ceil((y - bottom) / 4) + 2);
      else if (y < top && window.scrollY > 0) dy = -Math.min(18, Math.ceil((top - y) / 4) + 2);
      if (dy) { window.scrollBy(0, dy); update(); }
      frame = requestAnimationFrame(tick);
    }
    function finish(how) {
      const gs = gesture;
      if (!gs) return;
      gesture = null;
      cancelAnimationFrame(frame);
      const out = how === 'end' ? gs.tx.end() : gs.tx.cancel();
      canvas.classList.remove('is-editing', 'is-moving', 'is-resizing');
      delete canvas.dataset.handle;
      overlay.preview(null);
      overlay.source(null);
      grid.setExtent(null);
      if (out.committed) { o.commit(out.committed); emit({ type: 'commit', id: gs.id, kind: gs.kind }); }
      else emit({ type: out.reason === 'invalid' ? 'reject' : 'cancel', id: gs.id, reason: out.reason, errors: out.errors || [] });
    }

    // ── Pointer events ──────────────────────────────────────────────────────
    function onDown(e) {
      if (!enabled() || e.button > 0 || gesture) return;
      const handle = e.target.closest('.atlas-edit-handle');
      const hit = e.target.closest('.atlas-edit-hit');
      if (handle && selected) {
        e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        begin('resize', selected, handle.dataset.handle, e, local(e.clientX, e.clientY));
        return;
      }
      const id = hit ? hit.dataset.widgetId : null;
      // Touch on empty space or an unselected widget: a tap (de)selects it on
      // release; a moving touch is left to the browser to scroll the page.
      if (e.pointerType === 'touch' && (!hit || id !== selected)) { tap = { id, x: e.clientX, y: e.clientY, pointerId: e.pointerId }; return; }
      if (!hit) { select(null); return; }
      if (e.pointerType !== 'touch') {
        // No default focus handling: it would scroll a tall widget into view
        // between the press and the drag. Focus without scrolling instead.
        e.preventDefault();
        hit.focus({ preventScroll: true });
        select(id);
      }
      // Where it was pressed, in canvas coordinates: correct even if the page
      // scrolls before the drag starts.
      press = { id, x: e.clientX, y: e.clientY, pointerId: e.pointerId, target: hit, e, at: local(e.clientX, e.clientY) };
      hit.setPointerCapture(e.pointerId);
    }
    function onMove(e) {
      if (tap && e.pointerId === tap.pointerId && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) >= DRAG_START) tap = null;
      if (gesture && e.pointerId === gesture.pointerId) { gesture.client = { x: e.clientX, y: e.clientY }; update(); return; }
      if (press && e.pointerId === press.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) >= DRAG_START) {
        const start = press; press = null;
        begin('move', start.id, null, start.e, start.at);
        gesture.client = { x: e.clientX, y: e.clientY };
        update();
      }
    }
    function onUp(e) {
      if (gesture && e.pointerId === gesture.pointerId) { suppressClick = true; finish('end'); }
      // A touch that didn't move: a tap. (Not left to 'click', which browsers
      // skip for a tap that stops a scroll.)
      if (tap && e.pointerId === tap.pointerId && enabled()) select(tap.id);
      press = null; tap = null;
    }
    function onCancel(e) {
      if (gesture && e.pointerId === gesture.pointerId) finish('cancel');
      press = null; tap = null;
    }
    // Clicks select or deselect (mouse, pen, keyboard activation; touch taps
    // are handled on release); a drag's trailing click is ignored.
    function onClick(e) {
      if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
      if (!enabled()) return;
      const hit = e.target.closest('.atlas-edit-hit');
      if (hit) select(hit.dataset.widgetId);
      else if (!e.target.closest('.atlas-edit-selection')) select(null);
    }

    // ── Keyboard ────────────────────────────────────────────────────────────
    const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    function onKey(e) {
      if (e.key === 'Escape') {
        if (gesture) { e.preventDefault(); finish('cancel'); }
        else if (selected && host.contains(document.activeElement)) { e.preventDefault(); select(null); }
        return;
      }
      if (!enabled() || gesture) return;
      const hit = e.target.closest && e.target.closest('.atlas-edit-hit');
      if (!hit || !host.contains(hit)) return;
      const id = hit.dataset.widgetId;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(id); return; }
      const step = ARROWS[e.key];
      if (!step || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      select(id);
      const proposal = e.shiftKey ? E.grow(o.layout(), id, step[0], step[1], o.env()) : E.nudge(o.layout(), id, step[0], step[1], o.env());
      if (proposal.valid && proposal.changed) { o.commit(proposal.layout); emit({ type: 'commit', id, kind: e.shiftKey ? 'resize' : 'move', keyboard: true }); }
      else emit({ type: 'reject', id, reason: proposal.valid ? 'unchanged' : 'invalid', errors: proposal.errors, proposal, keyboard: true });
    }
    function onFocus(e) {
      const hit = e.target.closest && e.target.closest('.atlas-edit-hit');
      if (hit && enabled() && !gesture) select(hit.dataset.widgetId);
    }
    function onLost(e) { if (gesture && e.pointerId === gesture.pointerId) finish('cancel'); }

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('lostpointercapture', onLost);
    canvas.addEventListener('click', onClick, true);
    canvas.addEventListener('focusin', onFocus);
    document.addEventListener('keydown', onKey);

    return {
      refresh() {
        const layout = o.layout();
        overlay.sync(layout);
        // Widget content can't be used while editing (and isn't announced twice).
        for (const w of layout.widgets) { const slot = grid.slot(w.id); if (slot) for (const c of slot.children) c.inert = true; }
        if (selected && !layout.widgets.some(w => w.id === selected)) select(null);
        else overlay.select(selected);
      },
      select: id => select(id || null),
      selected: () => selected,
      active: () => (gesture ? { kind: gesture.kind, id: gesture.id, handle: gesture.handle, proposal: gesture.proposal } : null),
      cancel: () => finish('cancel'),
      destroy() {
        finish('cancel');
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onCancel);
        canvas.removeEventListener('lostpointercapture', onLost);
        canvas.removeEventListener('click', onClick, true);
        canvas.removeEventListener('focusin', onFocus);
        document.removeEventListener('keydown', onKey);
      }
    };
  }

  NS.interaction = interaction;
})();
