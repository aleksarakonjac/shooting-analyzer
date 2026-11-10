import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { isCronAuthorized } from '@/lib/cron';
import { RETENTION_DAYS } from '@/lib/trash/daysLeft';
import { purgeExpired } from '@/lib/trash/purge';

/** Storage list() returns at most this many entries per call. */
const PAGE = 1000;

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
  const bucket = admin.storage.from('source-files');
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  try {
    const result = await purgeExpired(
      {
        dueIds: async (c) => {
          const { data, error } = await admin.from('trainings').select('id').not('deleted_at', 'is', null).lt('deleted_at', c);
          if (error) throw new Error(error.message);
          return (data as { id: string }[]).map((r) => r.id);
        },
        listFiles: async (id) => {
          const paths: string[] = [];
          for (let offset = 0; ; offset += PAGE) {
            const { data, error } = await bucket.list(id, { limit: PAGE, offset });
            if (error) throw new Error(error.message);
            paths.push(...data.map((f) => `${id}/${f.name}`));
            if (data.length < PAGE) return paths;
          }
        },
        removeFiles: async (paths) => {
          const { error } = await bucket.remove(paths);
          if (error) throw new Error(error.message);
        },
        purge: async (ids, c) => {
          const { data, error } = await admin.rpc('purge_trainings', { ids, cutoff: c });
          if (error) throw new Error(error.message);
          return (data as string[] | null) ?? [];
        },
      },
      cutoff,
    );
    // Trainings whose files could not be removed are retried tomorrow; report them.
    return NextResponse.json({ purged: result.purged.length, failed: result.failed.length }, { status: result.failed.length ? 207 : 200 });
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : 'purge failed', { status: 500 });
  }
}
