import { SessionsView } from '@/components/SessionsView';
import { parseFilters, type FilterSearch } from '@/lib/stats/filters';
import { filterChoices, loadSessions } from '@/lib/stats/loadSessions';

export { SessionsView };

export type DashboardSearch = FilterSearch;

/** Sessions page of one shooter: the shooter's own home and the coach's drill-down. */
export async function ShooterDashboard({
  shooterId,
  tz,
  title,
  base,
  newHref,
  search,
  back,
}: {
  /** A link back to where the viewer came from (the coach's list). */
  back?: { href: string; label: string };
  shooterId: string;
  tz: string;
  title: string;
  /** Path the filter links point to ('/' or '/strelci/<id>'). */
  base: string;
  newHref: string;
  search: DashboardSearch;
}) {
  const filters = parseFilters(search, new Date(), tz);
  const [all, choices] = await Promise.all([loadSessions(shooterId, filters), filterChoices(shooterId)]);
  return <SessionsView all={all} filters={filters} title={title} base={base} newHref={newHref} back={back} choices={choices} />;
}
