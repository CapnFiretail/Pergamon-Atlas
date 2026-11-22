// Carousel (Atlas component library): a container that shows a row of
// content elements and owns everything about the row — layout, the slow
// glide and the one-step arrows (scripts/glide.js), responsive widths,
// optional filter tabs, optional section switching, the empty state and
// screen-reader announcements. It never builds or inspects its items.
//
//   const c = PergamonComponents.carousel({ sections: [section, …] });
//   c.element  the container to place;  c.start()  once it is in the page
//
//   section = {
//     id, title, icon?   (SVG path markup for the heading),
//     filters?           ['All …', 'A', 'B', …]: tabs; the first shows every
//                        item, the others items whose `facet` equals the name
//     items              [{ key, element, label, facet? }]: element is placed
//                        as built (e.g. a content card); label names it in
//                        announcements
//     emptyMessage       shown when the section has no items
//     emptyTag?          a short tag above that message
//     emptyFilterMessage shown when a filter leaves nothing
//   }
//   One section: no section arrows. No filters: no tabs.
//
//   c.setItems(sectionId, items)  new items, keeping section, filter and position
//   c.reveal(key)        bring an item into view (its section, all items, its place)
//   c.hold(on)           stand still as a fixed row (no copies); while held, a
//   c.setTail(node, sectionId?)  trailing element follows the items (of that
//                        section only, if given; null removes it)
//   c.filter()           the current filter ('' = all)
//
// The moving row repeats its items as inert copies; anything inside an item
// marked data-no-copy (e.g. editing controls) is left out of the copies.
// Styles: styles/components/carousel.css (the container is its own size
// container `carousel`: compact at 640px and narrower, tabs on their own row
// at 900px and narrower).
(function () {
  'use strict';
  const NS = window.PergamonComponents = window.PergamonComponents || {};
  const ICONS = { prev: '<path d="m15 6-6 6 6 6"/>', next: '<path d="m9 6 6 6-6 6"/>' };
  const svg = (paths, cls) => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  let idCount = 0;

  function carousel(opts) {
    const sections = (opts.sections || []).map(sec => Object.assign({}, sec, { items: (sec.items || []).slice() }));
    let sectionIndex = 0;
    let filter = '';
    const multi = sections.length > 1;

    // The container is the size context; the section inside it is the card.
    const frame = el('div', 'home-carousel-frame');
    const section = el('section', 'home-carousel');
    const headingId = `pa-carousel-${++idCount}`;
    section.setAttribute('aria-labelledby', headingId);
    frame.append(section);

    const head = el('div', 'home-carousel-head');
    const h = el('h2', 'home-carousel-title'); h.id = headingId;
    const tabs = el('div', 'home-tabs');
    tabs.setAttribute('role', 'group');
    head.append(h, tabs);
    const prevSection = el('button', 'home-section-button'); prevSection.type = 'button';
    const nextSection = el('button', 'home-section-button'); nextSection.type = 'button';
    if (multi) {
      const sectionNav = el('div', 'home-section-nav');
      prevSection.setAttribute('aria-label', 'Previous section'); prevSection.innerHTML = svg(ICONS.prev, 'home-svg');
      nextSection.setAttribute('aria-label', 'Next section'); nextSection.innerHTML = svg(ICONS.next, 'home-svg');
      sectionNav.append(prevSection, nextSection);
      head.append(sectionNav);
    }

    const body = el('div', 'home-carousel-body');
    const prevCard = el('button', 'home-page-button'); prevCard.type = 'button';
    prevCard.setAttribute('aria-label', 'Previous card'); prevCard.innerHTML = svg(ICONS.prev, 'home-svg');
    const nextCard = el('button', 'home-page-button'); nextCard.type = 'button';
    nextCard.setAttribute('aria-label', 'Next card'); nextCard.innerHTML = svg(ICONS.next, 'home-svg');
    const viewport = el('div', 'home-track');
    body.append(prevCard, viewport, nextCard);

    const status = el('p', 'pa-visually-hidden');
    status.setAttribute('aria-live', 'polite');
    section.append(head, body, status);

    const current = () => sections[sectionIndex];
    const filtered = () => current().items.filter(it => !filter || it.facet === filter);
    let shown = [];                             // the filtered items, as drawn
    let wrappers = new Map();                   // key -> its row wrapper (real items only)

    const glide = window.PergamonGlide.create(viewport, {
      prev: prevCard,
      next: nextCard,
      hoverArea: body,
      // Copies show the item only, never what is marked data-no-copy.
      prepareCopy(copy) { copy.querySelectorAll('[data-no-copy]').forEach(n => n.remove()); },
      onStep(index, count) {
        const it = shown[index];
        if (it) status.textContent = `${it.label}, card ${index + 1} of ${count}`;
      }
    });

    function renderHead() {
      const sec = current();
      h.innerHTML = sec.icon ? svg(sec.icon, 'home-carousel-icon') : '';
      h.append(el('span', '', sec.title));
      const names = sec.filters || [];
      tabs.style.display = names.length < 2 ? 'none' : '';
      tabs.setAttribute('aria-label', `Filter ${sec.id} by category`);
      tabs.replaceChildren(...(names.length < 2 ? [] : names.map((name, i) => {
        const b = el('button', 'home-tab', name);
        b.type = 'button';
        const value = i === 0 ? '' : name;
        b.setAttribute('aria-pressed', String(filter === value));
        b.addEventListener('click', () => selectFilter(value));
        return b;
      })));
      prevSection.disabled = sectionIndex === 0;
      nextSection.disabled = sectionIndex === sections.length - 1;
    }

    // Outside hold: the row stands still without copies, and a trailing
    // element (setTail) follows the items (of one section, if given).
    let held = false;
    let tail = null;                            // { node, section }

    // Draw the current filter's items. `keep` holds the row's position;
    // otherwise it starts again from the first item.
    function renderItems(keep) {
      const sec = current();
      shown = filtered();
      const extras = held && tail && (!tail.section || tail.section === sec.id) ? [tail.node] : [];
      wrappers = new Map();
      if (!shown.length && !extras.length) {
        const message = sec.items.length ? sec.emptyFilterMessage : sec.emptyMessage;
        const empty = el('div', 'home-track-empty');
        if (!sec.items.length && sec.emptyTag) empty.append(el('span', 'home-track-tag', sec.emptyTag));
        empty.append(el('p', '', message));
        glide.setEmpty(empty);
        status.textContent = `${sec.title}: ${message}`;
        return;
      }
      glide.setItems(shown.map(it => {
        const wrap = el('div', 'home-track-item');
        wrap.setAttribute('role', 'listitem');
        wrap.append(it.element);
        wrappers.set(it.key, wrap);
        return wrap;
      }), keep, extras);
      status.textContent = `${sec.title}: ${shown.length} ${shown.length === 1 ? 'card' : 'cards'}`;
    }

    // A new section starts on its first filter.
    function switchSection(delta) {
      const next = sectionIndex + delta;
      if (next < 0 || next >= sections.length) return;
      sectionIndex = next;
      filter = '';
      renderHead();
      renderItems();
    }
    function selectFilter(value) {
      filter = value;
      renderHead();
      renderItems();
    }
    prevSection.addEventListener('click', () => switchSection(-1));
    nextSection.addEventListener('click', () => switchSection(1));

    function start() { renderHead(); renderItems(); }

    function setItems(sectionId, items) {
      const sec = sections.find(s => s.id === sectionId);
      if (!sec) return;
      sec.items = (items || []).slice();
      if (sec === current()) renderItems(true);
    }

    function reveal(key) {
      const target = sections.findIndex(sec => sec.items.some(it => it.key === key));
      if (target < 0) return false;
      if (target !== sectionIndex) { sectionIndex = target; filter = ''; renderHead(); renderItems(); }
      if (!filtered().some(it => it.key === key)) { filter = ''; renderHead(); renderItems(); }
      const wrap = wrappers.get(key);
      if (wrap) glide.show(wrap);
      return true;
    }

    // Stopping shows the real items (not their copies) from the first one,
    // as a fixed row the arrows scroll; restarting redraws the copies from
    // the items as they are now.
    function hold(on) {
      on = !!on;
      if (on === held) return;
      held = on;
      glide.hold('outside', on);
      glide.fix(on);
      renderItems(!on);
    }
    function setTail(node, sectionId) {
      if (node) { node.classList.add('home-track-item'); node.setAttribute('role', 'listitem'); }
      tail = node ? { node, section: sectionId || null } : null;
      if (held) renderItems(true);
    }

    return { element: frame, start, setItems, reveal, hold, setTail, filter: () => filter, section: () => current().id };
  }

  NS.carousel = carousel;
})();
