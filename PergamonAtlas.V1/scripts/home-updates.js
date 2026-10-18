// Homepage "Latest Updates" section. Wording comes from /data/home-content.js;
// entries are the published records in /data/update-logs/updates.js, newest
// first. Each row links to that entry on the /updates/ log page.
(function () {
  const content = window.PergamonHomeContent && window.PergamonHomeContent.updates;
  const container = document.getElementById('atlas-updates');
  if (!content || !container) return;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function arrow(className) {
    const node = el('span', className, '→');
    node.setAttribute('aria-hidden', 'true');
    return node;
  }

  const heading = el('div', 'updates-heading');
  const intro = el('div', 'updates-intro');
  const title = el('h2', '', content.title); title.id = 'updates-title';
  intro.append(el('p', 'updates-eyebrow', content.eyebrow), title, el('p', 'updates-description', content.description));
  const all = el('a', 'updates-all', content.allLabel);
  all.href = content.allHref;
  all.append(arrow('updates-all-arrow'));
  heading.append(intro, all);
  container.append(heading);

  // atlasUpdates / atlasUpdateId are defined by updates.js; absent means it failed to load.
  if (typeof atlasUpdates === 'undefined' || typeof atlasUpdateId !== 'function') {
    container.append(el('p', 'updates-status', 'The update log couldn’t be loaded. Try again later.'));
    return;
  }

  const entries = atlasUpdates
    .filter(u => /^\d{4}-\d{2}-\d{2}$/.test(u.iso || '') && u.title)
    .sort((a, b) => b.iso.localeCompare(a.iso))
    .slice(0, content.limit || 5);
  if (!entries.length) {
    container.append(el('p', 'updates-status', 'No updates have been published yet.'));
    return;
  }

  const list = el('ol', 'updates-list');
  entries.forEach(entry => {
    const item = el('li', 'updates-item');
    const link = el('a', 'update-row');
    link.href = content.allHref + '#' + atlasUpdateId(entry);
    const dot = el('span', 'update-dot'); dot.setAttribute('aria-hidden', 'true');
    const meta = el('div', 'update-meta');
    const date = el('time', '', entry.date); date.dateTime = entry.iso;
    meta.append(el('span', 'update-version', entry.tag || ''), date);
    link.append(dot, meta, el('h3', 'update-title', entry.title), el('p', 'update-summary', entry.text || ''), arrow('update-arrow'));
    item.append(link);
    list.append(item);
  });
  container.append(list);
})();
