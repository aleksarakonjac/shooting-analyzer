import { describe, expect, it } from 'vitest';
import { findMyRow, partLocalDate, sessionNameFor, stageFromPartName } from '@/lib/sius/pick';
import type { RankingRow } from '@/lib/sius/types';

const row = (displayName: string, identifier: string): RankingRow => ({
  athleteRunningId: `run-${identifier}`, identifier, displayName, nation: 'SRB', rank: '1', total: '600.0', seriesTotals: [],
});
const ranking = [row('SHENG Lihao', 'SHCHNM0412200401'), row('RAKONJAC Aleksa', 'SHSRBM0101200001'), row('RAKONJAC Marko', 'SHSRBM0202200002')];

describe('partLocalDate', () => {
  it('part date in competition time zone', () => {
    expect(partLocalDate('2026-10-31T21:00:00Z', 'Asia/Qatar')).toBe('2026-11-01');
    expect(partLocalDate('2026-11-03T09:15:00+03:00', 'Asia/Qatar')).toBe('2026-11-03');
  });
  it('unknown zone falls back to the UTC date', () => {
    expect(partLocalDate('2026-10-31T21:00:00Z', 'Not/AZone')).toBe('2026-10-31');
  });
});

describe('stageFromPartName', () => {
  it('maps SIUS part names', () => {
    expect(stageFromPartName('Qualification')).toBe('kvalifikacije');
    expect(stageFromPartName('Final')).toBe('finale');
    expect(stageFromPartName('FINAL')).toBe('finale');
    expect(stageFromPartName('Elimination')).toBe('eliminacije');
    expect(stageFromPartName('Pre-Event Training')).toBe('eliminacije');
    expect(stageFromPartName('Medal Match')).toBeNull();
  });
});

describe('sessionNameFor', () => {
  it('competition, ZeroIn discipline label, ZeroIn stage label', () => {
    expect(sessionNameFor('ISSF World Championship Doha', '10m AIR RIFLE MEN', 'Qualification')).toBe('ISSF World Championship Doha Vazdušna puška Kvalifikacije');
    expect(sessionNameFor('ISSF World Cup', '50m RIFLE 3 POSITIONS MEN', 'Final')).toBe('ISSF World Cup MK puška trostav Finale');
  });
  it('unknown event and part names pass through unchanged', () => {
    expect(sessionNameFor('GP', '25m RAPID FIRE PISTOL MEN', 'Stage 1')).toBe('GP 25m RAPID FIRE PISTOL MEN Stage 1');
  });
});

describe('findMyRow', () => {
  it('matches by identifier first', () => {
    expect(findMyRow(ranking, 'SHSRBM0202200002', 'Aleksa Rakonjac')?.displayName).toBe('RAKONJAC Marko');
  });
  it('findMyRow without id never guesses on partial name', () => {
    expect(findMyRow(ranking, null, 'Rakonjac')).toBeNull();
    expect(findMyRow(ranking, null, 'RAKONJAC')).toBeNull();
    expect(findMyRow(ranking, null, 'Aleksa Rakonjac')?.identifier).toBe('SHSRBM0101200001');
    expect(findMyRow(ranking, null, 'aleksa  RAKONJAC ')?.identifier).toBe('SHSRBM0101200001');
  });
  it('ignores diacritics and an unknown id falls back to the exact name', () => {
    const r = [row('ĐOKOVIĆ Šime', 'X1')];
    expect(findMyRow(r, 'NOPE', 'Sime Djokovic')).toBeNull();
    expect(findMyRow(r, 'NOPE', 'Šime Đoković')?.identifier).toBe('X1');
  });
  it('two rows with the same name → no guess', () => {
    expect(findMyRow([row('PETROVIC Ana', 'A'), row('PETROVIC Ana', 'B')], null, 'Ana Petrovic')).toBeNull();
  });
  it('empty name never matches', () => {
    expect(findMyRow(ranking, null, '  ')).toBeNull();
  });
});
