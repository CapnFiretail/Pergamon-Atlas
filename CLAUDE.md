# Pergamon Atlas: agent guide

The shared starting point for every AI agent (Claude, ChatGPT, others).
Permanent rules and routing only: current state is in `docs/STATUS.md`, facts
are in the files routed below. Link to them; don't copy them here.

A browser-gaming site: static HTML/CSS/JS in `PergamonAtlas.V1/` (Vercel
output directory), Supabase for accounts and the homepage CMS.

## Reading

1. This file, then `docs/STATUS.md`. Nothing else by default.
2. Then only the sections your task routes to. List a document's headings
   (`grep -n "^##" <file>`) and read that section's lines, not the file.
3. In code, search for the symbol first. The comment at the top of each
   script is its contract; read that before the body.
4. Reuse what is already in context; retrieve more only when the task needs it.
   Start a new session per milestone.

Don't load unless the task is about them: `PergamonAtlas.V1/vendor/`,
generated files (below), `*/package-lock.json`, `tests/cms/fixtures/`,
`.claude/worktrees/`, `PergamonAtlas.Legacy/`, `review/`, and the records
`docs/design/ARCHITECTURE_REVIEW_H1.md` and `docs/cms/PRODUCTION-ROLLOUT.md`.

## Rules

- **Ask before each** commit, push, merge, deployment, database change, admin
  write or publish. Approval covers that step only. Stop when asked to stop.
- **A push to `main` deploys to production.** Work on a development branch.
- **Production writes** (SQL, Admin Mode saves and publishes) are done by the
  user. Check the project first: production `rddijjezqrcjrnwskenb`, staging
  `rambkiswuigtjfgdxexk`. Never run tests that write against production.
- **Never print or commit secrets.** The GitHub repository is public, docs
  included, as is the Handbook's source.
- **Stay within the task.** No unrelated improvements; mention them instead.
- **Match validation to risk.** Test what the change could break; don't repeat
  checks that already passed on the same code.
- **Plain HTML/CSS/JS.** No framework, page build step or new infrastructure
  unless approved. Build what the task needs now; reuse before adding.
- **Never hand-edit generated files:** `styles/typography.css` (from
  `scripts/design/typography.js`), `scripts/handbook/vision-content.js` (from
  `docs/design/ATLAS_VISION.md`). Edit the source and run its `tools/` script.
- **Inline `<script>`/`<style>` blocks** have CSP hashes in `vercel.json`;
  changing one means changing its hash.
- **Interface checks are not security.** The server enforces every write.
  Guests and members see no sign of the Handbook or Admin Mode.
- **Rolling back:** restore a schema-1 homepage before rolling the front end
  back to one that can't read schema 2.
- **Leave alone** game logic, `ads.txt`, and untracked files you didn't make.
- Run browser suites one at a time (this machine is short of memory).
- Report only what was verified; say what was skipped or user-reported.

## Routing

Paths under `scripts/`, `styles/` and `data/` are in `PergamonAtlas.V1/`.

| Task | Read |
|---|---|
| Where something lives | `README.md` › Layout; `docs/design/HANDBOOK.md` › Files |
| Add or change a widget | `docs/design/HANDBOOK.md` › Adding a widget type, The component library; then `scripts/components/<name>.js` header, its entry in `scripts/grid/widget-types.js` |
| Grid, sizing, renderer, editing engine | Headers of `scripts/grid/*.js` |
| Homepage drawing | `scripts/home.js` header; `docs/cms/ARCHITECTURE.md` §11 |
| Content document and fields | `docs/cms/ARCHITECTURE.md` §3 (schema 1), §11 (schema 2); `scripts/cms/content.js` |
| Admin Mode | `docs/cms/ARCHITECTURE.md`: §5a mode, §5b cards, §5c images, §5d publishing, §5e collections and history, §5f navigation, §12 Layout Mode |
| Database, access, media | `docs/cms/ARCHITECTURE.md` §2–4; the one migration in `supabase/proposed/` |
| Staging | `docs/cms/STAGING.md` › Keeping production isolated |
| Colours, spacing, surfaces | `styles/theme.css` (values); `scripts/design/colors.js`, `surfaces.js` (uses) |
| Typography | `scripts/design/typography.js` (the role); `HANDBOOK.md` › Connecting a component to a role |
| Handbook pages | `HANDBOOK.md` › Adding a section; `scripts/handbook/handbook.js` header |
| Header, sidebar, themes | Headers of `scripts/layout.js`, `scripts/theme.js` |
| New page | `README.md` › Adding a page |
| Direction and principles | `docs/design/ATLAS_VISION.md`, the relevant section; `HANDBOOK.md` › Built and planned |
| Tests and checks | `docs/cms/TESTING.md` › Run |

## Finishing a milestone

1. Run the checks the change calls for (`docs/cms/TESTING.md` › Run).
2. Update the affected documentation where the fact already lives. One fact,
   one place: code and registries first, then docs; others link to it.
3. Update `docs/STATUS.md`: replace outdated lines, don't append a history.
4. Report briefly: **changes, validation, outstanding issues, next steps.**
