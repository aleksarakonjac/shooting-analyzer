import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { isCronAuthorized } from '@/lib/cron';
import { RETENTION_DAYS } from '@/lib/trash/daysLeft';

// Called daily by Vercel Cron (see vercel.json). Uses the service role, which lives only in the
// deployment's environment variables, never in the repository.
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new NextResponse('not configured', { status: 500 });

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  // Remove the stored source files of what is about to be purged; purge_trash() only knows rows.
  const { data: due } = await admin.from('trainings').select('id').lt('deleted_at', cutoff);
  for (const { id } of (due ?? []) as { id: string }[]) {
    const bucket = admin.storage.from('source-files');
    const { data: files } = await bucket.list(id);
    if (files?.length) await bucket.remove(files.map((f) => `${id}/${f.name}`));
  }
  const { data: purged, error } = await admin.rpc('purge_trash');
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ purged });
}
