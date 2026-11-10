'use client';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { sr } from '@/lib/i18n/sr';

export const SPEEDS = ['0.25', '0.5', '1', '2'] as const;
export const AFTERS = ['0.5', '1', '2'] as const;
export const BEFORES = ['1', '2', '3', '5', '10', '60'] as const;
export const OVERLAY_KEYS = ['score', 'speed250', 'aiming', 'shot', 'hold', 'hold10', 'speed1'] as const;
export const HIT_COLOURS = { white: '#ffffff', red: '#ff4d5a', yellow: '#ffd23f', cyan: '#39c6f0' } as const;
export const AUTOPLAYS = ['off', 'next', 'loop'] as const;
export const PALETTES = ['scatt', 'cool', 'mono'] as const;
export type OverlayKey = (typeof OVERLAY_KEYS)[number];
export type HitColour = keyof typeof HIT_COLOURS;
export type Autoplay = (typeof AUTOPLAYS)[number];
export type Palette = (typeof PALETTES)[number];
export type ReplaySpeed = (typeof SPEEDS)[number];
export type ReplayAfter = (typeof AFTERS)[number];
export type ReplayBefore = (typeof BEFORES)[number];

/** How a user likes the aim-trace replay: kept for them across all sessions. */
export interface ReplayPrefs {
  speed: ReplaySpeed;
  after: ReplayAfter;
  before: ReplayBefore;
  /** Figures drawn over the target. */
  overlay: OverlayKey[];
  hit: HitColour;
  palette: Palette;
  /** After a replay ends: stop, go on with the next shot, or run the same shot again. */
  autoplay: Autoplay;
}
export const DEFAULT_REPLAY_PREFS: ReplayPrefs = { speed: '1', after: '1', before: '5', overlay: ['score', 'speed250', 'aiming'], hit: 'white', palette: 'scatt', autoplay: 'off' };

/** Whatever was stored (account metadata is free-form): keep valid fields, fill in the rest. */
export function sanitizeReplayPrefs(raw: unknown): ReplayPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(list: readonly T[], v: unknown, d: T): T => (list.includes(String(v) as T) ? (String(v) as T) : d);
  return {
    speed: pick(SPEEDS, r.speed, DEFAULT_REPLAY_PREFS.speed),
    after: pick(AFTERS, r.after, DEFAULT_REPLAY_PREFS.after),
    before: pick(BEFORES, r.before, DEFAULT_REPLAY_PREFS.before),
    overlay: Array.isArray(r.overlay) ? OVERLAY_KEYS.filter((k) => (r.overlay as unknown[]).includes(k)) : DEFAULT_REPLAY_PREFS.overlay,
    hit: pick(Object.keys(HIT_COLOURS) as HitColour[], r.hit, DEFAULT_REPLAY_PREFS.hit),
    palette: pick(PALETTES, r.palette, DEFAULT_REPLAY_PREFS.palette),
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
  const value = useMemo<Ctx>(
    () => ({
      ...prefs,
      set: (patch) => {
        const next = { ...prefs, ...patch };
        setPrefs(next);
        if (!persist) return;
        void import('@/lib/supabase/client').then(({ createClient }) => createClient().auth.updateUser({ data: { replay_prefs: next } })).catch(() => {
          /* saving is a courtesy: the setting still applies for this page */
        });
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
  const sec = (v: string) => `${v.replace('.', ',')} s`;
  return (
    <section aria-labelledby="replay-title" className="more__section">
      <h3 id="replay-title" className="more__title">{t.traceSettings}</h3>
      <div className="trace__opts">
        <Segmented label={t.traceBefore} full={false} value={s.before} onChange={(before) => s.set({ before })} options={BEFORES.map((v) => ({ id: v, label: sec(v) }))} />
        <Segmented label={t.traceAfter} full={false} value={s.after} onChange={(after) => s.set({ after })} options={AFTERS.map((v) => ({ id: v, label: sec(v) }))} />
        <Segmented label={t.traceSpeed} full={false} value={s.speed} onChange={(speed) => s.set({ speed })} options={SPEEDS.map((v) => ({ id: v, label: `${v.replace('.', ',')}×` }))} />
      </div>
      <p className="more__help">{t.traceSettingsHelp}</p>
    </section>
  );
}
