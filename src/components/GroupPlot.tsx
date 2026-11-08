import { offsetDirection } from '@/lib/report/derive';
import { sr } from '@/lib/i18n/sr';

const t = sr.report;
const fmt = (n: number) => n.toFixed(1);

/** Series group: centre cross, mean point of impact and the group-size circle. Direction is also stated in words. */
export function GroupPlot({
  mpi,
  groupMm,
}: {
  mpi: { x: number; y: number } | null;
  groupMm: number | null;
}) {
  if (!mpi) return <p className="group-plot__none">{t.noGroup}</p>;
  const dir = offsetDirection(mpi);
  const r = (groupMm ?? 0) / 2;
  const reach = Math.max(6, Math.abs(mpi.x) + r + 2, Math.abs(mpi.y) + r + 2);
  const words = [
    dir.x.side ? `${fmt(dir.x.mm)} mm ${t[dir.x.side]}` : null,
    dir.y.side ? `${fmt(dir.y.mm)} mm ${t[dir.y.side]}` : null,
  ].filter(Boolean);
  return (
    <figure className="group-plot">
      <svg viewBox={`${-reach} ${-reach} ${reach * 2} ${reach * 2}`} width="140" height="140" role="img" aria-label={`${t.group} ${groupMm === null ? '' : fmt(groupMm) + ' mm'}`}>
        <line x1={-reach} y1={0} x2={reach} y2={0} stroke="currentColor" strokeWidth={reach / 100} opacity="0.4" />
        <line x1={0} y1={-reach} x2={0} y2={reach} stroke="currentColor" strokeWidth={reach / 100} opacity="0.4" />
        {groupMm !== null && (
          <circle cx={mpi.x} cy={-mpi.y} r={r} fill="none" stroke="currentColor" strokeWidth={reach / 50} strokeDasharray={`${reach / 25} ${reach / 25}`} />
        )}
        <circle cx={mpi.x} cy={-mpi.y} r={reach / 28} fill="currentColor" />
      </svg>
      <figcaption>
        {groupMm !== null && <strong>{fmt(groupMm)} mm</strong>}
        <span> {t.mpi}: {words.length ? words.join(', ') : t.centred}</span>
      </figcaption>
    </figure>
  );
}
