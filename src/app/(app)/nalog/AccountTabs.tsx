'use client';
import { useState, type ReactNode } from 'react';
import { SegTabs } from '@/components/ui/SegTabs';
import { sr } from '@/lib/i18n/sr';

export type AccountTab = 'profile' | 'connections' | 'display' | 'more';
const ORDER: AccountTab[] = ['profile', 'connections', 'display', 'more'];

/**
 * The account page as one page: a tab bar on top and one readable column below, so the settings are not squeezed
 * into three narrow columns. The open tab follows the page's message (a Google Health return opens Povezivanja).
 */
export function AccountTabs({ initial, panes }: { initial: AccountTab; panes: Record<AccountTab, ReactNode> }) {
  const [tab, setTab] = useState<AccountTab>(initial);
  const t = sr.account.tabs;
  return (
    <div className="account">
      <SegTabs
        label={sr.account.title}
        value={tab}
        onChange={(id) => setTab(id as AccountTab)}
        tabs={ORDER.map((id) => ({ id, label: t[id], content: <div className="account__pane">{panes[id]}</div> }))}
      />
    </div>
  );
}
