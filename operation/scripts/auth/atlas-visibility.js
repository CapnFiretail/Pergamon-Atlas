// Pergamon Atlas — centralized Public/Admin visibility
//
// Layer separation (do not conflate these):
//   Layer 0 (pergamon-address.js / entries.js coords+address) — does this
//     exist, and where?
//   Static visibility (entry.visibility, baked into atlas-meta/entries.js
//     at index time) — the page's baseline: who could perceive it if
//     nothing had ever overridden that.
//   Runtime visibility override (Supabase atlas_visibility_overrides,
//     see migration 0002) — an admin's Publish/Remove decision, if one has
//     been made. Stores ONLY the differences from the static baseline.
//   Effective visibility — override if one exists for the page's
//     normalized path, otherwise the static value. Every public-facing
//     surface (Atlas Navigation, search, catalogs, the footer's own Page
//     Status) reads EFFECTIVE visibility, never static visibility alone.
//   Catalogs (tools/games CATALOG data) — how is it organized and
//     related? Independent of visibility; publishing a page never adds it
//     to a catalog that didn't already reference it.
//   Archives (entry.archived) — what happened to it historically?
//     Archived entries are NEVER part of the public-facing universe,
//     independent of any visibility tag or override.
//
// Four separate questions, each with its own gating:
//   ROLE  — who is the person? guest | user | admin. Resolved once from
//           the live Supabase session and cached for the page's lifetime.
//   VIEW  — which version of Pergamon are they currently looking at?
//           public | admin. Only ever "admin" for an authenticated admin
//           who hasn't toggled Public Preview.
//   STATIC PAGE VISIBILITY — entry.visibility, public | admin, baked in
//           at index time.
//   EFFECTIVE PAGE VISIBILITY — override if present, else static. This is
//           what "can this be perceived" actually means at runtime.
//
// Admin CONTROLS (e.g. the header's view toggle) are gated by ROLE alone,
// so an admin keeps access to them even while previewing the public site.
// Admin CONTENT (the dev homepage, hidden nav links) is gated by VIEW, so
// Public Preview genuinely shows the public universe. The footer's PUBLISH
// control is gated by ROLE AND VIEW together (see data-admin-control="view"
// below) — it only makes sense while actively working in Admin View.
//
// Readiness contract: call PergamonVisibility.ready() before assuming
// role/view/overrides are all settled. Every exposed async function
// already awaits what it needs internally, so most callers never need
// ready() directly — it exists for callers that want one predictable gate
// up front (e.g. the footer, which needs role+view+overrides all resolved
// before it can safely decide what to render) rather than scattering their
// own polling/timeouts.
//
// Load order: auth.js -> permissions.js -> atlas-visibility.js

