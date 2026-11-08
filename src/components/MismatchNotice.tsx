import { sr } from '@/lib/i18n/sr';

/** Positive = SIUS has shots with no SCATT partner; negative = SCATT shots left over. Never colour alone: words + marker. */
export function MismatchNotice({ mismatch }: { mismatch: number }) {
  const t = sr.newTraining;
  if (mismatch === 0) {
    return (
      <p className="mismatch" data-state="ok" role="status">
        <span aria-hidden="true">✓ </span>
        {t.mismatchOk}
      </p>
    );
  }
  return (
    <p className="mismatch" data-state="off" role="alert">
      <span aria-hidden="true">! </span>
      {mismatch > 0 ? t.mismatchMoreSius(mismatch) : t.mismatchMoreScatt(-mismatch)} {t.mismatchHint}
    </p>
  );
}
