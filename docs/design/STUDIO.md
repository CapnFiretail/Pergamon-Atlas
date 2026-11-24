# Atlas Studio

An internal workspace for administrators, at `/studio/`, inside the normal
site (header, footer, themes). Built so far: the page, its access check and its
navigation (S1.1), the Connections editor (S2), Environments (S4) and Ideas (S5).
Every other section is a placeholder.

## Files

| File | Role |
|---|---|
| `PergamonAtlas.V1/studio/index.html` | The page: an empty `#studio-root` until access is decided. `noindex`. |
| `PergamonAtlas.V1/scripts/studio/entry.js` | The header's Studio icon. Loaded right after the Handbook's `entry.js` on the homepage, the Handbook and the Studio. |
| `PergamonAtlas.V1/scripts/studio/gate.js` | Shows the Studio (and only then loads its code) or the generic access-denied notice. |
| `PergamonAtlas.V1/scripts/studio/sections.js` | **The sections: the source of truth** (groups, icons, the default section). |
| `PergamonAtlas.V1/scripts/studio/studio.js` | The shell: routes, the site sidebar's destinations, breadcrumbs, placeholders, section renderers. |
| `PergamonAtlas.V1/scripts/studio/environments.js` | Development › Environments, below. |
| `PergamonAtlas.V1/scripts/studio/storage.js`, `store.js`, `document-flow.js` | **Saved documents**, below: where one is kept, its state and undo history, and its actions (save and conflicts, discard, leaving, import, export). |
| `supabase/proposed/0015_studio_documents.sql`, `verify_0015.sql` | Their database part. |
| `PergamonAtlas.V1/scripts/studio/ideas/`, `styles/studio-ideas.css` | The Ideas section, below. |
| `PergamonAtlas.V1/scripts/studio/ui.js` | Controls shared by sections: buttons and icons (from the canvas design), View / Edit control, modal dialog. |
| `PergamonAtlas.V1/styles/studio.css` | Layout, the cards and those controls except buttons (colours from theme tokens, text from type roles). |
| `PergamonAtlas.V1/scripts/studio/connections/` | The Connections section, below. |
| `PergamonAtlas.V1/styles/studio-connections.css` | Its panel and Node Library. |
| `PergamonAtlas.V1/styles/canvas-kit.css`, `scripts/design/canvas-kit.js` | The canvas design Connections shares with the Atlas Grid's editors: frame, toolbar, buttons, floating controls, selection (`HANDBOOK.md` › Files). |
| `tests/design/studio.test.mjs` | Sections, and which pages load Studio files. |
| `tests/design/connections.test.mjs` | Connections without a browser: geometry, registry, document, the store with it. |
| `tests/design/ideas.test.mjs` | Ideas without a browser: document, starting collection. |
| `tests/design/studio-documents.test.mjs` | Saved documents against a stand-in server (`studio-server.mjs`): failures, sharing, unsaved work, moving a browser’s copy. |
| `tests/cms/studio-documents.test.mjs` | 0015 on the emulated Supabase: access, checks, conflicts, and the storage and store through it. |

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

## Saved documents

Connections and Ideas are each one versioned JSON document, saved in the
environment's own database and shared by every administrator. Local and staging
use staging's; production uses production's: the code asks the project its build is
configured for (`cms/STAGING.md` › Keeping production isolated) and names no other.
The interface says which: "Saved in staging".

- **Database** (migration 0015; its header is the contract): one row per document
  kind, with a revision. Browsers can't touch the tables; the two functions check
  `is_admin()` themselves and anonymous callers can't run them. The server checks
  who, the kind, format, version, lists, ids and size (2 MB); fields are checked by
  each section's `document.js`, completely, in every browser that reads one, so a
  new service, category or field needs no migration.
