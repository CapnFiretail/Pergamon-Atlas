// Glide: a row of cards that moves slowly and continuously, with arrows that
// step one card at a time. Generic (no homepage knowledge), so other Atlas
// sections can reuse it:
//
//   const g = PergamonGlide.create(viewport, { prev, next, hoverArea, onStep, prepareCopy });
//   g.setItems(elements, keep, extras)  show these card elements (keep: stay
//                               at the current card instead of the first;
//                               extras: elements after the cards, such as an
//                               "add" tile, shown only while fixed, never copied)
//   g.setEmpty(node)            no cards: show this message instead
//   g.step(±1)                  move one card position (the arrows call this)
//   g.show(element)             bring a card fully into view (no animation)
//   g.hold(reason, on)          pause/resume for an outside reason
//   g.fix(on)                   fixed row: no copies and no gliding; the arrows
//                               scroll between its ends (editing, where
//                               targets must not move or repeat)
//   g.loops()                   whether the row moves
//
// Seamless loop without duplicate controls: the strip is the cards followed
// by inert copies of them (aria-hidden, never focused, clicked or read out).
// The offset always wraps into the real cards' range [0, one set); a copy is
// pixel-identical to the card it stands in for, so the wrap is invisible.
// Movement is a transform on the strip: the DOM doesn't change while it
// glides.
//
// The row glides when its cards fill it (or there are enough of them to
// read as a row: MIN_LOOP). A short row, e.g. a category with two cards on a
// wide screen, stands still. It stops for hover, keyboard focus, touch,
// an outside hold, prefers-reduced-motion, a hidden tab, or being offscreen;
// speed eases down and back up rather than snapping.
(function () {
  'use strict';

  const SPEED = 28;              // px per second, left to right
  const EASE_UP_S = 0.6;         // speed easing back up (time constant)
  const EASE_DOWN_S = 0.15;      // and down, when something stops it
  const STEP_S = 0.42;           // one-card arrow move
  const TOUCH_RESUME_MS = 2500;  // after a swipe or tap, before gliding again
  const DRAG_START = 6;          // px before a touch counts as a drag
  const MIN_LOOP = 4;            // this many cards glide even when they all fit

  const reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const mod = (v, m) => ((v % m) + m) % m;

  function create(viewport, opts) {
    opts = opts || {};
    const strip = document.createElement('div');
    strip.className = 'pa-glide-strip';
    strip.setAttribute('role', 'list');
    viewport.classList.add('pa-glide');
    viewport.replaceChildren(strip);

    let items = [];              // the real card wrappers
    let extras = [];             // shown after them while fixed (never copied)
    let fixed = false;           // fix(true): no copies, no gliding
    let scrollable = false;      // fixed and wider than the view
    let maxOffset = 0;           // fixed: the furthest the row can scroll
    let looping = false;
    let step = 0;                // card width + gap
    let setWidth = 0;            // one full set of cards (items.length * step)
    let offset = 0;              // strip px at the viewport's left edge, in [0, setWidth)
    let speed = 0;               // current px/s (eased toward the target)
    let pending = 0;             // px still to travel for an arrow step / snap
    let pendingRate = 0;         // px/s for that travel
    const holds = new Set();
    let inView = true;
    let raf = 0;
    let last = 0;
    let touchTimer = 0;

    const reduced = () => !!(reduceQuery && reduceQuery.matches);

    // ── Layout ──────────────────────────────────────────────────────────
    function copyOf(item) {
      const c = item.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      c.inert = true;
      c.classList.add('is-copy');
      c.removeAttribute('role');
      c.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
      c.querySelectorAll('[data-cms-id]').forEach(n => n.removeAttribute('data-cms-id'));
      c.querySelectorAll('a, button').forEach(n => n.setAttribute('tabindex', '-1'));
      if (opts.prepareCopy) opts.prepareCopy(c);     // e.g. drop controls added to the real card
      return c;
    }

    // Build the strip for the current items, at `position` (in cards, may be
    // fractional). A redraw that keeps its place carries on moving smoothly.
    function build(position, keep) {
      if (strip.parentNode !== viewport) viewport.replaceChildren(strip);
      const shown = fixed ? items.concat(extras) : items;
      strip.replaceChildren(...shown);
      const gap = parseFloat(getComputedStyle(strip).columnGap) || 0;
      step = shown.length ? shown[0].getBoundingClientRect().width + gap : 0;
      setWidth = items.length * step;
      const view = viewport.clientWidth;
      looping = !fixed && items.length > 1 && step > 0 && (setWidth - gap > view + 1 || items.length >= MIN_LOOP);
      if (looping) {
        // Enough copies to fill the row from any point in the first set.
        const sets = Math.max(1, Math.ceil(view / setWidth));
        for (let s = 0; s < sets; s++) strip.append(...items.map(copyOf));
      }
      maxOffset = fixed ? Math.max(0, shown.length * step - gap - view) : 0;
      scrollable = fixed && maxOffset > 1;
      pending = 0;
      if (!keep || fixed) speed = 0;      // a new row starts still and eases up
      offset = looping ? mod((position || 0) * step, setWidth) : scrollable ? clamp((position || 0) * step) : 0;
      draw();
      viewport.classList.toggle('is-looping', looping);
      if (opts.prev) opts.prev.disabled = !(looping || scrollable);
      if (opts.next) opts.next.disabled = !(looping || scrollable);
      schedule();
    }

    const moves = () => looping || scrollable;
    const clamp = v => Math.max(0, Math.min(maxOffset, v));
    const position = () => (moves() && step ? (offset + pending) / step : 0);

    function wrap() { if (looping && setWidth) offset = mod(offset, setWidth); else if (scrollable) offset = clamp(offset); }
    function draw() { strip.style.transform = moves() && offset ? `translate3d(${-offset}px, 0, 0)` : ''; }

    // ── Motion ──────────────────────────────────────────────────────────
    const active = () => moves() && inView && !document.hidden;
    const autoAllowed = () => looping && active() && !holds.size && !reduced();

    function schedule() {
      const needed = active() && (pending !== 0 || autoAllowed() || speed > 0);
      if (needed && !raf) { last = 0; raf = requestAnimationFrame(frame); }
      if (!needed && raf) { cancelAnimationFrame(raf); raf = 0; }
      if (!active()) speed = 0;
    }

    function frame(t) {
      raf = 0;
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      const target = autoAllowed() ? SPEED : 0;
      speed += (target - speed) * (1 - Math.exp(-dt / (target > speed ? EASE_UP_S : EASE_DOWN_S)));
      if (target === 0 && speed < 0.5) speed = 0;
      // Left to right: the content moves right, so the offset decreases.
      offset -= speed * dt;
      if (pending !== 0) {
        const move = Math.sign(pending) * Math.min(Math.abs(pending), pendingRate * dt);
        offset += move;
        pending -= move;
        if (Math.abs(pending) < 0.25) { offset += pending; pending = 0; }
      }
      wrap();
      draw();
      if (active() && (pending !== 0 || autoAllowed() || speed > 0)) raf = requestAnimationFrame(frame);
    }

    // Travel `delta` px (animated, or at once with reduced motion). A manual
    // move stops the gliding at once, so it lands exactly on a card edge.
    function travel(delta) {
      speed = 0;
      if (scrollable) delta = clamp(offset + pending + delta) - (offset + pending);
      if (!delta) return;
      if (reduced()) { offset += delta; pending = 0; wrap(); draw(); return; }
      pending += delta;
      pendingRate = Math.max(Math.abs(pending) / STEP_S, 200);
      schedule();
    }

    // Distance to the next card edge in a direction (a full card when already on one).
    function toEdge(dir) {
      const k = (offset + pending) / step;
      const near = Math.round(k);
      const onEdge = Math.abs(k - near) < 0.02;
      const target = dir > 0 ? (onEdge ? near + 1 : Math.ceil(k)) : (onEdge ? near - 1 : Math.floor(k));
      return target * step - (offset + pending);
    }

    function stepBy(dir) {
      if (!moves()) return;
      travel(toEdge(dir));
      const at = Math.round((offset + pending) / step);
      if (opts.onStep && items.length) opts.onStep(looping ? mod(at, items.length) : Math.min(at, items.length - 1), items.length);
    }

    // ── Holds: hover, focus, touch, outside ─────────────────────────────
    function hold(reason, on) {
      if (on) holds.add(reason); else holds.delete(reason);
      schedule();
    }

    const hoverArea = opts.hoverArea || viewport;
    hoverArea.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') hold('hover', true); });
    hoverArea.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hold('hover', false); });

    // Touch (and taps on the arrows): stop, then resume after a quiet moment.
    function touchPause() {
      speed = 0;
      hold('touch', true);
      clearTimeout(touchTimer);
      touchTimer = setTimeout(() => hold('touch', false), TOUCH_RESUME_MS);
    }
    hoverArea.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') touchPause(); });

    // Keyboard: a focused card is brought into view and holds the row still.
    viewport.addEventListener('focusin', e => {
      hold('focus', true);
      const item = items.concat(fixed ? extras : []).find(i => i.contains(e.target));
      if (item) reveal(item, true);
    });
    viewport.addEventListener('focusout', e => {
      if (!viewport.contains(e.relatedTarget)) hold('focus', false);
    });
    // overflow: clip can't be scrolled, but where it falls back to hidden,
    // focus() may scroll the row: undo that, the transform positions it.
    viewport.addEventListener('scroll', () => { viewport.scrollLeft = 0; });

    // Swipe: the strip follows the finger, then settles on the nearest card.
    let drag = null;
    let draggedAt = 0;
    viewport.addEventListener('pointerdown', e => {
      if (!moves() || e.pointerType === 'mouse' || !e.isPrimary) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: offset + pending, moved: false };
      pending = 0;
    });
    viewport.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved) {
        if (Math.abs(dx) < DRAG_START || Math.abs(dx) < Math.abs(e.clientY - drag.y)) return;
        drag.moved = true;
        try { viewport.setPointerCapture(e.pointerId); } catch (err) {}
        viewport.classList.add('is-dragging');
      }
      offset = drag.start - dx;
      wrap();
      draw();
      touchPause();
    });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved;
      drag = null;
      viewport.classList.remove('is-dragging');
      if (!moved) return;
      travel(Math.round(offset / step) * step - offset);
      touchPause();
      draggedAt = Date.now();
    }
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
    // The finger lifted on a card after a swipe: that's not a tap.
    viewport.addEventListener('click', e => {
      if (Date.now() - draggedAt < 400) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    // ── Visibility, motion preference, size ─────────────────────────────
    if (window.IntersectionObserver) {
      new IntersectionObserver(entries => {
        inView = entries[entries.length - 1].isIntersecting;
        schedule();
      }).observe(viewport);
    }
    document.addEventListener('visibilitychange', schedule);
    if (reduceQuery) {
      const onChange = () => {
        if (reduced()) { speed = 0; if (pending) { offset += pending; pending = 0; wrap(); draw(); } }
        schedule();
      };
      if (reduceQuery.addEventListener) reduceQuery.addEventListener('change', onChange);
      else if (reduceQuery.addListener) reduceQuery.addListener(onChange);
    }
    if (window.ResizeObserver) {
      let width = viewport.clientWidth;
      new ResizeObserver(() => {
        if (viewport.clientWidth === width) return;
        width = viewport.clientWidth;
        if (items.length || (fixed && extras.length)) build(position(), true);
      }).observe(viewport);
    }

    // Bring a real card (or, fixed, an extra) fully into view (instant, or
    // animated for keyboard).
    function reveal(item, animate) {
      const i = items.concat(fixed ? extras : []).indexOf(item);
      if (i < 0 || !moves()) return;
      const left = i * step;
      const now = offset + pending;
      const view = viewport.clientWidth;
      // Already fully visible (as the card itself, not a copy)?
      if (left >= now && left + step <= now + view + 1) return;
      let delta = left - now;
      if (looping) {
        if (delta > setWidth / 2) delta -= setWidth;
        if (delta < -setWidth / 2) delta += setWidth;
      } else if (delta > 0) {
        delta = left + step - (parseFloat(getComputedStyle(strip).columnGap) || 0) - view - now;   // right edge in view
      }
      if (animate) travel(delta);
      else { speed = 0; offset = now + delta; pending = 0; wrap(); draw(); }
    }

    if (opts.prev) opts.prev.addEventListener('click', () => stepBy(-1));
    if (opts.next) opts.next.addEventListener('click', () => stepBy(1));

    return {
      setItems(list, keep, more) {
        const at = keep ? position() : 0;
        items = list.slice();
        extras = (more || []).slice();
        build(at, keep);
      },
      setEmpty(node) {
        items = [];
        extras = [];
        looping = false;
        scrollable = false;
        pending = 0;
        viewport.classList.remove('is-looping');
        viewport.replaceChildren(node);
        if (opts.prev) opts.prev.disabled = true;
        if (opts.next) opts.next.disabled = true;
        schedule();
      },
      step: stepBy,
      show: item => reveal(item, false),
      hold,
      // Callers redraw (setItems) after changing this.
      fix(on) { fixed = !!on; },
      loops: () => looping,
      element: strip
    };
  }

  window.PergamonGlide = { create };
})();
