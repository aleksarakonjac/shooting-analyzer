'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ParsedSiusResult } from '@/lib/domain/types';
import { sr } from '@/lib/i18n/sr';
import type { SessionKind } from '@/lib/import/saveTraining';
import type { SourceMeta } from '@/lib/import/uploadSource';
import {
  siusAthletePerformance,
  siusCompetitions,
  siusConfirmAthlete,
  siusEvents,
  siusExerciseResult,
  siusExercises,
  siusMyPerformance,
  siusParts,
} from '@/lib/sius/actions';
import type { CloudSession } from '@/lib/sius/formPrefill';
import {
  defaultProneRanges,
  firstShotAt,
  isProneProgram,
  matchShotCount,
  parseProneRanges,
  splitByPositions,
  type ProneRanges,
} from '@/lib/sius/map';
import { partLocalDate, sessionNameFor, stageFromPartName } from '@/lib/sius/pick';
import type { PickedResult, SiusState } from '@/lib/sius/service';
import type { RankingRow, SiusCompetition, SiusEvent, SiusExercise, SiusPart } from '@/lib/sius/types';
import { SegTabs } from '../ui/SegTabs';
import { ProneSplit } from './ProneSplit';

const t = sr.sius.cloud;

export interface CloudPick {
  parsed: ParsedSiusResult;
  /** The SIUS JSON, stored as the training's source file. */
  file: File;
  meta: SourceMeta;
  /** Only from the Takmičenje sub-tab: what the competition pick suggests for the session fields. */
  session?: CloudSession;
}

type Exercise = SiusExercise & { importedTrainingId: string | null };
const isState = (v: unknown): v is SiusState => !!v && typeof v === 'object' && 'state' in v;
const UNAVAILABLE: SiusState = { state: 'unavailable' };
/** A server action that rejects (network, deploy, server error) counts as SIUS being unavailable. */
async function call<T>(fn: () => Promise<T | SiusState>): Promise<T | SiusState> {
  try {
    return await fn();
  } catch {
    return UNAVAILABLE;
  }
}

function StateNote({ state, onRetry }: { state: SiusState; onRetry?: () => void }) {
  if (state.state === 'none')
    return <p role="status">{t.notConnected} <Link href="/nalog">{t.account}</Link>.</p>;
  if (state.state === 'broken')
    return <p role="status">{t.broken} <Link href="/nalog">{t.account}</Link>.</p>;
  if (state.state === 'not_configured') return <p role="status">{t.notConfigured}</p>;
  if (state.state === 'forbidden') return <p role="status">{t.forbidden}</p>;
  return (
    <p role="status">
      {state.reason === 'limit' ? t.limit : t.unavailable}{' '}
      {onRetry && <button type="button" className="button--quiet" onClick={onRetry}>{t.retry}</button>}
    </p>
  );
}

function toPick(parsed: ParsedSiusResult, picked: PickedResult, session?: CloudSession): CloudPick {
  const first = firstShotAt(parsed);
  return {
    parsed,
    file: new File([picked.raw], `sius-${picked.externalId.replace(/[^\w-]/g, '_')}.json`, { type: 'application/json' }),
    meta: { externalId: picked.externalId, firstShotAt: first ? first.toISOString() : null, shotCount: matchShotCount(parsed) },
    ...(session ? { session } : {}),
  };
}

/** Preview of a picked SIUS result, with the prone position split where needed, and the apply button. */
function Preview({
  picked,
  name,
  alreadyImported,
  session,
  onApply,
  extra,
}: {
  picked: PickedResult;
  name: string;
  alreadyImported?: boolean;
  session?: CloudSession;
  onApply: (p: CloudPick) => void;
  extra?: React.ReactNode;
}) {
  const count = matchShotCount(picked.parsed);
  const prone = isProneProgram(name);
  const [ranges, setRanges] = useState<ProneRanges>(() => defaultProneRanges(count));
  const check = useMemo(() => parseProneRanges(ranges, count), [ranges, count]);
  const parsed = useMemo(
    () => (prone && check.ok ? splitByPositions(picked.parsed, check.positions) : picked.parsed),
    [prone, check, picked.parsed],
  );
  const sighters = (parsed.sighters ?? []).reduce((a, g) => a + g.shots.length, 0);
  const warn = alreadyImported || picked.duplicateOf !== null;

  const apply = () => onApply(toPick(parsed, picked, session));

  return (
    <section className="stack" aria-label={name}>
      {extra}
      <p>
        {t.summary(count, parsed.series.length)}
        {sighters > 0 && <> · {t.sighters(sighters)}</>}
      </p>
      {parsed.series.length > 0 && (
        <p className="rows__muted num">{t.seriesTotals}: {parsed.series.map((s) => s.totalDecimal ?? s.total).join(' · ')}</p>
      )}
      {prone && <ProneSplit shotCount={count} value={ranges} check={check} onChange={setRanges} />}
      {alreadyImported && <p role="status">{t.alreadyImported}</p>}
      {picked.duplicateOf && <p role="status">{t.duplicate}</p>}
      <button type="button" onClick={apply} disabled={prone && !check.ok}>{warn ? t.applyAnyway : t.apply}</button>
    </section>
  );
}

