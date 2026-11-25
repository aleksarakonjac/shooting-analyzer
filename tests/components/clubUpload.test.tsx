// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const put = vi.fn();
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: (...a: unknown[]) => put(...a) }) } }) }));
const describeFile = vi.fn();
vi.mock('@/lib/import/readFiles', () => ({ describeFile: (...a: unknown[]) => describeFile(...a) }));

const { ClubUpload } = await import('../../src/components/inbox/ClubUpload');

const TOKEN = `ub_${'a'.repeat(64)}`;
const OTHER = `ub_${'c'.repeat(64)}`;
const CLUB = { name: 'Čačak', shooters: [{ id: 's1', name: 'Ana' }, { id: 's2', name: 'Boris' }] };
const SIUS = { kind: 'sius_prnx', meta: { sius: { discipline: 'Air Rifle 60', total: 628.8, shots: 60, atMs: Date.UTC(2026, 10, 11, 18, 51) } } };
const SCATT = { kind: 'scatt', meta: { scatt: { shots: 75, startMs: Date.UTC(2026, 10, 11, 17, 5), endMs: Date.UTC(2026, 10, 11, 18) } } };

let confirmStatus: (uploadId: string) => number;
const calls: { token: string | null; body: Record<string, unknown> | null }[] = [];
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
  confirmStatus = () => 201;
  let n = 0;
  history.replaceState(null, '', `/ubaci#${TOKEN}`);
  put.mockResolvedValue({ error: null });
  describeFile.mockImplementation(async (f: File) => {
    if (f.name.startsWith('bad')) throw new Error('unknown');
    return f.name.endsWith('.prnx') ? SIUS : SCATT;
  });
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const auth = new Headers(init?.headers).get('authorization');
    calls.push({ token: auth, body });
    if (auth === `Bearer ${OTHER}`) return reply({ name: 'Drugi klub', shooters: [] });
    if (auth !== `Bearer ${TOKEN}`) return reply({ error: 'unauthorized' }, 401);
    if (!body) return reply(CLUB);
    if (body.step === 'start') {
      const id = `u${++n}:${body.fileName}`;
      return reply({ status: 201, uploadId: id, path: `p/${id}`, token: 't' }, 201);
    }
    const status = confirmStatus(body.uploadId);
    return reply({ status, kind: 'scatt' }, status);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const pick = (...names: string[]) =>
  fireEvent.change(screen.getByLabelText('SIUS i SCATT fajlovi'), { target: { files: names.map((n) => new File(['x'], n)) } });
const send = () => screen.getByRole('button', { name: 'Pošalji' }) as HTMLButtonElement;

describe('pairing the computer', () => {
  it('keeps the token from the link and takes it out of the address', async () => {
    render(<ClubUpload />);
    await screen.findByText('Čačak');
    expect(location.hash).toBe('');
    expect(localStorage.getItem('club-link')).toBe(TOKEN);
    cleanup();
    render(<ClubUpload />);
    await screen.findByText('Čačak');
  });

  it('says it is not connected without a token, with a malformed one, and when the link was replaced', async () => {
    history.replaceState(null, '', '/ubaci');
    render(<ClubUpload />);
    await screen.findByText('Ovaj računar nije povezan');
    expect(calls).toHaveLength(0);
    cleanup();
    localStorage.setItem('club-link', `ub_${'b'.repeat(64)}`);
    render(<ClubUpload />);
    await screen.findByText('Ovaj računar nije povezan');
    expect(localStorage.getItem('club-link')).toBeNull();
  });

  it('asks before a link of another club replaces a working one', async () => {
    localStorage.setItem('club-link', TOKEN);
    history.replaceState(null, '', `/ubaci#${OTHER}`);
    render(<ClubUpload />);
    await screen.findByText('Ovaj računar je povezan sa klubom Čačak. Prebaciti ga na Drugi klub?');
    expect(location.hash).toBe('');
    expect(localStorage.getItem('club-link')).toBe(TOKEN);
    fireEvent.click(screen.getByRole('button', { name: 'Ostavi Čačak' }));
    await screen.findByLabelText('Ana');
    expect(localStorage.getItem('club-link')).toBe(TOKEN);
    cleanup();
    history.replaceState(null, '', `/ubaci#${OTHER}`);
    render(<ClubUpload />);
    fireEvent.click(await screen.findByRole('button', { name: 'Prebaci na Drugi klub' }));
    await screen.findByText('U klubu još nema strelaca.');
    expect(localStorage.getItem('club-link')).toBe(OTHER);
  });

  it('takes a new link without asking when the old one no longer works', async () => {
    localStorage.setItem('club-link', `ub_${'b'.repeat(64)}`);
    render(<ClubUpload />);
    await screen.findByLabelText('Ana');
    expect(localStorage.getItem('club-link')).toBe(TOKEN);
  });

  it('a wrong link does not break a working one', async () => {
    localStorage.setItem('club-link', TOKEN);
    history.replaceState(null, '', `/ubaci#ub_${'d'.repeat(64)}`);
    render(<ClubUpload />);
    await screen.findByLabelText('Ana');
    expect(localStorage.getItem('club-link')).toBe(TOKEN);
  });

  it('a lost connection is not a lost link', async () => {
    localStorage.setItem('club-link', TOKEN);
    history.replaceState(null, '', '/ubaci');
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    render(<ClubUpload />);
    await screen.findByText('Nema veze sa serverom.');
    expect(localStorage.getItem('club-link')).toBe(TOKEN);
    expect(calls).toHaveLength(0);
  });

  it('works until closed when the browser keeps nothing', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<ClubUpload />);
    await screen.findByText('Čačak');
    spy.mockRestore();
  });
});

