'use client';
import { useId, useRef, useState, type DragEvent } from 'react';
import type { ConfirmResult, StartResult } from '@/lib/inbox/directUpload';
import { describeFile } from '@/lib/import/readFiles';
import { MAX_UPLOAD_BYTES } from '@/lib/import/uploadSource';
import type { InboxKind, InboxMeta } from '@/lib/inbox/types';
import { createClient } from '@/lib/supabase/client';
import { sr } from '@/lib/i18n/sr';

const t = sr.drop;

export interface DropShooter {
  id: string;
  name: string;
}

type Failed = { status: number; error: string };
export interface Sender {
  start(req: { shooterId: string; fileName: string; bytes: number; meta: InboxMeta }): Promise<StartResult | Failed>;
  confirm(uploadId: string): Promise<ConfirmResult | Failed>;
}

type State = 'reading' | 'bad' | 'ready' | 'sending' | 'sent' | 'duplicate' | 'failed';
interface Row {
  key: number;
  file: File;
  state: State;
  kind?: InboxKind;
  meta: InboxMeta;
  problem?: string;
}

const ACCEPT = '.prnx,.pdf,.scatt-expert,.tcx';

/** What the app saw in a file, so the sender knows it is the right one. */
export function metaText(kind: InboxKind, meta: InboxMeta, tz: string): string {
  if (meta && 'sius' in meta) {
    const { discipline, total, atMs } = meta.sius;
    const time = atMs === null ? null : new Date(atMs).toLocaleString('sr-Latn-RS', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' });
    return [discipline, String(total), time].filter(Boolean).join(' · ');
  }
  if (meta && 'scatt' in meta) return t.shots(meta.scatt.shots);
  return sr.inbox.kindLabel[kind];
}

/** Pick a name, drop files, send: on the club's public page and, signed in, in the inbox. */
export function DropBox({ shooters, sender, tz, fixed = false, who: whoLabel = t.who, onSent }: {
  shooters: DropShooter[];
  sender: Sender;
  tz: string;
  /** The files are for the one shooter given; no name to pick. */
  fixed?: boolean;
  /** The question over the names. */
  who?: string;
  onSent?: () => void;
}) {
  const id = useId();
  const nextKey = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const [who, setWho] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[]>([]);

  const shooterId = fixed ? (shooters[0]?.id ?? null) : who;
  const patch = (key: number, change: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...change } : r)));

  const add = async (files: File[]) => {
    setDone([]);
    const fresh = files.map<Row>((file) => ({ key: nextKey.current++, file, state: 'reading', meta: null }));
    setRows((all) => [...all, ...fresh]);
    await Promise.all(
      fresh.map(async (r) => {
        if (r.file.size > MAX_UPLOAD_BYTES) return patch(r.key, { state: 'bad', problem: t.tooLarge });
        try {
          const d = await describeFile(r.file, tz);
          patch(r.key, { state: 'ready', kind: d.kind, meta: d.meta });
        } catch {
          patch(r.key, { state: 'bad', problem: t.unknown });
        }
      }),
    );
  };

  const sendOne = async (r: Row, to: string): Promise<{ state: State; problem?: string }> => {
    try {
      const s = await sender.start({ shooterId: to, fileName: r.file.name, bytes: r.file.size, meta: r.meta });
      if (!('uploadId' in s)) return { state: 'failed', problem: s.status === 429 ? t.full : s.status === 403 ? t.notListed : t.failed };
      const { error } = await createClient().storage.from('inbox').uploadToSignedUrl(s.path, s.token, r.file, { contentType: 'application/octet-stream' });
      if (error) return { state: 'failed', problem: t.failed };
      const c = await sender.confirm(s.uploadId);
      if (c.status === 201) return { state: 'sent' };
      if (c.status === 409) return { state: 'duplicate' };
      return { state: 'failed', problem: c.status === 403 ? t.notListed : c.status === 429 ? t.full : c.status === 415 ? t.unknown : t.failed };
    } catch {
      return { state: 'failed', problem: t.failed };
    }
  };

  const toSend = rows.filter((r) => r.state === 'ready' || r.state === 'failed');
  const send = async () => {
    if (!shooterId || busy) return;
    setBusy(true);
    const after = new Map(rows.map((r) => [r.key, r.state]));
    for (const r of toSend) {
      patch(r.key, { state: 'sending', problem: undefined });
      const res = await sendOne(r, shooterId);
      patch(r.key, res);
      after.set(r.key, res.state);
    }
    setBusy(false);
    const states = [...after.values()];
    if (states.includes('failed')) return;
    // Everything went: nothing of this person stays for the next one at the same computer.
    const sent = states.filter((s) => s === 'sent').length;
    const twice = rows.filter((r) => after.get(r.key) === 'duplicate').map((r) => t.twice(r.file.name));
    setDone([...(sent ? [t.done(sent)] : []), ...twice]);
    setRows([]);
    setWho(null);
    if (sent) onSent?.();
  };

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length) void add([...e.dataTransfer.files]);
  };
  const failed = rows.some((r) => r.state === 'failed');

  return (
    <div className="drop">
      {!fixed && (
        <fieldset className="drop__names" disabled={busy}>
          <legend className="ui-label">{whoLabel}</legend>
          {shooters.map((s) => (
            <label key={s.id} className="drop__name" data-on={who === s.id || undefined}>
              <input type="radio" className="sr-only" name={`${id}-who`} checked={who === s.id} onChange={() => setWho(s.id)} />
              {s.name}
            </label>
          ))}
          {shooters.length === 0 && <p className="rows__muted">{t.nobody}</p>}
        </fieldset>
      )}
      <label
        htmlFor={`${id}-files`}
        className="ui-file__zone drop__zone"
        data-over={over || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        <input
          id={`${id}-files`}
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          aria-label={t.files}
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            if (input.current) input.current.value = '';
            void add(files);
          }}
        />
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
        </svg>
        <span className="ui-file__text">{t.zone}</span>
        <span className="ui-file__btn">{t.pick}</span>
      </label>
      {rows.length > 0 && (
        <ul className="rows">
          {rows.map((r) => (
            <li key={r.key} className="rows__item">
              <div className="rows__main">
                <strong>{r.file.name}</strong>
                <div className="rows__muted num">{r.kind ? metaText(r.kind, r.meta, tz) : r.state === 'reading' ? t.reading : null}</div>
              </div>
              <div className="rows__actions">
                {r.problem && <span className="drop__problem" role="alert">{r.problem}</span>}
                {r.state === 'sending' && <span className="rows__muted">{t.sending}</span>}
                {r.state === 'sent' && <span className="rows__state">{t.sent}</span>}
                {r.state === 'duplicate' && <span className="rows__muted">{t.already}</span>}
                {!busy && r.state !== 'sent' && r.state !== 'duplicate' && (
                  <button type="button" className="button--quiet" onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))}>{t.remove}</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={send} disabled={busy || !shooterId || toSend.length === 0 || rows.some((r) => r.state === 'reading')}>
        {failed && !busy ? t.again : t.send}
      </button>
      <div role="status">
        {done.map((d) => (
          <p key={d}>{d}</p>
        ))}
      </div>
    </div>
  );
}
