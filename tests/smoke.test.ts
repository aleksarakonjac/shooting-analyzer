import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { sr } from '@/lib/i18n/sr';

const fixtures = join(__dirname, 'fixtures');

describe('scaffold smoke', () => {
  it('exports a Serbian string table object', () => {
    expect(typeof sr).toBe('object');
    expect(sr).not.toBeNull();
  });

  it.each([
    '2026-10-21T190309.csv',
    '50m Rifle 3x20.pdf',
    'export_2026-10-22_14.11.scatt-expert',
    '4740240563405875576.tcx',
  ])('has fixture %s', (name) => {
    expect(existsSync(join(fixtures, name))).toBe(true);
  });
});
