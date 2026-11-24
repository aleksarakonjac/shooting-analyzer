export type InboxKind = 'scatt' | 'tcx' | 'sius_pdf' | 'sius_prnx';

/** A SIUS result report. */
export const isSius = (kind: InboxKind) => kind === 'sius_pdf' || kind === 'sius_prnx';

/** What the sending page read from a file: for display and for proposing pairs, never a result. */
export type InboxMeta =
  | { sius: { discipline: string; total: number; shots: number; atMs: number | null } }
  | { scatt: { shots: number; startMs: number; endMs: number } }
  | null;

/** A SCATT, pulse (TCX) or SIUS report (PDF, .prnx) file waiting in the shooter's inbox. */
export interface InboxItem {
  id: string;
  kind: InboxKind;
  /** Object path in the private `inbox` bucket. */
  path: string;
  name: string;
  createdAt: string;
}
