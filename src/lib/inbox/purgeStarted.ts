/** An upload token is good for 2 h; after a day whatever was not accepted is abandoned. */
const KEEP_MS = 24 * 3_600_000;
/** Storage removes at most this many objects per call. */
const BATCH = 1000;

export interface StartedDeps {
  /** Every object under incoming/. Throws when storage fails. */
  listIncoming(): Promise<{ path: string; createdMs: number }[]>;
  /** Throws when storage fails. */
  removeFiles(paths: string[]): Promise<void>;
  /** Deletes the rows of uploads started before the cutoff. */
  deleteRows(cutoff: string): Promise<void>;
}

/**
 * The daily sweep of uploads that were started and not accepted. Objects go by their own age, with or without a row
 * (a token may write after its upload was refused), and before the rows, so a storage failure is retried tomorrow.
 */
export async function purgeStarted(deps: StartedDeps, now: number): Promise<{ removed: number }> {
  const cutoff = now - KEEP_MS;
  const old = (await deps.listIncoming()).filter((o) => o.createdMs < cutoff).map((o) => o.path);
  for (let i = 0; i < old.length; i += BATCH) await deps.removeFiles(old.slice(i, i + BATCH));
  await deps.deleteRows(new Date(cutoff).toISOString());
  return { removed: old.length };
}
