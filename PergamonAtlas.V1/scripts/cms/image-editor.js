// The card editor's image section (CMS milestone M5): one per card whose
// field schema lists an image slot (content.cardFields, type 'image').
//
//   Desktop / Phone   each layout keeps its own zoom and position
//                     (scripts/cms/images.js); the phone follows the desktop
//                     framing until it is given its own.
//   stage             a copy of the real card, drawn by the homepage's own
//                     code and styles (PergamonHome.sample) at that layout's
//                     size, with the whole picture faded around it and the
//                     crop outlined. Drag (or arrow keys) to move the
//                     picture; the zoom slider scales it.
//   file              upload or replace (a private draft image), revert to
//                     the saved image; the slot's own fields (description,
//                     the spotlight's edge colour) from the schema's `parts`.
//
// Framing changes are drawn live (on the stage and on the page's card) and
// go into the working copy when the gesture ends. Created by drawer.js:
//   imageEditor.create({ field, cardId, workspace, content, images, store,
//     home, commit(id), setProblem(key, msg), busyChanged(), onForbidden() })
//   → { element, refresh(), clearProblems(), busy(), destroy() }
(function () {
  'use strict';
  const cms = window.PergamonCMS = window.PergamonCMS || {};

  // The sizes the stage draws a card at: the homepage's areas on a
  // 1440-pixel desktop screen and on a 390-pixel phone (styles/home.css
  // decides everything else, including which layout applies).
  const LAYOUTS = {
    desktop: { label: 'Desktop', upper: 896, lower: 1392, tile: 198, note: 'Desktop card, as on a 1440-pixel screen' },
    phone: { label: 'Phone', upper: 358, lower: 358, tile: 200, note: 'Phone card, as on a 390-pixel screen' }
  };
  const ICONS = {
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 15v4h14v-4"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    minus: '<path d="M6 12h12"/>',
    plus: '<path d="M12 6v12M6 12h12"/>',
    move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>'
  };
  const svg = (name, cls) => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(className, text, icon) {
    const b = el('button', className);
    b.type = 'button';
    if (icon) b.innerHTML = svg(icon, 'cms-image-icon');
    if (text) b.append(el('span', '', text));
    return b;
  }
  let uidCount = 0;
  const uid = p => `${p}-${++uidCount}`;
  let lastLayout = null;                       // the tab the next card opens on

  function create(env) {
    const { field, cardId, workspace, content, images, store, home } = env;
    const type = content.cardType(cardId);
    const isTile = type === 'tile';
    // First time: the layout visitors get on this screen. The homepage switches
    // at 640px of content, which is a screen up to 672px wide (16px gutters);
    // measured from the screen, since the docked drawer narrows the page.
    if (!lastLayout) lastLayout = document.documentElement.clientWidth <= 672 ? 'phone' : 'desktop';
    let layout = lastLayout;
    let dead = false;
    let uploading = false;
    let built = null;              // the stage's card copy and its geometry
    let drag = null;               // pointer gesture in progress
    let live = null;               // framing being shown but not yet in the working copy
    let frameRequest = 0;

    const art = () => { const c = workspace.component(cardId); return c && c.art ? c.art : null; };
    const savedArt = () => { const c = workspace.savedComponent(cardId); return c && c.art ? c.art : null; };
    const fit = () => images.fitOf(art() || { fit: field.fit });
    const current = () => images.framing(art(), layout, type);
    const sourceKey = a => (a && a.source ? (a.source.media ? 'media:' + a.source.media : 'static:' + a.source.static) : '');

    // ── Markup ────────────────────────────────────────────────────────────
    const root = el('section', 'cms-image');
    const headingId = uid('cms-image-title');
    root.setAttribute('aria-labelledby', headingId);
    const head = el('div', 'cms-image-head');
    const heading = el('h3', 'cms-image-title', field.label); heading.id = headingId;
    const tabs = el('div', 'cms-image-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Framing for');
    const stageId = uid('cms-image-stage');
    const tabButtons = {};
    Object.keys(LAYOUTS).forEach(key => {
      const b = el('button', 'cms-image-tab', LAYOUTS[key].label);
      b.type = 'button';
      b.id = uid('cms-image-tab');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', stageId);
      b.dataset.layout = key;
      b.addEventListener('click', () => setLayout(key));
      tabButtons[key] = b;
      tabs.append(b);
    });
    tabs.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const next = layout === 'desktop' ? 'phone' : 'desktop';
      setLayout(next);
      tabButtons[next].focus();
    });
    head.append(heading, tabs);

    const stage = el('div', 'cms-image-stage');
    stage.id = stageId;
    stage.tabIndex = 0;
    stage.setAttribute('role', 'application');
    stage.setAttribute('aria-roledescription', 'image framing');
    const helpId = uid('cms-image-help');
    stage.setAttribute('aria-describedby', helpId);
    const canvas = el('div', 'cms-image-canvas');
    const ghost = el('img', 'cms-image-ghost');
    ghost.alt = '';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.draggable = false;
    const frame = el('div', 'cms-image-frame');
    frame.setAttribute('aria-hidden', 'true');
    const empty = el('p', 'cms-image-empty');
    stage.append(canvas, empty);

    const caption = el('p', 'cms-image-caption');
    caption.id = helpId;
    const announce = el('p', 'pa-visually-hidden');
    announce.setAttribute('aria-live', 'polite');

    const zoomRow = el('div', 'cms-image-zoom');
    const zoomId = uid('cms-image-zoom');
    const zoomLabel = el('label', 'cms-image-zoom-label', 'Zoom'); zoomLabel.htmlFor = zoomId;
    const zoomOut = button('cms-image-step', '', 'minus'); zoomOut.setAttribute('aria-label', 'Zoom out');
    const zoomIn = button('cms-image-step', '', 'plus'); zoomIn.setAttribute('aria-label', 'Zoom in');
    const zoom = el('input', 'cms-image-range');
    zoom.type = 'range'; zoom.id = zoomId; zoom.step = '0.01';
    const zoomValue = el('output', 'cms-image-zoom-value');
    zoomValue.htmlFor = zoomId;
    zoomRow.append(zoomLabel, zoomOut, zoom, zoomIn, zoomValue);

    const tools = el('div', 'cms-image-tools');
    const resetButton = button('cms-image-link', 'Reset framing');
    const matchButton = button('cms-image-link', 'Match Desktop');
    const followNote = el('p', 'cms-image-follow');
    tools.append(followNote, resetButton, matchButton);

    const fileRow = el('div', 'cms-image-file');
    const fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = images.ACCEPT.join(',');
    fileInput.hidden = true;
    fileInput.tabIndex = -1;
    const uploadButton = button('cms-drawer-secondary cms-image-upload', 'Upload image', 'upload');
    const revertButton = button('cms-drawer-ghost cms-image-revert', 'Revert to previous image', 'undo');
    fileRow.append(uploadButton, revertButton, fileInput);
    const meta = el('p', 'cms-image-meta');
    const message = el('p', 'cms-image-message');
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    const partsBox = el('div', 'cms-image-parts');

    root.append(head, stage, caption, announce, zoomRow, tools, fileRow, meta, message, partsBox);

    // ── Stage: the card copy, the faded picture, the crop ─────────────────
    function build() {
      const a = art();
      const m = a ? home.artModel(a) : null;
      const key = layout + '|' + (m && m.src ? m.src : a ? 'missing' : 'none');
      if (built && built.key === key) return;
      built = null;
      canvas.replaceChildren();
      const sample = home.sample(cardId);
      if (!sample) return;
      sample.art(a);
      const card = sample.element;
      card.removeAttribute('href');
      card.removeAttribute('aria-labelledby');
      card.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
      const shell = el('div', 'home cms-image-shell');
      shell.inert = true;
      shell.setAttribute('aria-hidden', 'true');
      const L = LAYOUTS[layout];
      const area = el('div', isTile ? 'home-lower' : 'home-upper');
      area.style.width = (isTile ? L.lower : L.upper) + 'px';
      let host = area;
      if (isTile) card.style.width = L.tile + 'px';
      else { host = el('div', 'home-banners'); area.append(host); }
      host.append(card);
      shell.append(area);
      canvas.append(ghost, shell, frame);
      if (!isTile) {
        // Desktop banners are fixed-height rows; phone cards size to their content.
        const rows = getComputedStyle(host).gridTemplateRows.split(/\s+/).map(parseFloat);
        host.style.gridTemplateRows = 'auto';
        const h = rows[cardId === 'home.spotlight' ? 1 : 0];
        if (layout === 'desktop' && h > 0) card.style.height = h + 'px';
      }
      const boxEl = isTile ? card.querySelector('.home-art') : card;
      const s = shell.getBoundingClientRect(), c = card.getBoundingClientRect(), b = boxEl.getBoundingClientRect();
      built = {
        key, sample, shell,
        card: { x: c.left - s.left, y: c.top - s.top, width: c.width, height: c.height },
        box: { x: b.left - s.left, y: b.top - s.top, width: b.width, height: b.height },
        natural: m && m.width && m.height ? { width: m.width, height: m.height } : null,
        src: m && m.src ? m.src : null,
        failed: false,
        k: 1
      };
      ghost.onload = ghost.onerror = null;
      if (built.src) {
        const mine = built;
        ghost.onload = () => {
          if (built !== mine) return;
          mine.natural = { width: ghost.naturalWidth, height: ghost.naturalHeight };
          place(live || current());
          controls();
        };
        ghost.onerror = () => { if (built === mine) { mine.failed = true; controls(); } };
        if (ghost.getAttribute('src') !== built.src) ghost.src = built.src;
        else if (ghost.complete && ghost.naturalWidth) built.natural = { width: ghost.naturalWidth, height: ghost.naturalHeight };
      } else {
        ghost.removeAttribute('src');
      }
      scale();
    }

    // Fit the card, plus a margin of picture around it, into the drawer.
    function scale() {
      if (!built) return;
      const c = built.card;
      const mx = Math.max(16, c.width * 0.1), my = Math.max(20, c.height * 0.22);
      built.view = { x: c.x - mx, y: c.y - my, width: c.width + 2 * mx, height: c.height + 2 * my };
      const avail = (stage.clientWidth || 340) - 20;           // inside the stage's padding
      const maxH = window.matchMedia('(max-width: 900px)').matches ? 190 : 250;
      const k = Math.min(avail / built.view.width, maxH / built.view.height, 1.2);
      built.k = k;
      canvas.style.width = Math.round(built.view.width * k) + 'px';
      canvas.style.height = Math.round(built.view.height * k) + 'px';
      built.shell.style.transform = `translate(${-built.view.x * k}px, ${-built.view.y * k}px) scale(${k})`;
      const bx = built.box;
      Object.assign(frame.style, {
        left: (bx.x - built.view.x) * k + 'px', top: (bx.y - built.view.y) * k + 'px',
        width: bx.width * k + 'px', height: bx.height * k + 'px'
      });
      place(live || current());
    }

    // The faded whole picture, where the card draws it.
    function place(f) {
      if (!built || !built.src || !built.natural || built.failed) { ghost.hidden = true; return; }
      const r = images.imageRect(f, built.box, built.natural);
      const k = built.k, v = built.view, bx = built.box;
      ghost.hidden = false;
      Object.assign(ghost.style, {
        left: (bx.x + r.left - v.x) * k + 'px', top: (bx.y + r.top - v.y) * k + 'px',
        width: r.width * k + 'px', height: r.height * k + 'px'
      });
    }

    // Draw a framing that isn't in the working copy yet (or, with null, the working copy again).
    function show(f) {
      live = f;
      const a = f ? images.setFraming(art(), layout, f, type) : art();
      if (built) built.sample.art(a);
      home.previewArt(cardId, a);
      place(f || current());
      zoomText(f || current());
    }
    function showSoon(f) {
      live = f;
      if (frameRequest) return;
      frameRequest = requestAnimationFrame(() => { frameRequest = 0; if (!dead) show(live); });
    }

    function commit(next, note) {
      if (frameRequest) { cancelAnimationFrame(frameRequest); frameRequest = 0; }
      live = null;
      workspace.setField(cardId, 'art', next || undefined);
      env.commit(cardId);
      if (note) announce.textContent = note;
      refresh();
    }
    function commitFraming(f, note) { commit(images.setFraming(art(), layout, f, type), note); }

    const canFrame = () => !!(built && built.src && built.natural && !built.failed && art() && !uploading);

    // ── Pointer: drag the picture (the page and drawer don't scroll meanwhile) ──
    stage.addEventListener('pointerdown', e => {
      if (!canFrame() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      stage.focus({ preventScroll: true });
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: current(), to: null };
      stage.classList.add('is-dragging');
    });
    stage.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      e.preventDefault();
      const k = built.k;
      drag.to = images.moved(drag.from, (e.clientX - drag.x) / k, (e.clientY - drag.y) / k, built.box, built.natural);
      showSoon(drag.to);
    });
    function endDrag(e, keep) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const to = drag.to;
      drag = null;
      stage.classList.remove('is-dragging');
      if (keep && to) commitFraming(to, position(to));
      else show(null);
    }
    stage.addEventListener('pointerup', e => endDrag(e, true));
    stage.addEventListener('pointercancel', e => endDrag(e, false));
    stage.addEventListener('lostpointercapture', e => endDrag(e, true));

    // Keyboard: arrows move (Shift: further), + / − zoom.
    stage.addEventListener('keydown', e => {
      if (!canFrame()) return;
      const step = e.shiftKey ? 32 : 8;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[e.key]) {
        e.preventDefault();
        const to = images.moved(current(), moves[e.key][0], moves[e.key][1], built.box, built.natural);
        commitFraming(to, position(to));
      } else if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') {
        e.preventDefault();
        stepZoom(e.key === '-' || e.key === '_' ? -0.1 : 0.1);
      }
    });
    const position = f => `${Math.round(f.x)}% across, ${Math.round(f.y)}% down, zoom ${f.zoom.toFixed(2)}×`;

    // ── Zoom ─────────────────────────────────────────────────────────────
    function zoomText(f) { zoomValue.textContent = f.zoom.toFixed(2) + '×'; }
    function stepZoom(delta) {
      const range = images.ZOOM[fit()];
      const f = current();
      const z = Math.min(range.max, Math.max(range.min, Math.round((f.zoom + delta) * 10) / 10));
      if (z === f.zoom) return;
      commitFraming(Object.assign({}, f, { zoom: z }), `Zoom ${z.toFixed(2)}×`);
    }
    zoom.addEventListener('input', () => { if (canFrame()) showSoon(Object.assign({}, current(), { zoom: Number(zoom.value) })); });
    zoom.addEventListener('change', () => { if (canFrame()) commitFraming(Object.assign({}, current(), { zoom: Number(zoom.value) })); });
    zoomOut.addEventListener('click', () => stepZoom(-0.1));
    zoomIn.addEventListener('click', () => stepZoom(0.1));

    resetButton.addEventListener('click', () => commit(images.resetFraming(art(), layout, type), `${LAYOUTS[layout].label} framing reset`));
    matchButton.addEventListener('click', () => commit(images.matchDesktop(art()), 'The phone now uses the desktop framing'));

    function setLayout(next) {
      if (next === layout) return;
      if (drag) endDrag(null, false);
      layout = lastLayout = next;
      refresh();
    }

    // ── File: upload, replace, revert ────────────────────────────────────
    function setMessage(text, kind) { message.textContent = text || ''; message.dataset.kind = kind || ''; }
    uploadButton.addEventListener('click', () => { if (!uploading) fileInput.click(); });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!file || uploading) return;
      uploading = true;
      env.busyChanged();
      const name = file.name.length > 40 ? file.name.slice(0, 37) + '…' : file.name;
      setMessage(`Uploading ${name}…`, 'busy');
      controls();
      let result;
      try { result = await store.upload(file, field.recommendedWidth); }
      catch (e) { result = { error: 'The upload didn’t finish. Nothing was changed; try again.' }; }
      uploading = false;
      env.busyChanged();
      if (result.error) {
        if (!dead) { setMessage(result.error, 'error'); controls(); }
        if (result.code === 'PT403') env.onForbidden();
        return;
      }
      // Into the working copy even if the drawer moved on to another card meanwhile.
      const c = workspace.component(cardId);
      workspace.setField(cardId, 'art', images.replaceSource(c && c.art, result.mediaId, field.fit));
      env.commit(cardId);
      if (dead) return;
      const ready = `New image ready (${result.width} × ${result.height}). It stays private until published.`;
      setMessage([ready].concat(result.warnings || []).join(' '), result.warnings && result.warnings.length ? 'warn' : 'success');
      refresh();
    });
    revertButton.addEventListener('click', () => {
      commit(savedArt(), 'Previous image restored');
      setMessage('Previous image restored.', '');
    });

    // ── The slot's own fields (schema `parts`) ───────────────────────────
    let parts = [];
    function buildParts() {
      partsBox.replaceChildren();
      parts = [];
      (field.parts || []).forEach(part => {
        const wrap = el('div', 'cms-field');
        const inputId = uid('cms-field');
        const errorId = uid('cms-field-error');
        const lab = el('label', 'cms-field-label', part.label); lab.htmlFor = inputId;
        const error = el('p', 'cms-field-error'); error.id = errorId; error.hidden = true;
        const hint = part.hint ? el('p', 'cms-field-hint', part.hint) : null;
        const row = { part, wrap, error };
        const input = el('input', 'cms-field-input');
        input.type = 'text'; input.id = inputId;
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('aria-describedby', errorId);
        row.input = input;
        if (part.type === 'color') {
          input.maxLength = 7; input.spellcheck = false;
          input.classList.add('cms-image-hex');
          const swatch = el('input', 'cms-image-swatch');
          swatch.type = 'color';
          swatch.setAttribute('aria-label', `${part.label}: colour picker`);
          row.swatch = swatch;
          const line = el('div', 'cms-image-color');
          line.append(swatch, input);
          wrap.append(lab, line);
          swatch.addEventListener('input', () => { input.value = swatch.value.toUpperCase(); applyPart(row); });
        } else {
          input.maxLength = part.max;
          const counter = el('span', 'cms-field-count');
          counter.setAttribute('aria-hidden', 'true');
          row.counter = counter;
          lab.append(counter);
          wrap.append(lab, input);
        }
        if (hint) wrap.append(hint);
        wrap.append(error);
        input.addEventListener('input', () => applyPart(row));
        input.addEventListener('blur', () => { if (input.value !== input.value.trim()) input.value = input.value.trim(); });
        partsBox.append(wrap);
        parts.push(row);
      });
    }
    function partProblem(row, problem) {
      row.error.textContent = problem || '';
      row.error.hidden = !problem;
      if (problem) row.input.setAttribute('aria-invalid', 'true'); else row.input.removeAttribute('aria-invalid');
      env.setProblem('art.' + row.part.key, problem);
    }
    function applyPart(row) {
      const value = row.input.value.trim();
      if (row.counter) row.counter.textContent = `${value.length} / ${row.part.max}`;
      const problem = content.checkField(row.part, value);
      partProblem(row, problem);
      const a = art();
      if (problem || !a) return;
      if (row.swatch) row.swatch.value = value.toLowerCase();
      const next = JSON.parse(JSON.stringify(a));
      next[row.part.key] = row.part.type === 'color' ? value.toUpperCase() : value;
      workspace.setField(cardId, 'art', next);
      env.commit(cardId);
    }
    function fillParts() {
      const a = art();
      parts.forEach(row => {
        const shown = !!a && (!row.part.fit || images.fitOf(a) === row.part.fit);
        if (row.wrap.hidden !== !shown) row.wrap.hidden = !shown;
        if (!shown) { if (!row.error.hidden) partProblem(row, null); return; }
        let value = typeof a[row.part.key] === 'string' ? a[row.part.key] : '';
        if (row.part.type === 'color' && !value) value = '#0A0806';    // the card's colour when none is set (styles/home.css)
        if (document.activeElement !== row.input && row.error.hidden) row.input.value = value;
        if (row.swatch && !row.swatch.matches(':focus') && /^#[0-9a-fA-F]{6}$/.test(row.input.value)) row.swatch.value = row.input.value.toLowerCase();
        if (row.counter) row.counter.textContent = `${row.input.value.trim().length} / ${row.part.max}`;
      });
    }

    // ── Controls follow the state ────────────────────────────────────────
    function describe(a) {
      if (!a) return 'No image yet: the card shows a placeholder.';
      if (a.source && a.source.static) {
        const m = home.artModel(a);
        const size = m && m.width ? ` · ${m.width} × ${m.height}` : '';
        return `Built-in image · ${a.source.static.split('/').pop()}${size}`;
      }
      const entry = store.get(a.source.media);
      if (!entry) return 'Uploaded image · loading…';
      if (entry.missing) return 'This image couldn’t be found. Upload a replacement.';
      const n = built && built.natural;
      const size = n ? ` · ${n.width} × ${n.height}` : '';
      return `Uploaded image${size} · ${entry.expires ? 'private until published' : 'published'}`;
    }

    function controls() {
      const a = art();
      const ok = canFrame();
      const f = current();
      const range = images.ZOOM[fit()];
      Object.keys(tabButtons).forEach(key => {
        const on = key === layout;
        tabButtons[key].setAttribute('aria-selected', String(on));
        tabButtons[key].tabIndex = on ? 0 : -1;
        tabButtons[key].disabled = !a;
      });
      stage.setAttribute('aria-labelledby', `${headingId} ${tabButtons[layout].id}`);
      stage.setAttribute('aria-disabled', String(!ok));
      stage.classList.toggle('can-frame', ok);
      empty.textContent = !a ? 'No image yet' : built && built.failed ? 'This image couldn’t be loaded' : built && built.src && !built.natural ? 'Loading image…' : !built || !built.src ? 'This image couldn’t be found' : '';
      empty.hidden = !empty.textContent || !!(a && built && built.src && built.natural && !built.failed);
      caption.textContent = a
        ? `${LAYOUTS[layout].note}. Drag the picture, or use the arrow keys, to choose what shows inside the outline.`
        : `${LAYOUTS[layout].note}. Upload an image to replace the placeholder.`;
      zoom.min = String(range.min); zoom.max = String(range.max);
      if (!live) zoom.value = String(Math.min(range.max, Math.max(range.min, f.zoom)));
      zoom.disabled = zoomIn.disabled = zoomOut.disabled = !ok;
      if (ok) { zoomIn.disabled = f.zoom >= range.max; zoomOut.disabled = f.zoom <= range.min; }
      if (!live) zoomText(f);
      resetButton.disabled = !ok;
      const phoneOwn = layout === 'phone' && !!a && !images.follows(a);
      matchButton.hidden = !phoneOwn;
      matchButton.disabled = !ok;
      followNote.textContent = !a ? '' : layout === 'desktop'
        ? (images.follows(a) ? 'The phone uses this framing too.' : 'The phone has its own framing.')
        : (images.follows(a) ? 'Following the desktop framing. Move or zoom to give the phone its own.' : 'The phone has its own framing.');
      uploadButton.querySelector('span').textContent = uploading ? 'Uploading…' : a ? 'Replace image' : 'Upload image';
      uploadButton.disabled = uploading;
      const changed = sourceKey(a) !== sourceKey(savedArt());
      revertButton.hidden = !changed;
      revertButton.disabled = uploading;
      meta.textContent = describe(a);
      root.setAttribute('aria-busy', String(uploading));
    }

    function refresh() {
      if (dead) return;
      build();
      if (built && !drag) built.sample.art(art());
      if (!drag) place(current());
      controls();
      fillParts();
    }

    const resize = window.ResizeObserver ? new ResizeObserver(() => { if (!dead) scale(); }) : null;
    if (resize) resize.observe(stage);
    buildParts();

    return {
      element: root,
      refresh,
      busy: () => uploading,
      // Discard: forget field errors (the values come back from the working copy).
      clearProblems() { parts.forEach(row => partProblem(row, null)); setMessage(''); },
      destroy() {
        dead = true;
        if (drag) endDrag(null, false);
        if (frameRequest) cancelAnimationFrame(frameRequest);
        if (resize) resize.disconnect();
        parts.forEach(row => env.setProblem('art.' + row.part.key, null));
      }
    };
  }

  cms.imageEditor = { create, LAYOUTS };
})();
