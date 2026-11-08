import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShotTimeline } from '../../src/components/ShotTimeline';
import { GroupPlot } from '../../src/components/GroupPlot';
import { HrChart } from '../../src/components/HrChart';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('ShotTimeline', () => {
  const shots = [
    { idx: 1, value: 10.6, tMs: 1000 },
    { idx: 2, value: 9.1, tMs: 31000 },
    { idx: 3, value: 10.2, tMs: null },
  ];
  it('draws one marker per shot with the value in its label', () => {
    const out = html(<ShotTimeline shots={shots} decimal />);
    expect(out.match(/data-shot=/g)).toHaveLength(3);
    expect(out).toContain('10.6');
    expect(out).toContain('role="img"');
  });
  it('is an empty state for no shots', () => {
    expect(html(<ShotTimeline shots={[]} decimal />)).toContain('Nema pogodaka');
  });
});

describe('GroupPlot', () => {
  it('states MPI numbers and direction in words, not only by drawing', () => {
    const out = html(<GroupPlot mpi={{ x: -0.5, y: -0.4 }} groupMm={8} />);
    expect(out).toContain('8.0 mm');
    expect(out).toContain('0.5 mm levo');
    expect(out).toContain('0.4 mm dole');
  });
  it('shows a notice when the series has no MPI', () => {
    expect(html(<GroupPlot mpi={null} groupMm={null} />)).toContain('Nema podataka o grupi');
  });
});

describe('HrChart', () => {
  it('says "nema pulsa" for no samples', () => {
    expect(html(<HrChart samples={[]} />)).toContain('nema pulsa');
  });
  it('shows average, min and max and a line for samples', () => {
    const out = html(<HrChart samples={[{ tMs: 0, bpm: 80 }, { tMs: 1000, bpm: 100 }]} />);
    expect(out).toContain('90');
    expect(out).toContain('<polyline');
    expect(out).not.toContain('nema pulsa');
  });
});
