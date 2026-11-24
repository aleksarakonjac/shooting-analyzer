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
  const count = async (table: 'inbox_files' | 'inbox_uploads', userId: string) => {
    const { count: n, error } = await admin.from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId);
    fail(error);
    return n ?? 0;
  };
  return {
    allowed,
    waiting: async (id) => (await count('inbox_files', id)) + (await count('inbox_uploads', id)),
    async insertUpload(u) {
      fail((await admin.from('inbox_uploads').insert({ ...u, ...who })).error);
    },
    async findUpload(id) {
      const { data, error } = await admin.from('inbox_uploads').select('id, user_id, storage_path, file_name, meta').eq('id', id).eq(column, value).maybeSingle();
      fail(error);
      return data as StartedUpload | null;
    },
    async deleteUpload(id) {
      fail((await admin.from('inbox_uploads').delete().eq('id', id)).error);
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
    async insertFile(f) {
      const { error } = await admin.from('inbox_files').insert(f);
      if (error?.code === '23505') return 'duplicate';
      fail(error);
      return 'ok';
    },
    newId: randomUUID,
  };
}
