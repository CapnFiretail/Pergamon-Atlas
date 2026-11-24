// Atlas Studio › Development › Environments: where Atlas runs, one card each,
// opening in a new tab. Links only: nothing is fetched from the environments.
//
// Local answers on the development computer while its server runs
// (docs/DEVELOPMENT.md). Staging is Vercel's address for the development branch
// (always its newest preview): a differently named branch has another address.
(function () {
  'use strict';
  const ns = window.PergamonStudio = window.PergamonStudio || {};

  const ENVIRONMENTS = [
    { id: 'local', name: 'Local', url: 'http://localhost:4173/', icon: 'local',
      text: 'Your working files, uncommitted changes included. On this computer only, with staging data.' },
    { id: 'staging', name: 'Staging', url: 'https://pergamon-atlas-git-development-v-778ce8-cms12306-9421s-projects.vercel.app/', icon: 'staging',
      text: 'The newest preview of the development branch, with staging data. Asks for a Vercel sign-in.' },
    { id: 'production', name: 'Production', url: 'https://pergamonatlas.com/', icon: 'production',
      text: 'The live site, as visitors see it.' }
  ];

  function render(view, { el, header, icon }) {
    view.append(header('Environments', 'Open Atlas where it runs. Each opens in a new tab.'));
    const list = el('ul', 'st-cards');
    ENVIRONMENTS.forEach(e => {
      const a = el('a', 'st-card');
      a.href = e.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const name = el('span', 'st-card-name pa-type-section-title', e.name);
      name.append(el('span', 'pa-visually-hidden', ' (opens in a new tab)'));
      const head = el('span', 'st-card-head');
      head.append(icon(e.icon, 'st-icon st-card-icon'), name, icon('open', 'st-icon st-card-open'));
      a.append(head, el('span', 'st-card-text pa-type-body-small', e.text), el('span', 'st-card-address pa-type-caption', new URL(e.url).host));
      const li = el('li');
      li.append(a);
      list.append(li);
    });
    view.append(list);
  }

  ns.environments = { ENVIRONMENTS };
  ns.app.register('development/environments', { render });
})();
