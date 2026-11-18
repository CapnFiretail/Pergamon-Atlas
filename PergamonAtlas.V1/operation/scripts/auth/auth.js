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

  // Password recovery. Supabase emails a one-time link that returns to
  // redirectTo (which must be listed under Auth → URL Configuration →
  // Redirect URLs, or Supabase falls back to the Site URL). It reports
  // success whether or not the email has an account, so callers can't be
  // used to probe for registered addresses.
  async function sendPasswordReset(email, redirectTo) {
    return client().auth.resetPasswordForEmail(email, { redirectTo });
  }

  // Sets a new password for the current session — on the reset page that
  // is the short-lived recovery session created by the emailed link.
  async function updatePassword(password) {
    return client().auth.updateUser({ password });
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

  // CMS: asks the database whether the caller is an administrator
  // (public.is_admin(), the check every CMS write function runs itself; see
  // supabase/proposed/0008_site_content.sql). Resolves { data: true } only
  // for a valid session whose profiles.role is 'admin'. Used to decide
  // whether to build Admin Mode at all; never a substitute for the server's
  // own checks.
  async function isCmsAdmin() {
    return client().rpc('is_admin');
  }

  // CMS drafts (admin-only functions; the database refuses everyone else
  // with PT403). getCmsDraft resolves { draft: {id, content, …} | null,
  // published: {id, content, …} | null }. saveCmsDraft stores a complete
  // document as the new draft only if the current draft is still
  // expectedDraftId (null = there was none); otherwise the server answers
  // PT409 and writes nothing, so another admin's draft is never overwritten.
  async function getCmsDraft(page) {
    return client().rpc('get_draft', { p_page: page });
  }

  async function saveCmsDraft(page, content, expectedDraftId, note) {
    return client().rpc('save_draft', {
      p_page: page,
      p_content: content,
      p_expected_draft_id: expectedDraftId === undefined ? null : expectedDraftId,
      p_note: note || null
    });
  }

  // CMS draft images (admin only; see supabase/proposed/0009_site_media.sql).
  // createCmsMediaUpload reserves one upload and resolves { media_id, bucket,
  // path }; the private site-media-drafts bucket accepts a file only at that
  // path, once, from the admin who reserved it. getCmsMedia describes images
  // by id; signCmsDraftMedia makes short-lived preview URLs, which Storage
  // only issues to admins. Nothing here can make an image public.
  async function createCmsMediaUpload(mime, bytes) {
    return client().rpc('create_media_upload', { p_mime: mime, p_bytes: bytes });
  }

  async function uploadCmsDraftMedia(path, file, mime) {
    return client().storage.from('site-media-drafts').upload(path, file, {
      contentType: mime,
      upsert: false,
      cacheControl: '3600'
    });
  }

  async function getCmsMedia(ids) {
    return client().rpc('get_media', { p_ids: ids });
  }

  async function signCmsDraftMedia(paths, seconds) {
    return client().storage.from('site-media-drafts').createSignedUrls(paths, seconds);
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

  // .select() so the caller can CONFIRM the row was actually written. An
  // RLS-blocked UPDATE (row exists, caller not admin) returns HTTP 200
  // with an empty representation and NO error — atlas-visibility.js's
  // setEffectiveVisibility() must treat "no row echoed" as failure, not a
  // successful publish.
  async function setVisibilityOverride(path, visibility) {
    return client().from('atlas_visibility_overrides').upsert({ path, visibility }).select();
  }

  // .select() returns the rows that were actually deleted. Combined with
  // setEffectiveVisibility()'s post-write refetch verification, a
  // RLS-blocked delete (returns []) is caught rather than assumed done.
  async function deleteVisibilityOverride(path) {
    return client().from('atlas_visibility_overrides').delete().eq('path', path).select();
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
  //
  // select('*') is deliberate: an explicit column list caused a
  // regression once (a column added by a later migration that had not yet
  // been deployed made PostgREST 400 the entire query, silently reverting
  // the published homepage to the classic hero for every visitor).
  // Security is unaffected — RLS on homepage_settings is row-level (the
  // whole row is gated on published = true OR admin) and there are no
  // column-level SELECT grants, so '*' does not widen what a client may
  // read. It does return id (always true) and updated_by (an admin auth
  // uuid) to anon while published; that uuid is not resolvable by anon
  // (profiles RLS blocks it). If that must be hidden, add a column-level
  // `revoke select (updated_by) ... from anon` in a later migration.
  async function getHomepageSettings() {
    return client()
      .from('homepage_settings')
      .select('*')
      .eq('id', true)
      .maybeSingle();
  }

  // .select() so callers can CONFIRM persistence. `id = true` is the
  // singleton PK, so a real write echoes exactly one row; an RLS-blocked
  // or no-op UPDATE echoes [] with no error and MUST NOT be treated as a
  // successful publish (see homepage-config.js writeAndConfirm()).
  async function updateHomepageSettings(patch) {
    return client().from('homepage_settings').update(patch).eq('id', true).select();
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
    sendPasswordReset,
    updatePassword,
    getSession,
    onAuthStateChange,
    getProfile,
    updateDisplayName,
    getCurrentUserAndProfile,
    isCmsAdmin,
    getCmsDraft,
    saveCmsDraft,
    createCmsMediaUpload,
    uploadCmsDraftMedia,
    getCmsMedia,
    signCmsDraftMedia,
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
