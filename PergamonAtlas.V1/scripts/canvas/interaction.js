// Node canvas interaction: pointer, touch, wheel and keyboard input on a canvas
// drawn by renderer.js. It changes only the view and the preview; every change
// to the document goes through the caller's callbacks.
//
//   const ctl = PergamonCanvas.interaction({
//     canvas,                         the renderer
//     editing: () => boolean          false: looking around and selecting only
//     selection: () => selection,  select(selection | null)
//     move(id, { x, y })              a node dragged or nudged (snapped)
//     check(from, to, edgeId?) → '' | why these ends can't be connected
//     connect(from, to)               from, to: { node, port }
//     reconnect(edgeId, end, to)      end: 'source' | 'target'
//     edit(selection), remove(selection)
//     reveal(selection)               pressed without dragging: show its controls
//     say(text)                       announcements
//   });
//   ctl.cancel(), ctl.active(), ctl.destroy()
//
// Follows the Atlas Grid's controller (scripts/grid/interaction.js): pressing
// a node selects it and dragging past a few pixels moves it; by touch, tap to
// select, then drag (an unselected node pans). Arrow keys move the selected
// node; Escape cancels or deselects; Delete and Backspace do nothing.
// Drag a port to connect; or press it (click, tap, Enter) and then choose a node
// or port. Empty canvas, the middle button or two fingers pan; Ctrl / ⌘ + wheel
// or a pinch zooms, a plain wheel pans; + − zoom and 0 fits when the canvas has focus.
(function () {
  'use strict';
  const NS = window.PergamonCanvas = window.PergamonCanvas || {};
  const G = NS.geometry;
  if (!G) return;

  const DRAG_START = 4;        // px of movement before a press becomes a drag
  const SNAP = 30;             // px from a port that catches a connection
  const EDGE = 40;             // px from the canvas's edge that pans while dragging

  function interaction(o) {
    const cv = o.canvas, box = cv.element();
    const fitInsets = o.insets || (() => ({}));
    let press = null;          // a pointer that is down and not yet a drag
    let drag = null;           // { kind: 'pan' | 'move' | 'connect', … }
    let armed = null;          // a port chosen without dragging: { from, edge?, end? }
    let pinch = null, frame = 0, last = null;
    const touches = new Map();

    const target = e => (e.target.closest ? e.target.closest('[data-cv]') : null);
    const nodes = () => cv.model().nodes;
    const node = id => nodes().find(n => n.id === id);
    const edge = id => cv.model().edges.find(x => x.id === id);
    const selected = (kind, id) => { const s = o.selection(); return !!s && s.kind === kind && s.id === id; };
    const say = t => o.say && o.say(t);

    // ── Connecting ────────────────────────────────────────────────────────
    // The fixed end, from a port or from the other end of a connection.
    function startOf(t) {
      if (t.dataset.cv === 'port') return { from: { node: t.dataset.id, port: t.dataset.port } };
      const e = edge(t.dataset.edge), end = t.dataset.end;
      return e && { from: end === 'source' ? e.target : e.source, edge: e.id, end };
    }
    // What a world point would connect to: a port nearby, or the node under it.
    function aim(p) {
      const reach = SNAP / cv.view().z;
      let best = null;
      nodes().forEach(n => { const k = G.nearestPort(n, p); if (k.distance <= reach && (!best || k.distance < best.distance)) best = { node: n, port: k.port, distance: k.distance }; });
      if (best) return best;
      const n = G.hitNode(nodes(), p);
      return n ? { node: n, port: G.nearestPort(n, p).port } : null;
    }
    const check = (c, to) => o.check(c.from, to, c.edge, c.end);
    function previewConnect(c, p) {
      const hit = aim(p);
      const own = hit && hit.node.id === c.from.node;
      if (!hit || own) { c.to = null; cv.preview({ type: 'connect', from: c.from, to: p, edge: c.edge, valid: true }); return; }
      c.to = { node: hit.node.id, port: hit.port };
      const why = check(c, c.to), q = G.portPoint(hit.node, hit.port);
      cv.preview({ type: 'connect', from: c.from, to: { x: q.x, y: q.y, port: hit.port }, target: hit.node.id, edge: c.edge, valid: !why });
    }
    function finishConnect(c, to) {
      if (!to) return say('Not connected.');
      const why = check(c, to);
      if (why) return say(why);
      if (c.edge) o.reconnect(c.edge, c.end, to); else o.connect(c.from, to);
    }
    function arm(c) {
      armed = c;
      cv.preview({ type: 'connect', from: c.from, to: null, edge: c.edge, valid: true });
      say(c.edge ? 'Choose the new node or port. Escape cancels.' : 'Choose a node or port to connect to. Escape cancels.');
    }
    function disarm() { if (!armed) return; armed = null; cv.preview(null); }
    // Complete an armed connection on a node (facing ports) or one of its ports.
    function choose(t) {
      const c = armed, id = t.dataset.id;
      const a = node(c.from.node), b = node(id);
      if (!a || !b) return;
      const port = t.dataset.cv === 'port' ? t.dataset.port : G.facingPorts(a, b)[1];
      const same = c.from.node === id;
      disarm();
      if (same) return say('Not connected.');
      finishConnect(c, { node: id, port });
    }

    // ── Pointers ──────────────────────────────────────────────────────────
    function down(e) {
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, cv.local(e));
        if (touches.size === 2) { startPinch(); return; }
        if (touches.size > 2) return;
      }
      if (press || drag || (e.button !== 0 && e.button !== 1)) return;
      const t = target(e), kind = t && t.dataset.cv;
      if (kind === 'edit' || kind === 'remove') return;         // buttons: their own click
      const p = cv.local(e);
      press = { id: e.pointerId, p, t, kind, button: e.button, touch: e.pointerType === 'touch', wasSelected: !!t && (kind === 'node' || kind === 'edge') && selected(kind, t.dataset.id) };
      last = p;
      if (e.button === 1) e.preventDefault();
      // Mouse and pen: pressing a node selects it, so it can be dragged at once.
      if (!press.touch && e.button === 0 && !armed && kind === 'node' && o.editing() && !press.wasSelected) o.select({ kind: 'node', id: t.dataset.id });
    }
    function begin() {
      const { t, kind, p, button, touch, wasSelected, id } = press;
      const w = G.toWorld(cv.view(), p);
      drag = { kind: 'pan', view: cv.view(), p };
      if (button === 0 && o.editing()) {
        if (kind === 'node' && (!touch || wasSelected) && !armed) {
          const n = node(t.dataset.id);
          if (n) drag = { kind: 'move', id: n.id, dx: w.x - n.x, dy: w.y - n.y, at: { x: n.x, y: n.y } };
        } else if (kind === 'port' || kind === 'edge-end') {
          const c = startOf(t);
          if (c) { disarm(); drag = Object.assign({ kind: 'connect', to: null }, c); }
        }
      }
      try { box.setPointerCapture(id); } catch (err) {}
      box.classList.toggle('is-panning', drag.kind === 'pan');
      if (drag.kind !== 'pan') frame = requestAnimationFrame(autopan);
    }
    function update(p) {
      if (drag.kind === 'pan') { cv.setView({ x: drag.view.x + p.x - drag.p.x, y: drag.view.y + p.y - drag.p.y, z: cv.view().z }); return; }
      const w = G.toWorld(cv.view(), p);
      if (drag.kind === 'move') {
        drag.at = { x: G.snap(w.x - drag.dx), y: G.snap(w.y - drag.dy) };
        cv.preview({ type: 'move', id: drag.id, x: drag.at.x, y: drag.at.y });
      } else previewConnect(drag, w);
    }
    // Near an edge, the canvas moves under the pointer.
    function autopan() {
      if (!drag || drag.kind === 'pan') return;
      const z = cv.size(), push = (v, max) => (v < EDGE ? Math.min(1, (EDGE - v) / EDGE) : v > max - EDGE ? -Math.min(1, (v - max + EDGE) / EDGE) : 0);
      const dx = push(last.x, z.w) * 10, dy = push(last.y, z.h) * 10;
      if (dx || dy) { const v = cv.view(); cv.setView({ x: v.x + dx, y: v.y + dy, z: v.z }); update(last); }
      frame = requestAnimationFrame(autopan);
    }
    function moved(e) {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, cv.local(e));
      if (pinch) { movePinch(); return; }
      if (armed && !press && e.pointerType !== 'touch') { previewConnect(armed, G.toWorld(cv.view(), cv.local(e))); }
      if (!press || e.pointerId !== press.id) return;
      last = cv.local(e);
      if (!drag && Math.hypot(last.x - press.p.x, last.y - press.p.y) >= DRAG_START) begin();
      if (drag) { e.preventDefault(); update(last); }
    }
    function up(e) {
      touches.delete(e.pointerId);
      if (pinch) { if (!touches.size) pinch = null; return; }
      if (!press || e.pointerId !== press.id) return;
      const done = press, d = drag;
      end();
      if (d) {
        if (d.kind === 'move') o.move(d.id, d.at);
        else if (d.kind === 'connect') finishConnect(d, d.to);
        return;
      }
      if (done.button !== 0) return;
      tap(done.t, done.kind);
    }
    // A press that didn't become a drag.
    function tap(t, kind) {
      if (armed) {
        if (kind === 'node' || kind === 'port') choose(t);
        else { disarm(); say('Not connected.'); }
        return;
      }
      if (kind === 'node' || kind === 'edge') { const s = { kind, id: t.dataset.id }; o.select(s); if (o.reveal) o.reveal(s); return; }
      if (kind === 'port' || kind === 'edge-end') { const c = startOf(t); if (c) arm(c); return; }
      o.select(null);
    }
    function end() {
      cancelAnimationFrame(frame);
      if (press) { try { box.releasePointerCapture(press.id); } catch (err) {} }
      if (drag && drag.kind !== 'pan') cv.preview(null);
      box.classList.remove('is-panning');
      press = null; drag = null;
    }
    function lost(e) {
      touches.delete(e.pointerId);
      if (pinch) { if (!touches.size) pinch = null; return; }
      if (press && press.id === e.pointerId) end();
    }

    // ── Two fingers, wheel ────────────────────────────────────────────────
    const spread = () => { const [a, b] = [...touches.values()]; return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) }; };
    function startPinch() { end(); pinch = Object.assign(spread(), { view: cv.view() }); }
    function movePinch() {
      if (touches.size < 2) return;
      const s = spread(), v = G.zoomAt(pinch.view, pinch.view.z * s.d / pinch.d, pinch.mid);
      cv.setView({ x: v.x + s.mid.x - pinch.mid.x, y: v.y + s.mid.y - pinch.mid.y, z: v.z });
    }
    function wheel(e) {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? cv.size().h : 1;
      if (e.ctrlKey || e.metaKey) { cv.zoom(Math.exp(-Math.max(-60, Math.min(60, e.deltaY * unit)) * 0.008), cv.local(e)); return; }
      const v = cv.view(), dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit, dy = (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit;
      cv.setView({ x: v.x - dx, y: v.y - dy, z: v.z });
    }

    // ── Keyboard ──────────────────────────────────────────────────────────
    const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    function key(e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape') {
        if (drag || armed) { e.preventDefault(); e.stopPropagation(); cancel(); say('Cancelled. Nothing changed.'); }
        else if (o.selection()) { e.preventDefault(); const s = o.selection(); o.select(null); cv.focus(s); }
        return;
      }
      const t = target(e), kind = t && t.dataset.cv;
      const step = ARROWS[e.key];
      if (step) {
        e.preventDefault();
        if (drag) return;
        if (kind === 'node' && selected('node', t.dataset.id) && o.editing()) {
          const n = node(t.dataset.id), by = e.shiftKey ? G.STEP * 5 : G.STEP;
          o.move(n.id, { x: G.snap(n.x) + step[0] * by, y: G.snap(n.y) + step[1] * by });
        } else { const v = cv.view(); cv.setView({ x: v.x - step[0] * 48, y: v.y - step[1] * 48, z: v.z }); }
        return;
      }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); cv.zoom(1.25); }
      else if (e.key === '-') { e.preventDefault(); cv.zoom(0.8); }
      else if (e.key === '0') { e.preventDefault(); cv.fit({ insets: fitInsets() }); }
      // SVG controls get no click from the keyboard.
      else if ((e.key === 'Enter' || e.key === ' ') && kind === 'edge') { e.preventDefault(); tap(t, kind); }
    }
    // Buttons: pointer presses are handled above, so only keyboard (and
    // assistive technology) clicks are left, plus the action buttons.
    function click(e) {
      const t = target(e), kind = t && t.dataset.cv;
      if (!kind) return;
      if (kind === 'edit' || kind === 'remove') {
        const sel = t.dataset.edge ? { kind: 'edge', id: t.dataset.edge } : { kind: 'node', id: t.dataset.id };
        disarm();
        (kind === 'edit' ? o.edit : o.remove)(sel);
        return;
      }
      if (e.detail === 0) tap(t, kind);
    }

    function cancel() { end(); disarm(); cv.preview(null); }
    const listeners = [['pointerdown', down], ['pointermove', moved], ['pointerup', up], ['pointercancel', lost], ['keydown', key], ['click', click]];
    listeners.forEach(([n, fn]) => box.addEventListener(n, fn));
    box.addEventListener('wheel', wheel, { passive: false });

    return {
      cancel,
      active: () => !!(drag || armed),
      destroy() {
        cancel();
        listeners.forEach(([n, fn]) => box.removeEventListener(n, fn));
        box.removeEventListener('wheel', wheel);
      }
    };
  }

  NS.interaction = interaction;
})();
