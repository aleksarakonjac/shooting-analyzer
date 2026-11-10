import { describe, expect, it } from 'vitest';
import { requireOne, requireUuid } from '@/lib/actionGuard';

describe('requireUuid', () => {
  it('accepts a uuid from a form field', () => {
    expect(requireUuid('2fec168c-d484-49bb-ac0d-a7dea1d8d3bc')).toBe('2fec168c-d484-49bb-ac0d-a7dea1d8d3bc');
  });
  it('rejects anything else before it reaches the database', () => {
    for (const v of [null, '', 'abc', '2fec168c-d484-49bb-ac0d-a7dea1d8d3bc,x', new File([], 'f')]) {
      expect(() => requireUuid(v as FormDataEntryValue | null)).toThrow('Invalid id');
    }
  });
});

describe('requireOne', () => {
  it('passes when a row changed', () => {
    expect(() => requireOne({ data: [{ id: 'a' }], error: null })).not.toThrow();
  });
  it('fails on an error or when no row changed (missing, or not allowed by row-level security)', () => {
    expect(() => requireOne({ data: null, error: { message: 'boom' } })).toThrow('boom');
    expect(() => requireOne({ data: [], error: null })).toThrow('Nothing was changed');
    expect(() => requireOne({ data: null, error: null })).toThrow('Nothing was changed');
  });
});
