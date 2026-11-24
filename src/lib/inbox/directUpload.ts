import { createHash } from 'node:crypto';
import { MAX_UPLOAD_BYTES } from '@/lib/import/uploadSource';
import type { InboxKind, InboxMeta } from './types';
import { cleanFileName, inboxKindOf } from './upload';

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
  /** Records a started upload, or false when the shooter's inbox has no room (counted and recorded in one step). */
  reserve(u: StartedUpload): Promise<boolean>;
  /** Only an upload started by whoever is asking. */
  findUpload(id: string): Promise<StartedUpload | null>;
  /** Takes the upload over: true for exactly one caller, after which it is no longer found. */
  claimUpload(id: string): Promise<boolean>;
  /** A token with which exactly this path can be written once. */
  signUpload(path: string): Promise<string>;
  readObject(path: string): Promise<Uint8Array | null>;
  removeObject(path: string): Promise<void>;
  moveObject(from: string, to: string): Promise<void>;
  acceptFile(f: StartedUpload & { kind: InboxKind; bytes: number; sha256: string }): Promise<'ok' | 'duplicate' | 'full'>;
  newId(): string;
}

export type StartResult = { status: 201; uploadId: string; path: string; token: string } | { status: 400 | 403 | 413 | 429; error: string };
export type ConfirmResult = { status: 201; kind: InboxKind } | { status: 403 | 404 | 409 | 413 | 415 | 429; error: string };

const between = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && v >= lo && v <= hi;
const count = (v: unknown): v is number => between(v, 0, 20_000);
/** A date the pages can show: neither out of range nor more than a wrong clock's two days ahead. */
const time = (v: unknown): v is number => between(v, Date.UTC(2000, 0, 1), Date.now() + 2 * 86_400_000);

/** What a page claims about a file, reduced to the shapes we know. For display and pairing only. */
export function cleanMeta(x: unknown): InboxMeta {
  if (!x || typeof x !== 'object') return null;
  const { sius, scatt } = x as { sius?: Record<string, unknown>; scatt?: Record<string, unknown> };
  if (sius && typeof sius === 'object') {
    const { discipline, total, shots, atMs } = sius;
    if (typeof discipline !== 'string' || !count(total) || !count(shots) || !(atMs === null || time(atMs))) return null;
    return { sius: { discipline: discipline.slice(0, 80), total, shots, atMs } };
  }
  if (scatt && typeof scatt === 'object') {
    const { shots, startMs, endMs } = scatt;
    return count(shots) && time(startMs) && time(endMs) ? { scatt: { shots, startMs, endMs } } : null;
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
  const id = deps.newId();
  const path = `incoming/${id}`;
  const room = await deps.reserve({ id, user_id: req.shooterId, storage_path: path, file_name: cleanFileName(req.fileName), meta: cleanMeta(req.meta) });
  if (!room) return { status: 429, error: 'inbox full' };
  return { status: 201, uploadId: id, path, token: await deps.signUpload(path) };
}

/**
 * Second step: the stored bytes decide what the file is; anything refused is removed. Only the caller that claims the
 * upload changes anything, so two confirmations at once cannot undo each other. An accepted file moves to a path of its
 * own: the token the browser wrote with covers the incoming path only, and what it may write there later is swept daily.
 */
export async function confirmUpload(uploadId: string, deps: UploadDeps): Promise<ConfirmResult> {
  const unknown = { status: 404, error: 'unknown upload' } as const;
  const up = await deps.findUpload(uploadId);
  if (!up) return unknown;
  const refuse = async <T extends ConfirmResult>(result: T): Promise<T | typeof unknown> => {
    if (!(await deps.claimUpload(up.id))) return unknown;
    await deps.removeObject(up.storage_path);
    return result;
  };
  if (!(await deps.allowed(up.user_id))) return refuse({ status: 403, error: 'not allowed' });
  const bytes = await deps.readObject(up.storage_path);
  // Not there (yet): the upload stays open, the daily job removes it if nothing comes.
  if (!bytes) return { status: 404, error: 'no file' };
  const kind = inboxKindOf(bytes);
  if (!kind) return refuse({ status: 415, error: 'not a SCATT, TCX, PDF or PRNX file' });
  if (bytes.length > MAX_UPLOAD_BYTES) return refuse({ status: 413, error: 'file too large' });

  if (!(await deps.claimUpload(up.id))) return unknown;
  const path = `${up.user_id}/${deps.newId()}`;
  await deps.moveObject(up.storage_path, path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  let accepted: 'ok' | 'duplicate' | 'full';
  try {
    accepted = await deps.acceptFile({ ...up, storage_path: path, kind, bytes: bytes.length, sha256 });
  } catch (e) {
    await deps.removeObject(path).catch(() => {});
    throw e;
  }
  if (accepted === 'ok') return { status: 201, kind };
  await deps.removeObject(path);
  return accepted === 'full' ? { status: 429, error: 'inbox full' } : { status: 409, error: 'already sent' };
}
