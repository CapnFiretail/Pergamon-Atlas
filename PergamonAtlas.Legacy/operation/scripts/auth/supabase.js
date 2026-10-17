// Pergamon Atlas — Supabase client singleton
//
// Requires, in this order, before this script on the page:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
//   <script src="/operation/scripts/auth/supabase-config.js"></script>
//   <script src="/operation/scripts/auth/supabase.js"></script>

(function () {
  if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
    console.error('Pergamon Auth: supabase-js failed to load before supabase.js');
    return;
  }
  if (!window.PERGAMON_SUPABASE_URL || window.PERGAMON_SUPABASE_URL === 'YOUR_SUPABASE_PROJECT_URL') {
    console.warn('Pergamon Auth: supabase-config.js still has placeholder values. Auth will not work until configured.');
  }

  window.PergamonSupabaseClient = window.supabase.createClient(
    window.PERGAMON_SUPABASE_URL,
    window.PERGAMON_SUPABASE_ANON_KEY
  );
})();
