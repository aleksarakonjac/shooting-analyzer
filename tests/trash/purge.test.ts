import { describe, expect, it, vi } from 'vitest';
import { purgeTraining, type PurgeDeps } from '@/lib/trash/purge';

const deps = (trashed: boolean): PurgeDeps & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    isTrashed: vi.fn(async () => { calls.push('check'); return trashed; }),
    listFiles: vi.fn(async (id: string) => { calls.push('list'); return [`${id}/a.csv`, `${id}/b.tcx`]; }),
    removeFiles: vi.fn(async () => { calls.push('remove'); }),
    deleteForever: vi.fn(async () => { calls.push('delete'); }),
  };
};

describe('purgeTraining', () => {
  it('never touches the files of a training that is not in the trash', async () => {
    const d = deps(false);
    await expect(purgeTraining(d, 't1')).rejects.toThrow('not in the trash');
    expect(d.removeFiles).not.toHaveBeenCalled();
    expect(d.deleteForever).not.toHaveBeenCalled();
  });

  it('checks the trash, then removes the stored files, then deletes the training', async () => {
    const d = deps(true);
    await purgeTraining(d, 't1');
    expect(d.calls).toEqual(['check', 'list', 'remove', 'delete']);
    expect(d.removeFiles).toHaveBeenCalledWith(['t1/a.csv', 't1/b.tcx']);
  });
});
