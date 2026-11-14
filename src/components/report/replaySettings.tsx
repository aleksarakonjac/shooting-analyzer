'use client';
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import type { SegmentKind } from '@/lib/scatt/replay';
import { sr } from '@/lib/i18n/sr';

export const SPEEDS = ['0.25', '0.5', '1', '2'] as const;
/** How much of the recording is shown: seconds before and after the shot, to a tenth. */
export const MAX_BEFORE_S = 15;
export const MAX_AFTER_S = 3;
export const OVERLAY_KEYS = ['score', 'speed250', 'aiming', 'shot', 'hold', 'hold10', 'speed1'] as const;
export const SEGMENT_KINDS = ['before', 'control', 'last250', 'after'] as const satisfies readonly SegmentKind[];
export type TraceColours = Record<SegmentKind, string>;
/** SCATT Expert's own trace colours (the owner chose them for both themes). */
export const DEFAULT_TRACE_COLOURS: TraceColours = { before: '#09e57c', control: '#eac223', last250: '#2c97e7', after: '#cc3641' };
/** Ready-made sets; each can still be changed colour by colour. */
export const COLOUR_PRESETS: Record<'scatt' | 'cool' | 'mono', TraceColours> = {
  scatt: DEFAULT_TRACE_COLOURS,
  cool: { before: '#7aa7ff', control: '#39c6f0', last250: '#3de0c4', after: '#ffd23f' },
  mono: { before: '#7d8799', control: '#b4bccb', last250: '#ffffff', after: '#ff6b74' },
};
export const HIT_SWATCHES = ['#ffffff', '#ff4d5a', '#ffd23f', '#39c6f0', '#3de0c4', '#ffa21f', '#e879f9'] as const;
export const DEFAULT_HIT = '#ffffff';
const HEX = /^#[0-9a-f]{6}$/i;
const LEGACY_HITS: Record<string, string> = { white: '#ffffff', red: '#ff4d5a', yellow: '#ffd23f', cyan: '#39c6f0' };
export const AUTOPLAYS = ['off', 'next'] as const;
export type OverlayKey = (typeof OVERLAY_KEYS)[number];
export type Autoplay = (typeof AUTOPLAYS)[number];
export type ReplaySpeed = (typeof SPEEDS)[number];

/** How a user likes the aim-trace replay: kept for them across all sessions. */
export interface ReplayPrefs {
  speed: ReplaySpeed;
  /** Seconds shown after the shot, 0 to 3. */
  after: number;
  /** Seconds shown before the shot, 0 to 15. */
  before: number;
  /** Figures drawn over the target, in the order they are drawn (top to bottom). */
  overlay: OverlayKey[];
  /** Colour of the hit, as #rrggbb. */
  hit: string;
  /** Colour of each part of the trace, as #rrggbb. */
  colours: TraceColours;
  /** After a replay ends: stop, go on with the next shot, or run the same shot again. */
  autoplay: Autoplay;
}
export const DEFAULT_REPLAY_PREFS: ReplayPrefs = { speed: '1', after: 1, before: 5, overlay: ['score', 'speed250', 'aiming'], hit: DEFAULT_HIT, colours: DEFAULT_TRACE_COLOURS, autoplay: 'off' };

/** A stored or typed number of seconds as a valid one: to a tenth, within 0..max, the default when it is not a number. */
export function seconds(v: unknown, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(0, n)) * 10) / 10 : fallback;
}

