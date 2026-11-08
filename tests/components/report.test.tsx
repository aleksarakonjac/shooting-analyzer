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

import { TrendChart } from '../../src/components/TrendChart';

describe('TrendChart', () => {
  const buckets = [
    { label: 'pon', value: 100.5 },
    { label: 'uto', value: null },
    { label: 'sre', value: 102 },
  ];
  it('draws a marker only for buckets with data and labels the axis', () => {
    const out = html(<TrendChart title="Prosek serije" buckets={buckets} />);
    expect(out.match(/data-point=/g)).toHaveLength(2);
    expect(out).toContain('pon');
    expect(out).toContain('Prosek serije');
    expect(out).toContain('role="img"');
  });
  it('is an empty state when no bucket has data', () => {
    const out = html(<TrendChart title="Prosek serije" buckets={[{ label: 'pon', value: null }]} />);
    expect(out).toContain('Nema podataka za ovaj period.');
    expect(out).not.toContain('data-point');
  });
});
