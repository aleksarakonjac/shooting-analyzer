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
