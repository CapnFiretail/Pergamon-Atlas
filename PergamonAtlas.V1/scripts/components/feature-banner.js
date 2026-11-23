// Feature banner (Atlas component library): a large card with full-bleed
// artwork, a title lockup between ornament rules, and one action link.
//
//   const b = PergamonComponents.featureBanner({ variant, actionIcon });
//   b.apply({ title, actionLabel, href, art })   set the content in place
//   b.applyArt(art)                              redraw only the artwork
//   b.element                                    the <section> to place
//
//   variant     'hero'   (Featured Content): tall; the action sits under the title
//               'banner' (Spotlight): wide and short; the action on the right
//   actionIcon  'play' (default) or null
//   art         the artwork model from scripts/cms/content.js (artModel):
//               { src, srcset, width, height, alt, fit: 'cover' | 'height',
//                 focus, focusNarrow, zoom, zoomNarrow (cover),
//                 scale, scaleNarrow, x, xNarrow, y, yNarrow, base (height) }
//
// Knows nothing about games, the CMS or the page it is on. Styles:
// styles/components/feature-banner.css. Its height comes from where it is
// placed; its compact layout applies when the area it sits in (a size
// container named `upper`: on a grid, the widget's own slot) is 560px or
// narrower.
// Long titles: the title's size is fit × card width ÷ its length in
// characters (styles: --feature-title-fit), at most the type role's size and
// never below a readable minimum (--feature-title-min). Short titles are drawn
// at their normal size. Where the minimum needs more room, the card must be
// larger (its sizing contract) or, sized by its content, it grows. A label
// too long for a compact card wraps inside its button. Titles over 24
// characters also darken more of the artwork behind them and, on a compact
// card that may grow (a page sets --feature-grows: 1), sit below it.
// Fallback fonts: if the display web font (Roboto Slab) isn't loaded, the
// page falls back to much wider faces (Rockwell); <html data-display-font=
// "fallback"> then tightens the cap and lowers the minimum to match.
(function () {
  'use strict';
  const NS = window.PergamonComponents = window.PergamonComponents || {};
  const ICONS = { play: '<path d="M5 2.5v19l16.5-9.5z"/>' };
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  let idCount = 0;
  const LONG_TITLE = 24;                    // characters: longer titles get data-title-long (styles)

  // Mark the page when the display web font isn't available, once fonts settle.
  function checkDisplayFont() {
    if (!document.fonts) return;
    let loaded = false;
    document.fonts.forEach(f => { if (f.family.replace(/["']/g, '') === 'Roboto Slab' && f.status === 'loaded') loaded = true; });
    document.documentElement.setAttribute('data-display-font', loaded ? 'web' : 'fallback');
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(checkDisplayFont);
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', checkDisplayFont);
  }

  const ART_VARS = ['--feature-focus', '--feature-focus-narrow', '--feature-zoom', '--feature-zoom-narrow',
    '--feature-art-scale', '--feature-art-scale-narrow', '--feature-art-x', '--feature-art-x-narrow',
    '--feature-art-y', '--feature-art-y-narrow', '--feature-base'];

  function featureBanner(opts) {
    opts = opts || {};
    const banner = opts.variant === 'banner';
    const actionIcon = opts.actionIcon === undefined ? 'play' : opts.actionIcon;
    const section = el('section', banner
      ? 'home-banner home-banner--spotlight home-feature home-feature--spotlight'
      : 'home-banner home-banner--featured home-feature');
    const headingId = `pa-feature-${++idCount}`;
    section.setAttribute('aria-labelledby', headingId);

    const shade = el('div', 'home-feature-shade');
    shade.setAttribute('aria-hidden', 'true');
    const copy = el('div', 'home-feature-copy');
    const lockup = el('div', 'home-feature-lockup');
    const rule = modifier => {
      const r = el('div', `home-feature-rule home-feature-rule--${modifier}`);
      r.setAttribute('aria-hidden', 'true');
      r.innerHTML = modifier === 'top' ? '<span></span><i></i><span></span>' : '<span></span>';
      return r;
    };
    const h = el('h2', 'home-feature-title'); h.id = headingId;
    lockup.append(rule('top'), h, rule('bottom'));
    const action = el('a', 'home-feature-play');
    if (actionIcon && ICONS[actionIcon]) action.innerHTML = `<svg class="home-feature-play-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[actionIcon]}</svg>`;
    const label = el('span', '');
    action.append(label);
    if (banner) {
      copy.append(lockup);
      section.append(shade, copy, action);
    } else {
      copy.append(lockup, action);
      section.append(shade, copy);
    }

    let img = null;
    function applyArt(a) {
      ART_VARS.forEach(v => section.style.removeProperty(v));
      delete section.dataset.artFit;
      delete section.dataset.artZoom;
      if (!a || !a.src) { if (img) { img.remove(); img = null; } return; }
      if (!img) { img = el('img', 'home-feature-art'); section.prepend(img); }
      if (img.getAttribute('src') !== a.src) {
        if (a.srcset) { img.srcset = a.srcset; img.sizes = '(max-width: 900px) 100vw, 60vw'; }
        else { img.removeAttribute('srcset'); img.removeAttribute('sizes'); }
        if (a.width) img.width = a.width; else img.removeAttribute('width');
        if (a.height) img.height = a.height; else img.removeAttribute('height');
        img.src = a.src;
      }
      img.alt = a.alt || '';
      if (a.alt) img.removeAttribute('aria-hidden'); else img.setAttribute('aria-hidden', 'true');
      img.decoding = 'async';
      img.setAttribute('fetchpriority', banner ? 'auto' : 'high');
      const set = (prop, v) => { if (v !== undefined) section.style.setProperty(prop, v); };
      if (a.fit === 'height') {
        // fit: 'height' sizes the art by the card's height (scale × height,
        // scaleNarrow when compact) instead of covering it, centres it at x / xNarrow, and
        // feathers its sides into the card colour (`base`). For artwork much
        // narrower than the card, where "cover" would crop away the subject.
        section.dataset.artFit = 'height';
        set('--feature-art-scale', a.scale !== undefined ? String(a.scale) : undefined);
        set('--feature-art-scale-narrow', a.scaleNarrow !== undefined ? String(a.scaleNarrow) : undefined);
        set('--feature-art-x', a.x); set('--feature-art-x-narrow', a.xNarrow);
        set('--feature-art-y', a.y); set('--feature-art-y-narrow', a.yNarrow);
        set('--feature-base', a.base);
      } else {
        set('--feature-focus', a.focus);
        set('--feature-focus-narrow', a.focusNarrow);
        // Cover zoom (scale past "cover", around the focal point).
        if (a.zoom !== 1 || a.zoomNarrow !== 1) {
          section.dataset.artZoom = '';
          set('--feature-zoom', String(a.zoom)); set('--feature-zoom-narrow', String(a.zoomNarrow));
        }
      }
    }

    function apply(content) {
      h.textContent = content.title;
      const chars = String(content.title || '').length;
      section.style.setProperty('--feature-title-chars', String(Math.max(1, chars)));
      section.toggleAttribute('data-title-long', chars > LONG_TITLE);
      action.href = content.href;
      action.setAttribute('aria-label', `${content.actionLabel}: ${content.title}`);
      label.textContent = content.actionLabel;
      applyArt(content.art);
    }

    return { element: section, apply, applyArt };
  }

  NS.featureBanner = featureBanner;
})();
