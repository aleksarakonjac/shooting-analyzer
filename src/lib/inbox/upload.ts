import { MAX_UPLOAD_BYTES } from '@/lib/import/uploadSource';

/** Every SCATT Expert export is an SQLite database. */
const SQLITE_MAGIC = 'SQLite format 3\0';

export function isScattBytes(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_MAGIC.length) return false;
  for (let i = 0; i < SQLITE_MAGIC.length; i++) if (bytes[i] !== SQLITE_MAGIC.charCodeAt(i)) return false;
  return true;
}

/** A display name safe to keep: no path, no control characters, at most 200 characters, never empty. */
export function cleanFileName(raw: string | null | undefined): string {
  const base = (raw ?? '').split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
  return clean || 'scatt.scatt-expert';
}

export interface InboxOwner {
  userId: string;
  tokenId: string;
}

export interface InboxDeps {
  /** The active shooter who owns this token hash, or null. */
  ownerOf(tokenHash: string): Promise<InboxOwner | null>;
  /** Count of files already waiting for this user. */
  waiting(userId: string): Promise<number>;
  putObject(path: string, bytes: Uint8Array): Promise<void>;
  insertRow(row: { id: string; user_id: string; storage_path: string; file_name: string; bytes: number }): Promise<void>;
  removeObject(path: string): Promise<void>;
  touchToken(tokenId: string): Promise<void>;
  newId(): string;
}

/** Files that may wait at once; more are refused until some are entered or removed. */
export const MAX_WAITING = 50;

export type InboxResult =
  | { status: 201; id: string }
  | { status: 400 | 401 | 413 | 415 | 429 | 500; error: string };

/** Accepts one uploaded SCATT file for the token's owner and parks it in their inbox. */
export async function acceptInboxFile(
  tokenHash: string | null,
  file: { name: string | null; bytes: Uint8Array } | null,
  deps: InboxDeps,
): Promise<InboxResult> {
  if (!tokenHash) return { status: 401, error: 'unauthorized' };
  const owner = await deps.ownerOf(tokenHash);
  if (!owner) return { status: 401, error: 'unauthorized' };
  if (!file || file.bytes.length === 0) return { status: 400, error: 'no file' };
  if (file.bytes.length > MAX_UPLOAD_BYTES) return { status: 413, error: 'file too large' };
  if (!isScattBytes(file.bytes)) return { status: 415, error: 'not a SCATT file' };
  if ((await deps.waiting(owner.userId)) >= MAX_WAITING) return { status: 429, error: 'inbox full' };

  const id = deps.newId();
  const path = `${owner.userId}/${id}.scatt-expert`;
  try {
    await deps.putObject(path, file.bytes);
  } catch {
    return { status: 500, error: 'storage failed' };
  }
  try {
    await deps.insertRow({ id, user_id: owner.userId, storage_path: path, file_name: cleanFileName(file.name), bytes: file.bytes.length });
  } catch {
    await deps.removeObject(path).catch(() => {});
    return { status: 500, error: 'save failed' };
  }
  await deps.touchToken(owner.tokenId).catch(() => {});
  return { status: 201, id };
}
