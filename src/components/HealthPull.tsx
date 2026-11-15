'use client';
import Link from 'next/link';
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
  const times = o.shotTimes.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  const shotSpan: Span | null = times.length ? { fromMs: Math.min(...times), toMs: Math.max(...times) } : null;
  // On a saved training the server reads what is stored; the form's own (unsaved) times go along for the shooter.
  if (o.trainingId) return { trainingId: o.trainingId, shotSpan, startedAt: o.startedAt, endedAt: o.endedAt };
  return { shooterId: o.shooterId, date: o.date, shotSpan, startedAt: o.startedAt, endedAt: o.endedAt };
}

export interface PulledInfo {
  range: Span;
  received: Span;
  workout: Workout | null;
  /** The watch ran this far off the shot times (another zone's clock); the pulse is already moved back. */
  clockShiftMs: number;
}

type Ok = { status: 200; tcx: string; fileName: string; workout: Workout | null; range: Span; received?: Span; clockShiftMs?: number };

/** A clock shift as "+2:00" / "−0:45" (hours and minutes). */
const shiftLabel = (ms: number) => {
  const m = Math.round(Math.abs(ms) / 60_000);
  return `${ms < 0 ? '−' : '+'}${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

/** Pulse that stops this long before the asked-for end most likely means the watch has not synced yet. */
const SHORT_MS = 10 * 60_000;

/** "Pull pulse from Google Health" in the heart-rate card: the result goes on as a TCX file, like an upload. */
export function HealthPull({
  status,
  isCoach,
  tz,
  body,
  onPulled,
  disabled = false,
  loadedName,
}: {
  /** Not yet: the saved files of the training are still loading and would replace a pulled file. */
  disabled?: boolean;
  /** Name of the pulse file the form holds now; the success message stays only while it is the pulled one. */
  loadedName?: string | null;
  status: 'none' | 'ok' | 'broken';
  isCoach: boolean;
  tz: string;
  /** The request, or null while there is nothing to ask for yet (no date). */
  body: () => PullInput | null;
  onPulled: (file: File, info: PulledInfo) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<(PulledInfo & { fileName: string }) | null>(null);
  const [errorCode, setErrorCode] = useState<PullError | null>(null);

  // The shooter fixes a broken link themselves on the account page; a coach can only ask the shooter.
  const brokenOwn = (role: 'status' | 'alert') => (
    <p role={role}>
      {t.pull.brokenOwn} <Link href="/nalog">{t.pull.accountLink}</Link>.
    </p>
  );
  if (status === 'none') return null;
  if (status === 'broken') return isCoach ? <p role="status">{t.pull.broken}</p> : brokenOwn('status');

  const hm = (ms: number) => new Intl.DateTimeFormat('sr-Latn-RS', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(ms);
  const request = body();

  const pull = async () => {
    if (!request) return;
    setBusy(true);
    setError(null);
    setErrorCode(null);
    try {
      const res = await fetch('/api/google-health/pulse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
      const data = (await res.json().catch(() => null)) as (Ok | { error?: PullError }) | null;
      if (res.ok && data && 'tcx' in data) {
        const info = { range: data.range, received: data.received ?? data.range, workout: data.workout, clockShiftMs: data.clockShiftMs ?? 0 };
        onPulled(new File([data.tcx], data.fileName, { type: 'application/xml' }), info);
        setDone({ ...info, fileName: data.fileName });
      } else {
        const code = data && 'error' in data ? data.error : undefined;
        setErrorCode(code ?? null);
        setError(code === 'no_window' && isCoach ? t.pull.errors.no_window_coach : (code && t.pull.errors[code]) || t.pull.errors.google_unavailable);
      }
    } catch {
      setError(t.pull.errors.google_unavailable);
    } finally {
      setBusy(false);
    }
  };

  const current = done && (loadedName === undefined || loadedName === done.fileName) ? done : null;
  return (
    <div className="stack">
      <button type="button" className="button--quiet" onClick={pull} disabled={!request || busy || disabled} aria-busy={busy}>
        {t.pull.button}
      </button>
      {busy && <p role="status">{t.pull.busy}</p>}
      {error && (errorCode === 'reconnect' && !isCoach ? brokenOwn('alert') : <p role="alert">{error}</p>)}
      {current && !error && (
        <>
          <p role="status">{t.pull.done(hm(current.received.fromMs), hm(current.received.toMs))}</p>
          {current.received.toMs < current.range.toMs - SHORT_MS && <p>{t.pull.short}</p>}
          {current.workout && <p>{t.pull.workout(hm(current.workout.startMs), hm(current.workout.endMs))}</p>}
          {current.clockShiftMs !== 0 && <p role="status">{t.pull.clockShift(shiftLabel(current.clockShiftMs))}</p>}
        </>
      )}
    </div>
  );
}
