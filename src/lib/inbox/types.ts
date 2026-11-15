/** A SCATT, pulse (TCX) or SIUS report (PDF) file sent from the phone and waiting in the shooter's inbox. */
export interface InboxItem {
  id: string;
  kind: 'scatt' | 'tcx' | 'sius_pdf';
  /** Object path in the private `inbox` bucket. */
  path: string;
  name: string;
  createdAt: string;
}
