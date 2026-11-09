import { deleteFinalForm } from '@/lib/finals/actions';
import { FINAL_FORMATS, stageTotals, type FinalDiscipline } from '@/lib/finals/format';
import { sr } from '@/lib/i18n/sr';

export interface FinalRow {
  id: string;
  placement: number | null;
  eliminated_after_shot: number | null;
  created_at: string;
  final_shots: { idx: number; stage_idx: number; value: number | string }[];
}

const t = sr.finals;

/** Stage totals of every recorded final of one training. */
export function FinalsList({
  trainingId,
  discipline,
  finals,
  canEdit,
}: {
  trainingId: string;
  discipline: FinalDiscipline;
  finals: FinalRow[];
  canEdit: boolean;
}) {
  if (finals.length === 0) return <p>{t.none}</p>;
  const stages = FINAL_FORMATS[discipline];
  return (
    <ul className="finals__list">
      {[...finals].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((f, n) => {
        const sorted = [...f.final_shots].sort((a, b) => a.idx - b.idx);
        const values = sorted.map((s) => Number(s.value));
        const totals = stageTotals(discipline, values);
        const total = Math.round(values.reduce((a, b) => a + b, 0) * 10) / 10;
        let seriesNo = 0;
        return (
          <li key={f.id} className="finals__item" data-testid="final">
            <h3>
              {t.title} {n + 1}
            </h3>
            <p className="report__meta">
              {f.placement !== null && `${t.placement}: ${f.placement} · `}
              {f.eliminated_after_shot !== null ? `${t.eliminated}: ${f.eliminated_after_shot}` : t.notEliminated}
            </p>
            <ul className="finals__stages">
              {stages.map((stage, si) => {
                if (stage.kind === 'series') seriesNo += 1;
                if (totals[si].shots === 0) return null;
                const label =
                  stage.kind === 'singles'
                    ? t.stageSingles(stage.shots)
                    : stage.position
                      ? t.stageSeriesPos(seriesNo, stage.shots, sr.newTraining.positionGroup[stage.position])
                      : t.stageSeries(seriesNo, stage.shots);
                return (
                  <li key={si} data-testid="final-stage">
                    <span>{label}</span>
                    <strong className="num">{totals[si].total.toFixed(1)}</strong>
                  </li>
                );
              })}
            </ul>
            <p>
              {t.total}: <strong className="num" data-testid="final-total">{total.toFixed(1)}</strong>
            </p>
            {canEdit && (
              <form action={deleteFinalForm}>
                <input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="training_id" value={trainingId} />
                <button type="submit" className="button--quiet">{t.remove}</button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
