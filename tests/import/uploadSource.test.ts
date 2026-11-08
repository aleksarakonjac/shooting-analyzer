import { describe, expect, it } from 'vitest';
import {
  MAX_UPLOAD_BYTES,
  UploadTooLargeError,
  sha256Hex,
  storagePath,
  uploadSource,
  type UploadDeps,
} from '../../src/lib/import/uploadSource';

function memory() {
  const rows: { id: string; training_id: string; sha256: string; storage_path: string }[] = [];
  const objects = new Set<string>();
  let n = 0;
  const deps: UploadDeps = {
    findBySha: async (t, sha) => rows.find((r) => r.training_id === t && r.sha256 === sha) ?? null,
    putObject: async (path) => {
      objects.add(path);
    },
    insertRow: async (row) => {
      if (rows.some((r) => r.training_id === row.training_id && r.sha256 === row.sha256)) return null;
      const r = { id: `row-${++n}`, ...row };
      rows.push(r);
      return { id: r.id };
    },
  };
  return { rows, objects, deps };
}

const file = (text: string, name = 'a.csv') => new File([text], name);

describe('sha256Hex', () => {
  it('matches the known digest of "abc"', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('storagePath', () => {
  it('is keyed by training and content, with an extension chosen by kind', () => {
    expect(storagePath('t1', 'abc', 'sius_csv')).toBe('t1/abc.csv');
    expect(storagePath('t1', 'abc', 'scatt')).toBe('t1/abc.scatt-expert');
    expect(storagePath('t1', 'abc', 'tcx')).toBe('t1/abc.tcx');
    expect(storagePath('t1', 'abc', 'sius_pdf')).toBe('t1/abc.pdf');
  });
});

describe('uploadSource', () => {
  it('stores a new file once', async () => {
    const m = memory();
    const r = await uploadSource(file('hello'), 't1', 'sius_csv', m.deps);
    expect(r.duplicate).toBe(false);
    expect(m.rows).toHaveLength(1);
    expect(m.objects.size).toBe(1);
  });

  it('flags the same file in the same training as a duplicate and stores nothing twice', async () => {
    const m = memory();
    const first = await uploadSource(file('hello'), 't1', 'sius_csv', m.deps);
    const second = await uploadSource(file('hello', 'renamed.csv'), 't1', 'sius_csv', m.deps);
    expect(second).toEqual({ id: first.id, duplicate: true });
    expect(m.rows).toHaveLength(1);
    expect(m.objects.size).toBe(1);
  });

  it('accepts the same file in a different training', async () => {
    const m = memory();
    await uploadSource(file('hello'), 't1', 'sius_csv', m.deps);
    const r = await uploadSource(file('hello'), 't2', 'sius_csv', m.deps);
    expect(r.duplicate).toBe(false);
    expect(m.rows).toHaveLength(2);
  });

  it('resolves a lost race (unique violation on insert) to the winner row', async () => {
    const m = memory();
    let calls = 0;
    const deps: UploadDeps = {
      ...m.deps,
      findBySha: async (t, sha) => (calls++ === 0 ? null : (m.rows.find((r) => r.training_id === t && r.sha256 === sha) ?? null)),
      insertRow: async (row) => {
        m.rows.push({ id: 'winner', ...row });
        return null;
      },
    };
    const r = await uploadSource(file('x'), 't1', 'tcx', deps);
    expect(r).toEqual({ id: 'winner', duplicate: true });
  });

  it('rejects files over 25 MB before reading or storing anything', async () => {
    const m = memory();
    const big = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'big.scatt-expert');
    await expect(uploadSource(big, 't1', 'scatt', m.deps)).rejects.toBeInstanceOf(UploadTooLargeError);
    expect(m.rows).toHaveLength(0);
    expect(m.objects.size).toBe(0);
  });

  it('accepts a file of exactly 25 MB', async () => {
    const m = memory();
    const edge = new File([new Uint8Array(MAX_UPLOAD_BYTES)], 'edge.scatt-expert');
    expect((await uploadSource(edge, 't1', 'scatt', m.deps)).duplicate).toBe(false);
  });
});
