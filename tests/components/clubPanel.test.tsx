// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const chooseClub = vi.fn();
const renameClub = vi.fn();
const replaceClubLink = vi.fn();
vi.mock('@/lib/clubs/actions', () => ({
  chooseClub: (...a: unknown[]) => chooseClub(...a),
  renameClub: (...a: unknown[]) => renameClub(...a),
  replaceClubLink: (...a: unknown[]) => replaceClubLink(...a),
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { ClubPanel } = await import('../../src/app/(app)/nalog/ClubPanel');

const ID = '00000000-0000-0000-0000-000000000001';
const TOKEN = `ub_${'a'.repeat(64)}`;
const club = { id: ID, name: 'Čačak', token: TOKEN, canManage: true };
const type = (v: string) => fireEvent.change(screen.getByRole('combobox', { name: /Klub|klub/ }), { target: { value: v } });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ClubPanel', () => {
  it('joins an entered club whatever the spelling', async () => {
    chooseClub.mockResolvedValue({ ok: true });
    render(<ClubPanel club={null} clubs={['Čačak']} siteUrl="https://x.test" />);
    expect(screen.getByText('Vaše ime vide svi koji imaju link kluba.')).toBeTruthy();
    type('cacak');
    fireEvent.click(screen.getByRole('button', { name: 'Upiši se u Čačak' }));
    await waitFor(() => expect(chooseClub).toHaveBeenCalledWith('Čačak'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('makes a club when none matches, and says when that failed', async () => {
    chooseClub.mockResolvedValue({ ok: false });
    render(<ClubPanel club={null} clubs={['Čačak']} siteUrl="https://x.test" />);
    type('Novi klub');
    fireEvent.click(screen.getByRole('button', { name: 'Napravi klub Novi klub' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Klub nije sačuvan.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows the link and lets a member leave, but not manage', async () => {
    chooseClub.mockResolvedValue({ ok: true });
    render(<ClubPanel club={{ ...club, canManage: false }} clubs={['Čačak']} siteUrl="https://x.test" />);
    expect(screen.getByText(`https://x.test/ubaci#${TOKEN}`)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Zameni link' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Preimenuj' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Izađi iz kluba' }));
    await waitFor(() => expect(chooseClub).toHaveBeenCalledWith(''));
  });

  it('replaces the link only after a second click, and renames', async () => {
    replaceClubLink.mockResolvedValue({ ok: true });
    renameClub.mockResolvedValue({ ok: true });
    render(<ClubPanel club={club} clubs={['Čačak']} siteUrl="https://x.test" />);
    fireEvent.click(screen.getByRole('button', { name: 'Zameni link' }));
    expect(replaceClubLink).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Da, zameni' }));
    await waitFor(() => expect(replaceClubLink).toHaveBeenCalledWith(ID));
    fireEvent.change(screen.getByLabelText('Naziv kluba'), { target: { value: 'Čačak 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preimenuj' }));
    await waitFor(() => expect(renameClub).toHaveBeenCalledWith(ID, 'Čačak 1'));
  });
});
