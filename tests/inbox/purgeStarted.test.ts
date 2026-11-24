import { describe, expect, it, vi } from 'vitest';
import { purgeStarted, type StartedDeps } from '@/lib/inbox/purgeStarted';

const NOW = Date.parse('2026-11-25T03:00:00Z');
const hoursAgo = (h: number) => NOW - h * 3_600_000;

function deps(over: Partial<StartedDeps> = {}) {
  return {
    listIncoming: vi.fn(async () => [{ path: 'incoming/old', createdMs: hoursAgo(25) }, { path: 'incoming/new', createdMs: hoursAgo(23) }]),
    removeFiles: vi.fn(async () => {}),
    deleteRows: vi.fn(async () => {}),
    ...over,
  };
}

describe('purgeStarted', () => {
  it('removes objects and rows of uploads older than a day, by the age of the object, and keeps newer ones', async () => {
    const d = deps();
    expect(await purgeStarted(d, NOW)).toEqual({ removed: 1 });
    expect(d.removeFiles).toHaveBeenCalledWith(['incoming/old']);
    expect(d.deleteRows).toHaveBeenCalledWith('2026-11-24T03:00:00.000Z');
  });

  it('removes in batches storage takes', async () => {
    const d = deps({ listIncoming: async () => Array.from({ length: 2500 }, (_, i) => ({ path: `incoming/${i}`, createdMs: hoursAgo(30) })) });
    expect(await purgeStarted(d, NOW)).toEqual({ removed: 2500 });
    expect(d.removeFiles.mock.calls.map((c) => (c as unknown as [string[]])[0].length)).toEqual([1000, 1000, 500]);
  });

  it('keeps the rows when storage fails, for the next run', async () => {
    const d = deps({ removeFiles: vi.fn(async () => Promise.reject(new Error('storage'))) });
    await expect(purgeStarted(d, NOW)).rejects.toThrow('storage');
    expect(d.deleteRows).not.toHaveBeenCalled();
  });
});
