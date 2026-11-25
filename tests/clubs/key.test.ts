import { describe, expect, it } from 'vitest';
import { clubKey } from '@/lib/clubs/key';

// The same cases as supabase/tests/clubs_upload.test.sql: the database decides, this only predicts it.
describe('clubKey', () => {
  it('folds Cyrillic, diacritics, case and spaces', () => {
    expect(clubKey('  ЧАЧАК ')).toBe('cacak');
    expect(clubKey('Čačak')).toBe('cacak');
    expect(clubKey('Đorđe  Љубић')).toBe('dorde ljubic');
    expect(clubKey('  ')).toBe('');
  });
});
