// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { CloseReport } from '../../src/components/report/CloseReport';
import { readListUrl, saveListUrl } from '../../src/lib/listReturn';

beforeEach(() => window.sessionStorage.clear());
afterEach(cleanup);

describe('CloseReport', () => {
  it('goes to the plain list when no list was visited', () => {
    render(<CloseReport />);
    expect(screen.getByRole('link', { name: 'Zatvori' }).getAttribute('href')).toBe('/');
  });

  it('goes back to the list as it was left, filters included', async () => {
    saveListUrl('/?y=2026&mo=10&sc=0');
    render(<CloseReport />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Zatvori' }).getAttribute('href')).toBe('/?y=2026&mo=10&sc=0'));
  });

  it('never follows a stored address that leaves the site', () => {
    window.sessionStorage.setItem('sessions:list-url', '//evil.example/x');
    expect(readListUrl()).toBeNull();
    window.sessionStorage.setItem('sessions:list-url', 'https://evil.example/x');
    expect(readListUrl()).toBeNull();
  });
});
