import { useMemo, useSyncExternalStore } from 'react';

/** The session report the viewer was last looking at, and where in it: remembered per browser. */
export interface LastSession {
  id: string;
  name: string;
  series: number | null;
  shot: number | null;
}

const KEY = 'last-session';
const EVENT = 'last-session-change';

const readRaw = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export function parseLastSession(raw: string | null): LastSession | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<LastSession>;
    if (typeof v.id !== 'string' || !v.id) return null;
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    return { id: v.id, name: typeof v.name === 'string' ? v.name : '', series: num(v.series), shot: num(v.shot) };
  } catch {
    return null;
  }
}

export const readLastSession = (): LastSession | null => parseLastSession(readRaw());

export function writeLastSession(value: LastSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage blocked: the shortcut simply is not remembered */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function clearLastSession(id?: string): void {
  try {
    if (id && readLastSession()?.id !== id) return;
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
  window.dispatchEvent(new Event(EVENT));
}

const subscribe = (onChange: () => void) => {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
};

/** The remembered session; null on the server and before it is known. */
export function useLastSession(): LastSession | null {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  return useMemo(() => parseLastSession(raw), [raw]);
}
