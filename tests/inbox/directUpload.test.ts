import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cleanMeta, clubToken, confirmUpload, startUpload, type StartedUpload, type UploadDeps } from '@/lib/inbox/directUpload';
import { MAX_UPLOAD_BYTES } from '@/lib/import/uploadSource';

const PRNX = new Uint8Array(readFileSync('tests/fixtures/2026-11-11T195109.prnx'));
const SIUS = { sius: { discipline: 'Air Rifle 60', total: 628.8, shots: 60, atMs: Date.parse('2026-11-11T18:51:09Z') } };

function setup(over: Partial<UploadDeps> = {}) {
  const uploads = new Map<string, StartedUpload>();
  const objects = new Map<string, Uint8Array>();
  const files: Record<string, unknown>[] = [];
  let n = 0;
  const deps: UploadDeps = {
    allowed: async (id) => id === 's1',
    reserve: async (u) => {
      uploads.set(u.id, u);
      return true;
    },
    findUpload: async (id) => uploads.get(id) ?? null,
    claimUpload: async (id) => uploads.delete(id),
    signUpload: async (path) => `sig:${path}`,
    readObject: async (path) => objects.get(path) ?? null,
    removeObject: async (path) => void objects.delete(path),
    moveObject: async (from, to) => {
      const b = objects.get(from);
      if (!b || objects.has(to)) throw new Error('move');
      objects.delete(from);
      objects.set(to, b);
    },
    acceptFile: async (f) => {
      if (files.some((x) => x.sha256 === f.sha256 && x.user_id === f.user_id)) return 'duplicate';
      files.push({ ...f });
      return 'ok';
    },
    newId: () => `id${++n}`,
    ...over,
  };
  return { deps, uploads, objects, files };
}

const req = (over = {}) => ({ shooterId: 's1', fileName: 'a.prnx', bytes: 10, meta: SIUS as unknown, ...over });

/** Starts an upload and puts the bytes where the browser would. */
async function started(s: ReturnType<typeof setup>, bytes: Uint8Array | null = PRNX) {
  const r = await startUpload(req(), s.deps);
  if (r.status !== 201) throw new Error('not started');
  if (bytes) s.objects.set(r.path, bytes);
  return r;
}

describe('startUpload', () => {
  it('gives a path the server chose and a signature for it', async () => {
    const s = setup();
    const r = await startUpload(req({ fileName: '../../x/evil.prnx' }), s.deps);
    expect(r).toEqual({ status: 201, uploadId: 'id1', path: 'incoming/id1', token: 'sig:incoming/id1' });
    expect(s.uploads.get('id1')).toMatchObject({ user_id: 's1', storage_path: 'incoming/id1', file_name: 'evil.prnx', meta: SIUS });
  });

  it('refuses someone who is not on the list, a full inbox and a too large or empty file', async () => {
    expect((await startUpload(req({ shooterId: 's2' }), setup().deps)).status).toBe(403);
    expect((await startUpload(req(), setup({ reserve: async () => false }).deps)).status).toBe(429);
    expect((await startUpload(req({ bytes: MAX_UPLOAD_BYTES + 1 }), setup().deps)).status).toBe(413);
    for (const bytes of [0, -1, 1.5, Number.NaN, '5' as unknown as number]) expect((await startUpload(req({ bytes }), setup().deps)).status).toBe(400);
  });
});

