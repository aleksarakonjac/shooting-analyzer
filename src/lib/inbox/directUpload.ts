import { createHash } from 'node:crypto';
import { MAX_UPLOAD_BYTES } from '@/lib/import/uploadSource';
import type { InboxKind, InboxMeta } from './types';
import { cleanFileName, inboxKindOf, MAX_WAITING } from './upload';

/** An upload that was started: the browser sends the file to storage_path, then asks for it to be confirmed. */
export interface StartedUpload {
  id: string;
  user_id: string;
  storage_path: string;
  file_name: string;
  meta: InboxMeta;
}

export interface UploadDeps {
  /** May whoever is asking put a file into this shooter's inbox right now? */
  allowed(shooterId: string): Promise<boolean>;
  /** Files waiting and uploads started for this shooter. */
  waiting(shooterId: string): Promise<number>;
  insertUpload(u: StartedUpload): Promise<void>;
  /** Only an upload started by whoever is asking. */
  findUpload(id: string): Promise<StartedUpload | null>;
  deleteUpload(id: string): Promise<void>;
  /** A token with which exactly this path can be written once. */
  signUpload(path: string): Promise<string>;
  readObject(path: string): Promise<Uint8Array | null>;
  removeObject(path: string): Promise<void>;
  insertFile(f: StartedUpload & { kind: InboxKind; bytes: number; sha256: string }): Promise<'ok' | 'duplicate'>;
  newId(): string;
}

export type StartResult = { status: 201; uploadId: string; path: string; token: string } | { status: 400 | 403 | 413 | 429; error: string };
export type ConfirmResult = { status: 201; kind: InboxKind } | { status: 403 | 404 | 409 | 413 | 415; error: string };

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** What a page claims about a file, reduced to the shapes we know. For display and pairing only. */
export function cleanMeta(x: unknown): InboxMeta {
  if (!x || typeof x !== 'object') return null;
  const { sius, scatt } = x as { sius?: Record<string, unknown>; scatt?: Record<string, unknown> };
  if (sius && typeof sius === 'object') {
    const { discipline, total, shots, atMs } = sius;
    if (typeof discipline !== 'string' || !num(total) || !num(shots) || !(atMs === null || num(atMs))) return null;
    return { sius: { discipline: discipline.slice(0, 80), total, shots, atMs: atMs as number | null } };
  }
  if (scatt && typeof scatt === 'object') {
    const { shots, startMs, endMs } = scatt;
    return num(shots) && num(startMs) && num(endMs) ? { scatt: { shots, startMs, endMs } } : null;
  }
  return null;
}

/** The club token from `Authorization: Bearer <token>`, or null. */
export function clubToken(header: string | null): string | null {
  return header?.match(/^Bearer (ub_[0-9a-f]{64})$/)?.[1] ?? null;
}

/** First step: room for one file of one shooter, at a path only the server chooses. */
export async function startUpload(req: { shooterId: string; fileName: string; bytes: number; meta: unknown }, deps: UploadDeps): Promise<StartResult> {
  if (!Number.isInteger(req.bytes) || req.bytes <= 0) return { status: 400, error: 'bad size' };
  if (req.bytes > MAX_UPLOAD_BYTES) return { status: 413, error: 'file too large' };
  if (!(await deps.allowed(req.shooterId))) return { status: 403, error: 'not allowed' };
  if ((await deps.waiting(req.shooterId)) >= MAX_WAITING) return { status: 429, error: 'inbox full' };
  const id = deps.newId();
  const path = `${req.shooterId}/${id}`;
  await deps.insertUpload({ id, user_id: req.shooterId, storage_path: path, file_name: cleanFileName(req.fileName), meta: cleanMeta(req.meta) });
  return { status: 201, uploadId: id, path, token: await deps.signUpload(path) };
}

/** Second step: the stored bytes decide what the file is; anything refused is removed. */
export async function confirmUpload(uploadId: string, deps: UploadDeps): Promise<ConfirmResult> {
  const up = await deps.findUpload(uploadId);
  if (!up) return { status: 404, error: 'unknown upload' };
  const drop = async () => {
    await deps.removeObject(up.storage_path);
    await deps.deleteUpload(up.id);
  };
  if (!(await deps.allowed(up.user_id))) {
    await drop();
    return { status: 403, error: 'not allowed' };
  }
  const bytes = await deps.readObject(up.storage_path);
  // Not there (yet): the upload stays open, the daily job removes it if nothing comes.
  if (!bytes) return { status: 404, error: 'no file' };
  const kind = inboxKindOf(bytes);
  if (!kind || bytes.length > MAX_UPLOAD_BYTES) {
    await drop();
    return kind ? { status: 413, error: 'file too large' } : { status: 415, error: 'not a SCATT, TCX, PDF or PRNX file' };
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if ((await deps.insertFile({ ...up, kind, bytes: bytes.length, sha256 })) === 'duplicate') {
    await drop();
    return { status: 409, error: 'already sent' };
  }
  await deps.deleteUpload(up.id);
  return { status: 201, kind };
}
