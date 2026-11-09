import { describe, expect, it } from 'vitest';
import { describeAudit } from '@/lib/audit/describe';

describe('describeAudit', () => {
  it('names an insert by the new row', () => {
    expect(describeAudit({ action: 'insert', diff: { name: '21.10. Vazdušna puška' } })).toEqual({
      action: 'insert',
      name: '21.10. Vazdušna puška',
    });
  });

  it('reads the name from the new side of an update, soft delete and restore', () => {
    for (const action of ['update', 'soft_delete', 'restore'] as const) {
      expect(describeAudit({ action, diff: { old: { name: 'Staro' }, new: { name: 'Novo' } } })).toEqual({ action, name: 'Novo' });
    }
  });

  it('names a permanent delete by the removed row', () => {
    expect(describeAudit({ action: 'delete', diff: { name: 'Obrisano' } })).toEqual({ action: 'delete', name: 'Obrisano' });
  });

  it('survives a missing or empty diff and an unknown action', () => {
    expect(describeAudit({ action: 'insert', diff: null })).toEqual({ action: 'insert', name: '' });
    expect(describeAudit({ action: 'whatever', diff: { new: { name: 'x' } } })).toEqual({ action: 'update', name: 'x' });
  });
});