describe('confirmUpload', () => {
  it('takes kind, size and sha from the stored bytes', async () => {
    const s = setup();
    const r = await started(s);
    expect(await confirmUpload(r.uploadId, s.deps)).toEqual({ status: 201, kind: 'sius_prnx' });
    expect(s.files).toEqual([
      { id: 'id1', user_id: 's1', kind: 'sius_prnx', storage_path: 's1/id2', file_name: 'a.prnx', bytes: PRNX.length, sha256: createHash('sha256').update(PRNX).digest('hex'), meta: SIUS },
    ]);
    expect(s.uploads.size).toBe(0);
    // At a path the sender's signed token does not cover.
    expect([...s.objects.keys()]).toEqual(['s1/id2']);
  });

  it('two confirmations at once accept one file and leave its object alone', async () => {
    const s = setup();
    const r = await started(s);
    const both = await Promise.all([confirmUpload(r.uploadId, s.deps), confirmUpload(r.uploadId, s.deps)]);
    expect(both.map((x) => x.status).sort()).toEqual([201, 404]);
    expect(s.files).toHaveLength(1);
    expect([...s.objects.keys()]).toEqual([s.files[0].storage_path]);
  });

  it('a full inbox at confirmation keeps nothing', async () => {
    const s = setup({ acceptFile: async () => 'full' });
    const r = await started(s);
    expect((await confirmUpload(r.uploadId, s.deps)).status).toBe(429);
    expect([s.objects.size, s.uploads.size]).toEqual([0, 0]);
  });

  it('does not know an upload started by someone else', async () => {
    expect((await confirmUpload('nope', setup().deps)).status).toBe(404);
  });

  it('refuses and cleans up when the shooter left the club meanwhile', async () => {
    const s = setup();
    const r = await started(s);
    s.deps.allowed = async () => false;
    expect((await confirmUpload(r.uploadId, s.deps)).status).toBe(403);
    expect([s.objects.size, s.uploads.size, s.files.length]).toEqual([0, 0, 0]);
  });

  it('refuses and cleans up what the inbox does not take', async () => {
    const s = setup();
    const r = await started(s, new TextEncoder().encode('<html>'));
    expect((await confirmUpload(r.uploadId, s.deps)).status).toBe(415);
    expect([s.objects.size, s.uploads.size, s.files.length]).toEqual([0, 0, 0]);
  });

  it('says when the same file is already there, and keeps one copy', async () => {
    const s = setup();
    await confirmUpload((await started(s)).uploadId, s.deps);
    const again = await started(s);
    expect((await confirmUpload(again.uploadId, s.deps)).status).toBe(409);
    expect([s.objects.size, s.uploads.size, s.files.length]).toEqual([1, 0, 1]);
  });

  it('can be confirmed later when the object is not there yet', async () => {
    const s = setup();
    const r = await started(s, null);
    expect((await confirmUpload(r.uploadId, s.deps)).status).toBe(404);
    s.objects.set(r.path, PRNX);
    expect((await confirmUpload(r.uploadId, s.deps)).status).toBe(201);
  });
});

describe('cleanMeta', () => {
  const T = Date.parse('2026-11-11T10:00:00Z');
  it('keeps the known shapes', () => {
    expect(cleanMeta(SIUS)).toEqual(SIUS);
    expect(cleanMeta({ scatt: { shots: 3, startMs: T, endMs: T + 1, extra: 'x' }, other: 1 })).toEqual({ scatt: { shots: 3, startMs: T, endMs: T + 1 } });
    expect(cleanMeta({ sius: { ...SIUS.sius, atMs: null } })).toEqual({ sius: { ...SIUS.sius, atMs: null } });
  });
  it('drops times and counts that cannot be, which would break the pages that show them', () => {
    for (const ms of [1e300, -1e300, 8.65e15, 0, Date.now() + 3 * 86_400_000]) {
      expect(cleanMeta({ sius: { ...SIUS.sius, atMs: ms } })).toBeNull();
      expect(cleanMeta({ scatt: { shots: 1, startMs: ms, endMs: T } })).toBeNull();
      expect(cleanMeta({ scatt: { shots: 1, startMs: T, endMs: ms } })).toBeNull();
    }
    expect(cleanMeta({ sius: { ...SIUS.sius, shots: 1e9 } })).toBeNull();
    expect(cleanMeta({ sius: { ...SIUS.sius, total: -1 } })).toBeNull();
  });
  it('drops everything else and caps text', () => {
    for (const bad of [null, 1, 'x', [], {}, { sius: { total: 'x' } }, { scatt: { shots: Infinity, startMs: 1, endMs: 2 } }]) expect(cleanMeta(bad)).toBeNull();
    const long = cleanMeta({ sius: { ...SIUS.sius, discipline: 'a'.repeat(500) } }) as typeof SIUS;
    expect(long.sius.discipline).toHaveLength(80);
  });
});

describe('clubToken', () => {
  it('reads only a well-formed bearer token', () => {
    const t = `ub_${'0a'.repeat(32)}`;
    expect(clubToken(`Bearer ${t}`)).toBe(t);
    for (const h of [null, t, `Bearer ${t}0`, 'Bearer sa_x', `Basic ${t}`]) expect(clubToken(h)).toBeNull();
  });
});
