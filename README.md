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
├── settings/              Appearance settings (display mode, colour palette)
├── scripts/  styles/      V1 page scripts and styles (see Design system below)
├── data/                  entries.js (games catalog), home-content.js (homepage)
├── operation/             Shared legacy layer: Supabase auth, footer, main.css
├── images/                Logo
└── ads.txt
supabase/migrations/       Database schema history (reference only; not deployed)
supabase/proposed/         Reviewed-but-unapplied migrations
vercel.json                Output directory + redirects for retired routes
```

## Design system

- `styles/theme.css`: semantic colour tokens (`--color-background`,
  `--color-surface`, `--color-accent`, ...) for four palettes × dark/light,
  plus the font stacks. Shared components use only these tokens.
- `scripts/theme.js`: loaded synchronously in every `<head>`. Reads the saved
  appearance (`localStorage["pa-appearance"]`) and sets `data-palette`,
  `data-mode` and `data-sidebar` on `<html>` before first paint. Guests
  always get Obsidian & Gold; signed-in users may pick any palette.
- `scripts/layout.js` + `styles/layout.css`: the header, sidebar and mobile
  drawer, rendered from one nav config. Edit `HEADER_LINKS` /
  `SIDEBAR_SECTIONS` there to change navigation.

A new page needs, in `<head>`: `theme.js`, the Google Fonts link,
`theme.css`, `layout.css`; and in `<body>`:

```html
<div class="pa-page">
  <script src="/scripts/layout.js"></script>
  <div class="pa-layout">
    <main class="pa-main">...</main>
  </div>
  <div id="footer-placeholder"></div>
</div>
```

Game pages and the Games catalog still draw their content area with the
legacy `operation/styles/main.css`; only their header, sidebar and footer
follow the theme.

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
