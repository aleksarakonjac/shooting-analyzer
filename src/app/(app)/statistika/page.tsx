import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { StatsView } from '@/components/StatsView';
import { getSessionProfile } from '@/lib/auth/session';
import { sr } from '@/lib/i18n/sr';
import { parseFilters, type FilterSearch } from '@/lib/stats/filters';
import { filterChoices, loadSessions } from '@/lib/stats/loadSessions';

type Search = FilterSearch & { c?: string | string[] };

export default function StatsPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={null}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Search> }) {
  await connection();
  const profile = await getSessionProfile();
  if (profile?.role === 'coach') redirect('/strelci');
  if (profile?.role === 'admin') redirect('/admin/approvals');
  if (!profile || profile.role !== 'shooter') return <h1 className="sr-only">{sr.appName}</h1>;
  const { c, ...search } = await searchParams;
  const filters = parseFilters(search as FilterSearch, new Date(), profile.tz);
  const [all, choices] = await Promise.all([loadSessions(profile.id, filters), filterChoices(profile.id)]);
  const chosen = (Array.isArray(c) ? c : c ? [c] : []).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  return <StatsView all={all} chosen={chosen} filters={filters} base="/statistika" choices={choices} />;
}
