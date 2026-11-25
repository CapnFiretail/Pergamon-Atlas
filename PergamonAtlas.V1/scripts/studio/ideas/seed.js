// Ideas: the starting collection, shown until something is saved and never
// again. Not a roadmap, a task list or instructions: nothing here is approved
// or to be built because it is listed (CLAUDE.md › Rules). Changing this file
// changes no collection that has been saved.
(function (root) {
  'use strict';
  const ADDED = '2026-11-24';                  // unless an idea has its own, third
  const LISTS = {
    vision: [
      ['Atlas of the Digital World', 'An explorable universe of games, tools, knowledge, archives and digital experiences.'],
      ['Studio as a central workspace', 'Manage Atlas development from one cohesive environment.'],
      ['Connected AI ecosystem', 'Connect ChatGPT, Claude Code and the repository.'],
      ['Background AI agents', 'Perform development, research and maintenance tasks in the background.'],
      ['AI orchestration', 'Coordinate multiple AI agents and responsibilities through Studio.'],
      ['No-code page builder', 'Build entire pages from approved Handbook components under enforced design constraints.']
    ],
    studio: [
      ['Functional Connections', 'Evolve descriptive connections into actual integrations.'],
      ['Custom node library', 'Create reusable custom service definitions.'],
      ['Service-specific node properties', 'Support configuration relevant to each service.'],
      ['Connections persistence', 'Synchronize maps across environments and devices.'],
      ['Connections version history', 'Retain previous versions of maps.'],
      ['Workflow management', 'Organize and track development tasks.'],
      ['Release management', 'View commits, versions and deployment history.'],
      ['Infrastructure monitoring', 'Monitor service and infrastructure health.'],
      ['Environment comparison', 'Compare local, staging and production views side by side.'],
      ['Live environment information', 'Display branches, commits, deployment times and availability.'],
      ['Local server controls', 'Manage the persistent server through Studio.'],
      ['Design workspace', 'Feature briefs, visual references and design handoffs.']
    ],
    workflow: [
      ['Claude Code Analytics', 'Dedicated development analytics dashboard.'],
      ['Automatic session collection', 'Collect metrics from local Claude session records.'],
      ['Token and cost tracking', 'Track consumption, limits and API-equivalent costs.'],
      ['Context efficiency', 'Analyze context size and caching.'],
      ['Model comparison', 'Compare Opus, Sonnet and Haiku.'],
      ['Milestone analytics', 'Associate sessions, costs, duration, commits and code changes with milestones.'],
      ['Automated documentation', 'Keep documentation synchronized with implementation.'],
      ['Reduced manual prompting', 'Reduce repeated copy-and-paste operations.'],
      ['Shared AI context', 'Maintain consistent authoritative information across AI assistants.']
    ],
    handbook: [
      ['Complete component catalogue', 'Catalogue reusable widgets, elements, layouts and source references.'],
      ['Component usage tracking', 'Identify where components are used.'],
      ['Reusable layout templates', 'Save approved page structures.'],
      ['Design constraint enforcement', 'Ensure new pages follow Atlas design rules.'],
      ['Motion standards', 'Consistent animations and transitions.'],
      ['Canvas visual refinement', 'Revisit provisional Layout Mode and Layout Lab styling.'],
      ['Editing experience refinement', 'Improve selection, resizing, zoom and controls.'],
      ['Typography refinement', 'Maintain coherent page-specific typography.']
    ],
    content: [
      ['Site-wide Admin Mode', 'Extend editing beyond the homepage.'],
      ['Dynamic page creation', 'Create and publish pages without editing source code.'],
      ['Advanced widget management', 'Configure, switch and reuse widgets across pages.'],
      ['Editable update log', 'Manage announcements and update history.'],
      ['Carousel management improvements', 'Expand content and configuration capabilities.'],
      ['Centralized content management', 'Manage existing Atlas content cohesively.']
    ],
    site: [
      ['Homepage evolution', 'Explore the homepage’s identity and experience.'],
      ['Chess Forge 2.0', 'Significantly improve the chess experience.'],
      ['Game revisions', 'Refine existing games.'],
      ['Suggestions system', 'Revisit collecting user suggestions.'],
      ['Atlas navigation redesign', 'Improve the navigation widget.'],
      ['Sidebar refinement', 'Improve sidebar design and organization.'],
      ['Carousel refinement', 'Improve the public carousel experience.'],
      ['Artwork generation workflow', 'Consistent artwork sizing, positioning, fading and style.'],
      ['Game asset design', 'Cohesive chess pieces and other interactive game assets.'],
      ['Game Catalog Widget Refinement', 'Revisit the game catalog widget\'s visual design, card proportions, spacing, information hierarchy, responsive behavior and overall presentation. Preserve the existing shared Game Library and widget architecture.', '2026-11-25']
    ],
    technical: [
      ['Automatic server startup', 'Start at Windows sign-in.'],
      ['Local server crash recovery', 'Restart the server automatically if it stops.'],
      ['Multiple development worktrees', 'Support parallel AI development and isolated previews.'],
      ['Independent local test data', 'Explore separating local test content from staging if needed.']
    ]
  };
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const seed = () => ({
    format: 'pergamon-atlas.ideas', version: 1,
    ideas: Object.keys(LISTS).flatMap(category => LISTS[category].map(([title, description, added]) => ({ id: slug(title), title, description, category, status: 'captured', added: added || ADDED, notes: '' })))
  });

  if (typeof module === 'object' && module.exports) module.exports = { seed };
  else root.PergamonStudio.ideas.seed = seed;
})(typeof window !== 'undefined' ? window : globalThis);