/** Whatever was stored (account metadata is free-form): keep valid fields, fill in the rest. */
export function sanitizeReplayPrefs(raw: unknown): ReplayPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(list: readonly T[], v: unknown, d: T): T => (list.includes(String(v) as T) ? (String(v) as T) : d);
  return {
    speed: pick(SPEEDS, r.speed, DEFAULT_REPLAY_PREFS.speed),
    after: seconds(r.after, MAX_AFTER_S, DEFAULT_REPLAY_PREFS.after),
    before: seconds(r.before, MAX_BEFORE_S, DEFAULT_REPLAY_PREFS.before),
    overlay: Array.isArray(r.overlay) ? [...new Set((r.overlay as unknown[]).filter((k): k is OverlayKey => OVERLAY_KEYS.includes(k as OverlayKey)))] : DEFAULT_REPLAY_PREFS.overlay,
    hit: typeof r.hit === 'string' && HEX.test(r.hit) ? r.hit : (LEGACY_HITS[String(r.hit)] ?? DEFAULT_HIT),
    colours: Object.fromEntries(SEGMENT_KINDS.map((k) => [k, typeof (r.colours as Record<string, unknown> | undefined)?.[k] === 'string' && HEX.test((r.colours as Record<string, string>)[k]) ? (r.colours as Record<string, string>)[k] : DEFAULT_TRACE_COLOURS[k]])) as TraceColours,
    autoplay: pick(AUTOPLAYS, r.autoplay, DEFAULT_REPLAY_PREFS.autoplay),
  };
}

interface Ctx extends ReplayPrefs {
  set: (patch: Partial<ReplayPrefs>) => void;
}
const ReplaySettingsContext = createContext<Ctx | null>(null);

/**
 * Replay settings, set in the strip's "⋯" menu and read by the aim-trace view. With `persist` a change is
 * saved in the signed-in user's account, so it holds for every session and every device.
 */
export function ReplaySettingsProvider({ children, initial, persist = false }: { children: ReactNode; initial?: unknown; persist?: boolean }) {
  const [prefs, setPrefs] = useState<ReplayPrefs>(() => sanitizeReplayPrefs(initial));
  const saveTimer = useRef<number | undefined>(undefined);
  const value = useMemo<Ctx>(
    () => ({
      ...prefs,
      set: (patch) => {
        const next = { ...prefs, ...patch };
        setPrefs(next);
        if (!persist) return;
        // A colour picker fires on every drag step: save once it settles.
        window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          void import('@/lib/supabase/client').then(({ createClient }) => createClient().auth.updateUser({ data: { replay_prefs: next } })).catch(() => {
            /* saving is a courtesy: the setting still applies for this page */
          });
        }, 600);
      },
    }),
    [prefs, persist],
  );
  return <ReplaySettingsContext.Provider value={value}>{children}</ReplaySettingsContext.Provider>;
}

export function useReplaySettings(): Ctx | null {
  return useContext(ReplaySettingsContext);
}

/** The controls, as a section of the "⋯" menu. */
export function ReplaySettingsSection() {
  const s = useReplaySettings();
  const t = sr.report;
  if (!s) return null;
  return (
    <section aria-labelledby="replay-title" className="more__section">
      <h3 id="replay-title" className="more__title">{t.traceSettings}</h3>
      <div className="trace__opts">
        <SecondsField label={t.traceBefore} value={s.before} max={MAX_BEFORE_S} onChange={(before) => s.set({ before })} />
        <SecondsField label={t.traceAfter} value={s.after} max={MAX_AFTER_S} onChange={(after) => s.set({ after })} />
        <Segmented label={t.traceSpeed} full={false} value={s.speed} onChange={(speed) => s.set({ speed })} options={SPEEDS.map((v) => ({ id: v, label: `${v.replace('.', ',')}×` }))} />
      </div>
      <p className="more__help">{t.traceSettingsHelp}</p>
    </section>
  );
}

/** Seconds to a tenth: typed freely, kept within 0..max, tidied when the field is left (and never anything but a number). */
function SecondsField({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);
  const id = useId();
  return (
    <div className="ui-control">
      <label className="ui-label" htmlFor={id}>{label}</label>
      <span className="secfield">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={0.1}
          min={0}
          max={max}
          value={text}
          onFocus={() => { focused.current = true; }}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value.trim() !== '' && Number.isFinite(Number(e.target.value))) onChange(seconds(e.target.value, max, value));
          }}
          onBlur={() => {
            focused.current = false;
            const n = seconds(text, max, value);
            setText(String(n));
            onChange(n);
          }}
        />
        <span aria-hidden="true">s</span>
        <small>{`0–${max}`}</small>
      </span>
    </div>
  );
}
