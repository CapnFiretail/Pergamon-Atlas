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
├── vendor/                Pinned third-party scripts (supabase-js; see its README)
└── ads.txt
artwork/source/            Original artwork files (not deployed)
supabase/migrations/       Database schema history (reference only; not deployed)
supabase/proposed/         Reviewed-but-unapplied migrations (CMS: 0008–0010)
supabase/functions/        Edge Functions (publish-media; not deployed yet)
docs/cms/                  CMS architecture, staging setup, tests
tests/cms/                 CMS tests (node --test; dev tooling only)
tools/                     Build helpers (write-supabase-config.mjs; not wired yet)
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

### Homepage cards

The featured card (260px, button under the title), the spotlight (140px,
button on the right) and the carousel cards are described by one CMS
content document (`document` in `data/home-content.js`, schema v1; the same
format the CMS stores and publishes — see `docs/cms/ARCHITECTURE.md`).
`scripts/cms/content.js` translates it into the renderer's model, and
`scripts/home.js` draws it. Each card is addressed by a stable component id
(`home.featured`, `home.spotlight`, `home.carousel.<id>`) and can be redrawn
in place with `window.PergamonHome.render(document)`.

Image settings (`art`) are numbers, never CSS:

- `source`: `{ static: '/images/featured/…' }` or `{ media: '<id>' }`; size
  details for static images live in `staticImages`. `alt` is empty when the
  art is decorative.
- Default fit is "cover": `focus` / `focusNarrow` (`{x, y}` percent) set the
  crop and `scale` / `scaleNarrow` zoom around it.
- `fit: 'height'` suits art much narrower than its card: the image is
  `scale` × the card height (`scaleNarrow` on phones), positioned by
  `anchor` / `anchorNarrow` (`{x` percent, `offset` px, `y` percent`}`), and
  its sides fade into `base` (the card colour).
- Carousel cards take the same cover settings; without `art` they show the
  "Artwork" placeholder.

The title, ornament rules and Play Now button are HTML/CSS and take the
palette's accent; the cards stay dark in every mode. To change a game, add
its artwork to `images/featured/` (keep the original in `artwork/source/`)
and edit the document; no CSS or HTML edits are needed.

Where the CMS is live (development and staging previews; see
`scripts/cms/loader.js`), administrators get **Admin Mode** on the homepage:
`scripts/cms/admin.js` asks the server (`is_admin()`) before building
anything, then adds a header button with the Admin Mode switch, "View as"
Admin / User / Guest and a (for now disabled) Publish Changes button. In
Admin view every card the document addresses gets a frame and a pencil; the
pencil opens the card editing drawer (`scripts/cms/drawer.js`), whose
fields come from the schema in `scripts/cms/content.js`. Edits show on the
page at once, stay in the browser until **Save Draft** (`save_draft`), and
never overwrite another administrator's draft (see
`docs/cms/ARCHITECTURE.md` §5b). The editor's scripts and styles
(`styles/cms-admin.css`) load only for verified administrators.

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
