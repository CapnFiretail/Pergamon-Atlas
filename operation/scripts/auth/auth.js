// Pergamon Atlas — Auth v1
//
// Thin wrapper around the Supabase client (see supabase.js). Pages should
// only ever talk to auth through window.PergamonAuth, never touch
// PergamonSupabaseClient directly, so the auth surface stays reusable and
// swappable.
//
// Load order: supabase-js CDN -> supabase-config.js -> supabase.js -> auth.js

(function () {
  function client() {
    if (!window.PergamonSupabaseClient) {
      throw new Error('Pergamon Auth: PergamonSupabaseClient is not initialized. Check script load order.');
    }
    return window.PergamonSupabaseClient;
  }

  // Client only ever sends email/password/display_name. Role, coordinates,
  // and the Atlas address are assigned server-side by the on_auth_user_created
  // trigger (see supabase/migrations/0001_pergamon_profiles.sql) — there is
  // no code path here that could set them, by design.
  async function signUp({ email, password, displayName }) {
    return client().auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || '' }
      }
    });
  }

  async function signIn({ email, password }) {
    return client().auth.signInWithPassword({ email, password });
  }

  async function signOut() {
    return client().auth.signOut();
  }

  async function getSession() {
    return client().auth.getSession();
  }

  function onAuthStateChange(callback) {
    return client().auth.onAuthStateChange(callback);
  }

  // Reads the caller's own profile row. RLS restricts this to auth.uid() = id,
  // so this can never return another account's profile.
  async function getProfile(userId) {
    return client()
      .from('profiles')
      .select('id, display_name, role, atlas_address, coord_x, coord_y, coord_z, created_at, updated_at')
      .eq('id', userId)
      .single();
  }

  async function updateDisplayName(displayName) {
    const { data: sessionData } = await getSession();
    const user = sessionData && sessionData.session && sessionData.session.user;
    if (!user) throw new Error('Not signed in');

    // Only display_name is grantable to the authenticated role at the
    // database level (see column grants in the migration) — attempting to
    // include role/atlas_address/coord_* here would be rejected by Postgres
    // regardless of what this function does.
    return client()
      .from('profiles')
      .update({ display_name: displayName })
      .eq('id', user.id);
  }

  // Convenience: current session + matching profile in one call, used by
  // pages to resolve Guest / User / Admin state on load.
  async function getCurrentUserAndProfile() {
    const { data: sessionData, error: sessionError } = await getSession();
    const session = sessionData && sessionData.session;
    if (sessionError || !session) {
      return { session: null, profile: null, error: sessionError || null };
    }

    const { data: profile, error: profileError } = await getProfile(session.user.id);
    return { session, profile: profile || null, error: profileError || null };
  }

  // Pergamon Publishing v1 — runtime visibility overrides (see
  // supabase/migrations/0002_atlas_visibility_overrides.sql). Readable by
  // anyone (RLS: select using (true)); insert/update/delete are enforced
  // admin-only by RLS checking profiles.role, not by anything in this file
  // or the caller — atlas-visibility.js still guards the UI for UX, but
  // the database is the actual trust boundary.
  async function getVisibilityOverrides() {
    return client().from('atlas_visibility_overrides').select('path, visibility');
  }

  async function setVisibilityOverride(path, visibility) {
    return client().from('atlas_visibility_overrides').upsert({ path, visibility });
  }

  async function deleteVisibilityOverride(path) {
    return client().from('atlas_visibility_overrides').delete().eq('path', path);
  }

  // Homepage customization v1 — homepage_settings + the 'homepage' Storage
  // bucket (see supabase/migrations/0003 and 0004). Same trust model as the
  // visibility overrides above: RLS on profiles.role is the real boundary;
  // homepage-config.js's admin guard is UX only. The single row is keyed
  // id = true and seeded by the migration, so writes are always UPDATE.
  //
  // The SELECT RLS policy returns the row to anon only while
  // published = true, so getHomepageSettings() resolves { data: null } for
  // a guest on an unpublished homepage — that is expected, not an error.
  async function getHomepageSettings() {
    return client()
      .from('homepage_settings')
      .select('hero_image_path, featured_path, published, published_at, updated_at')
      .eq('id', true)
      .maybeSingle();
  }

  async function updateHomepageSettings(patch) {
    return client().from('homepage_settings').update(patch).eq('id', true);
  }

  // String-building only — does not hit RLS. Returns the CDN URL for an
  // object path within the public 'homepage' bucket.
  function homepageAssetPublicUrl(path) {
    if (!path) return null;
    var res = client().storage.from('homepage').getPublicUrl(path);
    return (res && res.data && res.data.publicUrl) || null;
  }

  async function uploadHomepageAsset(path, file) {
    return client().storage.from('homepage').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file && file.type
    });
  }

  async function removeHomepageAsset(paths) {
    return client().storage
      .from('homepage')
      .remove(Array.isArray(paths) ? paths : [paths]);
  }

  window.PergamonAuth = {
    signUp,
    signIn,
    signOut,
    getSession,
    onAuthStateChange,
    getProfile,
    updateDisplayName,
    getCurrentUserAndProfile,
    getVisibilityOverrides,
    setVisibilityOverride,
    deleteVisibilityOverride,
    getHomepageSettings,
    updateHomepageSettings,
    homepageAssetPublicUrl,
    uploadHomepageAsset,
    removeHomepageAsset
  };
})();
