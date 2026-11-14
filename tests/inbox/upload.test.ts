import { describe, expect, it, vi } from 'vitest';
import { acceptInboxFile, cleanFileName, isScattBytes, MAX_WAITING, type InboxDeps } from '../../src/lib/inbox/upload';
import { bearerToken, hashInboxToken, newInboxToken } from '../../src/lib/inbox/token';
import { MAX_UPLOAD_BYTES } from '../../src/lib/import/uploadSource';

const sqlite = (n = 64) => {
  const b = new Uint8Array(n);
  b.set(new TextEncoder().encode('SQLite format 3\0'));
  return b;
};

function deps(over: Partial<InboxDeps> = {}): InboxDeps & { rows: unknown[]; objects: string[] } {
  const rows: unknown[] = [];
  const objects: string[] = [];
  return {
    rows,
    objects,
    ownerOf: async (h) => (h === 'good' ? { userId: 'u1', tokenId: 't1' } : null),
    waiting: async () => 0,
    putObject: async (p) => void objects.push(p),
    insertRow: async (r) => void rows.push(r),
    removeObject: async (p) => void objects.splice(objects.indexOf(p), 1),
    touchToken: async () => {},
    newId: () => 'id1',
    ...over,
  };
}

describe('tokens', () => {
  it('round-trips through the bearer header and hashes to hex', () => {
    const tok = newInboxToken();
    expect(bearerToken(`Bearer ${tok}`)).toBe(tok);
    expect(hashInboxToken(tok)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('rejects malformed headers', () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken('Bearer abc')).toBeNull();
    expect(bearerToken(`Basic ${newInboxToken()}`)).toBeNull();
  });
});

describe('file checks', () => {
  it('recognises the SQLite header', () => {
    expect(isScattBytes(sqlite())).toBe(true);
    expect(isScattBytes(new TextEncoder().encode('PK\x03\x04 not sqlite at all'))).toBe(false);
  });
  it('cleans names', () => {
    expect(cleanFileName('../../etc/export.scatt-expert')).toBe('export.scatt-expert');
    expect(cleanFileName('a\u0000b')).toBe('ab');
    expect(cleanFileName('')).toBe('scatt.scatt-expert');
  });
});

describe('acceptInboxFile', () => {
  it('stores a valid file under the owner folder', async () => {
    const d = deps();
    const r = await acceptInboxFile('good', { name: 'x.scatt-expert', bytes: sqlite() }, d);
    expect(r).toEqual({ status: 201, id: 'id1' });
    expect(d.objects).toEqual(['u1/id1.scatt-expert']);
    expect(d.rows).toEqual([{ id: 'id1', user_id: 'u1', storage_path: 'u1/id1.scatt-expert', file_name: 'x.scatt-expert', bytes: 64 }]);
  });
  it('refuses unknown tokens before anything else', async () => {
    const d = deps();
    expect((await acceptInboxFile('bad', { name: null, bytes: sqlite() }, d)).status).toBe(401);
    expect((await acceptInboxFile(null, null, d)).status).toBe(401);
    expect(d.objects).toEqual([]);
  });
  it('refuses empty, oversized, non-SCATT and over-quota uploads', async () => {
    expect((await acceptInboxFile('good', null, deps())).status).toBe(400);
    expect((await acceptInboxFile('good', { name: null, bytes: sqlite(MAX_UPLOAD_BYTES + 1) }, deps())).status).toBe(413);
    expect((await acceptInboxFile('good', { name: null, bytes: new Uint8Array(64) }, deps())).status).toBe(415);
    expect((await acceptInboxFile('good', { name: null, bytes: sqlite() }, deps({ waiting: async () => MAX_WAITING }))).status).toBe(429);
  });
  it('removes the stored object when the row cannot be written', async () => {
    const d = deps({ insertRow: async () => { throw new Error('db'); } });
    expect((await acceptInboxFile('good', { name: null, bytes: sqlite() }, d)).status).toBe(500);
    expect(d.objects).toEqual([]);
  });
  it('still succeeds when touching the token fails', async () => {
    const touch = vi.fn(async () => { throw new Error('x'); });
    expect((await acceptInboxFile('good', { name: null, bytes: sqlite() }, deps({ touchToken: touch }))).status).toBe(201);
  });
});
