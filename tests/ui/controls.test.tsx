// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { I18nProvider } from 'react-aria-components';
import { Select } from '../../src/components/ui/Select';
import { ComboField } from '../../src/components/ui/ComboField';
import { NumberStepper } from '../../src/components/ui/NumberStepper';
import { DateField } from '../../src/components/ui/DateField';
import { TimeRange } from '../../src/components/ui/TimeRange';
import { Workspace } from '../../src/components/Workspace';

afterEach(cleanup);
const sr = (ui: React.ReactElement) => render(<I18nProvider locale="sr-Latn-RS">{ui}</I18nProvider>);

const DISCIPLINES = [
  { id: 'air_rifle', label: 'Vazdušna puška' },
  { id: 'air_pistol', label: 'Vazdušni pištolj' },
  { id: 'smallbore_3p', label: 'MK puška trostav' },
];

describe('Select', () => {
  it('is not a native select and picks an option with the keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    sr(<Select label="Disciplina" items={DISCIPLINES} value="air_rifle" onChange={onChange} name="discipline" />);
    expect(document.querySelector('select:not([aria-hidden="true"]):not([tabindex="-1"])')).toBeNull();
    const trigger = screen.getByRole('button', { name: /Disciplina/ });
    expect(trigger).toHaveTextContent('Vazdušna puška');
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    const list = await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('air_pistol');
    expect(within(list).getAllByRole('option')).toHaveLength(3);
  });

  it('submits its value under the given name', () => {
    sr(<form data-testid="f"><Select label="Disciplina" items={DISCIPLINES} value="smallbore_3p" onChange={() => {}} name="discipline" /></form>);
    const data = new FormData(screen.getByTestId('f') as HTMLFormElement);
    expect(data.get('discipline')).toBe('smallbore_3p');
  });
});

describe('ComboField', () => {
  function Place({ onChange }: { onChange?: (v: string) => void }) {
    const [v, setV] = useState('');
    return (
      <ComboField
        label="Mesto"
        value={v}
        onChange={(x) => { setV(x); onChange?.(x); }}
        suggestions={['Beograd, SC Banjica', 'Novi Sad', 'Beograd, Košutnjak']}
      />
    );
  }

  it('filters earlier places as you type and fills one in on Enter', async () => {
    const user = userEvent.setup();
    sr(<Place />);
    const input = screen.getByRole('combobox', { name: 'Mesto' });
    await user.type(input, 'beo');
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Beograd, SC Banjica', 'Beograd, Košutnjak']);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(input).toHaveValue('Beograd, SC Banjica');
  });

  it('keeps a new place that is not in the list', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    sr(<Place onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Mesto' });
    await user.type(input, 'Kragujevac');
    await user.tab();
    expect(input).toHaveValue('Kragujevac');
    expect(onChange).toHaveBeenLastCalledWith('Kragujevac');
  });
});

describe('NumberStepper', () => {
  it('steps with the buttons and the arrow keys and stays inside its range', async () => {
    const user = userEvent.setup();
    function Series() {
      const [n, setN] = useState(6);
      return <NumberStepper label="Broj serija" value={n} onChange={setN} min={1} max={8} />;
    }
    sr(<Series />);
    const input = screen.getByRole('textbox', { name: 'Broj serija' });
    await user.click(screen.getByRole('button', { name: /^Više/ }));
    expect(input).toHaveValue('7');
    input.focus();
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(input).toHaveValue('8');
    await user.click(screen.getByRole('button', { name: /^Manje/ }));
    expect(input).toHaveValue('7');
  });
});

describe('DateField', () => {
  it('shows the date in Serbian order and changes the day with the arrow keys', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    sr(<DateField label="Datum" value="2026-11-09" onChange={onChange} />);
    const day = screen.getByRole('spinbutton', { name: /dan/i });
    expect(day).toHaveTextContent('9');
    const group = day.parentElement!;
    expect(group.textContent?.replace(/\s/g, '')).toMatch(/^0?9\.11\.2026\.?$/);
    day.focus();
    await user.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenCalledWith('2026-11-10');
  });

  it('opens a calendar instead of the browser date input', async () => {
    const user = userEvent.setup();
    sr(<DateField label="Datum" value="2026-11-09" onChange={() => {}} />);
    expect(document.querySelector('input[type="date"]:not([tabindex="-1"])')).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Otvori kalendar/ }));
    expect(await screen.findByRole('grid')).toBeInTheDocument();
  });
});

describe('TimeRange', () => {
  it('uses a 24-hour clock and reports from and to as HH:MM', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    sr(<TimeRange from="17:00" to="18:30" onChange={onChange} />);
    expect(document.querySelector('input[type="time"]:not([tabindex="-1"])')).toBeNull();
    const hours = screen.getAllByRole('spinbutton', { name: /sat/i });
    expect(hours[0]).toHaveTextContent('17');
    expect(hours[1]).toHaveTextContent('18');
    hours[1].focus();
    await user.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenCalledWith({ from: '17:00', to: '19:30' });
  });
});

describe('Workspace', () => {
  const panels = [
    { id: 'series', title: 'Serije', children: <p>serije</p> },
    { id: 'target', title: 'Meta', children: <p>meta</p> },
    { id: 'time', title: 'Vreme', children: <p>vreme</p> },
  ];

  it('renders every panel as a named region with its guide words', () => {
    sr(<Workspace label="Delovi treninga" strip={<h1>Trening</h1>} panels={[{ ...panels[0], range: 'Serija 1 · pogoci 1–10' }, ...panels.slice(1)]} />);
    expect(screen.getByRole('region', { name: 'Serije' })).toHaveTextContent('Serija 1 · pogoci 1–10');
    expect(screen.getAllByRole('region')).toHaveLength(3);
  });

  it('moves between panels with the arrow keys on the phone tab list', async () => {
    const user = userEvent.setup();
    sr(<Workspace label="Delovi treninga" strip={<h1>Trening</h1>} panels={panels} />);
    const first = screen.getByRole('tab', { name: 'Serije' });
    expect(first).toHaveAttribute('aria-selected', 'true');
    first.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Meta' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Meta' })).toHaveAttribute('data-active');
    expect(screen.getByRole('region', { name: 'Serije' })).not.toHaveAttribute('data-active');
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Vreme' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Serije' })).toHaveAttribute('aria-selected', 'true');
  });
});
