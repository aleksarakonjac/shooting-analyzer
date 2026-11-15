import { MAX_UPLOAD_BYTES } from '@/lib/import/uploadSource';

/** Every SCATT Expert export is an SQLite database. */
const SQLITE_MAGIC = 'SQLite format 3\0';

export function isScattBytes(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_MAGIC.length) return false;
  for (let i = 0; i < SQLITE_MAGIC.length; i++) if (bytes[i] !== SQLITE_MAGIC.charCodeAt(i)) return false;
  return true;
}

/** A Garmin/Polar-style TCX export: XML whose root is TrainingCenterDatabase. */
export function isTcxBytes(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 4096)).replace(/^\uFEFF/, '').trimStart();
  return head.startsWith('<') && /<TrainingCenterDatabase[\s>]/.test(head);
}

/** A PDF (a SIUS result report). The parser checks it is really a SIUS report when it is added to a session. */
export function isPdfBytes(bytes: Uint8Array): boolean {
  const magic = '%PDF-';
  // The header may follow a few junk bytes; the PDF reference allows it within the first 1024.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  return head.includes(magic);
}

export type InboxKind = 'scatt' | 'tcx' | 'sius_pdf';

/** What an uploaded file is, from its content (never from its name). */
export function inboxKindOf(bytes: Uint8Array): InboxKind | null {
  if (isScattBytes(bytes)) return 'scatt';
  if (isTcxBytes(bytes)) return 'tcx';
  if (isPdfBytes(bytes)) return 'sius_pdf';
  return null;
}

const EXT: Record<InboxKind, string> = { scatt: 'scatt-expert', tcx: 'tcx', sius_pdf: 'pdf' };

/** A display name safe to keep: no path, no control characters, at most 200 characters, never empty. */
export function cleanFileName(raw: string | null | undefined, kind: InboxKind = 'scatt'): string {
  const base = (raw ?? '').split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
  return clean || `${kind}.${EXT[kind]}`;
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
  insertRow(row: { id: string; user_id: string; kind: InboxKind; storage_path: string; file_name: string; bytes: number }): Promise<void>;
  removeObject(path: string): Promise<void>;
  touchToken(tokenId: string): Promise<void>;
  newId(): string;
}

/** Files that may wait at once; more are refused until some are entered or removed. */
export const MAX_WAITING = 50;

export type InboxResult =
  | { status: 201; id: string; kind: InboxKind }
  | { status: 400 | 401 | 413 | 415 | 429 | 500; error: string };

/** The uploaded file, or 'too large' when the body passed the limit while being read. */
export type ReadOutcome = { name: string | null; bytes: Uint8Array } | null | 'too large';

/**
 * Accepts one uploaded SCATT, TCX or PDF file for the token's owner and parks it in their inbox. The body is read only
 * after the token is known to belong to an active shooter and the declared size fits, so a made-up token
 * never makes the server buffer anything.
 */
export async function acceptInboxFile(
  tokenHash: string | null,
  declaredBytes: number | null,
  readFile: () => Promise<ReadOutcome>,
  deps: InboxDeps,
): Promise<InboxResult> {
  if (!tokenHash) return { status: 401, error: 'unauthorized' };
  const owner = await deps.ownerOf(tokenHash);
  if (!owner) return { status: 401, error: 'unauthorized' };
  if (declaredBytes !== null && declaredBytes > MAX_BODY_BYTES) return { status: 413, error: 'file too large' };
  let file: ReadOutcome;
  try {
    file = await readFile();
  } catch {
    return { status: 400, error: 'unreadable body' };
  }
  if (file === 'too large') return { status: 413, error: 'file too large' };
  if (!file || file.bytes.length === 0) return { status: 400, error: 'no file' };
  if (file.bytes.length > MAX_UPLOAD_BYTES) return { status: 413, error: 'file too large' };
  const kind = inboxKindOf(file.bytes);
  if (!kind) return { status: 415, error: 'not a SCATT, TCX or PDF file' };
  if ((await deps.waiting(owner.userId)) >= MAX_WAITING) return { status: 429, error: 'inbox full' };

  const id = deps.newId();
  const path = `${owner.userId}/${id}.${EXT[kind]}`;
  try {
    await deps.putObject(path, file.bytes);
  } catch {
    return { status: 500, error: 'storage failed' };
  }
  try {
    await deps.insertRow({ id, user_id: owner.userId, kind, storage_path: path, file_name: cleanFileName(file.name, kind), bytes: file.bytes.length });
  } catch {
    await deps.removeObject(path).catch(() => {});
    return { status: 500, error: 'save failed' };
  }
  await deps.touchToken(owner.tokenId).catch(() => {});
  return { status: 201, id, kind };
}

/** Request body limit: the file plus room for multipart framing. */
export const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;

/** Reads a stream into memory, giving up (and cancelling it) as soon as it passes `limit` bytes. */
export async function readCapped(body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array<ArrayBuffer> | 'too large'> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      return 'too large';
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
