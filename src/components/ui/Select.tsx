'use client';
import {
  Button,
  FieldError,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select as AriaSelect,
  SelectValue,
  Text,
  type Key,
} from 'react-aria-components';
import { ChevronDown } from './icons';

export interface SelectItem {
  id: string;
  label: string;
  hint?: string;
}

/** A styled listbox select (no native <select>): keyboard, type-ahead and a hidden input for forms. */
export function Select({
  label,
  items,
  value,
  onChange,
  name,
  placeholder = 'Izaberite',
  description,
  isRequired,
  isDisabled,
}: {
  label: string;
  items: SelectItem[];
  value: string | null;
  onChange: (id: string) => void;
  name?: string;
  placeholder?: string;
  description?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
}) {
  return (
    <AriaSelect
      className="ui-control"
      name={name}
      selectedKey={value}
      onSelectionChange={(k: Key | null) => k !== null && onChange(String(k))}
      placeholder={placeholder}
      isRequired={isRequired}
      isDisabled={isDisabled}
    >
      <Label className="ui-label">{label}</Label>
      <Button className="ui-trigger">
        <SelectValue />
        <ChevronDown />
      </Button>
      {description && <Text slot="description" className="ui-desc">{description}</Text>}
      <FieldError className="ui-error" />
      <Popover className="ui-popover" offset={4}>
        <ListBox className="ui-listbox" items={items}>
          {(it) => (
            <ListBoxItem id={it.id} className="ui-option" textValue={it.label}>
              {it.label}
              {it.hint && <span className="ui-option__hint">{it.hint}</span>}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}
