import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, siteUrl } from '@/lib/supabase/admin';
import { bearerToken, hashInboxToken } from '@/lib/inbox/token';
import { acceptInboxFile, type InboxDeps } from '@/lib/inbox/upload';

/**
 * Upload from the iOS share sheet (a Shortcut): `Authorization: Bearer <token>` and the SCATT file either as
 * multipart field `file` or as the raw request body (name in `X-File-Name` or `?name=`). The file waits in the
 * owner's inbox; the response carries the URL that opens session entry with it.
 */
export async function POST(request: NextRequest) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'not configured' }, { status: 500 });

  const token = bearerToken(request.headers.get('authorization'));
  let file: { name: string | null; bytes: Uint8Array } | null = null;
  // Read the body only for a well-formed token, so anonymous junk costs nothing.
  if (token) {
    try {
      file = await readFile(request);
    } catch {
      return NextResponse.json({ error: 'unreadable body' }, { status: 400 });
    }
  }

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

  const result = await acceptInboxFile(token ? hashInboxToken(token) : null, file, deps);
  if (result.status !== 201) return NextResponse.json({ error: result.error }, { status: result.status });
  const base = siteUrl() ?? new URL(request.url).origin;
  return NextResponse.json({ id: result.id, url: `${base}/trening/novi?inbox=${result.id}` }, { status: 201 });
}

async function readFile(request: NextRequest): Promise<{ name: string | null; bytes: Uint8Array } | null> {
  const type = request.headers.get('content-type') ?? '';
  if (type.startsWith('multipart/form-data')) {
    const form = await request.formData();
    const entry = form.get('file') ?? [...form.values()].find((v) => typeof v !== 'string') ?? null;
    if (!entry || typeof entry === 'string') return null;
    return { name: entry.name, bytes: new Uint8Array(await entry.arrayBuffer()) };
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  const name = request.headers.get('x-file-name') ?? request.nextUrl.searchParams.get('name');
  return { name: name ? decodeURIComponent(name) : null, bytes };
}
