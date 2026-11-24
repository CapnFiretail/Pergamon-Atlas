// Node canvas geometry (pure; no DOM; also runs in Node). Everything is in
// world units; a view { x, y, z } puts a world point on screen at
// (world × z + x, world × z + y), in pixels from the canvas's top-left.
//
//   NODE { w, h }, STEP     a node's size; what moves snap to
//   DOT                     spacing of the dotted grid
//   PORTS                   'top' 'right' 'bottom' 'left'
//   portPoint(node, port)   the middle of that edge
//   facingPorts(a, b)       the natural pair of ports between two nodes
//   nearestPort(node, p), hitNode(nodes, p)
//   curve(a, aPort, b, bPort)   { d, mid }: a curve leaving each end square to
//                           its edge (a port of null: a free end, e.g. the pointer)
//   arrow(point, port)      an arrowhead's points, its tip on the port
//   bounds(nodes), fit(bounds, size, { padding, insets }), zoomAt(view, z, p)
//   toWorld(view, p), toScreen(view, p), snap(n)
(function (root) {
  'use strict';
  const NODE = Object.freeze({ w: 192, h: 72 });
  const STEP = 12, DOT = 24;
  const ZOOM = Object.freeze({ min: 0.25, max: 2 });
  const PORTS = Object.freeze(['top', 'right', 'bottom', 'left']);
  const OUT = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const snap = n => Math.round(n / STEP) * STEP || 0;
  const r1 = n => Math.round(n * 10) / 10;

  function portPoint(node, port) {
    const o = OUT[port];
    return { x: node.x + NODE.w / 2 + o[0] * NODE.w / 2, y: node.y + NODE.h / 2 + o[1] * NODE.h / 2 };
  }
  function facingPorts(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    // Sideways when they are further apart across than down, for their shape.
    if (Math.abs(dx) / NODE.w >= Math.abs(dy) / NODE.h) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
    return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
  }
  function nearestPort(node, p) {
    let best = null, bd = Infinity;
    PORTS.forEach(port => {
      const q = portPoint(node, port), d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) { bd = d; best = port; }
    });
    return { port: best, distance: bd };
  }
  // Last drawn is on top.
  function hitNode(nodes, p) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (p.x >= n.x && p.x <= n.x + NODE.w && p.y >= n.y && p.y <= n.y + NODE.h) return n;
    }
    return null;
  }

  function curve(a, aPort, b, bPort) {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const k = clamp(d * 0.45, 24, 180);
    const oa = OUT[aPort] || [0, 0], ob = OUT[bPort] || [0, 0];
    const c1 = { x: a.x + oa[0] * k, y: a.y + oa[1] * k }, c2 = { x: b.x + ob[0] * k, y: b.y + ob[1] * k };
    return {
      d: `M${r1(a.x)} ${r1(a.y)}C${r1(c1.x)} ${r1(c1.y)} ${r1(c2.x)} ${r1(c2.y)} ${r1(b.x)} ${r1(b.y)}`,
      mid: { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 }
    };
  }
  function arrow(p, port) {
    const [ox, oy] = OUT[port], len = 10, half = 5;
    const bx = p.x + ox * len, by = p.y + oy * len;
    return [[p.x, p.y], [bx + oy * half, by + ox * half], [bx - oy * half, by - ox * half]].map(q => q.map(r1).join(',')).join(' ');
  }

  function bounds(nodes) {
    if (!nodes.length) return null;
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) + NODE.w - x, h: Math.max(...ys) + NODE.h - y };
  }
  // The view showing all of `b` in `size`, never enlarged past 100%.
  function fit(b, size, o = {}) {
    const p = o.padding === undefined ? 48 : o.padding;
    const i = Object.assign({ top: 0, right: 0, bottom: 0, left: 0 }, o.insets);
    const w = Math.max(1, size.w - i.left - i.right), h = Math.max(1, size.h - i.top - i.bottom);
    if (!b) return { x: i.left + w / 2, y: i.top + h / 2, z: 1 };
    const z = clamp(Math.min((w - 2 * p) / b.w, (h - 2 * p) / b.h, 1), ZOOM.min, ZOOM.max);
    return { x: i.left + w / 2 - (b.x + b.w / 2) * z, y: i.top + h / 2 - (b.y + b.h / 2) * z, z };
  }
  const toWorld = (v, p) => ({ x: (p.x - v.x) / v.z, y: (p.y - v.y) / v.z });
  const toScreen = (v, p) => ({ x: p.x * v.z + v.x, y: p.y * v.z + v.y });
  // Zoom to z, keeping the screen point p where it is.
  function zoomAt(v, z, p) {
    const nz = clamp(z, ZOOM.min, ZOOM.max), w = toWorld(v, p);
    return { x: p.x - w.x * nz, y: p.y - w.y * nz, z: nz };
  }

  const api = { NODE, STEP, DOT, ZOOM, PORTS, OUT, snap, portPoint, facingPorts, nearestPort, hitNode, curve, arrow, bounds, fit, toWorld, toScreen, zoomAt };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PergamonCanvas = root.PergamonCanvas || {}; root.PergamonCanvas.geometry = api; }
})(typeof window !== 'undefined' ? window : globalThis);
