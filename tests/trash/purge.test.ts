import { describe, expect, it, vi } from 'vitest';
import { purgeExpired, purgeTraining, type ExpiredDeps, type PurgeDeps } from '@/lib/trash/purge';

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

describe('purgeExpired (the daily trash job)', () => {
  const cutoff = '2026-10-11T00:00:00.000Z';
  const make = (failOn: string | null = null) => {
    const removed: string[] = [];
    const deps: ExpiredDeps = {
      dueIds: vi.fn(async () => ['a', 'b', 'c']),
      listFiles: vi.fn(async (id: string) => (id === 'c' ? [] : [`${id}/x.csv`])),
      removeFiles: vi.fn(async (paths: string[]) => {
        if (paths.some((p) => p.startsWith(`${failOn}/`))) throw new Error('storage down');
        removed.push(...paths);
      }),
      purge: vi.fn(async (ids: string[]) => ids),
    };
    return { deps, removed };
  };

  it('removes every due training\'s files, then purges them with the same cutoff', async () => {
    const { deps, removed } = make();
    const r = await purgeExpired(deps, cutoff);
    expect(deps.dueIds).toHaveBeenCalledWith(cutoff);
    expect(removed).toEqual(['a/x.csv', 'b/x.csv']);
    expect(deps.purge).toHaveBeenCalledWith(['a', 'b', 'c'], cutoff);
    expect(r).toEqual({ purged: ['a', 'b', 'c'], failed: [] });
  });

  it('keeps a training whose files could not be removed, so no file is left without its row', async () => {
    const { deps } = make('b');
    const r = await purgeExpired(deps, cutoff);
    expect(deps.purge).toHaveBeenCalledWith(['a', 'c'], cutoff);
    expect(r.failed).toEqual(['b']);
  });

  it('does not call the purge when nothing is due', async () => {
    const { deps } = make();
    deps.dueIds = vi.fn(async () => []);
    expect(await purgeExpired(deps, cutoff)).toEqual({ purged: [], failed: [] });
    expect(deps.purge).not.toHaveBeenCalled();
  });
});
