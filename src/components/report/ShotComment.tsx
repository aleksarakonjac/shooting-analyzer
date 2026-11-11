'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, DialogTrigger, Popover } from 'react-aria-components';
import { sr } from '@/lib/i18n/sr';
import { createClient } from '@/lib/supabase/client';

const t = sr.report;
const MAX = 2000;

/**
 * The "Komentar" button of the selected shot and its floating note. The text is saved on its own a moment after
 * typing stops (and when the note is closed), in the shot's row, so it stays with the session.
 * Give it `key={shotId}`: each shot starts from its own comment.
 */
export function ShotComment({ shotId, shotN, saved, canEdit, onSaved }: { shotId: string; shotN: number; saved: string; canEdit: boolean; onSaved: (text: string) => void }) {
  const [text, setText] = useState(saved);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const last = useRef(saved);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(text);

  useEffect(() => {
    latest.current = text;
  }, [text]);

  const save = async (value: string) => {
    if (value === last.current) return;
    setState('saving');
    const { error } = await createClient().from('shots').update({ comment: value.trim() === '' ? null : value }).eq('id', shotId);
    if (error) {
      setState('failed');
      return;
    }
    last.current = value;
    onSaved(value);
    setState('saved');
  };
  const flush = () => {
    window.clearTimeout(timer.current);
    void save(latest.current);
  };

  const has = saved.trim() !== '';
  if (!canEdit && !has) return null;
  return (
    <DialogTrigger onOpenChange={(open) => { if (!open) flush(); }}>
      <Button className={has ? 'shotnote shotnote--has' : 'shotnote'} aria-label={t.comment}>
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4.5h12a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1H9l-3.5 3v-3H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z" />
        </svg>
        <span>{t.comment}</span>
      </Button>
      <Popover className="ui-popover shotnote__pop" placement="bottom end" offset={6}>
        <Dialog className="shotnote__dialog" aria-label={t.commentTitle(shotN)}>
          <h3 className="more__title">{t.commentTitle(shotN)}</h3>
          <textarea
            className="shotnote__text"
            rows={6}
            maxLength={MAX}
            value={text}
            readOnly={!canEdit}
            placeholder={t.commentPlaceholder}
            autoFocus={canEdit}
            onChange={(e) => {
              setText(e.target.value);
              latest.current = e.target.value;
              setState('idle');
              window.clearTimeout(timer.current);
              timer.current = window.setTimeout(() => void save(latest.current), 800);
            }}
            onBlur={flush}
          />
          <p className="shotnote__status" role="status" data-state={state}>
            {!canEdit ? t.commentReadOnly : state === 'saving' ? t.commentSaving : state === 'saved' ? t.commentSaved : state === 'failed' ? t.commentFailed : `${text.length} / ${MAX}`}
          </p>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
