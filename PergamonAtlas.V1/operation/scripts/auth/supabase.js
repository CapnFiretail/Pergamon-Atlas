// Pergamon Atlas — Supabase client singleton
//
// Requires, in this order, before this script on the page:
//   <script src="/vendor/supabase-js/2.118.0/supabase.js" integrity="sha384-…"></script>
//   (a pinned copy served by the site; see /vendor/supabase-js/README.md)
//   <script src="/operation/scripts/auth/supabase-config.js"></script>
//   <script src="/operation/scripts/auth/supabase.js"></script>

(function () {
  if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
    console.error('Pergamon Auth: supabase-js failed to load before supabase.js');
    return;
  }
  // An unconfigured build (e.g. a preview without its environment values;
  // see tools/write-supabase-config.mjs) runs without accounts rather than
  // failing: no client is created, so PergamonAuth calls reject cleanly.
  if (!window.PERGAMON_SUPABASE_URL || !window.PERGAMON_SUPABASE_ANON_KEY) {
    console.info('Pergamon Auth: Supabase is not configured for this deployment; sign-in is unavailable.');
    return;
  }

  window.PergamonSupabaseClient = window.supabase.createClient(
    window.PERGAMON_SUPABASE_URL,
    window.PERGAMON_SUPABASE_ANON_KEY
  );
})();
