'use client';
import { Button, Group, Input, Label, NumberField, Text } from 'react-aria-components';

/** A whole-number stepper (number of series fired, say): minus, field, plus; arrow keys step. */
export function NumberStepper({
  label,
  value,
  onChange,
  min = 0,
  max,
  description,
  name,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  description?: string;
  name?: string;
}) {
  return (
    <NumberField
      className="ui-control"
      value={value}
      onChange={(n) => onChange(Number.isNaN(n) ? min : n)}
      minValue={min}
      maxValue={max}
      step={1}
      name={name}
      formatOptions={{ maximumFractionDigits: 0 }}
    >
      <Label className="ui-label">{label}</Label>
      <Group className="ui-number">
        <Button slot="decrement" aria-label="Manje">−</Button>
        <Input />
        <Button slot="increment" aria-label="Više">+</Button>
      </Group>
      {description && <Text slot="description" className="ui-desc">{description}</Text>}
    </NumberField>
  );
}
