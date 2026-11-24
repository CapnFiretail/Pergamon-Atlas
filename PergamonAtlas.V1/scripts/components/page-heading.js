// Page heading (Atlas component library): the decorative heading of a page: an
// emblem, a divider, a centred title with a ruled subtitle, and a count panel,
// in a double frame. Every part but the title is optional.
//
//   const h = PergamonComponents.pageHeading({ level });
//   h.element            the <header> to place
//   h.apply({ title, subtitle?, emblem?, countLabel? })
//   h.setCount(n | null) the number in the count panel; null: no panel
//   h.setLevel(1 … 6)    the title's heading level (default 2): a page has one
//                        <h1>, so the page decides
//
//   emblem   a name from pageHeading.EMBLEMS, or 'none' (default). Emblems are
//            single-colour shapes drawn in the theme's accent.
//
// Knows nothing about the page it is on or what is counted. It fills the width
// and height it is given, and its layout follows its own width (the size
// container `page-heading`): the count moves under the title at 760px; at 480px
// and narrower the subtitle and the count are left out, and at 330px the
// divider. Long titles are set smaller, then wrap. Styles:
// styles/components/page-heading.css.
(function () {
  'use strict';
  const NS = window.PergamonComponents = window.PergamonComponents || {};
  const EMBLEMS = {
    games: { label: 'Games', mask: '/images/emblems/games.webp' },
    compass: { label: 'Compass', svg: '<path d="M12 1.5 13.6 10.4 22.5 12 13.6 13.6 12 22.5 10.4 13.6 1.5 12 10.4 10.4z"/><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="5.6"/>' }
  };
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const hidden = node => { node.setAttribute('aria-hidden', 'true'); return node; };

  function pageHeading(opts) {
    let level = (opts && opts.level) || 2;
    const root = el('header', 'page-heading-frame');
    const box = el('div', 'page-heading');
    const emblem = hidden(el('div', 'page-heading-emblem'));
    const divider = hidden(el('div', 'page-heading-divider'));
    divider.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 0 14.6 9.4 24 12 14.6 14.6 12 24 9.4 14.6 0 12 9.4 9.4z"/></svg>';
    const text = el('div', 'page-heading-text');
    let title = el('h' + level, 'page-heading-title');
    const sub = el('p', 'page-heading-sub');
    const subText = el('span', 'page-heading-sub-text');
    sub.append(hidden(el('span', 'page-heading-rule')), subText, hidden(el('span', 'page-heading-rule')));
    text.append(title, sub);
    const count = el('p', 'page-heading-count');
    const num = el('span', 'page-heading-count-num');
    const label = el('span', 'page-heading-count-label');
    count.append(num, ' ', label);
    box.append(emblem, divider, text, count);
    root.append(box);

    let n = null;
    function drawCount() {
      count.hidden = n === null || n === undefined;
      num.textContent = count.hidden ? '' : String(n);
      box.toggleAttribute('data-count', !count.hidden);
    }
    function apply(content) {
      const c = content || {};
      title.textContent = c.title || '';
      title.style.setProperty('--page-heading-chars', String(Math.max(1, String(c.title || '').length)));
      subText.textContent = c.subtitle || '';
      sub.hidden = !c.subtitle;
      label.textContent = c.countLabel || '';
      label.hidden = !c.countLabel;
      const e = Object.prototype.hasOwnProperty.call(EMBLEMS, c.emblem) ? EMBLEMS[c.emblem] : null;
      emblem.hidden = divider.hidden = !e;
      box.toggleAttribute('data-emblem', !!e);
      emblem.innerHTML = e && e.svg ? `<svg viewBox="0 0 24 24" focusable="false">${e.svg}</svg>` : '';
      emblem.toggleAttribute('data-mask', !!(e && e.mask));
      if (e && e.mask) emblem.style.setProperty('--page-heading-mask', `url("${e.mask}")`); else emblem.style.removeProperty('--page-heading-mask');
    }
    function setLevel(next) {
      if (!Number.isInteger(next) || next < 1 || next > 6 || next === level) return;
      level = next;
      const fresh = el('h' + level, 'page-heading-title', title.textContent);
      fresh.style.cssText = title.style.cssText;
      title.replaceWith(fresh);
      title = fresh;
    }
    apply({});
    drawCount();
    return { element: root, apply, setCount(next) { n = next; drawCount(); }, setLevel };
  }
  pageHeading.EMBLEMS = EMBLEMS;
  NS.pageHeading = pageHeading;
})();
