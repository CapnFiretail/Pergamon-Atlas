// atlas.js — shared snippet loader for all Pergamon Atlas pages
// Usage: loadSnippets('Page Name') at the bottom of each page

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

      if (window.PergamonVisibility) window.PergamonVisibility.applyNavVisibility(placeholder);
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
      if (window.PergamonVisibility) {
        window.PergamonVisibility.applyNavVisibility(sidebarPlaceholder).then(function (view) {
          if (view === 'admin') {
            try { (adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
          }
        });
      } else {
        try { (adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
      }
    });

  fetch('/operation/snippets/footer.html')
    .then(r => r.text())
    .then(html => {
      const footerPlaceholder = document.getElementById('footer-placeholder');
      footerPlaceholder.innerHTML = html;
      if (window.PergamonVisibility) window.PergamonVisibility.applyNavVisibility(footerPlaceholder);
    });
}
