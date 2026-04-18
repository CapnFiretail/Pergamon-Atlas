// atlas.js — shared snippet loader for all Pergamon Atlas pages
// Usage: loadSnippets('Page Name') at the bottom of each page

function loadSnippets(pageName) {
  const suffix = pageName ? ' | ' + pageName : '';

  fetch('/function/snippets/header.html')
    .then(r => r.text())
    .then(html => {
      document.getElementById('header-placeholder').innerHTML = html;
      const el = document.querySelector('.page-title-text');
      if (el) el.textContent = suffix;
    });

  fetch('/function/snippets/sidebar.html')
    .then(r => r.text())
    .then(html => {
      document.getElementById('sidebar-placeholder').innerHTML = html;

      // Active link highlighting
      const path = window.location.pathname;
      document.querySelectorAll('.sidebar a').forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        if (href === '/' && path === '/') link.classList.add('active');
        else if (href === '/sectors/systems/tools' && (path.startsWith('/sectors/systems/tools') || path.startsWith('/sectors/atlas/tools'))) link.classList.add('active');
        else if (href === '/sectors/systems/games' && (path.startsWith('/sectors/systems/games') || path.startsWith('/sectors/atlas/games'))) link.classList.add('active');
        else if (href === '/sectors/systems/other/help' && path.startsWith('/sectors/systems/other/help')) link.classList.add('active');
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

      if (window.atlasNavCodes) {
        const slug = window.location.pathname.replace(/\/$/, '') || '/';
        const systemCode = window.atlasNavCodes[slug] || '';
        const sysEl = document.getElementById('system-code-display');
        if (sysEl) sysEl.textContent = systemCode;

        const meta = window.atlasNavMeta && window.atlasNavMeta[slug];
        const atlasEl = document.getElementById('atlas-code-display');
        if (atlasEl && meta && window.atlasGenerator) {
          atlasEl.textContent = window.atlasGenerator.generate(systemCode, meta.chamber) || '';
        }
      }
    });

  fetch('/function/snippets/footer.html')
    .then(r => r.text())
    .then(html => {
      document.getElementById('footer-placeholder').innerHTML = html;
    });
}