(function () {
  var VIEW_PREF_KEY = 'pergamonAdminView';
  var statePromise = null;
  var overridesPromise = null;

  // atlas.js calls applyNavVisibility() from inside loadSnippets()'s fetch
  // callbacks, which fire as soon as each local snippet file resolves —
  // often before the late auth-stack script block (auth.js,
  // permissions.js, this file) has finished loading, since fetches and
  // synchronous <script> execution race independently. Without this wait,
  // the first caller to lose that race hits window.PergamonAuth as
  // undefined, throws, and resolveState below would cache that
  // false-negative FOREVER (statePromise is only ever computed once) —
  // permanently stuck at isAdmin:false regardless of how correct the
  // session actually is. Waiting here for both deps to exist closes the
  // race at its source instead of requiring every call site to guard it.
  function waitForDep(getDep, timeoutMs) {
    return new Promise(function (resolve) {
      var dep = getDep();
      if (dep) { resolve(dep); return; }
      var elapsed = 0;
      var iv = setInterval(function () {
        elapsed += 50;
        var d = getDep();
        if (d || elapsed >= (timeoutMs || 5000)) {
          clearInterval(iv);
          resolve(d || null);
        }
      }, 50);
    });
  }

  // Resolves { isAdmin, view } exactly once per page load (cached), so
  // every caller shares one Supabase round trip regardless of how many
  // surfaces (header, sidebar, footer, Atlas Navigation, catalogs...) ask.
  async function resolveState() {
    if (statePromise) return statePromise;
    statePromise = (async function () {
      try {
        var auth = await waitForDep(function () { return window.PergamonAuth; });
        var permissions = await waitForDep(function () { return window.PergamonPermissions; });
        if (!auth || !permissions) {
          throw new Error('PergamonAuth/PergamonPermissions did not become available in time');
        }
        var result = await auth.getCurrentUserAndProfile();
        if (!result.session) {
          console.debug('Pergamon Visibility: no session -> public (this is correct for guest/user)');
          return { isAdmin: false, view: 'public' };
        }
        if (result.error) {
          console.warn('Pergamon Visibility: session present but profile fetch errored -> public', result.error);
          return { isAdmin: false, view: 'public' };
        }
        var isAdmin = permissions.isAdmin(result.profile);
        if (!isAdmin) {
          console.debug('Pergamon Visibility: authenticated but role is not admin -> public', result.profile && result.profile.role);
          return { isAdmin: false, view: 'public' };
        }
        var pref = null;
        try { pref = localStorage.getItem(VIEW_PREF_KEY); } catch (e) {}
        var view = pref === 'public' ? 'public' : 'admin';
        console.debug('Pergamon Visibility: resolved isAdmin=true, view=' + view + ' (this must never depend on the current page — only on role + Public Preview preference)');
        return { isAdmin: true, view: view };
      } catch (err) {
        console.error('Pergamon Visibility: failed to resolve session', err);
      }
      return { isAdmin: false, view: 'public' };
    })();
    return statePromise;
  }

  // Fetches every visibility override once per page load (cached) rather
  // than a per-entry query — the table only ever holds pages that differ
  // from their static baseline, so it's expected to stay small. Returns a
  // plain { normalizedPath: 'public'|'admin' } map. On any failure this
  // falls back to an empty map (i.e. every page falls back to its static
  // visibility) rather than breaking the shell — see the module doc for
  // why that's the safe direction to fail in.
  async function fetchOverrides() {
    if (overridesPromise) return overridesPromise;
    overridesPromise = (async function () {
      try {
        var auth = await waitForDep(function () { return window.PergamonAuth; });
        if (!auth || !auth.getVisibilityOverrides) {
          console.warn('Pergamon Visibility: PergamonAuth.getVisibilityOverrides unavailable — falling back to static visibility only');
          return {};
        }
        var result = await auth.getVisibilityOverrides();
        if (result.error) {
          console.warn('Pergamon Visibility: failed to fetch visibility overrides — falling back to static visibility only', result.error);
          return {};
        }
        var map = {};
        (result.data || []).forEach(function (row) { map[row.path] = row.visibility; });
        return map;
      } catch (err) {
        console.error('Pergamon Visibility: override fetch threw — falling back to static visibility only', err);
        return {};
      }
    })();
    return overridesPromise;
  }

  // Resolves once role, view, AND overrides are all settled. Most exposed
  // functions below await what they individually need rather than this,
  // but callers that want one predictable gate before touching anything
  // (the footer publish panel) can use this instead of composing their own.
  async function ready() {
    await resolveState();
    await fetchOverrides();
  }

  // Same normalization entries.js/the indexer already uses for path
  // comparisons (see atlas-reference.js's currentPath), so /tools/foo,
  // /tools/foo/, and /tools/foo/index.html all key to the same override
  // row rather than being treated as three different pages. Root stays
  // exactly "/".
  function normalizePath(path) {
    if (!path) return '/';
    var p = String(path).replace(/\/index\.html$/, '');
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return p || '/';
  }

  // Returns a Promise<'public'|'admin'>. Guest/user always resolve
  // 'public'. Admin resolves 'admin' unless they've toggled Public Preview,
  // and that preference is only ever consulted after isAdmin(profile) has
  // been confirmed against a live Supabase session above — a non-admin
  // setting the localStorage key has no effect.
  async function currentAtlasView() {
    return (await resolveState()).view;
  }

  // Returns a Promise<boolean> — is the current session an authenticated
  // admin? Independent of Public Preview; this is the ROLE question, not
  // the VIEW question.
  async function isAdminRole() {
    return (await resolveState()).isAdmin;
  }

  // Effective visibility for one Atlas entry: the override for its
  // normalized path if one exists, otherwise its static visibility.
  // `overrides` is optional — omit it for a static-only check; internal
  // callers below always pass the resolved cache so entry filtering is
  // override-aware.
  function isPubliclyVisible(entry, overrides) {
    if (!entry || entry.archived) return false;
    var key = normalizePath(entry.path);
    var v = (overrides && Object.prototype.hasOwnProperty.call(overrides, key))
      ? overrides[key]
      : entry.visibility;
    return v === 'public';
  }

  async function isVisibleInCurrentView(entry) {
    var view = await currentAtlasView();
    if (view === 'admin') return !!entry;
    var overrides = await fetchOverrides();
    return isPubliclyVisible(entry, overrides);
  }

  async function getVisibleEntries(list) {
    var view = await currentAtlasView();
    if (view === 'admin') return (list || []).slice();
    var overrides = await fetchOverrides();
    return (list || []).filter(function (e) { return isPubliclyVisible(e, overrides); });
  }

  // Convenience for consumers of the full window.atlasEntries shape.
  // Admin view returns it unchanged; public view drops archived entirely
  // and filters everything else through isPubliclyVisible (override-aware).
  async function filterAtlasEntries(atlasEntries) {
    if (!atlasEntries) return atlasEntries;
    var view = await currentAtlasView();
    if (view === 'admin') return atlasEntries;
    var overrides = await fetchOverrides();
    var pred = function (e) { return isPubliclyVisible(e, overrides); };
    return {
      tools: (atlasEntries.tools || []).filter(pred),
      games: (atlasEntries.games || []).filter(pred),
      pages: (atlasEntries.pages || []).filter(pred),
      archived: []
    };
  }

  // Effective visibility for a single path — used by the footer's Page
  // Status display, which has a static baseline (the current page's own
  // atlas-meta) but needs to know whether an override has changed it.
  async function getEffectiveVisibility(path, staticVisibility) {
    var overrides = await fetchOverrides();
    var key = normalizePath(path);
    if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
    return staticVisibility;
  }

  // The actual publish/unpublish mutation. This is a real administrative
  // write — the client-side isAdmin check below is only for a fast,
  // friendly failure message; the database (RLS on
  // atlas_visibility_overrides, see migration 0002) is the real trust
  // boundary and will reject this outright for a non-admin regardless of
  // what this function does.
  //
  // Redundant-override cleanup (see module doc): if the desired value
  // matches the page's static baseline, the override row is deleted
  // instead of written, so this table only ever holds actual differences.
  async function setEffectiveVisibility(path, desiredVisibility, staticVisibility) {
    var state = await resolveState();
    if (!state.isAdmin) {
      return { error: { message: 'Not authorized: admin role required.' } };
    }
    var auth = window.PergamonAuth;
    if (!auth) {
      return { error: { message: 'Auth not available.' } };
    }

    var key = normalizePath(path);
    var result;
    try {
      result = (desiredVisibility === staticVisibility)
        ? await auth.deleteVisibilityOverride(key)
        : await auth.setVisibilityOverride(key, desiredVisibility);
    } catch (err) {
      console.error('Pergamon Visibility: publish mutation threw', err);
      return { error: { message: err && err.message ? err.message : 'Unknown error' } };
    }

    if (!result.error) {
      // Invalidate and eagerly refresh so any surface reading overrides
      // right after this resolves sees the change immediately, without
      // needing a page reload.
      overridesPromise = null;
      await fetchOverrides();
    } else {
      console.error('Pergamon Visibility: publish mutation rejected', result.error);
    }
    return result;
  }

  function publishPage(path, staticVisibility) {
    return setEffectiveVisibility(path, 'public', staticVisibility);
  }

  function unpublishPage(path, staticVisibility) {
    return setEffectiveVisibility(path, 'admin', staticVisibility);
  }

  // Shell elements with no Atlas entry of their own use one of three
  // markers, each gated differently:
  //
  //   data-visibility="admin" / "public"  — CONTENT, gated by VIEW.
  //     (sidebar links, the homepage's dev-vs-public hero.)
  //   data-admin-control="role"           — ADMIN CONTROL, gated by ROLE
  //     alone. Visible in both Admin View and Public Preview.
  //     (the header's view toggle.)
  //   data-admin-control="view"           — ADMIN CONTROL, gated by ROLE
  //     AND VIEW together. Only visible while actively in Admin View.
  //     (the footer's page-publish control.)
  //
  // main.css hides all three by default (fail-closed) so there is no flash
  // of admin-only nav before this resolves; data-visibility="public" is
  // visible by default and only hidden here once admin view is confirmed.
  //
  // This function only touches ROLE/VIEW-gated shell elements — it does
  // NOT touch Atlas entries or overrides, so it never needs to wait on
  // fetchOverrides(). The footer's own Page Status text/button (which DOES
  // need effective per-page visibility) is populated separately in
  // atlas.js, chained after this resolves.
  async function applyNavVisibility(scopeEl) {
    var root = scopeEl || document;
    var state = await resolveState();
    var isAdminView = state.view === 'admin';

    root.querySelectorAll('[data-visibility="admin"]').forEach(function (el) {
      el.style.display = isAdminView ? '' : 'none';
    });
    root.querySelectorAll('[data-visibility="public"]').forEach(function (el) {
      el.style.display = isAdminView ? 'none' : '';
    });
    root.querySelectorAll('[data-admin-control="role"]').forEach(function (el) {
      el.style.display = state.isAdmin ? '' : 'none';
    });
    root.querySelectorAll('[data-admin-control="view"]').forEach(function (el) {
      el.style.display = (state.isAdmin && isAdminView) ? '' : 'none';
    });

    var toggle = root.querySelector('#pergamon-view-toggle');
    if (toggle) {
      toggle.textContent = isAdminView ? 'Public Preview' : 'Admin View';
      toggle.title = isAdminView
        ? 'Preview the site exactly as public visitors see it'
        : 'Return to full Admin View';
      if (!toggle.dataset.wired) {
        toggle.dataset.wired = '1';
        toggle.addEventListener('click', function () {
          try { localStorage.setItem(VIEW_PREF_KEY, isAdminView ? 'public' : 'admin'); } catch (e) {}
          window.location.reload();
        });
      }
    }

    return state.view;
  }

  window.PergamonVisibility = {
    ready: ready,
    currentAtlasView: currentAtlasView,
    isAdminRole: isAdminRole,
    normalizePath: normalizePath,
    isPubliclyVisible: isPubliclyVisible,
    isVisibleInCurrentView: isVisibleInCurrentView,
    getVisibleEntries: getVisibleEntries,
    filterAtlasEntries: filterAtlasEntries,
    getEffectiveVisibility: getEffectiveVisibility,
    publishPage: publishPage,
    unpublishPage: unpublishPage,
    applyNavVisibility: applyNavVisibility
  };
})();
