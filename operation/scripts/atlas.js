// atlas.js — shared snippet loader for all Pergamon Atlas pages
// Usage: loadSnippets('Page Name') at the bottom of each page

// The fetch() calls below resolve independently of the late auth/
// visibility script block (see indexer.js) finishing execution — a local
// snippet fetch can settle before those <script> tags have even run.
// Waiting here (rather than a same-tick `if (window.PergamonVisibility)`
// check) avoids silently skipping applyNavVisibility() when this callback
// simply won the race and ran first; it does eventually show up.
function waitForPergamonVisibility(timeoutMs) {
  return new Promise(function (resolve) {
    if (window.PergamonVisibility) { resolve(window.PergamonVisibility); return; }
    var elapsed = 0;
    var iv = setInterval(function () {
      elapsed += 50;
      if (window.PergamonVisibility || elapsed >= (timeoutMs || 5000)) {
        clearInterval(iv);
        resolve(window.PergamonVisibility || null);
      }
    }, 50);
  });
}

// window.PergamonHomepage is defined by homepage-config.js, which ONLY
// index.html loads. The footer publish panel needs it there (on '/',
// publishing promotes the configurable homepage instead of writing a
// per-path visibility override). Resolves null on every other page and
// within the timeout if the homepage-only script is somehow absent — the
// caller must handle that.
function waitForPergamonHomepage(timeoutMs) {
  return new Promise(function (resolve) {
    if (window.PergamonHomepage) { resolve(window.PergamonHomepage); return; }
    var elapsed = 0;
    var iv = setInterval(function () {
      elapsed += 50;
      if (window.PergamonHomepage || elapsed >= (timeoutMs || 5000)) {
        clearInterval(iv);
        resolve(window.PergamonHomepage || null);
      }
    }, 50);
  });
}

