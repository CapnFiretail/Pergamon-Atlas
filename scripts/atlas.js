// atlas.js — shared snippet loader for all Pergamon Atlas pages
// Usage: loadSnippets('Page Name') at the bottom of each page

function loadSnippets(pageName) {
  const suffix = pageName ? ' | ' + pageName : '';

  fetch('/snippets/header.html')
    .then(r => r.text())
    .then(html => {
      document.getElementById('header-placeholder').innerHTML = html;
      const el = document.querySelector('.page-title-text');
      if (el) el.textContent = suffix;
    });

  fetch('/snippets/sidebar.html')
    .then(r => r.text())
    .then(html => {
      document.getElementById('sidebar-placeholder').innerHTML = html;

      // Active link highlighting
      const path = window.location.pathname;
      document.querySelectorAll('.sidebar a').forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        if (href === '/' && path === '/') link.classList.add('active');
        else if (href === '/tools' && path.startsWith('/tools')) link.classList.add('active');
        else if (href === '/games' && path.startsWith('/games')) link.classList.add('active');
        else if (
          (href === '/pages/help' || href === '/help') &&
          (path.startsWith('/pages/help') || path.startsWith('/help'))
        ) link.classList.add('active');
      });

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

      try { (adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
      if (typeof window.__atlasAfterSidebar === 'function') window.__atlasAfterSidebar();
    });

  fetch('/snippets/footer.html')
    .then(r => r.text())
    .then(html => {
      document.getElementById('footer-placeholder').innerHTML = html;
    });
}
