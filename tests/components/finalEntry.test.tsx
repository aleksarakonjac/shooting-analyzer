// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock('../../src/lib/supabase/client', () => ({ createClient: () => ({}) }));
import { FinalEntry } from '../../src/components/FinalEntry';

afterEach(cleanup);

describe('FinalEntry', () => {
  it('offers the shot grid first and the paste box on a second tab', () => {
    render(<FinalEntry discipline="air_rifle" tz="Europe/Belgrade" date="2026-11-10" onDraft={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Ručno' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('Pogodak 1')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /Nalepite/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Nalepi' }));
    expect(screen.getByRole('textbox', { name: /Nalepite/ })).toBeTruthy();
  });

  it('puts a pasted final into the grid and returns to it', () => {
    render(<FinalEntry discipline="air_rifle" tz="Europe/Belgrade" date="2026-11-10" onDraft={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Nalepi' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Nalepite/ }), { target: { value: '1. 10.6\n2. 10,4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Primeni pogotke' }));
    expect(screen.getByRole('tab', { name: 'Ručno' }).getAttribute('aria-selected')).toBe('true');
    const first = screen.getAllByRole('textbox').find((el) => (el as HTMLInputElement).value === '10.6');
    expect(first).toBeTruthy();
  });
});
