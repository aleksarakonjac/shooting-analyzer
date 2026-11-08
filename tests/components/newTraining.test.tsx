import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MismatchNotice } from '../../src/components/MismatchNotice';
import { MatchSelector } from '../../src/components/MatchSelector';
import { SourceCard } from '../../src/components/SourceCard';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('MismatchNotice', () => {
  it('says the counts match for 0, as a status', () => {
    const out = html(<MismatchNotice mismatch={0} />);
    expect(out).toContain('Broj pogodaka se poklapa.');
    expect(out).toContain('data-state="ok"');
    expect(out).toContain('role="status"');
  });

  it('names how many SIUS shots are unpaired for a positive mismatch, as an alert', () => {
    const out = html(<MismatchNotice mismatch={3} />);
    expect(out).toContain('SIUS ima 3 pogodaka više');
    expect(out).toContain('role="alert"');
  });

  it('names the surplus SCATT shots for a negative mismatch', () => {
    expect(html(<MismatchNotice mismatch={-2} />)).toContain('Izabrano je 2 SCATT pogodaka više');
  });
});

describe('MatchSelector', () => {
  const shots = [{ id: 11, tMs: 1, flaggedMatch: true }, { id: 12, tMs: 2, flaggedMatch: true }];

  it('offers three modes and none is checked without a selection', () => {
    const out = html(<MatchSelector shots={shots} selection={undefined} onChange={() => {}} />);
    expect(out.match(/type="radio"/g)).toHaveLength(3);
    expect(out).not.toContain('checked');
    expect(out).toContain('Poslednjih');
    expect(out).toContain('Prvih');
    expect(out).toContain('Od pogotka broj');
  });

  it('checks the mode of the current selection and shows its count', () => {
    const out = html(<MatchSelector shots={shots} selection={{ kind: 'first', n: 2 }} onChange={() => {}} />);
    expect(out.match(/checked/g)).toHaveLength(1);
    expect(out).toMatch(/value="2"/);
  });
});

describe('SourceCard', () => {
  it('shows title, hint, content and an alert on error', () => {
    const out = html(
      <SourceCard title="SCATT zapis" hint="Pomoć" error="Greška">
        <span>sadržaj</span>
      </SourceCard>,
    );
    expect(out).toContain('SCATT zapis');
    expect(out).toContain('Pomoć');
    expect(out).toContain('sadržaj');
    expect(out).toContain('role="alert"');
  });
});
