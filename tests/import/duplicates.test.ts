import { describe, expect, it } from 'vitest';
import { matchImported } from '@/lib/import/duplicates';

describe('matchImported', () => {
  const picked = [
    { fileName: 'a.csv', sha: 'aaa' },
    { fileName: 'b.scatt-expert', sha: 'bbb' },
    { fileName: 'c.tcx', sha: 'ccc' },
  ];

  it('names each picked file that is already stored with a live training', () => {
    const stored = [
      { sha256: 'aaa', trainings: { id: 't1', name: '21.10. Vazdušna puška', trained_on: '2026-10-21', deleted_at: null } },
      { sha256: 'ccc', trainings: { id: 't2', name: 'Jutro', trained_on: '2026-10-22', deleted_at: null } },
    ];
    expect(matchImported(picked, stored)).toEqual([
      { fileName: 'a.csv', trainingId: 't1', trainingName: '21.10. Vazdušna puška', trainedOn: '2026-10-21' },
      { fileName: 'c.tcx', trainingId: 't2', trainingName: 'Jutro', trainedOn: '2026-10-22' },
    ]);
  });

  it('ignores trainings in the trash and reports a file once', () => {
    const stored = [
      { sha256: 'aaa', trainings: { id: 't1', name: 'x', trained_on: '2026-10-21', deleted_at: '2026-11-01T00:00:00Z' } },
      { sha256: 'bbb', trainings: { id: 't3', name: 'y', trained_on: '2026-10-20', deleted_at: null } },
      { sha256: 'bbb', trainings: { id: 't4', name: 'z', trained_on: '2026-10-19', deleted_at: null } },
    ];
    expect(matchImported(picked, stored)).toEqual([
      { fileName: 'b.scatt-expert', trainingId: 't3', trainingName: 'y', trainedOn: '2026-10-20' },
    ]);
  });
});
