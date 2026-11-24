# Pergamon Atlas

A browser-gaming site: games now, with cognitive benchmarks, competitive
challenges and leaderboards planned for later phases.

Live site: https://pergamonatlas.com

**Start here:** [`CLAUDE.md`](CLAUDE.md) (rules, and which document covers what)
and [`docs/STATUS.md`](docs/STATUS.md) (what is released, active and open).

## Layout

```text
PergamonAtlas.V1/          the site Vercel serves (static HTML/CSS/JS, no page build)
├── index.html             Home
├── games/                 Games catalog + one folder per game
├── account/               Sign in / register / profile / password recovery
├── settings/              Appearance settings (display mode, colour palette)
├── handbook/              Atlas Handbook (administrators)
├── suggestions/  achievements/  leaderboards/  updates/  …   placeholders
├── scripts/
│   ├── theme.js  layout.js  home.js  account.js   page scripts
│   ├── components/        component library (widgets)
│   ├── grid/              Atlas Grid: engine, widget sizing, renderer, editor
│   ├── design/            design registries (typography, colours, surfaces)
│   ├── cms/               homepage CMS and Admin Mode
│   └── handbook/          Handbook pages
├── styles/                theme.css (tokens), typography.css (generated), …
├── data/                  entries.js (games catalog), home-content.js (static fallback)
├── operation/             shared legacy layer: Supabase auth, footer, main.css
├── images/                logo; featured/ holds web copies of featured artwork
├── vendor/                pinned third-party scripts (see its README)
└── ads.txt
artwork/source/            original artwork files (not deployed)
supabase/migrations/       legacy schema history, 0001–0006
supabase/proposed/         migrations 0007 onward (applied state: docs/STATUS.md)
supabase/functions/        Edge Functions (publish-media)
docs/design/               Handbook guide, vision
docs/cms/                  CMS architecture, staging, tests
tests/                     cms/ and design/ (node --test)
tools/                     build helpers: Supabase config, typography, vision
vercel.json                output directory, redirects, headers
```

Game pages and the Games catalog still draw their content area with the legacy
`operation/styles/main.css`; only their header, sidebar and footer follow the theme.

## Adding a page

In `<head>`: `theme.js`, the Google Fonts link, `theme.css`, `typography.css`
(right after `theme.css`; a test checks it), `layout.css`, `operation/styles/footer.css`.
In `<body>`:

```html
<div class="pa-page">
  <script src="/scripts/layout.js"></script>
  <div class="pa-layout">
    <main class="pa-main">...</main>
  </div>
  <div id="footer-placeholder"></div>
</div>
```

Copy an existing page (such as `settings/`) for the auth and footer scripts.

## Deploying

`main` deploys to production on every push. Other branches get Vercel preview
deployments. `tools/write-supabase-config.mjs` writes each build's Supabase
configuration; the committed copy is for local development (staging).

## History

The pre-V1 site (tools, Atlas Explorer, lexicons, archives) is preserved on the
`archive/pre-v1-reset-2026-11` and `legacy-backup-2026` branches.
