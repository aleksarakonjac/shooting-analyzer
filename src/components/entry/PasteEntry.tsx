'use client';
import { useState } from 'react';
import type { DisciplineId, ParsedSiusResult } from '@/lib/domain/types';
import { sr } from '@/lib/i18n/sr';
import { parsePastedShots } from '@/lib/import/paste';

const t = sr.newTraining;

/** Raw pasted shots (one per line, optionally with a time); recognised and summarised before use. */
export function PasteEntry({
  disciplineId,
  date,
  tz,
  onApply,
}: {
  disciplineId: DisciplineId | '';
  date: string;
  tz: string;
  onApply: (r: ParsedSiusResult) => void;
}) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const recognise = () => {
    if (!disciplineId) return;
    const r = parsePastedShots(text, { disciplineId, date, tz });
    if (!r.ok) {
      setMsg({ kind: 'err', text: r.error === 'empty' ? t.manualEmpty : t.pasteInvalid(r.line) });
      return;
    }
    const shots = r.result.series.reduce((a, s) => a + s.shots.length, 0);
    setMsg({ kind: 'ok', text: t.pasteRecognised(shots, r.result.series.length, r.timed) });
    onApply(r.result);
  };

  return (
    <div className="paste">
      <label>
        {t.pasteLabel}
        <textarea
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'1. 10.6* 19:03:09\n2. 10,4 19:03:41\n10.2'}
        />
      </label>
      <small>{t.pasteHint}</small>
      <div className="manual__actions">
        <button type="button" onClick={recognise} disabled={!disciplineId || !text.trim()}>{t.pasteApply}</button>
        {!disciplineId && <small>{t.pickDisciplineFirst}</small>}
      </div>
      {msg && <p role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
    </div>
  );
}
