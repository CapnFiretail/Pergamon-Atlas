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
// Load order: auth.js -> permissions.js -> atlas-visibility.js

(function () {
  var VIEW_PREF_KEY = 'pergamonAdminView';
  var viewPromise = null;

  async function resolveView() {
    if (viewPromise) return viewPromise;
    viewPromise = (async function () {
      try {
        var result = await window.PergamonAuth.getCurrentUserAndProfile();
        if (result.session && window.PergamonPermissions.isAdmin(result.profile)) {
          var pref = null;
          try { pref = localStorage.getItem(VIEW_PREF_KEY); } catch (e) {}
          return pref === 'public' ? 'public' : 'admin';
        }
      } catch (err) {
        console.error('Pergamon Visibility: failed to resolve session', err);
      }
      return 'public';
    })();
    return viewPromise;
  }

  // Returns a Promise<'public'|'admin'>. Guest/user always resolve
  // 'public'. Admin resolves 'admin' unless they've toggled Public Preview,
  // and that preference is only ever consulted after isAdmin(profile) has
  // been confirmed against a live Supabase session above — a non-admin
  // setting the localStorage key has no effect.
  function currentAtlasView() {
    return resolveView();
  }

  // Pure, synchronous: given one Atlas entry, is it part of the public
  // universe? Archived entries are always excluded regardless of tag.
  function isPubliclyVisible(entry) {
    return !!entry && !entry.archived && entry.visibility === 'public';
  }

  async function isVisibleInCurrentView(entry) {
    var view = await resolveView();
    if (view === 'admin') return !!entry;
    return isPubliclyVisible(entry);
  }

  async function getVisibleEntries(list) {
    var view = await resolveView();
    if (view === 'admin') return (list || []).slice();
    return (list || []).filter(isPubliclyVisible);
  }

  // Convenience for consumers of the full window.atlasEntries shape.
  // Admin view returns it unchanged; public view drops archived entirely
  // and filters everything else through isPubliclyVisible.
  async function filterAtlasEntries(atlasEntries) {
    if (!atlasEntries) return atlasEntries;
    var view = await resolveView();
    if (view === 'admin') return atlasEntries;
    return {
      tools: (atlasEntries.tools || []).filter(isPubliclyVisible),
      games: (atlasEntries.games || []).filter(isPubliclyVisible),
      pages: (atlasEntries.pages || []).filter(isPubliclyVisible),
      archived: []
    };
  }

  // Shell elements with no Atlas entry of their own (sidebar links, the
  // header's view-toggle control) use data-visibility="admin" / "public"
  // directly rather than duplicating a visibility value that has nowhere
  // authoritative to live. main.css hides [data-visibility="admin"] by
  // default (fail-closed) so there is no flash of admin-only nav before
  // this resolves; [data-visibility="public"] is visible by default and
  // only hidden here once admin view is confirmed.
  async function applyNavVisibility(scopeEl) {
    var root = scopeEl || document;
    var view = await resolveView();
    var isAdminView = view === 'admin';

    root.querySelectorAll('[data-visibility="admin"]').forEach(function (el) {
      el.style.display = isAdminView ? '' : 'none';
    });
    root.querySelectorAll('[data-visibility="public"]').forEach(function (el) {
      el.style.display = isAdminView ? 'none' : '';
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

    return view;
  }

  window.PergamonVisibility = {
    currentAtlasView: currentAtlasView,
    isPubliclyVisible: isPubliclyVisible,
    isVisibleInCurrentView: isVisibleInCurrentView,
    getVisibleEntries: getVisibleEntries,
    filterAtlasEntries: filterAtlasEntries,
    applyNavVisibility: applyNavVisibility
  };
})();
