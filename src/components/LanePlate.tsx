/**
 * A key figure as a broadcast score box. The `score` variant is the white score bug (the training total);
 * the default is a navy box for the supporting figures.
 */
export function LanePlate({
  label,
  value,
  unit,
  variant,
}: {
  label: string;
  value: string;
  unit?: string;
  variant?: 'score';
}) {
  return (
    <div className={variant === 'score' ? 'lane-plate lane-plate--score' : 'lane-plate'}>
      <span className="lane-plate__label">{label}</span>
      <span className="lane-plate__value num">{value}</span>
      {unit && <span className="lane-plate__unit">{unit}</span>}
    </div>
  );
}
