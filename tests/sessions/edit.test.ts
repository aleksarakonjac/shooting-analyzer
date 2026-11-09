import { describe, expect, it } from 'vitest';
import { parseSessionEdit } from '@/lib/sessions/edit';

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

const base = {
  id: '00000000-0000-0000-0000-000000000001',
  name: ' Kontrolni ',
  place: 'Beograd',
  notes: '',
  kind: 'kontrolni',
  stage: 'kvalifikacije',
  tz: 'Asia/Almaty',
  when_date: '2026-11-09',
  when_from: '17:00',
  when_to: '19:00',
  event: 'Grand Prix',
};

describe('parseSessionEdit', () => {
  it('reads the session fields and the times in the venue zone', () => {
    const r = parseSessionEdit(form(base));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.patch).toMatchObject({
      name: 'Kontrolni',
      kind: 'kontrolni',
      stage: 'kvalifikacije',
      tz: 'Asia/Almaty',
      trained_on: '2026-11-09',
      started_at: '2026-11-09T12:00:00.000Z',
      ended_at: '2026-11-09T14:00:00.000Z',
    });
    expect(r.eventName).toBe('Grand Prix');
  });

  it('takes an end before the start as the next day', () => {
    const r = parseSessionEdit(form({ ...base, tz: 'Europe/Belgrade', when_from: '23:00', when_to: '01:00' }));
    expect(r.ok && r.patch.ended_at).toBe('2026-11-10T00:00:00.000Z');
  });

  it('clears the event for a plain training', () => {
    const r = parseSessionEdit(form({ ...base, kind: 'trening' }));
    expect(r.ok && r.eventName).toBe('');
  });

  it('rejects an unknown type, part or zone', () => {
    expect(parseSessionEdit(form({ ...base, kind: 'x' })).ok).toBe(false);
    expect(parseSessionEdit(form({ ...base, stage: 'x' })).ok).toBe(false);
    expect(parseSessionEdit(form({ ...base, tz: 'Mars/Base' })).ok).toBe(false);
    expect(parseSessionEdit(form({ ...base, when_date: '' })).ok).toBe(false);
  });
});
