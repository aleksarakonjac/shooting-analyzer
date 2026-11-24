import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { acceptInboxFile, cleanFileName, inboxKindOf, isScattBytes, MAX_BODY_BYTES, MAX_WAITING, readCapped, type InboxDeps, type ReadOutcome } from '../../src/lib/inbox/upload';
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
  it('tells SCATT from TCX by content', () => {
    const tcx = new Uint8Array(readFileSync('samples/4740240563405875576.tcx'));
    expect(inboxKindOf(tcx)).toBe('tcx');
    expect(inboxKindOf(new TextEncoder().encode('\uFEFF  <TrainingCenterDatabase xmlns="x">'))).toBe('tcx');
    expect(inboxKindOf(sqlite())).toBe('scatt');
    expect(inboxKindOf(new Uint8Array(readFileSync('samples/50m Rifle 3x20.pdf')))).toBe('sius_pdf');
    expect(inboxKindOf(new TextEncoder().encode('<html><body>TrainingCenterDatabase</body></html>'))).toBeNull();
    expect(inboxKindOf(new Uint8Array(readFileSync('tests/fixtures/2026-11-11T195109.prnx')))).toBe('sius_prnx');
    expect(inboxKindOf(new Uint8Array(readFileSync('tests/fixtures/2026-11-22T173807.html')))).toBeNull();
  });
  it('stores a TCX file with its own extension and kind', async () => {
    const d = deps();
    const r = await acceptInboxFile('good', null, async () => ({ name: null, bytes: new TextEncoder().encode('<?xml version="1.0"?><TrainingCenterDatabase>') }), d);
    expect(r).toEqual({ status: 201, id: 'id1', kind: 'tcx' });
    expect(d.objects).toEqual(['u1/id1.tcx']);
    expect(d.rows[0]).toMatchObject({ kind: 'tcx', file_name: 'tcx.tcx' });
  });
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

const read = (f: ReadOutcome) => vi.fn(async () => f);

describe('acceptInboxFile', () => {
  it('never reads the body for a missing or unknown token', async () => {
    const body = read({ name: null, bytes: sqlite() });
    expect((await acceptInboxFile(null, 10, body, deps())).status).toBe(401);
    expect((await acceptInboxFile('bad', 10, body, deps())).status).toBe(401);
    expect(body).not.toHaveBeenCalled();
  });
  it('refuses an oversized declared length before reading', async () => {
    const body = read({ name: null, bytes: sqlite() });
    expect((await acceptInboxFile('good', MAX_BODY_BYTES + 1, body, deps())).status).toBe(413);
    expect(body).not.toHaveBeenCalled();
  });
  it('refuses a body that passed the cap while streaming', async () => {
    expect((await acceptInboxFile('good', null, read('too large'), deps())).status).toBe(413);
  });

  it('stores a valid file under the owner folder', async () => {
    const d = deps();
    const r = await acceptInboxFile('good', null, read({ name: 'x.scatt-expert', bytes: sqlite() }), d);
    expect(r).toEqual({ status: 201, id: 'id1', kind: 'scatt' });
    expect(d.objects).toEqual(['u1/id1.scatt-expert']);
    expect(d.rows).toEqual([{ id: 'id1', user_id: 'u1', kind: 'scatt', storage_path: 'u1/id1.scatt-expert', file_name: 'x.scatt-expert', bytes: 64 }]);
  });
  it('refuses unknown tokens before anything else', async () => {
    const d = deps();
    expect((await acceptInboxFile('bad', null, read({ name: null, bytes: sqlite() }), d)).status).toBe(401);
    expect((await acceptInboxFile(null, null, read(null), d)).status).toBe(401);
    expect(d.objects).toEqual([]);
  });
  it('refuses empty, oversized, non-SCATT and over-quota uploads', async () => {
    expect((await acceptInboxFile('good', null, read(null), deps())).status).toBe(400);
    expect((await acceptInboxFile('good', null, read({ name: null, bytes: sqlite(MAX_UPLOAD_BYTES + 1) }), deps())).status).toBe(413);
    expect((await acceptInboxFile('good', null, read({ name: null, bytes: new Uint8Array(64) }), deps())).status).toBe(415);
    expect((await acceptInboxFile('good', null, read({ name: null, bytes: sqlite() }), deps({ waiting: async () => MAX_WAITING }))).status).toBe(429);
  });
  it('removes the stored object when the row cannot be written', async () => {
    const d = deps({ insertRow: async () => { throw new Error('db'); } });
    expect((await acceptInboxFile('good', null, read({ name: null, bytes: sqlite() }), d)).status).toBe(500);
    expect(d.objects).toEqual([]);
  });
  it('still succeeds when touching the token fails', async () => {
    const touch = vi.fn(async () => { throw new Error('x'); });
    expect((await acceptInboxFile('good', null, read({ name: null, bytes: sqlite() }), deps({ touchToken: touch }))).status).toBe(201);
  });
});

describe('readCapped', () => {
  const stream = (sizes: number[]) => {
    let cancelled = false;
    const s = new ReadableStream<Uint8Array>({
      pull(c) {
        const n = sizes.shift();
        if (n === undefined) c.close();
        else c.enqueue(new Uint8Array(n).fill(7));
      },
      cancel() { cancelled = true; },
    });
    return { s, cancelled: () => cancelled };
  };
  it('joins chunks under the limit', async () => {
    const out = await readCapped(stream([3, 4]).s, 10);
    expect(out).toEqual(new Uint8Array(7).fill(7));
  });
  it('stops and cancels once past the limit', async () => {
    const st = stream([6, 6, 6]);
    expect(await readCapped(st.s, 10)).toBe('too large');
    expect(st.cancelled()).toBe(true);
  });
});
