'use client';
import type { ReactNode } from 'react';
import { Tab, TabList, TabPanel, Tabs, type Key } from 'react-aria-components';

/** Segmented tabs (e.g. SIUS fajl · Ručno · Nalepi) with their panels. */
export function SegTabs({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: { id: string; label: string; content: ReactNode }[];
  value?: string;
  onChange?: (id: string) => void;
}) {
  return (
    <Tabs
      selectedKey={value}
      onSelectionChange={(k: Key) => onChange?.(String(k))}
      className="ui-tabs"
    >
      <TabList aria-label={label} className="ui-seg">
        {tabs.map((t) => (
          <Tab key={t.id} id={t.id} className="ui-seg__item">{t.label}</Tab>
        ))}
      </TabList>
      {tabs.map((t) => (
        <TabPanel key={t.id} id={t.id} className="ui-tabpanel">{t.content}</TabPanel>
      ))}
    </Tabs>
  );
}
