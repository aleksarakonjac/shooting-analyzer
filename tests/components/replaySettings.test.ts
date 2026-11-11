import { describe, expect, it } from 'vitest';
import { sanitizeReplayPrefs, seconds } from '../../src/components/report/replaySettings';

describe('replay time settings', () => {
  it('keeps seconds to a tenth within the allowed range', () => {
    expect(seconds('2.46', 15, 5)).toBe(2.5);
    expect(seconds(99, 15, 5)).toBe(15);
    expect(seconds(-4, 3, 1)).toBe(0);
    expect(seconds('abc', 3, 1)).toBe(1);
    expect(seconds('', 3, 1)).toBe(1);
    expect(seconds(undefined, 3, 1)).toBe(1);
  });

  it('accepts old stored values (text seconds) and clamps them', () => {
    const p = sanitizeReplayPrefs({ before: '60', after: '2', hit: 'red' });
    expect(p.before).toBe(15);
    expect(p.after).toBe(2);
    expect(sanitizeReplayPrefs(null)).toMatchObject({ before: 5, after: 1 });
  });
});
