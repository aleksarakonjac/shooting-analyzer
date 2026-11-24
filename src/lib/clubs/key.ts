const LETTERS: Record<string, string> = { đ: 'd', љ: 'lj', њ: 'nj', џ: 'dz', ђ: 'd' };
const CYRILLIC = 'абвгдежзијклмнопрстћуфхцчш';
const LATIN = 'abvgdezzijklmnoprstcufhccs';
[...CYRILLIC].forEach((c, i) => {
  LETTERS[c] = LATIN[i];
});

/** One spelling per club, the same as club_key() in the database: script, diacritics, case and spaces do not count. */
export function clubKey(name: string): string {
  return [...name.normalize('NFC').toLowerCase()]
    .map((c) => LETTERS[c] ?? ({ č: 'c', ć: 'c', š: 's', ž: 'z' } as Record<string, string>)[c] ?? c)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
