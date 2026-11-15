'use client';
import { useState } from 'react';
import { sr } from '@/lib/i18n/sr';
import type { PullError, PullInput } from '@/lib/googleHealth/pull';
import type { Span, Workout } from '@/lib/googleHealth/window';

const t = sr.googleHealth;

/** What the form asks for: a saved training by id, or a new one by date, shot times and entered times. */
export function pullBody(o: {
  trainingId?: string;
  shooterId: string;
  date: string;
  shotTimes: (number | null | undefined)[];
  startedAt: string | null;
  endedAt: string | null;
}): PullInput {
  if (o.trainingId) return { trainingId: o.trainingId };
  const times = o.shotTimes.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  const shotSpan: Span | null = times.length ? { fromMs: Math.min(...times), toMs: Math.max(...times) } : null;
  return { shooterId: o.shooterId, date: o.date, shotSpan, startedAt: o.startedAt, endedAt: o.endedAt };
}

export interface PulledInfo {
  range: Span;
  workout: Workout | null;
}

type Ok = { status: 200; tcx: string; fileName: string; workout: Workout | null; range: Span };

/** "Pull pulse from Google Health" in the heart-rate card: the result goes on as a TCX file, like an upload. */
export function HealthPull({
  status,
  isCoach,
  tz,
  body,
  onPulled,
}: {
  status: 'none' | 'ok' | 'broken';
  isCoach: boolean;
  tz: string;
  /** The request, or null while there is nothing to ask for yet (no date). */
  body: () => PullInput | null;
  onPulled: (file: File, info: PulledInfo) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<PulledInfo | null>(null);

  if (status === 'none') return null;
  if (status === 'broken') return <p role="status">{t.pull.broken}</p>;

  const hm = (ms: number) => new Intl.DateTimeFormat('sr-Latn-RS', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(ms);
  const request = body();

  const pull = async () => {
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/google-health/pulse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
      const data = (await res.json().catch(() => null)) as (Ok | { error?: PullError }) | null;
      if (res.ok && data && 'tcx' in data) {
        const info = { range: data.range, workout: data.workout };
        onPulled(new File([data.tcx], data.fileName, { type: 'application/xml' }), info);
        setDone(info);
      } else {
        const code = data && 'error' in data ? data.error : undefined;
        setError(code === 'no_window' && isCoach ? t.pull.errors.no_window_coach : (code && t.pull.errors[code]) || t.pull.errors.google_unavailable);
      }
    } catch {
      setError(t.pull.errors.google_unavailable);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <button type="button" className="button--quiet" onClick={pull} disabled={!request || busy} aria-busy={busy}>
        {t.pull.button}
      </button>
      {busy && <p role="status">{t.pull.busy}</p>}
      {error && <p role="alert">{error}</p>}
      {done && !error && (
        <>
          <p role="status">{t.pull.done(hm(done.range.fromMs), hm(done.range.toMs))}</p>
          {done.workout && <p>{t.pull.workout(hm(done.workout.startMs), hm(done.workout.endMs))}</p>}
        </>
      )}
    </div>
  );
}
