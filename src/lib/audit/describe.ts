export type AuditAction = 'insert' | 'update' | 'soft_delete' | 'restore' | 'delete';

const KNOWN: AuditAction[] = ['insert', 'update', 'soft_delete', 'restore', 'delete'];

/**
 * What the audit list shows for a `trainings` row: the action and the training's name.
 * audit_row() stores the plain row for insert and delete, and {old, new} for everything else.
 */
export function describeAudit(row: { action: string; diff: unknown }): { action: AuditAction; name: string } {
  const action = (KNOWN as string[]).includes(row.action) ? (row.action as AuditAction) : 'update';
  const diff = (row.diff ?? {}) as Record<string, unknown>;
  const plain = action === 'insert' || action === 'delete';
  const side = (plain ? diff : (diff.new as Record<string, unknown> | undefined)) ?? {};
  return { action, name: typeof side.name === 'string' ? side.name : '' };
}
