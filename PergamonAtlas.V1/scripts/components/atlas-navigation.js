// Atlas Navigation (Atlas component library): a panel of whole-row links,
// each with an icon, a label, a short description and a chevron. A link can
// read differently for signed-in visitors (e.g. "Login / Sign Up" becomes
// "Account").
//
//   const n = PergamonComponents.atlasNavigation({ title, links });
//   n.element               the <nav> to place
//   n.setSignedIn(bool)     switch the links that have signed-in wording
//
//   link = { label, description?, href, icon, signedInLabel?, signedInDescription? }
//   icon   a name from atlasNavigation.ICONS (games, tools, account, settings,
//          updates, suggestions)
//
// Knows nothing about the page it is on or where its links come from. Its
// rows share the panel's height (on a grid, its rectangle); when the panel
// is as tall as its content, each row is its natural height. Styles:
// styles/components/atlas-navigation.css.
(function () {
  'use strict';
  const NS = window.PergamonComponents = window.PergamonComponents || {};

  const ICONS = {
    games: '<rect x="2" y="6" width="20" height="12" rx="4"/><path d="M7 10v4M5 12h4M15.5 11h.01M18 13h.01"/>',
    tools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5a1.5 1.5 0 0 0 2.1 2.1l5.8-5.8a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.1-2.1z"/>',
    account: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    updates: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    suggestions: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>'
  };
  const icon = (name, cls) => `<svg class="${cls || 'home-svg'}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  let idCount = 0;

  function atlasNavigation(data) {
    const panel = el('nav', 'home-context home-atlas-nav');
    panel.dataset.slot = 'context';
    const headingId = `atlas-navigation-${++idCount}`;
    panel.setAttribute('aria-labelledby', headingId);
    const h = el('h2', 'home-context-title', data.title);
    h.id = headingId;
    const list = el('ul', 'home-context-list');
    const switching = [];                     // links with signed-in wording
    (data.links || []).forEach(item => {
      const li = el('li', 'home-context-item');
      const link = el('a', 'home-context-row');
      link.href = item.href;
      link.insertAdjacentHTML('beforeend', `<span class="home-context-icon">${icon(item.icon, 'home-svg')}</span>`);
      const text = el('span', 'home-context-text');
      const title = el('span', 'home-context-label', item.label);
      const desc = el('span', 'home-context-desc', item.description || '');
      text.append(title, desc);
      link.append(text);
      link.insertAdjacentHTML('beforeend', icon('chevron', 'home-context-chevron'));
      li.append(link);
      list.append(li);
      if (item.signedInLabel) switching.push({ title, desc, item });
    });
    panel.append(h, list);

    function setSignedIn(signedIn) {
      switching.forEach(({ title, desc, item }) => {
        title.textContent = signedIn && item.signedInLabel ? item.signedInLabel : item.label;
        if (item.signedInDescription) desc.textContent = signedIn ? item.signedInDescription : item.description;
      });
    }
    return { element: panel, setSignedIn };
  }

  atlasNavigation.ICONS = ICONS;
  atlasNavigation.icon = icon;
  NS.atlasNavigation = atlasNavigation;
})();
