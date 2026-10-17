// Marks the current section in the header nav and sidebar, and wires the
// sidebar collapse toggle. Links are matched by their first path segment,
// so /games/chess/ highlights the /games/ links.
(function () {
  var section = function (path) { return '/' + (path.split('/')[1] || ''); };
  var current = section(window.location.pathname);

  document.querySelectorAll('.pa-nav a').forEach(function (link) {
    if (section(link.getAttribute('href')) === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('.pa-sidebar a').forEach(function (link) {
    var match = section(link.getAttribute('href')) === current;
    link.classList.toggle('active', match);
    if (match) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  var sidebar = document.querySelector('.pa-sidebar');
  var toggle = document.querySelector('.pa-sidebar-toggle');
  if (!sidebar || !toggle) return;

  var setCollapsed = function (collapsed) {
    sidebar.classList.toggle('collapsed', collapsed);
    toggle.textContent = collapsed ? '›' : '‹';
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  };
  try { setCollapsed(localStorage.getItem('paSidebarCollapsed') === '1'); } catch (e) { setCollapsed(false); }

  toggle.addEventListener('click', function () {
    var collapsed = !sidebar.classList.contains('collapsed');
    setCollapsed(collapsed);
    try { localStorage.setItem('paSidebarCollapsed', collapsed ? '1' : '0'); } catch (e) {}
  });
})();
