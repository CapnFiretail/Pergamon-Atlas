# Development environments

| Environment | Address | Serves | Data |
|---|---|---|---|
| Local | http://localhost:4173 | This repository's working files, uncommitted changes included | Staging |
| Staging | `https://pergamon-atlas-git-development-v-778ce8-cms12306-9421s-projects.vercel.app` | The newest push to `development/v1-admin-infrastructure`; asks for a Vercel sign-in | Staging |
| Production | https://pergamonatlas.com | `main` | Production |

Studio › Development › Environments opens each one (`design/STUDIO.md` ›
Environments). The staging address is Vercel's alias for that branch: every push
moves it to the new preview, and it stays the same while the branch keeps its
name. Vercel shortens long names to `git-<branch start>-<hash>`, the hash being
the first six characters of SHA-256 of `git-<branch><project>`.

## Workflow

Work moves through the environments in order. Each **stop** waits for the user's
approval, which covers the next step only.

1. **Local.** Check the server with `tools\dev-server status`, and `start` it if
   needed. Implement in the working files and run the checks the change calls for
   (`cms/TESTING.md` › Run).
   **Stop for local review, before committing:** give the addresses to open.
2. **Staging.** Commit, and push the development branch. Verify the deployment
   (below). **Stop for release approval.**
3. **Production.** Check that `main` fast-forwards to the approved commit, and
   push it. Verify production against that commit, as a guest, writing nothing.
   Record the release and its rollback deployment in `STATUS.md`.

Verifying:

- **Build.** GitHub's public record of the commit (`/commits/<sha>/status`,
  `/deployments` and its statuses in the API) says whether Vercel built it and
  where; no sign-in is involved.
- **Staging's pages** are behind Vercel's sign-in. Without one, verify the build,
  and that the staging address answers with Vercel's sign-in; the user opens the
  pages. Say which was done.
- **Production's** public files are compared with the commit. Anything needing an
  administrator is the user's to check.
- Never extract credentials (tokens, cookies, browser profiles, bypass secrets),
  use protection bypasses, or turn protection off.
- No temporary review server while the persistent one is available. Automated
  tests may start their own on another port, and must stop it.
- Checks that already passed on the same code aren't repeated.

## The local server

`tools/dev-server.mjs`: Node only, no dependencies, read-only, the same port
always (staging sign-in allows that address). Its header is its contract. Run
from the repository root, in any terminal:

| Command | Does |
|---|---|
| `tools\dev-server status` | Running? Starts at sign-in? Which folder, which log |
| `tools\dev-server start` | Starts it in the background. Windows creates the process, so closing the terminal, VS Code or Claude doesn't end it |
| `tools\dev-server stop`, `restart` | Only ever this server; another program on the port is reported, not stopped |
| `tools\dev-server install` | Starts it at sign-in: a shortcut in this user's Startup folder, no administrator rights. Task Manager › Startup apps can also turn it off |
| `tools\dev-server uninstall` | Removes that shortcut |

- It serves whatever branch is checked out. The sign-in shortcut runs the
  script from the repository, so it does nothing while a branch without it is
  checked out.
- Changes to the server itself (`tools/dev-server.mjs`) need a `restart`.
- It isn't restarted if it stops by itself: `start`, or sign in again.
- **Staging only:** a `supabase-config.js` that doesn't name staging is served
  as "unconfigured", and browsers are told to refuse the production project and
  the ad scripts on game pages.
- **Loopback only:** other computers can't reach it.
- Redirects and headers come from `vercel.json`, and names must be spelled
  exactly as on Vercel. Vercel functions and image handling are not emulated.

## Automatic refresh

Saving a file refreshes the open pages that use it: stylesheets in place,
anything else by reloading. A page that may hold unsaved work is not reloaded;
it shows a notice with **Reload** and **Later**. What counts as unsaved:
`tools/dev-reload.js` (header). An editor that blocks leaving the page
(`beforeunload`) is covered without further work; one that doesn't must be
added there.
