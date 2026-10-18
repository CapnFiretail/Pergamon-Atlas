// Homepage renderer. Content lives in /data/home-content.js; counts come from
// /data/entries.js and the Account tile from the Supabase session (auth.js).
(function () {
  const content = window.PergamonHomeContent;
  const root = document.getElementById('home');
  if (!content || !root) return;

  const iconPaths = {
    tools: '<path d="m8 4 5 5-4 4-5-5a9 9 0 0 0 10 12L27 33a4 4 0 0 0 6-6L20 14A9 9 0 0 0 30 4l-6 6-5-5 6-6"/><path d="M11 23 3 31a3 3 0 0 0 5 5l8-8"/>',
    games: '<path d="M11 10h18c6 0 8 9 10 19 1 6-4 8-7 4l-5-6H13l-5 6c-3 4-8 2-7-4 2-10 4-19 10-19Z"/><path d="M11 15v10m-5-5h10m12-3h.1m5 5h.1" stroke="#080c09"/>',
    atlas: '<path d="M3 6c7-3 12-2 17 2 5-4 10-5 17-2v26c-7-3-12-2-17 2-5-4-10-5-17-2Z"/><path d="M20 8v26" stroke="#080c09"/>',
    account: '<circle cx="20" cy="11" r="8"/><path d="M5 36v-5c0-14 30-14 30 0v5Z"/>',
    calculator: '<rect x="8" y="2" width="24" height="36" rx="3"/><path d="M13 8h14v6H13Z" fill="#080c09" stroke="none"/><path d="M14 21h1m10 0h1m-12 7h1m10 0h1m-12 6h1m10 0h1" stroke="#080c09" stroke-width="4"/>',
    pulse: '<path d="M2 21h7l4-8 5 20 5-27 5 15h10" fill="none"/>'
  };

  function icon(item) {
    if (item.image) {
      const img = document.createElement('img');
      img.src = item.image; img.alt = ''; img.className = 'home-icon custom-image';
      return img;
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 40 40'); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'currentColor'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.5'); svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round'); svg.classList.add('home-icon');
    svg.innerHTML = iconPaths[item.icon] || iconPaths.atlas;
    return svg;
  }

  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function arrow() {
    const a = element('span', 'arrow', '→');
    a.setAttribute('aria-hidden', 'true');
    return a;
  }

  // ── Data ──────────────────────────────────────────────────────────────
  const entries = window.atlasEntries || null;
  const norm = path => String(path || '').replace(/\/+$/, '');
  const live = list => (list || []).filter(e => !e.archived && e.visibility === 'public');
  function findLive(path) {
    if (!entries) return null;
    return live([].concat(entries.tools || [], entries.games || [])).find(e => norm(e.path) === norm(path)) || null;
  }

  // ── Cards ─────────────────────────────────────────────────────────────
  // Category cards link to their section; status adds a tag (e.g. "Coming soon").
  function categoryCard(item) {
    const a = element('a', 'category-card');
    a.href = item.href;
    a.append(icon(item));
    const copy = element('div', 'feature-copy');
    copy.append(element('h2', '', item.title));
    if (item.description) copy.append(element('p', '', item.description));
    if (item.status) copy.append(element('span', 'home-tag', item.status));
    a.append(copy, arrow());
    return a;
  }

  // Featured items resolve against entries.js. Missing ones are surfaced as
  // "Not available" (no link) rather than pointing at a page that isn't there.
  function featureCard(item) {
    const entry = findLive(item.path);
    const title = item.title || (entry && entry.name) || item.path;
    const card = element(entry ? 'a' : 'div', 'feature-card' + (entry ? '' : ' is-unavailable'));
    if (entry) card.href = norm(entry.path) + '/';
    card.append(icon(item));
    const copy = element('div', 'feature-copy');
    copy.append(element('h3', '', title), element('p', '', item.description || ''));
    if (!entries) {
      copy.append(element('span', 'home-tag muted', "Couldn't load"));
    } else if (!entry) {
      copy.append(element('span', 'home-tag muted', 'Not available'));
      console.warn('Homepage: featured item is not a live page:', item.path);
    } else if (entry.status === 'coming-soon') {
      copy.append(element('span', 'home-tag', 'Coming soon'));
    }
    card.append(copy);
    if (entry) card.append(arrow());
    return card;
  }

  function section(heading, linkLabel, href, body, id) {
    const s = element('section');
    s.setAttribute('aria-labelledby', id);
    const top = element('div', 'section-title');
    const h = element('h2', '', heading); h.id = id;
    const a = element('a', '', linkLabel); a.href = href;
    a.setAttribute('aria-label', `${linkLabel.replace(/\s*→\s*$/, '')}: ${heading}`);
    top.append(h, a);
    s.append(top, body);
    return s;
  }

  // ── Stats ─────────────────────────────────────────────────────────────
  // Each tile keeps a fixed size; the value/label text is filled in once known.
  const statEls = {};
  function statTile(item) {
    const a = element('a', 'stat');
    a.href = item.href;
    a.append(icon(item));
    // Value and label sit on one line: '0 Tools'.
    const copy = element('div', 'stat-text');
    const value = element('strong', '', '…');
    const label = element('span', '', item.title);
    copy.append(value, label);
    a.append(copy);
    statEls[item.key] = { a, value, label, title: item.title };
    return a;
  }
  function setStat(key, value, label) {
    const s = statEls[key];
    if (!s) return;
    s.value.textContent = value;
    s.label.textContent = label === undefined ? s.title : label;
    s.a.setAttribute('aria-label', `${s.title}: ${value}${label && label !== s.title ? ', ' + label : ''}`);
  }

  function fillCounts() {
    if (!entries) {
      setStat('tools', '—', 'Unavailable');
      setStat('games', '—', 'Unavailable');
      return;
    }
    // Only what can be used now counts; 'coming-soon' placeholders don't.
    const available = list => live(list).filter(e => e.status !== 'coming-soon').length;
    setStat('tools', String(available(entries.tools)), 'Tools');
    setStat('games', String(available(entries.games)), 'Games');
  }

  // Only whether a session exists is shown — no name, email or profile data.
  function fillAccount() {
    const auth = window.PergamonAuth;
    if (!auth) { setStat('account', 'Sign in', ''); return; }
    const render = session => setStat('account', session ? 'Signed in' : 'Sign in', '');
    auth.getSession()
      .then(res => render(res && res.data && res.data.session))
      .catch(() => setStat('account', '—', 'Unavailable'));
    try {
      auth.onAuthStateChange((event, session) => {
        // A password-reset link that Supabase sent to the Site URL (the
        // homepage) instead of the reset page: finish it there.
        if (event === 'PASSWORD_RECOVERY') {
          try { sessionStorage.setItem('pa-password-recovery', '1'); } catch (e) {}
          window.location.replace('/account/reset-password/');
          return;
        }
        render(session);
      });
    } catch (e) {}
  }

  // ── Render ────────────────────────────────────────────────────────────
  const welcome = element('section', 'home-welcome');
  welcome.setAttribute('aria-labelledby', 'home-title');
  welcome.append(element('p', 'eyebrow', content.eyebrow));
  const title = element('h1', '', content.title); title.id = 'home-title';
  welcome.append(title);
  const categories = element('div', 'category-grid');
  content.categories.forEach(item => categories.append(categoryCard(item)));
  welcome.append(categories);
  let learn = null;
  if (content.learn) {
    learn = element('a', 'learn-card');
    learn.href = content.learn.href;
    learn.append(element('span', 'learn-label', content.learn.label), arrow());
    welcome.append(learn);
  }

  const features = element('div', 'home-features');
  const stats = element('div', 'stats');
  stats.setAttribute('aria-live', 'polite');
  content.stats.forEach(item => stats.append(statTile(item)));
  features.append(stats);

  const tools = element('div', 'featured-tools');
  if (content.tools.length) content.tools.forEach(item => tools.append(featureCard(item)));
  else tools.append(element('p', 'home-empty', 'No featured tools yet.'));
  features.append(section(content.toolsHeading, content.toolsLinkLabel, content.toolsHref, tools, 'featured-tools-heading'));

  const game = content.game ? featureCard(content.game) : element('p', 'home-empty', 'No featured game yet.');
  game.classList.add('featured-game');
  features.append(section(content.gamesHeading, content.gamesLinkLabel, content.gamesHref, game, 'featured-game-heading'));

  // The Learn button matches the Featured Game box's height.
  if (learn && window.ResizeObserver) {
    new ResizeObserver(() => { learn.style.minHeight = game.offsetHeight + 'px'; }).observe(game);
  }

  root.append(welcome, features);
  fillCounts();
  fillAccount();
})();
