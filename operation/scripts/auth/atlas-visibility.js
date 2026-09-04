// Pergamon Atlas — centralized Public/Admin visibility
//
// Layer separation (do not conflate these):
//   Layer 0 (pergamon-address.js / entries.js coords+address) — does this
//     exist, and where?
//   Visibility (this file, entry.visibility)                 — who can
//     currently perceive it?
//   Catalogs (tools/games CATALOG data)                       — how is it
//     organized and related?
//   Archives (entry.archived)                                 — what
//     happened to it historically? Archived entries are NEVER part of the
//     public-facing universe, independent of any visibility tag.
//
// Three separate questions, each with its own gating:
//   ROLE  — who is the person? guest | user | admin. Resolved once from
//           the live Supabase session and cached for the page's lifetime.
//   VIEW  — which version of Pergamon are they currently looking at?
//           public | admin. Only ever "admin" for an authenticated admin
//           who hasn't toggled Public Preview.
//   PAGE VISIBILITY — entry.visibility, public | admin, per Atlas entry.
//
// Admin CONTROLS (e.g. the header's view toggle) are gated by ROLE alone,
// so an admin keeps access to them even while previewing the public site.
// Admin CONTENT (the dev homepage, hidden nav links, an unpublished page)
// is gated by VIEW, so Public Preview genuinely shows the public universe.
// Conflating the two was the bug where the view toggle vanished the
// moment an admin switched to Public Preview, with no way back short of
// clearing localStorage by hand.
//
// Load order: auth.js -> permissions.js -> atlas-visibility.js

(function () {
  var VIEW_PREF_KEY = 'pergamonAdminView';
  var statePromise = null;

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
        var isAdmin = !!(result.session && permissions.isAdmin(result.profile));
        if (isAdmin) {
          var pref = null;
          try { pref = localStorage.getItem(VIEW_PREF_KEY); } catch (e) {}
          return { isAdmin: true, view: pref === 'public' ? 'public' : 'admin' };
        }
      } catch (err) {
        console.error('Pergamon Visibility: failed to resolve session', err);
      }
      return { isAdmin: false, view: 'public' };
    })();
    return statePromise;
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

  // Pure, synchronous: given one Atlas entry, is it part of the public
  // universe? Archived entries are always excluded regardless of tag.
  function isPubliclyVisible(entry) {
    return !!entry && !entry.archived && entry.visibility === 'public';
  }

  async function isVisibleInCurrentView(entry) {
    var view = await currentAtlasView();
    if (view === 'admin') return !!entry;
    return isPubliclyVisible(entry);
  }

  async function getVisibleEntries(list) {
    var view = await currentAtlasView();
    if (view === 'admin') return (list || []).slice();
    return (list || []).filter(isPubliclyVisible);
  }

  // Convenience for consumers of the full window.atlasEntries shape.
  // Admin view returns it unchanged; public view drops archived entirely
  // and filters everything else through isPubliclyVisible.
  async function filterAtlasEntries(atlasEntries) {
    if (!atlasEntries) return atlasEntries;
    var view = await currentAtlasView();
    if (view === 'admin') return atlasEntries;
    return {
      tools: (atlasEntries.tools || []).filter(isPubliclyVisible),
      games: (atlasEntries.games || []).filter(isPubliclyVisible),
      pages: (atlasEntries.pages || []).filter(isPubliclyVisible),
      archived: []
    };
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
    currentAtlasView: currentAtlasView,
    isAdminRole: isAdminRole,
    isPubliclyVisible: isPubliclyVisible,
    isVisibleInCurrentView: isVisibleInCurrentView,
    getVisibleEntries: getVisibleEntries,
    filterAtlasEntries: filterAtlasEntries,
    applyNavVisibility: applyNavVisibility
  };
})();
