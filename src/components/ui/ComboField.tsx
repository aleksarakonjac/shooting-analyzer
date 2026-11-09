'use client';
import { useMemo } from 'react';
import { Button, ComboBox, Input, Label, ListBox, ListBoxItem, Popover, Text } from 'react-aria-components';
import { ChevronDown } from './icons';

/**
 * Search-select over earlier entries that still accepts a new value (a new place, say).
 * The text is the value: picking a suggestion fills it in, typing something new keeps it.
 */
export function ComboField({
  label,
  value,
  onChange,
  suggestions,
  name,
  description,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  name?: string;
  description?: string;
  placeholder?: string;
}) {
  const items = useMemo(() => {
    const q = value.trim().toLocaleLowerCase('sr');
    const uniq = [...new Set(suggestions.filter(Boolean))];
    return (q ? uniq.filter((s) => s.toLocaleLowerCase('sr').includes(q)) : uniq).map((s) => ({ id: s, label: s }));
  }, [suggestions, value]);

  return (
    <ComboBox
      className="ui-control"
      allowsCustomValue
      menuTrigger="focus"
      inputValue={value}
      onInputChange={onChange}
      onSelectionChange={(k) => k !== null && onChange(String(k))}
      items={items}
      name={name}
    >
      <Label className="ui-label">{label}</Label>
      <div className="ui-combo">
        <Input placeholder={placeholder} />
        <Button className="ui-combo__btn" aria-label="Prikaži predloge">
          <ChevronDown />
        </Button>
      </div>
      {description && <Text slot="description" className="ui-desc">{description}</Text>}
      <Popover className="ui-popover" offset={4}>
        <ListBox className="ui-listbox">
          {(it: { id: string; label: string }) => (
            <ListBoxItem id={it.id} className="ui-option" textValue={it.label}>{it.label}</ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}
