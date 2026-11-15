// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HealthPull, pullBody } from '../../src/components/HealthPull';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ok = {
  status: 200,
  tcx: '<TrainingCenterDatabase/>',
  fileName: 'google-health-2026-11-13-1600.tcx',
  workout: { id: 'w', startMs: Date.UTC(2026, 10, 13, 15, 13), endMs: Date.UTC(2026, 10, 13, 16, 31) },
  range: { fromMs: Date.UTC(2026, 10, 13, 15, 0), toMs: Date.UTC(2026, 10, 13, 16, 40) },
  source: 'shots',
};

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const base = { tz: 'Europe/Belgrade', isCoach: false, body: () => ({ shooterId: 's', date: '2026-11-13' }), onPulled: () => {} };

describe('pullBody', () => {
  it('sends the shot span otherwise', () => {
    expect(pullBody({ shooterId: 's', date: '2026-11-13', shotTimes: [5, null, 1, undefined, 9], startedAt: 'a', endedAt: null })).toEqual({
      shooterId: 's',
      date: '2026-11-13',
      shotSpan: { fromMs: 1, toMs: 9 },
      startedAt: 'a',
      endedAt: null,
    });
  });
  it('sends no span without timed shots', () => {
    expect(pullBody({ shooterId: 's', date: '2026-11-13', shotTimes: [null], startedAt: null, endedAt: null })).toMatchObject({ shotSpan: null });
  });
});

