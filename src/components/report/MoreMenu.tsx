'use client';
import type { ReactNode } from 'react';
import { Button, Dialog, DialogTrigger, Popover } from 'react-aria-components';
import { sr } from '@/lib/i18n/sr';

/** The strip's "⋯" menu: session details, edit and delete, out of the way of the report itself. */
export function MoreMenu({ children }: { children: ReactNode }) {
  return (
    <DialogTrigger>
      <Button className="ui-trigger more__trigger" aria-label={sr.report.more}>
        <span aria-hidden="true">⋯</span>
      </Button>
      <Popover className="ui-popover more__pop" placement="bottom end" offset={6}>
        <Dialog className="more" aria-label={sr.report.more}>
          {children}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