- **Saving is explicit** and all or nothing, based on the revision that was opened.
  If another was saved since, nothing is written and the user chooses; a copy nothing
  saved is behind (the example, a browser's own) can't replace a saved one.
  "Saved" is shown only once the server answers with the new revision. There is
  no live updating: a newer copy shows on opening the section or coming back to the
  page, unless there is unsaved work. No history is kept; Export is the backup.
- **First use** shows the example or starting collection and stores it only on Save.
  Only the server's explicit "nothing saved" counts: an empty document is a saved
  one, and no answer is not an answer.
- **When the database doesn't answer:** opening says so, with Try again, and there is
  nothing to edit or seed. A failed save says why, and the work stays; Export works.
  A save whose answer was lost is recognised on the next try.
- **Unsaved changes** ask before leaving Edit, the section or the page. A reload or
  losing access keeps them for that tab (`sessionStorage`) and restores them. If
  the database is away then, they can be downloaded.
- **Copies saved in a browser** before 0015 (`localStorage`) are never changed and
  never moved or removed by themselves. If nothing is saved yet, the browser's copy is
  shown, with **Move to staging** (or production). If something is, the copy is only
  mentioned: to use it, download and import it. Removing it is offered afterwards,
  asks, and first checks that a saved document exists.
- **Privacy.** Every administrator sees them, and unsaved work stays in the tab.
  Never put credentials in one.

**Adding a kind:** a migration with one row in `studio_document_kinds`; a
`document.js` with that format; a page that uses the three shared files.

**Releasing:** 0015 goes before the code, in staging and in production. Before the
first save the front end can be rolled back freely; after it, older code shows
each browser's own copy again, and the saved documents wait in the database.

## Connections

A map of nodes (services) and the connections between them, at
`/studio/#/workspace/connections`. **Descriptive only:** nothing on it is linked
to a live service, and nothing is sent anywhere. View looks around and reads;
Edit changes a working copy; Save stores it (Saved documents, above).

| Layer | File | Knows about |
|---|---|---|
| Canvas: geometry, renderer, interaction | `scripts/canvas/*.js`, `styles/canvas.css` | Nodes, curves, a view. Content-neutral; conventions and controls: Handbook › Foundations › Node Canvas. |
| Service definitions | `connections/registry.js` | Identity, logo, starting URL, field definitions. Permanent, in code. |
| Document | `connections/document.js` | The versioned JSON, its checks and every operation on it. Pure. |
| State | `store.js` (shared) | Saved copy, working copy, undo history (`PergamonGrid.editor.createHistory`). |
| Storage | `storage.js` (shared) | Where it is kept, behind one interface. |
| Actions | `document-flow.js` (shared) | Save, conflicts, discard, leaving, import and export. |
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
- **Addresses** with sign-in details, and anything but `http(s)` or a site page,
  are refused.

**Adding a service:** one definition in `registry.js` (and the list in
`connections.test.mjs`).

**Deferred:** custom nodes; service-specific properties; live integrations and
status; live updating and version history (Ideas too);
selecting several nodes, copy and paste, alignment; groups and several maps;
choosing a curve's route; a minimap; controls that thin out on very small nodes
(on a phone, zoom in to edit).

## Ideas

A searchable collection of visions, feature ideas and deferred improvements, at
`/studio/#/workspace/ideas`, filtered by category and status. **Not a roadmap, task
queue or requirement:** nothing in it is approved, and a status (Captured,
Exploring, Planned, Completed) describes an idea without authorizing work on it.

- **Document:** `ideas/document.js` (its header is the contract): versioned JSON
  with a stable id, title, description, category, status, date added and notes
  for each idea. The categories and statuses are lists there; a value is never
  renamed or reused, because saved collections refer to it.
- **Starting collection:** `ideas/seed.js`; changing the file changes no saved
  collection.
- **Editing** opens an idea in its place; changes go to the working copy, and
  Save stores them (Saved documents, above). Deleting asks first. Import replaces
  the whole collection.

**Deferred:** categories of the user's own; merging on import.

## Environments

Three cards at `/studio/#/development/environments`: Local, Staging and
Production, each opening in a new tab. Links only: nothing is fetched, embedded
or controlled. The addresses are in `environments.js`; what each environment is,
and how the local one runs: [`../DEVELOPMENT.md`](../DEVELOPMENT.md). Staging's
address belongs to the development branch by name: working on a differently
named branch means changing it.

## Planned sections

- **Development › Environments**, beyond the cards (no integrations yet):
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
