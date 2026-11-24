import 'server-only';
import { randomUUID } from 'node:crypto';
import type { createAdminClient } from '@/lib/supabase/admin';
import type { StartedUpload, UploadDeps } from './directUpload';

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
/** Who is uploading: a club's link, or a signed-in person. */
export type Uploader = { club_id: string } | { started_by: string };

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

export function uploadDeps(admin: Admin, who: Uploader, allowed: UploadDeps['allowed']): UploadDeps {
  const bucket = admin.storage.from('inbox');
  const [column, value] = 'club_id' in who ? (['club_id', who.club_id] as const) : (['started_by', who.started_by] as const);
  return {
    allowed,
    async reserve(u) {
      const { data, error } = await admin.rpc('reserve_inbox_upload', {
        p_id: u.id,
        p_user: u.user_id,
        p_club: 'club_id' in who ? who.club_id : null,
        p_by: 'started_by' in who ? who.started_by : null,
        p_name: u.file_name,
        p_meta: u.meta,
      });
      fail(error);
      return data === true;
    },
    async findUpload(id) {
      const { data, error } = await admin.from('inbox_uploads').select('id, user_id, storage_path, file_name, meta').eq('id', id).eq(column, value).maybeSingle();
      fail(error);
      return data as StartedUpload | null;
    },
    async claimUpload(id) {
      const { data, error } = await admin.from('inbox_uploads').delete().eq('id', id).eq(column, value).select('id');
      fail(error);
      return (data ?? []).length === 1;
    },
    async signUpload(path) {
      const { data, error } = await bucket.createSignedUploadUrl(path);
      if (error || !data) throw new Error(error?.message ?? 'not signed');
      return data.token;
    },
    async readObject(path) {
      const { data } = await bucket.download(path);
      return data ? new Uint8Array(await data.arrayBuffer()) : null;
    },
    async removeObject(path) {
      fail((await bucket.remove([path])).error);
    },
    async moveObject(from, to) {
      fail((await bucket.move(from, to)).error);
    },
    async acceptFile(f) {
      const { data, error } = await admin.rpc('accept_inbox_file', {
        p_id: f.id,
        p_user: f.user_id,
        p_kind: f.kind,
        p_path: f.storage_path,
        p_name: f.file_name,
        p_bytes: f.bytes,
        p_sha: f.sha256,
        p_meta: f.meta,
      });
      fail(error);
      if (data !== 'ok' && data !== 'duplicate' && data !== 'full') throw new Error('not accepted');
      return data;
    },
    newId: randomUUID,
  };
}