describe('sending', () => {
  it('needs a name and a readable file', async () => {
    render(<ClubUpload />);
    await screen.findByText('Čačak');
    expect(send().disabled).toBe(true);
    pick('a.prnx');
    await screen.findByText(/Air Rifle 60 · 628.8/);
    expect(send().disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Ana'));
    expect(send().disabled).toBe(false);
  });

  it('does not send a file it cannot read', async () => {
    render(<ClubUpload />);
    await screen.findByText('Čačak');
    fireEvent.click(screen.getByLabelText('Ana'));
    pick('bad.txt');
    await screen.findByText('Ovaj fajl se ne prima.');
    expect(send().disabled).toBe(true);
  });

  it('sends for the chosen name, then leaves nothing for the next person', async () => {
    render(<ClubUpload />);
    await screen.findByText('Čačak');
    fireEvent.click(screen.getByLabelText('Boris'));
    pick('a.prnx', 'b.scatt-expert');
    await screen.findByText(/75 hitaca · 11\. 11\. 2026/);
    fireEvent.click(send());
    await screen.findByText('Poslato fajlova: 2');
    expect(calls.filter((c) => c.body?.step === 'start').map((c) => c.body!.shooterId)).toEqual(['s2', 's2']);
    expect(put).toHaveBeenCalledTimes(2);
    expect((screen.getByLabelText('Boris') as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByText('a.prnx')).toBeNull();
    expect(send().disabled).toBe(true);
  });

  it('keeps what failed for another try and does not send the rest again', async () => {
    confirmStatus = (id) => (id.includes('b.scatt') && !id.startsWith('u3') ? 500 : 201);
    render(<ClubUpload />);
    await screen.findByText('Čačak');
    fireEvent.click(screen.getByLabelText('Ana'));
    pick('a.prnx', 'b.scatt-expert');
    await screen.findByText(/75 hitaca · 11\. 11\. 2026/);
    fireEvent.click(send());
    const again = await screen.findByRole('button', { name: 'Pokušaj ponovo' });
    expect(within(screen.getByText('a.prnx').closest('li')!).getByText('Poslato')).toBeTruthy();
    fireEvent.click(again);
    await screen.findByText('Poslato fajlova: 2');
    expect(calls.filter((c) => c.body?.step === 'start').map((c) => c.body!.fileName)).toEqual(['a.prnx', 'b.scatt-expert', 'b.scatt-expert']);
  });

  it('taking away the file that cannot be sent leaves nothing for the next person either', async () => {
    confirmStatus = (id) => (id.includes('b.scatt') ? 415 : 201);
    render(<ClubUpload />);
    await screen.findByText('Čačak');
    fireEvent.click(screen.getByLabelText('Ana'));
    pick('a.prnx', 'b.scatt-expert');
    await screen.findByText(/75 hitaca/);
    fireEvent.click(send());
    await screen.findByRole('button', { name: 'Pokušaj ponovo' });
    fireEvent.click(within(screen.getByText('b.scatt-expert').closest('li')!).getByRole('button', { name: 'Ukloni' }));
    await screen.findByText('Poslato fajlova: 1');
    expect(screen.queryByText('a.prnx')).toBeNull();
    expect((screen.getByLabelText('Ana') as HTMLInputElement).checked).toBe(false);
  });

  it('does not take a file dropped while it is sending', async () => {
    let release = () => {};
    put.mockImplementation(() => new Promise((r) => (release = () => r({ error: null }))));
    render(<ClubUpload />);
    await screen.findByText('Čačak');
    fireEvent.click(screen.getByLabelText('Ana'));
    pick('a.prnx');
    await screen.findByText(/628.8/);
    fireEvent.click(send());
    await waitFor(() => expect(put).toHaveBeenCalled());
    fireEvent.drop(screen.getByText('Prevuci SIUS i SCATT fajl ovde').closest('label')!, { dataTransfer: { files: [new File(['x'], 'late.scatt-expert')] } });
    expect(screen.queryByText('late.scatt-expert')).toBeNull();
    release();
    await screen.findByText('Poslato fajlova: 1');
  });

  it('says when a file was already sent', async () => {
    confirmStatus = () => 409;
    render(<ClubUpload />);
    await screen.findByText('Čačak');
    fireEvent.click(screen.getByLabelText('Ana'));
    pick('a.prnx');
    await screen.findByText(/628.8/);
    fireEvent.click(send());
    await screen.findByText('Već poslato ranije: 1');
    expect(screen.queryByText(/a\.prnx/)).toBeNull();
    await waitFor(() => expect((screen.getByLabelText('Ana') as HTMLInputElement).checked).toBe(false));
  });
});
