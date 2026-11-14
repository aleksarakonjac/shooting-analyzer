// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { clearLastSession, parseLastSession, readLastSession, writeLastSession } from '@/lib/report/lastSession';

describe('last session', () => {
  beforeEach(() => localStorage.clear());

  it('remembers the session and the shot', () => {
    writeLastSession({ id: 'abc', name: 'Trening', series: 6, shot: 51 });
    expect(readLastSession()).toEqual({ id: 'abc', name: 'Trening', series: 6, shot: 51 });
  });

  it('is empty when nothing, garbage or no id is stored', () => {
    expect(readLastSession()).toBeNull();
    expect(parseLastSession('{nope')).toBeNull();
    expect(parseLastSession('{"name":"x"}')).toBeNull();
  });

  it('clears only the named session', () => {
    writeLastSession({ id: 'abc', name: '', series: null, shot: null });
    clearLastSession('other');
    expect(readLastSession()?.id).toBe('abc');
    clearLastSession('abc');
    expect(readLastSession()).toBeNull();
  });
});
