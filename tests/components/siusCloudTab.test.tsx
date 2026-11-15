// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapSiusShots } from '../../src/lib/sius/map';

const a = {
  siusExercises: vi.fn(),
  siusExerciseResult: vi.fn(),
  siusCompetitions: vi.fn(),
  siusEvents: vi.fn(),
  siusParts: vi.fn(),
  siusMyPerformance: vi.fn(),
  siusAthletePerformance: vi.fn(),
  siusConfirmAthlete: vi.fn(),
};
vi.mock('@/lib/sius/actions', () =>
  Object.fromEntries(Object.keys(a).map((k) => [k, (...args: unknown[]) => (a as Record<string, (...x: unknown[]) => unknown>)[k](...args)])),
);

const { SiusCloudTab } = await import('../../src/components/entry/SiusCloudTab');

const fxText = (n: string) => readFileSync(join(__dirname, '../fixtures/sius', n), 'utf8');
const air = JSON.parse(fxText('air-60-sighters.json'));
const prone = JSON.parse(fxText('prone-60.json'));
const qual = JSON.parse(fxText('public-qual.json'));
const SID = '00000000-0000-0000-0000-000000000001';

const exercise = (id: string, name: string, date: string, shots: number, imported: string | null = null) => ({
  exerciseId: id, exerciseName: name, exerciseDate: `${date}T00:00:00`, startTime: `${date}T09:30:00`, numberOfCompetitionShots: shots, totalString: '600.0', importedTrainingId: imported,
});
const result = (raw: unknown, name: string, extra: object = {}) => ({
  parsed: mapSiusShots(raw as never, { name }), raw: JSON.stringify(raw), externalId: 'ex-1', duplicateOf: null, ...extra,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderTab(props: Partial<Parameters<typeof SiusCloudTab>[0]> = {}) {
  const onApply = vi.fn();
  render(<SiusCloudTab shooterId={SID} sessionKind="trening" date="2026-11-01" onApply={onApply} {...props} />);
  return onApply;
}

describe('SiusCloudTab: Trening', () => {
  it('sub-tab default follows the session type', async () => {
    a.siusExercises.mockResolvedValue({ items: [], more: false });
    a.siusCompetitions.mockResolvedValue({ items: [], more: false });
    renderTab({ sessionKind: 'takmicenje' });
    expect(screen.getByRole('tab', { name: 'Takmičenje' }).getAttribute('aria-selected')).toBe('true');
    cleanup();
    renderTab({ sessionKind: 'kontrolni' });
    expect(screen.getByRole('tab', { name: 'Trening' }).getAttribute('aria-selected')).toBe('true');
  });

  it('lists exercises on the session date first; row shows shot count; imported badge links to the training', async () => {
    a.siusExercises.mockResolvedValue({
      items: [exercise('ex-9', '10m Air Rifle', '2026-11-05', 60), exercise('ex-1', '10m Air Rifle', '2026-11-01', 3), exercise('ex-2', '50m Rifle 3x20', '2026-10-20', 60, 'tr-2')],
      more: false,
    });
    renderTab();
    const rows = await screen.findAllByRole('listitem');
    expect(rows[0].textContent).toContain('3 hica');
    expect(rows[0].getAttribute('data-today')).toBe('true');
    expect(within(rows[2]).getByRole('link', { name: 'uvezeno' }).getAttribute('href')).toBe('/trening/tr-2');
  });

  it('picks an exercise, previews it and applies it with a JSON source file', async () => {
    a.siusExercises.mockResolvedValue({ items: [exercise('ex-1', '10m Air Rifle', '2026-11-01', 60)], more: false });
    a.siusExerciseResult.mockResolvedValue(result(air, '10m Air Rifle'));
    const onApply = renderTab();
    fireEvent.click(await screen.findByRole('button', { name: /10m Air Rifle/ }));
    expect(await screen.findByText(/60 hitaca u 6 serija/)).toBeTruthy();
    expect(screen.getByText(/4 probna/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Uvezi' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const r = onApply.mock.calls[0][0];
    expect(r.parsed.series).toHaveLength(6);
    expect(r.file.name).toBe('sius-ex-1.json');
    expect(r.file.type).toBe('application/json');
    expect(r.meta).toMatchObject({ externalId: 'ex-1', shotCount: 60, firstShotAt: '2026-08-19T08:36:52.590Z' });
    expect(r.session).toBeUndefined();
  });

  it('an already imported exercise and a duplicate ask before applying', async () => {
    a.siusExercises.mockResolvedValue({ items: [exercise('ex-1', '10m Air Rifle', '2026-11-01', 60, 'tr-1')], more: false });
    a.siusExerciseResult.mockResolvedValue(result(air, '10m Air Rifle', { duplicateOf: 'tr-7' }));
    const onApply = renderTab();
    fireEvent.click(await screen.findByRole('button', { name: /10m Air Rifle/ }));
    expect(await screen.findByText(/već uvezena/)).toBeTruthy();
    expect(screen.getByText(/Isti pogoci/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Uvezi ipak' }));
    expect(onApply).toHaveBeenCalled();
  });

  it('prone program: range fields, an invalid entry disables apply, the result has positions', async () => {
    a.siusExercises.mockResolvedValue({ items: [exercise('ex-1', '50m Rifle Prone', '2026-11-01', 60)], more: false });
    a.siusExerciseResult.mockResolvedValue(result(prone, '50m Rifle Prone'));
    const onApply = renderTab();
    fireEvent.click(await screen.findByRole('button', { name: /50m Rifle Prone/ }));
    const kneeling = (await screen.findByLabelText('Klečeći')) as HTMLInputElement;
    expect(kneeling.value).toBe('1-20');
    fireEvent.change(kneeling, { target: { value: '1-25' } });
    expect(screen.getByRole('alert').textContent).toContain('21, 22, 23, 24, 25');
    expect((screen.getByRole('button', { name: 'Uvezi' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(kneeling, { target: { value: '1-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Uvezi' }));
    expect(onApply.mock.calls[0][0].parsed.series.map((s: { position?: string }) => s.position)).toEqual(['kneeling', 'kneeling', 'prone', 'prone', 'standing', 'standing']);
  });

  it('not connected: link to the account page, competitions still work', async () => {
    a.siusExercises.mockResolvedValue({ state: 'none' });
    renderTab();
    expect((await screen.findByRole('link', { name: 'Nalog' })).getAttribute('href')).toBe('/nalog');
  });

  it('broken: asks to reconnect; unavailable: retry', async () => {
    a.siusExercises.mockResolvedValueOnce({ state: 'broken', reason: 'bad_password' });
    renderTab();
    expect(await screen.findByText(/Ponovo poveži SIUS/)).toBeTruthy();
    cleanup();
    a.siusExercises.mockResolvedValueOnce({ state: 'unavailable' }).mockResolvedValueOnce({ items: [exercise('ex-1', '10m Air Rifle', '2026-11-01', 60)], more: false });
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Pokušaj ponovo' }));
    expect(await screen.findByRole('button', { name: /10m Air Rifle/ })).toBeTruthy();
  });
});

describe('SiusCloudTab: Takmičenje', () => {
  const comp = { id: 'c1', name: 'ISSF World Championship', city: 'Doha', country: 'Qatar', startDate: '2026-10-31T21:00:00Z', endDate: '2026-11-13T21:00:00Z', timeZone: 'Asia/Qatar' };
  const row = (name: string, id: string) => ({ athleteRunningId: `run-${id}`, identifier: id, displayName: name, nation: 'SRB', rank: '7', total: '628.1', seriesTotals: ['104.0', '105.1'] });

  async function pickAll() {
    fireEvent.click(await screen.findByRole('button', { name: /ISSF World Championship/ }));
    fireEvent.click(await screen.findByRole('button', { name: '10m AIR RIFLE MEN' }));
    fireEvent.click(await screen.findByRole('button', { name: /Qualification/ }));
  }

  it('picks competition, event and part by hand; nothing preselected; found row applies with the session', async () => {
    a.siusCompetitions.mockResolvedValue({ items: [comp], more: true });
    a.siusEvents.mockResolvedValue([{ id: 'e1', name: '10m AIR RIFLE MEN' }, { id: 'e2', name: '10m AIR RIFLE WOMEN' }]);
    a.siusParts.mockResolvedValue([{ id: 'p1', name: 'Qualification', startDate: '2026-11-03T09:15:00+03:00' }, { id: 'p2', name: 'Final', startDate: '2026-11-03T14:30:00+03:00' }]);
    a.siusMyPerformance.mockResolvedValue({ found: { ...result(qual, '10m AIR RIFLE MEN'), externalId: 'comp:p1:run-1', row: row('RAKONJAC Aleksa', 'S1') } });
    const onApply = renderTab({ sessionKind: 'takmicenje' });
    expect(await screen.findByRole('button', { name: 'Još' })).toBeTruthy();
    expect(a.siusEvents).not.toHaveBeenCalled();
    await pickAll();
    expect(a.siusMyPerformance).toHaveBeenCalledWith(SID, { compId: 'c1', eventId: 'e1', partId: 'p1', eventName: '10m AIR RIFLE MEN', partName: 'Qualification' });
    expect(await screen.findByText(/RAKONJAC Aleksa/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Uvezi' }));
    expect(onApply.mock.calls[0][0].session).toEqual({
      name: 'ISSF World Championship Vazdušna puška Kvalifikacije', eventName: 'ISSF World Championship', place: 'Doha, Qatar', date: '2026-11-03', stage: 'kvalifikacije',
    });
  });

  it('searches competitions by name', async () => {
    a.siusCompetitions.mockResolvedValue({ items: [comp], more: false });
    renderTab({ sessionKind: 'takmicenje' });
    await screen.findByRole('button', { name: /ISSF World Championship/ });
    fireEvent.change(screen.getByLabelText('Traži takmičenje'), { target: { value: 'doha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Traži' }));
    await waitFor(() => expect(a.siusCompetitions).toHaveBeenLastCalledWith(1, 'doha'));
  });

  it('not found shows message and list; a pick is previewed and saved only after confirming', async () => {
    a.siusCompetitions.mockResolvedValue({ items: [comp], more: false });
    a.siusEvents.mockResolvedValue([{ id: 'e1', name: '10m AIR RIFLE MEN' }]);
    a.siusParts.mockResolvedValue([{ id: 'p1', name: 'Qualification', startDate: '2026-11-03T09:15:00+03:00' }]);
    a.siusMyPerformance.mockResolvedValue({ notFound: true, pick: [row('SHENG Lihao', 'C1'), row('RAKONJAC Aleksa', 'S1')] });
    a.siusAthletePerformance.mockResolvedValue({ ...result(qual, '10m AIR RIFLE MEN'), externalId: 'comp:p1:run-S1' });
    a.siusConfirmAthlete.mockResolvedValue({ ok: true });
    const onApply = renderTab({ sessionKind: 'takmicenje' });
    await pickAll();
    expect(await screen.findByText('Nisi pronađen u rezultatima ovog nastupa. Izaberi sebe sa liste.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Traži strelca'), { target: { value: 'rakon' } });
    expect(screen.queryByRole('button', { name: /SHENG Lihao/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /RAKONJAC Aleksa/ }));
    expect(await screen.findByText(/628.1/)).toBeTruthy();
    expect(screen.getByText(/104.0 · 105.1/)).toBeTruthy();
    expect(a.siusConfirmAthlete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Nazad' }));
    fireEvent.change(screen.getByLabelText('Traži strelca'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: /SHENG Lihao/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /RAKONJAC Aleksa/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Da, to sam ja' }));
    await waitFor(() => expect(a.siusConfirmAthlete).toHaveBeenCalledWith(SID, 'S1'));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
  });
});

describe('SiusCloudTab: a failing action', () => {
  it('shows unavailable with retry instead of loading forever', async () => {
    a.siusExercises.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ items: [exercise('ex-1', '10m Air Rifle', '2026-11-01', 60)], more: false });
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Pokušaj ponovo' }));
    expect(await screen.findByRole('button', { name: /10m Air Rifle/ })).toBeTruthy();
  });

  it('a failing step in the competition flow can be retried', async () => {
    const comp = { id: 'c1', name: 'GP', city: 'X', country: 'Y', startDate: '2026-10-31T21:00:00Z', endDate: '2026-11-01T21:00:00Z', timeZone: 'UTC' };
    a.siusCompetitions.mockResolvedValue({ items: [comp], more: false });
    a.siusEvents.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([{ id: 'e1', name: '10m AIR RIFLE MEN' }]);
    renderTab({ sessionKind: 'takmicenje' });
    fireEvent.click(await screen.findByRole('button', { name: /GP/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pokušaj ponovo' }));
    expect(await screen.findByRole('button', { name: '10m AIR RIFLE MEN' })).toBeTruthy();
  });
});

