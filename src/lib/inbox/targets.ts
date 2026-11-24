export interface Target {
  id: string;
  name: string;
  trainedOn: string;
  /** The session already holds this kind of data. */
  has: boolean;
}

/**
 * Sessions a phone file can go into, best guess first: those that still miss this kind of data, and among
 * them the ones from the day the file arrived (the usual case: SIUS entered on the laptop after training,
 * SCATT and pulse added from the phone the same day). Otherwise newest first, as given.
 */
export function orderTargets<S extends Omit<Target, 'has'>>(sessions: S[], receivedOn: string, has: (s: S) => boolean): Target[] {
  const rank = (s: S) => (has(s) ? 2 : 0) + (s.trainedOn === receivedOn ? 0 : 1);
  return sessions
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
    .map(({ s }) => ({ id: s.id, name: s.name, trainedOn: s.trainedOn, has: has(s) }));
}
