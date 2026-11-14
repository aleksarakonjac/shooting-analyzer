'use client';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Workspace } from '@/components/Workspace';
import { FilterBar } from '@/components/sessions/FilterBar';
import { DISCIPLINES } from '@/lib/domain/disciplines';
import { sr } from '@/lib/i18n/sr';
import { bestIndex, deltaTo, MAX_COMPARE, pickCompared, sessionMetrics, type SessionMetrics } from '@/lib/stats/compare';
import { filtersHref, hasFilters, type SessionFilters } from '@/lib/stats/filters';
import type { TrainingSummary } from '@/lib/stats/periodStats';

const t = sr.stats;
const d = sr.dashboard;
const nt = sr.newTraining;
const dash = d.noValue;

const dayLabel = (iso: string) => {
  const [, m, day] = iso.split('-');
  return `${Number(day)}. ${Number(m)}.`;
};
const num = (v: number | null, digits = 1) => (v === null ? dash : v.toFixed(digits));
const signed = (v: number | null) => (v === null || v === 0 ? null : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`);
const dur = (min: number | null) => (min === null ? dash : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`);

/** Rough comparison of sessions: a chart and a table with the sessions as columns (pure; the page loads). */
export function StatsView({
  all,
  chosen,
  filters,
  base,
  choices,
}: {
  /** Sessions matching the filters, newest first (what can be picked). */
  all: TrainingSummary[];
  /** Ids named in the URL; empty means the newest few. */
  chosen: string[];
  filters: SessionFilters;
  base: string;
  choices: { places: string[]; events: { id: string; name: string }[]; years?: string[] };
}) {
  const f = filters;
  // Which sessions are ticked and whether the comparison is open are view state: no server trip.
  const [ids, setIds] = useState<string[]>(chosen);
  const [comparing, setComparing] = useState(chosen.length > 0);
  const present = all.filter((x) => ids.includes(x.id));
  const { sessions, dropped } = present.length ? pickCompared(all, present.map((x) => x.id)) : { sessions: [] as TrainingSummary[], dropped: 0 };
  const metrics = sessions.map(sessionMetrics);
  const discipline = comparing ? sessions[0]?.discipline : undefined;
  const activeCount = [f.discipline, f.kind, f.stage, f.place, f.event].filter(Boolean).length;
  const mirror = (next: string[]) => {
    try {
      const url = new URL(filtersHref(base, f, {}), 'http://x');
      next.forEach((id) => url.searchParams.append('c', id));
      window.history.replaceState(window.history.state, '', url.pathname + url.search);
    } catch { /* the address bar is a convenience */ }
  };
  const update = (next: string[]) => { setIds(next); mirror(next); };
  const open = (v: boolean) => { setComparing(v); mirror(v ? ids : []); };

  const pickedDiscipline = present[0]?.discipline;

  const strip = (
    <>
      <div className="ws__head">
        <h1 className="ws__title">{t.title}</h1>
        {discipline && <p className="ws__meta">{DISCIPLINES[discipline].nameSr}</p>}
      </div>
      <div className="ws__strip-end">
        <FilterBar base={base} filters={f} places={choices.places} events={choices.events} years={choices.years ?? []} activeCount={activeCount} />
        {hasFilters(f) && <Link className="button button--quiet" href={base}>{d.clear}</Link>}
        {comparing ? (
          <button type="button" className="button button--quiet" onClick={() => open(false)}>{t.backToList}</button>
        ) : (
          <>
            {sessions.length > 0 && <button type="button" className="button button--quiet" onClick={() => update([])}>{t.clearPick}</button>}
            <button type="button" className="button" disabled={sessions.length < 2} onClick={() => open(true)}>{t.compare(sessions.length)}</button>
          </>
        )}
      </div>
    </>
  );

  if (all.length === 0) {
    return (
      <Workspace
        label={d.panels}
        strip={strip}
        rows={1}
        panels={[{ id: 'table', title: t.listTitle, col: '1 / 13', row: '1 / 2', wide: true, children: <p className="panel__empty">{t.empty}</p> }]}
      />
    );
  }

  if (!comparing) {
    const toggle = (id: string, on: boolean) => update(on ? [...ids, id].slice(-MAX_COMPARE) : ids.filter((x) => x !== id));
    const rowsAll = all.map((x) => ({ x, m: sessionMetrics(x) }));
    const list: ReactNode = (
      <div className="stats__table-wrap">
        <table className="stats__list">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">{t.pickCol}</span></th>
              <th scope="col">{d.colDate}</th>
              <th scope="col">{d.colSession}</th>
              <th scope="col" className="stats__opt">{d.colPlace}</th>
              <th scope="col" className="num">{t.total}</th>
              <th scope="col" className="num stats__opt">{t.avgSeries}</th>
              <th scope="col" className="num stats__opt">{t.group}</th>
              <th scope="col" className="num stats__opt">{t.hr}</th>
              <th scope="col" className="num stats__opt">{t.shots}</th>
              <th scope="col" className="num stats__opt">{t.duration}</th>
            </tr>
          </thead>
          <tbody>
            {rowsAll.map(({ x, m }) => {
              const on = ids.includes(x.id);
              const blocked = !on && ((pickedDiscipline && x.discipline !== pickedDiscipline) || (ids.length >= MAX_COMPARE));
              const dg = DISCIPLINES[x.discipline].decimal ? 1 : 0;
              return (
                <tr key={x.id} data-picked={on || undefined} data-blocked={blocked || undefined}>
                  <td>
                    <input type="checkbox" checked={on} disabled={!!blocked} onChange={(e) => toggle(x.id, e.target.checked)}
                      aria-label={`${t.pickOne} ${x.name}`} title={blocked ? (ids.length >= MAX_COMPARE ? t.pickMax : t.otherDisciplines) : undefined} />
                  </td>
                  <td className="num"><Link href={`/trening/${x.id}`}>{dayLabel(x.trainedOn)}</Link></td>
                  <td>
                    <span className="stats__name">{x.name}</span>
                    <small>{[DISCIPLINES[x.discipline].nameSr, x.kind && x.kind !== 'trening' ? nt.kinds[x.kind] : null, x.stage && x.stage !== 'slobodno' ? nt.stages[x.stage] : null].filter(Boolean).join(' · ')}</small>
                  </td>
                  <td className="stats__opt">{x.place || dash}</td>
                  <td className="num stats__strong">{num(m.total, dg)}</td>
                  <td className="num stats__opt">{num(m.avgSeries, dg)}</td>
                  <td className="num stats__opt">{num(m.groupMm)}</td>
                  <td className="num stats__opt">{num(m.hr, 0)}</td>
                  <td className="num stats__opt">{m.shots || dash}</td>
                  <td className="num stats__opt">{dur(m.durationMin)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="stats__note">{t.pickHint}</p>
      </div>
    );
    return (
      <Workspace
        label={d.panels}
        strip={strip}
        rows={1}
        panels={[{ id: 'table', title: t.listTitle, headless: true, col: '1 / 13', row: '1 / 2', wide: true, flush: true, children: list }]}
      />
    );
  }

  if (sessions.length === 0) {
    return (
      <Workspace
        label={d.panels}
        strip={strip}
        rows={1}
        panels={[{ id: 'table', title: t.tableTitle, col: '1 / 13', row: '1 / 2', wide: true, children: <p className="panel__empty">{t.empty}</p> }]}
      />
    );
  }

  const dec = DISCIPLINES[sessions[0].discipline].decimal;
  const digits = dec ? 1 : 0;
  const col = <K extends keyof SessionMetrics>(k: K) => metrics.map((m) => m[k] as number | null);
  const rows: { label: string; cells: (m: SessionMetrics, i: number) => React.ReactNode; best?: number | null; delta?: (number | null)[] }[] = [
    { label: t.total, cells: (m) => num(m.total, digits), best: bestIndex(col('total')), delta: col('total') },
    { label: t.avgSeries, cells: (m) => num(m.avgSeries, digits), best: bestIndex(col('avgSeries')), delta: col('avgSeries') },
    { label: t.bestWorst, cells: (m) => (m.bestSeries === null ? dash : `${num(m.bestSeries, digits)} / ${num(m.worstSeries, digits)}`) },
    { label: t.group, cells: (m) => num(m.groupMm), best: bestIndex(col('groupMm'), true), delta: col('groupMm') },
    { label: t.hr, cells: (m) => num(m.hr, 0) },
    { label: t.shots, cells: (m) => (m.shots || dash) },
    { label: t.duration, cells: (m) => dur(m.durationMin) },
  ];

  const avgs = metrics.map((m) => m.avgSeries);
  const have = avgs.filter((v): v is number => v !== null);
  const lo = have.length ? Math.min(...have) : 0;
  const hi = have.length ? Math.max(...have) : 0;
  const height = (v: number) => (hi === lo ? 60 : 22 + ((v - lo) / (hi - lo)) * 66);
  const maxSeries = Math.max(0, ...metrics.map((m) => m.series.length));

  const chart = (
    <div className="stats__chart" role="img" aria-label={`${t.chartTitle}. ${t.chartNote}`}>
      {sessions.map((s, i) => (
        <div key={s.id} className="stats__bar">
          <span className="num stats__bar-val">{num(avgs[i], digits)}</span>
          <span className="stats__bar-fill" data-best={bestIndex(avgs) === i || undefined} style={{ height: avgs[i] === null ? '2%' : `${height(avgs[i]!)}%` }} />
          <span className="stats__bar-lab">{dayLabel(s.trainedOn)}</span>
        </div>
      ))}
    </div>
  );

  const table = (
    <div className="stats__table-wrap">
      <table className="stats__table">
        <thead>
          <tr>
            <th scope="col">{t.metric}</th>
            {sessions.map((s, i) => (
              <th key={s.id} scope="col">
                <Link href={`/trening/${s.id}`} title={s.name}>{dayLabel(s.trainedOn)}</Link>
                <small>{[s.kind && s.kind !== 'trening' ? nt.kinds[s.kind] : nt.kinds.trening, i === 0 ? t.base : null].filter(Boolean).join(' · ')}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              {metrics.map((m, i) => {
                const dl = r.delta && i > 0 ? signed(deltaTo(r.delta[0], r.delta[i])) : null;
                return (
                  <td key={m.id} className="num" data-best={r.best === i || undefined}>
                    {r.cells(m, i)}
                    {dl && <small className="stats__delta">{dl}</small>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {maxSeries > 0 && (
        <details className="stats__series" open>
          <summary>{t.showSeries}</summary>
          <table className="stats__table">
            <tbody>
              {Array.from({ length: maxSeries }, (_, k) => (
                <tr key={k}>
                  <th scope="row">{t.seriesN(k + 1)}</th>
                  {metrics.map((m) => (
                    <td key={m.id} className="num">
                      {num(m.series[k] ?? null, digits)}
                      {m.seriesGroups[k] != null && <small className="stats__delta">{num(m.seriesGroups[k], 1)} mm</small>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {dropped > 0 && <p className="stats__note">{t.otherDisciplines}</p>}
      {sessions.length < 2 && <p className="stats__note">{t.needTwo}</p>}
      <p className="stats__note">{t.drill}</p>
    </div>
  );

  return (
    <Workspace
      label={d.panels}
      strip={strip}
      rows={6}
      panels={[
        { id: 'chart', title: t.chartTitle, range: t.chartNote, col: '1 / 13', row: '1 / 3', wide: true, children: chart },
        { id: 'table', title: t.tableTitle, range: `${sessions.length} / ${MAX_COMPARE}`, col: '1 / 13', row: '3 / 7', wide: true, flush: true, children: table },
      ]}
    />
  );
}
