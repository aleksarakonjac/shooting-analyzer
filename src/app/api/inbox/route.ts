import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, siteUrl } from '@/lib/supabase/admin';
import { bearerToken, hashInboxToken } from '@/lib/inbox/token';
import { acceptInboxFile, MAX_BODY_BYTES, readCapped, type InboxDeps, type ReadOutcome } from '@/lib/inbox/upload';

/**
 * Upload from the iOS share sheet (a Shortcut): `Authorization: Bearer <token>` and a SCATT, TCX or SIUS PDF file either as
 * multipart field `file` or as the raw request body (name in `X-File-Name` or `?name=`). The file waits in the
 * owner's inbox; the response carries the URL of the page where it is added to a new or an existing session.
 */
export async function POST(request: NextRequest) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'not configured' }, { status: 500 });

  const token = bearerToken(request.headers.get('authorization'));
  const bucket = admin.storage.from('inbox');
  const deps: InboxDeps = {
    async ownerOf(hash) {
      const { data } = await admin.from('inbox_tokens').select('id, user_id, profiles!inner(role, status)').eq('token_hash', hash).maybeSingle();
      const p = (data?.profiles ?? null) as { role: string; status: string } | null;
      if (!data || !p || p.status !== 'active' || p.role !== 'shooter') return null;
      return { userId: data.user_id as string, tokenId: data.id as string };
    },
    async waiting(userId) {
      const { count } = await admin.from('inbox_files').select('id', { count: 'exact', head: true }).eq('user_id', userId);
      return count ?? 0;
    },
    async putObject(path, bytes) {
      const { error } = await bucket.upload(path, bytes, { contentType: 'application/octet-stream', upsert: false });
      if (error) throw new Error(error.message);
    },
    async insertRow(row) {
      const { error } = await admin.from('inbox_files').insert(row);
      if (error) throw new Error(error.message);
    },
    async removeObject(path) {
      await bucket.remove([path]);
    },
    async touchToken(tokenId) {
      await admin.from('inbox_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', tokenId);
    },
    newId: randomUUID,
  };

  const length = Number(request.headers.get('content-length'));
  const declared = Number.isFinite(length) && length > 0 ? length : null;
  const result = await acceptInboxFile(token ? hashInboxToken(token) : null, declared, () => readFile(request), deps);
  if (result.status !== 201) return NextResponse.json({ error: result.error }, { status: result.status });
  const base = siteUrl() ?? new URL(request.url).origin;
  return NextResponse.json({ id: result.id, kind: result.kind, url: `${base}/sa-telefona?f=${result.id}` }, { status: 201 });
}

/** Reads the upload with a hard size cap (the declared length can be missing or wrong). */
async function readFile(request: NextRequest): Promise<ReadOutcome> {
  const body = await readCapped(request.body, MAX_BODY_BYTES);
  if (body === 'too large') return body;
  const type = request.headers.get('content-type') ?? '';
  if (type.startsWith('multipart/form-data')) {
    const form = await new Response(body, { headers: { 'content-type': type } }).formData();
    const entry = form.get('file') ?? [...form.values()].find((v) => typeof v !== 'string') ?? null;
    if (!entry || typeof entry === 'string') return null;
    return { name: entry.name, bytes: new Uint8Array(await entry.arrayBuffer()) };
  }
  const name = request.headers.get('x-file-name') ?? request.nextUrl.searchParams.get('name');
  return { name: name ? decodeURIComponent(name) : null, bytes: body };
}