function TrainingList({ shooterId, date, onApply }: { shooterId: string; date: string; onApply: (p: CloudPick) => void }) {
  const [items, setItems] = useState<Exercise[]>([]);
  const [more, setMore] = useState(false);
  const [state, setState] = useState<SiusState | null>(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<{ ex: Exercise; result: PickedResult } | null>(null);
  const [pickState, setPickState] = useState<SiusState | null>(null);

  const load = useCallback(
    async (skip: number) => {
      setLoading(true);
      const r = await call(() => siusExercises(shooterId, skip));
      setLoading(false);
      if (isState(r)) {
        setState(r);
        return;
      }
      setState(null);
      setItems((cur) => (skip === 0 ? r.items : [...cur, ...r.items]));
      setMore(r.more);
    },
    [shooterId],
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the first page once
    void load(0);
  }, [load]);

  async function pick(ex: Exercise) {
    setPickState(null);
    const r = await call(() => siusExerciseResult(shooterId, ex.exerciseId, ex.exerciseName));
    if (isState(r)) setPickState(r);
    else setPicked({ ex, result: r });
  }

  // The session's own day first, then newest first (as SIUS lists them).
  const ordered = useMemo(() => {
    const today = items.filter((e) => e.exerciseDate.slice(0, 10) === date);
    return [...today, ...items.filter((e) => e.exerciseDate.slice(0, 10) !== date)];
  }, [items, date]);

  if (picked) {
    return (
      <Preview
        picked={picked.result}
        name={picked.ex.exerciseName}
        alreadyImported={picked.ex.importedTrainingId !== null}
        onApply={onApply}
        extra={
          <p>
            <strong>{picked.ex.exerciseName}</strong> · {picked.ex.exerciseDate.slice(0, 10)}{' '}
            <button type="button" className="button--quiet" onClick={() => setPicked(null)}>{t.back}</button>
          </p>
        }
      />
    );
  }
  if (state) return <StateNote state={state} onRetry={() => void load(0)} />;
  return (
    <div className="stack">
      {loading && items.length === 0 && <p className="rows__muted">{t.loading}</p>}
      {!loading && items.length === 0 && <p className="rows__muted">{t.noExercises}</p>}
      {pickState && <StateNote state={pickState} />}
      <ul className="rows">
        {ordered.map((e) => (
          <li key={e.exerciseId} className="rows__item" data-today={e.exerciseDate.slice(0, 10) === date ? 'true' : undefined}>
            <button type="button" className="rows__main button--quiet" onClick={() => void pick(e)}>
              <span className="num">{e.exerciseDate.slice(0, 10)}{e.startTime ? ` ${e.startTime.slice(11, 16)}` : ''}</span>{' '}
              <strong>{e.exerciseName}</strong>{' '}
              <span className="rows__muted">{t.shots(e.numberOfCompetitionShots)}{e.totalString ? ` · ${e.totalString}` : ''}</span>
            </button>
            {e.importedTrainingId && <Link href={`/trening/${e.importedTrainingId}`}>{t.imported}</Link>}
          </li>
        ))}
      </ul>
      {more && <button type="button" className="button--quiet" disabled={loading} onClick={() => void load(items.length)}>{t.more}</button>}
    </div>
  );
}

type Step = { comp?: SiusCompetition; event?: SiusEvent; part?: SiusPart };

