import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/** A `sius_links` row. Secrets are sealed (`v1:…`) and never leave server code. */
export interface SiusLinkRow {
  user_id: string;
  email: string;
  password_enc: string | null;
  refresh_token_enc: string | null;
  access_token_enc: string | null;
  access_expires_at: string | null;
  sius_user_id: string | null;
  broken_at: string | null;
  broken_reason: 'bad_password' | 'blocked' | 'unknown' | null;
  updated_at: string;
  last_ok_at?: string | null;
  connected_at?: string;
}

export interface SiusLinkStore {
  get(userId: string): Promise<SiusLinkRow | null>;
  /** Upsert of the given columns (a new row needs `email`); also bumps `updated_at`. */
  save(userId: string, patch: Partial<SiusLinkRow>): Promise<void>;
  remove(userId: string): Promise<void>;
  /** Password logins since `sinceMs`, for one user or (null) everyone. */
  countLogins(userId: string | null, sinceMs: number): Promise<number>;
  /** Records a password login attempt; returns its id. */
  recordLogin(userId: string): Promise<number>;
  /** Drops an attempt that was refused by the limits. */
  removeLogin(attemptId: number): Promise<void>;
}

/** Service-role store; null when the service key is not configured. */
export function supabaseSiusStore(): SiusLinkStore | null {
  const db = createAdminClient();
  if (!db) return null;
  return {
    async get(userId) {
      const { data, error } = await db.from('sius_links').select('*').eq('user_id', userId).maybeSingle();
      if (error) throw new Error(`sius_links read failed (${error.code})`);
      return (data as SiusLinkRow | null) ?? null;
    },
    async save(userId, patch) {
      const { error } = await db
        .from('sius_links')
        .upsert({ ...patch, user_id: userId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw new Error(`sius_links write failed (${error.code})`);
    },
    async remove(userId) {
      const { error } = await db.from('sius_links').delete().eq('user_id', userId);
      if (error) throw new Error(`sius_links delete failed (${error.code})`);
    },
    async countLogins(userId, sinceMs) {
      let q = db.from('sius_login_attempts').select('id', { count: 'exact', head: true }).gte('at', new Date(sinceMs).toISOString());
      if (userId) q = q.eq('user_id', userId);
      const { count, error } = await q;
      if (error) throw new Error(`sius_login_attempts read failed (${error.code})`);
      return count ?? 0;
    },
    async recordLogin(userId) {
      const { data, error } = await db.from('sius_login_attempts').insert({ user_id: userId }).select('id').single();
      if (error) throw new Error(`sius_login_attempts write failed (${error.code})`);
      // Keep the table small: only the last hour is ever counted.
      await db.from('sius_login_attempts').delete().lt('at', new Date(Date.now() - 2 * 3600_000).toISOString());
      return Number(data.id);
    },
    async removeLogin(attemptId) {
      await db.from('sius_login_attempts').delete().eq('id', attemptId);
    },
  };
}
