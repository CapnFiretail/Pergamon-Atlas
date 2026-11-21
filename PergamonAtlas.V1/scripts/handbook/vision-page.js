// Atlas Handbook › Vision & Architecture: the Atlas vision, read from
// vision-content.js, which tools/build-vision.mjs generates from
// docs/design/ATLAS_VISION.md (the source of truth; never edit either copy
// here). Content is built as DOM nodes from data, never as HTML.
//
// Each section has its own route, #/vision/<section-id>, so a section can be
// linked to and revisited; the contents list uses those routes and marks the
// section being read.
(function () {
  'use strict';
  const ns = window.PergamonHandbook = window.PergamonHandbook || {};
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const wide = window.matchMedia('(min-width: 1201px)');
  let page = null;                     // { article, toc, menu } while shown
  let pinned = null;                   // section chosen from the contents, kept marked until the reader scrolls

  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  const plain = parts => parts.map(p => (typeof p === 'string' ? p : p[1])).join('');

  function inline(parent, parts) {
    for (const part of parts) {
      if (typeof part === 'string') { parent.append(part); continue; }
      const [kind, text, href] = part;
      if (kind === 'strong') parent.append(el('strong', '', text));
      else if (kind === 'em') parent.append(el('em', '', text));
      else if (kind === 'code') parent.append(el('code', 'hb-code', text));
      else if (kind === 'a') {
        const a = el('a', 'hb-doc-link', text);
        // Only plain web or site links; anything else is shown as text.
        if (/^(https?:\/\/|\/|#)/.test(href)) a.href = href;
        if (/^https?:/.test(href)) a.rel = 'noopener noreferrer';
        parent.append(a);
      }
    }
    return parent;
  }

  function block(b) {
    if (b.type === 'p') return inline(el('p', 'pa-type-body'), b.text);
    if (b.type === 'quote') {
      const q = el('blockquote', 'hb-doc-quote');
      q.append(inline(el('p', 'pa-type-body-small'), b.text));
      return q;
    }
    if (b.type === 'ul' || b.type === 'ol') {
      const list = el(b.type, 'hb-doc-list');
      for (const item of b.items) list.append(inline(el('li', 'pa-type-body'), item));
      return list;
    }
    if (b.type === 'h3' || b.type === 'h4') {
      const h = inline(el(b.type, b.type === 'h3' ? 'pa-type-item-title hb-doc-h3' : 'pa-type-label hb-doc-h4'), b.text);
      h.id = 'vision-' + b.id;
      h.tabIndex = -1;
      return h;
    }
    if (b.type === 'table') {
      const wrap = el('div', 'hb-table-wrap');
      wrap.tabIndex = 0;                // scrollable on narrow screens
      const table = el('table', 'hb-table');
      const head = el('tr');
      for (const c of b.head) { const th = inline(el('th', 'pa-type-label'), c); th.scope = 'col'; head.append(th); }
      const thead = el('thead'); thead.append(head);
      const tbody = el('tbody');
      for (const r of b.rows) {
        const tr = el('tr');
        r.forEach((c, i) => {
          const cell = inline(el(i === 0 ? 'th' : 'td', 'pa-type-body-small'), c);
          if (i === 0) cell.scope = 'row';
          cell.dataset.label = plain(b.head[i]);        // shown when rows stack on phones
          tr.append(cell);
        });
        tbody.append(tr);
      }
      table.append(thead, tbody);
      wrap.append(table);
      return wrap;
    }
    return el('p', 'pa-type-body-small hb-muted', 'Unsupported content.');
  }

  function contents(doc) {
    const aside = el('aside', 'hb-toc');
    aside.setAttribute('aria-label', 'Vision contents');
    const menu = el('details', 'hb-toc-menu');
    const summary = el('summary', 'hb-toc-summary');
    summary.append(el('span', 'pa-type-label', 'Contents'), el('span', 'pa-type-caption hb-muted', doc.sections.length + ' sections'));
    const list = el('ol', 'hb-toc-list');
    for (const s of doc.sections) {
      const li = el('li');
      const a = el('a', 'hb-toc-link pa-type-body-small', s.title);
      a.href = '#/vision/' + s.id;
      a.dataset.section = s.id;
      li.append(a);
      const subs = s.blocks.filter(b => b.type === 'h3');
      if (subs.length) {
        const sub = el('ol', 'hb-toc-sub');
        for (const h of subs) {
          const sa = el('a', 'hb-toc-link pa-type-caption', plain(h.text));
          sa.href = '#/vision/' + h.id;
          sa.dataset.section = s.id;
          const sli = el('li'); sli.append(sa); sub.append(sli);
        }
        li.append(sub);
      }
      list.append(li);
    }
    // A link to the section already in the address doesn't change the hash,
    // so it wouldn't move the page: go there directly.
    list.addEventListener('click', e => {
      const a = e.target.closest('a');
      if (a && a.getAttribute('href') === window.location.hash) { e.preventDefault(); navigate(a.getAttribute('href').replace('#/vision/', '')); }
    });
    menu.append(summary, list);
    aside.append(menu);
    return { aside, menu };
  }

  function mark(id) {
    if (!page) return;
    page.toc.querySelectorAll('.hb-toc-link').forEach(a => {
      if (a.dataset.section === id && !a.closest('.hb-toc-sub')) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
  }

  // Scroll to a section (or heading) and move focus there.
  function navigate(rest) {
    if (!page) return;
    if (!wide.matches) page.menu.open = false;
    const target = rest ? page.article.querySelector('#vision-' + CSS.escape(rest)) : null;
    if (!target) { pinned = null; window.scrollTo(0, 0); mark(ns.vision.sections[0].id); return; }
    target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
    const section = target.closest('.hb-doc-section');
    if (section) { pinned = section.dataset.section; mark(pinned); }
  }

  function render(view, ctx) {
    const doc = ns.vision;
    if (!doc) { view.append(ctx.header('Vision & Architecture', 'The vision could not be loaded.')); return; }
    const meta = Object.fromEntries(doc.meta);
    view.append(ctx.header('Vision & Architecture', null, [
      ctx.chip(meta.Version ? 'Version ' + meta.Version : 'Vision', 'active'),
      ctx.chip('Living document', 'muted'),
      ctx.chip('Read-only', 'muted')
    ]));

    const layout = el('div', 'hb-doc');
    const article = el('article', 'hb-article');
    article.setAttribute('aria-labelledby', 'vision-title');
    const title = el('h2', 'pa-type-section-title-large hb-doc-title', doc.title);
    title.id = 'vision-title';
    article.append(title);
    const facts = el('dl', 'hb-doc-meta');
    for (const [k, v] of doc.meta) {
      const row = el('div');
      row.append(el('dt', 'pa-type-label hb-muted', k), el('dd', 'pa-type-body-small', v));
      facts.append(row);
    }
    if (doc.meta.length) article.append(facts);
    for (const b of doc.intro) article.append(block(b));
    for (const s of doc.sections) {
      const section = el('section', 'hb-doc-section');
      section.dataset.section = s.id;
      const h = el('h2', 'pa-type-section-title hb-doc-h2', s.title);
      h.id = 'vision-' + s.id;
      h.tabIndex = -1;
      section.append(h);
      section.setAttribute('aria-labelledby', h.id);
      for (const b of s.blocks) section.append(block(b));
      article.append(section);
    }
    const source = el('p', 'pa-type-caption hb-muted hb-doc-source');
    source.append('Source: ', el('code', 'hb-code', doc.source), ' in the repository. This page is generated from it by ',
      el('code', 'hb-code', 'tools/build-vision.mjs'), '; edit the Markdown, not this page.');
    article.append(source);

    const toc = contents(doc);
    layout.append(toc.aside, article);
    view.append(layout);
    page = { article, toc: toc.aside, menu: toc.menu };

    const sync = () => { toc.menu.open = wide.matches; };
    sync();
    if (wide.addEventListener) wide.addEventListener('change', sync);

    // Mark the section being read: the last one whose heading has passed
    // just below the header. A section picked from the contents stays marked
    // (while the page glides there, or if it is too near the end to reach the
    // top) until the reader scrolls.
    let ticking = false;
    const spy = () => {
      ticking = false;
      if (!page || pinned) return;
      const line = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pa-header-h')) || 72) + 40;
      let id = doc.sections[0].id;
      for (const s of article.querySelectorAll('.hb-doc-section')) {
        if (s.getBoundingClientRect().top <= line) id = s.dataset.section; else break;
      }
      mark(id);
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(spy); } };
    const KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
    const release = e => { if (pinned && (e.type !== 'keydown' || KEYS.includes(e.key))) { pinned = null; onScroll(); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    ['wheel', 'touchstart', 'keydown'].forEach(t => window.addEventListener(t, release, { passive: true }));
    pinned = null;
    requestAnimationFrame(() => { if (ctx.rest) navigate(ctx.rest); else spy(); });

    ctx.onCleanup(() => {
      window.removeEventListener('scroll', onScroll);
      ['wheel', 'touchstart', 'keydown'].forEach(t => window.removeEventListener(t, release));
      pinned = null;
      if (wide.removeEventListener) wide.removeEventListener('change', sync);
      page = null;
    });
  }

  ns.app.register('vision', { render, navigate });
  ns.visionPage = { render, navigate };
})();
