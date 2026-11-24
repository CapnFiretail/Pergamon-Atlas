# Atlas Studio

An internal workspace for administrators, at `/studio/`, inside the normal
site (header, footer, themes). Built so far: the page, its access check and its
navigation (S1.1), and the Connections editor (S2). Every other section is a
placeholder.

## Files

| File | Role |
|---|---|
| `PergamonAtlas.V1/studio/index.html` | The page: an empty `#studio-root` until access is decided. `noindex`. |
| `PergamonAtlas.V1/scripts/studio/entry.js` | The header's Studio icon. Loaded right after the Handbook's `entry.js` on the homepage, the Handbook and the Studio. |
| `PergamonAtlas.V1/scripts/studio/gate.js` | Shows the Studio (and only then loads its code) or the generic access-denied notice. |
| `PergamonAtlas.V1/scripts/studio/sections.js` | **The sections: the source of truth** (groups, icons, the default section). |
| `PergamonAtlas.V1/scripts/studio/studio.js` | The shell: routes, the site sidebar's destinations, breadcrumbs, placeholders, section renderers. |
| `PergamonAtlas.V1/scripts/studio/ui.js` | Controls shared by sections: buttons and icons (from the canvas design), View / Edit control, modal dialog. |
| `PergamonAtlas.V1/styles/studio.css` | Layout and those controls except buttons (colours from theme tokens, text from type roles). |
| `PergamonAtlas.V1/scripts/studio/connections/` | The Connections section, below. |
| `PergamonAtlas.V1/styles/studio-connections.css` | Its panel and Node Library. |
| `PergamonAtlas.V1/styles/canvas-kit.css`, `scripts/design/canvas-kit.js` | The canvas design Connections shares with the Atlas Grid's editors: frame, toolbar, buttons, floating controls, selection (`HANDBOOK.md` › Files). |
| `tests/design/studio.test.mjs` | Sections, and which pages load Studio files. |
| `tests/design/connections.test.mjs` | Connections without a browser: geometry, registry, document, storage, store. |

## Access

The Handbook's check (`PergamonHandbook.access`, `HANDBOOK.md` › Access), with
the same rules: nothing is shown or downloaded beyond `entry.js` (and `gate.js`
on `/studio/`) until the server confirms an administrator, and signing out
replaces the Studio with the notice at once. The Studio's files can still be
fetched by URL, and the repository is public: nothing confidential goes in
them. Anything the Studio may read or change later must be enforced by the
server.

The header shows Studio, Handbook, Admin Mode, in that order; the Handbook's
icon stays next to Admin Mode's.

## Navigation

One sidebar, as in the Handbook (`HANDBOOK.md` › Navigation: one sidebar), with
its own expanded / collapsed preference. Addresses are `#/<group>/<id>`;
`/studio/` and unknown addresses show the default section.

## Connections

A map of nodes (services) and the connections between them, at
`/studio/#/workspace/connections`. **Descriptive only:** nothing on it is linked
to a live service, and nothing is sent anywhere. View looks around and reads;
Edit changes a working copy; Save stores it.

| Layer | File | Knows about |
|---|---|---|
| Canvas: geometry, renderer, interaction | `scripts/canvas/*.js`, `styles/canvas.css` | Nodes, curves, a view. Content-neutral; conventions and controls: Handbook › Foundations › Node Canvas. |
| Service definitions | `connections/registry.js` | Identity, logo, starting URL, field definitions. Permanent, in code. |
| Document | `connections/document.js` | The versioned JSON, its checks and every operation on it. Pure. |
| State | `connections/store.js` | Saved copy, working copy, undo history (`PergamonGrid.editor.createHistory`). |
| Storage | `connections/storage.js` | Where it is kept, behind one interface. |
| Interface | `connections/page.js` (wiring), `inspector.js`, `library.js`, `seed.js` (the example) | The rest. |

Each file's header is its contract.

- **Definitions and instances.** A node stores its definition's `type` and its
  own name, description, URL and notes. Any number of instances of a type; the
  type (so the identity and logo) can't change after creation. A type is never
  renamed or reused, because saved documents refer to it.
- **Service-specific properties** go in a definition's `fields` (the same shape
  as `NODE_FIELDS`); values are kept in the node's `props`, and the panel, the
  checks and import already read them. None are defined yet.
- **Connections** are objects of their own: a stable id, source and target
  (node id and port), name, description, direction and notes.
- **Versions.** A change of shape raises `VERSION` and adds a step to
  `MIGRATIONS`. A newer document, an unknown service or an unusable value
  refuses the whole document; unknown properties are dropped.
- **Saved** in this browser (`localStorage`), with a revision: a copy another
  tab saved since is never overwritten without asking. First use shows the
  example and stores nothing until Save. A stored copy that can't be read is
  left alone until a save replaces it.
- **Unsaved changes** ask before leaving Edit, the section or the page. A reload
  or losing access keeps them for that tab (`sessionStorage`) and restores them.
- **Privacy.** Stored data stays in the browser after signing out, readable by
  anyone using that browser profile. Never put credentials in it; addresses
  with sign-in details, and anything but `http(s)` or a site page, are refused.
- **Towards Supabase.** A server storage implements the same interface
  (asynchronous, revisions, `conflict`); `page.js` chooses the storage. It needs a
  migration and server checks, which must repeat `document.js`'s.

**Adding a service:** one definition in `registry.js` (and the list in
`connections.test.mjs`).

**Deferred:** custom nodes; service-specific properties; live integrations and
status; saving to Supabase and sharing between administrators; version history;
selecting several nodes, copy and paste, alignment; groups and several maps;
choosing a curve's route; a minimap; controls that thin out on very small nodes
(on a phone, zoom in to edit).

## Planned sections

- **Development › Environments** (placeholder only, no integrations yet):
  - one-click access to the local, staging and production previews
  - each environment's status
  - deployment metadata
  - visual comparisons between environments
- **Claude Code Analytics** (planned, not started): its scope, data source and
  place in the navigation are not decided. Separate from the Development ›
  Analytics placeholder, which is about how the site and its games are used.

## Adding a section

Add it to `GROUPS` in `sections.js` (it appears as a placeholder), then register
a renderer, `PergamonStudio.app.register('<group>/<id>', { render(el, ctx) })`,
from its own script listed in `gate.js`. `ctx.onCleanup(fn)` runs when the
section is left or access is lost.