function CompetitionPicker({ shooterId, onApply }: { shooterId: string; onApply: (p: CloudPick) => void }) {
  const [query, setQuery] = useState('');
  const [comps, setComps] = useState<SiusCompetition[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [failure, setFailure] = useState<{ state: SiusState; retry: () => void } | null>(null);
  const [step, setStep] = useState<Step>({});
  const [events, setEvents] = useState<SiusEvent[] | null>(null);
  const [parts, setParts] = useState<SiusPart[] | null>(null);
  const [found, setFound] = useState<(PickedResult & { row: RankingRow }) | null>(null);
  const [ranking, setRanking] = useState<RankingRow[] | null>(null);
  const [filter, setFilter] = useState('');
  const [checking, setChecking] = useState<(PickedResult & { row: RankingRow }) | null>(null);

  // A failed step keeps its place in the flow; "Pokušaj ponovo" runs that same step again.
  const fail = (state: SiusState, retry: () => void) => setFailure({ state, retry: () => { setFailure(null); retry(); } });

  const loadComps = useCallback(async function load(p: number, name: string): Promise<void> {
    const r = await call(() => siusCompetitions(p, name));
    if (isState(r)) {
      setFailure({ state: r, retry: () => { setFailure(null); void load(p, name); } });
      return;
    }
    setFailure(null);
    setComps((cur) => (p === 1 ? r.items : [...cur, ...r.items]));
    setMore(r.more);
    setPage(p);
  }, []);
  useEffect(() => {
    void loadComps(1, '');
  }, [loadComps]);

  async function pickComp(comp: SiusCompetition) {
    setStep({ comp });
    setEvents(null);
    const r = await call(() => siusEvents(comp.id));
    if (isState(r)) fail(r, () => void pickComp(comp));
    else setEvents(r);
  }
  async function pickEvent(event: SiusEvent) {
    setStep((s) => ({ comp: s.comp, event }));
    setParts(null);
    const comp = step.comp!;
    const r = await call(() => siusParts(comp.id, event.id));
    if (isState(r)) fail(r, () => void pickEvent(event));
    else setParts(r);
  }
  const selection = (s: Required<Step>) => ({ compId: s.comp.id, eventId: s.event.id, partId: s.part.id, eventName: s.event.name, partName: s.part.name });
  async function pickPart(part: SiusPart) {
    const s = { ...step, part } as Required<Step>;
    setStep(s);
    setFound(null);
    setRanking(null);
    const r = await call(() => siusMyPerformance(shooterId, selection(s)));
    if (isState(r)) fail(r, () => void pickPart(part));
    else if ('found' in r) setFound(r.found);
    else setRanking(r.pick);
  }
  async function checkAthlete(row: RankingRow) {
    const r = await call(() => siusAthletePerformance(shooterId, selection(step as Required<Step>), row.athleteRunningId));
    if (isState(r)) fail(r, () => void checkAthlete(row));
    else setChecking({ ...r, row });
  }

  const session = (s: Required<Step>): CloudSession => ({
    name: sessionNameFor(s.comp.name, s.event.name, s.part.name),
    eventName: s.comp.name,
    place: [s.comp.city, s.comp.country].filter(Boolean).join(', '),
    date: partLocalDate(s.part.startDate, s.comp.timeZone),
    stage: stageFromPartName(s.part.name),
  });
  const rowLine = (r: RankingRow) => `${r.rank ? `${r.rank}. ` : ''}${r.displayName} (${r.nation}) ${r.total}`;

  if (failure) return <StateNote state={failure.state} onRetry={failure.retry} />;

  if (!step.comp) {
    return (
      <div className="stack">
        <form className="row" onSubmit={(e) => { e.preventDefault(); void loadComps(1, query.trim()); }}>
          <label>
            {t.searchCompetition}
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button type="submit" className="button--quiet">{t.search}</button>
        </form>
        {comps.length === 0 && <p className="rows__muted">{t.noCompetitions}</p>}
        <ul className="rows">
          {comps.map((c) => (
            <li key={c.id} className="rows__item">
              <button type="button" className="rows__main button--quiet" onClick={() => void pickComp(c)}>
                <strong>{c.name}</strong> <span className="rows__muted">{[c.city, c.country].filter(Boolean).join(', ')} · {partLocalDate(c.startDate, c.timeZone)}</span>
              </button>
            </li>
          ))}
        </ul>
        {more && <button type="button" className="button--quiet" onClick={() => void loadComps(page + 1, query.trim())}>{t.more}</button>}
      </div>
    );
  }

  const head = (
    <p>
      <strong>{step.comp.name}</strong>
      {step.event && <> · {step.event.name}</>}
      {step.part && <> · {step.part.name}</>}{' '}
      <button type="button" className="button--quiet" onClick={() => { setStep({}); setFound(null); setRanking(null); setChecking(null); }}>{t.otherCompetition}</button>
    </p>
  );

  if (!step.event) {
    return (
      <div className="stack">
        {head}
        <h3>{t.pickEvent}</h3>
        {events === null ? <p className="rows__muted">{t.loading}</p> : (
          <ul className="rows">
            {events.map((e) => (
              <li key={e.id} className="rows__item"><button type="button" className="button--quiet" onClick={() => void pickEvent(e)}>{e.name}</button></li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (!step.part) {
    return (
      <div className="stack">
        {head}
        <h3>{t.pickPart}</h3>
        {parts === null ? <p className="rows__muted">{t.loading}</p> : parts.length === 0 ? <p className="rows__muted">{t.noParts}</p> : (
          <ul className="rows">
            {parts.map((p) => (
              <li key={p.id} className="rows__item">
                <button type="button" className="button--quiet" onClick={() => void pickPart(p)}>{p.name} · {p.startDate.slice(11, 16)}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const full = step as Required<Step>;
  if (found) {
    return <Preview picked={found} name={full.event.name} session={session(full)} onApply={onApply} extra={<>{head}<p>{rowLine(found.row)}</p></>} />;
  }
  if (checking) {
    return (
      <div className="stack">
        {head}
        <p>{t.checkMe}</p>
        <p><strong>{rowLine(checking.row)}</strong></p>
        {checking.row.seriesTotals.length > 0 && <p className="num">{t.seriesTotals}: {checking.row.seriesTotals.join(' · ')}</p>}
        <p>{t.summary(matchShotCount(checking.parsed), checking.parsed.series.length)}</p>
        <div className="row">
          <button
            type="button"
            onClick={async () => {
              // Confirming is the double check: it remembers the athlete id and imports the result.
              const saved = await call(() => siusConfirmAthlete(shooterId, checking.row.identifier));
              if (isState(saved)) {
                fail(saved, () => undefined);
                return;
              }
              onApply(toPick(checking.parsed, checking, session(full)));
            }}
          >
            {t.confirmMe}
          </button>
          <button type="button" className="button--quiet" onClick={() => setChecking(null)}>{t.back}</button>
        </div>
      </div>
    );
  }
  if (ranking) {
    const f = filter.trim().toLowerCase();
    const shown = f ? ranking.filter((r) => r.displayName.toLowerCase().includes(f) || r.nation.toLowerCase().includes(f)) : ranking;
    return (
      <div className="stack">
        {head}
        <p role="status">{t.notFound}</p>
        <label>
          {t.searchAthlete}
          <input value={filter} onChange={(e) => setFilter(e.target.value)} />
        </label>
        <ul className="rows">
          {shown.map((r) => (
            <li key={r.athleteRunningId} className="rows__item">
              <button type="button" className="button--quiet" onClick={() => void checkAthlete(r)}>{rowLine(r)}</button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return <>{head}<p className="rows__muted">{t.loading}</p></>;
}

/** The SIUS Cloud source: the shooter's private SIUS exercises, or their own result in a public competition. */
export function SiusCloudTab({
  shooterId,
  sessionKind,
  date,
  onApply,
}: {
  shooterId: string;
  sessionKind: SessionKind;
  date: string;
  onApply: (p: CloudPick) => void;
}) {
  const [sub, setSub] = useState(sessionKind === 'takmicenje' ? 'competition' : 'training');
  return (
    <SegTabs
      label={t.tab}
      value={sub}
      onChange={setSub}
      tabs={[
        { id: 'training', label: t.subTraining, content: <TrainingList shooterId={shooterId} date={date} onApply={onApply} /> },
        { id: 'competition', label: t.subCompetition, content: <CompetitionPicker shooterId={shooterId} onApply={onApply} /> },
      ]}
    />
  );
}
