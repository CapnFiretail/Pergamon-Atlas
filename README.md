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
├── achievements/          Placeholder (Coming Soon)
├── leaderboards/          Placeholder (Coming Soon)
├── updates/               Update Log placeholder (Coming Soon)
├── scripts/  styles/      V1 page scripts and styles (see Design system below)
├── data/                  entries.js (games catalog), home-content.js (homepage)
├── operation/             Shared legacy layer: Supabase auth, footer, main.css
├── images/                Logo; featured/ holds web copies of featured artwork
└── ads.txt
artwork/source/            Original artwork files (not deployed)
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
  `SIDEBAR_SECTIONS` there to change navigation. On most pages the sidebar
  is a fixed full-height rail. The homepage sets `data-layout="home"` on
  `.pa-page`, and `scripts/home.js` mounts the same sidebar into its own
  grid (`PergamonLayout.mountSidebar`) as a rounded rail beside the upper
  section, so the carousel can run beneath it. The sidebar starts collapsed
  (80px) until a visitor expands it (220px); that choice is saved in
  `localStorage["paSidebarCollapsed"]`.

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

### Featured and spotlight cards

The homepage's two game cards are built by `featureCard()` in
`scripts/home.js` from `featured` (260px, button under the title) and
`spotlight` (140px, button on the right) in `data/home-content.js`. Each
takes a title, `href`, `cta` and `art`:

- `src`, `srcset`, `width`, `height`, and `alt` (empty when decorative).
- Default fit is "cover", cropped with `focus`/`focusNarrow` (CSS
  `object-position`).
- `fit: 'height'` suits art much narrower than its card: the image is
  `scale` × the card height (`scaleNarrow` on phones), centred at `x`
  (`xNarrow`; `calc()` allowed), with `y` placed at the card's middle, and
  its sides fade into `base` (the card colour).

The title, ornament rules and Play Now button are HTML/CSS and take the
palette's accent; the cards stay dark in every mode. To change either game,
add its artwork to `images/featured/` (keep the original in
`artwork/source/`) and edit the data; no CSS or HTML edits are needed.

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
