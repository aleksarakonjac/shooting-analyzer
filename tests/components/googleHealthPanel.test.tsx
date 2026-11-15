// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GoogleHealthPanel } from '../../src/app/(app)/nalog/GoogleHealthPanel';

afterEach(cleanup);

describe('GoogleHealthPanel', () => {
  it('offers to connect when not connected', () => {
    render(<GoogleHealthPanel status="none" connectedAt={null} flash={null} />);
    expect(screen.getByRole('link', { name: 'Poveži Google Health' }).getAttribute('href')).toBe('/api/google-health/connect');
    expect(screen.getByText(/unverified app/)).toBeTruthy();
  });

  it('shows the date and a disconnect button when connected', () => {
    render(<GoogleHealthPanel status="ok" connectedAt="2026-11-15T10:00:00Z" flash={null} />);
    expect(screen.getByText('Povezano od 15. 11. 2026.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Prekini vezu' })).toBeTruthy();
  });

  it('asks to reconnect when the link is broken', () => {
    render(<GoogleHealthPanel status="broken" connectedAt="2026-11-15T10:00:00Z" flash={null} />);
    expect(screen.getByText('Veza je istekla ili je opozvana.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Poveži ponovo' })).toBeTruthy();
  });

  it('shows the flash for missing scopes', () => {
    render(<GoogleHealthPanel status="none" connectedAt={null} flash="scopes" />);
    expect(screen.getByRole('alert').textContent).toBe('Potrebno je odobriti oba pristupa (puls i aktivnosti).');
  });
});
