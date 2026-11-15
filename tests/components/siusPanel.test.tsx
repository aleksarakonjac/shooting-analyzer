// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const connectSius = vi.fn();
const disconnectSius = vi.fn();
const siusConfirmAthlete = vi.fn();
vi.mock('@/lib/sius/actions', () => ({
  connectSius: (...a: unknown[]) => connectSius(...a),
  disconnectSius: (...a: unknown[]) => disconnectSius(...a),
  siusConfirmAthlete: (...a: unknown[]) => siusConfirmAthlete(...a),
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { SiusPanel } = await import('../../src/app/(app)/nalog/SiusPanel');

const UID = '00000000-0000-0000-0000-000000000001';
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('SIUS e-pošta'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('SIUS lozinka'), { target: { value: password } });
}

describe('SiusPanel', () => {
  it('not connected: email + password form; submit connects and clears the password', async () => {
    connectSius.mockResolvedValue({ ok: true });
    render(<SiusPanel userId={UID} status={{ state: 'none', reason: null, email: null }} athleteId={null} />);
    expect(screen.getByText(/šifrovano/)).toBeTruthy();
    expect(screen.getByText(/Forgot password/)).toBeTruthy();
    fill('me@example.com', 'secret');
    fireEvent.click(screen.getByRole('button', { name: 'Poveži SIUS' }));
    await waitFor(() => expect(connectSius).toHaveBeenCalledWith('me@example.com', 'secret'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect((screen.getByLabelText('SIUS lozinka') as HTMLInputElement).value).toBe('');
    expect(document.body.textContent).not.toContain('secret');
  });

  it('password field is a password input', () => {
    render(<SiusPanel userId={UID} status={{ state: 'none', reason: null, email: null }} athleteId={null} />);
    expect((screen.getByLabelText('SIUS lozinka') as HTMLInputElement).type).toBe('password');
  });

  it('bad_password shows the error and clears the password', async () => {
    connectSius.mockResolvedValue({ ok: false, error: 'bad_password' });
    render(<SiusPanel userId={UID} status={{ state: 'none', reason: null, email: null }} athleteId={null} />);
    fill('me@example.com', 'wrong');
    fireEvent.click(screen.getByRole('button', { name: 'Poveži SIUS' }));
    expect((await screen.findByRole('alert')).textContent).toBe('SIUS nije prihvatio e-poštu ili lozinku.');
    expect((screen.getByLabelText('SIUS lozinka') as HTMLInputElement).value).toBe('');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('limit and blocked have their own messages', async () => {
    connectSius.mockResolvedValue({ ok: false, error: 'limit' });
    render(<SiusPanel userId={UID} status={{ state: 'none', reason: null, email: null }} athleteId={null} />);
    fill('a@b', 'x');
    fireEvent.click(screen.getByRole('button', { name: 'Poveži SIUS' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Previše prijava/);
  });

  it('connected: shows the email and disconnects', async () => {
    disconnectSius.mockResolvedValue({ ok: true });
    render(<SiusPanel userId={UID} status={{ state: 'ok', reason: null, email: 'me@example.com' }} athleteId={null} />);
    expect(screen.getByText('Povezano: me@example.com')).toBeTruthy();
    expect(screen.queryByLabelText('SIUS lozinka')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Prekini vezu' }));
    await waitFor(() => expect(disconnectSius).toHaveBeenCalled());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('broken: reason and the form again, email prefilled', () => {
    render(<SiusPanel userId={UID} status={{ state: 'broken', reason: 'bad_password', email: 'me@example.com' }} athleteId={null} />);
    expect(screen.getByText(/SIUS je odbio sačuvanu lozinku/)).toBeTruthy();
    expect((screen.getByLabelText('SIUS e-pošta') as HTMLInputElement).value).toBe('me@example.com');
    expect(screen.getByRole('button', { name: 'Poveži SIUS ponovo' })).toBeTruthy();
  });

  it('broken as blocked explains that SIUS stopped the sign-in', () => {
    render(<SiusPanel userId={UID} status={{ state: 'broken', reason: 'blocked', email: 'me@example.com' }} athleteId={null} />);
    expect(screen.getByText(/SIUS je zaustavio automatsku prijavu/)).toBeTruthy();
  });

  it('athlete id field saves the identifier', async () => {
    siusConfirmAthlete.mockResolvedValue({ ok: true });
    render(<SiusPanel userId={UID} status={{ state: 'none', reason: null, email: null }} athleteId="SHSRBM01" />);
    const field = screen.getByLabelText('SIUS ID strelca') as HTMLInputElement;
    expect(field.value).toBe('SHSRBM01');
    fireEvent.change(field, { target: { value: 'SHSRBM02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sačuvaj ID' }));
    await waitFor(() => expect(siusConfirmAthlete).toHaveBeenCalledWith(UID, 'SHSRBM02'));
  });

  it('a failing connect shows an error instead of crashing', async () => {
    connectSius.mockRejectedValue(new Error('boom'));
    render(<SiusPanel userId={UID} status={{ state: 'none', reason: null, email: null }} athleteId={null} />);
    fill('a@b', 'x');
    fireEvent.click(screen.getByRole('button', { name: 'Poveži SIUS' }));
    expect((await screen.findByRole('alert')).textContent).toBe('SIUS trenutno nije dostupan. Pokušaj kasnije.');
  });
});

