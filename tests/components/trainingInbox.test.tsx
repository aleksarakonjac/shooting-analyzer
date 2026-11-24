// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const download = vi.fn();
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ storage: { from: () => ({ download }) } }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const discardInboxFiles = vi.fn(async (_ids: string[]) => {});
vi.mock('@/lib/inbox/actions', () => ({ discardInboxFiles: (ids: string[]) => discardInboxFiles(ids) }));
const saveTraining = vi.fn();
vi.mock('@/lib/import/saveTraining', async (orig) => ({ ...(await orig<object>()), saveTraining: (...a: unknown[]) => saveTraining(...a) }));
vi.mock('@/lib/import/duplicates', async (orig) => ({ ...(await orig<object>()), findImported: async () => [] }));
const uploadSource = vi.fn();
vi.mock('@/lib/import/uploadSource', async (orig) => ({ ...(await orig<object>()), uploadSource: (...a: unknown[]) => uploadSource(...a) }));
const parseSiusFile = vi.fn();
const parseScattFile = vi.fn();
vi.mock('@/lib/import/readFiles', async (orig) => ({
  ...(await orig<typeof import('@/lib/import/readFiles')>()),
  parseSiusFile: (...a: unknown[]) => parseSiusFile(...a),
  parseScattFile: (...a: unknown[]) => parseScattFile(...a),
}));

const { NewTrainingForm } = await import('../../src/components/NewTrainingForm');

const sius = { discipline: 'Air Rifle 60', disciplineId: 'air_rifle', total: 20.9, series: [{ index: 1, total: 20.9, shots: [{ value: 10.5 }, { value: 10.4 }] }] };
const scatt = { sessionStartMs: 1, distanceM: 10, caliberMm: 4.5, shots: [{ id: 1, tMs: 1, flaggedMatch: true }, { id: 2, tMs: 2, flaggedMatch: true }] };
const item = (id: string, kind: 'sius_prnx' | 'scatt', name: string) => ({ id, kind, path: `p/${id}`, name, createdAt: '2026-11-24T10:00:00Z' });
const items = [item('a', 'sius_prnx', 'report.prnx'), item('b', 'scatt', 'trace.scatt-expert')];
const form = (autoInbox: string[]) => (
  <NewTrainingForm userId="u" tz="Europe/Belgrade" today="2026-11-24" places={[]} events={[]} inbox={items as never} autoInbox={autoInbox} health={{ status: 'none' } as never} />
);

beforeEach(() => {
  Element.prototype.scrollIntoView ??= () => {};
  download.mockResolvedValue({ data: new Blob(['x']), error: null });
  parseSiusFile.mockResolvedValue({ parsed: sius, sha: 's1' });
  parseScattFile.mockResolvedValue({ data: scatt, sha: 's2' });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('inbox files in the training form', () => {
  it('offers a waiting .prnx in the SIUS tray', () => {
    render(form([]));
    expect(screen.getByText('report.prnx')).toBeTruthy();
  });

  it('loads a SIUS and a SCATT file together', async () => {
    render(form(['a', 'b']));
    await waitFor(() => expect(parseSiusFile).toHaveBeenCalled());
    await waitFor(() => expect(parseScattFile).toHaveBeenCalled());
    expect((parseSiusFile.mock.calls[0][0] as File).name).toBe('report.prnx');
  });

  it('saves for the shooter whose inbox it is, then empties it', async () => {
    saveTraining.mockResolvedValue({ trainingId: 't1' });
    uploadSource.mockResolvedValue({ id: 'x', duplicate: false });
    render(form(['a', 'b']));
    await waitFor(() => expect(parseScattFile).toHaveBeenCalled());
    const save = screen.getByRole('button', { name: /^Sačuvaj/ }) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    fireEvent.submit(document.getElementById('new-training')!);
    await waitFor(() => expect(saveTraining).toHaveBeenCalled());
    expect(saveTraining.mock.calls[0][0]).toMatchObject({ shooterId: 'u', disciplineId: 'air_rifle' });
    await waitFor(() => expect(discardInboxFiles).toHaveBeenCalled());
    expect([...discardInboxFiles.mock.calls[0][0]].sort()).toEqual(['a', 'b']);
    expect(uploadSource.mock.calls.map((c) => c[2])).toEqual(['sius_prnx', 'scatt']);
  });

  it('says when a file is already gone', async () => {
    download.mockResolvedValue({ data: null, error: { message: 'not found' } });
    render(form(['a']));
    expect(await screen.findByText('Fajl iz sandučeta nije učitan.')).toBeTruthy();
  });
});
