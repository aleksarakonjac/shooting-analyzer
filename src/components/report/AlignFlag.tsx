'use client';
import Link from 'next/link';
import { Button, Dialog, DialogTrigger, Popover } from 'react-aria-components';
import { sr } from '@/lib/i18n/sr';
import { confirmAlignmentForm } from '@/lib/trainings';

const t = sr.report.alignFlag;

export interface AlignFacts {
  siusShots: number;
  /** SIUS shots paired with a SCATT shot. */
  pairedShots: number;
  /** How the match was cut from the SCATT file ("poslednjih 60"), when SCATT is there. */
  selection: string | null;
  /** SIUS shots minus the SCATT shots chosen for them; null without SCATT. */
  mismatch: number | null;
  /** Pulse moved this many seconds, and the clock zone it was read in; null without pulse. */
  hr: { offsetS: number; zone: string | null } | null;
}

/**
 * The "Čeka potvrdu" flag is also the way to confirm: pointing at it says "Potvrdi", pressing it opens what was
 * paired (shots, SCATT cut, pulse shift) with the confirm button, so the owner checks before confirming and a tap
 * on a phone never confirms by accident. A mismatch offers the fix instead of the confirm.
 */
export function AlignFlag({ matchId, trainingId, facts, canEdit }: { matchId: string; trainingId: string; facts: AlignFacts; canEdit: boolean }) {
  const pennant = (
    <svg className="flag-badge__marker" data-marker="pennant" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 21V3m0 1h12l-3.5 4L18 12H6" />
    </svg>
  );
  const ok = facts.mismatch === null || facts.mismatch === 0;
  return (
    <DialogTrigger>
      <Button className="flag-badge flag-badge--action" data-state="proposed" aria-label={canEdit ? `${sr.flag.proposed}: ${t.review}` : sr.flag.proposed}>
        {pennant}
        <span className="flag-badge__rest">{sr.flag.proposed}</span>
        {canEdit && <span className="flag-badge__hover" aria-hidden="true">{t.confirm}</span>}
      </Button>
      <Popover className="ui-popover align-pop" placement="bottom start" offset={6}>
        <Dialog className="align-pop__body" aria-label={t.title}>
          <h3 className="align-pop__title">{t.title}</h3>
          <dl className="align-pop__facts">
            <div><dt>{t.sius}</dt><dd className="num">{facts.siusShots}</dd></div>
            {facts.selection !== null && (
              <div><dt>{t.scatt}</dt><dd><span className="num">{facts.pairedShots}</span> · {facts.selection}</dd></div>
            )}
            {facts.hr && (
              <div>
                <dt>{t.hr}</dt>
                <dd><span className="num">{facts.hr.offsetS > 0 ? '+' : ''}{facts.hr.offsetS} s</span>{facts.hr.zone ? ` · ${facts.hr.zone}` : ''}</dd>
              </div>
            )}
          </dl>
          {!ok && <p role="alert">{t.mismatch(Math.abs(facts.mismatch!), facts.mismatch! > 0)}</p>}
          {canEdit &&
            (ok ? (
              <form action={confirmAlignmentForm} className="align-pop__actions">
                <input type="hidden" name="match_id" value={matchId} />
                <input type="hidden" name="training_id" value={trainingId} />
                <button type="submit">{t.confirmLong}</button>
              </form>
            ) : (
              <div className="align-pop__actions">
                <Link className="button" href={`/trening/${trainingId}/podaci`}>{t.fix}</Link>
              </div>
            ))}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
