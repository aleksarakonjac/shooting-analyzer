import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clubToken, confirmUpload, startUpload } from '@/lib/inbox/directUpload';
import { uploadDeps } from '@/lib/inbox/uploadDeps';

interface Club {
  club_id: string;
  name: string;
  shooters: { id: string; display_name: string }[];
}

const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

type Found = { admin: NonNullable<ReturnType<typeof createAdminClient>>; club: Club } | { response: NextResponse };

/** The club behind the request's token. The token is all a range laptop has: it opens the names and sending, nothing else. */
async function clubOf(request: NextRequest): Promise<Found> {
  const admin = createAdminClient();
  if (!admin) return { response: json({ error: 'not configured' }, 500) };
  const token = clubToken(request.headers.get('authorization'));
  if (!token) return { response: json({ error: 'unauthorized' }, 401) };
  const { data, error } = await admin.rpc('club_shooters', { p_token: token });
  if (error) return { response: json({ error: 'unavailable' }, 500) };
  return data ? { admin, club: data as Club } : { response: json({ error: 'unauthorized' }, 401) };
}

export async function GET(request: NextRequest) {
  const found = await clubOf(request);
  if ('response' in found) return found.response;
  const { name, shooters } = found.club;
  return json({ name, shooters: shooters.map((s) => ({ id: s.id, name: s.display_name })) }, 200);
}

export async function POST(request: NextRequest) {
  const found = await clubOf(request);
  if ('response' in found) return found.response;
  const { admin, club } = found;
  const deps = uploadDeps(admin, { club_id: club.club_id }, async (id) => club.shooters.some((s) => s.id === id));
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const result =
      body?.step === 'start'
        ? await startUpload({ shooterId: String(body.shooterId), fileName: String(body.fileName ?? ''), bytes: body.bytes as number, meta: body.meta }, deps)
        : body?.step === 'confirm' && /^[0-9a-f-]{36}$/i.test(String(body.uploadId))
          ? await confirmUpload(String(body.uploadId), deps)
          : ({ status: 400, error: 'bad request' } as const);
    return json(result, result.status);
  } catch {
    return json({ error: 'failed' }, 500);
  }
}
