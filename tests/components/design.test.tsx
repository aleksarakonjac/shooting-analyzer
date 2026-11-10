import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FlagBadge } from '../../src/components/FlagBadge';
import { LanePlate } from '../../src/components/LanePlate';
import { StateLine } from '../../src/components/StateLine';
import { AppShell } from '../../src/components/AppShell';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('FlagBadge', () => {
  it('says "Predloženo" with a pennant marker for proposed', () => {
    const out = html(<FlagBadge state="proposed" />);
    expect(out).toContain('Predloženo');
    expect(out).toContain('data-marker="pennant"');
    expect(out).toContain('data-state="proposed"');
  });

  it('says "Potvrđeno" with a check marker for confirmed', () => {
    const out = html(<FlagBadge state="confirmed" />);
    expect(out).toContain('Potvrđeno');
    expect(out).toContain('data-marker="check"');
    expect(out).not.toContain('data-marker="pennant"');
  });
});

describe('LanePlate', () => {
  it('renders label, value and unit', () => {
    const out = html(<LanePlate label="Ukupno" value="841.1" unit="krugova" />);
    expect(out).toContain('Ukupno');
    expect(out).toContain('841.1');
    expect(out).toContain('krugova');
  });

  it('works without a unit', () => {
    expect(html(<LanePlate label="Serija" value="8" />)).toContain('Serija');
  });
});

describe('StateLine', () => {
  it.each([
    ['live', 'Uživo', 'solid'],
    ['pending', 'Na čekanju', 'dashed'],
    ['stale', 'Zastarelo', 'half'],
    ['disabled', 'Isključeno', 'struck'],
  ] as const)('%s has a Serbian word and its own line form', (state, word, form) => {
    const out = html(<StateLine state={state} />);
    expect(out).toContain(word);
    expect(out).toContain(`data-form="${form}"`);
  });
});

describe('AppShell', () => {
  const nav = (role: 'shooter' | 'coach' | 'admin') =>
    html(<AppShell role={role} signOutAction={async () => {}}>x</AppShell>);

  it('shows Strelci for a coach and not Treninzi', () => {
    const out = nav('coach');
    expect(out).toContain('Strelci');
    expect(out).not.toContain('Treninzi');
  });

  it('shows Sesije for a shooter', () => {
    expect(nav('shooter')).toContain('Sesije');
  });

  it('shows Odobrenja for the admin', () => {
    expect(nav('admin')).toContain('Odobrenja');
  });

  it('has a labelled navigation, the content and a sign-out button', () => {
    const out = nav('shooter');
    expect(out).toContain('aria-label="Glavna navigacija"');
    expect(out).toContain('<main');
    expect(out).toContain('Odjavi se');
  });
});

