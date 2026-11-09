'use client';
import { useMemo } from 'react';
import { sr } from '@/lib/i18n/sr';
import { updateHrAlignmentForm } from '@/lib/trainings';
import { zoneNames } from '@/lib/time/zone';
import { ComboField } from '@/components/ui/ComboField';
import { NumberStepper } from '@/components/ui/NumberStepper';

const t = sr.report;

/** Offset and clock zone of the heart-rate file; changes preview at once, saving stores them with the new average. */
export function HrAlign({
  trainingId,
  offsetS,
  zone,
  avgBpm,
  ready,
  fallbackTz,
  onOffset,
  onZone,
}: {
  trainingId: string;
  offsetS: number;
  zone: string;
  /** Average over the shot window for the values shown, null when no sample falls in it. */
  avgBpm: number | null;
  ready: boolean;
  fallbackTz: string;
  onOffset: (s: number) => void;
  onZone: (z: string) => void;
}) {
  const zones = useMemo(() => zoneNames(fallbackTz), [fallbackTz]);
  return (
    <details className="hr-align">
      <summary>{t.hrAlign}</summary>
      <form action={updateHrAlignmentForm} className="hr-align__form">
        <input type="hidden" name="training_id" value={trainingId} />
        <input type="hidden" name="offset_ms" value={offsetS * 1000} />
        <input type="hidden" name="avg_bpm" value={avgBpm ?? ''} />
        <NumberStepper label={t.hrOffsetS} value={offsetS} onChange={onOffset} min={-43_200} max={43_200} description={t.hrOffsetHint} />
        <ComboField name="zone" label={t.hrZone} value={zone} onChange={onZone} suggestions={zones} description={t.hrZoneHint} />
        <p className="panel__empty">{t.hrPreview}</p>
        <button type="submit" disabled={!ready}>{t.hrSave}</button>
      </form>
    </details>
  );
}
