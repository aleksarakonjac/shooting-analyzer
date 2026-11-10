export interface PurgeDeps {
  /** The training exists, the caller may see it, and it is in the trash. */
  isTrashed(id: string): Promise<boolean>;
  listFiles(id: string): Promise<string[]>;
  removeFiles(paths: string[]): Promise<void>;
  deleteForever(id: string): Promise<void>;
}

/**
 * Deletes a trashed training for good. The trash check comes first: a training restored in
 * another tab must keep its raw files. Files go before the row because the storage policy
 * needs the training row to decide who may delete them.
 */
export async function purgeTraining(deps: PurgeDeps, id: string): Promise<void> {
  if (!(await deps.isTrashed(id))) throw new Error('Training is not in the trash');
  const paths = await deps.listFiles(id);
  if (paths.length) await deps.removeFiles(paths);
  await deps.deleteForever(id);
}

export interface ExpiredDeps {
  /** Trainings in the trash since before the cutoff. */
  dueIds(cutoff: string): Promise<string[]>;
  /** Every stored file of a training (all pages); throws when storage fails. */
  listFiles(id: string): Promise<string[]>;
  /** Throws when storage fails. */
  removeFiles(paths: string[]): Promise<void>;
  /** Deletes the given trainings that are still in the trash since before the cutoff; returns those deleted. */
  purge(ids: string[], cutoff: string): Promise<string[]>;
}

/**
 * The daily trash job. Each due training's files go first; only trainings whose files are gone are
 * purged, with the same cutoff they were selected by, so no stored file outlives its row and a
 * training restored meanwhile stays. A storage failure leaves that training for the next run.
 */
export async function purgeExpired(deps: ExpiredDeps, cutoff: string): Promise<{ purged: string[]; failed: string[] }> {
  const ready: string[] = [];
  const failed: string[] = [];
  for (const id of await deps.dueIds(cutoff)) {
    try {
      const paths = await deps.listFiles(id);
      if (paths.length) await deps.removeFiles(paths);
      ready.push(id);
    } catch {
      failed.push(id);
    }
  }
  const purged = ready.length ? await deps.purge(ready, cutoff) : [];
  return { purged, failed };
}
