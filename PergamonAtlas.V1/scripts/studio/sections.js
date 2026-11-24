// Atlas Studio sections: the navigation, as data. The shell (studio.js) draws
// the sidebar, breadcrumbs and routes from it; a section without a renderer is
// shown as a placeholder.
//
//   DEFAULT   the section shown at /studio/ and for unknown addresses
//   GROUPS    [{ id, label, items: [{ path: '<group>/<id>', label, icon, text }] }]
//   ICONS     24px grid, stroked like the site's
(function () {
  'use strict';
  const ns = window.PergamonStudio = window.PergamonStudio || {};

  const ICONS = {
    studio: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
    overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    connections: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="9" r="2.5"/><circle cx="9" cy="18" r="2.5"/><path d="m8.4 6.6 7.2 1.8M6.6 8.4l1.8 7.2M16.3 10.8l-5.5 5.4"/>',
    ideas: '<path d="M9 18h6M10 21h4M8.5 14.5A6 6 0 1 1 15.5 14.5c-.6.5-1 1.2-1 2v1.5h-5v-1.5c0-.8-.4-1.5-1-2z"/>',
    environments: '<rect x="3" y="4" width="13" height="10" rx="1.5"/><path d="M8 17v1.5A1.5 1.5 0 0 0 9.5 20h10a1.5 1.5 0 0 0 1.5-1.5V10a1.5 1.5 0 0 0-1.5-1.5H19M3 8h13"/>',
    local: '<rect x="4" y="5" width="16" height="10" rx="1.5"/><path d="M2 19h20"/>',
    staging: '<circle cx="6" cy="5.5" r="2.5"/><circle cx="6" cy="18.5" r="2.5"/><circle cx="18" cy="8.5" r="2.5"/><path d="M6 8v8M18 11c0 4-12 1-12 5"/>',
    production: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    releases: '<path d="m3 12 9-9h8a1 1 0 0 1 1 1v8l-9 9z"/><circle cx="16.5" cy="7.5" r="1.5"/>',
    workflows: '<rect x="3" y="3" width="7" height="6" rx="1.5"/><rect x="14" y="15" width="7" height="6" rx="1.5"/><path d="M6.5 9v6a3 3 0 0 0 3 3H14"/>',
    analytics: '<path d="M4 4v16h16M8 16v-4M12.5 16V8M17 16v-6"/>',
    services: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6"/>',
    monitoring: '<path d="M3 12h4l3-7 4 14 3-7h4"/>'
  };

  const GROUPS = [
    { id: 'workspace', label: 'Workspace', items: [
      { path: 'workspace/overview', label: 'Overview', icon: 'overview', text: 'A summary of the Atlas workspace.' },
      { path: 'workspace/connections', label: 'Connections', icon: 'connections', text: 'How the parts of Atlas and the services behind it connect.' },
      { path: 'workspace/ideas', label: 'Ideas', icon: 'ideas', text: 'Visions, feature ideas and deferred improvements.' }
    ] },
    { id: 'development', label: 'Development', items: [
      { path: 'development/environments', label: 'Environments', icon: 'environments', text: 'Local, staging and production, one click away.' },
      { path: 'development/releases', label: 'Releases', icon: 'releases', text: 'What has been released, and what is waiting to be.' },
      { path: 'development/workflows', label: 'Workflows', icon: 'workflows', text: 'The steps that take work from an idea to the live site.' },
      { path: 'development/analytics', label: 'Analytics', icon: 'analytics', text: 'How the site and its games are used.' }
    ] },
    { id: 'infrastructure', label: 'Infrastructure', items: [
      { path: 'infrastructure/services', label: 'Services', icon: 'services', text: 'The services Atlas runs on.' },
      { path: 'infrastructure/monitoring', label: 'Monitoring', icon: 'monitoring', text: 'The health of the site and its services.' }
    ] }
  ];

  ns.sections = { DEFAULT: 'workspace/connections', GROUPS, ICONS };
})();
