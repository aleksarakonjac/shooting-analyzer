/** Black enamel lane plate with a large stencil-like numeral: the product's key-figure form. */
export function LanePlate({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="lane-plate">
      <span className="lane-plate__label">{label}</span>
      <span className="lane-plate__value num">{value}</span>
      {unit && <span className="lane-plate__unit">{unit}</span>}
    </div>
  );
}
