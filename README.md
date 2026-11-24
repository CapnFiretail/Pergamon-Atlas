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
├── games/                 Games page + one folder per game
├── account/               Sign in / register / profile / password recovery
├── settings/              Appearance settings (display mode, colour palette)
├── handbook/              Atlas Handbook (administrators)
├── studio/                Atlas Studio (administrators)
├── suggestions/  achievements/  leaderboards/  updates/  …   placeholders
├── scripts/
│   ├── theme.js  layout.js  account.js  …   site and page scripts
│   ├── page.js  page-widgets.js   the page renderer; home.js, games.js: a page's own part
│   ├── components/        component library (widgets)
│   ├── grid/              Atlas Grid: engine, widget sizing, renderer, editor
│   ├── canvas/            node canvas: geometry, renderer, interaction
│   ├── design/            design registries (typography, colours, surfaces)
│   ├── cms/               page and widget registries, CMS and Admin Mode
│   ├── handbook/          Handbook pages
│   └── studio/            Studio shell and sections (connections/, ideas/, …)
├── styles/                theme.css (tokens), typography.css (generated), …
├── data/                  entries.js (game records), home-content.js and games-content.js
│                          (built-in page content)
├── operation/             shared legacy layer: Supabase auth, footer, main.css
├── images/                logo; featured/ holds web copies of featured artwork
├── vendor/                pinned third-party scripts (see its README)
└── ads.txt
artwork/source/            original artwork files (not deployed)
supabase/migrations/       legacy schema history, 0001–0006
supabase/proposed/         migrations 0007 onward (applied state: docs/STATUS.md)
supabase/functions/        Edge Functions (publish-media)
docs/DEVELOPMENT.md        environments and the local development server
docs/design/               Handbook and Studio guides, vision
docs/cms/                  CMS architecture, staging, tests
tests/                     cms/ and design/ (node --test), site/ (browser)
tools/                     build helpers: Supabase config, typography, vision;
                           the local development server (dev-server.*)
vercel.json                output directory, redirects, headers
```

Game pages still draw their content area with the legacy
`operation/styles/main.css`; only their header, sidebar and footer follow the theme.

## Adding a page

For a page edited in Admin Mode, see `docs/design/HANDBOOK.md` › Making a page
editable. For any other:

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
configuration; the committed copy is for local development (staging), at
http://localhost:4173 ([`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)).

## History

The pre-V1 site (tools, Atlas Explorer, lexicons, archives) is preserved on the
`archive/pre-v1-reset-2026-11` and `legacy-backup-2026` branches.
