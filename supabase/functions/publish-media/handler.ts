// publish-media: copy one admin-uploaded draft image to the public bucket.
//
// POST { "media_id": "<uuid>" } with the admin's own session token
// (Authorization: Bearer <access token>). The browser names a media id
// only; the draft path, bucket and published path all come from the
// database row and the file's own bytes, so the function cannot be pointed
// at any other file.
//
// Steps: authenticate -> verify admin (profiles.role, read server-side) ->
// load the site_media row -> read the draft object -> check its real format,
// size and dimensions -> upload to site-media/media/<sha256>.<ext>
// (content-addressed, never overwritten) -> record it through
// cms_record_prepared_media (service role only).
//
// Failure safety: nothing here changes what the public site shows. Content
// only references an image once a content version is published (0008), and
// publish refuses images this function hasn't recorded. If the upload
// succeeds but recording fails, the public object is unreferenced and the
// call can simply be retried (same bytes -> same path). Draft originals are
// never deleted here.
import { EXT_BY_MIME, ImageError, inspectImage, MAX_BYTES, sha256Hex, UUID_RE, type ImageKind } from './media.ts';

export interface MediaRow {
  id: string;
  draft_path: string;
  declared_mime: ImageKind;
  public_path: string | null;
  width: number | null;
  height: number | null;
  mime: ImageKind | null;
  bytes: number | null;
}

export interface Deps {
  allowedOrigins: string[];
  // Resolve the caller from their access token (Supabase Auth); null if invalid.
  getUser(token: string): Promise<{ id: string } | null>;
  // profiles.role === 'admin', read with server credentials.
  isAdmin(userId: string): Promise<boolean>;
  getMedia(id: string): Promise<MediaRow | null>;
  // Draft bytes, or null if the object doesn't exist. Must not read more than maxBytes + 1.
  downloadDraft(path: string, maxBytes: number): Promise<Uint8Array | null>;
  // Upload without overwriting. 'exists' if the path is already taken.
  uploadPublic(path: string, bytes: Uint8Array, mime: ImageKind): Promise<'created' | 'exists'>;
  recordPrepared(args: { id: string; publicPath: string; mime: ImageKind; bytes: number; width: number; height: number; sha256: string }): Promise<void>;
  log?(event: string, detail: Record<string, unknown>): void;
}

function cors(origin: string | null, deps: Deps): Record<string, string> {
  const h: Record<string, string> = { 'Vary': 'Origin' };
  if (origin && deps.allowedOrigins.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Headers'] = 'authorization, content-type, apikey, x-client-info';
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Max-Age'] = '600';
  }
  return h;
}

function reply(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}

const fail = (status: number, error: string, message: string, h: Record<string, string>) => reply(status, { error, message }, h);

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const origin = req.headers.get('Origin');
  const h = cors(origin, deps);
  if (req.method === 'OPTIONS') return new Response(null, { status: origin && h['Access-Control-Allow-Origin'] ? 204 : 403, headers: h });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.', h);
  if (origin && !h['Access-Control-Allow-Origin']) return fail(403, 'origin_not_allowed', 'This site is not allowed to publish media.', h);

  // 1. Authenticate.
  const auth = req.headers.get('Authorization') || '';
  const token = /^Bearer ([A-Za-z0-9._-]+)$/.exec(auth)?.[1];
  if (!token) return fail(401, 'unauthenticated', 'Sign in first.', h);
  const user = await deps.getUser(token).catch(() => null);
  if (!user) return fail(401, 'unauthenticated', 'Your session has expired. Sign in again.', h);

  // 2. Authorise against the database, not the token's claims.
  if (!(await deps.isAdmin(user.id).catch(() => false))) {
    deps.log?.('forbidden', { user: user.id });
    return fail(403, 'forbidden', 'Administrator access required.', h);
  }

  // Body: exactly { media_id }.
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 1024) return fail(413, 'too_large', 'Request body too large.', h);
    body = JSON.parse(text);
  } catch {
    return fail(400, 'bad_request', 'Send JSON: { "media_id": "<id>" }.', h);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join() !== 'media_id') {
    return fail(400, 'bad_request', 'Send JSON: { "media_id": "<id>" }.', h);
  }
  const id = (body as { media_id: unknown }).media_id;
  if (typeof id !== 'string' || !UUID_RE.test(id)) return fail(400, 'bad_request', 'media_id must be an id.', h);

  // 3. The media row decides everything about locations.
  const row = await deps.getMedia(id);
  if (!row) return fail(404, 'not_found', 'Unknown image.', h);
  if (row.public_path) {
    return reply(200, { media_id: id, public_path: row.public_path, width: row.width, height: row.height, mime: row.mime, bytes: row.bytes, already_prepared: true }, h);
  }
  const ext = EXT_BY_MIME[row.declared_mime];
  const expectedDraft = `uploads/${id}.${ext}`;
  if (!ext || row.draft_path !== expectedDraft) {
    deps.log?.('draft_path_mismatch', { id, draft_path: row.draft_path });
    return fail(409, 'invalid_location', 'This image is not in an allowed location.', h);
  }

  // 4–5. Read the draft and check its real bytes.
  const bytes = await deps.downloadDraft(expectedDraft, MAX_BYTES);
  if (!bytes) return fail(409, 'not_uploaded', 'The image has not finished uploading.', h);
  let info;
  try {
    info = inspectImage(bytes);
  } catch (e) {
    if (e instanceof ImageError) return fail(422, 'invalid_image', e.message, h);
    throw e;
  }
  if (info.mime !== row.declared_mime) {
    return fail(422, 'invalid_image', 'The file does not match its declared type.', h);
  }

  // 6. Content-addressed copy; an existing object with the same hash is the same file.
  const sha256 = await sha256Hex(bytes);
  const publicPath = `media/${sha256}.${info.ext}`;
  try {
    await deps.uploadPublic(publicPath, bytes, info.mime);
  } catch (e) {
    deps.log?.('upload_failed', { id, error: String(e) });
    return fail(502, 'upload_failed', 'Could not copy the image. Try again.', h);
  }

  // 7. Record it. Retry-safe: the same file maps to the same values.
  try {
    await deps.recordPrepared({ id, publicPath, mime: info.mime, bytes: bytes.length, width: info.width, height: info.height, sha256 });
  } catch (e) {
    deps.log?.('record_failed', { id, publicPath, error: String(e) });
    return fail(502, 'record_failed', 'The image was copied but not recorded. Try again.', h);
  }

  // 8. Stable reference.
  return reply(200, { media_id: id, public_path: publicPath, width: info.width, height: info.height, mime: info.mime, bytes: bytes.length, already_prepared: false }, h);
}