describe('HealthPull', () => {
  it('shows the pull button only when connected', () => {
    const { rerender } = render(<HealthPull {...base} status="none" />);
    expect(screen.queryByRole('button', { name: 'Povuci puls sa Google Health' })).toBeNull();
    rerender(<HealthPull {...base} status="ok" />);
    expect(screen.getByRole('button', { name: 'Povuci puls sa Google Health' })).toBeTruthy();
  });

  it('hands the pulled TCX on as a file and shows the range and workout', async () => {
    const fetchFn = stubFetch(200, ok);
    const onPulled = vi.fn();
    render(<HealthPull {...base} status="ok" onPulled={onPulled} />);
    fireEvent.click(screen.getByRole('button', { name: 'Povuci puls sa Google Health' }));
    await waitFor(() => expect(onPulled).toHaveBeenCalledTimes(1));
    const [file, info] = onPulled.mock.calls[0];
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('google-health-2026-11-13-1600.tcx');
    expect(await file.text()).toBe('<TrainingCenterDatabase/>');
    expect(info.workout).toEqual(ok.workout);
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ shooterId: 's', date: '2026-11-13' });
    expect(fetchFn.mock.calls[0][0]).toBe('/api/google-health/pulse');
    expect(screen.getByText('Puls povučen sa Google Health: 16:00–17:40')).toBeTruthy();
    expect(screen.getByText('Pronađena vežba Shooting 16:13–17:31')).toBeTruthy();
  });

  it('pulls again and hands on the new file', async () => {
    stubFetch(200, ok);
    const onPulled = vi.fn();
    render(<HealthPull {...base} status="ok" onPulled={onPulled} />);
    const button = screen.getByRole('button', { name: 'Povuci puls sa Google Health' });
    fireEvent.click(button);
    await waitFor(() => expect(onPulled).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Povuci puls sa Google Health' }));
    await waitFor(() => expect(onPulled).toHaveBeenCalledTimes(2));
  });

  it('shows error on 403', async () => {
    stubFetch(403, { status: 403, error: 'forbidden' });
    render(<HealthPull {...base} status="ok" />);
    fireEvent.click(screen.getByRole('button', { name: 'Povuci puls sa Google Health' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Nemaš pristup pulsu ovog strelca.');
  });

  it('explains no_data', async () => {
    stubFetch(404, { status: 404, error: 'no_data' });
    render(<HealthPull {...base} status="ok" />);
    fireEvent.click(screen.getByRole('button', { name: 'Povuci puls sa Google Health' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Google Health nema puls za ovo vreme — da li je sat sinhronizovan?');
  });

  it('gives the coach a different no_window hint', async () => {
    stubFetch(422, { status: 422, error: 'no_window' });
    render(<HealthPull {...base} status="ok" isCoach />);
    fireEvent.click(screen.getByRole('button', { name: 'Povuci puls sa Google Health' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Učitaj SCATT ili sačekaj vežbu Shooting sa sata.');
  });

  it('is disabled when there is nothing to ask for', () => {
    render(<HealthPull {...base} status="ok" body={() => null} />);
    expect((screen.getByRole('button', { name: 'Povuci puls sa Google Health' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('HealthPull received range', () => {
  it('shows the pulse received and warns when it stops early', async () => {
    stubFetch(200, { ...ok, received: { fromMs: Date.UTC(2026, 10, 13, 15, 0), toMs: Date.UTC(2026, 10, 13, 15, 30), count: 900 } });
    render(<HealthPull {...base} status="ok" />);
    fireEvent.click(screen.getByRole('button', { name: 'Povuci puls sa Google Health' }));
    expect(await screen.findByText('Puls povučen sa Google Health: 16:00–16:30')).toBeTruthy();
    expect(screen.getByText('Puls se završava pre kraja treninga — sat možda još nije sinhronizovan. Sinhronizuj ga i povuci ponovo.')).toBeTruthy();
  });

  it('sends unsaved shots with the training id in edit mode', () => {
    expect(pullBody({ trainingId: 't1', shooterId: 's', date: '2026-11-13', shotTimes: [5, 1], startedAt: 'a', endedAt: null })).toEqual({
      trainingId: 't1',
      shotSpan: { fromMs: 1, toMs: 5 },
      startedAt: 'a',
      endedAt: null,
    });
  });
});

describe('HealthPull fixes', () => {
  it('tells the shooter to reconnect on the account page, with a link', () => {
    render(<HealthPull {...base} status="broken" />);
    expect(screen.getByText(/Veza sa Google Health je istekla\. Poveži je ponovo na stranici/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Nalog' }).getAttribute('href')).toBe('/nalog');
  });

  it('keeps the coach wording without a link', () => {
    render(<HealthPull {...base} status="broken" isCoach />);
    expect(screen.getByText('Veza sa Google Health je istekla — strelac treba ponovo da je poveže.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Nalog' })).toBeNull();
  });

  it('gives the shooter the account link on a reconnect answer', async () => {
    stubFetch(409, { status: 409, error: 'reconnect' });
    render(<HealthPull {...base} status="ok" />);
    fireEvent.click(screen.getByRole('button', { name: 'Povuci puls sa Google Health' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Poveži je ponovo na stranici');
    expect(screen.getByRole('link', { name: 'Nalog' })).toBeTruthy();
  });

  it('explains an account not linked to the Google Health app', async () => {
    stubFetch(409, { status: 409, error: 'not_linked' });
    render(<HealthPull {...base} status="ok" />);
    fireEvent.click(screen.getByRole('button', { name: 'Povuci puls sa Google Health' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Google nalog nije povezan sa Google Health aplikacijom. Prijavi se u aplikaciju na telefonu, pa pokušaj ponovo.');
  });

  it('is disabled while the saved files are still loading', () => {
    render(<HealthPull {...base} status="ok" disabled />);
    expect((screen.getByRole('button', { name: 'Povuci puls sa Google Health' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('drops the success message once another pulse file replaces the pulled one', async () => {
    stubFetch(200, ok);
    const { rerender } = render(<HealthPull {...base} status="ok" loadedName={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Povuci puls sa Google Health' }));
    rerender(<HealthPull {...base} status="ok" loadedName={ok.fileName} />);
    expect(await screen.findByText(/Puls povučen sa Google Health/)).toBeTruthy();
    rerender(<HealthPull {...base} status="ok" loadedName="moj-sat.tcx" />);
    expect(screen.queryByText(/Puls povučen sa Google Health/)).toBeNull();
  });
});
