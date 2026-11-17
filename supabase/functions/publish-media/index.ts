// Supabase Edge Function entry point (Deno). Wires handler.ts to Supabase.
//
// Secrets (Supabase Dashboard -> Edge Functions -> Secrets, or
// `supabase secrets set`), never in the repo or the browser:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY  (provided by Supabase)
//   PUBLISH_MEDIA_ALLOWED_ORIGINS  comma-separated site origins, e.g.
//     https://www.pergamonatlas.com,https://pergamonatlas.com   (production)
//     https://<preview>.vercel.app,http://localhost:4173        (staging)
//
// Deploy (staging first): supabase functions deploy publish-media --project-ref <ref>
// JWT verification stays ON (the default), so Supabase rejects requests
// without a valid session before this code runs; handler.ts still checks
// the user and their role itself.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { handle, type MediaRow } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const allowedOrigins = (Deno.env.get('PUBLISH_MEDIA_ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(req => handle(req, {
  allowedOrigins,
  async getUser(token) {
    const { data, error } = await authClient.auth.getUser(token);
    return error || !data.user ? null : { id: data.user.id };
  },
  async isAdmin(userId) {
    const { data, error } = await service.from('profiles').select('role').eq('id', userId).maybeSingle();
    return !error && data?.role === 'admin';
  },
  async getMedia(id) {
    const { data, error } = await service.from('site_media')
      .select('id, draft_path, declared_mime, public_path, width, height, mime, bytes').eq('id', id).maybeSingle();
    if (error) throw error;
    return data as MediaRow | null;
  },
  async downloadDraft(path, maxBytes) {
    const { data, error } = await service.storage.from('site-media-drafts').download(path);
    if (error || !data) return null;
    if (data.size > maxBytes + 1) return new Uint8Array(maxBytes + 1);   // size check fails in inspectImage
    return new Uint8Array(await data.arrayBuffer());
  },
  async uploadPublic(path, bytes, mime) {
    const { error } = await service.storage.from('site-media').upload(path, bytes, {
      contentType: mime, cacheControl: '31536000', upsert: false
    });
    if (!error) return 'created';
    if (/exists|duplicate/i.test(error.message)) return 'exists';
    throw error;
  },
  async recordPrepared(a) {
    const { error } = await service.rpc('cms_record_prepared_media', {
      p_id: a.id, p_public_path: a.publicPath, p_mime: a.mime, p_bytes: a.bytes,
      p_width: a.width, p_height: a.height, p_sha256: a.sha256
    });
    if (error) throw error;
  },
  log(event, detail) { console.log(JSON.stringify({ fn: 'publish-media', event, ...detail })); }
}));
