// Connections: the example shown until something is saved. Illustrative: it
// describes how the parts of Atlas relate, and nothing in it is connected.
(function (root) {
  'use strict';
  const N = (id, type, x, y, name, description, url) => ({ id, type, x, y, name, description, url: url || '', notes: '', props: {} });
  const C = (id, a, aPort, b, bPort, name, description, direction) => ({ id, source: { node: a, port: aPort }, target: { node: b, port: bPort }, name, description, direction: direction || 'forward', notes: '' });

  const seed = () => ({
    format: 'pergamon-atlas.connections', version: 1,
    nodes: [
      N('chatgpt', 'chatgpt', 0, 0, 'ChatGPT', 'Planning and review.', 'https://chatgpt.com/'),
      N('claude-code', 'claude-code', 0, 192, 'Claude Code', 'Builds and tests changes in the repository.', 'https://claude.com/product/claude-code'),
      N('vscode', 'vscode', 312, 0, 'VS Code', 'Where the code is read and edited.', 'https://code.visualstudio.com/'),
      N('github', 'github', 312, 192, 'GitHub', 'The repository.', 'https://github.com/'),
      N('vercel', 'vercel', 624, 192, 'Vercel', 'Builds and hosts the site.', 'https://vercel.com/'),
      N('supabase', 'supabase', 624, 384, 'Supabase', 'Accounts, the homepage’s content and images.', 'https://supabase.com/'),
      N('cloudflare', 'cloudflare', 624, 0, 'Cloudflare', 'Domain and network.', 'https://www.cloudflare.com/'),
      N('atlas', 'pergamon-atlas', 936, 192, 'Pergamon Atlas', 'The live website.', 'https://pergamonatlas.com/'),
      N('handbook', 'handbook', 936, 0, 'Handbook', 'The design system, inside the site.', '/handbook/')
    ],
    connections: [
      C('chatgpt-claude', 'chatgpt', 'bottom', 'claude-code', 'top', 'Plans', 'Milestones are written up and handed over.'),
      C('claude-github', 'claude-code', 'right', 'github', 'left', 'Commits', 'Approved changes, on a development branch.'),
      C('vscode-github', 'vscode', 'bottom', 'github', 'top', 'Edits', 'Local work and the repository.', 'both'),
      C('github-vercel', 'github', 'right', 'vercel', 'left', 'Deploys', 'A push to the main branch is deployed.'),
      C('vercel-atlas', 'vercel', 'right', 'atlas', 'left', 'Serves', 'The site’s static files.'),
      C('cloudflare-vercel', 'cloudflare', 'bottom', 'vercel', 'top', 'Domain', 'Brings visitors to the host.'),
      C('supabase-atlas', 'supabase', 'right', 'atlas', 'bottom', 'Data', 'Accounts and published content.', 'both'),
      C('handbook-atlas', 'handbook', 'bottom', 'atlas', 'top', 'Documents', 'The Handbook describes the site’s design.')
    ]
  });

  if (typeof module === 'object' && module.exports) module.exports = { seed };
  else root.PergamonStudio.connections.seed = seed;
})(typeof window !== 'undefined' ? window : globalThis);
