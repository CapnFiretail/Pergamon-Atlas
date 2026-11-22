// Content card (Atlas component library): a linked card with square
// artwork, a title, a line of metadata and an optional action icon. Usable on
// its own or inside a carousel; it fills the width it is given.
//
//   const c = PergamonComponents.contentCard({ title, meta, href, art, action });
//   c.element                 the card (<a>) to place
//   c.update({ … })           new content in place (artwork re-cropped when
//                             it is the same picture)
//   c.setArt(art)             new artwork only
//   PergamonComponents.contentCard.setArt(element, art)
//                             the same for a card found in the page
//
//   action  'play' (default) or null
//   art     the artwork model from scripts/cms/content.js (artModel):
//           { src, width, height, alt, focus, focusNarrow, zoom, zoomNarrow };
//           none: a neutral "Artwork" placeholder
//
// Knows nothing about games or the CMS. Styles: styles/components/content-card.css
// (a narrow card, 180px or less, uses the artwork's phone crop).
(function () {
  'use strict';
  const NS = window.PergamonComponents = window.PergamonComponents || {};
  const ICONS = { play: '<path d="M8 5.5v13l11-6.5z"/>' };
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Artwork slot: the image (cover crop, focal point and zoom; separate
  // phone values), or the neutral placeholder when empty.
  function artSlot(a) {
    const box = el('div', 'home-art home-tile-art');
    if (a && a.src) {
      const img = el('img');
      img.src = a.src;
      if (a.width) img.width = a.width;
      if (a.height) img.height = a.height;
      img.alt = a.alt || '';
      img.decoding = 'async';
      img.loading = 'lazy';
      if (!a.alt) box.setAttribute('aria-hidden', 'true');
      box.classList.add('has-art');
      frame(box, a);
      box.append(img);
    } else {
      box.setAttribute('aria-hidden', 'true');
      box.append(el('span', 'home-art-label', 'Artwork'));
    }
    return box;
  }
  // The slot's crop: focal point and zoom (desktop and phone values).
  function frame(box, a) {
    ['--art-focus', '--art-focus-narrow', '--art-zoom', '--art-zoom-narrow'].forEach(p => box.style.removeProperty(p));
    delete box.dataset.artZoom;
    const set = (prop, v) => { if (v !== undefined) box.style.setProperty(prop, v); };
    set('--art-focus', a.focus); set('--art-focus-narrow', a.focusNarrow);
    if (a.zoom !== 1 || a.zoomNarrow !== 1) {
      box.dataset.artZoom = '';
      set('--art-zoom', String(a.zoom)); set('--art-zoom-narrow', String(a.zoomNarrow));
    }
  }
  // New artwork for an existing card: the same picture is only re-cropped
  // (no new image element); another picture replaces the slot.
  function setArt(card, a) {
    const box = card.querySelector('.home-art');
    if (!box) return;
    const img = box.querySelector('img');
    if (a && a.src && img && img.getAttribute('src') === a.src) {
      img.alt = a.alt || '';
      if (a.alt) box.removeAttribute('aria-hidden'); else box.setAttribute('aria-hidden', 'true');
      frame(box, a);
    } else {
      box.replaceWith(artSlot(a));
    }
  }

  function contentCard(content) {
    const card = el('a', 'home-tile');
    const title = el('h3', 'home-tile-title');
    const meta = el('span', 'home-tile-category');
    card.append(artSlot(content.art));
    const row = el('div', 'home-tile-meta');
    const text = el('div', 'home-tile-text');
    text.append(title, meta);
    row.append(text);
    const action = content.action === undefined ? 'play' : content.action;
    if (action && ICONS[action]) row.insertAdjacentHTML('beforeend', `<svg class="home-tile-play" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[action]}</svg>`);
    card.append(row);
    function update(c) {
      card.href = c.href;
      title.textContent = c.title;
      meta.textContent = c.meta || '';
      setArt(card, c.art);
    }
    card.href = content.href;
    title.textContent = content.title;
    meta.textContent = content.meta || '';
    return { element: card, update, setArt: a => setArt(card, a) };
  }
  contentCard.setArt = setArt;

  NS.contentCard = contentCard;
})();