function loadSnippets(pageName) {
  const suffix = pageName ? ' | ' + pageName : '';

  fetch('/operation/snippets/header.html')
    .then(r => r.text())
    .then(html => {
      const placeholder = document.getElementById('header-placeholder');
      placeholder.innerHTML = html;
      const el = document.querySelector('.page-title-text');
      if (el) el.textContent = suffix;

      const searchInput = document.querySelector('.search-wrap input');
      if (searchInput) {
        searchInput.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' && this.value.trim()) {
            window.location.href = '/search?q=' + encodeURIComponent(this.value.trim());
          }
        });
      }

      waitForPergamonVisibility().then(function (pv) {
        if (pv) pv.applyNavVisibility(placeholder);
      });
    });

  fetch('/operation/snippets/sidebar.html')
    .then(r => r.text())
    .then(html => {
      const sidebarPlaceholder = document.getElementById('sidebar-placeholder');
      sidebarPlaceholder.innerHTML = html;

      // Active link highlighting
      const path = window.location.pathname;
      document.querySelectorAll('.sidebar a').forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        if (href === '/' && path === '/') link.classList.add('active');
        else if (href === '/tools' && path.startsWith('/tools')) link.classList.add('active');
        else if (href === '/games' && path.startsWith('/games')) link.classList.add('active');
        else if (href === '/atlas-explorer/' && path.startsWith('/atlas-explorer')) link.classList.add('active');
        else if (href === '/atlas-navigation/' && path.startsWith('/atlas-navigation')) link.classList.add('active');
        else if (href === '/lexicon/' && path.startsWith('/lexicon')) link.classList.add('active');
        else if (href === '/archives' && path.startsWith('/archives')) link.classList.add('active');
        else if (href === '/settings/' && path.startsWith('/settings')) link.classList.add('active');
        else if (href === '/help' && path.startsWith('/help')) link.classList.add('active');
        else if (href === '/suggestions' && path.startsWith('/suggestions')) link.classList.add('active');
      });

      // Open catalog accordion when on /games or /tools
      const catalog = document.getElementById('navCatalog');
      if (catalog && (path.startsWith('/games') || path.startsWith('/tools'))) {
        catalog.open = true;
        catalog.classList.add('active');
      }

      // Sidebar collapse toggle
      const sidebar = document.getElementById('mainSidebar');
      const toggleBtn = document.getElementById('sidebarToggle');
      if (sidebar && toggleBtn) {
        if (localStorage.getItem('sidebarCollapsed') === '1') {
          sidebar.classList.add('collapsed');
          toggleBtn.textContent = '›';
        }
        toggleBtn.addEventListener('click', function () {
          const collapsed = sidebar.classList.toggle('collapsed');
          toggleBtn.textContent = collapsed ? '›' : '‹';
          localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
        });
      }

      // The ad slot lives inside [data-visibility="admin"] (ads are hidden
      // in Public View — see visibility architecture). Pushing an ad
      // request into a hidden, zero-size container throws in adsbygoogle,
      // so only push once the view is confirmed to actually show it.
      waitForPergamonVisibility().then(function (pv) {
        if (pv) {
          pv.applyNavVisibility(sidebarPlaceholder).then(function (view) {
            if (view === 'admin') {
              try { (adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
            }
          });
        } else {
          try { (adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
        }
      });
    });

  fetch('/operation/snippets/footer.html')
    .then(r => r.text())
    .then(html => {
      const footerPlaceholder = document.getElementById('footer-placeholder');
      footerPlaceholder.innerHTML = html;

      // Page Status shows EFFECTIVE visibility (override if one exists,
      // else the page's static atlas-meta visibility) — never static alone.
      // Pages with no atlas-meta at all (not part of the Atlas indexing
      // system) have nothing to publish, so the whole panel is
      // force-hidden rather than shown with placeholder text — chained
      // after applyNavVisibility resolves so this always has the final say
      // over the panel's display, rather than racing its own async
      // role/view toggle.
      const applyPromise = waitForPergamonVisibility().then(function (pv) {
        return pv ? pv.applyNavVisibility(footerPlaceholder) : null;
      });

      applyPromise.then(async function () {
        const panel = document.getElementById('footer-admin-panel');
        const metaEl = document.getElementById('atlas-meta');
        if (!panel) return;
        if (!metaEl) { panel.style.display = 'none'; return; }

        const pv = await waitForPergamonVisibility();
        if (!pv) { panel.style.display = 'none'; return; }

        let meta;
        try { meta = JSON.parse(metaEl.textContent); }
        catch (e) { panel.style.display = 'none'; return; }

        const statusEl = document.getElementById('footer-page-status');
        const btn = document.getElementById('footer-publish-btn');
        const errEl = document.getElementById('footer-publish-error');
        const currentPath = pv.normalizePath(window.location.pathname);

        // '/' is a special publishing case. It stays permanently
        // visibility:"public" and is never given an atlas_visibility_
        // overrides row — Home must always be in navigation/search and '/'
        // always reachable. Instead, the same button promotes/demotes the
        // *configurable* homepage via homepage_settings.published (see
        // homepage-config.js). Every other page keeps the ordinary
        // per-path override behaviour untouched.
        const isHomepage = currentPath === '/';
        const ph = isHomepage ? await waitForPergamonHomepage() : null;
        if (isHomepage && !ph) { panel.style.display = 'none'; return; }

        async function refreshStatus() {
          if (isHomepage) {
            const published = await ph.isPublished();
            if (statusEl) {
              statusEl.textContent = published
                ? 'New homepage (public)'
                : 'Classic homepage (public)';
            }
            if (btn) {
              btn.disabled = false;
              btn.textContent = published ? 'Remove from Public' : 'Publish to Public';
              btn.dataset.desired = published ? 'unpublish' : 'publish';
              btn.title = published
                ? 'Return visitors to the classic homepage'
                : 'Promote the new configurable homepage to all visitors';
            }
            return;
          }
          const effective = await pv.getEffectiveVisibility(currentPath, meta.visibility);
          const isPublic = effective === 'public';
          if (statusEl) statusEl.textContent = isPublic ? 'Public' : 'Admin Only';
          if (btn) {
            btn.disabled = false;
            btn.textContent = isPublic ? 'Remove from Public' : 'Publish to Public';
            btn.dataset.desired = isPublic ? 'admin' : 'public';
          }
        }

        await refreshStatus();

        if (btn && !btn.dataset.wired) {
          btn.dataset.wired = '1';
          btn.addEventListener('click', async function () {
            const desired = btn.dataset.desired; // set by refreshStatus()
            const previousLabel = btn.textContent.trim();
            const publishing = desired === 'public' || desired === 'publish';
            btn.disabled = true;
            btn.textContent = publishing ? 'Publishing…' : 'Removing…';
            if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }

            let result;
            try {
              if (isHomepage) {
                result = publishing ? await ph.publish() : await ph.unpublish();
              } else {
                const action = publishing ? pv.publishPage : pv.unpublishPage;
                result = await action(currentPath, meta.visibility);
              }
            } catch (err) {
              result = { error: { message: err && err.message ? err.message : 'Unknown error' } };
            }

            if (result && result.error) {
              console.error('Pergamon Publishing: mutation failed', result.error);
              btn.disabled = false;
              btn.textContent = previousLabel;
              if (errEl) {
                errEl.textContent = 'Could not update publication status. Please try again.';
                errEl.style.display = '';
              }
              return;
            }

            await refreshStatus();
          });
        }
      });
    });
}
