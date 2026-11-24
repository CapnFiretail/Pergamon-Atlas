// Card grid (Atlas component library): a container that shows every item of a
// collection at once, in as many columns as its width has room for. It owns the
// layout, the empty state and screen-reader announcements, and grows with its
// items; it never builds or inspects them.
//
//   const g = PergamonComponents.cardGrid({ label, emptyMessage? });
//   g.element            the container to place
//   g.setItems(items)    [{ key, element, label }]: element is placed as built
//                        (e.g. a content card)
//   g.setTail(node)      a trailing element after the items (null removes it)
//   g.has(key), g.count()
//
// Styles: styles/components/card-grid.css (the container is its own size
// container `card-grid`: smaller cards and gaps at 640px and narrower).
(function () {
  'use strict';
  const NS = window.PergamonComponents = window.PergamonComponents || {};
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function cardGrid(opts) {
    const o = opts || {};
    const frame = el('div', 'card-grid-frame');
    const section = el('section', 'card-grid');
    if (o.label) section.setAttribute('aria-label', o.label);
    const list = el('ul', 'card-grid-list');
    list.setAttribute('role', 'list');             // kept when list styling is off
    const empty = el('p', 'card-grid-empty', o.emptyMessage || 'Nothing here yet.');
    const status = el('p', 'pa-visually-hidden');
    status.setAttribute('aria-live', 'polite');
    section.append(list, empty, status);
    frame.append(section);

    let items = [], tail = null, announced = null;
    function render() {
      list.replaceChildren(...items.map(it => { const li = el('li', 'card-grid-item'); li.append(it.element); return li; }), ...(tail ? [tail] : []));
      list.hidden = !items.length && !tail;
      empty.hidden = !list.hidden;
      // Announced when it changes, not when it is first drawn.
      const text = items.length ? `${items.length} ${items.length === 1 ? 'card' : 'cards'}` : empty.textContent;
      if (announced !== null && text !== announced) status.textContent = text;
      announced = text;
    }
    render();
    return {
      element: frame,
      section,
      setItems(next) { items = (next || []).slice(); render(); },
      setTail(node) { tail = null; if (node) { tail = el('li', 'card-grid-item'); tail.append(node); } render(); },
      has: key => items.some(it => it.key === key),
      count: () => items.length
    };
  }
  NS.cardGrid = cardGrid;
})();
