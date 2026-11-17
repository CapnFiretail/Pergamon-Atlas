# Pergamon Atlas

A browser-gaming site: games now, with cognitive benchmarks, competitive
challenges and leaderboards planned for later phases.

Live site: https://pergamonatlas.com

## Layout

```text
PergamonAtlas.V1/          the site Vercel serves (static HTML/CSS/JS, no build)
├── index.html             Home
├── games/                 Games catalog + one folder per game
├── suggestions/           Suggestions (placeholder until the form ships)
├── account/               Sign in / register / profile
│   └── reset-password/    Password recovery landing page
├── scripts/  styles/      V1 page scripts and styles (nav.js wires the sidebar)
├── data/                  entries.js (games catalog), home-content.js (homepage)
├── operation/             Shared legacy layer: Supabase auth, footer, main.css
├── images/                Logo
└── ads.txt
supabase/migrations/       Database schema history (reference only; not deployed)
vercel.json                Output directory + redirects for retired routes
```

## Navigation

Every page carries the same header (Home, Games, Suggestions, Account icon)
and collapsible sidebar inline. On phones the sidebar becomes a bottom tab
bar. `scripts/nav.js` highlights the current section.

## Deploying

`main` deploys to production on every push. Other branches get Vercel preview
deployments.

## Auth

Supabase (project `rddijjezqrcjrnwskenb`). The public URL and publishable key
live in `operation/scripts/auth/supabase-config.js`. Never commit a
service-role key.

## History

The pre-V1 site (tools, Atlas Explorer, lexicons, archives) is preserved on the
`archive/pre-v1-reset-2026-11` and `legacy-backup-2026` branches.
