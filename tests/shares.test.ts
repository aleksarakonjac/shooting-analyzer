import { describe, expect, it } from 'vitest';
import { buildShareRow } from '../src/lib/shares';

describe('buildShareRow', () => {
  it('builds an all-trainings share', () => {
    expect(buildShareRow('s1', 'all', {})).toEqual({
      ok: true,
      row: { shooter_id: 's1', scope: 'all', training_id: null, from_date: null, to_date: null },
    });
  });

  it('builds a period share', () => {
    expect(buildShareRow('s1', 'period', { from: '2026-10-01', to: '2026-10-31' })).toEqual({
      ok: true,
      row: { shooter_id: 's1', scope: 'period', training_id: null, from_date: '2026-10-01', to_date: '2026-10-31' },
    });
  });

  it('builds a single-training share', () => {
    expect(buildShareRow('s1', 'training', { trainingId: 't1' })).toEqual({
      ok: true,
      row: { shooter_id: 's1', scope: 'training', training_id: 't1', from_date: null, to_date: null },
    });
  });

  it('ignores stray arguments that do not belong to the scope', () => {
    const r = buildShareRow('s1', 'all', { trainingId: 't1', from: '2026-10-01' });
    expect(r).toMatchObject({ ok: true, row: { training_id: null, from_date: null } });
  });

  it.each([
    ['training without id', 'training', {}],
    ['period without dates', 'period', {}],
    ['period with one date', 'period', { from: '2026-10-01' }],
    ['reversed period', 'period', { from: '2026-11-01', to: '2026-10-01' }],
    ['malformed date', 'period', { from: '01.10.2026', to: '2026-10-31' }],
    ['impossible date', 'period', { from: '2026-02-30', to: '2026-03-31' }],
  ] as const)('rejects %s', (_label, scope, args) => {
    expect(buildShareRow('s1', scope, args)).toEqual({ ok: false });
  });
});
