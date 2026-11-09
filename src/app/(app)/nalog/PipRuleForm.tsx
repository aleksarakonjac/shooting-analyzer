'use client';
import { useState } from 'react';
import { Select } from '@/components/ui/Select';
import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId } from '@/lib/domain/types';
import { updatePipRule } from '@/lib/auth/actions';
import { sr } from '@/lib/i18n/sr';
import { defaultPipTop } from '@/lib/report/target';

const t = sr.account;
const ids = Object.keys(DISCIPLINES) as DisciplineId[];

const choices = (decimal: boolean) =>
  decimal
    ? Array.from({ length: 10 }, (_, i) => (10 + i / 10).toFixed(1)).map((v) => ({ id: v, label: t.pipFrom(v), hint: v === '10.5' ? t.pipDefault : undefined }))
    : [
        { id: '10', label: t.pipFrom('10'), hint: t.pipDefault },
        { id: '9', label: t.pipFrom('9') },
      ];

/** Per discipline: the score from which a shot pip is drawn filled; below it, down to the 10 (9), it is a ring. */
export function PipRuleForm({ current }: { current: Record<DisciplineId, number> }) {
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(ids.map((d) => [d, current[d].toFixed(DISCIPLINES[d].decimal ? 1 : 0)])),
  );
  return (
    <form action={updatePipRule} className="stack">
      <p className="panel__empty">{t.pipIntro}</p>
      {ids.map((d) => (
        <Select
          key={d}
          name={`pip_${d}`}
          label={DISCIPLINES[d].nameSr}
          items={choices(DISCIPLINES[d].decimal)}
          value={vals[d] ?? defaultPipTop(DISCIPLINES[d].decimal).toString()}
          onChange={(v) => setVals((x) => ({ ...x, [d]: v }))}
        />
      ))}
      <button type="submit">{t.pipSave}</button>
    </form>
  );
}
