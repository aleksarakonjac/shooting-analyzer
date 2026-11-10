const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A row id from a form field; anything that is not a uuid stops the action before it reaches the database. */
export function requireUuid(v: FormDataEntryValue | null): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw new Error('Invalid id');
  return v;
}

/**
 * The result of a write with `.select('id')`: throws on an error, and when no row changed (the row is
 * gone or row-level security filtered it out), which Supabase otherwise reports as success.
 */
export function requireOne(res: { data: unknown[] | null; error: { message: string } | null }): void {
  if (res.error) throw new Error(res.error.message);
  if (!res.data?.length) throw new Error('Nothing was changed');
}
