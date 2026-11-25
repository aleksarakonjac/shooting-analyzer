import { createClient } from '@/lib/supabase/client';

export type SourceKind = 'sius_csv' | 'sius_pdf' | 'sius_prnx' | 'sius_html' | 'sius_cloud' | 'scatt' | 'tcx';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export class UploadTooLargeError extends Error {
  constructor() {
    super('File is larger than 25 MB');
    this.name = 'UploadTooLargeError';
  }
}

export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const EXT: Record<SourceKind, string> = { sius_csv: 'csv', sius_pdf: 'pdf', sius_prnx: 'prnx', sius_html: 'html', sius_cloud: 'json', scatt: 'scatt-expert', tcx: 'tcx' };

/** Content-addressed path inside the training's folder (the storage policies key on the folder). */
export const storagePath = (trainingId: string, sha: string, kind: SourceKind) => `${trainingId}/${sha}.${EXT[kind]}`;

export interface SourceRow {
  training_id: string;
  kind: SourceKind;
  storage_path: string;
  sha256: string;
  bytes: number;
  /** SIUS Cloud only: exercise id or comp:<partId>:<athleteRunningId>, for "already imported" and duplicates. */
  external_id?: string;
  first_shot_at?: string | null;
  shot_count?: number;
}

/** What a SIUS Cloud source carries besides the file. */
export interface SourceMeta {
  externalId: string;
  firstShotAt: string | null;
  shotCount: number;
}

export interface UploadDeps {
  findBySha(trainingId: string, sha: string): Promise<{ id: string } | null>;
  /** Idempotent: an object that already exists at the path is not an error. */
  putObject(path: string, file: File): Promise<void>;
  /** Returns null when the row already exists (unique violation). */
  insertRow(row: SourceRow): Promise<{ id: string } | null>;
}

function supabaseDeps(): UploadDeps {
  const supabase = createClient();
  return {
    async findBySha(trainingId, sha) {
      const { data } = await supabase.from('source_files').select('id').eq('training_id', trainingId).eq('sha256', sha).maybeSingle();
      return data ? { id: data.id as string } : null;
    },
    async putObject(path, file) {
      const { error } = await supabase.storage.from('source-files').upload(path, file, { upsert: false });
      if (error && !/already exists|Duplicate/i.test(error.message)) throw new Error(error.message);
    },
    async insertRow(row) {
      const { data, error } = await supabase.from('source_files').insert(row).select('id').single();
      if (error) {
        if (error.code === '23505') return null;
        throw new Error(error.message);
      }
      return { id: data.id as string };
    },
  };
}

/**
 * Stores an original file for a training, once. The same content (SHA-256) in the same
 * training is a duplicate: nothing is uploaded again and the existing row is returned.
 */
export async function uploadSource(
  file: File,
  trainingId: string,
  kind: SourceKind,
  deps: UploadDeps = supabaseDeps(),
  meta?: SourceMeta,
): Promise<{ id: string; duplicate: boolean }> {
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadTooLargeError();

  const sha = await sha256Hex(await file.arrayBuffer());
  const existing = await deps.findBySha(trainingId, sha);
  if (existing) return { id: existing.id, duplicate: true };

  const path = storagePath(trainingId, sha, kind);
  await deps.putObject(path, file);
  const row = await deps.insertRow({
    training_id: trainingId,
    kind,
    storage_path: path,
    sha256: sha,
    bytes: file.size,
    ...(meta ? { external_id: meta.externalId, first_shot_at: meta.firstShotAt, shot_count: meta.shotCount } : {}),
  });
  if (row) return { id: row.id, duplicate: false };

  // Lost a race with a concurrent upload of the same file: return the winner.
  const winner = await deps.findBySha(trainingId, sha);
  if (!winner) throw new Error('Source file row vanished');
  return { id: winner.id, duplicate: true };
}
